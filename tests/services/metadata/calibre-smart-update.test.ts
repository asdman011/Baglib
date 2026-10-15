import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { bibliographicMetadataService } from '../../../src/main/services/metadata/bibliographic-metadata.service';
import { EbookMetadataExtractorService } from '../../../src/main/services/digital/ebook-metadata-extractor.service';
import { EmbeddedMetadataExtractor } from '../../../src/main/services/metadata/embedded-metadata.extractor';
import { isPlaceholderAuthor, isPlaceholderTitle } from '../../../src/shared/validators/metadata-validator';

/**
 * Constructs a synthetic PDF with title and optional author in the Info dictionary.
 */
function makeValidPdf(title: string, author?: string): Buffer {
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  offsets.push(body.length);
  body += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  offsets.push(body.length);
  body += '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  offsets.push(body.length);
  body += '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n';
  offsets.push(body.length);
  body += `4 0 obj\n<< /Title (${title})${author !== undefined ? ` /Author (${author})` : ''} >>\nendobj\n`;
  const xrefOffset = body.length;
  body += 'xref\n0 5\n0000000000 65535 f \n';
  for (const o of offsets) {
    body += String(o).padStart(10, '0') + ' 00000 n \n';
  }
  body += `trailer\n<< /Size 5 /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(body, 'utf8');
}

describe('Calibre-Compatibility & Offline Author Fallback Tests (Bug Reproduction)', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-calibre-test-'));
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // cleanup fallback
    }
  });

  it('reproduces and resolves reported case: author missing from embedded PDF metadata, extracted from filename', async () => {
    // Valid PDF with Title in Info dict, but no /Author key
    const pdf = makeValidPdf('Clean Code');
    const filePath = path.join(tmpDir, 'Clean Code - Robert C. Martin.pdf');
    fs.writeFileSync(filePath, pdf);

    const result = await bibliographicMetadataService.extractOfflineMetadata({
      filePath,
      filename: 'Clean Code - Robert C. Martin.pdf',
    });

    assert.ok(result, 'Expected result from extractOfflineMetadata');
    assert.strictEqual(result.title, 'Clean Code');
    assert.deepStrictEqual(result.authors, ['Robert C. Martin'], 'Author should be identified from filename, not Unknown Author');
  });

  it('preserves filename author when embedded PDF author is generic placeholder like "Unknown" or "Admin"', async () => {
    const pdf = makeValidPdf('Crime and Punishment', 'Unknown');
    const filePath = path.join(tmpDir, 'Crime_and_Punishment_-_Fyodor_Dostoevsky.pdf');
    fs.writeFileSync(filePath, pdf);

    const result = await bibliographicMetadataService.extractOfflineMetadata({
      filePath,
      filename: 'Crime_and_Punishment_-_Fyodor_Dostoevsky.pdf',
    });

    assert.ok(result);
    assert.strictEqual(result.title, 'Crime and Punishment');
    assert.deepStrictEqual(result.authors, ['Fyodor Dostoevsky'], 'Should discard placeholder "Unknown" and use filename author');
  });

  it('preserves filename author when embedded PDF author is software generator like "Adobe InDesign CS6"', async () => {
    const pdf = makeValidPdf('1984', 'Adobe InDesign CS6');
    const filePath = path.join(tmpDir, '[George Orwell] 1984.pdf');
    fs.writeFileSync(filePath, pdf);

    const result = await bibliographicMetadataService.extractOfflineMetadata({
      filePath,
      filename: '[George Orwell] 1984.pdf',
    });

    assert.ok(result);
    assert.strictEqual(result.title, '1984');
    assert.deepStrictEqual(result.authors, ['George Orwell'], 'Should discard generator name and extract bracketed author');
  });

  it('prefers authentic embedded author over filename author when embedded author is valid', async () => {
    const pdf = makeValidPdf('Authentic Title', 'Authentic Embedded Author');
    const filePath = path.join(tmpDir, 'Different Title - Filename Author.pdf');
    fs.writeFileSync(filePath, pdf);


    const result = await bibliographicMetadataService.extractOfflineMetadata({
      filePath,
      filename: 'Different Title - Filename Author.pdf',
    });

    assert.ok(result);
    assert.deepStrictEqual(result.authors, ['Authentic Embedded Author'], 'Authentic embedded author must take precedence');
  });

  it('correctly validates expanded placeholder authors and generators', () => {
    assert.strictEqual(isPlaceholderAuthor('Unknown'), true);
    assert.strictEqual(isPlaceholderAuthor('Unknown Author'), true);
    assert.strictEqual(isPlaceholderAuthor('مؤلف مجهول'), true);
    assert.strictEqual(isPlaceholderAuthor('مؤلف جديد'), true);
    assert.strictEqual(isPlaceholderAuthor('غير معروف'), true);
    assert.strictEqual(isPlaceholderAuthor('بدون مؤلف'), true);
    assert.strictEqual(isPlaceholderAuthor('Admin'), true);
    assert.strictEqual(isPlaceholderAuthor('Administrator'), true);
    assert.strictEqual(isPlaceholderAuthor('User'), true);
    assert.strictEqual(isPlaceholderAuthor('Microsoft Word'), true);
    assert.strictEqual(isPlaceholderAuthor('Adobe InDesign CS6'), true);
    assert.strictEqual(isPlaceholderAuthor('ScanSnap'), true);
    assert.strictEqual(isPlaceholderAuthor('PDFCreator'), true);
    assert.strictEqual(isPlaceholderAuthor('ABBYY FineReader'), true);
    assert.strictEqual(isPlaceholderAuthor('Robert C. Martin'), false);
    assert.strictEqual(isPlaceholderAuthor('نجيب محفوظ'), false);
  });

  it('correctly handles EbookMetadataExtractorService smart fallbacks with placeholder author', async () => {
    const extractor = EbookMetadataExtractorService.getInstance();
    const pdf = makeValidPdf('Clean Code', 'User');
    const filePath = path.join(tmpDir, 'Clean Code - Robert C. Martin.pdf');
    fs.writeFileSync(filePath, pdf);

    const extracted = await extractor.extract(filePath, 'PDF');
    assert.strictEqual(extracted.title, 'Clean Code');
    assert.deepStrictEqual(extracted.authors, ['Robert C. Martin']);
  });
});
