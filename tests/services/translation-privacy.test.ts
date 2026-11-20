import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TranslationService } from '../../src/main/services/ai/translation.service';
import { DEFAULT_AI_SETTINGS, AIResearchService } from '../../src/main/services/ai/ai-research.service';
import { translationDestination, translationErrorCode, validateTranslationInput } from '../../src/shared/translation-privacy';
import type { AISettings, TranslationProviderId } from '../../src/shared/types/ai';
import { createTestDatabase } from '../helpers/test-db';
import { translations } from '../../src/renderer/translations';
const input = { text: 'عِلْمٌ mixed English', targetLang: 'en' };
const service = new TranslationService();
const settings = (translationProvider: TranslationProviderId): AISettings => ({ ...DEFAULT_AI_SETTINGS, translationProvider, translationApiKey: 'stub:fx' });
const allow = (value: AISettings): AISettings => ({ ...value, translationConsent: translationDestination(value)!.key });

test('dedicated translators refuse missing/cancelled/stale consent, disabled and malformed requests with zero content calls', async () => {
 const original = globalThis.fetch; let calls=0;
 globalThis.fetch = async () => { calls++; throw Error('must not send'); };
 try {
  for(const provider of ['deepl','google','yandex'] as const) {
   const value=settings(provider);
   await assert.rejects(service.translate(input,value),/permission-denied/);
   await assert.rejects(service.translate(input,{...allow(value),enabled:false}),/ai-disabled/);
   await assert.rejects(service.translate(input,{...allow(value),translationConsent:undefined}),/permission-denied/);
   await assert.rejects(service.translate(input,{...value,translationConsent:translationDestination(settings(provider==='deepl'?'google':'deepl'))!.key}),/permission-denied/);
  }
  for(const bad of [null,[],{}, {text:4},{text:''},{text:'x'.repeat(60001)},{text:'x',targetLang:'en&key=secret'},{text:'x',bookTitle:9}]) {
   assert.throws(()=>validateTranslationInput(bad),/invalid-request/);
   await assert.rejects(service.translate(bad as never,allow(settings('deepl'))),/invalid-request/);
  }
  assert.equal(calls,0);
 } finally {globalThis.fetch=original;}
});

test('each consented provider uses only its endpoint, blocks redirects and preserves mixed text', async () => {
 const original=globalThis.fetch;
 try {
  for(const provider of ['deepl','google','yandex'] as const) {
   const value=allow(settings(provider)); let calls=0;
   globalThis.fetch=async(url,init)=>{
    calls++; assert.ok(String(url).startsWith(translationDestination(value)!.endpoint)); assert.equal(init?.redirect,'error');
    assert.ok(String(init?.body).includes(input.text));
    return Response.json(provider==='google'?{data:{translations:[{translatedText:'translated'}]}}:{translations:[{text:'translated'}]});
   };
   assert.equal((await service.translate(input,value)).translatedText,'translated'); assert.equal(calls,1);
  }
 }finally{globalThis.fetch=original;}
});

test('public Google requires opt-in AND distinct endpoint consent; official failure never falls back',async()=>{
 const original=globalThis.fetch; let calls=0;
 globalThis.fetch=async(_url,init)=>{calls++;assert.equal(init?.redirect,'error');return Response.json([[['public translation']]],{status:200});};
 try{
  const publicSettings={...settings('google'),translationApiKey:undefined};
  await assert.rejects(service.translate(input,allow(publicSettings)),/not-configured/);assert.equal(calls,0);
  await assert.rejects(service.translate(input,{...publicSettings,googlePublicTranslation:true,translationConsent:translationDestination(settings('google'))!.key}),/permission-denied/);assert.equal(calls,0);
  assert.equal((await service.translate(input,allow({...publicSettings,googlePublicTranslation:true}))).providerUsed,'google-public');assert.equal(calls,1);
  calls=0;globalThis.fetch=async()=>{calls++;return new Response('secret key and private content',{status:503});};
  await assert.rejects(service.translate(input,allow({...settings('google'),googlePublicTranslation:true})),/provider-busy/);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});

test('DeepL endpoint changes and switching away/back invalidate stored translator consent in existing settings JSON',()=>{
 const db=createTestDatabase();try{
  const research=new AIResearchService(db);research.saveSettings(settings('deepl'));
  research.saveSettings({translationConsent:translationDestination(research.getSettings())!.key});
  assert.ok(research.getSettings().translationConsent);
  research.saveSettings({translationApiKey:'paid-key'});assert.equal(research.getSettings().translationConsent,undefined);
  research.saveSettings({translationConsent:translationDestination(research.getSettings())!.key});
  research.saveSettings({translationProvider:'yandex'});assert.equal(research.getSettings().translationConsent,undefined);
  research.saveSettings({translationProvider:'deepl'});assert.equal(research.getSettings().translationConsent,undefined);
 }finally{db.close();}
});

test('provider exceptions become codes, never keys, URLs or reflected content; localized copy exists in ar/en',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('https://provider?key=private&q=secret body');};
 try{await assert.rejects(service.translate(input,allow(settings('deepl'))),error=>{assert.equal(String(error),'Error: provider-error');return true;});}
 finally{globalThis.fetch=original;}
 assert.equal(translationErrorCode(Error('HTTP 401 secret')),'provider-auth');
 for(const lang of ['ar','en'] as const)for(const key of ['aiTranslationPublicGoogle','aiTranslationConsentNotice','aiPrivacyConsentRequired','aiPrivacyInvalidRequest'] as const)assert.ok(translations[lang][key]);
 assert.match(translations.ar.aiPrivacyConsentRequired,/[؀-ۿ]/);
});
