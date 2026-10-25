import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import zlib from 'zlib';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { DigitalImportPipelineService } from '../../src/main/services/digital/digital-import-pipeline.service';
import { EbookMetadataExtractorService } from '../../src/main/services/digital/ebook-metadata-extractor.service';

/**
 * Helper to construct an in-memory uncompressed zip archive buffer (EPUB container)
 */
function createZipArchiveBuffer(files: { name: string; content: string | Buffer }[]): Buffer {
  const localHeaders: Buffer[] = [];
  const cdHeaders: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const dataBuf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    const crc = (zlib as any).crc32 ? (zlib as any).crc32(dataBuf) : 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // Local header signature
    lh.writeUInt16LE(20, 4);        // Version needed
    lh.writeUInt16LE(0, 6);         // General purpose bit flag
    lh.writeUInt16LE(0, 8);         // Compression method (0 = stored)
    lh.writeUInt16LE(0, 10);        // Mod time
    lh.writeUInt16LE(0, 12);        // Mod date
    lh.writeUInt32LE(crc, 14);      // CRC-32
    lh.writeUInt32LE(dataBuf.length, 18); // Compressed size
    lh.writeUInt32LE(dataBuf.length, 22); // Uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26); // Filename length
    lh.writeUInt16LE(0, 28);        // Extra field length

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0); // Central directory signature
    cdh.writeUInt16LE(20, 4);         // Version made by
    cdh.writeUInt16LE(20, 6);         // Version needed
    cdh.writeUInt16LE(0, 8);          // Flags
    cdh.writeUInt16LE(0, 10);         // Compression (0 = stored)
    cdh.writeUInt16LE(0, 12);         // Mod time
    cdh.writeUInt16LE(0, 14);         // Mod date
    cdh.writeUInt32LE(crc, 16);       // CRC-32
    cdh.writeUInt32LE(dataBuf.length, 20); // Compressed size
    cdh.writeUInt32LE(dataBuf.length, 24); // Uncompressed size
    cdh.writeUInt16LE(nameBuf.length, 28); // Filename length
    cdh.writeUInt16LE(0, 30);         // Extra field length
    cdh.writeUInt16LE(0, 32);         // File comment length
    cdh.writeUInt16LE(0, 34);         // Disk number start
    cdh.writeUInt16LE(0, 36);         // Internal attributes
    cdh.writeUInt32LE(0, 38);         // External attributes
    cdh.writeUInt32LE(offset, 42);    // Relative offset of local header

    localHeaders.push(lh, nameBuf, dataBuf);
    cdHeaders.push(cdh, nameBuf);
    offset += 30 + nameBuf.length + dataBuf.length;
  }

  const cdBuf = Buffer.concat(cdHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4);          // Disk number
  eocd.writeUInt16LE(0, 6);          // Start disk
  eocd.writeUInt16LE(files.length, 8); // Entries on disk
  eocd.writeUInt16LE(files.length, 10); // Total entries
  eocd.writeUInt32LE(cdBuf.length, 12); // CD size
  eocd.writeUInt32LE(offset, 16);       // CD offset
  eocd.writeUInt16LE(0, 20);          // Comment length

  return Buffer.concat([...localHeaders, cdBuf, eocd]);
}

describe('Digital E-Book Ingestion Pipeline & Metadata Extractor (Story 6.2 / KEY-79)', () => {
  let db: Database.Database;
  let repo: SqliteWorkRepository;
  let pipeline: DigitalImportPipelineService;
  const extractor = EbookMetadataExtractorService.getInstance();
  const tempFilesToClean: string[] = [];

  const samplePdfPath = path.resolve('docs/31-10-2020-084952101 Essays That Will Change The Way You Think - Brianna Wiest.pdf');

  beforeEach(() => {
    db = createTestDatabase();
    db.prepare(`
      INSERT OR IGNORE INTO category (id, name_en, name_ar)
      VALUES ('cat-philosophy', 'Philosophy', 'فلسفة')
    `).run();
    repo = new SqliteWorkRepository(db);
    pipeline = new DigitalImportPipelineService(repo, undefined, undefined, undefined, undefined, async () => ({ coverUrl: 'baglib-asset://rendered-page-1.jpg' }));
  });

  afterEach(() => {
    for (const f of tempFilesToClean) {
      try {
        if (fs.existsSync(f)) {
          fs.unlinkSync(f);
        }
      } catch {
        // ignore cleanup error
      }
    }
    tempFilesToClean.length = 0;
  });

  describe('Embedded Metadata Extractor Service', () => {
    it('extracts Adobe XMP metadata without treating embedded PDF images as covers', async () => {
      assert.strictEqual(fs.existsSync(samplePdfPath), true, 'Sample PDF should exist in docs/');

      const meta = await extractor.extract(samplePdfPath, 'PDF');

      assert.strictEqual(meta.title, '101 Essays That Will Change The Way You Think');
      assert.deepStrictEqual(meta.authors, ['Brianna Wiest']);
      assert.strictEqual(meta.format, 'PDF');
      assert.ok(meta.identifiers?.['mobi-asin']);
      assert.strictEqual(meta.identifiers?.['mobi-asin'], 'B01MYMUGQL');
      assert.equal(meta.coverDataUrl, undefined);
      assert.equal(meta.coverBuffer, undefined);
    });

    it('extracts Dublin Core metadata from valid EPUB archive', async () => {
      const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

      const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Introduction to Algorithms</dc:title>
    <dc:creator>Thomas H. Cormen</dc:creator>
    <dc:creator>Charles E. Leiserson</dc:creator>
    <dc:publisher>MIT Press</dc:publisher>
    <dc:date>2009-07-31</dc:date>
    <dc:language>en</dc:language>
    <dc:identifier id="pub-id">9780262033848</dc:identifier>
    <dc:subject>Computer Science</dc:subject>
    <dc:subject>Algorithms</dc:subject>
  </metadata>
  <manifest></manifest>
  <spine></spine>
</package>`;

      const epubBuffer = createZipArchiveBuffer([
        { name: 'mimetype', content: 'application/epub+zip' },
        { name: 'META-INF/container.xml', content: containerXml },
        { name: 'OEBPS/content.opf', content: contentOpf },
      ]);

      const tempEpub = path.join(os.tmpdir(), `test-book-${Date.now()}.epub`);
      fs.writeFileSync(tempEpub, epubBuffer);
      tempFilesToClean.push(tempEpub);

      const meta = await extractor.extract(tempEpub, 'EPUB');

      assert.strictEqual(meta.title, 'Introduction to Algorithms');
      assert.deepStrictEqual(meta.authors, ['Thomas H. Cormen', 'Charles E. Leiserson']);
      assert.strictEqual(meta.publisher, 'MIT Press');
      assert.strictEqual(meta.publicationYear, 2009);
      assert.strictEqual(meta.isbn, '9780262033848');
      assert.strictEqual(meta.language, 'en');
      assert.ok(meta.tags?.includes('Computer Science'));
      assert.ok(meta.tags?.includes('Algorithms'));
    });

    it('extracts metadata from HTML header and meta tags', async () => {
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Clean Architecture Guide</title>
  <meta name="author" content="Robert C. Martin">
  <meta name="description" content="A craftsman guide to software structure and design.">
  <meta name="keywords" content="Software Architecture, Clean Code">
</head>
<body>
  <h1>Clean Architecture</h1>
</body>
</html>`;

      const tempHtml = path.join(os.tmpdir(), `clean-architecture-${Date.now()}.html`);
      fs.writeFileSync(tempHtml, htmlContent, 'utf8');
      tempFilesToClean.push(tempHtml);

      const meta = await extractor.extract(tempHtml, 'HTML');

      assert.strictEqual(meta.title, 'Clean Architecture Guide');
      assert.deepStrictEqual(meta.authors, ['Robert C. Martin']);
      assert.strictEqual(meta.description, 'A craftsman guide to software structure and design.');
      assert.ok(meta.tags?.includes('Software Architecture'));
    });

    it('falls back gracefully to FilenameParser for plain TXT file', async () => {
      const txtContent = 'Chapter 1: The boy who lived...';
      const tempTxt = path.join(os.tmpdir(), `Harry Potter and the Sorcerer's Stone - J.K. Rowling (1997).txt`);
      fs.writeFileSync(tempTxt, txtContent, 'utf8');
      tempFilesToClean.push(tempTxt);

      const meta = await extractor.extract(tempTxt, 'TXT');

      assert.strictEqual(meta.title, "Harry Potter and the Sorcerer's Stone");
      assert.deepStrictEqual(meta.authors, ['J.K. Rowling']);
      assert.strictEqual(meta.publicationYear, 1997);
    });

    it('rejects generic placeholder titles and uses filename parsing', async () => {
      const htmlContent = `<html><head><title>Untitled</title><meta name="author" content=""></head><body>Body</body></html>`;
      const tempHtml = path.join(os.tmpdir(), `Refactoring - Martin Fowler.html`);
      fs.writeFileSync(tempHtml, htmlContent, 'utf8');
      tempFilesToClean.push(tempHtml);

      const meta = await extractor.extract(tempHtml, 'HTML');

      assert.strictEqual(meta.title, 'Refactoring');
      assert.deepStrictEqual(meta.authors, ['Martin Fowler']);
    });
  });

  describe('Digital Import Pipeline Service (Atomic Ingestion)', () => {
    it('ingests authentic PDF into library with SHA-256 hash and atomic record creation', async () => {
      const fileBuffer = fs.readFileSync(samplePdfPath);
      const expectedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      const importResult = await pipeline.importFile({
        filePath: samplePdfPath,
      });

      assert.strictEqual(importResult.success, true);
      assert.ok(importResult.workId);
      assert.strictEqual(importResult.format, 'PDF');
      assert.strictEqual(importResult.fileHash, expectedHash);
      assert.strictEqual(importResult.extractedMetadata?.title, '101 Essays That Will Change The Way You Think');
      assert.strictEqual(importResult.extractedMetadata?.author, 'Brianna Wiest');

      // Verify atomic database state
      const work = repo.getById(importResult.workId!);
      assert.ok(work);
      assert.strictEqual(work.title, '101 Essays That Will Change The Way You Think');
      assert.strictEqual(work.author, 'Brianna Wiest');
      assert.strictEqual(work.bookType, 'digital');
      assert.strictEqual(work.digitalFormat, 'PDF');
      assert.strictEqual(work.filePath, path.resolve(samplePdfPath));
      assert.strictEqual(work.fileHash, expectedHash);
      assert.strictEqual(work.readingStatus, 'unread');
      assert.equal(work.coverImage, 'baglib-asset://rendered-page-1.jpg');

      // Check file_source_detail table directly
      const fileDetail = db.prepare(`SELECT * FROM file_source_detail WHERE file_hash = ?`).get(expectedHash) as any;
      assert.ok(fileDetail);
      assert.strictEqual(fileDetail.file_hash, expectedHash);
      assert.strictEqual(fileDetail.file_format, 'PDF');
    });

    it('applies custom user overrides for title, author, category, and tags', async () => {
      const importResult = await pipeline.importFile({
        filePath: samplePdfPath,
        customTitle: 'مقال مخصص ومراجع',
        customAuthor: 'كاتب مخصص',
        primaryCategoryId: 'cat-philosophy',
        tags: ['فلسفة', 'تطوير ذات'],
        readingStatus: 'reading',
      });

      assert.strictEqual(importResult.success, true);
      assert.ok(importResult.workId);

      const work = repo.getById(importResult.workId!);
      assert.ok(work);
      assert.strictEqual(work.title, 'مقال مخصص ومراجع');
      assert.strictEqual(work.author, 'كاتب مخصص');
      assert.strictEqual(work.primaryCategory?.id, 'cat-philosophy');
      assert.strictEqual(work.readingStatus, 'reading');
      assert.ok(work.tags?.includes('فلسفة'));
      assert.ok(work.tags?.includes('تطوير ذات'));
    });

    it('rejects non-existent file cleanly without modifying database', async () => {
      const nonExistentPath = path.join(os.tmpdir(), `non-existent-${Date.now()}.pdf`);

      const initialCount = repo.getAllWorks().length;

      const result = await pipeline.importFile({
        filePath: nonExistentPath,
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.errorCode, 'FILE_NOT_FOUND');
      assert.ok(result.error);

      // Verify no works were added
      const afterCount = repo.getAllWorks().length;
      assert.strictEqual(afterCount, initialCount);
    });

    it('rejects corrupt file with invalid magic bytes early before database insertion', async () => {
      const fakePdfContent = 'This is plain text with no PDF magic header';
      const fakePdfPath = path.join(os.tmpdir(), `corrupt-file-${Date.now()}.pdf`);
      fs.writeFileSync(fakePdfPath, fakePdfContent, 'utf8');
      tempFilesToClean.push(fakePdfPath);

      const initialCount = repo.getAllWorks().length;

      const result = await pipeline.importFile({
        filePath: fakePdfPath,
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.errorCode, 'CORRUPTED_FILE');

      // Database remains untouched
      const afterCount = repo.getAllWorks().length;
      assert.strictEqual(afterCount, initialCount);
    });

    it('performs batch import resiliently and aggregates results', async () => {
      // 1 valid txt file
      const validTxt = path.join(os.tmpdir(), `Pragmatic Programmer - Andy Hunt (1999).txt`);
      fs.writeFileSync(validTxt, 'Sample text content', 'utf8');
      tempFilesToClean.push(validTxt);

      // 1 invalid file
      const invalidPath = path.join(os.tmpdir(), `missing-${Date.now()}.epub`);

      const batchSummary = await pipeline.importFiles([
        { filePath: validTxt },
        { filePath: invalidPath },
      ]);

      assert.strictEqual(batchSummary.totalFiles, 2);
      assert.strictEqual(batchSummary.successfulImports, 1);
      assert.strictEqual(batchSummary.failedImports, 1);
      assert.strictEqual(batchSummary.results.length, 2);

      assert.strictEqual(batchSummary.results[0].success, true);
      assert.strictEqual(batchSummary.results[0].fileName, path.basename(validTxt));
      assert.strictEqual(batchSummary.results[1].success, false);
      assert.strictEqual(batchSummary.results[1].errorCode, 'FILE_NOT_FOUND');
    });
  });
});
