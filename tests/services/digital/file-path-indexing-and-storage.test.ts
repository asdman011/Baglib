import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../../helpers/test-db';
import { SqliteWorkRepository } from '../../../src/main/database/repositories/work.repository';

describe('File Path Indexing & Storage Verification (Story 6.3 / KEY-80)', () => {
  let db: Database.Database;
  let repo: SqliteWorkRepository;
  const tempFiles: string[] = [];

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteWorkRepository(db);
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // ignore cleanup
      }
    }
    tempFiles.length = 0;
  });

  it('indexes digital file paths and locates works by exact path', () => {
    const tempFile = path.join(os.tmpdir(), `indexed-file-${Date.now()}.pdf`);
    fs.writeFileSync(tempFile, '%PDF-1.4 sample content', 'utf8');
    tempFiles.push(tempFile);

    const book = repo.addBook({
      title: 'كتاب الفهرسة والمسارات',
      author: 'باحث المكتبة',
      bookType: 'digital',
      digitalFormat: 'PDF',
      filePath: tempFile,
      fileHash: 'abc123hash',
    });

    const foundByPath = repo.findWorkByFilePath(tempFile);
    assert.ok(foundByPath);
    assert.strictEqual(foundByPath.id, book.id);
    assert.strictEqual(foundByPath.title, 'كتاب الفهرسة والمسارات');
  });

  it('indexes digital file hashes and locates works by SHA-256 hash', () => {
    const sampleHash = crypto.createHash('sha256').update('test-content-for-hash').digest('hex');

    const book = repo.addBook({
      title: 'خوارزميات التجزئة',
      author: 'الخوارزمي',
      bookType: 'digital',
      digitalFormat: 'EPUB',
      fileHash: sampleHash,
    });

    const foundByHash = repo.findWorkByFileHash(sampleHash);
    assert.ok(foundByHash);
    assert.strictEqual(foundByHash.id, book.id);
    assert.strictEqual(foundByHash.fileHash, sampleHash);
  });

  it('indexes ISBNs and locates works regardless of punctuation or format', () => {
    const book = repo.addBook({
      title: 'Clean Code in Practice',
      author: 'Robert C. Martin',
      bookType: 'digital',
      digitalFormat: 'PDF',
      isbn: '978-0-13-235088-4',
    });

    // Lookup with unhyphenated clean ISBN
    const found1 = repo.findWorkByIsbn('9780132350884');
    assert.ok(found1);
    assert.strictEqual(found1.id, book.id);

    // Lookup with spaced ISBN
    const found2 = repo.findWorkByIsbn('978 0 13 235088 4');
    assert.ok(found2);
    assert.strictEqual(found2.id, book.id);
  });

  it('verifies storage health of an existing accessible file as "available"', () => {
    const tempFile = path.join(os.tmpdir(), `existing-file-${Date.now()}.pdf`);
    fs.writeFileSync(tempFile, 'Sample content for size verification', 'utf8');
    tempFiles.push(tempFile);

    const book = repo.addBook({
      title: 'الصحة التخزينية للملفات',
      author: 'أمين المكتبة',
      bookType: 'digital',
      digitalFormat: 'PDF',
      filePath: tempFile,
    });

    const health = repo.verifyFileHealth(book.id);
    assert.ok(health);
    assert.strictEqual(health.status, 'available');
    assert.strictEqual(health.exists, true);
    assert.strictEqual(health.fileSizeBytes, fs.statSync(tempFile).size);
    assert.ok(health.lastVerified);
  });

  it('verifies storage health of a removed or moved file as "missing"', () => {
    const ghostFile = path.join(os.tmpdir(), `ghost-missing-${Date.now()}.epub`);

    const book = repo.addBook({
      title: 'كتاب مفقود على القرص',
      author: 'مجهول',
      bookType: 'digital',
      digitalFormat: 'EPUB',
      filePath: ghostFile,
    });

    const health = repo.verifyFileHealth(book.id);
    assert.ok(health);
    assert.strictEqual(health.status, 'missing');
    assert.strictEqual(health.exists, false);
  });

  it('verifies all digital files across the library and generates an aggregated health summary', () => {
    // 1 available file
    const tempFile = path.join(os.tmpdir(), `batch-available-${Date.now()}.pdf`);
    fs.writeFileSync(tempFile, 'Batch available file', 'utf8');
    tempFiles.push(tempFile);

    repo.addBook({
      title: 'كتاب متاح',
      author: 'مؤلف أول',
      bookType: 'digital',
      filePath: tempFile,
    });

    // 1 missing file
    repo.addBook({
      title: 'كتاب غير موجود',
      author: 'مؤلف ثان',
      bookType: 'digital',
      filePath: path.join(os.tmpdir(), `batch-missing-${Date.now()}.pdf`),
    });

    const summary = repo.verifyAllDigitalFiles();
    assert.strictEqual(summary.totalDigitalWorks, 2);
    assert.strictEqual(summary.availableFiles, 1);
    assert.strictEqual(summary.missingFiles, 1);
    assert.strictEqual(summary.items.length, 2);
  });
});
