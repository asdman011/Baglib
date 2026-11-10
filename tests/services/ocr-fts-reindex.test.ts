import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { ContentFtsRepository } from '../../src/main/database/repositories/content-fts.repository';
import {
  applyStoredCorrections,
  applyWordCorrection,
  type OcrWordCorrectionsMap,
} from '../../src/shared/ocr-suspects';
import type { OcrPageResult } from '../../src/shared/types/ocr';
import type { IndexedBookPage } from '../../src/shared/types/full-text-search';

describe('KEY-292 OCR Word Corrections Full-Text Search Integration', () => {
  let db: Database.Database;
  let repo: ContentFtsRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new ContentFtsRepository(db);

    // Seed dummy work, edition, and source rows
    db.exec(`
      INSERT OR IGNORE INTO work_type (id, name, icon) VALUES ('wt-book', 'كتاب', 'book');
      INSERT INTO work (id, work_type_id, title) VALUES
        ('work-ocr-arabic', 'wt-book', 'تفسير المعوذتين — ابن تيمية'),
        ('work-second-book', 'wt-book', 'كتاب ثانٍ للاختبار');

      INSERT INTO edition (id, work_id, label) VALUES
        ('edition-ocr-arabic', 'work-ocr-arabic', 'الطبعة الأولى');

      INSERT INTO source (id, edition_id, source_type, status, added_at) VALUES
        ('source-ocr-scan-1', 'edition-ocr-arabic', 'digital', 'active', '2026-11-10T00:00:00.000Z');

      INSERT INTO file_source_detail (source_id, file_path, file_format, is_managed) VALUES
        ('source-ocr-scan-1', 'tests/real-files/pdf/ar/scanned-image-only/scan.pdf', 'PDF', 1);
    `);
  });

  const sampleOcrPage1: OcrPageResult = {
    pageNumber: 1,
    text: 'وكان شهد بدراء وهو أحد النفر الذين نصروا الدين',
    lines: [
      {
        text: 'وكان شهد بدراء وهو أحد النفر الذين نصروا الدين',
        bbox: { x: 50, y: 100, width: 400, height: 30 },
        words: [
          { text: 'وكان', bbox: { x: 400, y: 100, width: 40, height: 30 }, confidence: 0.95 },
          { text: 'شهد', bbox: { x: 350, y: 100, width: 40, height: 30 }, confidence: 0.95 },
          { text: 'بدراء', bbox: { x: 300, y: 100, width: 45, height: 30 }, confidence: 0.42 }, // misrecognized word
          { text: 'وهو', bbox: { x: 250, y: 100, width: 30, height: 30 }, confidence: 0.95 },
          { text: 'أحد', bbox: { x: 210, y: 100, width: 30, height: 30 }, confidence: 0.92 },
          { text: 'النفر', bbox: { x: 160, y: 100, width: 40, height: 30 }, confidence: 0.90 },
          { text: 'الذين', bbox: { x: 110, y: 100, width: 40, height: 30 }, confidence: 0.94 },
          { text: 'نصروا', bbox: { x: 60, y: 100, width: 40, height: 30 }, confidence: 0.88 },
          { text: 'الدين', bbox: { x: 10, y: 100, width: 40, height: 30 }, confidence: 0.96 },
        ],
      },
    ],
    words: [
      { text: 'وكان', bbox: { x: 400, y: 100, width: 40, height: 30 }, confidence: 0.95 },
      { text: 'شهد', bbox: { x: 350, y: 100, width: 40, height: 30 }, confidence: 0.95 },
      { text: 'بدراء', bbox: { x: 300, y: 100, width: 45, height: 30 }, confidence: 0.42 },
      { text: 'وهو', bbox: { x: 250, y: 100, width: 30, height: 30 }, confidence: 0.95 },
      { text: 'أحد', bbox: { x: 210, y: 100, width: 30, height: 30 }, confidence: 0.92 },
      { text: 'النفر', bbox: { x: 160, y: 100, width: 40, height: 30 }, confidence: 0.90 },
      { text: 'الذين', bbox: { x: 110, y: 100, width: 40, height: 30 }, confidence: 0.94 },
      { text: 'نصروا', bbox: { x: 60, y: 100, width: 40, height: 30 }, confidence: 0.88 },
      { text: 'الدين', bbox: { x: 10, y: 100, width: 40, height: 30 }, confidence: 0.96 },
    ],
    width: 600,
    height: 900,
    engine: 'ocrmypdf',
    durationMs: 120,
  };

  describe('1. Per-page FTS re-indexing without whole-book invalidation', () => {
    it('indexes initial pages, then updates only the targeted page', () => {
      const initialPages: IndexedBookPage[] = [
        { pageNumber: 1, content: sampleOcrPage1.text, locationCfiOrPage: 'page-1', chapterTitle: 'Page 1' },
        { pageNumber: 2, content: 'فصل في بيان فضائل الاستعاذة ومعانيها العظيمة', locationCfiOrPage: 'page-2', chapterTitle: 'Page 2' },
        { pageNumber: 3, content: 'خاتمة في تحقيق المسائل والرد على الشبهات', locationCfiOrPage: 'page-3', chapterTitle: 'Page 3' },
      ];

      repo.indexBook('work-ocr-arabic', initialPages);
      assert.equal(repo.getIndexedPagesCount('work-ocr-arabic'), 3);

      // Verify page 1 initial search matches misrecognized word "بدراء"
      const searchMisrecognized = repo.searchLibrary('بدراء', { bookId: 'work-ocr-arabic' });
      assert.equal(searchMisrecognized.length, 1);
      assert.equal(searchMisrecognized[0].pageNumber, 1);

      // Verify searching for corrected word "بدراً" returns 0
      const searchCorrectedBefore = repo.searchLibrary('بدراً', { bookId: 'work-ocr-arabic' });
      assert.equal(searchCorrectedBefore.length, 0);

      // Re-index only Page 1 with corrected word
      const updatedPage1 = applyWordCorrection(sampleOcrPage1, 2, 'بدراً');
      repo.reindexPage('work-ocr-arabic', {
        pageNumber: 1,
        content: updatedPage1.text,
        locationCfiOrPage: 'page-1',
        chapterTitle: 'Page 1',
      });

      // Total count remains 3 (pages 2 and 3 were NOT deleted or duplicated)
      assert.equal(repo.getIndexedPagesCount('work-ocr-arabic'), 3);

      // Page 2 and Page 3 are still intact and searchable
      const searchPage2 = repo.searchLibrary('الاستعاذة', { bookId: 'work-ocr-arabic' });
      assert.equal(searchPage2.length, 1);
      assert.equal(searchPage2[0].pageNumber, 2);

      const searchPage3 = repo.searchLibrary('الشبهات', { bookId: 'work-ocr-arabic' });
      assert.equal(searchPage3.length, 1);
      assert.equal(searchPage3[0].pageNumber, 3);

      // Page 1 now matches corrected word "بدراً"
      const searchCorrectedAfter = repo.searchLibrary('بدراً', { bookId: 'work-ocr-arabic' });
      assert.equal(searchCorrectedAfter.length, 1);
      assert.equal(searchCorrectedAfter[0].pageNumber, 1);
      assert.ok(searchCorrectedAfter[0].snippet.includes('بدراً'));

      // Misrecognized word "بدراء" no longer matches on page 1
      const searchMisrecognizedAfter = repo.searchLibrary('بدراء', { bookId: 'work-ocr-arabic' });
      assert.equal(searchMisrecognizedAfter.length, 0);
    });

    it('preserves existing chapter_title and location_cfi_or_page when reindexing if omitted', () => {
      repo.indexBook('work-ocr-arabic', [
        { pageNumber: 5, content: 'نص قديم', locationCfiOrPage: 'cfi-loc-5', chapterTitle: 'باب الفوائد' },
      ]);

      repo.reindexPage('work-ocr-arabic', {
        pageNumber: 5,
        content: 'نص جديد محدث تماماً',
      });

      const page = repo.getPageContent('work-ocr-arabic', 5);
      assert.ok(page);
      assert.equal(page.content, 'نص جديد محدث تماماً');
      assert.equal(page.locationCfiOrPage, 'cfi-loc-5');
      assert.equal(page.chapterTitle, 'باب الفوائد');
    });

    it('can delete a single page without affecting other pages', () => {
      repo.indexBook('work-ocr-arabic', [
        { pageNumber: 1, content: 'صفحة أولى' },
        { pageNumber: 2, content: 'صفحة ثانية' },
      ]);
      assert.equal(repo.getIndexedPagesCount('work-ocr-arabic'), 2);

      repo.deletePage('work-ocr-arabic', 1);
      assert.equal(repo.getIndexedPagesCount('work-ocr-arabic'), 1);
      assert.equal(repo.getPageContent('work-ocr-arabic', 1), null);
      assert.ok(repo.getPageContent('work-ocr-arabic', 2));
    });
  });

  describe('2. Stale corrections are not applied to full-text search', () => {
    it('applies only valid corrections matching original text & engine; rejects stale ones', () => {
      repo.indexBook('work-ocr-arabic', [
        { pageNumber: 1, content: sampleOcrPage1.text, locationCfiOrPage: 'page-1' },
      ]);

      const corrections: OcrWordCorrectionsMap = {
        // Valid correction: index 2 matches 'بدراء' and engine 'ocrmypdf'
        '2': { original: 'بدراء', corrected: 'بدراً', engine: 'ocrmypdf' },
        // Stale 1: original text mismatch (claims index 4 'أحد' is 'واحد')
        '4': { original: 'غير-مطابق', corrected: 'تصحيح-خاطئ-نص', engine: 'ocrmypdf' },
        // Stale 2: engine mismatch (saved under paddleocr_vl, current engine ocrmypdf)
        '6': { original: 'الذين', corrected: 'تصحيح-خاطئ-محرك', engine: 'paddleocr_vl' },
        // Stale 3: legacy shape string
        '7': 'تصحيح-شكل-قديم',
        // Stale 4: index out of bounds
        '99': { original: 'خارج', corrected: 'تصحيح-خارج-النطاق', engine: 'ocrmypdf' },
      };

      const { patchedResult, appliedCount, staleCorrections } = applyStoredCorrections(
        sampleOcrPage1,
        corrections,
        'ocrmypdf'
      );

      assert.equal(appliedCount, 1);
      assert.equal(staleCorrections.length, 4);

      // Re-index FTS with patched result
      repo.reindexPage('work-ocr-arabic', {
        pageNumber: 1,
        content: patchedResult.text,
        locationCfiOrPage: 'page-1',
      });

      // Valid correction IS found
      const searchValid = repo.searchLibrary('بدراً', { bookId: 'work-ocr-arabic' });
      assert.equal(searchValid.length, 1);
      assert.equal(searchValid[0].pageNumber, 1);

      // Stale corrections are NOT found in FTS
      assert.equal(repo.searchLibrary('تصحيح-خاطئ-نص', { bookId: 'work-ocr-arabic' }).length, 0);
      assert.equal(repo.searchLibrary('تصحيح-خاطئ-محرك', { bookId: 'work-ocr-arabic' }).length, 0);
      assert.equal(repo.searchLibrary('تصحيح-شكل-قديم', { bookId: 'work-ocr-arabic' }).length, 0);
      assert.equal(repo.searchLibrary('تصحيح-خارج-النطاق', { bookId: 'work-ocr-arabic' }).length, 0);

      // Original words of stale corrections remain intact in FTS
      assert.equal(repo.searchLibrary('أحد', { bookId: 'work-ocr-arabic' }).length, 1);
      assert.equal(repo.searchLibrary('الذين', { bookId: 'work-ocr-arabic' }).length, 1);
    });
  });

  describe('3. Discarding corrections restores original indexing', () => {
    it('restores original word in FTS when correction is discarded', () => {
      // 1. Initial index with misrecognized OCR text
      repo.indexBook('work-ocr-arabic', [
        { pageNumber: 1, content: sampleOcrPage1.text, locationCfiOrPage: 'page-1' },
      ]);

      // 2. User corrects word 2: 'بدراء' -> 'بدراً'
      const correctedPage = applyWordCorrection(sampleOcrPage1, 2, 'بدراً');
      repo.reindexPage('work-ocr-arabic', {
        pageNumber: 1,
        content: correctedPage.text,
        locationCfiOrPage: 'page-1',
      });

      assert.equal(repo.searchLibrary('بدراً', { bookId: 'work-ocr-arabic' }).length, 1);
      assert.equal(repo.searchLibrary('بدراء', { bookId: 'work-ocr-arabic' }).length, 0);

      // 3. User discards correction: restores original text 'بدراء'
      const discardedPage = applyWordCorrection(correctedPage, 2, 'بدراء');
      repo.reindexPage('work-ocr-arabic', {
        pageNumber: 1,
        content: discardedPage.text,
        locationCfiOrPage: 'page-1',
      });

      // Corrected word no longer matches
      assert.equal(repo.searchLibrary('بدراً', { bookId: 'work-ocr-arabic' }).length, 0);

      // Original misrecognized word matches again
      const searchRestored = repo.searchLibrary('بدراء', { bookId: 'work-ocr-arabic' });
      assert.equal(searchRestored.length, 1);
      assert.equal(searchRestored[0].pageNumber, 1);
      assert.ok(searchRestored[0].snippet.includes('بدراء'));
    });
  });

  describe('4. Arabic normalization is used for lookup only; stored content is canonical', () => {
    it('stores fully vowelled Arabic canonical text in content column while normalizing for index', () => {
      const canonicalVowelledText = 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ الرَّحْمَٰنِ الرَّحِيمِ';

      repo.indexBook('work-ocr-arabic', [
        { pageNumber: 1, content: canonicalVowelledText, locationCfiOrPage: 'page-1' },
      ]);

      // Stored content is strictly canonical and retains Tashkeel/Harakat
      const retrieved = repo.getPageContent('work-ocr-arabic', 1);
      assert.ok(retrieved);
      assert.equal(retrieved.content, canonicalVowelledText);

      // Direct row query from virtual table to ensure content column has Tashkeel
      const rawRow = db.prepare(`
        SELECT content, normalized_content
        FROM book_content_fts
        WHERE book_id = 'work-ocr-arabic' AND page_number = 1
      `).get() as { content: string; normalized_content: string };

      assert.equal(rawRow.content, canonicalVowelledText);
      // Normalized content must be stripped of Tashkeel
      assert.ok(!rawRow.normalized_content.includes('\u064e')); // no fatha
      assert.ok(!rawRow.normalized_content.includes('\u0650')); // no kasra
      assert.ok(!rawRow.normalized_content.includes('\u064f')); // no damma

      // Unvowelled search query matches
      const searchPlain = repo.searchLibrary('الحمد لله رب العالمين');
      assert.equal(searchPlain.length, 1);
      assert.equal(searchPlain[0].pageNumber, 1);
      // Returned snippet highlights matching text while preserving canonical Tashkeel
      assert.ok(searchPlain[0].snippet.includes('<mark>الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ</mark>'));

      // Vowelled search query matches
      const searchVowelled = repo.searchLibrary('الرَّحْمَٰنِ');
      assert.equal(searchVowelled.length, 1);
      assert.equal(searchVowelled[0].pageNumber, 1);
    });
  });

  describe('5. Source ID to Work ID resolution in database IPC helper', () => {
    it('correctly associates index when target is passed as source ID', () => {
      // Re-index targeting source ID 'source-ocr-scan-1' instead of work ID
      const targetSourceId = 'source-ocr-scan-1';

      // Re-resolve using the SQL logic from main/ipc/database.ts
      let resolvedWorkId = targetSourceId;
      const workRow = db.prepare('SELECT id FROM work WHERE id = ? LIMIT 1').get(targetSourceId) as { id: string } | undefined;
      if (!workRow?.id) {
        const sourceRow = db.prepare(`
          SELECT e.work_id
          FROM source s
          JOIN edition e ON e.id = s.edition_id
          WHERE s.id = ?
          LIMIT 1
        `).get(targetSourceId) as { work_id: string } | undefined;
        if (sourceRow?.work_id) resolvedWorkId = sourceRow.work_id;
      }

      assert.equal(resolvedWorkId, 'work-ocr-arabic');

      repo.reindexPage(resolvedWorkId, {
        pageNumber: 1,
        content: 'نص مستخرج عبر معرف المصدر',
        locationCfiOrPage: 'page-1',
      });

      assert.equal(repo.getIndexedPagesCount('work-ocr-arabic'), 1);
      const searchRes = repo.searchLibrary('معرف المصدر', { bookId: 'work-ocr-arabic' });
      assert.equal(searchRes.length, 1);
      assert.equal(searchRes[0].bookId, 'work-ocr-arabic');
    });
  });
});
