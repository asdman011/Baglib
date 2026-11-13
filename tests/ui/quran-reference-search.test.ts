import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { QuranSearchDialog } from '../../src/renderer/components/quran/QuranSearchDialog';
import { StudySourcesSearch } from '../../src/renderer/components/search/StudySourcesSearch';
import { StudyLinkPicker } from '../../src/renderer/components/notes/StudyLinkPicker';
import { translations } from '../../src/renderer/translations';
import { validStudyTarget } from '../../src/shared/study-notes';

for (const language of ['ar','en'] as const) for (const surface of ['dialog','global','picker'] as const) {
  test(`Quran references, ordinary results and translation sources in ${surface} / ${language}`, async () => {
    const {window} = parseHTML('<html><body><div id="root"></div></body></html>');
    const globals = {window,document:window.document,React,IS_REACT_ACT_ENVIRONMENT:true};
    const previous = new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
    for(const [key,value] of Object.entries(globals)) Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    Object.defineProperty(window.HTMLElement.prototype,'showModal',{configurable:true,value(){}});
    const requests: {translations?:string[];includeScript?:boolean}[] = [];
    const inserted: string[] = []; const opened: unknown[] = []; const saved: unknown[] = [];
    const sources = [{id:'script',title:'Arabic',kind:'script',profile:'hafs'},{id:'translation',title:'Saheeh International',kind:'translation',profile:'hafs'}];
    Object.defineProperty(window,'electronAPI',{configurable:true,value:{
      getAllBooks:async()=>[],getAllNotes:async()=>[],getCategoryTree:async()=>[],
      settings:{get:async()=>undefined,set:async(...args:unknown[])=>{saved.push(args);}},
      quran:{readerCatalog:async()=>({ok:true,data:{sources,presets:[]}}),searchAyahs:async(q:typeof requests[number])=>{requests.push(q);return {ok:true,data:[{surah:1,ayah:3,text:'Mercy رَحْمَة',source:{id:'translation',title:'Saheeh International',kind:'translation'}}]};}},
      sunnah:{search:async()=>({ok:true,data:[]})},poetry:{search:async()=>({ok:true,data:{items:[]}})}
    }});
    let workspace!:ReturnType<typeof useWorkspace>; let query='2:255';
    const root=createRoot(window.document.getElementById('root')!);
    const $=(selector:string)=>window.document.querySelector<HTMLElement>(selector);
    const props=(e:Element)=>(e as unknown as Record<string,{onChange:(event:unknown)=>void}>)[Object.keys(e).find(k=>k.startsWith('__reactProps$'))!];
    function Harness(){workspace=useWorkspace();return surface==='dialog'?createElement(QuranSearchDialog,{onClose:()=>{},onSetup:()=>{},onOpen:(target:unknown)=>opened.push(target)}):surface==='global'?createElement(StudySourcesSearch,{query,onLeave:()=>{}}):createElement(StudyLinkPicker,{notes:[],onInsert:(text:string)=>inserted.push(text)});}
    const settle=()=>act(async()=>new Promise(r=>setTimeout(r,350)));
    const change=async(value:string)=>{query=value;await act(async()=>{if(surface==='global')root.render(createElement(WorkspaceProvider,null,createElement(Harness)));else props($('input')!).onChange({target:{value:surface==='picker'?'/quran '+value:value}});});await settle();};
    try {
      await act(async()=>root.render(createElement(WorkspaceProvider,null,createElement(Harness))));await settle();
      if(language==='en')await act(async()=>workspace.toggleLanguage());
      for(const text of ['2:255','٢:٢٥٥','البقرة 255','Al-Baqarah 255']){
        await change(text);
        const label=translations[language].quranReferenceJump.split('{reference}')[0];
        const jump=surface==='picker'?[...window.document.querySelectorAll('button')].find(b=>b.textContent?.startsWith(label)):$('[data-quran-reference]');
        assert.ok(jump, text);assert.ok(jump.textContent?.includes(language==='ar'?'البقرة':'Al-Baqarah'));
      }
      for(const text of ['الصلاة','mercy']){await change(text);assert.equal($('[data-quran-reference]'),null);assert.ok(window.document.body.textContent.includes('Mercy رَحْمَة'));}
      assert.ok(requests.some(q=>q.translations?.includes('translation')));
      if(surface==='dialog'){
        await change('2:255');await act(async()=>$('[data-quran-reference]')!.click());assert.deepEqual(opened,[{script:'script',surah:2,ayah:255}]);
        await act(async()=>props($('[data-quran-search-filter]')!).onChange({target:{value:'translations'}}));await settle();assert.equal(requests.at(-1)?.includeScript,false);
        await act(async()=>props($('[data-quran-search-filter]')!).onChange({target:{value:'arabic'}}));await settle();assert.deepEqual(requests.at(-1)?.translations,[]);assert.equal(saved.length,2);
      }
      if(surface==='picker'){
        await change('2:255-257');const jump=[...window.document.querySelectorAll('button')].find(b=>b.textContent?.startsWith(translations[language].quranReferenceJump.split('{reference}')[0]))!;
        await act(async()=>jump.click());assert.ok(inserted[0].includes('quran:hafs:2:255-257'));assert.ok(validStudyTarget('quran:hafs:2:255-257'));
      }
      assert.equal(window.document.documentElement.getAttribute('dir'),language==='ar'?'rtl':'ltr');
    }finally{await act(async()=>root.unmount());for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}
  });
}
