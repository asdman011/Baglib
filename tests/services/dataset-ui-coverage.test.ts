import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { QuranReader } from '../../src/main/services/quran/quran-reader';
import { presetResource, readerPresets } from '../../src/main/services/quran/reader-resources';
import { SunnahResearchCorpus } from '../../src/main/services/sunnah/research-corpus';
import { openPoetryPartition, rebuildPoetrySearch } from '../../src/main/services/poetry/partition';
import { poetryFacets, poetryVariants, searchPoetry, searchPoets } from '../../src/main/services/poetry/queries';
import { quranDivisionAt, quranLocalizedSource, quranWikiUrl } from '../../src/shared/quran-structure';
import { quranResourceGuidance } from '../../src/shared/quran-resource-guidance';
import type { QuranDivision, QuranPack, QuranReaderSource } from '../../src/shared/types/quran';

const divisions: QuranDivision[] = [{ number: 1, first: '1:1', last: '2:141' }, { number: 2, first: '2:142', last: '2:252' }, { number: 3, first: '2:253', last: '3:92' }];

test('divisions are located by ayah order, not by comparing reference text', () => {
  assert.equal(quranDivisionAt(divisions, 2, 141)?.number, 1);
  assert.equal(quranDivisionAt(divisions, 2, 142)?.number, 2);
  assert.equal(quranDivisionAt(divisions, 3, 1)?.number, 3);
  assert.equal(quranDivisionAt([], 1, 1), undefined);
});

test('the Arabic interface takes the derived copy and English keeps the source edition', () => {
  const source = (id: string, language?: 'ar'): QuranReaderSource => ({ id, title: id, kind: 'surah-info', profile: 'hafs', language });
  const both = [source('ar-copy', 'ar'), source('source')];
  assert.equal(quranLocalizedSource(both, 'surah-info', 'ar')?.id, 'ar-copy');
  assert.equal(quranLocalizedSource(both, 'surah-info', 'en')?.id, 'source');
  assert.equal(quranLocalizedSource([source('source')], 'surah-info', 'ar')?.id, 'source');
  assert.equal(quranLocalizedSource([source('ar-copy', 'ar')], 'surah-info', 'en')?.id, 'ar-copy');
  assert.equal(quranLocalizedSource(both, 'ayah-theme', 'ar'), undefined);
});

test('topic wiki links are normalized and anything else is not linked', () => {
  assert.equal(quranWikiUrl('en.wikipedia.org//wiki/Allah'), 'https://en.wikipedia.org/wiki/Allah');
  assert.equal(quranWikiUrl('https://en.wikipedia.org/wiki/Hajj'), 'https://en.wikipedia.org/wiki/Hajj');
  assert.equal(quranWikiUrl('wiki/Allah'), null);
  assert.equal(quranWikiUrl('https://evil.test/wiki/Allah'), null);
  assert.equal(quranWikiUrl('javascript:alert(1)'), null);
});

test('derived Arabic copies are import-only and every other new preset can be downloaded', () => {
  for (const id of ['surah-info/ar-baglib', 'ayah-theme/ar-baglib', 'ayah-topics/ar-baglib']) {
    assert.equal(readerPresets.find(preset => preset.id === id)?.language, 'ar');
    assert.equal(quranResourceGuidance({ id, formats: [] }).importOnly, true);
  }
  for (const id of ['quran-metadata/68', 'tafsir/251', 'transliteration/en-transliteration-rtf-markup']) assert.equal(quranResourceGuidance({ id, formats: [] }).importOnly, false);
});

test('reader exposes structure, whole-ayah transliteration, surah facts and rendered introductions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'baglib-coverage-'));
  const packs: QuranPack[] = [];
  const add = async (resource: string, sql: string) => {
    const preset = readerPresets.find(value => value.id === resource)!;
    const id = randomUUID();
    await mkdir(path.join(root, 'packs', id), { recursive: true });
    const filename = path.join(root, 'packs', id, '0.sqlite');
    const database = new Database(filename);
    database.exec(sql);
    database.close();
    const digest = createHash('sha256').update(await readFile(filename)).digest('hex');
    packs.push({ id, digest, resource: presetResource(resource), bytes: 1, files: [{ name: preset.filename.replace(/\.zip$/, ''), bytes: 1, type: 'sqlite' }], installedAt: '', capability: 'stored' } as QuranPack);
    return id;
  };
  let reader: QuranReader | undefined;
  try {
    const script = await add('quran-script/312', `CREATE TABLE words(id INTEGER,location TEXT,surah INTEGER,ayah INTEGER,word INTEGER,text TEXT); INSERT INTO words VALUES (1,'1:1:1',1,1,1,'بسم');`);
    await add('quran-metadata/70', `CREATE TABLE chapters(id INTEGER,name_simple TEXT,name_arabic TEXT,revelation_order INTEGER,revelation_place TEXT,verses_count INTEGER,bismillah_pre INTEGER); INSERT INTO chapters VALUES(1,'Al-Fatihah','الفاتحة',5,'makkah',7,0);`);
    const lines = await add('transliteration/en-transliteration-rtf-markup', `CREATE TABLE transliterations(sura INTEGER,ayah INTEGER,ayah_key TEXT,text TEXT); INSERT INTO transliterations VALUES(1,1,'1:1','Bismi All<u>a</u>hi<script>x</script>');`);
    await add('quran-metadata/68', `CREATE TABLE juz(juz_number INTEGER,verses_count INTEGER,first_verse_key TEXT,last_verse_key TEXT,verse_mapping TEXT); INSERT INTO juz VALUES(1,148,'1:1','2:141','{}');`);
    await add('quran-metadata/67', `CREATE TABLE hizbs(hizb_number INTEGER,verses_count INTEGER,first_verse_key TEXT,last_verse_key TEXT,verse_mapping TEXT); INSERT INTO hizbs VALUES(1,81,'1:1','2:74','{}');`);
    await add('quran-metadata/65', `CREATE TABLE ruku(ruku_number INTEGER,surah_ruku_number INTEGER,verses_count INTEGER,first_verse_key TEXT,last_verse_key TEXT,verse_mapping TEXT); INSERT INTO ruku VALUES(2,1,7,'2:1','2:7','{}');`);
    await add('quran-metadata/64', `CREATE TABLE sajdah(sajdah_number INTEGER,verse_key TEXT,sajdah_type TEXT); INSERT INTO sajdah VALUES(9,'32:15','required');`);
    const english = await add('surah-info/3', `CREATE TABLE surah_infos(surah_number INTEGER,surah_name TEXT,text TEXT,short_text TEXT); INSERT INTO surah_infos VALUES(1,'Al-Fatihah','<h2>Name</h2><p>Opening</p>','Short');`);
    const arabic = await add('surah-info/ar-baglib', `CREATE TABLE surah_infos(surah_number INTEGER,surah_name TEXT,text TEXT,short_text TEXT); INSERT INTO surah_infos VALUES(1,'الفاتحة','<h2>التسمية</h2>','موجز');`);
    reader = new QuranReader(root, packs);

    const structure = await reader.structure();
    assert.deepEqual(structure.juz, [{ number: 1, first: '1:1', last: '2:141' }]);
    assert.equal(structure.hizb[0].last, '2:74');
    assert.equal(structure.ruku[0].surahRuku, 1);
    assert.deepEqual(structure.sajdah, [{ number: 9, reference: '32:15', type: 'required' }]);
    assert.deepEqual(structure.rub, []);

    const passage = await reader.read({ script, surah: 1, from: 1, ayahTransliteration: lines });
    assert.equal(passage.surahs[0].revelationPlace, 'makkah');
    assert.equal(passage.surahs[0].revelationOrder, 5);
    const encoded = JSON.stringify(passage.ayahs[0].transliteration);
    assert.ok(encoded.includes('"tag":"u"'));
    assert.ok(!encoded.includes('script'));

    // No pack given: the source edition, never the derived copy.
    assert.equal((await reader.surahIntro(undefined, 1))?.surahName, 'Al-Fatihah');
    assert.equal((await reader.surahIntro(arabic, 1))?.surahName, 'الفاتحة');
    const intro = await reader.surahIntro(english, 1);
    assert.equal(intro?.nodes?.[0].tag, 'h2');
    assert.ok(!JSON.stringify(intro?.nodes).includes('<h2>'));
  } finally {
    reader?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('narrator profiles read the rijal table and treat a lone hyphen as nothing recorded', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-rijal-'));
  const filename = path.join(directory, 'corpus.sqlite');
  let corpus: SunnahResearchCorpus | undefined;
  try {
    const db = new Database(filename);
    db.exec(`CREATE TABLE hadiths(id INTEGER PRIMARY KEY,book_key TEXT,Chapter_Number TEXT,Chapter_Arabic TEXT,Chapter_English TEXT,Arabic_Tafseel TEXT,Itqan_Narrator_Chain_JSON TEXT,Itqan_Quran_Root_Links_JSON TEXT);
      INSERT INTO hadiths VALUES(1,'Bukhari','1.0','كتاب','Book','','[]','[]');
      CREATE TABLE quran_hadith_root_bridge(root_ar TEXT,hadith_id INTEGER,matched_words_json TEXT);
      CREATE TABLE hadith_narrators(hadith_id INTEGER,rijal_id TEXT);
      INSERT INTO hadith_narrators VALUES(1,'7'),(1,'7'),(2,'7');
      CREATE TABLE rijal_narrators(rijal_id TEXT PRIMARY KEY,primary_name_ar TEXT,kunya_ar TEXT,nasab_ar TEXT,laqab_nisba_ar TEXT,tabaqah TEXT,death_year_ah INTEGER,jarh_tadil_raw_ar TEXT,jarh_tadil_tier TEXT,sources_json TEXT,teachers_json TEXT,students_json TEXT);`);
    const sources = JSON.stringify({ classical_sources: { taqrib: { grade_ar: 'ثقة', grade_en: 'reliable' }, jarh: { grade_ar: '', grade_en: 'unknown' } }, name_variants: ['جابر', 'جابر بن يزيد'], source_death_text: 'في حدود 170 هـ' });
    const insert = db.prepare('INSERT INTO rijal_narrators VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    insert.run('7', 'جابر بن يزيد', '-', 'العجلي', '-', 'السابعة', 170, 'ثقة', 'Thiqah', sources, '[8,99]', '');
    insert.run('8', 'شيخه', '', '', '', '', null, '', 'Saduq', '{}', '', '');
    db.close();
    corpus = new SunnahResearchCorpus(filename);
    const narrator = corpus.narrator('7');
    assert.equal(narrator.name, 'جابر بن يزيد');
    assert.deepEqual(narrator.variants, ['جابر']);
    assert.equal(narrator.kunya, '');
    assert.equal(narrator.nasab, 'العجلي');
    assert.equal(narrator.deathYear, 170);
    assert.equal(narrator.deathText, 'في حدود 170 هـ');
    assert.deepEqual(narrator.sources, [{ source: 'taqrib', gradeAr: 'ثقة', gradeEn: 'reliable' }, { source: 'jarh', gradeAr: '', gradeEn: 'unknown' }]);
    assert.deepEqual(narrator.teachers, [{ id: '8', name: 'شيخه', tier: 'Saduq' }]);
    assert.equal(narrator.teacherCount, 2);
    assert.equal(narrator.studentCount, 0);
    assert.equal(narrator.hadithCount, 2);
    assert.throws(() => corpus!.narrator('not-a-number'));
    assert.throws(() => corpus!.narrator('12345'));
  } finally {
    corpus?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('poems and poets filter by language type and location', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-poetry-facets-'));
  const database = openPoetryPartition(directory);
  try {
    const poet = database.prepare("INSERT INTO poets(slug,name,name_normalized,language,era,location) VALUES(?,?,?,'ar',?,?)");
    poet.run('a', 'شاعر', 'شاعر', 'العصر الحديث', 'مصر');
    poet.run('b', 'آخر', 'اخر', null, 'العراق');
    const poem = database.prepare("INSERT INTO poems(poet_id,title,title_normalized,language,language_variant,verse_count,verses_json,search_text_normalized) VALUES(?,?,?,'ar',?,1,'[\"س\"]','س')");
    poem.run(1, 'أ', 'ا', 'فصيح');
    poem.run(1, 'ب', 'ب', '-');
    poem.run(2, 'ج', 'ج', 'عامي');
    rebuildPoetrySearch(database);
    assert.deepEqual(searchPoetry(database, { variant: 'عامي' }).items.map(item => item.title), ['ج']);
    assert.deepEqual(searchPoetry(database, { location: 'مصر' }).items.map(item => item.title), ['أ', 'ب']);
    assert.deepEqual(searchPoets(database, { language: 'ar', location: 'العراق' }).items.map(item => [item.name, item.location]), [['آخر', 'العراق']]);
    assert.deepEqual(poetryVariants(database), ['عامي', 'فصيح']);
    assert.deepEqual(poetryFacets(database).locations.sort(), ['العراق', 'مصر']);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
