import { after, before, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SunnahResearchCorpus } from '../../src/main/services/sunnah/research-corpus';
import { SunnahService } from '../../src/main/services/sunnah/sunnah.service';

const fields = ['book_key', 'Chapter_Number', 'Chapter_Arabic', 'Chapter_English', 'Section_Number', 'Section_Arabic', 'Section_English', 'Hadith_number', 'Arabic_Hadith', 'Arabic_Isnad', 'Arabic_Matn', 'English_Hadith', 'English_Isnad', 'English_Matn', 'Arabic_Comment', 'Arabic_Grade', 'English_Grade', 'Arabic_Tafseel', 'Commentary_Book_Title', 'Commentary_Author', 'Source_Row_Reference', 'Shamela_Volume', 'Shamela_Page', 'Commentary_Shamela_URL', 'Matn_Shamela_URL', 'Tafseel_Match_Method', 'Tafseel_Match_Score', 'Itqan_Narrator_Chain_JSON', 'Itqan_Quran_Root_Links_JSON', 'Itqan_Linked_Ayah_Keys_JSON', 'Itqan_Chain_Calibration_Score', 'Itqan_Weakest_Narrator_Grade', 'Itqan_Corroborating_Hadiths_JSON', 'field_provenance_json', 'source_datasets_json'];
const books = ['Bukhari', 'AbuDaud', 'MuwattaMalik'];
let directory = '';

function baseDatabase(filename: string): Database.Database {
  const db = new Database(filename);
  db.exec(`CREATE TABLE hadiths(id INTEGER PRIMARY KEY,${fields.map(field => `${field} TEXT`).join(',')});
    CREATE TABLE hadith_narrators(hadith_id INTEGER,rijal_id TEXT); CREATE TABLE quran_hadith_root_bridge(hadith_id INTEGER,root_ar TEXT);
    CREATE VIRTUAL TABLE hadiths_fts USING fts5(text);`);
  for (const [index, book] of books.entries()) {
    const row: Record<string, string> = Object.fromEntries(fields.map(field => [field, '']));
    Object.assign(row, { book_key: book, Chapter_Number: '1', Hadith_number: '1', Arabic_Hadith: 'إنما الأعمال بالنيات', Arabic_Matn: 'إنما الأعمال بالنيات', English_Hadith: book === 'MuwattaMalik' ? '' : 'Actions depend on intentions.', Arabic_Grade: book === 'AbuDaud' ? 'صحيح' : '', English_Grade: '', Itqan_Narrator_Chain_JSON: '[]', Itqan_Quran_Root_Links_JSON: '[]', Itqan_Linked_Ayah_Keys_JSON: '[]', Itqan_Corroborating_Hadiths_JSON: '[]', Tafseel_Match_Score: '0', Itqan_Chain_Calibration_Score: '0.5', field_provenance_json: JSON.stringify({ schema_version: 1, fields: [{ source: 'lk:AbuDaud/Chapter1.csv', record: 'row:1', transformation: 'verbatim', fields: { Arabic_Hadith: 'abc' } }, { source: 'base:db', record: 'hadiths.id=2', transformation: 'inherited_upstream_unresolved', upstream: 'unresolved', fields: { Arabic_Tafseel: 'def' } }], missing: ['English_Isnad'] }), source_datasets_json: '["ShathaTm/LK-Hadith-Corpus","quranlab/hadith"]' });
    db.prepare(`INSERT INTO hadiths VALUES (?,${fields.map(() => '?').join(',')})`).run(index + 1, ...fields.map(field => row[field]));
    db.prepare('INSERT INTO hadiths_fts(rowid,text) VALUES (?,?)').run(index + 1, 'انما الاعمال بالنيات');
  }
  return db;
}

function mergedDatabase(filename: string, schema = '1'): void {
  const db = baseDatabase(filename);
  db.exec(`CREATE TABLE merge_metadata(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE source_registry(source_id TEXT PRIMARY KEY,dataset TEXT,revision TEXT,license TEXT,attribution TEXT);
    CREATE TABLE quranlab_records(source_key TEXT,language TEXT,config TEXT,text TEXT,title TEXT,explanation TEXT,attribution_text TEXT);
    CREATE TABLE hadith_crosswalk(crosswalk_id INTEGER PRIMARY KEY,source_key TEXT,collection TEXT,hadith_id INTEGER,decision TEXT,relation TEXT,full_score REAL,english_similarity REAL);
    CREATE TABLE grading_judgments(judgment_id TEXT PRIMARY KEY,hadith_id INTEGER,origin TEXT,dataset TEXT,config TEXT,field_path TEXT,upstream_lineage_json TEXT,grader_raw TEXT,grader_ar TEXT,grader_role TEXT,grader_status TEXT,grade_raw TEXT,grade_raw_alt TEXT,grade_ar TEXT,grade_ar_status TEXT,scope TEXT,review_status TEXT,assessed_part TEXT,wording_similarity REAL,display_policy TEXT,note TEXT);
    CREATE TABLE hadith_grading_summary(hadith_id INTEGER PRIMARY KEY,judgment_count INTEGER,wording_differs INTEGER,opposed INTEGER,unresolved_count INTEGER,display_policy TEXT);
    CREATE VIRTUAL TABLE variant_translation_fts USING fts5(text,tokenize='unicode61');`);
  for (const [key, value] of [['schema_kind', 'baglib-sunnah-merged'], ['merge_schema_version', schema], ['quranlab_revision', 'rev']]) db.prepare('INSERT INTO merge_metadata VALUES (?,?)').run(key, value);
  const judgment = db.prepare('INSERT INTO grading_judgments VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  judgment.run('a', 2, 'quranlab_fawazahmed0', 'quranlab/hadith', 'abudawud-ar', 'grades[0]', '{"upstream":["fawazahmed0/hadith-api"]}', 'Al-Albani', 'الألباني', 'scholar', 'verified', 'Sahih', null, 'صحيح', 'glossary', 'hadith', 'glossary_reviewed', 'whole_record', 1, 'details', null);
  judgment.run('b', 2, 'quranlab_fawazahmed0', 'quranlab/hadith', 'abudawud-ar', 'grades[1]', '{"upstream":["fawazahmed0/hadith-api"]}', 'Zubair Ali Zai', 'زبير علي زئي', 'scholar', 'verified', 'Daif', null, 'ضعيف', 'glossary', 'hadith', 'glossary_reviewed', 'whole_record', 1, 'details', null);
  judgment.run('c', 2, 'quranlab_fawazahmed0', 'quranlab/hadith', 'abudawud-ar', 'grades[2]', '{"upstream":["fawazahmed0/hadith-api"]}', 'Abu Ghuddah', 'أبو غدة', 'editor', 'verified', '-', null, null, 'unresolved', 'unresolved', 'not_a_judgment', 'whole_record', 1, 'hidden_placeholder', null);
  judgment.run('d', 1, 'base_lk_field', 'ShathaTm/LK-Hadith-Corpus', null, 'Arabic_Grade', '{"upstream":["unresolved"]}', null, null, 'unattributed', 'unattributed', 'صحيح', null, 'صحيح', 'source_arabic', 'hadith', 'source_arabic', 'whole_record', null, 'suppressed_collection', null);
  db.prepare('INSERT INTO hadith_grading_summary VALUES (2,2,1,1,0,?)').run('details');
  db.prepare('INSERT INTO hadith_grading_summary VALUES (1,0,0,0,0,?)').run('suppressed_collection');
  db.prepare('INSERT INTO source_registry VALUES (?,?,?,?,?)').run('ql:malik-en', 'quranlab/hadith', 'rev', 'reference-only', 'credit');
  db.prepare('INSERT INTO source_registry VALUES (?,?,?,?,?)').run('ql:hadeethenc-ar', 'quranlab/hadith', 'rev', 'open with attribution', 'HadeethEnc');
  db.prepare('INSERT INTO source_registry VALUES (?,?,?,?,?)').run('lk:AbuDaud/Chapter1.csv', 'ShathaTm/LK-Hadith-Corpus', 'c45', null, null);
  db.prepare('INSERT INTO quranlab_records VALUES (?,?,?,?,?,?,?)').run('malik:1', 'en', 'malik-en', 'Rewards follow pilgrimage intentions', null, null, null);
  db.prepare('INSERT INTO quranlab_records VALUES (?,?,?,?,?,?,?)').run('hadeethenc:9', 'ar', 'hadeethenc-ar', 'نص', 'عنوان', 'شرح موجز', 'رواه أبو داود');
  db.prepare('INSERT INTO hadith_crosswalk VALUES (1,?,?,3,?,?,1,NULL)').run('malik:1', 'malik', 'verified_match', 'corpus_extends_source');
  db.prepare('INSERT INTO hadith_crosswalk VALUES (2,?,?,NULL,?,?,0.7,NULL)').run('malik:2', 'malik', 'candidate_review', 'partial');
  db.prepare('INSERT INTO hadith_crosswalk VALUES (3,?,?,2,?,?,0.99,NULL)').run('hadeethenc:9', 'hadeethenc', 'verified_match', 'report_in_attributed_collection');
  db.prepare('INSERT INTO variant_translation_fts(rowid,text) VALUES (3,?)').run('Rewards follow pilgrimage intentions');
  db.close();
}

before(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-merged-')); });
after(async () => { await rm(directory, { recursive: true, force: true }); });

it('reads attributed rulings without inventing a verdict, and hides placeholders', async () => {
  const filename = path.join(directory, 'merged.sqlite');
  mergedDatabase(filename);
  const original = await readFile(filename);
  const corpus = new SunnahResearchCorpus(filename);
  try {
    assert.deepEqual(corpus.catalog.merged, { schemaVersion: 1, revision: 'rev' });
    const research = corpus.research(2);
    assert.deepEqual(research.merged?.judgments.map(item => item.graderAr), ['الألباني', 'زبير علي زئي']);
    assert.equal(research.merged?.opposed, true);
    assert.equal(research.merged?.judgments[0].lineage[0], 'fawazahmed0/hadith-api');
    assert.equal(research.merged?.explanations[0].explanation, 'شرح موجز');
    assert.equal(research.merged?.fieldSources.find(item => item.unresolved)?.source, 'base:db');
    assert.deepEqual(research.merged?.missingFields, ['English_Isnad']);
    const row = corpus.chapter('AbuDaud', 1).hadiths[0];
    assert.deepEqual(row.gradingSummary, { count: 2, opposed: true, wordingDiffers: true, unresolved: 0 });
    assert.equal(row.grade.ar, 'صحيح', 'legacy grade stays the original field');
  } finally { corpus.close(); }
  assert.deepEqual(await readFile(filename), original, 'attached database is never written');
});

it('never shows a Bukhari summary or an unverified link', () => {
  const corpus = new SunnahResearchCorpus(path.join(directory, 'merged.sqlite'));
  try {
    assert.equal(corpus.chapter('Bukhari', 1).hadiths[0].gradingSummary, undefined);
    assert.equal(corpus.research(1).merged?.judgments.length, 0);
    assert.equal(corpus.research(3).merged?.variants.length, 1);
  } finally { corpus.close(); }
});

it('uses a variant only for empty English, labels it and finds it in search', () => {
  const corpus = new SunnahResearchCorpus(path.join(directory, 'merged.sqlite'));
  try {
    const muwatta = corpus.chapter('MuwattaMalik', 1).hadiths[0];
    assert.equal(muwatta.text.en.full, 'Rewards follow pilgrimage intentions');
    assert.deepEqual(muwatta.translation, { config: 'malik-en', partial: true });
    const abuDaud = corpus.chapter('AbuDaud', 1).hadiths[0];
    assert.equal(abuDaud.text.en.full, 'Actions depend on intentions.');
    assert.equal(abuDaud.translation, undefined);
    assert.equal(corpus.search({ text: 'pilgrimage' }).length, 1);
    assert.equal(corpus.search({ text: 'pilgrimage', collection: 'AbuDaud' }).length, 0);
  } finally { corpus.close(); }
});

it('keeps row identities and reading for a base database', () => {
  const filename = path.join(directory, 'legacy.sqlite');
  baseDatabase(filename).close();
  const legacy = new SunnahResearchCorpus(filename), merged = new SunnahResearchCorpus(path.join(directory, 'merged.sqlite'));
  try {
    assert.equal(legacy.catalog.merged, undefined);
    assert.equal(legacy.research(2).merged, undefined);
    assert.equal(legacy.chapter('AbuDaud', 1).hadiths[0].gradingSummary, undefined);
    assert.equal(legacy.search({ text: 'الأعمال' }).length, 3);
    assert.deepEqual(legacy.catalog.collections.map(item => item.chapters), merged.catalog.collections.map(item => item.chapters));
    assert.equal(legacy.chapter('AbuDaud', 1).hadiths[0].id, merged.chapter('AbuDaud', 1).hadiths[0].id);
  } finally { legacy.close(); merged.close(); }
});

it('falls back to the base reading for a newer merged schema', () => {
  const filename = path.join(directory, 'future.sqlite');
  mergedDatabase(filename, '2');
  const corpus = new SunnahResearchCorpus(filename);
  try {
    assert.equal(corpus.catalog.merged, undefined);
    assert.equal(corpus.research(2).merged, undefined);
    assert.equal(corpus.chapter('AbuDaud', 1).hadiths[0].text.ar.full, 'إنما الأعمال بالنيات');
  } finally { corpus.close(); }
});

it('prefers the merged database and attaches back to the old file for rollback', async () => {
  const merged = path.join(directory, 'merged.sqlite'), legacy = path.join(directory, 'legacy.sqlite');
  const service = new SunnahService(path.join(directory, 'profile'), [], [merged, legacy]);
  try {
    assert.equal((await service.catalog())?.merged?.revision, 'rev');
    assert.equal((await service.attachResearch(legacy)).merged, undefined);
    assert.equal((await service.research(2)).merged, undefined);
  } finally { service.close(); }
  const reopened = new SunnahService(path.join(directory, 'profile'), [], [merged, legacy]);
  try { assert.equal((await reopened.catalog())?.merged, undefined, 'explicit choice wins on the next launch'); }
  finally { reopened.close(); }
});

it('shows source books as their own books and links review records without changing the candidate', () => {
  const filename = path.join(directory, 'books.sqlite');
  mergedDatabase(filename);
  const db = new Database(filename);
  db.exec('CREATE TABLE source_book_rows(hadith_id INTEGER PRIMARY KEY,source_key TEXT,kind TEXT,book_key TEXT,source_collection TEXT,reason TEXT,candidates_json TEXT)');
  const row: Record<string, string> = Object.fromEntries(fields.map(field => [field, '']));
  Object.assign(row, { Chapter_Number: '2', Chapter_Arabic: 'سنن أبي داود', Chapter_English: 'Sunan Abi Dawud', Hadith_number: '7', Arabic_Hadith: 'نص قيد المراجعة', Arabic_Matn: 'نص قيد المراجعة', Itqan_Narrator_Chain_JSON: '[]', Itqan_Quran_Root_Links_JSON: '[]', Itqan_Linked_Ayah_Keys_JSON: '[]', Itqan_Corroborating_Hadiths_JSON: '[]', field_provenance_json: '{}', source_datasets_json: '[]' });
  for (const [id, book, kind, candidates] of [[4, 'ReviewQueue', 'review', '[2]'], [5, 'Nawawi40', 'collection', '[]']] as const) {
    db.prepare(`INSERT INTO hadiths VALUES (?,${fields.map(() => '?').join(',')})`).run(id, ...fields.map(field => field === 'book_key' ? book : row[field]));
    db.prepare('INSERT INTO source_book_rows VALUES (?,?,?,?,?,?,?)').run(id, `abudawud:${id}`, kind, book, 'abudawud', null, candidates);
  }
  db.close();
  const corpus = new SunnahResearchCorpus(filename);
  try {
    assert.ok(corpus.catalog.collections.some(item => item.id === 'Nawawi40') && corpus.catalog.collections.some(item => item.id === 'ReviewQueue'));
    assert.equal(corpus.chapter('Nawawi40', 2).hadiths[0].id, 'Nawawi40:2:1');
    const review = corpus.chapter('ReviewQueue', 2).hadiths[0];
    assert.deepEqual(review.sourceBook, { kind: 'review', collection: 'abudawud' });
    assert.equal(review.gradingSummary, undefined);
    assert.equal(corpus.research(4).related[0].hadith.researchId, 2);
    assert.equal(corpus.chapter('AbuDaud', 1).hadiths[0].sourceBook, undefined);
    assert.equal(corpus.chapter('AbuDaud', 1).hadiths[0].id, 'AbuDaud:1:1');
  } finally { corpus.close(); }
});
