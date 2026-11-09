import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAssistantBookSources, type BookSourceDependencies } from '../../src/main/services/assistant-book-sources';
import { budgetSources, passageKind, validateAssistantAnswer, validateAssistantRequest } from '../../src/shared/study-assistant';
const target = 'book:work@source#p=2';
const deps: BookSourceDependencies = {
 resolve: (work, source) => work === 'work' && source === 'source' ? { title: 'عِلْم Science', sourceId: 'source', path: 'book.pdf' } : null,
 pdf: async () => ({ totalPages: 3, pageTexts: { '2': 'قال االله: \uF22Bعِلْم نافع\uF222 Science' } }),
 epub: async () => 'A real EPUB passage.',
};
test('book passages accept only precise source and page/CFI; renderer text is discarded', () => {
 assert.equal(passageKind(target), 'book');
 assert.equal(passageKind('book:work#p=2'), null);
 assert.equal(passageKind('book:work@source'), null);
 const request=validateAssistantRequest({task:'qa',question:'Explain',language:'en',allowRemote:false,readerSource:{target,label:'x',text:'FORGED'}});
 assert.deepEqual(request.readerSource,{target,label:'x'});
 assert.deepEqual(validateAssistantRequest({task:'guide',language:'ar',allowRemote:false,passages:[{target,label:'x',text:'FORGED'}]}).passages,[{target,label:'x'}]);
});
test('main reads exact source and page, preserves file quirks and refuses fabricated quotes', async () => {
 const sources=await readAssistantBookSources(target, undefined, deps);
 assert.equal(sources[0].target,target);
 assert.match(sources[0].text,/االله/u);
 const answer=(quote:string)=>JSON.stringify({answer:'Explanation',abstained:false,citations:[{source:'S1',quote}]});
 assert.equal(validateAssistantAnswer(answer('قال االله: ﴿عِلْم نافع﴾'),sources,'qa').citations[0].target,target);
 assert.throws(()=>validateAssistantAnswer(answer('قال الله: علم آخر'),sources,'qa'),/invalid-output/);
 assert.equal(budgetSources(sources,8).limited,true);
 assert.throws(()=>validateAssistantAnswer(answer('Science'),budgetSources(sources,8).sources,'qa'),/invalid-output/);
});
test('missing source, wrong work, missing page and image-only page are typed refusals', async () => {
 for(const ref of ['book:wrong@source#p=2','book:work@missing#p=2']) await assert.rejects(readAssistantBookSources(ref,undefined,deps),/missing-source/);
 await assert.rejects(readAssistantBookSources('book:work@source#p=4',undefined,deps),/missing-page/);
 await assert.rejects(readAssistantBookSources(target,undefined,{...deps,pdf:async()=>({totalPages:3,pageTexts:{}})}),/missing-page/);
 await assert.rejects(readAssistantBookSources(target,undefined,{...deps,pdf:async()=>({totalPages:3,pageTexts:{'2':'  '}})}),/no-text-layer/);
});
test('a range rejects an uncovered page and keeps page-specific citation targets', async () => {
 const pdf=async()=>({totalPages:3,pageTexts:{'2':'Second page text','3':'Third page text'}});
 const sources=await readAssistantBookSources(target,3,{...deps,pdf});
 assert.deepEqual(sources.map(s=>s.target),[target,'book:work@source#p=3']);
 await assert.rejects(readAssistantBookSources(target,4,{...deps,pdf}),/missing-page/);
});
test('EPUB handoff also reads file evidence rather than accepting selected text', async()=>{
 const ref='book:work@source#cfi=epubcfi(%2F6%2F2!%2F4%2F2%2C%2F1%3A0%2C%2F1%3A4)';
 const sources=await readAssistantBookSources(ref,undefined,{...deps,resolve:()=>({title:'EPUB',sourceId:'source',path:'book.epub'})});
 assert.equal(sources[0].text,'A real EPUB passage.');
 assert.equal(sources[0].target,ref);
});
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { readAssistantEpub } from '../../src/main/services/assistant-book-sources';
import { assistantSystemPrompt, bookQuoteFound } from '../../src/shared/study-assistant';

test('book comparison preserves diacritics/Allah quirks and only aliases known PDF glyphs', () => {
 const original='قال االله: \uF22Bعِلْم نافع\uF222';
 assert.ok(bookQuoteFound('قال االله: ﴿عِلْم نافع﴾',original));
 assert.equal(bookQuoteFound('قال الله: ﴿علم نافع﴾',original),false);
 assert.equal(bookQuoteFound('عِلْم آخر',original),false);
 assert.equal(original,'قال االله: \uF22Bعِلْم نافع\uF222');
 assert.match(assistantSystemPrompt('qa','en'),/not covered by the selected material/);
 assert.match(assistantSystemPrompt('qa','ar'),/غير مشمول بالمادة المختارة/);
});

test('EPUB adapter reads package spine and exact compact CFI offsets from disk', async () => {
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'baglib-k282-'));
 const filename=path.join(folder,'book.epub');
 const contents={
  'META-INF/container.xml':'<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
  'OPS/book.opf':'<package><manifest><item id="first" href="chapter.xhtml"/></manifest><spine><itemref idref="first"/></spine></package>',
  'OPS/chapter.xhtml':'<html><body><p>عِلْم Science &amp; study.</p><script>Untrusted script</script></body></html>',
 };
 fs.writeFileSync(filename,zipSync(Object.fromEntries(Object.entries(contents).map(([name,text])=>[name,strToU8(text)]))));
 try {
  assert.equal(await readAssistantEpub(filename,'epubcfi(/6/2!/4/2,/1:0,/1:5)'),'عِلْم');
  await assert.rejects(readAssistantEpub(filename,'epubcfi(/6/4!/4/2,/1:0,/1:5)'),/missing-page/);
  await assert.rejects(readAssistantEpub(filename,'epubcfi(/6/2!/4/2,/1:0,/1:999)'),/missing-page/);
 } finally { fs.rmSync(folder,{recursive:true,force:true}); }
});
