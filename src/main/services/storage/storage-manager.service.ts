interface StorageRow { workId: string; editionId: string; sourceId: string; title: string; author: string; filePath: string; fileSizeBytes: number; storageState: import('../../../shared/types/digital-file').FileStorageStatus; format: import('../../../shared/types/work').DigitalFormat; addedAt: string; fileHash?: string; }
import { errorMessage } from '../../../shared/errors';
/**
 * Baglib — Storage Management Service (Story 7 / KEY-7)
 *
 * Provides comprehensive storage health verification, path rebinding,
 * duplicate detection, disk space analytics, and missing-file recovery.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../../database/connection';
import { WorkRepository, SqliteWorkRepository } from '../../database/repositories/work.repository';
import { DigitalFileValidatorService } from '../digital/digital-file-validator.service';
import { normalizeSearchString, calculateStringSimilarity } from '../../../shared/utils/text-normalizer';
import type {
  DigitalFormat,
  FileHealthInfo,
  FileStorageStatus,
  StorageHealthSummary,
  RelinkResult,
  BatchRebindMatch,
  BatchRebindResult,
  StorageAnalytics,
  StorageDuplicateGroup,
  PruneDuplicateOptions,
  PruneDuplicateResult,
} from '../../../shared/types/digital-file';

export class StorageManagerService {
  private static instance: StorageManagerService;
  private db: Database.Database;
  private workRepository: WorkRepository;
  private validator: DigitalFileValidatorService;

  constructor(db?: Database.Database, workRepository?: WorkRepository) {
    this.db = db || getDatabase();
    this.workRepository = workRepository || new SqliteWorkRepository(this.db);
    this.validator = DigitalFileValidatorService.getInstance();
  }

  public static getInstance(db?: Database.Database, workRepository?: WorkRepository): StorageManagerService {
    if (!this.instance || db || workRepository) {
      this.instance = new StorageManagerService(db, workRepository);
    }
    return this.instance;
  }

  /**
   * Computes a SHA-256 hash of a file on disk using streaming.
   */
  public async computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  /**
   * Computes an MD5 hash of a file on disk using streaming.
   */
  public async computeFileMd5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
      stream.on('error', (err) => reject(err));
    });
  }

  /**
   * Verifies the storage health of a single digital work on disk.
   */
  public async verifyWorkStorage(workId: string, verifyHash = false): Promise<FileHealthInfo | null> {
    const row = this.db.prepare(`
      SELECT 
        w.id as workId,
        w.title as title,
        GROUP_CONCAT(DISTINCT a.name) as author,
        e.id as editionId,
        s.id as sourceId,
        fsd.file_path as filePath,
        fsd.file_hash as fileHash,
        fsd.file_format as format,
        fsd.file_size_bytes as fileSizeBytes,
        fsd.storage_state as storageState
      FROM work w
      JOIN edition e ON e.work_id = w.id
      JOIN source s ON s.edition_id = e.id
      JOIN file_source_detail fsd ON fsd.source_id = s.id
      LEFT JOIN work_author wa ON wa.work_id = w.id
      LEFT JOIN author a ON a.id = wa.author_id
      WHERE w.id = ?
      GROUP BY w.id
    `).get(workId) as StorageRow | undefined;

    if (!row || !row.filePath) {
      return null;
    }

    const now = new Date().toISOString();
    let exists = false;
    let status: FileStorageStatus = 'missing';
    let sizeBytes = row.fileSizeBytes;
    let errorReason: string | undefined;
    let currentHash = row.fileHash;
    let isDuplicate = false;

    try {
      if (fs.existsSync(row.filePath)) {
        exists = true;
        const stat = fs.statSync(row.filePath);
        sizeBytes = stat.size;

        if (stat.size === 0) {
          status = 'corrupted';
          errorReason = 'الملف فارغ (0 بايت) / File is empty (0 bytes)';
        } else {
          status = 'available';

          // Optional deep hash check or if hash not yet computed
          if (verifyHash || !row.fileHash) {
            try {
              if (row.fileHash && row.fileHash.length === 32) {
                // Stored hash is MD5 (e.g. from LibGen)
                const fileMd5 = await this.computeFileMd5(row.filePath);
                if (row.fileHash.toLowerCase() !== fileMd5) {
                  status = 'corrupted';
                  errorReason = 'تغيّرت بصمة الملف الرقمية مقارنة بالأصل / File checksum differs from indexed hash';
                } else {
                  // Valid file! Compute SHA-256 and upgrade database record
                  currentHash = await this.computeFileSha256(row.filePath);
                  try {
                    this.db.prepare(`UPDATE file_source_detail SET file_hash = ? WHERE source_id = ?`).run(currentHash, row.sourceId);
                  } catch {
                    // Ignore DB update error
                  }
                }
              } else {
                currentHash = await this.computeFileSha256(row.filePath);
                if (row.fileHash && row.fileHash.toLowerCase() !== currentHash.toLowerCase()) {
                  status = 'corrupted';
                  errorReason = 'تغيّرت بصمة الملف الرقمية مقارنة بالأصل / File checksum differs from indexed hash';
                }
              }
            } catch {
              // Ignore hash calculation error if file is temporarily busy
            }
          }
        }
      } else {
        exists = false;
        const parsed = path.parse(row.filePath);
        const driveExists = parsed.root ? fs.existsSync(parsed.root) : true;
        if (!driveExists) {
          status = 'unmounted';
          errorReason = `القرص أو وسيط التخزين (${parsed.root}) غير متصل / Drive or mount point is unmounted`;
        } else {
          status = 'missing';
          errorReason = 'الملف غير موجود في المسار المحدد / File not found at specified path';
        }
      }
    } catch (err: unknown) {
      status = 'missing';
      exists = false;
      errorReason = errorMessage(err) || 'تعذر الوصول إلى الملف على القرص / Cannot access file on disk';
    }

    // Check if duplicate of another file in library
    if (currentHash) {
      const dupCount = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM file_source_detail 
        WHERE file_hash = ? AND source_id != ?
      `).get(currentHash, row.sourceId) as { count: number };

      if (dupCount && dupCount.count > 0) {
        isDuplicate = true;
      }
    }

    // Persist verified state
    try {
      this.db.prepare(`
        UPDATE file_source_detail
        SET storage_state = ?,
            last_verified_at = ?,
            file_size_bytes = COALESCE(?, file_size_bytes),
            file_hash = COALESCE(?, file_hash)
        WHERE source_id = ?
      `).run(status, now, sizeBytes || null, currentHash || null, row.sourceId);
    } catch (err) {
      console.warn('[StorageManagerService] Failed updating storage_state:', err);
    }

    return {
      workId: row.workId,
      sourceId: row.sourceId,
      editionId: row.editionId,
      title: row.title,
      author: row.author || undefined,
      filePath: row.filePath,
      format: row.format,
      status,
      fileSizeBytes: sizeBytes,
      exists,
      lastVerified: now,
      fileHash: currentHash,
      errorReason,
      isDuplicate,
    };
  }

  /**
   * Audits all registered digital files across the library, returning an aggregated health summary.
   */
  public async verifyAllStorage(verifyHash = false): Promise<StorageHealthSummary> {
    const rows = this.db.prepare(`
      SELECT DISTINCT
        w.id as workId
      FROM work w
      JOIN edition e ON e.work_id = w.id
      JOIN source s ON s.edition_id = e.id
      JOIN file_source_detail fsd ON fsd.source_id = s.id
      WHERE fsd.file_path IS NOT NULL
    `).all() as Array<{ workId: string }>;

    const items: FileHealthInfo[] = [];
    let availableFiles = 0;
    let missingFiles = 0;
    let unmountedFiles = 0;
    let corruptedFiles = 0;
    let duplicateFiles = 0;
    let totalSizeBytes = 0;
    const formatBreakdown: Record<string, { count: number; totalBytes: number }> = {};

    for (const r of rows) {
      const health = await this.verifyWorkStorage(r.workId, verifyHash);
      if (health) {
        items.push(health);

        if (health.status === 'available') availableFiles++;
        else if (health.status === 'unmounted') unmountedFiles++;
        else if (health.status === 'corrupted') corruptedFiles++;
        else missingFiles++;

        if (health.isDuplicate) duplicateFiles++;

        const size = health.fileSizeBytes || 0;
        if (health.exists) {
          totalSizeBytes += size;
        }

        const fmt = health.format || 'OTHER';
        if (!formatBreakdown[fmt]) {
          formatBreakdown[fmt] = { count: 0, totalBytes: 0 };
        }
        formatBreakdown[fmt].count++;
        if (health.exists) {
          formatBreakdown[fmt].totalBytes += size;
        }
      }
    }

    // Calculate reclaimable duplicate space
    let reclaimableSizeBytes = 0;
    try {
      const dupRows = this.db.prepare(`
        SELECT file_hash, COUNT(*) as cnt, MAX(file_size_bytes) as file_size
        FROM file_source_detail
        WHERE file_hash IS NOT NULL AND file_size_bytes IS NOT NULL AND storage_state = 'available'
        GROUP BY file_hash
        HAVING cnt > 1
      `).all() as Array<{ file_hash: string; cnt: number; file_size: number }>;

      for (const d of dupRows) {
        reclaimableSizeBytes += (d.cnt - 1) * (d.file_size || 0);
      }
    } catch {
      // Ignore
    }

    return {
      totalDigitalWorks: rows.length,
      totalFiles: items.length,
      availableFiles,
      missingFiles,
      unmountedFiles,
      corruptedFiles,
      duplicateFiles,
      totalSizeBytes,
      reclaimableSizeBytes,
      formatBreakdown,
      items,
    };
  }

  /**
   * Relinks a single missing work to a new file path on disk.
   */
  public async relinkFile(workId: string, newFilePath: string): Promise<RelinkResult> {
    if (!newFilePath || typeof newFilePath !== 'string') {
      return {
        success: false,
        workId,
        newFilePath: '',
        error: 'المسار المحدد غير صالح / Invalid file path provided',
      };
    }

    const resolved = path.resolve(newFilePath);
    if (!fs.existsSync(resolved)) {
      return {
        success: false,
        workId,
        newFilePath: resolved,
        error: 'الملف غير موجود في المسار المحدد / File does not exist at specified path',
      };
    }

    // Validate format
    const validation = await this.validator.validateFile(resolved);
    if (!validation.isValid) {
      return {
        success: false,
        workId,
        newFilePath: resolved,
        error: validation.error || 'الملف المختار غير صالح ككتاب رقمي / Selected file is not a supported ebook format',
      };
    }

    const stat = fs.statSync(resolved);
    const hash = await this.computeFileSha256(resolved);
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE file_source_detail
        SET file_path = ?,
            file_hash = ?,
            file_format = ?,
            file_size_bytes = ?,
            storage_state = 'available',
            last_verified_at = ?
        WHERE source_id IN (
          SELECT s.id FROM source s
          JOIN edition e ON e.id = s.edition_id
          WHERE e.work_id = ?
        )
      `).run(resolved, hash, validation.format || 'PDF', stat.size, now, workId);
    });

    try {
      tx();
      return {
        success: true,
        workId,
        newFilePath: resolved,
        fileSizeBytes: stat.size,
        format: validation.format,
      };
    } catch (err: unknown) {
      return {
        success: false,
        workId,
        newFilePath: resolved,
        error: errorMessage(err) || 'فشل تحديث قاعدة البيانات / Failed updating database record',
      };
    }
  }

  /**
   * Batch scans a directory recursively to auto-rebind missing files by hash or filename.
   */
  public async batchAutoRebind(searchDirectory: string, maxDepth = 4): Promise<BatchRebindResult> {
    const resolvedDir = path.resolve(searchDirectory);
    if (!fs.existsSync(resolvedDir)) {
      return {
        scannedFilesCount: 0,
        resolvedCount: 0,
        unresolvedCount: 0,
        matches: [],
        errors: ['المجلد المحدد غير موجود / Specified directory does not exist'],
      };
    }

    // 1. Fetch all works currently marked missing or unmounted
    const missingWorks = this.db.prepare(`
      SELECT 
        w.id as workId,
        w.title as title,
        e.id as editionId,
        s.id as sourceId,
        fsd.file_path as oldPath,
        fsd.file_hash as fileHash,
        fsd.file_format as format
      FROM work w
      JOIN edition e ON e.work_id = w.id
      JOIN source s ON s.edition_id = e.id
      JOIN file_source_detail fsd ON fsd.source_id = s.id
      WHERE fsd.storage_state IN ('missing', 'unmounted')
    `).all() as Array<{
      workId: string;
      title: string;
      editionId: string;
      sourceId: string;
      oldPath: string;
      fileHash?: string;
      format?: DigitalFormat;
    }>;

    if (missingWorks.length === 0) {
      return {
        scannedFilesCount: 0,
        resolvedCount: 0,
        unresolvedCount: 0,
        matches: [],
        errors: [],
      };
    }

    // 2. Collect candidate ebook files from directory
    const candidateFiles: string[] = [];
    const supportedExts = new Set(['.pdf', '.epub', '.mobi', '.azw3', '.txt', '.html', '.docx']);

    const walk = (dir: string, depth: number) => {
      if (depth > maxDepth) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              walk(fullPath, depth + 1);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (supportedExts.has(ext)) {
              candidateFiles.push(fullPath);
            }
          }
        }
      } catch {
        // Skip unreadable folders
      }
    };

    walk(resolvedDir, 0);

    const matches: BatchRebindMatch[] = [];
    const errors: string[] = [];
    const remainingMissing = [...missingWorks];
    const usedCandidates = new Set<string>();

    // Pass 1: Match by exact SHA-256 hash if candidate has hash
    for (const work of [...remainingMissing]) {
      if (!work.fileHash) continue;

      for (const candidate of candidateFiles) {
        if (usedCandidates.has(candidate)) continue;
        try {
          const candidateHash = await this.computeFileSha256(candidate);
          if (candidateHash === work.fileHash) {
            matches.push({
              workId: work.workId,
              sourceId: work.sourceId,
              title: work.title,
              oldPath: work.oldPath,
              newPath: candidate,
              matchType: 'hash',
              confidence: 1.0,
            });
            usedCandidates.add(candidate);
            const idx = remainingMissing.indexOf(work);
            if (idx >= 0) remainingMissing.splice(idx, 1);
            break;
          }
        } catch {
          // Ignore read error
        }
      }
    }

    // Pass 2: Match by normalized filename & title
    for (const work of [...remainingMissing]) {
      const oldBase = path.basename(work.oldPath || '', path.extname(work.oldPath || ''));
      const normTitle = normalizeSearchString(work.title);
      const normOldBase = normalizeSearchString(oldBase);

      let bestCandidate: string | null = null;
      let highestScore = 0;

      for (const candidate of candidateFiles) {
        if (usedCandidates.has(candidate)) continue;

        const candidateBase = path.basename(candidate, path.extname(candidate));
        const normCand = normalizeSearchString(candidateBase);

        // Check exact normalized match
        if (normCand === normTitle || (normOldBase && normCand === normOldBase)) {
          bestCandidate = candidate;
          highestScore = 0.95;
          break;
        }

        // Check string similarity
        const score1 = calculateStringSimilarity(normCand, normTitle);
        const score2 = normOldBase ? calculateStringSimilarity(normCand, normOldBase) : 0;
        const maxScore = Math.max(score1, score2);

        if (maxScore > 0.82 && maxScore > highestScore) {
          highestScore = maxScore;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate && highestScore >= 0.82) {
        matches.push({
          workId: work.workId,
          sourceId: work.sourceId,
          title: work.title,
          oldPath: work.oldPath,
          newPath: bestCandidate,
          matchType: 'filename',
          confidence: highestScore,
        });
        usedCandidates.add(bestCandidate);
        const idx = remainingMissing.indexOf(work);
        if (idx >= 0) remainingMissing.splice(idx, 1);
      }
    }

    // 3. Apply matches in transaction
    if (matches.length > 0) {
      const now = new Date().toISOString();
      const updateStmt = this.db.prepare(`
        UPDATE file_source_detail
        SET file_path = ?,
            storage_state = 'available',
            last_verified_at = ?,
            file_size_bytes = ?
        WHERE source_id = ?
      `);

      const tx = this.db.transaction(() => {
        for (const m of matches) {
          try {
            const stat = fs.statSync(m.newPath);
            updateStmt.run(m.newPath, now, stat.size, m.sourceId);
          } catch (err: unknown) {
            errors.push(`فشل تحديث ${m.title}: ${errorMessage(err) || ''}`);
          }
        }
      });

      try {
        tx();
      } catch (err: unknown) {
        errors.push(`فشل حفظ التغييرات: ${errorMessage(err) || ''}`);
      }
    }

    return {
      scannedFilesCount: candidateFiles.length,
      resolvedCount: matches.length,
      unresolvedCount: missingWorks.length - matches.length,
      matches,
      errors,
    };
  }

  /**
   * Returns storage analytics, format distribution, and duplicate groups.
   */
  public async getStorageAnalytics(): Promise<StorageAnalytics> {
    const summary = await this.verifyAllStorage(false);

    // Group duplicates
    const dupGroups: StorageDuplicateGroup[] = [];
    try {
      const hashGroups = this.db.prepare(`
        SELECT 
          fsd.file_hash as hash,
          COUNT(*) as cnt,
          MAX(fsd.file_size_bytes) as file_size,
          fsd.file_format as format
        FROM file_source_detail fsd
        WHERE fsd.file_hash IS NOT NULL AND fsd.file_hash != ''
        GROUP BY fsd.file_hash
        HAVING cnt > 1
      `).all() as Array<{ hash: string; cnt: number; file_size: number; format?: DigitalFormat }>;

      for (const g of hashGroups) {
        const items = this.db.prepare(`
          SELECT 
            w.id as workId,
            s.id as sourceId,
            w.title as title,
            GROUP_CONCAT(DISTINCT a.name) as author,
            fsd.file_path as filePath,
            fsd.file_size_bytes as fileSizeBytes,
            s.added_at as addedAt
          FROM file_source_detail fsd
          JOIN source s ON s.id = fsd.source_id
          JOIN edition e ON e.id = s.edition_id
          JOIN work w ON w.id = e.work_id
          LEFT JOIN work_author wa ON wa.work_id = w.id
          LEFT JOIN author a ON a.id = wa.author_id
          WHERE fsd.file_hash = ?
          GROUP BY w.id
          ORDER BY s.added_at ASC
        `).all(g.hash) as StorageRow[];

        dupGroups.push({
          hash: g.hash,
          fileSizeBytes: g.file_size || 0,
          format: g.format,
          count: g.cnt,
          wastedBytes: (g.cnt - 1) * (g.file_size || 0),
          items: items.map((it, idx) => ({
            workId: it.workId,
            sourceId: it.sourceId,
            title: it.title,
            author: it.author || undefined,
            filePath: it.filePath,
            fileSizeBytes: it.fileSizeBytes || g.file_size || 0,
            isPrimary: idx === 0, // First added is designated primary
          })),
        });
      }
    } catch (err) {
      console.warn('[StorageManagerService] Error calculating duplicate groups:', err);
    }

    return {
      totalDigitalWorks: summary.totalDigitalWorks,
      totalFiles: summary.totalFiles,
      totalSizeBytes: summary.totalSizeBytes,
      reclaimableBytes: summary.reclaimableSizeBytes,
      healthCounts: {
        available: summary.availableFiles,
        missing: summary.missingFiles,
        unmounted: summary.unmountedFiles,
        corrupted: summary.corruptedFiles,
        duplicate: summary.duplicateFiles,
      },
      formatDistribution: summary.formatBreakdown,
      duplicateGroups: dupGroups,
    };
  }

  /**
   * Safely prunes or consolidates a duplicate copy.
   */
  public async pruneDuplicate(options: PruneDuplicateOptions): Promise<PruneDuplicateResult> {
    const { primaryWorkId, duplicateWorkId } = options;
    const shouldDeleteFromDisk = Boolean(options.deleteFileFromDisk || options.deletePhysicalFile);

    if (primaryWorkId === duplicateWorkId) {
      return {
        success: false,
        freedBytes: 0,
        fileDeletedFromDisk: false,
        error: 'لا يمكن حذف العمل الأساسي كمكرر لنفسه / Cannot prune work against itself',
      };
    }

    const dupRow = this.db.prepare(`
      SELECT 
        w.id as workId,
        e.id as editionId,
        s.id as sourceId,
        fsd.file_path as filePath,
        fsd.file_size_bytes as fileSizeBytes
      FROM work w
      JOIN edition e ON e.work_id = w.id
      JOIN source s ON s.edition_id = e.id
      JOIN file_source_detail fsd ON fsd.source_id = s.id
      WHERE w.id = ?
    `).get(duplicateWorkId) as StorageRow | undefined;

    if (!dupRow) {
      return {
        success: false,
        freedBytes: 0,
        fileDeletedFromDisk: false,
        error: 'لم يتم العثور على العمل المكرر / Duplicate work not found',
      };
    }

    const primRow = this.db.prepare(`
      SELECT fsd.file_path as filePath
      FROM work w
      JOIN edition e ON e.work_id = w.id
      JOIN source s ON s.edition_id = e.id
      JOIN file_source_detail fsd ON fsd.source_id = s.id
      WHERE w.id = ?
    `).get(primaryWorkId) as StorageRow | undefined;

    const freedBytes = dupRow.fileSizeBytes || 0;
    let fileDeleted = false;

    // Optional physical deletion if file is distinct from primary
    if (shouldDeleteFromDisk && dupRow.filePath && fs.existsSync(dupRow.filePath)) {
      if (!primRow || path.resolve(dupRow.filePath) !== path.resolve(primRow.filePath)) {
        try {
          fs.unlinkSync(dupRow.filePath);
          fileDeleted = true;
        } catch (err: unknown) {
          console.warn('[StorageManagerService] Could not unlink duplicate file:', err);
        }
      }
    }

    // Delete duplicate work from DB
    try {
      this.workRepository.deleteBook(duplicateWorkId);
      return {
        success: true,
        deletedWorkId: duplicateWorkId,
        freedBytes,
        fileDeletedFromDisk: fileDeleted,
      };
    } catch (err: unknown) {
      return {
        success: false,
        freedBytes: 0,
        fileDeletedFromDisk: fileDeleted,
        error: errorMessage(err) || 'فشل حذف السجل المكرر من قاعدة البيانات / Failed deleting duplicate record',
      };
    }
  }
}
