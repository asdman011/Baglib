import { it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SunnahResearchCorpus } from '../../src/main/services/sunnah/research-corpus';
import { SunnahService } from '../../src/main/services/sunnah/sunnah.service';
import { validStudyTarget } from '../../src/shared/study-notes';

it('opens all nine collections read-only, retains row identities and exposes indexed research and exact cross-book targets', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-research-'));
  const filename = path.join(directory, 'corpus.sqlite');
  let corpus: SunnahResearchCorpus | undefined;
  let service: SunnahService | undefined;
  try {
    const db = new Database(filename);
    const fields = ['book_key','Chapter_Number','Chapter_Arabic','Chapter_English','Section_Number','Section_Arabic','Section_English','Hadith_number','Arabic_Hadith','Arabic_Isnad','Arabic_Matn','English_Hadith','English_Isnad','English_Matn','Arabic_Comment','Arabic_Grade','English_Grade','Arabic_Tafseel','Commentary_Book_Title','Commentary_Author','Source_Row_Reference','Shamela_Volume','Shamela_Page','Commentary_Shamela_URL','Tafseel_Match_Method','Tafseel_Match_Score','Itqan_Narrator_Chain_JSON','Itqan_Quran_Root_Links_JSON','Itqan_Linked_Ayah_Keys_JSON','Itqan_Chain_Calibration_Score','Itqan_Weakest_Narrator_Grade','Itqan_Corroborating_Hadiths_JSON'];
    db.exec(`CREATE TABLE hadiths(id INTEGER PRIMARY KEY,${fields.map(f => `${f} TEXT`).join(',')}); CREATE TABLE hadith_narrators(hadith_id INTEGER,rijal_id TEXT); CREATE TABLE quran_hadith_root_bridge(hadith_id INTEGER,root_ar TEXT); CREATE VIRTUAL TABLE hadiths_fts USING fts5(text);`);
    const books = ['Bukhari','Bukhari','Muslim','AbuDaud','Tirmidhi','Nesai','IbnMajah','MuwattaMalik','MusnadAhmad','SunanDarimi'];
    for (const [index, book] of books.entries()) {
      const row = Object.fromEntries(fields.map(field => [field, '']));
      // The source writes a missing section number or English title as the text 'nan'.
      if (book === 'IbnMajah') Object.assign(row, { Section_Number: 'nan', Section_Arabic: 'باب النية', Section_English: 'nan' });
      Object.assign(row, { book_key: book, Chapter_Number: index === 9 ? '' : '1.0', Chapter_Arabic: 'كتاب العلم', Chapter_English: 'Knowledge', Hadith_number: '1', Arabic_Hadith: 'إِنَّمَا الأَعْمَالُ', Arabic_Matn: 'إِنَّمَا الأَعْمَالُ', English_Hadith: 'Actions depend on intentions.', Arabic_Tafseel: 'شرح محقق محفوظ', Commentary_Book_Title: 'شرح عربي', Commentary_Author: 'المؤلف', Source_Row_Reference: 'Shamela:551:v1:p1:s1', Commentary_Shamela_URL:'https://shamela.ws/book/551', Itqan_Narrator_Chain_JSON: JSON.stringify([{pos:1,path:0,surface:'يحيى',resolved_name:'يحيى',rijal_id:'42',method:'exact'}]), Itqan_Quran_Root_Links_JSON:'["علم"]', Itqan_Linked_Ayah_Keys_JSON:'["2:1"]', Itqan_Corroborating_Hadiths_JSON: index === 0 ? '[{"book":"MuwattaMalik","hadith_number":"1","output_row_index":7}]' : '[]', Tafseel_Match_Score: '0.9', Itqan_Chain_Calibration_Score:'0.5' });
      db.prepare(`INSERT INTO hadiths VALUES (${fields.map(() => '?').join(',')},?)`).run(index+1,...fields.map(f=>row[f]));
      db.prepare('INSERT INTO hadiths_fts(rowid,text) VALUES (?,?)').run(index+1,'انما الاعمال شرح محقق محفوظ فاطمه Actions depend on intentions');
      db.prepare('INSERT INTO quran_hadith_root_bridge VALUES (?,?)').run(index+1,'علم');
      db.prepare('INSERT INTO hadith_narrators VALUES (?,?)').run(index+1,'42');
    }
    db.close();
    const original = await readFile(filename);
    corpus = new SunnahResearchCorpus(filename);
    assert.equal(corpus.catalog.collections.length,9);
    assert.equal(corpus.catalog.hadithCount,10);
    assert.equal(corpus.chapter('Bukhari',1).hadiths[1].id,'Bukhari:1:2');
    assert.equal(corpus.chapter('SunanDarimi',0).hadithCount,1);
    assert.equal(corpus.chapter('Tirmizi',1).collection,'Tirmizi');
    assert.equal(corpus.chapter('IbnMaja',1).collection,'IbnMaja');
    assert.deepEqual(corpus.chapter('IbnMaja',1).hadiths[0].section,{ number: '', title: { ar: 'باب النية', en: '' } });
    const details=corpus.research(1);
    assert.equal(details.commentary,'شرح محقق محفوظ');
    assert.equal(details.related[0].hadith.id,'MuwattaMalik:1:1');
    assert.equal(corpus.search({text:'إِنَّمَا الأَعْمَالُ',collection:'Bukhari'}).length,2);
    assert.equal(corpus.search({text:'intentions',collection:'Muslim'}).length,1);
    assert.equal(corpus.search({text:'محقق',collection:'MuwattaMalik'}).length,1);
    assert.equal(corpus.search({text:'1',collection:'Bukhari'}).length,2);
    assert.equal(corpus.search({root:'علم'}).length,10);
    assert.equal(corpus.search({narratorId:'42'}).length,10);
    assert.equal(corpus.search({text:'" OR *'}).length,0);
    assert.equal(corpus.search({text:'فاطمه'}).length,0);
    assert.throws(()=>corpus.research(-1));
    assert.throws(()=>corpus.search({narratorId:"42' OR 1=1"}));
    assert.throws(()=>corpus.chapter('Bukhari',99));
    corpus.close(); corpus=undefined;
    assert.deepEqual(await readFile(filename),original);
    service=new SunnahService(path.join(directory,'profile'),[],[filename]);
    assert.equal((await service.catalog())?.research,true);
    assert.equal((await service.chapter('MusnadAhmad',1)).hadithCount,1);
    await service.attachResearch(filename); service.close();
    service=new SunnahService(path.join(directory,'profile'));
    assert.equal((await service.catalog())?.collections.length,9);
    for (const book of ['MuwattaMalik','MusnadAhmad','SunanDarimi']) assert.ok(validStudyTarget(`sunnah:${book}:1:${book}:1:1`));
  } finally { corpus?.close(); service?.close(); await rm(directory,{recursive:true,force:true}); }
});
