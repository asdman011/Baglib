// Installed-pack acceptance for KEY-171. Each phase owns only its throwaway Electron process.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = path.resolve(process.env.BAGLIB_KEY171_DIR);
const evidence = process.env.BAGLIB_KEY171_EVIDENCE;
assert.equal(path.dirname(directory), path.resolve('.baglib-data'));
assert.ok(path.basename(directory).startsWith('KEY-171-live-'));
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const errors = [];
  let blocked = 0;
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const host = new URL(details.url).hostname;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(host);
    if (!local) blocked++;
    callback({ cancel: !local });
  });
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let i = 0; i < 200; i++) { try { if (await evaluate(code)) return; } catch {} await pause(200); }
    throw Error('Timeout ' + code + '\n' + await evaluate('document.body.innerText.slice(-2000)'));
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const change = (selector, value) => evaluate(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (e.tagName === 'INPUT') Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(String(value))});
    else e.value = ${JSON.stringify(String(value))};
    e.dispatchEvent(new Event(e.tagName === 'INPUT' ? 'input' : 'change', {bubbles: true}));
  })()`);
  const shot = async name => {
    await pause(400); win.webContents.invalidate(); await pause(200);
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  win.webContents.on('did-finish-load', () => { evaluate("window.electronAPI?.settings.set('onboarding.v1', {seen: true})").catch(() => {}); });
  (async () => {
    win.setMinimumSize(320,400);win.show();win.focus();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    const catalog=await evaluate('window.electronAPI.quran.readerCatalog()');assert.equal(catalog.ok,true);
    const sources=catalog.data.sources;
    const script=sources.find(s=>s.kind==='script'&&s.profile==='hafs').id;
    const meanings=sources.find(s=>s.kind==='word-translation').id;
    const transliteration=sources.find(s=>s.kind==='word-transliteration').id;
    const layout=sources.find(s=>s.kind==='mushaf-layout'&&s.profile==='hafs').id;
    const gaps=[];
    for(const [surah,ayah,word] of [[2,181,4],[8,6,5],[13,37,9]]){
      const r=await evaluate(`window.electronAPI.quran.read(${JSON.stringify({script,surah,from:ayah,meanings,transliteration})})`);assert.equal(r.ok,true);
      const verse=r.data.ayahs.find(a=>a.number===ayah);const loc=`${surah}:${ayah}:${word}`;
      assert.ok(verse.annotations.meaning.missing.includes(loc));assert.equal(verse.words.find(w=>w.position===word).meaning,undefined);gaps.push({location:loc,coverage:verse.annotations});
    }
    const isolated=await evaluate(`window.electronAPI.quran.read(${JSON.stringify({script,surah:36,from:52,transliteration})})`);
    assert.deepEqual(isolated.data.ayahs[0].annotations.transliteration.missing,['36:52:7']);
    assert.ok(isolated.data.ayahs[0].words[0].transliteration);
    const matrix=[];
    for(const lang of ['ar','en'])for(const width of [1280,480]){
      const tag=lang+'-'+width;win.setContentSize(width,900);
      await evaluate(`localStorage.setItem('baglib-lang','${lang}')`);await win.loadURL('http://localhost:3000');
      await until(`document.documentElement.lang==='${lang}' && !!document.querySelector('footer')`);await pause(400);await click('[data-nav-item="quran"]');
      await until("!!document.querySelector('.mushaf-svg-surface [data-surah][data-aya]')");
      assert.equal(await evaluate('document.documentElement.dir'),lang==='ar'?'rtl':'ltr');
      if(await evaluate("document.querySelector('[data-reader-profile]').value")!==script)await change('[data-reader-profile]',script);
      const openWord=async(surah,ayah,word)=>{
        const lookup=await evaluate(`window.electronAPI.quran.mushafPageForAyah(${JSON.stringify({pack:layout,surah,ayah,script})})`);assert.equal(lookup.ok,true);
        await until("!!document.querySelector('[data-quran-secondary-controls] input[type=number]')");
        await change('[data-quran-secondary-controls] input[type=number]',lookup.data.pageNumber);
        const selector=`.mushaf-svg-surface [data-surah="${String(surah).padStart(3,'0')}"][data-aya="${String(ayah).padStart(3,'0')}"][data-word-index-in-ayah="${word}"]`;
        await until(`!!document.querySelector(${JSON.stringify(selector)})`);
        await pause(250);
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
      };
      await openWord(2,181,4);
      await until(`!!document.querySelector('[data-quran-word-location="2:181:4"] [data-quran-word-missing]')`);
      const missingText=await evaluate(`document.querySelector('[data-quran-word-location="2:181:4"]').textContent`);assert.match(missingText,/2:181:4/);
      await click(`[data-islamic-reader-panel] button[aria-label="${lang==='ar'?'معاني الكلمات':'Word meanings'}"]`);
      await until(`!!document.querySelector('[data-quran-word-location="2:181:4"] [data-quran-word-missing]')`);
      await evaluate(`document.querySelector('[data-quran-word-missing]').scrollIntoView({block:'center'})`);
      assert.equal(await evaluate(`document.querySelector('[data-quran-word-missing]').closest('dd').dir`),lang==='ar'?'rtl':'ltr');
      await shot('missing-'+tag);
      await click(`[data-islamic-reader-panel] button[aria-label="${lang==='ar'?'النقل الصوتي بالحروف':'Transliteration'}"]`);
      await until(`!!document.querySelector('[data-islamic-reader-panel] bdi[dir]')`);
      assert.equal(await evaluate(`document.querySelector('[data-islamic-reader-panel] bdi[dir]').dir`),lang==='ar'?'rtl':'ltr');
      await shot('transliteration-'+tag);
      await openWord(37,130,3);await until("!!document.querySelector('[data-quran-word-compatibility]')");
      assert.match(await evaluate("document.querySelector('[data-quran-word-compatibility]').textContent"),/37:130/);
      await evaluate(`document.querySelector('[data-quran-word-compatibility]').scrollIntoView({block:'start'})`);await shot('compatibility-'+tag);
      await openWord(1,1,1);await until("!!document.querySelector('[data-quran-occurrences=root] > button')");
      await click('[data-quran-occurrences=root] > button');await until("!!document.querySelector('[data-quran-occurrences=root] [data-quran-occurrence]')");
      assert.ok(await evaluate("document.querySelectorAll('[data-quran-occurrences=root] [data-quran-occurrence]').length<=50"));
      assert.equal(await evaluate("document.querySelector('[data-quran-occurrences=root] p[lang=ar]').dir"),'rtl');
      await click('[data-quran-occurrences=lemma] > button');await until("!!document.querySelector('[data-quran-occurrences=lemma] [data-quran-occurrence]')");
      await evaluate(`document.querySelector('[data-quran-occurrences=root]').scrollIntoView({block:'start'})`);
      await shot('occurrences-'+tag);
      await evaluate(`document.querySelector('[data-quran-occurrences=lemma]').scrollIntoView({block:'start'})`);
      await shot('lemma-'+tag);
      const target=await evaluate("[...document.querySelectorAll('[data-quran-occurrences=root] [data-quran-occurrence]')].find(e=>e.dataset.quranOccurrence!=='1:1')?.dataset.quranOccurrence");assert.ok(target);
      await click(`[data-quran-occurrences=root] [data-quran-occurrence="${target}"]`);
      const [su,ay]=target.split(':').map(Number);
      await until(`!!document.querySelector('.mushaf-svg-surface [data-surah="${String(su).padStart(3,'0')}"][data-aya="${String(ay).padStart(3,'0')}"]')`);
      await shot('jump-'+tag);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
      matrix.push({lang,width,passed:true,target});console.log(JSON.stringify(matrix.at(-1)));
    }
    assert.deepEqual(errors,[],'zero renderer errors');
    const result={matrix,gaps,rendererErrors:errors.length,blocked};fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.quit();
  })().catch(async error=>{console.error(error);console.error(JSON.stringify({errors}));try{await shot('failure');}finally{app.exit(1);}});
});
require('../../dist/main/index.js');
