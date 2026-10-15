import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { textIsbnScannerService } from '../../../src/main/services/metadata/text-isbn-scanner.service';
import { EmbeddedMetadataExtractor } from '../../../src/main/services/metadata/embedded-metadata.extractor';
import { BibliographicMetadataService } from '../../../src/main/services/metadata/bibliographic-metadata.service';
import { isValidIsbn10, isValidIsbn13, isValidIsbn } from '../../../src/shared/validators/metadata-validator';

describe('Text ISBN Scanner & Auto-Acquisition Tests (Calibre Extract ISBN Adaptation)', () => {
  describe('1. Regex & Pattern Matching on Raw Text', () => {
    it('extracts standard English ISBN-13 with hyphens', () => {
      const text = 'Published by Prentice Hall. ISBN: 978-0-13-235088-4. All rights reserved.';
      const res = textIsbnScannerService.scanText(text);

      assert.strictEqual(res.isbn, '9780132350884');
      assert.strictEqual(res.isbn13, '9780132350884');
      assert.ok(isValidIsbn13(res.isbn!));
    });

    it('extracts English ISBN-10 and automatically derives valid ISBN-13', () => {
      const text = 'Copyright 2008 by Robert C. Martin. ISBN-10: 0-13-235088-2.';
      const res = textIsbnScannerService.scanText(text);

      assert.strictEqual(res.isbn10, '0132350882');
      assert.strictEqual(res.isbn13, '9780132350884');
      assert.strictEqual(res.isbn, '9780132350884'); // Calibre prioritizes ISBN-13
    });

    it('extracts Arabic labeled ISBN (ردمك) with hyphens', () => {
      const text = 'دار الشروق للنشر والتوزيع - القاهرة. ردمك: 978-977-14-4288-2. حقوق الطبع محفوظة.';
      const res = textIsbnScannerService.scanText(text);

      assert.strictEqual(res.isbn, '9789771442882');
      assert.strictEqual(res.isbn13, '9789771442882');
    });

    it('extracts Arabic ISBN with Eastern Arabic numerals (٠-٩)', () => {
      const text = 'المملكة العربية السعودية، مكتبة الملك فهد الوطنية. ردمك: ٩٧٨-٩٧٧-١٤-٤٢٨٨-٢.';
      const res = textIsbnScannerService.scanText(text);

      assert.strictEqual(res.isbn, '9789771442882');
      assert.strictEqual(res.isbn13, '9789771442882');
    });

    it('unwraps multiline hyphenated ISBN broken across lines in PDF/EPUB text', () => {
      const text = 'Cataloging in Publication Data:\nISBN: 978-\n0-13-235088-4\nPrinted in USA';
      const res = textIsbnScannerService.scanText(text);

      assert.strictEqual(res.isbn, '9780132350884');
    });

    it('unwraps multiline spaced ISBN broken across lines', () => {
      const text = 'Bibliographic details:\nISBN 978 013\n2350884\nFirst edition.';
      const res = textIsbnScannerService.scanText(text);

      assert.strictEqual(res.isbn, '9780132350884');
    });

    it('strips Calibre artifact prefixes "-10 " and "-13 "', () => {
      const text = 'ISBN-10 -10 0-13-235088-2';
      const res = textIsbnScannerService.scanText(text);

      assert.strictEqual(res.isbn10, '0132350882');
      assert.strictEqual(res.isbn13, '9780132350884');
    });

    it('rejects dummy repeating digits (e.g. 0000000000, 1111111111111)', () => {
      const dummyText = 'Serial: 0000000000 and barcode: 1111111111111';
      const res = textIsbnScannerService.scanText(dummyText);

      assert.strictEqual(res.isbn, undefined);
      assert.strictEqual(res.allIsbns.length, 0);
    });

    it('rejects numbers with invalid checksums', () => {
      const invalidText = 'Fake code: 978-0-13-235088-9'; // Check digit 9 is wrong (should be 4)
      const res = textIsbnScannerService.scanText(invalidText);

      assert.strictEqual(res.isbn, undefined);
      assert.strictEqual(res.allIsbns.length, 0);
    });

    it('strips HTML tags with boundaries preventing cross-tag number concatenation', () => {
      // <td>978</td><td>1234567890</td> should not merge into 9781234567890 if separate tags
      const html = '<td><span>ISBN: </span>978-0-13-235088-4</td><div>other text</div>';
      const res = textIsbnScannerService.scanText(html);

      assert.strictEqual(res.isbn, '9780132350884');
    });
  });

  describe('2. Text and HTML File Scanning', () => {
    it('scans a plain text file containing ISBN', async () => {
      const tmpFile = path.join(os.tmpdir(), `test-book-${Date.now()}.txt`);
      try {
        fs.writeFileSync(tmpFile, 'Title: Clean Code\nAuthor: Robert C. Martin\nISBN: 978-0-13-235088-4\n');
        const res = await textIsbnScannerService.scanFile(tmpFile);

        assert.ok(res);
        assert.strictEqual(res.isbn, '9780132350884');
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
    });

    it('scans an HTML file containing Arabic ISBN and title', async () => {
      const tmpFile = path.join(os.tmpdir(), `test-book-${Date.now()}.html`);
      try {
        const html = `<!DOCTYPE html><html><body><h1>مقدمة ابن خلدون</h1><p>الرقم الدولي: 978-977-14-4288-2</p></body></html>`;
        fs.writeFileSync(tmpFile, html, 'utf8');
        const res = await textIsbnScannerService.scanFile(tmpFile);

        assert.ok(res);
        assert.strictEqual(res.isbn, '9789771442882');
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
    });
  });

  describe('3. Automated Discovery Pipeline Integration', () => {
    it('automatically acquires ISBN from text file in offline discovery mode', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-isbn-test-'));
      const tmpFile = path.join(tmpDir, 'The Pragmatic Programmer.txt');
      try {
        fs.writeFileSync(
          tmpFile,
          'The Pragmatic Programmer\nAndrew Hunt, David Thomas\nISBN: 978-0-201-61622-4\nAddison-Wesley, 1999',
          'utf8'
        );

        const bibService = new BibliographicMetadataService([]);
        const discovery = await bibService.discoverBook({
          filePath: tmpFile,
          offlineOnly: true,
        });

        assert.ok(discovery);
        assert.strictEqual(discovery.isbn, '9780201616224');
        assert.strictEqual(discovery.isbn13, '9780201616224');
        assert.strictEqual(discovery.provenance.isbnDiscovered, true);
        assert.strictEqual(discovery.title, 'The Pragmatic Programmer');
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
      }
    });

    it('preserves user or filename ISBN if already validly provided', async () => {
      const bibService = new BibliographicMetadataService([]);
      const discovery = await bibService.discoverBook({
        isbn: '978-0-13-235088-4',
        title: 'Clean Code',
        offlineOnly: true,
      });

      assert.strictEqual(discovery.isbn, '9780132350884');
      assert.strictEqual(discovery.isbn13, '9780132350884');
      assert.strictEqual(discovery.provenance.isbnDiscovered, false); // user provided
    });
  });
});
