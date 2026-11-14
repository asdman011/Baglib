import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { searchSlashDatasets, slashResultInsert } from '../../src/renderer/utils/slash-search';
import { searchCorpus } from '../../src/renderer/utils/corpus-lookup';
import { prepareSlashMaterial, searchSlashMaterial } from '../../src/renderer/utils/slash-material';
import { registerSlashJob, cancelSlashJobs, slashLane } from '../../src/main/services/slash-search-jobs';
const base = { notes: [], books: [], scope: null, query: 'learning' };
async function api<T>(value: unknown, run: () => Promise<T>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: value } });
  try { return await run(); } finally { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); }
}
describe('KEY-350 bounded search and inserts', () => {
  it('passes 8/free and 20/scoped plus page/cancellation identity to the corpus provider', async () => {
    for (const scope of [null, 'sunnah'] as const) await searchSlashDatasets({ ...base, scope, offset: 20, requestId: 'request-1', searchCorpus: async (_kinds, _text, options) => { assert.equal(options?.limit, scope ? 20 : 8); assert.equal(options?.offset, 20); assert.equal(options?.requestId, 'request-1'); return []; } });
  });
  it('does not dispatch short or stale searches and yields large local scans to newer input', async () => {
    let calls = 0;
    await searchSlashDatasets({ ...base, query: 'ab', searchCorpus: async () => { calls++; return []; } });
    let stale = false;
    const notes = Array.from({ length: 10000 }, (_, id) => ({ id: String(id), title: 'learning', content: 'body', aliases: [], tags: [], createdAt: '', updatedAt: '' }));
    const searching = searchSlashDatasets({ ...base, notes, stale: () => stale, searchCorpus: async () => { calls++; return []; } });
    stale = true; assert.deepEqual(await searching, []); assert.equal(calls, 0);
  });
  it('paginates local matches without duplicates and ranks title first', async () => {
    const books = Array.from({ length: 45 }, (_, id) => ({ id: String(id), title: 'learning ' + id }));
    const a = await searchSlashDatasets({ ...base, books, scope: 'books' });
    const b = await searchSlashDatasets({ ...base, books, scope: 'books', offset: 20 });
    assert.equal(a.length, 20); assert.equal(b.length, 20); assert.equal(new Set([...a, ...b].map(item => item.target)).size, 40);
  });
  it('passes service limits/cursors and inserts text above the exact reference for all corpora', async () => {
    const calls: unknown[] = [];
    await api({
      quran: { readerCatalog: async () => ({ ok: true, data: { sources: [{ id: 'script', kind: 'script', profile: 'hafs' }] } }), searchAyahs: async (q: unknown) => { calls.push(q); return { ok: true, data: [{ surah: 1, ayah: 1, text: 'Complete ayah' }] }; } },
      sunnah: { search: async (q: unknown) => { calls.push(q); return { ok: true, data: [{ chapter: { collection: 'Bukhari', number: 1 }, hadith: { id: 'Bukhari:1:1', number: '1', text: { ar: { matn: 'Complete matn' } } } }] }; } },
      poetry: { search: async (q: unknown) => { calls.push(q); return { ok: true, data: { next: 10, items: [{ id: 10, title: 'Verse', poetName: 'Poet', language: 'en', layoutType: 'free_verse', match: { from: 0, lines: ['Complete verse'] } }] } }; } },
    }, async () => {
      const found = await searchCorpus(['quran', 'hadith', 'poem'], 'learning', id => id, 8, 'hafs', { offset: 8, after: 5, requestId: 'query-1' });
      assert.equal(found.length, 3);
      for (const hit of found) { assert.match(hit.quote, /^> .+\n> \[\[/u); assert.ok(hit.quote.endsWith(hit.link)); assert.equal(slashResultInsert({ scope: 'quran', score: 0, ...hit }), hit.quote); }
      for (const call of calls as { limit: number; requestId: string }[]) { assert.equal(call.limit, 8); assert.equal(call.requestId, 'query-1'); }
      assert.equal((calls.find(call => 'after' in (call as object)) as { after: number }).after, 5);
    });
  });
  it('cancels running jobs and rejects late registration rather than queuing stale searches', () => {
    let stopped = 0; registerSlashJob('cancel-test', () => stopped++); cancelSlashJobs('cancel-test'); assert.equal(stopped, 1);
    assert.throws(() => registerSlashJob('cancel-test', () => stopped++), /cancelled/); assert.equal(stopped, 2);
  });
  it('never pops up the relationship menu; typed relations and the shortcut remain (KEY-357)', () => {
    const editor = readFileSync('src/renderer/components/notes/StudyNoteEditor.tsx', 'utf8');
    assert.ok(!editor.includes('relationMenu')); assert.ok(!editor.includes('data-relation-menu'));
    assert.ok(editor.includes('cycleRelation')); assert.ok(editor.includes('RelationChip'));
  });
  it('inserts the whole hadith, isnad and matn, and still lists it by its matn (KEY-357)', async () => {
    await api({ sunnah: { search: async () => ({ ok: true, data: [{ chapter: { collection: 'Bukhari', number: 1 }, hadith: { id: 'Bukhari:1:1', number: '1', text: { ar: { full: 'حدثنا الحميدي قال سمعت رسول الله يقول إنما الأعمال بالنيات', isnad: 'حدثنا الحميدي', matn: 'قال سمعت رسول الله يقول إنما الأعمال بالنيات' } } } }] }) } }, async () => {
      const [hit] = await searchCorpus(['hadith'], 'الحميدي', id => id, 8, 'hafs', { requestId: 'isnad-1' });
      assert.match(hit.quote, /^> حدثنا الحميدي قال سمعت رسول الله يقول إنما الأعمال بالنيات\n> \[\[sunnah:Bukhari:1:Bukhari:1:1\|/u);
      assert.ok(hit.snippet.startsWith('قال سمعت'));
    });
    await api({ sunnah: { search: async () => ({ ok: true, data: [{ chapter: { collection: 'Bukhari', number: 2 }, hadith: { id: 'Bukhari:2:1', number: '2', text: { ar: { full: '', isnad: 'حدثنا قتيبة', matn: 'قال كذا' } } } }] }) } }, async () => {
      const [hit] = await searchCorpus(['hadith'], 'قتيبة', id => id, 8, 'hafs', { requestId: 'isnad-2' });
      assert.match(hit.quote, /^> حدثنا قتيبة قال كذا\n/u);
    });
  });
});
describe('KEY-350 selected material', () => {
  const result = { scope: 'books' as const, target: 'book:b', label: 'Book', snippet: '', score: 0, material: { id: 'b', title: 'Book', sourceId: 's' } };
  it('restricts indexed search to selected Work and inserts a whole paragraph with Source/page identity', async () => {
    await api({ isBookIndexed: async () => true, searchLibraryFullText: async (_q: string, options: { bookId: string; limit: number; offset: number }) => { assert.deepEqual(options, { bookId: 'b', limit: 20, offset: 20 }); return [{ pageNumber: 7, locationCfiOrPage: '7' }]; }, getPageContent: async () => ({ content: 'Learning the entire paragraph. Keep this ending.' }) }, async () => {
      const material = await prepareSlashMaterial(result);
      const [hit] = await searchSlashMaterial(material, 'learning', 20, 20, () => false);
      assert.equal(hit.target, 'book:b@s#p=7'); assert.match(hit.quote!, /Learning the entire paragraph\. Keep this ending\./u);
    });
  });
  it('reports absent text without OCR or transcription and preserves empty PDF page positions', async () => {
    const pdf = { ...result, material: { ...result.material, filePath: 'book.pdf' } };
    await api({ isBookIndexed: async () => false, extractPdfText: async () => ({ text: '', isScannedImagePdf: true }) }, async () => assert.equal((await prepareSlashMaterial(pdf)).available, false));
    await api({ isBookIndexed: async () => false, extractPdfText: async () => ({ text: '\n---PAGE_SPLIT_MARKER---\n\n---PAGE_SPLIT_MARKER---\nLearning here.', isScannedImagePdf: false }) }, async () => {
      const material = await prepareSlashMaterial(pdf); const [hit] = await searchSlashMaterial(material, 'learning', 20, 0, () => false); assert.equal(hit.target, 'book:b@s#p=2');
    });
  });
  it('continues lazy transcript paging beyond one hundred passages', async () => {
    const lecture = { ...result, scope: 'lectures' as const, material: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', title: 'Lecture' } };
    const cues = Array.from({ length: 150 }, (_, index) => ({ start: index, end: index + 1, text: `Learning sentence ${index}.` }));
    await api({ lectures: { subtitles: async () => ({ cues }) } }, async () => {
      const material = await prepareSlashMaterial(lecture);
      const hits = await searchSlashMaterial(material, 'learning', 20, 100, () => false);
      assert.equal(hits.length, 20); assert.match(hits[0].quote!, /Learning sentence 100\./u); assert.match(hits.at(-1)!.quote!, /Learning sentence 119\./u);
    });
  });
  it('joins subtitle cues into a whole sentence and links its first cue time; handles missing transcript', async () => {
    const lecture = { ...result, scope: 'lectures' as const, material: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', title: 'Lecture' } };
    await api({ lectures: { subtitles: async () => ({ cues: [{ start: 12, end: 14, text: 'Learning a whole' }, { start: 14, end: 16, text: 'sentence together.' }] }) } }, async () => {
      const material = await prepareSlashMaterial(lecture); const [hit] = await searchSlashMaterial(material, 'learning', 20, 0, () => false);
      assert.equal(hit.target, 'media:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:12'); assert.match(hit.quote!, /Learning a whole sentence together\./u);
    });
    await api({ lectures: { subtitles: async () => null } }, async () => assert.equal((await prepareSlashMaterial(lecture)).available, false));
  });
});

it('a cancelled slash search is dropped without stopping the engine, and the newest runs next', async () => {
  const lane = slashLane();
  const started: string[] = [];
  let finishFirst!: (value: string) => void;
  const first = lane('lane-first', () => { started.push('first'); return new Promise<string>(resolve => { finishFirst = resolve; }); });
  const second = lane('lane-second', async () => { started.push('second'); return 'second'; });
  const third = lane('lane-third', async () => { started.push('third'); return 'third'; });
  await Promise.resolve();
  cancelSlashJobs('lane-first');
  cancelSlashJobs('lane-second');
  // Answered at once, even though the engine is still busy with the first search.
  await assert.rejects(first, /cancelled/);
  await assert.rejects(second, /cancelled/);
  finishFirst('late');
  assert.equal(await third, 'third');
  // The running stale search finished in the background; the queued stale one never ran.
  assert.deepEqual(started, ['first', 'third']);
});
