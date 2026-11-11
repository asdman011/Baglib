// Live check after a Next.js upgrade: the real main process and preload, the dev renderer and the static export, in Arabic and English.
// Run through run.mjs, which sets a throwaway BAGLIB_DATA_DIR and --user-data-dir.
const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const directory = process.env.BAGLIB_NEXT_LIVE_DIR;
app.setPath('userData', directory);
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const errors = [];
  owner.webContents.on('console-message', (_event, level, message, line, source) => { if (level >= 3) errors.push(`${message} (${source}:${line})`); });
  try { owner.webContents.debugger.attach('1.3'); owner.webContents.debugger.sendCommand('Network.enable'); owner.webContents.debugger.on('message', (_event, method, params) => { if (method === 'Network.responseReceived' && /script|worker|other/i.test(params.type || '') && !params.response.mimeType) errors.push(`no-mime ${params.type} ${params.response.url}`); }); } catch (error) { errors.push(`debugger ${error.message}`); }
  owner.webContents.session.webRequest.onCompleted(details => {
    const type = Object.entries(details.responseHeaders || {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.[0] || '';
    if (details.statusCode >= 400 || (details.statusCode !== 304 && !type && /\.(m?js)(\?|$)/.test(details.url))) errors.push(`request ${details.statusCode} ${details.url} [${type}]`);
  });
  owner.webContents.on('render-process-gone', (_event, details) => errors.push(`render-process-gone ${details.reason}`));
  const evaluate = code => owner.webContents.executeJavaScript(code, true);
  owner.webContents.on('did-finish-load', () => { evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until = async (code, tries = 200) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(300); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(600); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const check = async (target, url, language) => {
    errors.length = 0;
    await owner.loadURL(url);
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`);
    await owner.loadURL(url);
    await until('!!window.electronAPI && !!document.querySelector("[data-nav-item][aria-label]")');
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    await pause(1500);
    const labels = await evaluate('[...document.querySelectorAll("[data-nav-item][aria-label]")].map(b=>b.getAttribute("aria-label"))');
    const visited = [];
    for (const [index, label] of labels.entries()) {
      await evaluate(`document.querySelectorAll('[data-nav-item][aria-label]')[${index}]?.click()`);
      await pause(700);
      visited.push({ label, mainText: (await evaluate('(document.querySelector("main")||document.body).innerText.length')) });
    }
    await evaluate(`document.querySelector('[data-nav-item][aria-label]').click()`);
    const page = await evaluate('({dir:document.documentElement.dir,lang:document.documentElement.lang,title:document.title,arabicLetters:(document.body.innerText.match(/[\\u0621-\\u064A]/g)||[]).length,latinLetters:(document.body.innerText.match(/[A-Za-z]/g)||[]).length})');
    await shot(`${target}-${language}`);
    const blankPages = visited.filter(item => item.mainText < 5).map(item => item.label);
    assert.equal(page.lang, language);
    assert.equal(page.dir, language === 'ar' ? 'rtl' : 'ltr');
    assert.ok(labels.length >= 6, 'Navigation items rendered');
    assert.deepEqual(blankPages, []);
    assert.deepEqual(errors, []);
    return { target, url, language, page, labels, visited, blankPages, errors: [...errors] };
  };
  (async () => {
    owner.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("[data-nav-item]")');
    const results = [];
    for (const target of (process.env.BAGLIB_NEXT_LIVE_TARGETS || 'dev,export').split(',')) {
      const url = target === 'dev' ? 'http://localhost:3000' : 'app://-/';
      for (const language of ['ar', 'en']) results.push(await check(target, url, language));
    }
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results.map(r => ({ target: r.target, language: r.language, page: r.page, nav: r.labels.length, blank: r.blankPages, errors: r.errors.length }))));
    app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error)); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
