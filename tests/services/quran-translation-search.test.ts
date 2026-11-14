import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { QuranReader } from '../../src/main/services/quran/quran-reader';
import { presetResource, readerPresets } from '../../src/main/services/quran/reader-resources';
import { validQuranSearchQuery } from '../../src/shared/quran-search';
import type { QuranPack } from '../../src/shared/types/quran';

const id = randomUUID();
test('IPC search validator accepts bounded optional sources and rejects malformed requests', () => {
  for (const query of [{script:id,text:'mercy'}, {script:id,text:'رَحْمَة',translations:[randomUUID()],includeScript:false}, {script:id,text:'',translations:[]}]) assert.equal(validQuranSearchQuery(query), true);
  for (const query of [null, [], {}, {script:'../escape',text:'mercy'}, {script:id,text:'x'.repeat(201)}, {script:id,text:3}, {script:id,text:'x',translations:'all'}, {script:id,text:'x',translations:[id,id]}, {script:id,text:'x',translations:Array.from({length:33},()=>randomUUID())}, {script:id,text:'x',translations:['unknown']}, {script:id,text:'x',includeScript:'false'}, {script:id,text:'x',unexpected:true}]) assert.equal(validQuranSearchQuery(query), false, JSON.stringify(query));
});

test('translation derived index searches English and Arabic, preserves originals and isolates source/profile selection', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'baglib-translation-search-'));
  const packs: QuranPack[] = [];
  const add = async (resource: string, sql: string) => {
    const preset = readerPresets.find(value => value.id === resource)!;
    const id = randomUUID();
    await mkdir(path.join(root,'packs',id),{recursive:true});
    const file = path.join(root,'packs',id,'0.sqlite');
    const db = new Database(file); db.exec(sql); db.close();
    const digest = createHash('sha256').update(await readFile(file)).digest('hex');
    packs.push({id,digest,resource:presetResource(resource),bytes:1,files:[{name:preset.filename.replace(/\.zip$/, ''),bytes:1,type:'sqlite'}],installedAt:'',capability:'stored'});
    return {id,file,digest};
  };
  let reader: QuranReader | undefined;
  try {
    const script = await add('quran-script/312', "CREATE TABLE words(surah INTEGER,ayah INTEGER,word INTEGER,text TEXT); INSERT INTO words VALUES(1,1,1,'رَحْمَة');");
    const translation = await add('translation/193', 'CREATE TABLE translation(sura INTEGER,ayah INTEGER,text TEXT);');
    const db = new Database(translation.file);
    const insert = db.prepare('INSERT INTO translation VALUES(?,?,?)');
    for (let ayah=1;ayah<=120;ayah++) insert.run(2,ayah,JSON.stringify('Mercy رَحْمَة [[footnoteonly]]'));
    db.close();
    const before = await readFile(translation.file);
    const warsh = await add('quran-script/qpc-warsh-script-wbw', "CREATE TABLE words(surah INTEGER,ayah INTEGER,word INTEGER,text TEXT); INSERT INTO words VALUES(1,1,1,'نص');");
    reader = new QuranReader(root,packs);
    assert.deepEqual(await reader.search(script.id,'mercy'),[]);
    const english = await reader.search(script.id,'mercy',{translations:[translation.id],includeScript:false});
    assert.equal(english.length,30); assert.equal(english[0].source?.id,translation.id); assert.equal(english[0].source?.title,'Saheeh International');
    const limited = await reader.search(script.id, 'mercy', { translations: [translation.id], limit: 8 });
    const next = await reader.search(script.id, 'mercy', { translations: [translation.id], limit: 8, offset: 8 });
    assert.equal(limited.length, 8); assert.equal(next.length, 8);
    assert.equal(new Set([...limited, ...next].map(hit => `${hit.surah}:${hit.ayah}`)).size, 16);
    assert.equal(validQuranSearchQuery({ script: script.id, text: 'mercy', limit: 101 }), false);
    assert.equal(validQuranSearchQuery({ script: script.id, text: 'mercy', offset: -1 }), false);
    assert.equal(english[0].text,'Mercy رَحْمَة ');
    const arabic = await reader.search(script.id,'رحمة',{translations:[translation.id]});
    assert.equal(arabic.filter(hit=>hit.source?.kind==='script').length,1);
    assert.equal(arabic.filter(hit=>hit.source?.kind==='translation').length,30);
    assert.deepEqual(await reader.search(script.id,'رحمه',{translations:[translation.id]}),[], 'ta marbuta is not conflated with ha');
    assert.deepEqual(await reader.search(script.id,'footnoteonly',{translations:[translation.id],includeScript:false}),[]);
    assert.deepEqual(await reader.search(script.id,'mercy',{includeScript:false}),[]);
    assert.deepEqual(await reader.search(script.id,'" OR *',{translations:[translation.id]}),[]);
    await assert.rejects(reader.search(script.id,'mercy',{translations:[randomUUID()]}));
    await assert.rejects(reader.search(script.id,'mercy',{translations:[script.id]}));
    await assert.rejects(reader.search(warsh.id,'mercy',{translations:[translation.id]}));
    await assert.rejects(reader.search(script.id,'',{translations:[randomUUID()]}));
    reader.close(); reader = new QuranReader(root,packs);
    assert.equal((await reader.search(script.id,'MERCY',{translations:[translation.id]})).length,30);
    assert.deepEqual(await readFile(translation.file),before);
    const canonical = new Database(translation.file,{readonly:true});
    assert.equal((canonical.prepare("SELECT count(*) n FROM sqlite_schema WHERE name LIKE 'baglib_%'").get() as {n:number}).n,0);canonical.close();
  } finally { reader?.close(); await rm(root,{recursive:true,force:true}); }
});
