import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../../helpers/test-db';
import { SqliteWorkRepository } from '../../../src/main/database/repositories/work.repository';
import { DuplicateDetectorService } from '../../../src/main/services/digital/duplicate-detector.service';
import { DigitalImportPipelineService } from '../../../src/main/services/digital/digital-import-pipeline.service';
import type { ImportProgressEvent } from '../../../src/shared/types/digital-file';

describe('Duplicate Detection & Import Resolution (Story 6.4, 6.5 / KEY-81, KEY-82)', () => {
  let db: Database.Database;
  let repo: SqliteWorkRepository;
  let detector: DuplicateDetectorService;
  let pipeline: DigitalImportPipelineService;
  const tempFiles: string[] = [];

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteWorkRepository(db);
    detector = new DuplicateDetectorService(repo);
    pipeline = new DigitalImportPipelineService(repo, undefined, undefined, undefined, detector);
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
    tempFiles.length = 0;
  });

  it('identifies exact file duplicate via SHA-256 hash match with 1.0 confidence', async () => {
    const fileContent = 'Original file content for hash verification';
    const tempFile1 = path.join(os.tmpdir(), `original-${Date.now()}.txt`);
    fs.writeFileSync(tempFile1, fileContent, 'utf8');
    tempFiles.push(tempFile1);

    const hash = crypto.createHash('sha256').update(fileContent).digest('hex');

    // Register existing book
    const existing = repo.addBook({
      title: 'كتاب أصلي',
      author: 'مؤلف معتمد',
      bookType: 'digital',
      filePath: tempFile1,
      fileHash: hash,
    });

    // Create a second file with identical content but different name
    const tempFile2 = path.join(os.tmpdir(), `copy-renamed-${Date.now()}.txt`);
    fs.writeFileSync(tempFile2, fileContent, 'utf8');
    tempFiles.push(tempFile2);

    const result = await detector.checkDuplicate(tempFile2);

    assert.strictEqual(result.matchType, 'exact_file');
    assert.strictEqual(result.confidence, 1.0);
    assert.strictEqual(result.existingWork?.id, existing.id);
    assert.equal(result.reason, 'exact_file');
  });

  it('identifies matching edition duplicate via ISBN with 0.95 confidence', async () => {
    const existing = repo.addBook({
      title: 'Design Patterns Elements of Reusable Object-Oriented Software',
      author: 'Erich Gamma, Richard Helm',
      bookType: 'digital',
      isbn: '978-0-201-63361-0',
    });

    const candidateFile = path.join(os.tmpdir(), `Design Patterns Gang of Four.txt`);
    fs.writeFileSync(candidateFile, 'Different text file payload', 'utf8');
    tempFiles.push(candidateFile);

    const result = await detector.checkDuplicate({
      filePath: candidateFile,
      title: 'Design Patterns',
      isbn: '9780201633610',
    });

    assert.strictEqual(result.matchType, 'same_edition');
    assert.strictEqual(result.confidence, 0.95);
    assert.strictEqual(result.existingWork?.id, existing.id);
    assert.equal(result.reason, 'same_edition');
  });

  it('identifies potential duplicate work via high title and author similarity', async () => {
    const existing = repo.addBook({
      title: 'مقدمة ابن خلدون',
      author: 'عبد الرحمن بن خلدون',
      bookType: 'digital',
    });

    const result = await detector.checkDuplicate({
      filePath: 'mock/path/Muqaddimah.pdf',
      title: 'المقدمة',
      author: 'ابن خلدون',
    });

    assert.strictEqual(result.matchType, 'potential_duplicate');
    assert.ok(result.confidence >= 0.75);
    assert.strictEqual(result.existingWork?.id, existing.id);
  });

  it('returns matchType "none" with 0.0 confidence for unique new books', async () => {
    repo.addBook({
      title: 'تاريخ بغداد',
      author: 'الخطيب البغدادي',
      bookType: 'digital',
    });

    const result = await detector.checkDuplicate({
      filePath: 'mock/path/Unique_Novel.epub',
      title: 'حي بن يقظان',
      author: 'ابن طفيل',
    });

    assert.strictEqual(result.matchType, 'none');
    assert.strictEqual(result.confidence, 0.0);
    assert.strictEqual(result.existingWork, undefined);
  });

  it('batch inspects multiple candidate files', async () => {
    const content = 'Duplicate batch content';
    const tempFile = path.join(os.tmpdir(), `batch-dup-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, content, 'utf8');
    tempFiles.push(tempFile);

    const hash = crypto.createHash('sha256').update(content).digest('hex');

    repo.addBook({
      title: 'كتاب مسجل',
      author: 'أديب',
      bookType: 'digital',
      fileHash: hash,
    });

    const results = await detector.batchCheckDuplicates([
      tempFile,
      { filePath: 'another.pdf', title: 'كتاب فريد غير موجود' },
    ]);

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].matchType, 'exact_file');
    assert.strictEqual(results[1].matchType, 'none');
  });

  it('skips duplicate during import when duplicateAction is "skip"', async () => {
    const content = 'Content for skip test';
    const tempFile = path.join(os.tmpdir(), `skip-test-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, content, 'utf8');
    tempFiles.push(tempFile);

    const hash = crypto.createHash('sha256').update(content).digest('hex');

    const existing = repo.addBook({
      title: 'الكتاب الأول',
      author: 'المؤلف',
      bookType: 'digital',
      fileHash: hash,
    });

    const initialCount = repo.getAllWorks().length;

    const res = await pipeline.importFile({
      filePath: tempFile,
      duplicateAction: 'skip',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.skipped, true);
    assert.strictEqual(res.workId, existing.id);
    assert.strictEqual(res.duplicateMatchType, 'exact_file');

    // No new record created
    assert.strictEqual(repo.getAllWorks().length, initialCount);
  });

  it('replaces existing book digital file when duplicateAction is "replace"', async () => {
    const oldContent = 'Old digital file';
    const oldFile = path.join(os.tmpdir(), `old-file-${Date.now()}.txt`);
    fs.writeFileSync(oldFile, oldContent, 'utf8');
    tempFiles.push(oldFile);

    const oldHash = crypto.createHash('sha256').update(oldContent).digest('hex');

    const existing = repo.addBook({
      title: 'كتاب للاستبدال',
      author: 'مؤلف قديم',
      bookType: 'digital',
      filePath: oldFile,
      fileHash: oldHash,
    });

    const newContent = 'New improved digital file edition';
    const newFile = path.join(os.tmpdir(), `new-file-${Date.now()}.txt`);
    fs.writeFileSync(newFile, newContent, 'utf8');
    tempFiles.push(newFile);

    const newHash = crypto.createHash('sha256').update(newContent).digest('hex');

    const res = await pipeline.importFile({
      filePath: newFile,
      duplicateAction: 'replace',
      existingWorkId: existing.id,
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.workId, existing.id);

    const updated = repo.getById(existing.id);
    assert.ok(updated);
    assert.strictEqual(updated.filePath, path.resolve(newFile));
    assert.strictEqual(updated.fileHash, newHash);
  });

  it('reports streaming progress events during batch import', async () => {
    const f1 = path.join(os.tmpdir(), `f1-${Date.now()}.txt`);
    const f2 = path.join(os.tmpdir(), `f2-${Date.now()}.txt`);
    fs.writeFileSync(f1, 'Content 1', 'utf8');
    fs.writeFileSync(f2, 'Content 2', 'utf8');
    tempFiles.push(f1, f2);

    const events: ImportProgressEvent[] = [];

    const summary = await pipeline.importFiles(
      [{ filePath: f1 }, { filePath: f2 }],
      (progress) => {
        events.push(progress);
      }
    );

    assert.strictEqual(summary.totalFiles, 2);
    assert.strictEqual(summary.successfulImports, 2);
    assert.ok(events.length >= 4, 'Should emit multiple progress steps');

    const statuses = events.map((e) => e.status);
    assert.ok(statuses.includes('validating'));
    assert.ok(statuses.includes('extracting'));
    assert.ok(statuses.includes('completed'));
    assert.strictEqual(events[events.length - 1].progressPercentage, 100);
  });
});
