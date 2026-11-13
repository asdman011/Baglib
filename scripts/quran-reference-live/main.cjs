const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_KEY169_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  owner.webContents.on('did-finish-load', () => { owner.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch { /* retry */ } await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(400); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(process.env.BAGLIB_KEY169_EVIDENCE, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const setValue = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await owner.loadURL('http://localhost:3000');
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`);
    await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await pause(800);
  };
  (async () => {
    const matrix=[];
    for(const language of ['ar','en']) for(const width of [1280,480]){
      await load(language);owner.setContentSize(width,900);await pause(400);
      assert.equal(await evaluate('document.documentElement.dir'),language==='ar'?'rtl':'ltr');
      // Use the actual titlebar entry, including its accessible label. Narrow acceptance opens at desktop then resizes.
      const openSearch=async()=>{
        await evaluate(`(()=>{const b=[...document.querySelectorAll('button[aria-label]')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(language==='ar'?'البحث في القرآن':'Search Quran')});if(!b)throw Error('Quran search button missing');b.click();})()`);
        await until("!!document.querySelector('[data-quran-search] input')");
      };
      await openSearch();
      const input='[data-quran-search] input';
      const changeFilter=async value=>{await evaluate(`(()=>{const e=document.querySelector('[data-quran-search-filter]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(450);};
      for(const query of ['2:255','٢:٢٥٥','البقرة 255','Al-Baqarah 255']){
        await setValue(input,query);await until("!!document.querySelector('[data-quran-reference]')");
        const label=await evaluate("document.querySelector('[data-quran-reference]').textContent");
        assert.ok(label.includes(language==='ar'?'البقرة':'Al-Baqarah'));
      }
      for(const query of ['الصلاة','mercy']){
        await setValue(input,query);await pause(650);assert.equal(await evaluate("!!document.querySelector('[data-quran-reference]')"),false);
      }
      await changeFilter('translations');await setValue(input,'mercy');
      await until("!!document.querySelector('[data-quran-search-hit]')");
      const translated=await evaluate("document.querySelector('[data-quran-search-hit]').textContent");assert.match(translated,/Saheeh International/);assert.match(translated,/merc/iu);
      await shot('translations-'+language+'-'+width);
      await changeFilter('arabic');
      await until("document.querySelector('[data-quran-search] [role=status]')?.textContent && !document.querySelector('[data-quran-search-hit]')");
      await setValue(input,'الرحمن');await until("!!document.querySelector('[data-quran-search-hit]')");
      assert.ok(!(await evaluate("[...document.querySelectorAll('[data-quran-search-hit]')].map(e=>e.textContent).join(' ')")).includes('Saheeh International'));
      assert.equal(await evaluate("!!document.querySelector('[data-quran-reference]')"),true,'surah name coexists with ordinary text results');
      await changeFilter('both');await setValue(input,'2:255-257');
      await until("!!document.querySelector('[data-quran-reference]')");await shot('reference-'+language+'-'+width);
      assert.equal(await evaluate("(()=>{const e=document.querySelector('[data-quran-search]');return e.scrollWidth<=e.clientWidth+1})()"),true,'dialog has no horizontal overflow');
      await evaluate("document.querySelector('[data-quran-reference]').click()");
      await until("!document.querySelector('[data-quran-search]') && (!!document.querySelector('[data-quran-mushaf]') || !!document.querySelector('[data-quran-ayah-actions]'))",200);
      await until("[...document.querySelectorAll('[data-quran-workspace] p[dir=ltr]')].some(e=>e.textContent.trim()==='2:255') && !!document.querySelector('[data-quran-workspace] [data-aya=\"255\"]')",200);
      await pause(900);await shot('jump-'+language+'-'+width);
      const remembered=await evaluate("window.electronAPI.settings.get('quran.search.sources.v1')");assert.equal(remembered,'both');
      // Global source search uses the same direct-reference navigation path.
      await evaluate("window.dispatchEvent(new CustomEvent('baglib:search-selection',{detail:'Al-Baqarah 255'}))");
      await pause(500);
      await evaluate(`(()=>{const buttons=[...document.querySelectorAll('[role=dialog] button')];const b=buttons.find(b=>b.textContent.trim()===${JSON.stringify(language==='ar'?'القرآن والسنة والشعر':'Quran, Sunnah and poetry')});if(!b)throw Error('Sources tab missing: '+buttons.map(b=>b.textContent).join('|'));b.click();})()`);
      await until("!!document.querySelector('[data-quran-reference]')");await shot('global-'+language+'-'+width);
      await evaluate("document.querySelector('[data-quran-reference]').click()");await pause(500);
      matrix.push({language,width,passed:true});console.log(JSON.stringify(matrix.at(-1)));
    }
    assert.deepEqual(consoleLines,[],'zero renderer errors');
    console.log(JSON.stringify({matrix,passed:matrix.length,rendererErrors:consoleLines.length}));app.quit();
  })().catch(async error=>{console.error(error);try{await shot('failure');}finally{app.exit(1);}});
});
require('../../dist/main/index.js');
