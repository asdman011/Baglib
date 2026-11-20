import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiPrivacyError, isLocalAi, remoteConsentKey, aiConsentEndpoint } from '../../src/shared/ai-consent';
import { aiOperationErrorCode, AiOperationError } from '../../src/shared/ai-errors';
import { AIProviderService } from '../../src/main/services/ai/ai-provider.service';
import { AIResearchService, DEFAULT_AI_SETTINGS } from '../../src/main/services/ai/ai-research.service';
import { authorizeAiSender } from '../../src/main/ipc/ai';
import { runAssistantChat } from '../../src/main/services/ai/assistant-chat';
import { createTestDatabase } from '../helpers/test-db';
import { aiErrorText } from '../../src/renderer/components/ai/ai-error-text';
import { translations } from '../../src/renderer/translations';
import { validatePdfAnswerOptions } from '../../src/shared/types/pdf-collaboration';
import { resolveLearningMode } from '../../src/shared/ai-learning-mode';
import type { AISettings } from '../../src/shared/types/ai';

test('one local classification covers custom IPv4/IPv6/localhost and rejects remote or credentialed addresses',()=>{
 for(const endpoint of ['http://127.0.0.1:1234/v1','http://localhost:1234/v1','http://[::1]:1234/v1']){
  const settings={...DEFAULT_AI_SETTINGS,provider:'custom' as const,customBaseUrl:endpoint};
  assert.equal(isLocalAi(settings),true);assert.equal(remoteConsentKey(settings),null);assert.equal(aiPrivacyError(settings,false),null);
 }
 for(const endpoint of ['https://remote.example/v1','http://127.0.0.1.example/v1','http://user:secret@127.0.0.1/v1','file:///tmp/model',''])assert.equal(isLocalAi({provider:'custom',customBaseUrl:endpoint}),false);
 assert.equal(isLocalAi({provider:'ollama',ollamaEndpoint:'http://localhost:11434'}),true);
 assert.equal(aiConsentEndpoint({provider:'custom',customBaseUrl:'https://user:secret@example.com/v1?key=secret#private'}),'https://example.com/v1');
});

test('stored consent plus explicit action are required; revocation defeats a stale allowRemote flag',()=>{
 const remote={...DEFAULT_AI_SETTINGS,provider:'openai' as const,apiKey:'stub'};
 assert.equal(aiPrivacyError(remote,true),'permission-denied');
 const allowed={...remote,remoteConsent:remoteConsentKey(remote)!};
 assert.equal(aiPrivacyError(allowed,true),null);assert.equal(aiPrivacyError(allowed,false),'permission-denied');
 assert.equal(aiPrivacyError({...allowed,remoteConsent:undefined},true),'permission-denied');
 assert.equal(aiPrivacyError({...allowed,baseUrl:'https://another.example/v1'},true),'permission-denied');
 assert.equal(aiPrivacyError({...allowed,enabled:false},true),'ai-disabled');
});

test('real provider boundary guards direct calls, supports custom local models and never follows redirects',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_url,init)=>{calls++;assert.equal(init?.redirect,'error');return Response.json({choices:[{message:{content:'جواب Answer'}}]});};
 try{
  const service=AIProviderService.getInstance(),prompt={systemPrompt:'s',userPrompt:'عِلْمٌ mixed English',preventRedirect:false};
  const local={...DEFAULT_AI_SETTINGS,provider:'custom' as const,customBaseUrl:'http://127.0.0.1:1234/v1',customModel:'stub'};
  assert.equal(await service.generateChatCompletion(prompt,local),'جواب Answer');assert.equal(calls,1);
  const remote={...DEFAULT_AI_SETTINGS,provider:'openai' as const,apiKey:'stub'};
  await assert.rejects(service.generateChatCompletion(prompt,remote),/permission-denied/);assert.equal(calls,1);
  const allowed={...remote,remoteConsent:remoteConsentKey(remote)!};await service.generateChatCompletion(prompt,allowed);assert.equal(calls,2);
  await assert.rejects(service.generateChatCompletion(prompt,{...allowed,remoteConsent:undefined}),/permission-denied/);assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});

test('legacy chat rejects unconsented/revoked remote access before library reads and validates direct legacy payloads',async()=>{
 const db=createTestDatabase();let reads=0,calls=0;
 const settings={...DEFAULT_AI_SETTINGS,provider:'gemini' as const,geminiApiKey:'stub'};
 const request={messages:[{role:'user',text:'Question?'}],sources:[{target:'note:private',label:'Private'}],lang:'en',allowRemote:true};
 const deps={db,settings,resolve:async()=>{reads++;return [];},complete:async()=>{calls++;return 'answer';}};
 try{
  assert.deepEqual(await runAssistantChat(request,deps),{ok:false,error:'permission-denied'});assert.equal(reads,0);assert.equal(calls,0);
  settings.remoteConsent='gemini';assert.equal((await runAssistantChat(request,deps)).ok,true);assert.equal(reads,1);
  settings.remoteConsent=undefined;assert.deepEqual(await runAssistantChat(request,deps),{ok:false,error:'permission-denied'});assert.equal(reads,1);assert.equal(calls,1);
  const legacy=new AIResearchService(db);for(const payload of [null,{}, {tool:'chat',bookTitle:'Book',currentPage:1,selectedText:{secret:'x'}},{tool:'run_shell',bookTitle:'x',currentPage:1}])await assert.rejects(legacy.executeTool(payload as never),/invalid-request/);
 }finally{db.close();}
});

test('dedicated IPC sender guards reject subframes and remote origins',()=>{
 const event=(url:string,subframe=false)=>{const frame={url};return {senderFrame:frame,sender:{mainFrame:subframe?{}:frame}} as never;};
 for(const url of ['app://-/','http://localhost:3000/','file:///D:/Baglib/out/index.html'])assert.doesNotThrow(()=>authorizeAiSender(event(url)));
 for(const url of ['https://attacker.example/','http://localhost:3001/','app://attacker/','http://user:secret@localhost:3000/'])assert.throws(()=>authorizeAiSender(event(url)),/invalid-request/);
 assert.throws(()=>authorizeAiSender(event('app://-/',true)),/invalid-request/);
});

test('common errors remain typed/localized and never reflect raw secrets or source text',()=>{
 for(const code of ['permission-denied','ai-disabled','learning-mode-off','invalid-request','not-configured','provider-quota','provider-error'] as const){
  assert.equal(aiOperationErrorCode(new AiOperationError(code)),code);
  for(const lang of ['ar','en'] as const){const text=aiErrorText(code,key=>translations[lang][key]);assert.ok(text);assert.ok(!text.includes(code));}
 }
 assert.equal(aiErrorText('learning-mode-off', key => translations.en[key]), translations.en.aiLearningModeOffNotice);
 assert.equal(aiErrorText('learning-mode-off', key => translations.ar[key]), translations.ar.aiLearningModeOffNotice);
 assert.equal(aiOperationErrorCode(Error('private source secret key not standardized')),'provider-error');
 assert.equal(aiOperationErrorCode(Error('HTTP 429 private source and key')),'provider-quota');
});

test('PDF answer options validate learning-mode attempt & reveal flags and resolve reader mode',()=>{
 assert.deepEqual(validatePdfAnswerOptions({ mode: 'qa', fromPage: 1, toPage: 3, revealFullAnswer: true, attempt: 'My attempt' }), { mode: 'qa', fromPage: 1, toPage: 3, revealFullAnswer: true, attempt: 'My attempt' });
 assert.throws(() => validatePdfAnswerOptions({ mode: 'qa', revealFullAnswer: 'yes' }), /invalid-request/);
 assert.throws(() => validatePdfAnswerOptions({ mode: 'qa', attempt: 'x'.repeat(4001) }), /invalid-request/);
 assert.equal(resolveLearningMode({ ...DEFAULT_AI_SETTINGS, learningModes: { ...DEFAULT_AI_SETTINGS.learningModes, reader: 'off' } }, 'reader'), 'off');
 assert.equal(resolveLearningMode(DEFAULT_AI_SETTINGS, 'reader'), 'hints');
});
