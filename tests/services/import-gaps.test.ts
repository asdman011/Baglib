import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { DigitalFileValidatorService } from '../../src/main/services/digital/digital-file-validator.service';
import { EbookMetadataExtractorService } from '../../src/main/services/digital/ebook-metadata-extractor.service';
import { readFb2Metadata, readCbzMetadata, readMobiMetadata } from '../../src/main/services/digital/import-metadata';
import { DuplicateDetectorService, DuplicateCandidateIndex } from '../../src/main/services/digital/duplicate-detector.service';
import { DigitalImportPipelineService } from '../../src/main/services/digital/digital-import-pipeline.service';
import { discoverImportFiles } from '../../src/main/services/digital/import-files';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { createTestDatabase } from '../helpers/test-db';
import { importErrorKey, importDuplicateReasonKey } from '../../src/renderer/utils/import-errors';
import { translations } from '../../src/renderer/translations';

const validator = DigitalFileValidatorService.getInstance();
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(120, 6)]);
const fb2 = `<?xml version="1.0"?><FictionBook xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><book-title>English &amp; Arabic كتاب</book-title><author><first-name>أحمد</first-name><last-name>Smith</last-name></author><author><nickname>Second Writer</nickname></author><lang>ar</lang><coverpage><image l:href="#cover"/></coverpage></title-info></description><body><section><p>sample</p></section></body><binary id="cover" content-type="image/png">${png.toString('base64')}</binary></FictionBook>`;

async function fixture(name: string, bytes: string | Uint8Array, action: (file: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'key48-'));
  try { const file = path.join(dir, name); await fs.writeFile(file, bytes); await action(file); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}

function mobi(cover = 0, thumbnail = 1, badImage = false): Buffer {
  const rec0 = Buffer.alloc(176);
  rec0.write('MOBI',16); rec0.writeUInt32BE(116,20); rec0.writeUInt32BE(1,108); rec0.writeUInt32BE(64,128);
  rec0.write('EXTH',132); rec0.writeUInt32BE(36,136); rec0.writeUInt32BE(2,140);
  rec0.writeUInt32BE(201,144); rec0.writeUInt32BE(12,148); rec0.writeUInt32BE(cover,152);
  rec0.writeUInt32BE(202,156); rec0.writeUInt32BE(12,160); rec0.writeUInt32BE(thumbnail,164);
  const header = Buffer.alloc(104); header.write('MOBI Test'); header.write('BOOKMOBI',60); header.writeUInt16BE(3,76);
  header.writeUInt32BE(104,78); header.writeUInt32BE(280,86); header.writeUInt32BE(408,94);
  return Buffer.concat([header,rec0,badImage ? Buffer.alloc(128) : png,png]);
}

describe('KEY-48 formats, artwork, stable errors and batch duplicates', () => {
  it('offers CBZ and FB2 through native and fallback file-picker filters', async () => {
    const source = await fs.readFile('src/main/ipc/system.ts', 'utf8');
    const filters = source.split('\n').filter(line => /name: words.dialogFilter(?:AllBooks|Ebooks),/.test(line));
    assert.equal(filters.length, 2);
    for (const filter of filters) {
      assert.ok(filter.includes("'cbz'"));
      assert.ok(filter.includes("'fb2'"));
    }
    const wizard = await fs.readFile('src/renderer/components/library/ImportWizardModal.tsx', 'utf8');
    assert.match(wizard, /accept="[^"]*\.fb2/);
    assert.match(wizard, /accept="[^"]*\.cbz/);
  });
  it('recognizes FB2 document roots and CBZ ZIP headers', () => {
    assert.equal(validator.validateBuffer(Buffer.from(fb2),'mixed.fb2').format,'FB2');
    assert.equal(validator.validateBuffer(Buffer.from('<x:FictionBook xmlns:x="urn:fb2"/>'),'a.fb2').format,'FB2');
    assert.equal(validator.validateBuffer(Buffer.from([80,75,3,4]),'comic.cbz').format,'CBZ');
    for (const [name, content] of [['bad.fb2','<root><FictionBook/></root>'],['bad.cbz','not ZIP']]) assert.equal(validator.validateBuffer(Buffer.from(content),name).isValid,false);
    assert.equal(validator.isFormatSupported('.djvu'),false);
    assert.equal(validator.isFormatSupported('.cbr'),false);
  });
  it('extracts FB2 original title, all authors, language and referenced binary cover through normal entry point', async () => fixture('sample.fb2',fb2,async file => {
    const meta = await EbookMetadataExtractorService.getInstance().extract(file);
    assert.equal(meta.format,'FB2'); assert.equal(meta.title,'English & Arabic كتاب');
    assert.deepEqual(meta.authors,['أحمد Smith','Second Writer']); assert.equal(meta.language,'ar');
    assert.deepEqual(meta.coverBuffer,png); assert.ok(meta.coverDataUrl?.startsWith('data:image/png;base64,'));
  }));
  it('handles absent FB2 binary cover softly', async () => fixture('sample.fb2',fb2.replace('id="cover"','id="other"'),async file => assert.equal((await readFb2Metadata(file)).coverBuffer,undefined)));
  it('bounds FB2 file reads', async () => fixture('large.fb2','',async file => { await fs.truncate(file,33*1024*1024); assert.deepEqual(await readFb2Metadata(file),{}); }));
  it('extracts ComicInfo XML entities, authors, language and first natural image', async () => {
    const bytes=zipSync({'page10.png':new Uint8Array(128).fill(10),'page2.png':png,'ComicInfo.xml':strToU8('<ComicInfo><Title>Comic &amp; كتاب</Title><Writer>Alice; أحمد</Writer><LanguageISO>en</LanguageISO><Year>2024</Year><Publisher>Publisher</Publisher></ComicInfo>')});
    await fixture('comic.cbz',bytes,async file => {
      const meta=await EbookMetadataExtractorService.getInstance().extract(file);
      assert.equal(meta.format,'CBZ');assert.equal(meta.title,'Comic & كتاب');assert.deepEqual(meta.authors,['Alice','أحمد']);assert.equal(meta.language,'en');assert.equal(meta.publicationYear,2024);assert.deepEqual(meta.coverBuffer,png);
    });
  });
  it('extracts comic cover without ComicInfo and bounds oversized entries', async () => {
    await fixture('comic.cbz',zipSync({'Chapter 2/2.png':png,'Chapter 10/1.png':new Uint8Array([1])}),async file => assert.deepEqual((await readCbzMetadata(file)).coverBuffer,png));
    await fixture('comic.cbz',zipSync({'1.png':new Uint8Array(17*1024*1024)}),async file => assert.equal((await readCbzMetadata(file)).coverBuffer,undefined));
  });
  for (const format of ['MOBI','AZW3'] as const) it(`reads ${format} EXTH201 offset zero relative to resource start`, async () => fixture('book.'+format.toLowerCase(),mobi(),async file => {
    const meta=await readMobiMetadata(file,format);assert.deepEqual(meta.coverBuffer,png);assert.equal(meta.coverMimeType,'image/png');
    assert.deepEqual((await EbookMetadataExtractorService.getInstance().extract(file)).coverBuffer,png);
  }));
  for (const offset of [0xffffffff,999]) it(`falls back to EXTH202 for invalid cover offset ${offset}`, async () => fixture('book.mobi',mobi(offset),async file => assert.deepEqual((await readMobiMetadata(file,'MOBI')).coverBuffer,png)));
  it('falls back to thumbnail for invalid image bytes', async () => fixture('book.mobi',mobi(0,1,true),async file => assert.deepEqual((await readMobiMetadata(file,'MOBI')).coverBuffer,png)));
  it('fails softly on truncated MOBI record tables and EXTH lengths', async () => {
    await fixture('book.mobi',mobi().subarray(0,90),async file => assert.equal((await readMobiMetadata(file,'MOBI')).coverBuffer,undefined));
    const bytes=mobi();bytes.writeUInt32BE(99999,104+136);
    await fixture('book.mobi',bytes,async file => assert.equal((await readMobiMetadata(file,'MOBI')).coverBuffer,undefined));
  });
  it('bounds MOBI image records and uses the thumbnail after an oversized cover', async () => {
    const bytes = mobi();
    const imageSize = 17 * 1024 * 1024;
    const header = Buffer.from(bytes.subarray(0, 280));
    header.writeUInt32BE(280 + imageSize, 94);
    await fixture('oversized.mobi', Buffer.concat([header, Buffer.alloc(imageSize), png]), async file => {
      assert.deepEqual((await readMobiMetadata(file, 'MOBI')).coverBuffer, png);
    });
  });
  it('preserves first-match ordering for ambiguous indexed candidates', async () => {
    const db = createTestDatabase();
    try {
      const detector = new DuplicateDetectorService(new SqliteWorkRepository(db));
      const works = [{ id: 'first', title: 'Alpha Beta Gamma', author: 'Writer' }, { id: 'second', title: 'Alpha Beta Gamma', author: 'Writer' }];
      const input = { filePath: '', title: 'Alpha Beta Gamma', author: 'Writer' };
      const indexed = await detector.checkDuplicate(input, new DuplicateCandidateIndex(works));
      assert.equal(indexed.existingWork?.id, 'first');
      assert.deepEqual(indexed, await detector.checkDuplicate(input, works));
    } finally { db.close(); }
  });
  it('returns stable validation error codes with original filename and localized ar/en keys', async () => {
    for(const [bytes,name,code] of [[Buffer.alloc(0),'فارغ.fb2','EMPTY_FILE'],[Buffer.from('bad'),'bad.cbz','CORRUPTED_FILE'],[Buffer.from('%PDF-1.7'),'wrong.fb2','SIGNATURE_MISMATCH']] as const){
      const result=validator.validateBuffer(bytes,name);assert.equal(result.errorCode,code);assert.equal(result.error,code);assert.equal(result.fileName,name);
      const key=importErrorKey(code);assert.ok(translations.ar[key]);assert.ok(translations.en[key]);assert.notEqual(translations.ar[key],translations.en[key]);
    }
    assert.equal(importErrorKey('__proto__'),'importErrorGeneric');
    const missing=await validator.validateFile(path.join(os.tmpdir(),'key48-missing-file.cbz'));assert.equal(missing.errorCode,'FILE_NOT_FOUND');
  });
  it('recursively discovers nested FB2/CBZ files while omitting unsupported files', async () => fixture('outer.fb2',fb2,async file=>{
    const nested=path.join(path.dirname(file),'one/two/three');await fs.mkdir(nested,{recursive:true});await fs.writeFile(path.join(nested,'book.cbz'),zipSync({'1.png':png}));await fs.writeFile(path.join(nested,'skip.exe'),'skip');
    const found=await discoverImportFiles([path.dirname(file)]);assert.equal(found.files.length,2);assert.equal(found.errors.length,0);
  }));
  it('reviews twins against the earlier batch file and reports one skipped import with consistent DB state', async () => fixture('first.txt','Unique batch twin content',async first => {
    const db=createTestDatabase();try{
      const repo=new SqliteWorkRepository(db);const second=path.join(path.dirname(first),'second.txt');await fs.copyFile(first,second);
      const detector=new DuplicateDetectorService(repo);const results=await detector.batchCheckDuplicates([first,second]);
      assert.equal(results[0].matchType,'none');assert.equal(results[1].matchType,'exact_file');assert.deepEqual(results[1].batchDuplicateOf,{filePath:first,fileName:'first.txt'});assert.equal(results[1].existingWork,undefined);
      assert.equal(importDuplicateReasonKey(results[1]),'importBatchDuplicate');
      const pipeline=new DigitalImportPipelineService(repo);const summary=await pipeline.importFiles([first,second].map(filePath=>({filePath,duplicateAction:'skip' as const,skipExactDuplicatesOnly:true})));
      assert.equal(summary.successfulImports,1);assert.equal(summary.skippedImports,1);assert.equal(repo.getAllWorks().length,1);
    }finally{db.close();}
  }));
  it('matches indexed and full scans identically and loads candidates once per batch', async () => {
    const db=createTestDatabase();try{
      const repo=new SqliteWorkRepository(db);const detector=new DuplicateDetectorService(repo);
      const titles=['The History of Learning','History of Learning','عِلْم الحديث','العلم الحديث','كتاب طويل في التاريخ','x..','abc','axc','One Two Three Four','Four Three Two One','لـغة عربية Mixed'];
      const works=titles.map((title,index)=>({id:String(index),title,author:index%2?'Alice':'أحمد'}));
      const index=new DuplicateCandidateIndex(works);
      for(const title of [...titles,'The History of Learnin','كِتاب طويل في التاريخ','Unrelated vocabulary','...'])for(const author of ['Alice','أحمد',undefined]){
        const input={filePath:'',title,author};assert.deepEqual(await detector.checkDuplicate(input,index),await detector.checkDuplicate(input,works));
      }
      let loads=0;repo.getDuplicateCandidates=()=>{loads++;return works;};
      await detector.batchCheckDuplicates([{filePath:'',title:'abc'},{filePath:'',title:'Other'}]);assert.equal(loads,1);
      assert.equal(index.select('zzzzzz','zzzzzz').length,0);
    }finally{db.close();}
  });
});
