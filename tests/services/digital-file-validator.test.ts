import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DigitalFileValidatorService } from '../../src/main/services/digital/digital-file-validator.service';

describe('Digital File Type Detection & Validation Service (Story 6.1 / KEY-78)', () => {
  const validator = DigitalFileValidatorService.getInstance();

  describe('Supported Formats & Configuration', () => {
    it('returns the canonical list of supported formats', () => {
      const formats = validator.getSupportedFormats();
      assert.deepStrictEqual(formats, ['CBZ', 'FB2', 'PDF', 'EPUB', 'MOBI', 'AZW3', 'HTML', 'TXT', 'mp4', 'm4v', 'mov', 'mkv', 'webm', 'mp3', 'm4a', 'ogg', 'opus', 'wav']);
    });

    it('identifies supported extensions and format names correctly', () => {
      assert.strictEqual(validator.isFormatSupported('.pdf'), true);
      assert.strictEqual(validator.isFormatSupported('pdf'), true);
      assert.strictEqual(validator.isFormatSupported('.epub'), true);
      assert.strictEqual(validator.isFormatSupported('.mobi'), true);
      assert.strictEqual(validator.isFormatSupported('.azw3'), true);
      assert.strictEqual(validator.isFormatSupported('.html'), true);
      assert.strictEqual(validator.isFormatSupported('.txt'), true);

      // Unsupported formats
      assert.strictEqual(validator.isFormatSupported('.exe'), false);
      assert.strictEqual(validator.isFormatSupported('.docx'), false);
      assert.strictEqual(validator.isFormatSupported('.wma'), false);
      assert.strictEqual(validator.isFormatSupported('.zip'), false);
    });
  });

  describe('Magic Byte Signature Detection (In-Memory Buffers)', () => {
    it('validates authentic PDF documents by %PDF- magic bytes', () => {
      const pdfHeader = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
      const result = validator.validateBuffer(pdfHeader, 'clean-code.pdf');

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.format, 'PDF');
      assert.strictEqual(result.mimeType, 'application/pdf');
      assert.strictEqual(result.signatureDetected?.startsWith('%PDF-1.7'), true);
      assert.strictEqual(result.errorCode, undefined);
    });

    it('validates authentic EPUB containers by PK zip header and mimetype entry', () => {
      // Create minimal EPUB header buffer: PK\x03\x04 + metadata + mimetypeapplication/epub+zip
      const epubHeader = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]), // PK\x03\x04
        Buffer.alloc(26), // ZIP local file header padding
        Buffer.from('mimetypeapplication/epub+zip'),
      ]);

      const result = validator.validateBuffer(epubHeader, 'sample-book.epub');
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.format, 'EPUB');
      assert.strictEqual(result.mimeType, 'application/epub+zip');
      assert.strictEqual(result.signatureDetected?.includes('EPUB'), true);
    });

    it('validates authentic MOBI files by PalmDOC BOOKMOBI signature at offset 60', () => {
      // 68 bytes header with BOOK at offset 60 and MOBI at offset 64
      const mobiHeader = Buffer.alloc(128);
      mobiHeader.write('BOOK', 60, 4, 'latin1');
      mobiHeader.write('MOBI', 64, 4, 'latin1');

      const result = validator.validateBuffer(mobiHeader, 'sample-novel.mobi');
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.format, 'MOBI');
      assert.strictEqual(result.mimeType, 'application/x-mobipocket-ebook');
      assert.strictEqual(result.signatureDetected?.includes('BOOKMOBI'), true);
    });

    it('validates AZW3 (KF8) files by PalmDOC BOOKMOBI header and .azw3 extension', () => {
      const azw3Header = Buffer.alloc(128);
      azw3Header.write('BOOK', 60, 4, 'latin1');
      azw3Header.write('MOBI', 64, 4, 'latin1');
      azw3Header.write('KF8', 80, 3, 'latin1');

      const result = validator.validateBuffer(azw3Header, 'kindle-guide.azw3');
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.format, 'AZW3');
      assert.strictEqual(result.mimeType, 'application/vnd.amazon.ebook');
    });

    it('validates HTML documents and extracts page title hint', () => {
      const htmlContent = Buffer.from(
        '<!DOCTYPE html><html lang="ar" dir="rtl"><head><title>كتاب بغداد التاريخي</title></head><body><h1>الفصل الأول</h1></body></html>',
        'utf-8'
      );

      const result = validator.validateBuffer(htmlContent, 'chapter1.html');
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.format, 'HTML');
      assert.strictEqual(result.mimeType, 'text/html');
      assert.strictEqual(result.metadataHint?.title, 'كتاب بغداد التاريخي');
    });

    it('validates Plain Text (.txt) files in UTF-8 and rejects binary data named .txt', () => {
      const validText = Buffer.from('هذا نص تجريبي باللغة العربية والانجليزية.\nThis is plain text.', 'utf-8');
      const textResult = validator.validateBuffer(validText, 'notes.txt');
      assert.strictEqual(textResult.isValid, true);
      assert.strictEqual(textResult.format, 'TXT');
      assert.strictEqual(textResult.mimeType, 'text/plain');

      // Binary payload renamed to .txt
      const binaryDisguised = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x00, 0x00]);
      const binaryResult = validator.validateBuffer(binaryDisguised, 'fake.txt');
      assert.strictEqual(binaryResult.isValid, false);
      assert.strictEqual(binaryResult.errorCode, 'CORRUPTED_FILE');
    });
  });

  describe('Rejection of Corrupt, Empty, and Unsupported Files', () => {
    it('fails early when encountering a zero-byte empty buffer or file', () => {
      const emptyBuffer = Buffer.alloc(0);
      const result = validator.validateBuffer(emptyBuffer, 'empty.pdf');

      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.errorCode, 'EMPTY_FILE');
      assert.strictEqual(result.fileSizeBytes, 0);
      assert.strictEqual(result.error, result.errorCode);
    });

    it('rejects unsupported extensions (e.g. .exe, .zip, .docx)', () => {
      const dummyExe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
      const result = validator.validateBuffer(dummyExe, 'setup.exe');

      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.errorCode, 'UNSUPPORTED_FORMAT');
      assert.strictEqual(result.error, result.errorCode);
    });

    it('detects signature mismatch when extension does not match file contents', () => {
      // HTML text disguised as a .pdf file
      const htmlDisguisedAsPdf = Buffer.from('<!DOCTYPE html><html><body>Not a PDF!</body></html>');
      const result = validator.validateBuffer(htmlDisguisedAsPdf, 'spoofed.pdf');

      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.errorCode, 'SIGNATURE_MISMATCH');
      assert.strictEqual(result.error, result.errorCode);
    });

    it('detects corrupted headers for supported format extensions', () => {
      // Random bytes with .epub extension
      const corruptEpub = Buffer.from('SOME_RANDOM_TEXT_NOT_A_ZIP');
      const result = validator.validateBuffer(corruptEpub, 'damaged.epub');

      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.errorCode, 'CORRUPTED_FILE');
      assert.strictEqual(result.error, result.errorCode);
    });
  });

  describe('Filesystem Inspection (Local Files on Disk)', () => {
    it('accurately validates the real sample PDF in the workspace', async () => {
      const samplePdfPath = path.resolve(
        __dirname,
        '../../docs/31-10-2020-084952101 Essays That Will Change The Way You Think - Brianna Wiest.pdf'
      );

      if (fs.existsSync(samplePdfPath)) {
        const result = await validator.validateFile(samplePdfPath);
        assert.strictEqual(result.isValid, true);
        assert.strictEqual(result.format, 'PDF');
        assert.strictEqual(result.mimeType, 'application/pdf');
        assert.strictEqual(result.fileSizeBytes > 1000000, true);
        assert.strictEqual(result.signatureDetected?.startsWith('%PDF-1.4'), true);
      }
    });

    it('fails with FILE_NOT_FOUND when file does not exist on disk', async () => {
      const result = await validator.validateFile('D:/Ammar/NonExistentFile123.pdf');
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.errorCode, 'FILE_NOT_FOUND');
      assert.strictEqual(result.error, result.errorCode);
    });

    it('fails with EMPTY_FILE when reading a 0-byte file from disk', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-val-test-'));
      const emptyFile = path.join(tempDir, 'zero-length.epub');
      fs.writeFileSync(emptyFile, Buffer.alloc(0));

      try {
        const result = await validator.validateFile(emptyFile);
        assert.strictEqual(result.isValid, false);
        assert.strictEqual(result.errorCode, 'EMPTY_FILE');
        assert.strictEqual(result.fileSizeBytes, 0);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('batch validates an array of file paths with aggregated summary', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-val-batch-'));
      const goodPdf = path.join(tempDir, 'valid.pdf');
      const badPdf = path.join(tempDir, 'corrupt.pdf');
      const emptyTxt = path.join(tempDir, 'empty.txt');

      fs.writeFileSync(goodPdf, Buffer.from('%PDF-1.5\n%Header\n'));
      fs.writeFileSync(badPdf, Buffer.from('Not a PDF at all'));
      fs.writeFileSync(emptyTxt, Buffer.alloc(0));

      try {
        const summary = await validator.validateFiles([goodPdf, badPdf, emptyTxt]);
        assert.strictEqual(summary.totalFiles, 3);
        assert.strictEqual(summary.validFiles, 1);
        assert.strictEqual(summary.invalidFiles, 2);
        assert.strictEqual(summary.results[0].isValid, true);
        assert.strictEqual(summary.results[1].isValid, false);
        assert.strictEqual(summary.results[1].errorCode, 'CORRUPTED_FILE');
        assert.strictEqual(summary.results[2].isValid, false);
        assert.strictEqual(summary.results[2].errorCode, 'EMPTY_FILE');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
