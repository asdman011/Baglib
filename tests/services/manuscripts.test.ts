import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { ManuscriptRepository } from '../../src/main/database/repositories/manuscript.repository';
import { deriveManuscriptSnapshot, initialManuscriptSnapshot, renameManuscriptSnapshot } from '../../src/shared/manuscript-snapshot';

const snapshot = (content: string, url = 'quran:hafs:2:255') => JSON.stringify({ id: 'doc', blocks: {
  id: 'page', flavour: 'affine:page', props: { title: { '$blocksuite:internal:text$': true, delta: [{ insert: 'فَصل — Chapter' }] } }, children: [
    { id: 'para', flavour: 'affine:paragraph', props: { text: { '$blocksuite:internal:text$': true, delta: [{ insert: content, attributes: { footnote: { type: 'url', url } } }] } }, children: [] },
  ],
} }, null, 2);
function fixture() {
  const db = new Database(':memory:'); db.pragma('foreign_keys=ON'); runMigrations(db, migrations);
  const repo = new ManuscriptRepository(db);
  const manuscript = repo.create('مَخطوط — Manuscript', 'research');
  const document = repo.createDocument(manuscript.id, 'Chapter');
  return { db, repo, manuscript, document };
}

test('migration029 has exactly the approved fields, indexes and CHECKs', () => {
  const { db } = fixture();
  try {
    const columns = (name: string) => (db.pragma(`table_info(${name})`) as { name: string }[]).map(row => row.name);
    assert.deepEqual(columns('manuscript'), ['id','title','kind','settings_json','created_at','updated_at','deleted_at']);
    assert.deepEqual(columns('manuscript_document'), ['id','manuscript_id','parent_id','title','position','snapshot','plain_text','primary_mode','updated_at','deleted_at']);
    assert.deepEqual(columns('manuscript_link'), ['document_id','target_scheme','target_id','block_id']);
    assert.deepEqual(columns('manuscript_document_fts'), ['document_id','title','plain_text']);
    assert.deepEqual((db.pragma('index_info(idx_manuscript_link_target)') as { name: string }[]).map(row => row.name), ['target_scheme','target_id']);
    assert.throws(() => db.prepare("UPDATE manuscript SET kind='board'").run());
    assert.throws(() => db.prepare("UPDATE manuscript_document SET primary_mode='canvas'").run());
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
});
test('migration applies to a database COPY and preserves previous rows', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-029-'));
  const originalPath = path.join(dir, 'original.db'), copyPath = path.join(dir, 'copy.db');
  const original = new Database(originalPath); runMigrations(original, migrations.filter(m => m.id < 29));
  original.prepare("INSERT INTO work(id,title) VALUES('original-work','الأَصل — Original')").run();
  await original.backup(copyPath); original.close();
  const originalBytes = fs.readFileSync(originalPath);
  const copy = new Database(copyPath); copy.pragma('foreign_keys=ON');
  try {
    runMigrations(copy, migrations);
    assert.equal((copy.prepare("SELECT title FROM work WHERE id='original-work'").get() as { title: string }).title, 'الأَصل — Original');
    assert.deepEqual(copy.pragma('foreign_key_check'), []);
    assert.deepEqual(fs.readFileSync(originalPath), originalBytes);
  } finally { copy.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
test('snapshot round trip is byte exact and stored Arabic remains unchanged', () => {
  const { db, repo, document } = fixture();
  try {
    const source = snapshot('المَخطوطُ يَحتوي عَلى عِلمٍ — English research');
    const saved = repo.save({ id: document.id, snapshot: source });
    assert.equal(saved.snapshot, source); assert.equal(repo.document(document.id).snapshot, source);
    assert.equal(saved.title, 'فَصل — Chapter');
    assert.equal(saved.plain_text, 'فَصل — Chapter\nالمَخطوطُ يَحتوي عَلى عِلمٍ — English research');
    assert.deepEqual(db.prepare('SELECT target_scheme,target_id,block_id FROM manuscript_link WHERE document_id=?').all(document.id), [{ target_scheme: 'quran', target_id: 'hafs:2:255', block_id: 'para' }]);
  } finally { db.close(); }
});
test('ten autosaves write zero versions, one checkpoint writes one and unchanged writes none', () => {
  const { db, repo, document } = fixture();
  try {
    for (let i = 0; i < 10; i++) repo.save({ id: document.id, snapshot: snapshot(`Save ${i}`) });
    assert.equal(repo.history(document.id).length, 0);
    assert.equal(repo.checkpoint(document.id), true); assert.equal(repo.history(document.id).length, 1);
    assert.equal(repo.checkpoint(document.id), false); assert.equal(repo.history(document.id).length, 1);
    repo.save({ id: document.id, snapshot: snapshot('Save 9') });
    assert.equal(repo.checkpoint(document.id), false);
  } finally { db.close(); }
});
test('restoring a version retains unsaved-to-history content and rebuilds derived indexes', () => {
  const { db, repo, document } = fixture();
  try {
    const first = snapshot('الأَصْلُ original', 'note:first');
    repo.save({ id: document.id, snapshot: first, primary_mode: 'edgeless' }); repo.checkpoint(document.id);
    repo.save({ id: document.id, snapshot: snapshot('Changed replacement', 'book:other'), primary_mode: 'page' });
    const result = repo.restoreVersion(document.id, 1);
    assert.equal(result.snapshot, first); assert.equal(result.primary_mode, 'edgeless');
    assert.equal(repo.history(document.id).length, 3);
    assert.equal(repo.history(document.id)[0].restored_from_revision, 1);
    assert.equal(repo.search('original').length, 1); assert.equal(repo.search('replacement').length, 0);
    assert.deepEqual(db.prepare('SELECT target_scheme,target_id FROM manuscript_link').all(), [{ target_scheme: 'note', target_id: 'first' }]);
    assert.equal(repo.checkpoint(document.id), false);
  } finally { db.close(); }
});
test('chapter save rollback preserves snapshot, text, links and FTS after partial failure', () => {
  const { db, repo, document } = fixture();
  try {
    repo.save({ id: document.id, snapshot: snapshot('Original', 'note:first') });
    const before = repo.document(document.id);
    db.exec("CREATE TRIGGER fail_link BEFORE INSERT ON manuscript_link WHEN NEW.target_id='fail' BEGIN SELECT RAISE(ABORT,'fixture-failure'); END;");
    assert.throws(() => repo.save({ id: document.id, snapshot: snapshot('Changed', 'note:fail') }));
    assert.deepEqual(repo.document(document.id), before);
    assert.equal(repo.search('Original').length, 1); assert.equal(repo.search('Changed').length, 0);
    assert.equal((db.prepare('SELECT target_id FROM manuscript_link').get() as { target_id: string }).target_id, 'first');
  } finally { db.close(); }
});
test('nest, reorder and move reject cycles and cross-manuscript parents', () => {
  const { db, repo, manuscript, document } = fixture();
  try {
    const chapter = repo.createDocument(manuscript.id, 'Chapter 2');
    const section = repo.createDocument(manuscript.id, 'Section', chapter.id);
    repo.moveDocument(chapter.id, document.id, 0);
    assert.equal(repo.document(chapter.id).parent_id, document.id);
    assert.throws(() => repo.moveDocument(document.id, section.id, 0));
    assert.throws(() => repo.moveDocument(document.id, document.id, 0));
    const other = repo.create('Other', 'book'), foreign = repo.createDocument(other.id, 'Foreign');
    assert.throws(() => repo.moveDocument(chapter.id, foreign.id, 0));
    assert.throws(() => repo.createDocument(other.id, 'bad', chapter.id));
    repo.moveDocument(chapter.id, null, 0);
    assert.equal(repo.document(chapter.id).position, 0); assert.equal(repo.document(document.id).position, 1);
    assert.equal(repo.document(section.id).parent_id, chapter.id);
    assert.throws(() => repo.moveDocument(chapter.id, null, -1));
  } finally { db.close(); }
});
test('manuscript trash/restore preserves independently trashed chapters, exact snapshots and history', () => {
  const { db, repo, manuscript, document } = fixture();
  try {
    const child = repo.createDocument(manuscript.id, 'Child', document.id);
    const original = snapshot('كتاب library'); repo.save({ id: document.id, snapshot: original }); repo.checkpoint(document.id);
    repo.trashDocument(child.id); repo.trashDocument(child.id); repo.trash(manuscript.id);
    assert.equal(repo.list().length, 0); assert.equal(repo.list(true).length, 1); assert.equal(repo.search('library').length, 0);
    assert.throws(() => repo.save({ id: document.id, snapshot: original }));
    repo.restore(manuscript.id);
    assert.equal(repo.documents(manuscript.id).length, 1); assert.equal(repo.documents(manuscript.id, true).length, 1);
    repo.restoreDocument(child.id); assert.equal(repo.documents(manuscript.id).length, 2);
    assert.equal(repo.document(document.id).snapshot, original); assert.equal(repo.history(document.id).length, 1);
  } finally { db.close(); }
});
test('parent trash hides descendants from list/search and restore exposes them again', () => {
  const { db, repo, manuscript, document } = fixture();
  try {
    const child = repo.createDocument(manuscript.id, 'Child', document.id);
    repo.save({ id: child.id, snapshot: snapshot('دِرَاسَة experiment') });
    repo.trashDocument(document.id);
    assert.equal(repo.documents(manuscript.id).length, 0); assert.equal(repo.search('experiment').length, 0);
    assert.throws(() => repo.renameDocument(child.id, 'hidden'));
    repo.restoreDocument(document.id);
    assert.equal(repo.search('دراسة').length, 1); assert.equal(repo.documents(manuscript.id).length, 2);
  } finally { db.close(); }
});
test('FTS Arabic tashkeel and orthographic variants plus English, quotes and punctuation', () => {
  const { db, repo, manuscript, document } = fixture();
  try {
    repo.save({ id: document.id, snapshot: snapshot('إِيمَانٌ مَدْرَسَةٌ English research') });
    for (const word of ['ايمان', 'إيمان', 'مدرسة', 'English', 'RESEARCH', '"research"']) assert.equal(repo.search(word, manuscript.id).length, 1, word);
    assert.deepEqual(repo.search('" OR * : -'), []);
    assert.deepEqual(repo.search(''), []);
    assert.equal(repo.search('absent').length, 0);
  } finally { db.close(); }
});
test('document rename keeps title block and FTS aligned without history rows', () => {
  const { db, repo, document } = fixture();
  try {
    repo.renameDocument(document.id, 'جَدِيد — Renamed');
    const saved = repo.document(document.id);
    assert.equal(saved.title, 'جَدِيد — Renamed'); assert.equal(deriveManuscriptSnapshot(saved.snapshot).title, saved.title);
    assert.equal(repo.search('جديد').length, 1); assert.equal(repo.history(document.id).length, 0);
  } finally { db.close(); }
});
test('cascade deletes remove children, links and FTS and retain checkpoint history', () => {
  const { db, repo, manuscript, document } = fixture();
  try {
    repo.save({ id: document.id, snapshot: snapshot('original') }); repo.checkpoint(document.id);
    repo.createDocument(manuscript.id, 'child', document.id);
    assert.throws(() => db.prepare("INSERT INTO manuscript_link VALUES(?,'invalid','x','x')").run(document.id));
    db.prepare('DELETE FROM manuscript WHERE id=?').run(manuscript.id);
    for (const table of ['manuscript_document','manuscript_link','manuscript_document_fts']) assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM entity_version WHERE entity_type='manuscript_document'").get() as { n: number }).n, 1);
  } finally { db.close(); }
});
for (const invalid of [null, '', '{}', '[]', '{', '{"blocks":null}']) test(`invalid snapshot ${String(invalid)} is rejected without writes`, () => {
  const { db, repo, document } = fixture();
  try { assert.throws(() => repo.save({ id: document.id, snapshot: invalid as string })); assert.equal(repo.document(document.id).snapshot, document.snapshot); }
  finally { db.close(); }
});
test('derivation supports all schemes in inline URLs and BagLib block props and deduplicates per block', () => {
  const root = JSON.parse(initialManuscriptSnapshot('doc', 'عنوان'));
  root.blocks.children = ['quran','sunnah','poetry','book','note'].map((scheme, index) => ({
    id: `block-${index}`, flavour: 'baglib:source', props: { scheme, targetId: `source:${index}`, url: `${scheme}:source:${index}`, text: [{ insert: 'نص text' }], verses: [{ sadr: 'صدر', ajuz: 'عجز' }] }, children: [],
  }));
  root.blocks.children.push({ id: 'inline', flavour: 'affine:paragraph', props: { text: { delta: [{ insert: 'citation', attributes: { link: 'https://example.org', footnote: { url: 'note:a' } } }] }, url: 'javascript:bad' }, children: [] });
  const input = JSON.stringify(root), result = deriveManuscriptSnapshot(input);
  assert.equal(result.links.length, 6); assert.equal(result.links[5].target_id, 'a');
  assert.ok(result.plainText.includes('صدر عجز')); assert.equal(JSON.stringify(root), input);
});
test('pure title rename and initial snapshot retain diacritics and mixed text', () => {
  const input = initialManuscriptSnapshot('id', 'أَصل Latin');
  assert.equal(deriveManuscriptSnapshot(input).title, 'أَصل Latin');
  assert.equal(deriveManuscriptSnapshot(renameManuscriptSnapshot(input, 'جَدِيد New')).title, 'جَدِيد New');
});

test('BagLib nested reference props and ordinary inline link attributes are derived', () => {
  const root = JSON.parse(initialManuscriptSnapshot('doc', 'Title'));
  root.blocks.children = [
    { id: 'bag', flavour: 'baglib:ayah', props: { citation: { referenceUrl: 'quran:hafs:1:1' }, target_scheme: 'book', target_id: 'source#page=2' } },
    { id: 'inline', flavour: 'affine:paragraph', props: { text: { delta: [{ insert: 'Read', attributes: { link: 'note:linked' } }] } } },
  ];
  assert.deepEqual(deriveManuscriptSnapshot(JSON.stringify(root)).links, [
    { block_id: 'bag', target_scheme: 'book', target_id: 'source#page=2' },
    { block_id: 'bag', target_scheme: 'quran', target_id: 'hafs:1:1' },
    { block_id: 'inline', target_scheme: 'note', target_id: 'linked' },
  ]);
});
test('checkpoint and restore survive closing and reopening the database', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-manuscript-'));
  const file = path.join(dir, 'copy.db');
  let db = new Database(file);
  try {
    db.pragma('foreign_keys=ON'); runMigrations(db, migrations);
    let repo = new ManuscriptRepository(db);
    const manuscript = repo.create('Restart', 'book'), doc = repo.createDocument(manuscript.id, 'Chapter');
    const original = snapshot('Restart text'); repo.save({ id: doc.id, snapshot: original }); repo.checkpoint(doc.id);
    repo.save({ id: doc.id, snapshot: snapshot('Later text') });
    db.close(); db = new Database(file); db.pragma('foreign_keys=ON'); repo = new ManuscriptRepository(db);
    assert.equal(repo.restoreVersion(doc.id, 1).snapshot, original);
    assert.equal(repo.history(doc.id).length, 3);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('table cell delta text is indexed and nested page title rename stays aligned', () => {
  const page = JSON.parse(initialManuscriptSnapshot('doc', 'Title')).blocks;
  page.children = [{ id: 'table', flavour: 'affine:table', props: { cells: { cell: { text: { '$blocksuite:internal:text$': true, delta: [{ insert: 'Cell text' }] } } } } }];
  const input = JSON.stringify({ blocks: { id: 'outer', flavour: 'affine:surface', props: {}, children: [page] } });
  const derived = deriveManuscriptSnapshot(input);
  assert.equal(derived.plainText, 'Title\nCell text');
  assert.equal(deriveManuscriptSnapshot(renameManuscriptSnapshot(input, 'Renamed')).title, 'Renamed');
});
