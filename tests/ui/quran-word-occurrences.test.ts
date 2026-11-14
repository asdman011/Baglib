import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { QuranWordOccurrences, QuranWordCompatibilityNotice } from '../../src/renderer/components/quran/QuranWordOccurrences';
import { translations, type TranslationKey } from '../../src/renderer/translations';
for (const lang of ['ar','en'] as const) for (const family of ['root','lemma'] as const) {
 test(`word ${family} / ${lang}: fifty-place bound, show more, jump and compatibility notice`, async()=>{
  const {window}=parseHTML('<html><body><div id="root"></div></body></html>');
  const globals={window,document:window.document,React,IS_REACT_ACT_ENVIRONMENT:true};
  const old=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const[key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  const places=Array.from({length:120},(_,i)=>({surah:2,ayah:i+1,count:1}));
  const requests: unknown[]=[];const jumps: unknown[]=[];
  Object.defineProperty(window,'electronAPI',{configurable:true,value:{quran:{frequencyPlaces:async(q:unknown)=>{requests.push(q);return{ok:true,data:places};}}}});
  const root=createRoot(window.document.getElementById('root')!);const t=(key:TranslationKey)=>translations[lang][key];
  const all=(s:string)=>[...window.document.querySelectorAll<HTMLElement>(s)];
  try {
   await act(async()=>root.render(createElement(React.Fragment,null,createElement(QuranWordCompatibilityNotice,{compatibility:'qul-37-130',t}),createElement(QuranWordOccurrences,{family,text:'رَحْمَة Mercy',t,onNavigateAyah:r=>jumps.push(r)}))));
   assert.equal(all('[data-quran-word-compatibility]')[0].textContent,t('quranWordCompatibility37130'));
   assert.match(t('quranWordCompatibility37130'),/37:130/);
   assert.ok(!t('quranWordCompatibility37130').includes('???'));
   assert.equal(all('[data-quran-occurrence]').length,0);
   await act(async()=>all('[data-quran-occurrences] > button')[0].click());
   assert.deepEqual(requests,[{family,text:'رَحْمَة Mercy'}]);
   assert.equal(all('[data-quran-occurrence]').length,50);
   assert.equal(all('[data-quran-occurrences] p[lang=ar]')[0].dir,'rtl');
   await act(async()=>all('[data-quran-occurrence-more]')[0].click());assert.equal(all('[data-quran-occurrence]').length,100);
   await act(async()=>all('[data-quran-occurrence]')[51].click());assert.deepEqual(jumps,[{surah:2,ayah:52}]);
   await act(async()=>all('[data-quran-occurrence-more]')[0].click());assert.equal(all('[data-quran-occurrence]').length,120);assert.equal(all('[data-quran-occurrence-more]').length,0);
   await act(async()=>all('[data-quran-occurrences] > button')[0].click());assert.equal(all('[data-quran-occurrence]').length,0);
  }finally{await act(async()=>root.unmount());for(const[key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}
 });
}
