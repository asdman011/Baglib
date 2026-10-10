import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidIsbn10,
  isValidIsbn13,
  isValidIsbn,
  isValidDoi,
  isValidIssn,
  isValidUrl,
  validateWorkMetadata,
} from '../../src/shared/validators/metadata-validator';

describe('Metadata Validator Unit Tests (Task 4.3)', () => {
  describe('ISBN Verification', () => {
    it('validates authentic ISBN-10 numbers with Modulo 11 checksum', () => {
      assert.strictEqual(isValidIsbn10('0-306-40615-2'), true);
      assert.strictEqual(isValidIsbn10('0306406152'), true);
      // Valid ISBN-10 ending with 'X'
      assert.strictEqual(isValidIsbn10('0-8044-2957-X'), true);
      assert.strictEqual(isValidIsbn10('080442957X'), true);

      // Corrupted ISBN-10
      assert.strictEqual(isValidIsbn10('0-306-40615-9'), false);
      assert.strictEqual(isValidIsbn10('12345'), false);
    });

    it('validates authentic ISBN-13 numbers with Modulo 10 checksum', () => {
      assert.strictEqual(isValidIsbn13('978-0-306-40615-7'), true);
      assert.strictEqual(isValidIsbn13('9780306406157'), true);
      assert.strictEqual(isValidIsbn13('978-1-86197-876-9'), true);

      // Corrupted ISBN-13
      assert.strictEqual(isValidIsbn13('978-0-306-40615-0'), false);
      assert.strictEqual(isValidIsbn13('978030640615'), false);
    });

    it('validates polymorphic isValidIsbn correctly for both formats', () => {
      assert.strictEqual(isValidIsbn('0-306-40615-2'), true);
      assert.strictEqual(isValidIsbn('978-0-306-40615-7'), true);
      assert.strictEqual(isValidIsbn('invalid-isbn'), false);
    });
  });

  describe('DOI Verification', () => {
    it('accurately checks standard DOI formats', () => {
      assert.strictEqual(isValidDoi('10.1000/182'), true);
      assert.strictEqual(isValidDoi('10.1145/3344556.778899'), true);
      assert.strictEqual(isValidDoi('10.1038/s41586-020-2649-2'), true);

      // Invalid DOIs
      assert.strictEqual(isValidDoi('https://doi.org'), false);
      assert.strictEqual(isValidDoi('11.1000/182'), false);
      assert.strictEqual(isValidDoi('not-a-doi'), false);
    });
  });

  describe('ISSN Verification', () => {
    it('validates ISSN format and checksum', () => {
      assert.strictEqual(isValidIssn('2049-3630'), true);
      assert.strictEqual(isValidIssn('0258-1094'), true);
      assert.strictEqual(isValidIssn('0378-5955'), true);

      // Corrupted ISSN
      assert.strictEqual(isValidIssn('2049-3639'), false);
      assert.strictEqual(isValidIssn('12345'), false);
    });
  });

  describe('URL Verification', () => {
    it('validates web and recording URLs', () => {
      assert.strictEqual(isValidUrl('https://archive.org/details/lecture-1'), true);
      assert.strictEqual(isValidUrl('http://example.com/audio.mp3'), true);
      assert.strictEqual(isValidUrl('not_a_valid_url'), false);
      assert.strictEqual(isValidUrl('ftp://example.com'), false);
    });
  });

  describe('Type-Aware validateWorkMetadata', () => {
    it('catches empty title as a mandatory error', () => {
      const res = validateWorkMetadata({ title: '' });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.some((e) => e.field === 'title'));
    });

    it('validates Book with invalid ISBN and warns for future year', () => {
      const res = validateWorkMetadata({
        title: 'كتاب التوحيد',
        workType: 'book',
        isbn: '999-bad-isbn',
        publicationYear: 2099,
      });

      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.some((e) => e.field === 'isbn'));
      assert.ok(res.warnings.some((w) => w.field === 'publicationYear'));
    });

    it('validates Research Paper with invalid DOI', () => {
      const res = validateWorkMetadata({
        title: 'Neural Machine Translation for Arabic',
        workType: 'research_paper',
        doi: 'invalid_doi_format',
      });

      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.some((e) => e.field === 'doi'));
    });

    it('validates Lecture with negative duration or malformed URL', () => {
      const res = validateWorkMetadata({
        title: 'محاضرة في علوم القرآن',
        workType: 'lecture',
        durationMinutes: -15,
        recordingUrl: 'invalid-url',
      });

      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.some((e) => e.field === 'durationMinutes'));
      assert.ok(res.errors.some((e) => e.field === 'recordingUrl'));
    });

    it('validates Periodical with invalid ISSN', () => {
      const res = validateWorkMetadata({
        title: 'مجلة التراث',
        workType: 'periodical',
        issn: '9999-9999',
      });

      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.some((e) => e.field === 'issn'));
    });

    it('passes for a valid complete work across all types', () => {
      const validPaper = validateWorkMetadata({
        title: 'Deep Learning Advances',
        workType: 'research_paper',
        doi: '10.1000/182',
        journalName: 'IEEE Transactions',
        publicationYear: 2024,
      });

      assert.strictEqual(validPaper.isValid, true);
      assert.strictEqual(validPaper.errors.length, 0);
    });
  });
});
