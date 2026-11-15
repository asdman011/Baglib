import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { sourceMarkdownAst, sourceHtmlAst } from '../../research-editor/app/src/blocks/exporters';
import { emptySourceProps, type ResearchSourceKind } from '../../src/shared/research-editor-sources';
import { createResearchSourceSearch } from '../../src/renderer/components/research/source-search';
import { initialManuscriptSnapshot, deriveManuscriptSnapshot } from '../../src/shared/manuscript-snapshot';
import { ManuscriptRepository } from '../../src/main/database/repositories/manuscript.repository';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import type { BookItem } from '../../src/shared/types/work';

const kinds: ResearchSourceKind[] = ['ayah', 'hadith', 'verse', 'book-quote'];
const urls = ['quran:hafs:2:255-257','sunnah:bukhari:1:1','poetry:ashaar:10:0:3','book:work@source#p=2'];
const props = (i = 0) => ({ ...emptySourceProps(), url: urls[i], label: 'مَرجع — Source <&>', text: 'نَصٌّ أصلي Mixed <script>\nSecond line', grade: i === 1 ? 'صحيح' : '', verses: i === 2 ? [{ sadr: 'صدر أول', ajuz: 'عجز أول' }, { sadr: 'صدر ثان', ajuz: '' }] : [] });
for (const [i, kind] of kinds.entries()) {
  test(kind + ' Markdown AST retains canonical source and link', () => {
    const ast = JSON.stringify(sourceMarkdownAst(kind, props(i)));
    assert.ok(ast.includes(urls[i]));
    assert.ok(ast.includes(kind === 'verse' ? 'صدر أول  ***  عجز أول' : 'نَصٌّ أصلي'));
    assert.ok(ast.includes('مَرجع — Source'));
    if (kind === 'hadith') assert.ok(ast.includes('صحيح'));
  });
  test(kind + ' HTML AST uses text nodes and RTL, poetry keeps two cells per bayt', () => {
    const ast = sourceHtmlAst(kind, props(i));
    const encoded = JSON.stringify(ast);
    assert.ok(encoded.includes('"dir":"rtl"'));
    assert.ok(encoded.includes(urls[i]));
    if (kind === 'verse') {
      assert.equal((encoded.match(/"tagName":"tr"/gu) || []).length, 2);
      assert.equal((encoded.match(/"tagName":"td"/gu) || []).length, 4);
    } else {
      assert.ok(encoded.includes('"type":"text","value":'));
      assert.ok(encoded.includes('<script>'));
      assert.ok(!encoded.includes('"type":"raw"'));
    }
  });
}
function snapshot(id = 'doc') {
  const root = JSON.parse(initialManuscriptSnapshot(id, 'بحث Mixed'));
  root.blocks.children[1].children = kinds.map((kind, i) => ({ type: 'block', id: 'b' + i, flavour: 'baglib:' + kind, version: 1, props: props(i), children: [] }));
  return root;
}
test('four block props derive four exact manuscript references and canonical poetry text', () => {
  const root = snapshot(), saved = JSON.stringify(root), result = deriveManuscriptSnapshot(saved);
  assert.equal(result.links.length, 4);
  assert.deepEqual(result.links.map(l => l.target_id), urls.map(u => u.slice(u.indexOf(':') + 1)));
  assert.ok(result.plainText.includes('صدر أول عجز أول\nصدر ثان'));
  assert.equal(JSON.stringify(root), saved);
});
test('save/reload/removal rebuild manuscript_link transactionally with one row per block', () => {
  const db = new Database(':memory:'); db.pragma('foreign_keys=ON'); runMigrations(db, migrations);
  try {
    const repo = new ManuscriptRepository(db), manuscript = repo.create('بحث', 'research'), doc = repo.createDocument(manuscript.id, 'Chapter');
    const root = snapshot(doc.id);
    const saved = repo.save({ id: doc.id, snapshot: JSON.stringify(root) });
    assert.equal(saved.snapshot, JSON.stringify(root));
    assert.equal((db.prepare('SELECT * FROM manuscript_link WHERE document_id=?').all(doc.id)).length, 4);
    root.blocks.children[1].children.splice(1, 1);
    repo.save({ id: doc.id, snapshot: JSON.stringify(root) });
    assert.equal((db.prepare('SELECT * FROM manuscript_link WHERE document_id=?').all(doc.id)).length, 3);
    assert.equal(db.prepare("SELECT * FROM manuscript_link WHERE block_id='b1'").get(), undefined);
  } finally { db.close(); }
});
const make = (api: unknown, books: BookItem[] = []) => createResearchSourceSearch(api as Window['electronAPI'], () => books, async () => {}, id => id);
test('Quran search requests eight hits and bounds an overproducing IPC response', async () => {
  let sent: Record<string, unknown> = {};
  const api = { quran: { readerCatalog: async () => ({ ok: true, data: { sources: [{ kind: 'script', profile: 'hafs', id: 'script' }] } }), searchAyahs: async (query: Record<string, unknown>) => { sent = query; return { ok: true, data: Array.from({ length: 100 }, (_, i) => ({ surah: 2, ayah: i + 1, text: 'نَصٌّ' })) }; } } };
  const hits = await make(api).search('ayah', 'الله', 're366-a');
  assert.equal(hits.length, 8); assert.equal(sent.limit, 8); assert.equal(sent.requestId, 're366-a'); assert.equal(sent.text, 'الله'); assert.equal(hits[0].props.text, 'نَصٌّ');
});
test('Arabic-digit Quran range reads every page and excludes markers', async () => {
  const froms: number[] = [];
  const api = { quran: { readerCatalog: async () => ({ ok: true, data: { sources: [{ kind: 'script', profile: 'hafs', id: 'script' }] } }), read: async ({ from }: { from: number }) => {
    froms.push(from); return { ok: true, data: { next: from < 257 ? from + 1 : null, ayahs: [{ number: from, words: [{ text: 'نَصٌّ' + from, marker: false }, { text: '۞', marker: true }] }] } };
  } } };
  const hits = await make(api).search('ayah', '٢:٢٥٥-٢٥٧', 're366-b');
  assert.deepEqual(froms, [255,256,257]); assert.equal(hits[0].props.url, urls[0]); assert.equal(hits[0].props.text, 'نَصٌّ255\nنَصٌّ256\nنَصٌّ257');
});
test('cancel forwards real cancellation and rejects a late response', async () => {
  let resolve!: (value: unknown) => void; const cancelled: string[] = [];
  const api = { sunnah: { search: () => new Promise(done => { resolve = done; }) }, cancelSlashSearch: async (id: string) => { cancelled.push(id); } };
  const service = make(api), pending = service.search('hadith', 'الأعمال', 're366-c');
  await service.cancel('re366-c');
  resolve({ ok: true, data: [{}] });
  assert.deepEqual(await pending, []); assert.deepEqual(cancelled, ['re366-c']);
});
test('hadith keeps full isnad/matn and grade, limits response to eight', async () => {
  const hit = { chapter: { collection: 'bukhari', number: 1 }, hadith: { id: 'id', number: '1', text: { ar: { full: 'حدثنا Mixed إنما الأعمال', matn: 'الأعمال' } }, grade: { ar: 'صحيح', en: 'Sahih' } } };
  const hits = await make({ sunnah: { search: async () => ({ ok: true, data: Array(20).fill(hit) }) } }).search('hadith','الأعمال','re366-d');
  assert.equal(hits.length,8); assert.equal(hits[0].props.text, hit.hadith.text.ar.full); assert.equal(hits[0].props.grade,'صحيح');
});
test('poetry passage retains multiple ordered halves and odd final sadr', async () => {
  const api = { poetry: { search: async () => ({ ok: true, data: { items: [{ id: 10, title: 'قصيدة', poetName: 'شاعر', layoutType: 'bayt', match: { from: 1 } }] } }), detail: async () => ({ ok: true, data: { verses_json: JSON.stringify(['ص1','ع1','ص2','ع2','ص3']) } }) } };
  const hits = await make(api).search('verse','قصيدة','re366-e');
  assert.deepEqual(hits[0].props.verses, [{sadr:'ص1',ajuz:'ع1'},{sadr:'ص2',ajuz:'ع2'},{sadr:'ص3',ajuz:''}]);
  assert.equal(hits[0].props.url,'poetry:ashaar:10:0:4');
});
test('library quote fetches exact canonical page and Work/Edition/Source identity', async () => {
  const book = { id: 'work', editionId: 'edition', sourceId: 'source', title: 'كتاب', author: '' } as BookItem;
  const api = { searchLibraryFullText: async () => [{bookId:'work',pageNumber:2,snippet:'wrong highlight'}], getPageContent: async () => ({content:'نَصٌّ أصلي Arabic Mixed'}) };
  const hits = await make(api,[book]).search('book-quote','أصلي','re366-f');
  assert.equal(hits[0].props.text,'نَصٌّ أصلي Arabic Mixed'); assert.equal(hits[0].props.url, urls[3]); assert.equal(hits[0].props.editionId,'edition'); assert.equal(hits[0].props.sourceId,'source');
});
test('invalid IDs, short queries and oversized Quran ranges do not start corpus searches', async () => {
  const search = make({});
  await assert.rejects(search.search('ayah','test','bad id'));
  assert.deepEqual(await search.search('ayah','ا','re366-short'),[]);
});

test('library searches use bounded cancellable book-only IPC', async () => {
  let options: unknown;
  const api = { searchLibraryFullText: async (_query: string, value: unknown) => { options = value; return []; } };
  assert.deepEqual(await make(api).search('book-quote','Library','re366-bounds'),[]);
  assert.deepEqual(options,{scope:'books',limit:8,requestId:'re366-bounds'});
});
test('cancelling a canonical page read discards its late text', async () => {
  let resolve!: (value: unknown) => void;
  let reading!: () => void;
  const started = new Promise<void>(done => { reading = done; });
  const book = { id:'work',title:'Book',author:'' } as BookItem;
  const api = { searchLibraryFullText: async () => [{bookId:'work',pageNumber:1}], getPageContent: () => { reading(); return new Promise(done => { resolve=done; }); }, cancelSlashSearch: async () => {} };
  const search=make(api,[book]), job=search.search('book-quote','original','re366-page');
  await started; await search.cancel('re366-page'); resolve({content:'original canonical page'});
  assert.deepEqual(await job,[]);
});
test('oversized Quran ranges are rejected before any page read', async () => {
  const api={quran:{readerCatalog:async()=>({ok:true,data:{sources:[{id:'hafs',kind:'script',profile:'hafs'}]}}),read:async()=>{throw Error('must not read');}}};
  assert.deepEqual(await make(api).search('ayah','2:1-52','re366-range-limit'),[]);
});
