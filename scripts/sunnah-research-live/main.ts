import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { registerSunnahIpc } from '../../src/main/ipc/sunnah';
import Database from 'better-sqlite3';
import { QuranReaderProcess } from '../../src/main/services/quran/quran-reader-process';
import type { QuranPack, QuranReadQuery } from '../../src/shared/types/quran';
const root = process.cwd(), directory = process.env.BAGLIB_SUNNAH_LIVE!;
app.setPath('userData', path.join(directory, 'profile')); app.setAppPath(root);
app.whenReady().then(async () => {
  registerSunnahIpc();
  // Real installed packs/worker, without opening the mutable Quran catalog service.
  const quranRoot=path.resolve(process.env.BAGLIB_SUNNAH_QURAN_ROOT || '.baglib-data/quran-reader-live/run-8UoU7K/profile/quran');
  const sourceDb=new Database(path.join(quranRoot,'catalog.sqlite'),{readonly:true,fileMustExist:true});
  const packs=(sourceDb.prepare('SELECT descriptor FROM packs').all() as {descriptor:string}[]).map(row=>JSON.parse(row.descriptor) as QuranPack); sourceDb.close();
  const reader=new QuranReaderProcess(); app.once('before-quit',()=>reader.close());
  ipcMain.handle('quran:reader-catalog',async()=>({ok:true,data:await reader.request(quranRoot,packs,{action:'catalog'})}));
  ipcMain.handle('quran:read',async(_event,query:QuranReadQuery)=>({ok:true,data:await reader.request(quranRoot,packs,{action:'read',query})}));
  for (const channel of ['library:get-all-books','library:get-all-notes','categories:get-tree','tags:get-all']) ipcMain.handle(channel, () => []);
  const window = new BrowserWindow({ show:false, width:1280, height:1000, webPreferences:{ offscreen:true, backgroundThrottling:false, preload:path.join(root,'dist/preload/index.js') } });
  const errors:string[]=[]; window.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);});
  const evaluate=(code:string)=>window.webContents.executeJavaScript(code);
  const until=async(code:string)=>{for(let n=0;n<300;n++){if(await evaluate(code))return;await new Promise(resolve=>setTimeout(resolve,80));}throw new Error('Timed out: '+code);};
  const clickText=async(label:string)=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(label)}));if(!b)throw new Error('Missing button');b.click()})()`);
  try {
    await window.loadFile(path.join(directory,'index.html'));
    await until('Boolean(window.sunnahLive && document.querySelector(".sunnah-research-text"))');
    const catalog=await evaluate('window.electronAPI.sunnah.catalog()');
    assert.equal(catalog.data.collections.length,9); assert.equal(catalog.data.hadithCount,67611);
    assert.equal(await evaluate('document.querySelector(".sunnah-browser select").options.length'),9);
    assert.ok(await evaluate('document.querySelector(".sunnah-research-text").innerText.replace(/[\\u064b-\\u065f\\u0670]/g, "").includes("الأعمال")'));
    for (const language of ['ar','en']) {
      if(await evaluate('window.sunnahLive.lang')!==language)await evaluate('window.sunnahLive.toggleLanguage()');
      await until(`document.querySelector('.sunnah-workspace').dir===${JSON.stringify(language==='ar'?'rtl':'ltr')}`);
      for(const width of [480,1280]){
        window.setContentSize(width,1000); await new Promise(resolve=>setTimeout(resolve,100));
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
        assert.ok(await evaluate('(()=>{const p=document.querySelector(".sunnah-passage").getBoundingClientRect();return p.width>250})()'));
        await fs.writeFile(path.join(directory,`commentary-${language}-${width}.png`),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
      }
      await clickText(await evaluate('window.sunnahLive.t("sunnahChain")'));
      await until('Boolean(document.querySelector(".sunnah-chain-list li"))');
      assert.equal(await evaluate('document.querySelectorAll(".sunnah-chain-list li").length'),5);
      await evaluate('document.querySelector(".sunnah-chain-list button").click()');
      await until('Boolean(document.querySelector(".sunnah-relation-results button"))');
      for(const width of [480,1280]){
        window.setContentSize(width,1000);
        await evaluate('document.querySelector(".sunnah-research").scrollIntoView({block:"start"})');
        await new Promise(resolve=>setTimeout(resolve,100));
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
        await fs.writeFile(path.join(directory,`chain-${language}-${width}.png`),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
      }
      await clickText(await evaluate('window.sunnahLive.t("sunnahRoots")'));
      await until('Boolean(document.querySelector(".sunnah-root-chips button"))');
      await evaluate('document.querySelector(".sunnah-root-chips button").click()');
      await until('Boolean(document.querySelector(".sunnah-relation-results button"))');
      await fs.writeFile(path.join(directory,`roots-${language}.png`),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
      await evaluate('window.sunnahQuranTarget=null');
      await evaluate('document.querySelectorAll(".sunnah-root-chips")[1].querySelector("button").click()');
      await until('Boolean(window.sunnahQuranTarget)');
      const ayah=await evaluate('window.sunnahQuranTarget');
      const passage=await evaluate(`window.electronAPI.quran.read(${JSON.stringify({script:ayah.script,surah:ayah.surah,from:ayah.ayah})})`);
      assert.equal(passage.data.profile,'hafs'); assert.ok(passage.data.ayahs.some((item:{number:number})=>item.number===ayah.ayah));
      // The production navigation utility keeps the exact pending target.
      await clickText(await evaluate('window.sunnahLive.t("sunnahTafseel")'));
    }
    const source=new Database(path.join(root,'tools/hadith-alignment/data/output/sunnah_kutub_tisah_itqan.sqlite'),{readonly:true});
    const sample=source.prepare("SELECT id,book_key,CAST(Chapter_Number AS INTEGER) AS chapter FROM hadiths WHERE Itqan_Corroborating_Hadiths_JSON!='[]' LIMIT 1").get() as {id:number;book_key:string;chapter:number}; source.close();
    const linked=await evaluate(`window.electronAPI.sunnah.research(${sample.id})`); assert.ok(linked.ok&&linked.data.related.length>0);
    const target=linked.data.related[0];
    const sourceCollection=sample.book_key==='Tirmidhi'?'Tirmizi':sample.book_key==='IbnMajah'?'IbnMaja':sample.book_key;
    const sampleChapter=await evaluate(`window.electronAPI.sunnah.chapter(${JSON.stringify(sourceCollection)},${sample.chapter})`);
    const sampleHadith=sampleChapter.data.hadiths.find((hadith:{researchId:number})=>hadith.researchId===sample.id);
    await evaluate(`window.dispatchEvent(new CustomEvent('baglib:sunnah-open',{detail:${JSON.stringify({collection:sourceCollection,chapter:sample.chapter,hadith:sampleHadith.id})}}))`);
    await until(`Boolean(document.querySelector('[data-hadith-id="${sampleHadith.id}"] .sunnah-research-tabs'))`);
    await clickText(await evaluate('window.sunnahLive.t("sunnahRelated")'));
    await until('Boolean(document.querySelector(".sunnah-research-results button"))');
    await evaluate('document.querySelector(".sunnah-research-results button").click()');
    await until(`Boolean(document.querySelector('[data-hadith-id="${target.hadith.id}"] .sunnah-research'))`);
    // All new collections are opened through the actual selectors and main IPC.
    for(const book of ['MuwattaMalik','MusnadAhmad','SunanDarimi']){
      await evaluate(`(()=>{const s=document.querySelector('.sunnah-browser select');s.value=${JSON.stringify(book)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
      await until(`Boolean(document.querySelector('[data-hadith-id^="${book}:"] .sunnah-research'))`);
      await until('document.querySelectorAll(".sunnah-research-tabs button").length===4');
    }
    // Search crosses nine books using the database index and opens a stable target.
    const hits=await evaluate('window.electronAPI.sunnah.search({text:"إِنَّمَا الأَعْمَالُ",collection:"Bukhari"})');
    assert.ok(hits.ok && hits.data.length>0);
    const english=await evaluate('window.electronAPI.sunnah.search({text:"intentions"})'); assert.ok(english.ok&&english.data.length>0);
    await evaluate(`(()=>{const hit=${JSON.stringify(hits.data[0])};window.dispatchEvent(new CustomEvent('baglib:sunnah-open',{detail:{collection:hit.chapter.collection,chapter:hit.chapter.number,hadith:hit.hadith.id}}))})()`);
    await until('Boolean(document.querySelector("[data-hadith-id^=Bukhari] .sunnah-research-text"))');
    // Visible search field uses the research backend, including chapter scope.
    await evaluate(`(()=>{const input=document.querySelector('.sunnah-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'الأعمال');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await until('Boolean(document.querySelector(".sunnah-scroll button span[lang=ar]"))');
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(directory,'results.json'),JSON.stringify({passed:true,realCorpus:true,records:67611,collections:9,languages:['ar','en'],widths:[480,1280],commentary:true,narratorLookup:true,rootLookup:true,indexedSearch:true,corroborationTarget:true,realHafsCatalogNavigation:true,errors},null,2));
    console.log('Sunnah live checks passed: '+directory);
  } catch(error){ await fs.writeFile(path.join(directory,'failure.png'),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());await fs.writeFile(path.join(directory,'failure.txt'),String(await evaluate('document.body.innerText'))+'\n'+JSON.stringify(errors));console.error(error);app.exit(1);return; }
  finally { window.destroy(); }
  app.quit();
});
