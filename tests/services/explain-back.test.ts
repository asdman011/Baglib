import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { ExplainBackService } from '../../src/main/services/explain-back';
import { segmentClaims, validateExplainVerdicts } from '../../src/shared/explain-back';
const target='book:work@source#p=2';
const source={id:'S1',target,label:'عِلْم Science',text:'Plants need light. Roots absorb water. Leaves capture sunlight.'};
const request={target,summary:'Plants need light. The moon is cheese.',language:'en' as const,allowRemote:false};
const output=()=>JSON.stringify({verdicts:[{claim:0,status:'supported',quote:'Plants need light.'},{claim:1,status:'unsupported',quote:'Roots absorb water.'}]});
function fixture(text=source.text){const db=new Database(':memory:');runMigrations(db,migrations);let calls=0;const service=new ExplainBackService(db,new SqliteSettingsRepository(db),async()=>[{...source,text}],async()=>{calls++;return output();});return {db,service,calls:()=>calls};}
test('segments Arabic, English and mixed claims without changing diacritics',()=>{
 assert.deepEqual(segmentClaims('العِلْم نافع؛ والماء ضروري. Science helps!'),['العِلْم نافع','والماء ضروري','Science helps']);
 assert.deepEqual(segmentClaims('Plants need light. Roots absorb water.\nLeaves grow.'),['Plants need light','Roots absorb water','Leaves grow']);
});
test('every claim carries a checked quote; unrelated fact stays unsupported',()=>{
 const v=validateExplainVerdicts(output(),segmentClaims(request.summary),[source]);assert.equal(v[1].status,'unsupported');
 for(const verdicts of [[{claim:0,status:'supported',quote:'Invented'}],[{claim:0,status:'supported',quote:'Plants need light.'}],JSON.parse(output()).verdicts.map((v:object)=>({...v,quote:'outside evidence'}))])assert.throws(()=>validateExplainVerdicts(JSON.stringify({verdicts}),segmentClaims(request.summary),[source]),/invalid-output/);
});
test('short passage and image-only extraction refuse before provider or attempt',async()=>{
 const f=fixture('Hi');try{await assert.rejects(f.service.check(request),/passage-too-short/);assert.equal(f.calls(),0);assert.equal(f.db.prepare('SELECT count(*) n FROM practice_attempt').get().n,0);}finally{f.db.close();}
 const f2=fixture();try{const service=new ExplainBackService(f2.db,new SqliteSettingsRepository(f2.db),async()=>{throw new Error('no-text-layer');},async()=>{throw new Error('provider called');});await assert.rejects(service.check(request),/no-text-layer/);}finally{f2.db.close();}
});
test('each check records pending once; accepting all corrected verdicts judges and saves one linked note atomically',async()=>{
 const f=fixture();try{const checked=await f.service.check({...request,text:'FORGED'});const row=f.db.prepare('SELECT * FROM practice_attempt').get( ) as Record<string,unknown>;assert.equal(row.question_kind,'explain_back');assert.equal(row.check_method,'judgment');assert.equal(row.result,'pending');assert.equal(row.source_ref,target);assert.equal(row.answer_text,request.summary);
 assert.throws(()=>f.service.accept({id:checked.id,decisions:['supported']}),/invalid-request/);
 const result=f.service.accept({id:checked.id,decisions:['supported','unsupported']});assert.equal(result.attempt.result,'partial');assert.match(result.note.content,/book:work@source#p=2/);assert.equal(result.note.workId,null);assert.match(result.note.content,/The moon is cheese/);assert.equal(f.db.prepare('SELECT count(*) n FROM study_note_detail').get().n,1);
 assert.throws(()=>f.service.accept({id:checked.id,decisions:['supported','supported']}),/attempt-changed/);assert.equal(f.db.prepare('SELECT count(*) n FROM study_note_detail').get().n,1);
 }finally{f.db.close();}
});

test('a genuine but unrelated quote cannot promote an outside-passage claim to supported',()=>{
 const raw=JSON.parse(output());raw.verdicts[1].status='supported';
 assert.equal(validateExplainVerdicts(JSON.stringify(raw),segmentClaims(request.summary),[source])[1].status,'unsupported');
});
test('request bounds, forged evidence, provider failure and unbounded output fail closed',async()=>{
 const f=fixture();try{
 for(const extra of [{target:'book:work#p=2'},{target:'note:x'},{summary:' '},{summary:'A.'.repeat(4000)},{language:'fr'},{allowRemote:'yes'}])await assert.rejects(f.service.check({...request,...extra}),/invalid-request/);
 assert.equal(f.calls(),0);
 const svc=new ExplainBackService(f.db,new SqliteSettingsRepository(f.db),async()=>[source],async()=>{throw new Error('engine-failed');});await assert.rejects(svc.check(request),/engine-failed/);
 assert.equal(f.db.prepare('SELECT count(*) n FROM practice_attempt').get().n,0);
 }finally{f.db.close();}
});
test('acceptance and note failure roll back judgment, and drafts survive a service restart',async()=>{
 const f=fixture();try{const checked=await f.service.check(request);
 f.db.exec("CREATE TRIGGER refuse_note BEFORE INSERT ON study_note_detail BEGIN SELECT RAISE(ABORT,'test-note-failure'); END");
 assert.throws(()=>f.service.accept({id:checked.id,decisions:['supported','unsupported']}),/test-note-failure/);
 assert.equal(f.db.prepare('SELECT result FROM practice_attempt').get().result,'pending');
 f.db.exec('DROP TRIGGER refuse_note');
 const restarted=new ExplainBackService(f.db,new SqliteSettingsRepository(f.db),async()=>[source],async()=>output());
 assert.equal(restarted.resume(checked.id).summary,request.summary);
 assert.equal(restarted.accept({id:checked.id,decisions:['supported','unsupported']}).attempt.result,'partial');
 }finally{f.db.close();}
});

test('missing information is a verdict on a learner claim, never an invented extra claim',()=>{
 const raw=JSON.parse(output());raw.verdicts[0].status='missing';assert.equal(validateExplainVerdicts(JSON.stringify(raw),segmentClaims(request.summary),[source])[0].status,'missing');
 raw.verdicts.push({claim:null,text:'invented outside fact',status:'missing',quote:source.text});assert.throws(()=>validateExplainVerdicts(JSON.stringify(raw),segmentClaims(request.summary),[source]),/invalid-output/);
});
test('Arabic exact quotes retain tashkeel and punctuation without spaces segments correctly',()=>{
 assert.deepEqual(segmentClaims('العِلْم نافع؛والماء ضروري'),['العِلْم نافع','والماء ضروري']);
 const text='العِلْم نافع والماء ضروري للحياة';
 const v=validateExplainVerdicts(JSON.stringify({verdicts:[{claim:0,status:'supported',quote:text}]}),['العِلْم نافع'],[{...source,target:'quran:hafs:2:255',text}]);assert.equal(v[0].status,'supported');
 assert.throws(()=>validateExplainVerdicts(JSON.stringify({verdicts:[{claim:0,status:'supported',quote:'العلم نافع'}]}),['العِلْم نافع'],[{...source,target:'quran:hafs:2:255',text}]),/invalid-output/);
});
