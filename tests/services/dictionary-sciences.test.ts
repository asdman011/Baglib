import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { DictionaryService } from '../../src/main/services/dictionary/dictionary.service';

/** Writes a one-word StarDict dictionary and returns its .ifo path. */
function stardict(directory: string, name: string, word: string, meaning: string): string {
  const definition = Buffer.from(meaning, 'utf8');
  const location = Buffer.alloc(8); location.writeUInt32BE(0, 0); location.writeUInt32BE(definition.length, 4);
  const index = Buffer.concat([Buffer.from(word, 'utf8'), Buffer.from([0]), location]);
  fs.writeFileSync(path.join(directory, `${name}.idx`), index);
  fs.writeFileSync(path.join(directory, `${name}.dict`), definition);
  const info = path.join(directory, `${name}.ifo`);
  fs.writeFileSync(info, `StarDict's dict ifo file\nversion=2.4.2\nwordcount=1\nidxfilesize=${index.length}\nbookname=${name}\nsametypesequence=m\n`);
  return info;
}

async function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-dictionary-'));
  const db = new Database(':memory:'); db.pragma('foreign_keys=ON'); runMigrations(db, migrations);
  db.exec(`
    INSERT OR IGNORE INTO category(id,parent_id,name_ar,name_en) VALUES('islamic-sciences',NULL,'علوم','Sciences');
    INSERT OR IGNORE INTO category(id,parent_id,name_ar,name_en) VALUES('islamic-hadith','islamic-sciences','حديث','Hadith');
    INSERT OR IGNORE INTO category(id,parent_id,name_ar,name_en) VALUES('islamic-mustalah','islamic-hadith','مصطلح','Mustalah');
    INSERT OR IGNORE INTO category(id,parent_id,name_ar,name_en) VALUES('islamic-muamalat','islamic-sciences','معاملات','Finance');
    INSERT INTO work(id,title,primary_category_id) VALUES('book','تدريب الراوي','islamic-mustalah');
  `);
  const service = new DictionaryService(db);
  const hadith = await service.importDictionary({ sourcePath: stardict(directory, 'mustalah', 'سند', 'سلسلة الرواة'), title: 'معجم المصطلح' });
  const finance = await service.importDictionary({ sourcePath: stardict(directory, 'finance', 'سند', 'ورقة مالية'), title: 'معجم المعاملات' });
  const people = await service.importDictionary({ sourcePath: stardict(directory, 'people', 'سند', 'علم مترجم له'), title: 'سير أعلام النبلاء' });
  assert.ok(service.setScience(hadith.id, 'islamic-mustalah'));
  assert.ok(service.setScience(finance.id, 'islamic-muamalat'));
  assert.ok(service.setScience(people.id, 'biography'));
  return { db, service, directory, hadith, finance, people };
}

const titles = async (service: DictionaryService, options: { science?: string; workId?: string }) =>
  (await service.lookup('سند', { includeWikipedia: false, ...options })).entries.map(entry => entry.dictTitle);

test('a term resolves by the science being read, and every entry names its source', async () => {
  const { db, service, directory } = await fixture();
  try {
    assert.deepEqual(await titles(service, { science: 'islamic-hadith' }), ['معجم المصطلح', 'سير أعلام النبلاء']);
    assert.deepEqual(await titles(service, { workId: 'book' }), ['معجم المصطلح', 'سير أعلام النبلاء']);
    assert.deepEqual(await titles(service, { science: 'islamic-muamalat' }), ['معجم المعاملات', 'سير أعلام النبلاء']);
    const entry = (await service.lookup('سند', { includeWikipedia: false, science: 'islamic-hadith' })).entries[0];
    assert.equal(entry.science, 'islamic-mustalah');
    assert.equal(entry.definitionText, 'سلسلة الرواة');
  } finally { db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('a lookup with no matching science keeps every meaning', async () => {
  const { db, service, directory } = await fixture();
  try {
    assert.equal((await titles(service, {})).length, 3);
    assert.equal((await titles(service, { science: 'islamic-sciences' })).length, 3);
    assert.equal((await titles(service, { science: 'unknown' })).length, 3);
  } finally { db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('science tags are checked and leave with their dictionary', async () => {
  const { db, service, directory, hadith } = await fixture();
  try {
    assert.equal(service.setScience(hadith.id, 'no-such-science'), false);
    assert.equal(service.setScience('missing', 'biography'), false);
    assert.equal(service.listDictionaries().find(item => item.id === hadith.id)?.science, 'islamic-mustalah');
    service.deleteDictionary(hadith.id);
    assert.ok(!(db.prepare(`SELECT value FROM app_settings WHERE key='dictionary.sciences.v1'`).get() as { value: string }).value.includes(hadith.id));
  } finally { db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
