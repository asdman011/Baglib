const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_KEY305_DIR;
const evidence = process.env.BAGLIB_KEY305_EVIDENCE;
const phase = process.env.BAGLIB_KEY305_PHASE || 'matrix';
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
app.setAsDefaultProtocolClient = () => { throw Error('Protocol registration forbidden'); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) throw Error('Only one Electron window is allowed');
  started = true;
  const errors = [];
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = script => win.webContents.executeJavaScript(script, true);
  // KEY-317: throwaway profiles would show the KEY-307 first-run guide, which takes focus.
  win.webContents.on('did-finish-load', () => { win.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until = async script => {
    const end = Date.now() + 90000;
    while (Date.now() < end) {
      try { if (await evaluate(script)) return; } catch {}
      await sleep(200);
    }
    throw Error('Timeout ' + script + '\n' + await evaluate('document.body.innerText.slice(-2000)'));
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const shot = async name => {
    await until("!document.querySelector('[data-splash-screen]') && !document.querySelector('[role=dialog][aria-label=Loading]')");
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await sleep(600);
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  const navigate = async id => {
    await click(`[data-nav-item="${id}"]`);
    await sleep(200);
  };
  const study = async target => {
    win.webContents.send('study:navigate', target);
    await sleep(250);
  };
  const select = (selector, value) => evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('change', {bubbles:true}));
  })()`);
  const overflow = async selector => {
    const geometry = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); const r=e.getBoundingClientRect(); return {x:r.x,right:r.right,width:innerWidth,scroll:e.scrollWidth,client:e.clientWidth}; })()`);
    assert.ok(geometry.x >= -1 && geometry.right <= geometry.width + 1, JSON.stringify(geometry));
    assert.ok(geometry.scroll <= geometry.client + 2, JSON.stringify(geometry));
  };
  const panelCheck = async (reader, tag) => {
    const prefix = reader === 'quran' ? '[data-quran-reader]' : reader === 'poetry' ? '[data-poetry-id]' : '.sunnah-workspace';
    if (!await evaluate('!!document.querySelector("[data-islamic-reader-panel]")')) await click(prefix + ' [data-reader-panel-toggle]');
    await until('!!document.querySelector("[data-islamic-reader-panel]")');
    await overflow('[data-islamic-reader-panel]');
    await shot('after-' + reader + '-panel-' + tag);
    const overlap = await evaluate(`(() => {
      const panel=document.querySelector('[data-islamic-reader-panel]').getBoundingClientRect();
      const tip=document.querySelector('[data-companion-toggle]');
      if (!tip) return false;
      const r=tip.getBoundingClientRect();
      return r.width>0 && r.x<panel.right && r.right>panel.x && r.y<panel.bottom && r.bottom>panel.y;
    })()`);
    assert.equal(overlap,false,'Panel collides with side-note tip');
    // Exercise every shared tab with keyboard focus, preserving the existing content handlers.
    for (const index of [1,2,3,0]) {
      await evaluate(`document.querySelectorAll('[data-islamic-reader-panel] [role=tab]')[${index}].click()`);
      await sleep(100);
      assert.equal(await evaluate('document.querySelectorAll("[data-islamic-reader-panel] [role=tabpanel]").length'),1);
    }
    await click('[data-islamic-reader-panel] > div > button');
    await until('!document.querySelector("[data-islamic-reader-panel]")');
    await click(prefix + ' [data-reader-settings]');
    await until(`!!document.querySelector('${prefix} [data-reader-settings][aria-expanded=true]')`);
    await overflow(prefix + ' [data-reader-settings-popover]');
    await shot('after-' + reader + '-settings-' + tag);
    await click(prefix + ' [data-reader-settings]');
  };
  (async () => {
    win.setMinimumSize(320,400);
    win.show();
    win.focus();
    win.webContents.focus();
    win.setContentSize(1280,900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await sleep(3000);
    if (phase === 'restart') {
      const expected = JSON.parse(fs.readFileSync(path.join(directory,'continue-expected.json'),'utf8'));
      for (const kind of ['quran','sunnah','poetry']) {
        assert.deepEqual(await evaluate(`window.electronAPI.settings.get('islamic.continue.v1.${kind}')`), expected[kind]);
      }
      await navigate('islamic');
      await until('document.querySelectorAll("[data-continue-reading]").length === 3');
      await shot('after-restart-hub');
      for (const kind of ['quran','sunnah','poetry']) {
        await navigate('islamic');
        await until(`!!document.querySelector('[data-continue-reading="${kind}"]')`);
        await click(`[data-continue-reading="${kind}"]`);
        const selector = kind === 'quran' ? '.mushaf-svg-surface [data-surah]' : kind === 'sunnah' ? '[data-hadith-id]' : '[data-poetry-row]';
        await until(`!!document.querySelector(${JSON.stringify(selector)})`);
        if (kind === 'quran') {
          assert.equal(await evaluate("document.querySelector('[data-quran-workspace]').dataset.pageProfile"),expected.quran.target.split(':')[1]);
        } else if (kind === 'sunnah') {
          assert.equal(await evaluate("document.querySelector('[data-hadith-id]').dataset.hadithId"),expected.sunnah.target.split(':').slice(3).join(':'));
        } else {
          assert.equal(await evaluate("document.querySelector('[data-poetry-id]').dataset.poetryId"),expected.poetry.target.split(':')[2]);
        }
      }
      console.log('KEY-305 actual Electron restart and three resume links passed');
      assert.deepEqual(errors,[]);
      app.exit(0);
      return;
    }
    const chapter = await evaluate("window.electronAPI.sunnah.chapter('Bukhari',1)");
    assert.ok(chapter.ok && chapter.data.hadiths.length);
    const hadith = chapter.data.hadiths[1];
    for (const lang of ['ar','en']) for (const theme of ['light','dark']) for (const width of [1280,480]) {
      const tag = `${lang}-${theme}-${width}`;
      console.log('CASE',tag);
      win.setContentSize(width,900);
      await evaluate(`localStorage.setItem('baglib-lang','${lang}');localStorage.setItem('baglib-theme','${theme}')`);
      await win.loadURL('http://localhost:3000');
      await until(`document.documentElement.lang === '${lang}' && !!document.querySelector('footer')`);
      await sleep(3000);
      await navigate('quran');
      await until('!!document.querySelector(".mushaf-svg-surface [data-surah][data-aya]")');
      // Close any restored study panel before measuring the calm resting chrome.
      if (await evaluate('!!document.querySelector("[data-islamic-reader-panel]")')) await click('[data-islamic-reader-panel] > div > button');
      assert.equal(await evaluate('document.querySelectorAll("[data-quran-reader] [data-islamic-reader-header]").length'),1);
      assert.equal(await evaluate('!!document.querySelector("[data-quran-audio-dock]")'),false);
      await overflow('[data-islamic-reader-header]');
      await shot('after-quran-'+tag);
      await panelCheck('quran',tag);
      if (lang === 'ar' && theme === 'light' && width === 1280) {
        const catalog = await evaluate('window.electronAPI.quran.readerCatalog()');
        const warsh = catalog.data.sources.find(source => source.kind === 'script' && source.profile === 'warsh');
        const hafs = catalog.data.sources.find(source => source.kind === 'script' && source.profile === 'hafs');
        assert.ok(warsh && hafs,'Both installed reading profiles are required');
        await select('[data-reader-profile]',warsh.id);
        await until("document.querySelector('[data-quran-workspace]')?.dataset.pageProfile === 'warsh'");
        assert.equal(await evaluate("document.querySelector('[data-quran-mushaf]').dataset.cardScript"),warsh.id);
        await shot('after-quran-warsh-isolation');
        await select('[data-reader-profile]',hafs.id);
        await until("document.querySelector('[data-quran-workspace]')?.dataset.pageProfile === 'hafs'");
        assert.equal(await evaluate("document.querySelector('[data-quran-mushaf]').dataset.cardScript"),hafs.id);
      }
      await study(`sunnah:Bukhari:1:${hadith.id}`);
      await until('!!document.querySelector("[data-hadith-id]")');
      await overflow('.sunnah-workspace [data-islamic-reader-header]');
      await shot('after-sunnah-'+tag);
      await panelCheck('sunnah',tag);
      await navigate('bayan');
      await until('!!document.querySelector("article h2 button")');
      await click('article h2 button');
      await until('!!document.querySelector("[data-poetry-row]")');
      await overflow('[data-poetry-id] [data-islamic-reader-header]');
      await shot('after-poetry-'+tag);
      await panelCheck('poetry',tag);
      await navigate('islamic');
      await until('document.querySelectorAll("[data-continue-reading]").length === 3');
      await overflow('[data-islamic-hub]');
      await shot('after-hub-'+tag);
      const input = '[data-islamic-search]';
      await evaluate(`(() => { const e=document.querySelector('${input}'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'العالمين'); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
      await until('document.querySelector("[data-islamic-hub]").innerText.includes("1:2")');
      await shot('after-hub-search-'+tag);
    }
    const expected = {};
    for (const kind of ['quran','sunnah','poetry']) {
      expected[kind] = await evaluate(`window.electronAPI.settings.get('islamic.continue.v1.${kind}')`);
      assert.ok(expected[kind]?.target);
    }
    fs.writeFileSync(path.join(directory,'continue-expected.json'),JSON.stringify(expected));
    assert.deepEqual(errors,[]);
    console.log('KEY-305 live matrix passed 8/8, shared headers/panels/search/profiles verified');
    app.exit(0);
  })().catch(async error => {
    console.error(error,errors);
    await shot('failure-'+phase).catch(() => {});
    app.exit(1);
  });
});
require('../../dist/main/index.js');
