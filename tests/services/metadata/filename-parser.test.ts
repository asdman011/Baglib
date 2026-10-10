import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FilenameParser } from '../../../src/main/services/metadata/filename-parser';

describe('FilenameParser Unit Tests', () => {
  it('parses "Clean Code - Robert C. Martin.epub" correctly', () => {
    const res = FilenameParser.parse('Clean Code - Robert C. Martin.epub');
    assert.strictEqual(res.title, 'Clean Code');
    assert.strictEqual(res.titleConfidence >= 0.8, true);
    assert.deepStrictEqual(res.authors, ['Robert C. Martin']);
    assert.strictEqual(res.authorConfidence >= 0.7, true);
    assert.strictEqual(res.language, 'en');
  });

  it('parses "The Pragmatic Programmer (Andrew Hunt, David Thomas).pdf" with multiple authors', () => {
    const res = FilenameParser.parse('The Pragmatic Programmer (Andrew Hunt, David Thomas).pdf');
    assert.strictEqual(res.title, 'The Pragmatic Programmer');
    assert.strictEqual(res.titleConfidence >= 0.8, true);
    assert.deepStrictEqual(res.authors, ['Andrew Hunt', 'David Thomas']);
    assert.strictEqual(res.authorConfidence >= 0.8, true);
  });

  it('parses Arabic filename "اسم الكتاب - اسم المؤلف - دار النشر.epub" with publisher marker', () => {
    const res = FilenameParser.parse('اسم الكتاب - اسم المؤلف - دار النشر.epub');
    assert.strictEqual(res.title, 'اسم الكتاب');
    assert.deepStrictEqual(res.authors, ['اسم المؤلف']);
    assert.strictEqual(res.publisher, 'دار النشر');
    assert.strictEqual(res.publisherConfidence >= 0.8, true);
    assert.strictEqual(res.language, 'ar');
  });

  it('parses English filename with translator, publisher, and year', () => {
    const res = FilenameParser.parse('Book Title - Author - Translated by John Doe - O Reilly - 2022.pdf');
    assert.strictEqual(res.title, 'Book Title');
    assert.deepStrictEqual(res.authors, ['Author']);
    assert.deepStrictEqual(res.translators, ['John Doe']);
    assert.strictEqual(res.translatorConfidence >= 0.9, true);
    assert.strictEqual(res.publicationYear, 2022);
    assert.strictEqual(res.yearConfidence >= 0.8, true);
  });

  it('parses Arabic filename with translator and publisher labels', () => {
    const res = FilenameParser.parse('تاريخ العلوم - جورج سارتون - ترجمة د. أحمد فؤاد - دار المعارف.pdf');
    assert.strictEqual(res.title, 'تاريخ العلوم');
    assert.deepStrictEqual(res.authors, ['جورج سارتون']);
    assert.deepStrictEqual(res.translators, ['د. أحمد فؤاد']);
    assert.strictEqual(res.translatorConfidence >= 0.9, true);
    assert.strictEqual(res.publisher, 'دار المعارف');
    assert.strictEqual(res.language, 'ar');
  });

  it('parses edition indicators in English and Arabic', () => {
    const resEn = FilenameParser.parse('Author Name - Book Title (2nd Edition).epub');
    assert.strictEqual(resEn.edition, '2nd Edition');
    assert.strictEqual(resEn.editionConfidence >= 0.8, true);

    const resAr = FilenameParser.parse('مقدمة ابن خلدون (الطبعة الثانية) - ابن خلدون.pdf');
    assert.strictEqual(resAr.edition, 'الطبعة الثانية');
    assert.strictEqual(resAr.editionConfidence >= 0.8, true);

    const resArShort = FilenameParser.parse('صحيح البخاري - ط2.pdf');
    assert.strictEqual(resArShort.edition, 'ط2');
  });

  it('detects and validates ISBN-13 in filename and strips tracker tags', () => {
    // Valid ISBN-13: 9780132350884 (Clean Code)
    const res = FilenameParser.parse('Clean Code [ISBN 9780132350884] (z-lib.org).pdf');
    assert.strictEqual(res.title, 'Clean Code');
    assert.strictEqual(res.isbn13, '9780132350884');
    assert.strictEqual(res.isbn, '9780132350884');
    assert.strictEqual(res.isbnConfidence, 1.0);
    assert.strictEqual(res.overallConfidence >= 0.9, true);
    assert.strictEqual(res.cleanedFilename.includes('z-lib'), false);
  });

  it('detects and validates ISBN-10 in filename', () => {
    // Valid ISBN-10: 0132350882
    const res = FilenameParser.parse('Clean Code (ISBN 0132350882).pdf');
    assert.strictEqual(res.title, 'Clean Code');
    assert.strictEqual(res.isbn10, '0132350882');
    assert.strictEqual(res.isbnConfidence, 1.0);
  });

  it('rejects invalid ISBN checksums without assigning 1.0 confidence', () => {
    // Invalid checksum: 9780132350889
    const res = FilenameParser.parse('Clean Code [ISBN 9780132350889].pdf');
    assert.strictEqual(res.isbn, undefined);
    assert.strictEqual(res.isbnConfidence, 0);
  });

  it('preserves non-destructive Arabic diacritics in canonical extracted text', () => {
    const raw = 'الأَدَبُ الكَبِيرُ - ابْنُ المُقَفَّعِ.pdf';
    const res = FilenameParser.parse(raw);
    assert.strictEqual(res.title, 'الأَدَبُ الكَبِيرُ');
    assert.deepStrictEqual(res.authors, ['ابْنُ المُقَفَّعِ']);
  });

  it('handles ambiguous single-word filenames with appropriate low confidence', () => {
    const res = FilenameParser.parse('sample.pdf');
    assert.strictEqual(res.title, 'sample');
    assert.strictEqual(res.titleConfidence <= 0.6, true);
    assert.strictEqual(res.authors.length, 0);
    assert.strictEqual(res.authorConfidence, 0);
  });

  it('handles mixed-language filenames with common separators', () => {
    const res = FilenameParser.parse('تاريخ بغداد - Al-Khatib al-Baghdadi [1997].pdf');
    assert.strictEqual(res.title, 'تاريخ بغداد');
    assert.deepStrictEqual(res.authors, ['Al-Khatib al-Baghdadi']);
    assert.strictEqual(res.publicationYear, 1997);
    assert.strictEqual(res.language, 'mixed');
  });
});
