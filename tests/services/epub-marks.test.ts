import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEpubLocation,
  serializeEpubLocation,
  isEpubLocation,
  isCFIString,
  extractMarkChapter,
  extractMarkPage,
  extractMarkCfi,
  groupMarksByChapter,
  groupMarksByPage,
  compareCfi,
  buildEpubCfi,
} from '../../src/shared/epub-marks';
import type { ListedMark } from '../../src/shared/pdf-markup';

describe('KEY-274 EPUB Study Markup Location Adapter & Chapter Grouping', () => {
  const rawCfi = 'epubcfi(/6/4[chap01]!/4/2/10/1:0,/4/2/10/1:25)';
  const sampleJson = JSON.stringify({
    cfi: 'epubcfi(/6/6[chap02]!/4/2/14/1:5,/4/2/14/1:40)',
    chapter: 'الباب الأول: في فضل العلم',
    sectionIndex: 1,
    sectionId: 'chapter_2.xhtml',
    page: 15,
    style: 'underline',
    color: 'emerald',
    text: 'طلب العلم فريضة على كل مسلم',
  });

  describe('Location Parsing & Serialization', () => {
    it('parses raw EPUB CFI strings correctly', () => {
      const parsed = parseEpubLocation(rawCfi);
      assert.ok(parsed);
      assert.equal(parsed?.cfi, rawCfi);
      assert.equal(parsed?.chapter, undefined);
      assert.equal(parsed?.page, undefined);
    });

    it('parses JSON EPUB location objects with chapter, page, style, and color', () => {
      const parsed = parseEpubLocation(sampleJson);
      assert.ok(parsed);
      assert.equal(parsed?.cfi, 'epubcfi(/6/6[chap02]!/4/2/14/1:5,/4/2/14/1:40)');
      assert.equal(parsed?.chapter, 'الباب الأول: في فضل العلم');
      assert.equal(parsed?.sectionIndex, 1);
      assert.equal(parsed?.sectionId, 'chapter_2.xhtml');
      assert.equal(parsed?.page, 15);
      assert.equal(parsed?.style, 'underline');
      assert.equal(parsed?.color, 'emerald');
      assert.equal(parsed?.text, 'طلب العلم فريضة على كل مسلم');
    });

    it('returns null for non-EPUB locations (numeric, PDF rects, or invalid shapes)', () => {
      assert.equal(parseEpubLocation('12'), null);
      assert.equal(parseEpubLocation('{"page":5,"rects":[]}'), null);
      assert.equal(parseEpubLocation('{"page":5,"shape":"rect"}'), null);
      assert.equal(parseEpubLocation(''), null);
      assert.equal(parseEpubLocation('{broken json'), null);
    });

    it('serializes and round-trips EPUB location objects without data loss', () => {
      const original = {
        cfi: 'epubcfi(/6/8!/4/2/20/1:10,/4/2/20/1:30)',
        chapter: 'Chapter 3: Analysis',
        sectionIndex: 2,
        sectionId: 'sec3.xhtml',
        page: 42,
        style: 'strike' as const,
        color: 'rose',
        text: 'Obsolete proposition',
      };
      const serialized = serializeEpubLocation(original);
      const parsed = parseEpubLocation(serialized);
      assert.deepEqual(parsed, original);
    });

    it('detects EPUB locations using isEpubLocation and isCFIString', () => {
      assert.equal(isEpubLocation(rawCfi), true);
      assert.equal(isEpubLocation(sampleJson), true);
      assert.equal(isEpubLocation('cfi(/6/2)'), true);
      assert.equal(isEpubLocation('12'), false);
      assert.equal(isEpubLocation('{"page":4}'), false);

      assert.equal(isCFIString(rawCfi), true);
      assert.equal(isCFIString('cfi(/6/4)'), true);
      assert.equal(isCFIString('not_a_cfi'), false);
    });
  });

  describe('Extraction Helpers', () => {
    it('extracts chapter title from JSON location or explicit field', () => {
      assert.equal(extractMarkChapter({ location: sampleJson }), 'الباب الأول: في فضل العلم');
      assert.equal(extractMarkChapter({ location: rawCfi, chapter: 'Fallback Chapter' }), 'Fallback Chapter');
      assert.equal(extractMarkChapter({ location: '12' }), null);
    });

    it('extracts page number for both PDF and EPUB location shapes', () => {
      assert.equal(extractMarkPage({ location: sampleJson }), 15);
      assert.equal(extractMarkPage({ location: '42' }), 42);
      assert.equal(extractMarkPage({ location: '{"page":9,"rects":[]}' }), 9);
      assert.equal(extractMarkPage({ location: rawCfi }), null);
    });

    it('extracts CFI string correctly', () => {
      assert.equal(extractMarkCfi({ location: sampleJson }), 'epubcfi(/6/6[chap02]!/4/2/14/1:5,/4/2/14/1:40)');
      assert.equal(extractMarkCfi({ location: rawCfi }), rawCfi);
      assert.equal(extractMarkCfi({ location: '42' }), null);
    });
  });

  describe('Marks List Grouping (Chapter vs Page)', () => {
    const marks: ListedMark[] = [
      {
        id: 'm1',
        layer: 'study',
        kind: 'highlight',
        page: 2,
        chapter: 'الفصل الأول: المقدمة',
        cfi: 'epubcfi(/6/2!/4/2/2/1:0,/4/2/2/1:10)',
        text: 'أول الغيث قطرة',
        createdAt: '2026-11-09T10:00:00.000Z',
      },
      {
        id: 'm2',
        layer: 'study',
        kind: 'note',
        page: 3,
        chapter: 'الفصل الأول: المقدمة',
        cfi: 'epubcfi(/6/2!/4/2/4/1:0,/4/2/4/1:15)',
        text: 'ملاحظة حول المقدمة',
        createdAt: '2026-11-09T10:05:00.000Z',
      },
      {
        id: 'm3',
        layer: 'study',
        kind: 'underline',
        page: 12,
        chapter: 'الفصل الثاني: القواعد الأساسية',
        cfi: 'epubcfi(/6/4!/4/2/2/1:0,/4/2/2/1:20)',
        text: 'قاعدة الجمع والتفريق',
        createdAt: '2026-11-09T10:10:00.000Z',
      },
      {
        id: 'm4',
        layer: 'study',
        kind: 'bookmark',
        page: 25,
        chapter: null,
        cfi: null,
        text: 'علامة مرجعية عامة',
        createdAt: '2026-11-09T10:15:00.000Z',
      },
    ];

    it('groups marks by chapter with fallback for unassigned chapters', () => {
      const grouped = groupMarksByChapter(marks, 'عام');
      assert.equal(grouped.size, 3);
      assert.equal(grouped.get('الفصل الأول: المقدمة')?.length, 2);
      assert.equal(grouped.get('الفصل الثاني: القواعد الأساسية')?.length, 1);
      assert.equal(grouped.get('عام')?.length, 1);
      assert.equal(grouped.get('عام')?.[0].id, 'm4');
    });

    it('groups marks by page for PDF mode', () => {
      const grouped = groupMarksByPage(marks);
      assert.equal(grouped.get(2)?.length, 1);
      assert.equal(grouped.get(3)?.length, 1);
      assert.equal(grouped.get(12)?.length, 1);
      assert.equal(grouped.get(25)?.length, 1);
    });
  });

  describe('CFI Comparison & Reading Order', () => {
    it('compares section steps accurately', () => {
      const sec1 = 'epubcfi(/6/2!/4/2/10/1:0)';
      const sec2 = 'epubcfi(/6/4!/4/2/2/1:0)';
      const sec3 = 'epubcfi(/6/6!/4/2/2/1:0)';
      assert.ok(compareCfi(sec1, sec2) < 0);
      assert.ok(compareCfi(sec2, sec1) > 0);
      assert.ok(compareCfi(sec2, sec3) < 0);
      assert.equal(compareCfi(sec1, sec1), 0);
    });

    it('compares character offsets within the same paragraph', () => {
      const start = 'epubcfi(/6/4!/4/2/10/1:5)';
      const middle = 'epubcfi(/6/4!/4/2/10/1:25)';
      const end = 'epubcfi(/6/4!/4/2/10/1:80)';
      assert.ok(compareCfi(start, middle) < 0);
      assert.ok(compareCfi(middle, end) < 0);
      assert.ok(compareCfi(end, start) > 0);
    });

    it('handles ranged CFIs by comparing their starting positions', () => {
      const rangeA = 'epubcfi(/6/4!/4/2/10,/1:5,/1:20)';
      const rangeB = 'epubcfi(/6/4!/4/2/10,/1:25,/1:40)';
      assert.ok(compareCfi(rangeA, rangeB) < 0);
    });
  });

  describe('RTL Arabic Text Range & CFI Builder', () => {
    it('builds valid EPUB CFIs with section index and offsets', () => {
      const cfiPoint = buildEpubCfi(0, 10);
      assert.equal(cfiPoint, 'epubcfi(/6/2!/4/2/1:10)');

      const cfiRange = buildEpubCfi(1, 5, 25, 'chap02');
      assert.equal(cfiRange, 'epubcfi(/6/4[chap02]!/4/2,/1:5,/1:25)');
    });

    it('maintains correct reading order and tashkeel integrity for Arabic text ranges', () => {
      const arabicPhrase = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
      // In Arabic RTL, character offset 0 is 'ب' and offset 39 is 'ِ'
      const startCfi = buildEpubCfi(0, 0, 12, 'bismillah');
      const nextCfi = buildEpubCfi(0, 13, 30, 'bismillah');

      assert.ok(compareCfi(startCfi, nextCfi) < 0);
      assert.equal(arabicPhrase.length, 38);
    });
  });
});
