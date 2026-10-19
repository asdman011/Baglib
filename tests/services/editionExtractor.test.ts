import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractEditionFromEbook,
  extractEditionInfo,
  parseEditionFromFilename,
  parseEditionFromText,
  normalizeArabicText,
  scorePageForImprint,
  validateIsbn10Checksum,
  validateIsbn13Checksum,
  extractAndValidateIsbn,
} from '../../src/main/services/import/editionExtractor';

describe('Edition Extraction Engine Unit Tests', () => {
  it('Scenario 1: English Filename: extracts 3rd Edition from filename', async () => {
    const filename = 'Introduction to Algorithms (3rd ed.) - Cormen.pdf';
    const result = await extractEditionFromEbook(filename);

    assert.strictEqual(result.editionLabel, '3rd Edition');
    assert.strictEqual(result.editionNumber, 3);
    assert.strictEqual(result.source, 'filename');
    assert.strictEqual(result.isRevised, false);
    assert.ok(result.confidence >= 0.7);
  });

  it('Scenario 2: English Copyright Page: extracts 4th Revised and Expanded Edition from multiline front-matter', async () => {
    const copyrightPageText = [
      'Copyright © 2021',
      'Fourth Revised and Expanded Edition',
      'Published by Oxford University Press',
    ].join('\n');

    const result = await extractEditionFromEbook(copyrightPageText);

    assert.strictEqual(result.editionLabel, '4th Revised and Expanded Edition');
    assert.strictEqual(result.editionNumber, 4);
    assert.strictEqual(result.isRevised, true);
    assert.strictEqual(result.source, 'front_matter');
    assert.ok(result.confidence >= 0.7);
  });

  it('Scenario 3: Arabic Imprint Page (Eastern Numerals & Qualifiers): extracts الطبعة الثانية (مزيدة ومنقحة)', async () => {
    const imprintPageText = [
      'جميع الحقوق محفوظة',
      'الطبعة الثانية مزيدة ومنقحة',
      '١٤٤٢ هـ - ٢٠٢١ م',
    ].join('\n');

    const result = await extractEditionFromEbook(imprintPageText);

    assert.strictEqual(result.editionLabel, 'الطبعة الثانية (مزيدة ومنقحة)');
    assert.strictEqual(result.editionNumber, 2);
    assert.strictEqual(result.isRevised, true);
    assert.strictEqual(result.source, 'front_matter');
    assert.ok(result.confidence >= 0.7);
  });

  it('Scenario 4: Arabic Abbreviated Filename: extracts الطبعة الأولى from ط1', async () => {
    const filename = 'البداية والنهاية - ابن كثير - ط هجر - ط1.pdf';
    const result = await extractEditionFromEbook(filename);

    assert.strictEqual(result.editionLabel, 'الطبعة الأولى');
    assert.strictEqual(result.editionNumber, 1);
    assert.strictEqual(result.source, 'filename');
    assert.strictEqual(result.isRevised, false);
    assert.ok(result.confidence >= 0.7);
  });

  it('Scenario 5: False Positive Guard (Volume vs. Edition): rejects volumes as editions', async () => {
    const filename = 'مجموع الفتاوى - المجلد الثالث - الجزء الأول.pdf';
    const result = await extractEditionFromEbook(filename);

    assert.strictEqual(result.editionLabel, null);
    assert.strictEqual(result.editionNumber, null);
    assert.strictEqual(result.source, 'none');
  });

  it('Scenario 6: False Positive Guard (Printing vs. Edition): extracts primary edition without confusing printing', async () => {
    const text = 'First Edition, Seventh Printing 2019';
    const result = await extractEditionFromEbook(text);

    assert.strictEqual(result.editionLabel, '1st Edition');
    assert.strictEqual(result.editionNumber, 1);
    assert.strictEqual(result.source, 'front_matter');
  });

  it('Additional: Standalone Revised Edition (without number)', async () => {
    const text = 'Revised and Updated Edition';
    const result = parseEditionFromText(text);

    assert.strictEqual(result.editionLabel, 'Revised and Updated Edition');
    assert.strictEqual(result.editionNumber, null);
    assert.strictEqual(result.isRevised, true);
  });

  it('Additional: Arabic Numeric and Eastern Digits in Imprint Line', async () => {
    const text = 'الطبعة: ٣';
    const result = parseEditionFromText(text);

    assert.strictEqual(result.editionLabel, 'الطبعة الثالثة');
    assert.strictEqual(result.editionNumber, 3);
  });

  it('Additional: Ignores body text citations referencing other works', async () => {
    const citation = 'انظر شرح صحيح مسلم، ط دار إحياء التراث، ج 4، ص 120 لبيان المسألة كاملة بالتفصيل.';
    const result = parseEditionFromText(citation);

    assert.strictEqual(result.editionLabel, null);
  });

  it('Additional: extractEditionInfo alias behaves identically', async () => {
    const res = await extractEditionInfo('Clean Code (2nd Edition).epub');
    assert.strictEqual(res.editionLabel, '2nd Edition');
    assert.strictEqual(res.editionNumber, 2);
  });

  // -------------------------------------------------------------------------
  // 5-Vector Edition Intelligence Engine Tests
  // -------------------------------------------------------------------------

  describe('Vector 1: Unicode Normalization & Visual-Order Reversal', () => {
    it('Scenario 1.1: Visual-Order Reversed Arabic PDF text (ىلوألا ةعبطلا -> الطبعة الأولى)', async () => {
      // Many PDF libraries emit RTL Arabic characters visually from left to right:
      // "الطبعة الأولى" becomes "ىلوألا ةعبطلا"
      const reversedLine = 'ىلوألا ةعبطلا - دار السلام';
      const result = parseEditionFromText(reversedLine);

      assert.ok(result.editionLabel?.includes('الطبعة الأولى'));
      assert.strictEqual(result.editionNumber, 1);
      assert.strictEqual(result.vectorUsed, 'reversed_rtl_imprint');
      assert.ok(result.confidence >= 0.9);
    });

    it('Scenario 1.2: Arabic Presentation Forms-B normalization (NFKC)', () => {
      // Unicode Arabic Presentation Forms (\uFE8D = Alef, \uFEDF = Lam, \uFEC3 = Tah, \uFE92 = Beh...)
      const presFormStr = '\uFE8D\uFEDF\uFEC3\uFE92\uFECC\uFE94 \uFE8D\uFEF7\uFEED\uFEDF\uFEF0'; // "الطبعة الأولى" in Presentation Forms
      const normalized = normalizeArabicText(presFormStr);
      assert.strictEqual(normalized, 'الطبعة الأولى');
    });

    it('Scenario 1.3: Tashkeel and Tatweel stripping', () => {
      const text = 'الطَّبْعَةُ الأُولَىٰ المَزِيْدَةُ';
      const normalized = normalizeArabicText(text);
      assert.ok(!/[\u064B-\u065F\u0670]/.test(normalized));
      assert.strictEqual(normalized, 'الطبعة الأولى المزيدة');
    });
  });

  describe('Vector 2: Imprint & CIP Page Locator', () => {
    it('Scenario 2.1: Scores English copyright and CIP page with high weight', () => {
      const pageText = [
        'Copyright © 2024 by Baglib Inc.',
        'All rights reserved.',
        'Library of Congress Cataloging-in-Publication Data',
        'ISBN 978-0-8050-8195-4',
        'Published by Farrar, Straus and Giroux',
        'First Edition',
      ].join('\n');

      const score = scorePageForImprint(pageText);
      // 6 anchor matches * 3 points = 18 points
      assert.ok(score >= 15);
    });

    it('Scenario 2.2: Scores Arabic imprint page (صفحة الحقوق / بطاقة فهرسة)', () => {
      const arabicImprintText = [
        'جميع الحقوق محفوظة',
        'حقوق الطبع والنشر محفوظة للناشر',
        'بطاقة فهرسة مكتبة الملك فهد الوطنية',
        'رقم الإيداع: ١٤٤٢/١٢٣٤',
        'ردمك: 978-977-8502-12-3',
        'الطبعة الأولى',
      ].join('\n');

      const score = scorePageForImprint(arabicImprintText);
      assert.ok(score >= 12);
    });
  });

  describe('Vector 3: Mathematical ISBN-10 & ISBN-13 Checksum Validation', () => {
    it('Scenario 3.1: Validates legitimate ISBN-10 checksum (Fukuyama: 0-02-910975-2)', () => {
      assert.strictEqual(validateIsbn10Checksum('0-02-910975-2'), true);
      assert.strictEqual(validateIsbn10Checksum('0029109752'), true);
    });

    it('Scenario 3.2: Rejects corrupted or invalid ISBN-10 checksums', () => {
      assert.strictEqual(validateIsbn10Checksum('0-02-910975-9'), false); // bad check digit
      assert.strictEqual(validateIsbn10Checksum('1234567890'), false);
    });

    it('Scenario 3.3: Validates legitimate ISBN-13 checksums (Deutscher: 978-0-8050-8195-4, Cowan: 9781804293058)', () => {
      assert.strictEqual(validateIsbn13Checksum('978-0-8050-8195-4'), true);
      assert.strictEqual(validateIsbn13Checksum('9781804293058'), true);
    });

    it('Scenario 3.4: Rejects corrupted ISBN-13 checksums or random telephone numbers', () => {
      assert.strictEqual(validateIsbn13Checksum('978-0-8050-8195-9'), false);
      assert.strictEqual(validateIsbn13Checksum('9781234567890'), false);
    });

    it('Scenario 3.5: extractAndValidateIsbn isolates valid ISBN from cluttered text', () => {
      const cluttered = 'Some text... telephone: 0123456789, ISBN 978-0-8050-8195-4, other numbers: 9876543210';
      const extracted = extractAndValidateIsbn(cluttered);
      assert.strictEqual(extracted, '9780805081954');
    });
  });

  describe('Vector 5: Smart Synthesis for Classical Islamic & Academic Works', () => {
    it('Scenario 5.1: Synthesizes explicit edition with Publisher: الطبعة الثانية - دار السلام', () => {
      const text = [
        'حقوق الطبع محفوظة',
        'الطبعة الثانية',
        'الناشر: دار السلام للطباعة والنشر',
      ].join('\n');

      const res = parseEditionFromText(text);
      assert.strictEqual(res.editionLabel, 'الطبعة الثانية - دار السلام للطباعة والنشر');
      assert.strictEqual(res.editionNumber, 2);
      assert.strictEqual(res.extractedPublisher, 'دار السلام للطباعة والنشر');
    });

    it('Scenario 5.2: Synthesizes explicit edition with Publisher and Muhaqqiq', () => {
      const text = [
        'الطبعة الأولى',
        'دار المنهاج للنشر والتوزيع',
        'تحقيق: محمد عوامة',
      ].join('\n');

      const res = parseEditionFromText(text);
      assert.strictEqual(res.editionLabel, 'الطبعة الأولى - دار المنهاج للنشر والتوزيع - تحقيق: محمد عوامة');
      assert.strictEqual(res.editionNumber, 1);
      assert.strictEqual(res.extractedPublisher, 'دار المنهاج للنشر والتوزيع');
    });

    it('Scenario 5.3: Heritage Fallback without explicit ordinal: synthesizes Dar + Muhaqqiq', () => {
      const text = [
        'صحيح البخاري',
        'دار المنهاج بجدة',
        'تحقيق: محمد عوامة',
        'عام ١٤٢٢ هـ',
      ].join('\n');

      const res = parseEditionFromText(text);
      assert.strictEqual(res.editionLabel, 'ط. دار المنهاج بجدة - تحقيق: محمد عوامة');
      assert.strictEqual(res.editionNumber, null);
      assert.strictEqual(res.extractedPublisher, 'دار المنهاج بجدة');
      assert.strictEqual(res.extractedYear, 1422);
      assert.ok(res.confidence >= 0.7);
    });

    it('Scenario 5.4: Heritage Fallback with Dar only: synthesizes ط. دار المعرفة', () => {
      const text = [
        'تاريخ دمشق لابن عساكر',
        'دار المعرفة للطباعة والنشر',
        'بيروت - لبنان',
      ].join('\n');

      const res = parseEditionFromText(text);
      assert.strictEqual(res.editionLabel, 'ط. دار المعرفة للطباعة والنشر');
      assert.strictEqual(res.editionNumber, null);
    });

    it('Scenario 5.5: Heritage Fallback with Muhaqqiq only: synthesizes ط. بتحقيق', () => {
      const text = [
        'كتاب سيبويه',
        'تحقيق: عبد السلام هارون',
      ].join('\n');

      const res = parseEditionFromText(text);
      assert.strictEqual(res.editionLabel, 'ط. بتحقيق: عبد السلام هارون');
    });
  });
});
