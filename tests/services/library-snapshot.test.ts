/**
 * Baglib — Library Snapshot & Safe Rollback Unit Tests (KEY-147)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as fflate from 'fflate';
import Database from 'better-sqlite3';
import { LibrarySnapshotService } from '../../src/main/services/sync/library-snapshot.service';
import { getDatabase, closeDatabase } from '../../src/main/database/connection';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';

describe('Library Snapshot & Atomic Rollback Service (KEY-147)', () => {
  let tempSnapshotsDir: string;
  let service: LibrarySnapshotService;

  beforeEach(() => {
    tempSnapshotsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-snapshot-test-'));
    process.env.BAGLIB_DATA_DIR = tempSnapshotsDir;
    closeDatabase();
    service = new LibrarySnapshotService(tempSnapshotsDir);

    // Ensure database connection is active and seed some test records
    const db = getDatabase();
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS work (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          reading_status TEXT DEFAULT 'unread',
          reading_progress INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS annotation_record (
          id TEXT PRIMARY KEY,
          book_id TEXT,
          content TEXT
        );

        INSERT OR REPLACE INTO work (id, title, reading_status, reading_progress)
        VALUES ('work_mukaddimah', 'مقدمة ابن خلدون', 'reading', 35);

        INSERT OR REPLACE INTO app_settings (key, value)
        VALUES ('theme', '{"mode":"dark"}');

        INSERT OR REPLACE INTO annotation_record (id, book_id, content)
        VALUES ('annot_1', 'work_mukaddimah', 'ملاحظة نفيسة في العمران البشري');
      `);
    } catch (e) {
      console.warn('DB setup warning:', e);
    }
  });

  afterEach(() => {
    try {
      closeDatabase();
      delete process.env.BAGLIB_DATA_DIR;
      if (fs.existsSync(tempSnapshotsDir)) {
        fs.rmSync(tempSnapshotsDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('Snapshot Creation & Packaging', () => {
    it('creates a compressed zip snapshot containing baglib.db and manifest', async () => {
      const res = await service.createSnapshot('Test snapshot creation');
      assert.strictEqual(res.success, true);
      assert.ok(res.data);

      const metadata = res.data;
      assert.ok(metadata.fileName.startsWith('Baglib-Backup-'));
      assert.ok(metadata.fileName.endsWith('.zip'));
      assert.strictEqual(metadata.description, 'Test snapshot creation');
      assert.ok(metadata.sizeBytes > 0);
      assert.ok(metadata.stats.booksCount >= 1);

      // Verify physical ZIP file
      const zipPath = path.join(tempSnapshotsDir, metadata.fileName);
      assert.strictEqual(fs.existsSync(zipPath), true);

      const zipBytes = fs.readFileSync(zipPath);
      const unzipped = fflate.unzipSync(new Uint8Array(zipBytes));

      assert.ok(unzipped['baglib.db'], 'baglib.db should be inside the zip');
      assert.ok(unzipped['manifest.json'], 'manifest.json should be inside the zip');
      assert.ok(unzipped['settings.json'], 'settings.json should be inside the zip');
      assert.ok(unzipped['annotations.json'], 'annotations.json should be inside the zip');

      const manifestInside = JSON.parse(fflate.strFromU8(unzipped['manifest.json']));
      assert.strictEqual(manifestInside.id, metadata.id);
      assert.strictEqual(manifestInside.checksum, metadata.checksum);
    });

    it('lists created snapshots sorted by timestamp descending', async () => {
      await service.createSnapshot('Snapshot 1');
      await service.createSnapshot('Snapshot 2');

      const list = service.listSnapshots();
      assert.ok(list.length >= 2);
      assert.ok(list[0].timestamp >= list[1].timestamp);
    });
  });

  describe('Atomic Safe Restore & Rollback Guarantee', () => {
    it('restores database state from a valid snapshot archive', async () => {
      // 1. Create a snapshot with initial state
      const snapRes = await service.createSnapshot('Restore test baseline');
      assert.strictEqual(snapRes.success, true);
      const snapshotFileName = snapRes.data!.fileName;

      // 2. Modify live database
      const liveDb = getDatabase();
      liveDb.prepare("UPDATE work SET title = 'تعديل عنوان تجريبي' WHERE id = 'work_mukaddimah'").run();
      const modifiedRow = liveDb.prepare("SELECT title FROM work WHERE id = 'work_mukaddimah'").get() as { title: string };
      assert.strictEqual(modifiedRow.title, 'تعديل عنوان تجريبي');

      // 3. Restore snapshot
      const restoreRes = await service.restoreSnapshot(snapshotFileName);
      if (!restoreRes.success) {
        console.error('RESTORE FAILED REASON:', restoreRes.message);
      }
      assert.strictEqual(restoreRes.success, true);

      // 4. Verify title reverted to original baseline
      const restoredDb = getDatabase();
      const restoredRow = restoredDb.prepare("SELECT title FROM work WHERE id = 'work_mukaddimah'").get() as { title: string };
      assert.strictEqual(restoredRow.title, 'مقدمة ابن خلدون');
    });

    it('upgrades a snapshot from an older schema and converts its notes', async () => {
      const oldPath = path.join(tempSnapshotsDir, 'old.db');
      const old = new Database(oldPath);
      runMigrations(old, migrations.filter((migration) => migration.id < 21));
      old.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)`).run('study.note.v1:old-note', JSON.stringify({
        id: 'old-note', title: 'قديم', content: 'نص', aliases: [], tags: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
      }));
      old.close();
      fs.writeFileSync(path.join(tempSnapshotsDir, 'old.zip'), Buffer.from(fflate.zipSync({ 'baglib.db': new Uint8Array(fs.readFileSync(oldPath)) })));

      const restoreRes = await service.restoreSnapshot('old.zip');
      assert.strictEqual(restoreRes.success, true);
      const row = getDatabase().prepare(`SELECT s.content FROM knowledge k JOIN study_note_detail s ON s.knowledge_id = k.id WHERE k.id = 'old-note' AND k.deleted_at IS NULL`).get() as { content: string };
      assert.strictEqual(row.content, 'نص');
    });

    it('rejects corrupt archive and guarantees live database remains untouched via rollback', async () => {
      // Create a corrupted zip file
      const corruptZipPath = path.join(tempSnapshotsDir, 'corrupt-backup.zip');
      const fakeZip = fflate.zipSync({
        'baglib.db': fflate.strToU8('NOT A VALID SQLITE HEADER CORRUPTED FILE CONTENT'),
      });
      fs.writeFileSync(corruptZipPath, Buffer.from(fakeZip));

      const restoreRes = await service.restoreSnapshot('corrupt-backup.zip');
      assert.strictEqual(restoreRes.success, false);
      assert.ok(restoreRes.message?.includes('not a valid SQLite database') || restoreRes.message?.includes('failed'));

      // Ensure live database is still healthy and accessible
      const liveDb = getDatabase();
      const checkRow = liveDb.prepare("SELECT title FROM work WHERE id = 'work_mukaddimah'").get() as { title: string };
      assert.ok(checkRow !== undefined);
    });
  });

  describe('Snapshot Deletion & Export', () => {
    it('deletes snapshot file when requested', async () => {
      const snap = await service.createSnapshot('To be deleted');
      const fileName = snap.data!.fileName;

      assert.strictEqual(fs.existsSync(path.join(tempSnapshotsDir, fileName)), true);
      const deleted = service.deleteSnapshot(fileName);
      assert.strictEqual(deleted, true);
      assert.strictEqual(fs.existsSync(path.join(tempSnapshotsDir, fileName)), false);
    });

    it('exports snapshot archive to external destination directory', async () => {
      const snap = await service.createSnapshot('To be exported');
      const fileName = snap.data!.fileName;

      const exportTargetDir = path.join(tempSnapshotsDir, 'exported');
      const exportedPath = service.exportSnapshot(fileName, exportTargetDir);

      assert.strictEqual(fs.existsSync(exportedPath), true);
      assert.strictEqual(path.basename(exportedPath), fileName);
    });
  });
});
