// Installed-pack acceptance for KEY-168. Each phase owns only its throwaway Electron process.
const { app, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = path.resolve(process.env.BAGLIB_KEY168_DIR);
const evidence = process.env.BAGLIB_KEY168_EVIDENCE;
const phase = process.env.BAGLIB_KEY168_PHASE;
assert.equal(path.dirname(directory), path.resolve('.baglib-data'));
assert.ok(path.basename(directory).startsWith('KEY-168-live-'));
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
    win.setMinimumSize(320, 400); win.show(); win.focus(); win.webContents.focus();
    const matrix = [];
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    const catalog = await evaluate('window.electronAPI.quran.readerCatalog()');
    assert.equal(catalog.ok, true);
    const scripts = Object.fromEntries(['hafs', 'warsh'].map(profile => [profile, catalog.data.sources.find(s => s.kind === 'script' && s.profile === profile)?.id]));
    assert.ok(scripts.hafs && scripts.warsh, 'Both installed basic reading packs required');
    const positionKey = profile => 'islamic.continue.v1.quran.' + profile;
    const stored = profile => evaluate(`window.electronAPI.settings.get('${positionKey(profile)}')`);
    let expected = phase === 'restart' ? JSON.parse(fs.readFileSync(path.join(directory, 'expected.json'), 'utf8')) : null;
    for (const lang of ['ar', 'en']) for (const width of [1280, 480]) {
      const tag = lang + '-' + width;
      win.setContentSize(1280, 900);
      await evaluate(`localStorage.setItem('baglib-lang', '${lang}')`);
      await win.loadURL('http://localhost:3000');
      await until(`document.documentElement.lang === '${lang}' && !!document.querySelector('footer')`);
      await pause(500);
      await click('[data-nav-item="quran"]');
      await until("!!document.querySelector('.mushaf-svg-surface [data-surah][data-aya]') && !!document.querySelector('[data-reader-profile]')");
      assert.equal(await evaluate('document.documentElement.dir'), lang === 'ar' ? 'rtl' : 'ltr');
      assert.equal(await win.webContents.session.fetch('https://example.com').then(() => true, () => false), false);
      const profile = async reading => {
        if (await evaluate("document.querySelector('[data-reader-profile]').value") !== scripts[reading]) await change('[data-reader-profile]', scripts[reading]);
        await until(`document.querySelector('[data-quran-workspace]')?.dataset.pageProfile === '${reading}' && !!document.querySelector('.mushaf-svg-surface [data-surah][data-aya]')`);
        await pause(500);
      };
      const pageValue = () => evaluate("Number(document.querySelector('[data-quran-secondary-controls] input[type=number]')?.value)");
      const page = async number => {
        await change('[data-quran-secondary-controls] input[type=number]', number);
        await until(`Number(document.querySelector('[data-quran-secondary-controls] input[type=number]')?.value) === ${number} && !!document.querySelector('.mushaf-svg-surface [data-surah][data-aya]')`);
        await pause(500);
      };
      await profile('hafs');
      if (phase === 'matrix') await page(2);
      assert.equal(await pageValue(), 2, 'Hafs own position after reload/restart');
      if (phase === 'matrix' && !expected) {
        await click('[data-quran-ayah-actions]'); await until("!!document.querySelector('[data-menu-action=bookmark]')");
        await click('[data-menu-action=bookmark]');
        await until("!!document.querySelector('[data-quran-bookmark]') && !!document.querySelector('[data-baglib-bookmark]')");
      }
      await until("!!document.querySelector('[data-baglib-bookmark]')");
      const target = await evaluate("document.querySelector('[data-quran-bookmark]').dataset.quranBookmark");
      assert.match(target, /^quran:hafs:/);
      await click('[data-quran-bookmarks] summary');
      await click('[data-quran-bookmark]');
      await until("!!document.querySelector('[data-quran-inspector-layer] button') && !!document.querySelector('[data-quran-inspector-layer] p[lang=ar]')");
      const canonical = await evaluate("document.querySelector('[data-quran-inspector-layer] p[lang=ar]').textContent");
      const label = lang === 'ar' ? 'نسخ النص العثماني' : 'Copy Uthmani text';
      const copied = await evaluate(`(() => { const buttons = [...document.querySelectorAll('[data-quran-inspector-layer] button')]; const b = buttons.find(b => b.textContent === ${JSON.stringify(label)}); if (!b) return buttons.map(b=>b.textContent); b.click(); return true; })()`);
      assert.equal(copied, true, 'canonical copy button');
      await pause(200);
      const text = clipboard.readText();
      assert.ok(text.startsWith(canonical + '\n['), 'canonical ayah copied unchanged');
      assert.ok(text.includes(lang === 'ar' ? 'البقرة' : 'Al-Baqarah'), 'localized surah citation');
      fs.writeFileSync(path.join(evidence, phase + '-clipboard-' + tag + '.txt'), text);
      await click('[data-quran-inspector-layer] header button');
      win.setContentSize(width, 900);
      await shot(phase + '-hafs-' + tag);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
      await profile('warsh');
      assert.equal(await evaluate("document.querySelectorAll('[data-quran-bookmark]').length"), 0);
      if (phase === 'matrix') {
        await page(2); // same numbered ayah in Warsh must have no Hafs bookmark.
        assert.equal(await evaluate("document.querySelectorAll('[data-baglib-bookmark]').length"), 0);
        await page(3);
      }
      assert.equal(await pageValue(), 3, 'Warsh own position after restart');
      assert.equal(await evaluate("document.querySelectorAll('[data-baglib-bookmark]').length"), 0);
      await shot(phase + '-warsh-' + tag);
      await profile('hafs'); assert.equal(await pageValue(), 2);
      await until("!!document.querySelector('[data-baglib-bookmark]')");
      const actual = { hafs: await stored('hafs'), warsh: await stored('warsh') };
      if (phase === 'restart') { for (const reading of ['hafs', 'warsh']) assert.equal(actual[reading].target, expected[reading].target); }
      else { expected = actual; fs.writeFileSync(path.join(directory, 'expected.json'), JSON.stringify(expected)); }
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
      matrix.push({ lang, width, passed: true }); console.log(JSON.stringify(matrix.at(-1)));
    }
    assert.deepEqual(errors, [], 'zero renderer errors');
    const result = { phase, matrix, passed: matrix.length, blocked, rendererErrors: errors.length, expected };
    fs.writeFileSync(path.join(evidence, phase + '-results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result)); app.quit();
  })().catch(async error => { console.error(error); console.error(JSON.stringify({ errors })); try { await shot(phase + '-failure'); } finally { app.exit(1); } });
});
require('../../dist/main/index.js');
