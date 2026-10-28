import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { StorageManagerService } from '../../src/main/services/storage/storage-manager.service';

describe('Storage Management & File Health Service (Story 7 / KEY-7)', () => {
  let db: Database.Database;
  let repo: SqliteWorkRepository;
  let storageService: StorageManagerService;
  let tempDir: string;
  const tempFilesToClean: string[] = [];

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteWorkRepository(db);
    storageService = StorageManagerService.getInstance(db, repo);

    // Create isolated temp workspace for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-storage-test-'));

    // Insert category for test books
    db.prepare(`
      INSERT OR IGNORE INTO category (id, name_en, name_ar)
      VALUES ('cat-storage', 'Storage Test', 'اختبار التخزين')
    `).run();
  });

  afterEach(() => {
    for (const f of tempFilesToClean) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
    try {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  /**
   * Helper to seed a digital book record into the database
   */
  function seedDigitalBook(options: {
    workId: string;
    title: string;
    filePath: string;
    format?: string;
    fileSizeBytes?: number;
    checksumSha256?: string;
    storageState?: string;
  }) {
    const {
      workId,
      title,
      filePath,
      format = 'PDF',
      fileSizeBytes = 1024,
      checksumSha256,
      storageState = 'available',
    } = options;

    const editionId = `ed-${workId}`;
    const sourceId = `src-${workId}`;

    db.prepare(`
      INSERT INTO work (id, title, work_type_id)
      VALUES (?, ?, 'wt-book')
    `).run(workId, title);

    db.prepare(`
      INSERT OR IGNORE INTO author (id, name)
      VALUES ('auth-test', 'Author Test')
    `).run();

    db.prepare(`
      INSERT OR IGNORE INTO work_author (work_id, author_id, role)
      VALUES (?, 'auth-test', 'author')
    `).run(workId);

    db.prepare(`
      INSERT INTO edition (id, work_id)
      VALUES (?, ?)
    `).run(editionId, workId);

    db.prepare(`
      INSERT INTO source (id, edition_id, source_type)
      VALUES (?, ?, 'file')
    `).run(sourceId, editionId);

    db.prepare(`
      INSERT INTO file_source_detail (
        source_id, file_path, file_format, file_size_bytes,
        file_hash, storage_state, last_verified_at
      )
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(sourceId, filePath, format, fileSizeBytes, checksumSha256 || null, storageState);
  }

  describe('Subtask 7.1: File Existence Validation & Integrity Verification', () => {
    it('verifies a healthy, available digital book file correctly', async () => {
      const filePath = path.join(tempDir, 'valid-book.pdf');
      const pdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
      fs.writeFileSync(filePath, pdfContent);
      tempFilesToClean.push(filePath);

      const hash = crypto.createHash('sha256').update(pdfContent).digest('hex');
      seedDigitalBook({
        workId: 'work-healthy-1',
        title: 'Healthy Book',
        filePath,
        fileSizeBytes: pdfContent.length,
        checksumSha256: hash,
        storageState: 'available',
      });

      const health = await storageService.verifyWorkStorage('work-healthy-1', true);
      assert.ok(health);
      assert.strictEqual(health.status, 'available');
      assert.strictEqual(health.exists, true);
      assert.strictEqual(health.fileHash, hash);
      assert.strictEqual(health.fileSizeBytes, pdfContent.length);
    });

    it('detects missing files when the target path does not exist on disk', async () => {
      const missingPath = path.join(tempDir, 'non-existent-book.pdf');
      seedDigitalBook({
        workId: 'work-missing-1',
        title: 'Missing Book',
        filePath: missingPath,
        fileSizeBytes: 2048,
        storageState: 'available',
      });

      const health = await storageService.verifyWorkStorage('work-missing-1');
      assert.ok(health);
      assert.strictEqual(health.status, 'missing');
      assert.strictEqual(health.exists, false);

      // Verify DB storage_state was updated to 'missing'
      const row = db.prepare(`
        SELECT storage_state FROM file_source_detail
        WHERE source_id = 'src-work-missing-1'
      `).get() as unknown;
      assert.strictEqual(row.storage_state, 'missing');
    });

    it('detects unmounted storage when the drive root does not exist', async () => {
      // Use drive Z:\ which does not exist in typical environments
      const unmountedPath = 'Z:\\MissingDrive\\Library\\book.pdf';
      seedDigitalBook({
        workId: 'work-unmounted-1',
        title: 'Unmounted Book',
        filePath: unmountedPath,
        storageState: 'available',
      });

      const health = await storageService.verifyWorkStorage('work-unmounted-1');
      assert.ok(health);
      assert.strictEqual(health.status, 'unmounted');
      assert.strictEqual(health.exists, false);
    });

    it('detects corrupted or 0-byte digital files', async () => {
      const emptyFilePath = path.join(tempDir, 'empty-book.pdf');
      fs.writeFileSync(emptyFilePath, Buffer.alloc(0)); // 0-byte file
      tempFilesToClean.push(emptyFilePath);

      seedDigitalBook({
        workId: 'work-empty-1',
        title: 'Empty Corrupted Book',
        filePath: emptyFilePath,
        fileSizeBytes: 0,
        storageState: 'available',
      });

      const health = await storageService.verifyWorkStorage('work-empty-1');
      assert.ok(health);
      assert.strictEqual(health.status, 'corrupted');
      assert.strictEqual(health.fileSizeBytes, 0);
    });

    it('detects checksum mismatch when file content has been altered', async () => {
      const filePath = path.join(tempDir, 'tampered-book.pdf');
      fs.writeFileSync(filePath, Buffer.from('%PDF-1.4 modified content\n%%EOF'));
      tempFilesToClean.push(filePath);

      const originalHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      seedDigitalBook({
        workId: 'work-tampered-1',
        title: 'Tampered Book',
        filePath,
        fileSizeBytes: 24,
        checksumSha256: originalHash,
        storageState: 'available',
      });

      const health = await storageService.verifyWorkStorage('work-tampered-1', true);
      assert.ok(health);
      assert.strictEqual(health.status, 'corrupted');
    });

    it('audits library-wide storage and calculates health totals and format distribution', async () => {
      // 1 healthy file
      const p1 = path.join(tempDir, 'pdf1.pdf');
      fs.writeFileSync(p1, Buffer.from('%PDF-1.4 sample\n%%EOF'));
      tempFilesToClean.push(p1);
      seedDigitalBook({ workId: 'w-pdf1', title: 'PDF 1', filePath: p1, format: 'PDF', fileSizeBytes: 100 });

      // 1 missing file
      seedDigitalBook({ workId: 'w-miss', title: 'Missing Book', filePath: path.join(tempDir, 'ghost.pdf'), format: 'PDF', fileSizeBytes: 200 });

      // 1 0-byte corrupted file
      const p3 = path.join(tempDir, 'corrupted.epub');
      fs.writeFileSync(p3, Buffer.alloc(0));
      tempFilesToClean.push(p3);
      seedDigitalBook({ workId: 'w-corp', title: 'Corrupted EPUB', filePath: p3, format: 'EPUB', fileSizeBytes: 0 });

      const summary = await storageService.verifyAllStorage(false);
      assert.strictEqual(summary.totalFiles, 3);
      assert.strictEqual(summary.availableFiles, 1);
      assert.strictEqual(summary.missingFiles, 1);
      assert.strictEqual(summary.corruptedFiles, 1);
      assert.strictEqual(summary.formatBreakdown['PDF']?.count, 2);
      assert.strictEqual(summary.formatBreakdown['EPUB']?.count, 1);
      assert.ok(summary.totalSizeBytes > 0);
    });
  });

  describe('Subtask 7.2: Missing File Relocation & Path Rebinding', () => {
    it('relocates and re-links a missing book to a valid new file path', async () => {
      const oldPath = path.join(tempDir, 'old-nonexistent.pdf');
      seedDigitalBook({
        workId: 'work-relink-1',
        title: 'Relink Test Book',
        filePath: oldPath,
        storageState: 'missing',
      });

      // Prepare new file
      const newPath = path.join(tempDir, 'new-location.pdf');
      const validPdf = Buffer.from('%PDF-1.4\nValid PDF body for relinking\n%%EOF');
      fs.writeFileSync(newPath, validPdf);
      tempFilesToClean.push(newPath);

      const result = await storageService.relinkFile('work-relink-1', newPath);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.workId, 'work-relink-1');
      assert.strictEqual(result.newFilePath, newPath);
      assert.strictEqual(result.fileSizeBytes, validPdf.length);

      // Verify database updated
      const row = db.prepare(`
        SELECT file_path, storage_state, file_size_bytes, file_hash
        FROM file_source_detail
        WHERE source_id = 'src-work-relink-1'
      `).get() as unknown;

      assert.strictEqual(row.file_path, newPath);
      assert.strictEqual(row.storage_state, 'available');
      assert.strictEqual(row.file_size_bytes, validPdf.length);
      assert.ok(row.file_hash);
    });

    it('rejects relinking when the target new file path does not exist', async () => {
      seedDigitalBook({
        workId: 'work-fail-relink',
        title: 'Fail Relink Book',
        filePath: path.join(tempDir, 'old.pdf'),
        storageState: 'missing',
      });

      const nonExistent = path.join(tempDir, 'does-not-exist.pdf');
      const result = await storageService.relinkFile('work-fail-relink', nonExistent);
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('rejects relinking when the new file is not a supported e-book format', async () => {
      seedDigitalBook({
        workId: 'work-invalid-ext',
        title: 'Invalid Format Book',
        filePath: path.join(tempDir, 'old.pdf'),
        storageState: 'missing',
      });

      const exePath = path.join(tempDir, 'malicious.exe');
      fs.writeFileSync(exePath, Buffer.from('MZ\x90\x00not an ebook'));
      tempFilesToClean.push(exePath);

      const result = await storageService.relinkFile('work-invalid-ext', exePath);
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('performs batch auto-rebinding across a directory for missing files', async () => {
      const searchSubdir = path.join(tempDir, 'moved-books');
      fs.mkdirSync(searchSubdir, { recursive: true });

      // Create a relocated file in the search directory
      const bookAContent = Buffer.from('%PDF-1.4\nBook A Content\n%%EOF');
      const bookAPath = path.join(searchSubdir, 'Clean Code.pdf');
      fs.writeFileSync(bookAPath, bookAContent);
      tempFilesToClean.push(bookAPath);

      const hashA = crypto.createHash('sha256').update(bookAContent).digest('hex');

      // Seed missing book in database with the same hash
      seedDigitalBook({
        workId: 'work-batch-a',
        title: 'Clean Code',
        filePath: 'C:\\OldFolder\\Clean Code.pdf',
        checksumSha256: hashA,
        storageState: 'missing',
      });

      const batchRes = await storageService.batchAutoRebind(searchSubdir);
      assert.strictEqual(batchRes.scannedFilesCount >= 1, true);
      assert.strictEqual(batchRes.resolvedCount, 1);
      assert.strictEqual(batchRes.matches.length, 1);
      assert.strictEqual(batchRes.matches[0].workId, 'work-batch-a');
      assert.strictEqual(batchRes.matches[0].newPath, bookAPath);

      // Verify DB updated
      const row = db.prepare(`
        SELECT file_path, storage_state FROM file_source_detail
        WHERE source_id = 'src-work-batch-a'
      `).get() as unknown;
      assert.strictEqual(row.file_path, bookAPath);
      assert.strictEqual(row.storage_state, 'available');
    });
  });

  describe('Subtask 7.3: Storage Duplicate Detection & Disk Cleanup Manager', () => {
    it('detects duplicate files sharing the identical SHA-256 checksum', async () => {
      const content = Buffer.from('%PDF-1.4 duplicate test content\n%%EOF');
      const hash = crypto.createHash('sha256').update(content).digest('hex');

      const file1 = path.join(tempDir, 'copy-1.pdf');
      const file2 = path.join(tempDir, 'copy-2.pdf');
      fs.writeFileSync(file1, content);
      fs.writeFileSync(file2, content);
      tempFilesToClean.push(file1, file2);

      seedDigitalBook({
        workId: 'work-dup-1',
        title: 'Duplicate Master Copy',
        filePath: file1,
        fileSizeBytes: content.length,
        checksumSha256: hash,
      });

      seedDigitalBook({
        workId: 'work-dup-2',
        title: 'Duplicate Second Copy',
        filePath: file2,
        fileSizeBytes: content.length,
        checksumSha256: hash,
      });

      const analytics = await storageService.getStorageAnalytics();
      assert.strictEqual(analytics.duplicateGroups.length, 1);
      assert.strictEqual(analytics.duplicateGroups[0].count, 2);
      assert.strictEqual(analytics.duplicateGroups[0].wastedBytes, content.length);
      assert.strictEqual(analytics.duplicateGroups[0].items.length, 2);

      // Verify primary designation
      const primary = analytics.duplicateGroups[0].items.find((i) => i.isPrimary);
      const secondary = analytics.duplicateGroups[0].items.find((i) => !i.isPrimary);
      assert.ok(primary);
      assert.ok(secondary);
    });

    it('prunes a duplicate work from database and deletes its physical file from disk', async () => {
      const content = Buffer.from('%PDF-1.4 duplicate prune content\n%%EOF');
      const hash = crypto.createHash('sha256').update(content).digest('hex');

      const masterPath = path.join(tempDir, 'master.pdf');
      const dupPath = path.join(tempDir, 'dup-to-delete.pdf');
      fs.writeFileSync(masterPath, content);
      fs.writeFileSync(dupPath, content);
      tempFilesToClean.push(masterPath, dupPath);

      seedDigitalBook({
        workId: 'work-master',
        title: 'Master Book',
        filePath: masterPath,
        fileSizeBytes: content.length,
        checksumSha256: hash,
      });

      seedDigitalBook({
        workId: 'work-dup',
        title: 'Duplicate Book',
        filePath: dupPath,
        fileSizeBytes: content.length,
        checksumSha256: hash,
      });

      assert.strictEqual(fs.existsSync(dupPath), true);

      // Prune duplicate with physical file deletion
      const pruneRes = await storageService.pruneDuplicate({
        primaryWorkId: 'work-master',
        duplicateWorkId: 'work-dup',
        deletePhysicalFile: true,
      });

      assert.strictEqual(pruneRes.success, true);
      assert.strictEqual(pruneRes.deletedWorkId, 'work-dup');
      assert.strictEqual(pruneRes.fileDeletedFromDisk, true);
      assert.strictEqual(pruneRes.freedBytes, content.length);

      // Verify file removed from disk
      assert.strictEqual(fs.existsSync(dupPath), false);

      // Verify work removed from database
      const workRow = db.prepare('SELECT id FROM work WHERE id = ?').get('work-dup');
      assert.strictEqual(workRow, undefined);

      // Master copy remains untouched
      assert.strictEqual(fs.existsSync(masterPath), true);
      const masterRow = db.prepare('SELECT id FROM work WHERE id = ?').get('work-master');
      assert.ok(masterRow);
    });
  });
});
