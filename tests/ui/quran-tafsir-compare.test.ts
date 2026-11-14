import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { QuranTafsirCompare } from '../../src/renderer/components/quran/QuranTafsirCompare';
import { translations, type TranslationKey } from '../../src/renderer/translations';

for (const lang of ['ar', 'en'] as const) for (const scenario of ['compare', 'one', 'none'] as const) {
  test(`tafsir comparison ${scenario} / ${lang}: limits, direction, persistence and stale requests`, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    const globals = { window, document: window.document, React, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis,key)]));
    for (const [key,value] of Object.entries(globals)) Object.defineProperty(globalThis,key,{ configurable:true,writable:true,value });
    const count = scenario === 'compare' ? 5 : scenario === 'one' ? 1 : 0;
    const sources = Array.from({length:count}, (_,i)=>({ id:String(i),title:i===0?'تَفْسِير عربي':'English tafsir '+i,kind:'tafsir',profile:'hafs',language:i===0?'ar':'en' }));
    sources.push({id:'warsh',title:'Other profile',kind:'tafsir',profile:'warsh',language:'ar'});
    const requests: {pack:string;ayah:number}[] = []; const saves: unknown[] = [];
    let resolveOld: (()=>void) | undefined;
    Object.defineProperty(window,'electronAPI',{configurable:true,value:{settings:{ get:async()=>['removed','0','0','1','2','3','4'], set:async(...args:unknown[])=>{saves.push(args);} },quran:{
      readerCatalog:async()=>({ok:true,data:{sources,presets:[]}}),onChanged:()=>()=>{},
      commentary:async (q:{pack:string;ayah:number})=>{
        requests.push(q);
        if(q.ayah===2) await new Promise<void>(resolve=>{const old=resolveOld;resolveOld=()=>{old?.();resolve();};});
        if(q.pack==='1' && q.ayah===3) throw Error('Missing pack/ayah');
        return {ok:true,data:{from:`1:${q.ayah}`,to:`1:${q.ayah+1}`,nodes:[{tag:'text',text:`ayah-${q.ayah} رَحْمَة Mercy`}]}};
      }
    }}});
    const root=createRoot(window.document.getElementById('root')!);
    const $=(s:string)=>window.document.querySelector<HTMLElement>(s);
    const all=(s:string)=>[...window.document.querySelectorAll<HTMLElement>(s)];
    const reactProps=(e:Element)=>(e as unknown as Record<string,{onChange:(event:unknown)=>void}>)[Object.keys(e).find(k=>k.startsWith('__reactProps$'))!];
    let reference={surah:1,ayah:1};
    const t=(key:TranslationKey,params?:Record<string,string|number>)=>{let value:string=translations[lang][key];for(const[k,v]of Object.entries(params||{}))value=value.replaceAll('{'+k+'}',String(v));return value;};
    const render=()=>root.render(createElement(QuranTafsirCompare,{script:'script',profile:'hafs',preferred:'0',reference,surahs:[{number:1,count:7},{number:2,count:286}],t,lang,onReference:r=>{reference=r;render();}}));
    const settle=()=>act(async()=>new Promise(resolve=>setTimeout(resolve,180)));
    try {
      await act(async()=>render());await settle();
      assert.equal(all('[data-tafsir-picker]').length,count,'profile filter');
      assert.equal(all('[data-tafsir-column]').length,Math.min(4,count));
      assert.equal(!!$('[data-tafsir-few]'),count<2);
      assert.ok(!requests.some(q=>q.pack==='warsh'));
      if(count){assert.equal($('[data-tafsir-column="0"]')!.dir,'rtl');assert.ok($('[data-tafsir-range]')?.textContent?.includes('1'));}
      if(scenario==='compare'){
        assert.equal($('[data-tafsir-column="1"]')!.dir,'ltr');
        assert.equal($('[data-tafsir-picker="4"]')!.hasAttribute('disabled'),true);
        const choose=async(id:string,checked:boolean)=>{await act(async()=>reactProps($(`[data-tafsir-picker="${id}"]`)!).onChange({target:{checked}}));await settle();};
        await choose('3',false);await choose('2',false);
        assert.equal(all('[data-tafsir-column]').length,2);assert.equal($('[data-tafsir-picker="0"]')!.hasAttribute('disabled'),true);
        assert.deepEqual(saves.at(-1),['quran.tafsir.compare.v1.hafs',['0','1']]);
        await act(async()=>$('[data-tafsir-next]')!.click());await settle(); // delayed ayah 2
        await act(async()=>$('[data-tafsir-next]')!.click());await settle(); // ayah 3 wins
        assert.equal($('[data-tafsir-compare]')!.getAttribute('data-reference'),'1:3');
        assert.equal(all('[data-tafsir-unavailable]').length,1);assert.equal($('[data-tafsir-unavailable]')!.textContent,t('quranTafsirUnavailable'));
        assert.match($('[data-tafsir-column="0"]')!.textContent!,/ayah-3/);
        await act(async()=>resolveOld?.());await settle();
        assert.match($('[data-tafsir-column="0"]')!.textContent!,/ayah-3/);assert.doesNotMatch(window.document.body.textContent,/ayah-2/);
        assert.equal($('script'),null);
        reference={surah:1,ayah:7};await act(async()=>render());await settle();await act(async()=>$('[data-tafsir-next]')!.click());await settle();assert.deepEqual(reference,{surah:2,ayah:1});
        await act(async()=>$('[data-tafsir-previous]')!.click());await settle();assert.deepEqual(reference,{surah:1,ayah:7});
      }
    } finally { resolveOld?.();await act(async()=>root.unmount());for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);} }
  });
}
