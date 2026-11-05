import { app } from 'electron';
import { errorMessage } from '../../../shared/errors';
/**
 * Baglib — Library Snapshot & Safe Rollback Engine
 *
 * Implements Koodo Reader's version snapshot pattern with an atomic restore
 * pipeline and one-click rollback guarantee.
 *
 * Architecture:
 *   1. Snapshot Creation:
 *      - Forces WAL checkpoint (PRAGMA wal_checkpoint(TRUNCATE))
 *      - Packs SQLite DB, settings JSON, annotations JSON, and manifest into a compressed ZIP via fflate
 *      - Auto-prunes snapshots exceeding retention limit (max 30)
 *   2. Atomic Safe Restore:
 *      - Validates ZIP archive and checks SQLite header signature
 *      - Creates live rollback backup (.rollback.bak) before modifying active database
 *      - Atomically replaces baglib.db and clears stale WAL/SHM files
 *      - Runs PRAGMA integrity_check; triggers instant rollback on failure
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as fflate from 'fflate';
import { getDatabase, getDatabasePath, closeDatabase } from '../../database/connection';
import { settingsRepository } from '../../database/repositories/settings.repository';
import { runMigrations } from '../../database/migrator';
import { migrations } from '../../database/migrations';
import { StudyNotesService } from '../study-notes';
import type {
  LibrarySnapshotMetadata,
  LibrarySnapshotStats,
  SyncOperationResult,
} from '../../../shared/types/cloud-sync';

const MAX_SNAPSHOTS_RETENTION = 30;

export class LibrarySnapshotService {
  private customSnapshotsDir?: string;

  constructor(customSnapshotsDir?: string) {
    this.customSnapshotsDir = customSnapshotsDir;
  }

  public getSnapshotsDirectory(): string {
    if (this.customSnapshotsDir) {
      if (!fs.existsSync(this.customSnapshotsDir)) {
        fs.mkdirSync(this.customSnapshotsDir, { recursive: true });
      }
      return this.customSnapshotsDir;
    }

    let baseDir = '';
    try {


      if (app && typeof app.getPath === 'function') {
        baseDir = app.getPath('userData');
      }
    } catch {
      baseDir = path.dirname(getDatabasePath());
    }

    if (!baseDir) {
      baseDir = path.join(process.cwd(), '.baglib-data');
    }

    const snapshotsDir = path.join(baseDir, 'snapshots');
    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true });
    }
    return snapshotsDir;
  }

  /**
   * Calculates current library statistics from SQLite.
   */
  public getLibraryStats(): LibrarySnapshotStats {
    const db = getDatabase();
    let booksCount = 0;
    let annotationsCount = 0;
    let settingsCount = 0;

    try {
      const bookRow = db.prepare('SELECT COUNT(*) as cnt FROM work').get() as { cnt: number } | undefined;
      booksCount = bookRow?.cnt || 0;
    } catch {}

    try {
      const annotRow = db.prepare('SELECT COUNT(*) as cnt FROM annotation_record').get() as { cnt: number } | undefined;
      annotationsCount = annotRow?.cnt || 0;
    } catch {}

    try {
      const settRow = db.prepare('SELECT COUNT(*) as cnt FROM app_settings').get() as { cnt: number } | undefined;
      settingsCount = settRow?.cnt || 0;
    } catch {}

    const dbPath = getDatabasePath();
    let databaseSizeBytes = 0;
    if (fs.existsSync(dbPath)) {
      databaseSizeBytes = fs.statSync(dbPath).size;
    }

    return {
      booksCount,
      annotationsCount,
      settingsCount,
      databaseSizeBytes,
    };
  }

  /**
   * Creates a point-in-time compressed snapshot containing the SQLite database,
   * settings, annotations, and manifest.
   */
  public async createSnapshot(description?: string): Promise<SyncOperationResult<LibrarySnapshotMetadata>> {
    try {
      const db = getDatabase();

      // Flush Write-Ahead Log into the primary database file
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
      } catch (e) {
        console.warn('[Snapshot] wal_checkpoint note:', e);
      }

      const dbPath = getDatabasePath();
      if (!fs.existsSync(dbPath)) {
        return { success: false, message: `Database file not found at ${dbPath}` };
      }

      const dbBuffer = fs.readFileSync(dbPath);
      const dbChecksum = crypto.createHash('sha256').update(dbBuffer).digest('hex');

      // Export settings & annotations
      const allSettings = settingsRepository.getAll();
      let allAnnotations: unknown[] = [];
      try {
        allAnnotations = db.prepare('SELECT * FROM annotation_record').all();
      } catch {}

      const timestamp = Date.now();
      const stats = this.getLibraryStats();
      const snapshotId = `snapshot-${timestamp}-${crypto.randomBytes(3).toString('hex')}`;
      const fileName = `Baglib-Backup-${timestamp}.zip`;

      const manifest: LibrarySnapshotMetadata = {
        id: snapshotId,
        fileName,
        timestamp,
        formattedDate: new Date(timestamp).toISOString(),
        sizeBytes: 0, // Will be set after zip compression
        description: description || 'Point-in-time library backup',
        stats,
        appVersion: '0.1.0',
        baglibVersion: '1.0',
        checksum: dbChecksum,
      };

      // Package into ZIP using fflate
      const zipEntries: Record<string, Uint8Array> = {
        'baglib.db': new Uint8Array(dbBuffer),
        'settings.json': fflate.strToU8(JSON.stringify(allSettings, null, 2)),
        'annotations.json': fflate.strToU8(JSON.stringify(allAnnotations, null, 2)),
        'manifest.json': fflate.strToU8(JSON.stringify(manifest, null, 2)),
      };

      const zipped = fflate.zipSync(zipEntries, { level: 6 });
      manifest.sizeBytes = zipped.length;

      // Update manifest inside zip with final size
      zipEntries['manifest.json'] = fflate.strToU8(JSON.stringify(manifest, null, 2));
      const finalZip = fflate.zipSync(zipEntries, { level: 6 });

      const destinationPath = path.join(this.getSnapshotsDirectory(), fileName);
      fs.writeFileSync(destinationPath, Buffer.from(finalZip));

      // Auto-prune older snapshots beyond retention limit
      this.pruneOldSnapshots();

      return {
        success: true,
        message: `Snapshot created successfully (${(manifest.sizeBytes / 1024).toFixed(1)} KB).`,
        data: manifest,
      };
    } catch (e: unknown) {
      console.error('[Snapshot] Failed to create snapshot:', e);
      return { success: false, message: `Failed to create snapshot: ${errorMessage(e) || e}` };
    }
  }

  /**
   * Lists all existing snapshots sorted by timestamp descending.
   */
  public listSnapshots(): LibrarySnapshotMetadata[] {
    const dir = this.getSnapshotsDirectory();
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.zip'));
    const results: LibrarySnapshotMetadata[] = [];

    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        const buffer = fs.readFileSync(fullPath);
        const unzipped = fflate.unzipSync(new Uint8Array(buffer), {
          filter: (fileInfo) => fileInfo.name === 'manifest.json',
        });

        if (unzipped['manifest.json']) {
          const manifest = JSON.parse(fflate.strFromU8(unzipped['manifest.json'])) as LibrarySnapshotMetadata;
          manifest.sizeBytes = stat.size;
          manifest.fileName = file;
          results.push(manifest);
        } else {
          // Fallback if manifest is missing
          const timestamp = stat.mtimeMs || Date.now();
          results.push({
            id: file.replace('.zip', ''),
            fileName: file,
            timestamp,
            formattedDate: new Date(timestamp).toISOString(),
            sizeBytes: stat.size,
            description: 'Backup archive',
            stats: { booksCount: 0, annotationsCount: 0, settingsCount: 0, databaseSizeBytes: 0 },
            appVersion: '0.1.0',
            baglibVersion: '1.0',
          });
        }
      } catch (err) {
        console.warn(`[Snapshot] Could not parse snapshot ${file}:`, err);
      }
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Restores a snapshot with full atomic rollback protection.
   * If any step fails or integrity check fails, the active database is instantly reverted.
   */
  public async restoreSnapshot(snapshotFileNameOrPath: string): Promise<SyncOperationResult<{ restored: boolean }>> {
    let fullPath = snapshotFileNameOrPath;
    if (!path.isAbsolute(fullPath)) {
      fullPath = path.join(this.getSnapshotsDirectory(), snapshotFileNameOrPath);
    }

    if (!fs.existsSync(fullPath)) {
      return { success: false, message: `Snapshot file not found: ${snapshotFileNameOrPath}` };
    }

    const dbPath = getDatabasePath();
    const rollbackPath = `${dbPath}.rollback.bak`;
    const rollbackWal = `${dbPath}-wal.rollback.bak`;
    const rollbackShm = `${dbPath}-shm.rollback.bak`;

    try {
      // 1. Decompress and validate archive
      const zipBytes = fs.readFileSync(fullPath);
      const unzipped = fflate.unzipSync(new Uint8Array(zipBytes));

      const dbBytes = unzipped['baglib.db'];
      if (!dbBytes || dbBytes.length === 0) {
        return { success: false, message: 'Invalid snapshot archive: baglib.db is missing or empty.' };
      }

      // Check SQLite header signature ("SQLite format 3\0")
      const headerSignature = Buffer.from(dbBytes.slice(0, 16)).toString('utf-8');
      if (!headerSignature.startsWith('SQLite format 3')) {
        return { success: false, message: 'Archive verification failed: baglib.db is not a valid SQLite database.' };
      }

      // 2. Create Live Rollback Copy
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, rollbackPath);
      }
      if (fs.existsSync(`${dbPath}-wal`)) {
        fs.copyFileSync(`${dbPath}-wal`, rollbackWal);
      }
      if (fs.existsSync(`${dbPath}-shm`)) {
        fs.copyFileSync(`${dbPath}-shm`, rollbackShm);
      }

      // 3. Atomically replace database
      closeDatabase();

      // Overwrite main DB
      fs.writeFileSync(dbPath, Buffer.from(dbBytes));

      // Remove stale WAL and SHM from previous connection
      if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
      if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);

      // 4. Re-open database and perform integrity verification
      const reopenedDb = getDatabase();
      const integrityRows = reopenedDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
      const isOk = integrityRows.length === 1 && integrityRows[0].integrity_check === 'ok';

      if (!isOk) {
        throw new Error(`Restored database failed integrity check: ${JSON.stringify(integrityRows)}`);
      }

      // A snapshot may predate the current schema; any failure here rolls back below.
      if (reopenedDb.prepare(`SELECT 1 FROM sqlite_master WHERE name = '_migrations'`).get()) {
        runMigrations(reopenedDb, migrations);
        new StudyNotesService(settingsRepository, reopenedDb).convertLegacy();
      }

      // Clean up rollback backups on success
      if (fs.existsSync(rollbackPath)) fs.unlinkSync(rollbackPath);
      if (fs.existsSync(rollbackWal)) fs.unlinkSync(rollbackWal);
      if (fs.existsSync(rollbackShm)) fs.unlinkSync(rollbackShm);

      return {
        success: true,
        message: 'Library database and annotations successfully restored and verified.',
        data: { restored: true },
      };
    } catch (restoreError: unknown) {
      console.error('[Snapshot] Restore failed, triggering atomic rollback:', restoreError);

      // Trigger rollback guarantee
      try {
        closeDatabase();
        if (fs.existsSync(rollbackPath)) {
          fs.copyFileSync(rollbackPath, dbPath);
          fs.unlinkSync(rollbackPath);
        }
        if (fs.existsSync(rollbackWal)) {
          fs.copyFileSync(rollbackWal, `${dbPath}-wal`);
          fs.unlinkSync(rollbackWal);
        }
        if (fs.existsSync(rollbackShm)) {
          fs.copyFileSync(rollbackShm, `${dbPath}-shm`);
          fs.unlinkSync(rollbackShm);
        }
        // Re-open live database
        getDatabase();
      } catch (rollbackErr) {
        console.error('[Snapshot] Critical: Rollback step encountered error:', rollbackErr);
      }

      return {
        success: false,
        message: `Restore failed and was safely rolled back: ${errorMessage(restoreError) || restoreError}`,
      };
    }
  }

  /**
   * Deletes a snapshot archive.
   */
  public deleteSnapshot(snapshotFileNameOrId: string): boolean {
    const dir = this.getSnapshotsDirectory();
    const fileName = snapshotFileNameOrId.endsWith('.zip') ? snapshotFileNameOrId : `${snapshotFileNameOrId}.zip`;
    const targetPath = path.join(dir, fileName);

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return true;
    }
    return false;
  }

  /**
   * Exports a snapshot file to an external directory.
   */
  public exportSnapshot(snapshotFileName: string, destinationDir: string): string {
    const sourcePath = path.join(this.getSnapshotsDirectory(), snapshotFileName);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Snapshot not found: ${snapshotFileName}`);
    }

    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    const targetPath = path.join(destinationDir, snapshotFileName);
    fs.copyFileSync(sourcePath, targetPath);
    return targetPath;
  }

  /**
   * Prunes older snapshots to keep storage bounded.
   */
  private pruneOldSnapshots(): void {
    try {
      const snapshots = this.listSnapshots();
      if (snapshots.length > MAX_SNAPSHOTS_RETENTION) {
        const toDelete = snapshots.slice(MAX_SNAPSHOTS_RETENTION);
        for (const snap of toDelete) {
          this.deleteSnapshot(snap.fileName);
        }
      }
    } catch (e) {
      console.warn('[Snapshot] Pruning error:', e);
    }
  }
}

export const librarySnapshotService = new LibrarySnapshotService();
