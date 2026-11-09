import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readerSelectionCard } from '../../src/shared/reader-study-selection';
import { bookCfiTarget, parseBookTarget, studyLinks, studyLinkText } from '../../src/shared/study-notes';
import { parseDeepLink } from '../../src/shared/deep-link';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { SrsService } from '../../src/main/services/srs';
import { createTestDatabase } from '../helpers/test-db';

test('reader selections refuse whitespace and trim/bound mixed-script passages', () => {
  const context={target:'book:work@source#p=3',label:'كتاب Book — 3',workId:'work',language:'ar'};
  assert.throws(()=>readerSelectionCard('  \n  ',context));
  const input=readerSelectionCard('  عِلْم Science  ',context);
  assert.equal(input.front,'عِلْم Science'); assert.equal(input.back,'');
  assert.equal(input.sourceKind,'book'); assert.equal(input.sourceRef,context.target);
  assert.equal(input.sourceLabel,context.label); assert.equal(input.questionKind,'recall');
  assert.equal(readerSelectionCard('a'.repeat(21000),context).front.length,20000);
  assert.throws(()=>readerSelectionCard('text',{...context,target:'book:work#p=0'}));
  assert.throws(()=>readerSelectionCard('text',{...context,workId:'different'}));
  assert.throws(()=>readerSelectionCard('text',{...context,target:'book:work#p=3'}));
  assert.equal(readerSelectionCard('a'.repeat(19999)+'😀',context).front.length,19999);
});

test('EPUB CFI references retain source and range through wikilinks and deep links', () => {
 const cfi='epubcfi(/6/4[chapter]!/4/2,/1:200,/1:240)';
 const target=bookCfiTarget({id:'work',sourceId:'source'},cfi);
 assert.deepEqual(parseBookTarget(target),{id:'work',sourceId:'source',cfi});
 assert.equal(studyLinks(studyLinkText(target,'Chapter'))[0].target,target);
 assert.deepEqual(parseBookTarget(parseDeepLink('baglib:'+encodeURIComponent(target))!),parseBookTarget(target));
 for(const bad of ['book:work#cfi=epubcfi(/6/0!/4/2/1:0)','book:work#cfi=epubcfi(/6/3!/4/2/1:0)','book:work#cfi=epubcfi(/6/2!/4/2,/1:3,/1:1)','book:work#cfi=bad','book:work#cfi=%00','book:work#cfi=%','book:work#cfi=epubcfi(%0A)','book:work#p=2#cfi=abc']) assert.equal(parseBookTarget(bad),null,bad);
});

test('double-saving a reader selection reuses one card and enters SRS as new', () => {
 const db=createTestDatabase(); try {
 const repo=new KnowledgeCardRepository(db);
 const input=readerSelectionCard(' Selected passage ',{target:'book:work@source#p=3',label:'Title — 3',workId:'work',language:'en'});
 const a=repo.save(input),b=repo.save(input); assert.equal(a.id,b.id);
 repo.setMemorizing(a.id,true); repo.setMemorizing(b.id,true);
 const queue=new SrsService(db).queue();assert.equal(queue.cards.length,1);assert.equal(queue.cards[0].sourceRef,input.sourceRef);
 assert.equal((db.prepare('SELECT state FROM srs_state WHERE knowledge_id=?').get(a.id) as {state:string}).state,'new');
 } finally {db.close();}
});


test('EPUB section offsets resolve across pages, entities and repeated passages', async () => {
 const { parseHTML } = await import('linkedom');
 const { resolveStudyCfi } = await import('../../src/renderer/libs/reader/epub-study-location');
 const before=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:parseHTML('<html><body></body></html>').document});
 try {
  const pages=[{pageNumber:1,sectionIndex:0,sectionId:'s',chapterLabel:'Chapter',html:'<p>A &amp; B</p>',text:'A & B'},
    {pageNumber:2,sectionIndex:0,sectionId:'s',chapterLabel:'Chapter',html:'<p>Repeated عِلْم</p>',text:'Repeated عِلْم'}];
  assert.deepEqual(resolveStudyCfi(pages,'epubcfi(/6/2!/4/2,/1:3,/1:11)'),{page:2,start:0,end:8});
  assert.deepEqual(resolveStudyCfi(pages,'epubcfi(/6/2!/4/2,/1:11,/1:16)'),{page:2,start:8,end:13});
  assert.equal(resolveStudyCfi(pages,'epubcfi(/6/4!/4/2/1:0)'),null);
 } finally {if(before)Object.defineProperty(globalThis,'document',before);else Reflect.deleteProperty(globalThis,'document');}
});

test('assistant accepts bounded reader-selected book evidence and rejects invalid sources', async () => {
 const { validateAssistantRequest,validateAssistantAnswer } = await import('../../src/shared/study-assistant');
 const readerSource={target:'book:work@source#p=3',label:'Original title',text:'Selected عِلْم passage'};
 const request={task:'qa',question:'Explain',language:'en',allowRemote:false,notes:[],books:[],passages:[],readerSource};
 assert.deepEqual(validateAssistantRequest(request).readerSource,readerSource);
 for(const readerSource of [{target:'note:x',label:'x',text:'x'},{target:'book:x',label:'x',text:' '},{target:'book:x',label:'x',text:'a'.repeat(20001)}]) assert.throws(()=>validateAssistantRequest({...request,readerSource}));
 const sources=[{id:'S1',...readerSource}];
 const answer=validateAssistantAnswer(JSON.stringify({answer:'Explanation',abstained:false,citations:[{source:'S1',quote:readerSource.text}],cards:[]}),sources,'qa',false);
 assert.equal(answer.citations[0].target,readerSource.target);
 assert.throws(()=>validateAssistantAnswer(JSON.stringify({answer:'Invented',abstained:false,citations:[{source:'S1',quote:'outside source'}],cards:[]}),sources,'qa',false));
});


test('practice evidence retains precise EPUB CFI references', async () => {
 const { validateSourceRef } = await import('../../src/shared/practice');
 const target=bookCfiTarget({id:'work',sourceId:'source'},'epubcfi(/6/4!/4/2,/1:0,/1:16)');
 assert.equal(validateSourceRef(target),target);
});
