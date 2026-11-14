import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { performance } from 'node:perf_hooks';
import { createTestDatabase } from '../helpers/test-db';
import { ContentFtsRepository } from '../../src/main/database/repositories/content-fts.repository';
import type { IndexedBookPage } from '../../src/shared/types/full-text-search';
import { searchSlashDatasets } from '../../src/renderer/utils/slash-search';
import { cancelSlashJobs, slashLane } from '../../src/main/services/slash-search-jobs';

describe('KEY-355 Large Library FTS Measurement and Responsiveness', () => {
  const db = createTestDatabase();
  const repo = new ContentFtsRepository(db);

  // Setup 200 materials (150 books, 50 lectures), each with 50 pages/cues = 10,000 total indexed documents
  const NUM_BOOKS = 150;
  const NUM_LECTURES = 50;
  const PAGES_PER_WORK = 50;

  const sampleParagraphsAr = [
    'إن طلب العلم فريضة على كل مسلم ومسلمة، والعلماء ورثة الأنبياء في تبليغ الرسالة وهداية البشرية.',
    'التوحيد هو إفراد الله سبحانه وتعالى بالعبادة ونفي الشريك والند عنه في ربوبيته وألوهيته وأسمائه وصفاته.',
    'كان الإمام البخاري رحمه الله يرحل في طلب الحديث النبوي الشريف ويتحرى أصح الروايات وأثبتها.',
    'الصبر ضياء وحصن للمؤمن في مواجهة الشدائد والابتلاءات، ومفتاح للفرج وبلوغ الغايات المحمودة.',
    'الأخلاق الفاضلة ثمرة الإيمان الراسخ وصدق التوجه إلى الله تبارك وتعالى في القول والعمل.',
  ];

  const sampleParagraphsEn = [
    'Knowledge representation and reasoning play a fundamental role in modern computational logic and semantic understanding.',
    'A distributed full-text search engine provides sub-millisecond query evaluation over millions of structured document chunks.',
    'Responsive user interfaces avoid blocking the main event loop by deferring heavy IO and batching synchronous DOM mutations.',
    'Effective information retrieval algorithms combine term frequency inverse document frequency with BM25 ranking metrics.',
    'Natural language processing pipelines utilize morphology analysis and tokenization for cross-lingual index structures.',
  ];

  it('indexes 200 large works (10,000 pages) and measures indexing throughput', () => {
    const t0 = performance.now();

    // Insert work records
    const insertWork = db.prepare(`
      INSERT INTO work (id, work_type_id, title, original_language, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);

    db.transaction(() => {
      for (let i = 1; i <= NUM_BOOKS; i++) {
        insertWork.run(`book-${i}`, 'wt-book', `كتاب التراث والإيمان ${i}`, 'ar');
      }
      for (let j = 1; j <= NUM_LECTURES; j++) {
        insertWork.run(`lecture-${j}`, 'wt-lecture', `محاضرة في علوم الحديث ${j}`, 'ar');
      }
    })();

    // Index pages for books
    for (let i = 1; i <= NUM_BOOKS; i++) {
      const pages: IndexedBookPage[] = [];
      for (let p = 1; p <= PAGES_PER_WORK; p++) {
        const ar = sampleParagraphsAr[(i + p) % sampleParagraphsAr.length];
        const en = sampleParagraphsEn[(i + p) % sampleParagraphsEn.length];
        pages.push({
          pageNumber: p,
          locationCfiOrPage: String(p),
          chapterTitle: `الفصل ${Math.ceil(p / 10)}`,
          content: `${ar} ${en} (صفحة ${p} من كتاب ${i})`,
        });
      }
      repo.indexBook(`book-${i}`, pages);
    }

    // Index transcript cues for lectures
    for (let j = 1; j <= NUM_LECTURES; j++) {
      const cues = [];
      for (let c = 0; c < PAGES_PER_WORK; c++) {
        const ar = sampleParagraphsAr[(j + c) % sampleParagraphsAr.length];
        const seconds = c * 30;
        cues.push({
          start: seconds,
          end: seconds + 28,
          text: `${ar} في المحاضرة رقم ${j} عند التوقيت المحدد.`,
        });
      }
      repo.indexLectureTranscript(`lecture-${j}`, cues);
    }

    const elapsed = performance.now() - t0;
    const totalDocs = repo.getIndexedPagesCount();
    const totalWorks = repo.getIndexedBooksCount();

    assert.equal(totalDocs, 10000, 'Indexed exactly 10,000 pages/cues');
    assert.equal(totalWorks, 200, 'Indexed exactly 200 distinct works');
    console.log(`[KEY-355 Measurement] Indexed 10,000 pages across 200 works in ${elapsed.toFixed(1)}ms (${(totalDocs / (elapsed / 1000)).toFixed(0)} pages/sec)`);
  });

  it('measures FTS query performance with limits and morphology normalization on 10,000 pages', () => {
    const queries = [
      { q: 'التوحيد', name: 'Arabic Single Word' },
      { q: 'طلب العلم', name: 'Arabic Phrase' },
      { q: 'الْعِلْمُ', name: 'Arabic Vowelled Query' },
      { q: 'knowledge', name: 'English Term' },
      { q: 'logic', name: 'English Single Word' },
      { q: 'الصبر*', name: 'Arabic Wildcard Prefix' },
      { q: 'التوحيد AND الشريك', name: 'Boolean AND Query' },
      { q: 'البخاري OR الحديث', name: 'Boolean OR Query' },
    ];

    const measurements: { name: string; query: string; durationMs: number; count: number }[] = [];

    for (const item of queries) {
      const times: number[] = [];
      let count = 0;
      // Warm up
      repo.searchLibrary(item.q, { limit: 8 });

      // Run 5 iterations to get steady benchmark
      for (let iter = 0; iter < 5; iter++) {
        const t0 = performance.now();
        const results = repo.searchLibrary(item.q, { limit: 8 });
        const dur = performance.now() - t0;
        times.push(dur);
        count = results.length;
      }
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      measurements.push({ name: item.name, query: item.q, durationMs: avg, count });
      assert.ok(avg < 15, `Query "${item.q}" must complete within 15ms (actual: ${avg.toFixed(2)}ms)`);
      assert.ok(count > 0, `Query "${item.q}" must return results`);
    }

    console.log('[KEY-355 Measurement] Query Benchmark Results:');
    for (const m of measurements) {
      console.log(`  - ${m.name} ("${m.query}"): ${m.durationMs.toFixed(3)}ms (hits: ${m.count})`);
    }
  });

  it('verifies scoped filtering between books and lecture transcripts', () => {
    const bookResults = repo.searchLibrary('التوحيد', { scope: 'books', limit: 20 });
    assert.ok(bookResults.length > 0);
    for (const res of bookResults) {
      assert.equal(res.workType, 'book');
      assert.ok(res.bookId.startsWith('book-'));
    }

    const lectureResults = repo.searchLibrary('التوحيد', { scope: 'lectures', limit: 20 });
    assert.ok(lectureResults.length > 0);
    for (const res of lectureResults) {
      assert.equal(res.workType, 'lecture');
      assert.ok(res.bookId.startsWith('lecture-'));
    }
  });

  it('groups multi-material results together by material and returns whole sentence quotes', async () => {
    // Test searchSlashDatasets with library content integration
    const books = [
      { id: 'book-1', title: 'كتاب التراث والإيمان 1', workType: 'book' },
      { id: 'book-2', title: 'كتاب التراث والإيمان 2', workType: 'book' },
      { id: 'lecture-1', title: 'محاضرة في علوم الحديث 1', workType: 'lecture' },
    ];

    const results = await searchSlashDatasets({
      scope: null,
      query: 'التوحيد',
      notes: [],
      books,
      limit: 8,
      searchLibraryContent: async (q, opts) => repo.searchLibrary(q, opts),
    });

    assert.ok(results.length > 0);
    assert.ok(results.length <= 8, 'Free search must be bounded by limit 8');

    // Grouping by material: all items from the same material must be contiguous
    const seenMaterials = new Set<string>();
    let currentMid = '';
    for (const res of results) {
      const mid = res.material?.id || res.target;
      if (mid !== currentMid) {
        assert.ok(!seenMaterials.has(mid), `Material ${mid} must not appear discontiguously`);
        seenMaterials.add(mid);
        currentMid = mid;
      }
      if (res.quote) {
        // Must contain whole sentence or paragraph
        assert.match(res.quote, /^> .+\n> \[\[/u);
        assert.ok(res.quote.includes(res.target));
      }
    }
  });

  it('cancels stale searches via slashLane without throwing or stalling', async () => {
    const lane = slashLane();
    let cancelledObserved = false;
    const req1 = lane('req-cancel', async () => {
      await new Promise(r => setTimeout(r, 50));
      return 'done-1';
    });
    cancelSlashJobs('req-cancel');
    try {
      await req1;
    } catch {
      cancelledObserved = true;
    }
    assert.ok(cancelledObserved, 'Cancelled request must abort immediately');

    // Next request on same engine executes promptly
    const req2 = await lane('req-next', async () => 'done-2');
    assert.equal(req2, 'done-2');
  });
});
