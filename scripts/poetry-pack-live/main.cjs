// KEY-266 live check: on a clean throwaway profile, the Bayan tab imports the real local poetry pack (the native file
// picker is stubbed to return BAGLIB_POETRY_PACK), survives a cancel then a retry, and searches poems in Arabic (RTL)
// and English (LTR). Needs the dev server on :3000 and a fresh `npm run build:main`.
const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_POETRY_PACK_LIVE_DIR;
const manifest = process.env.BAGLIB_POETRY_PACK;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const picks = [];
dialog.showOpenDialog = async (...args) => { const options = args.find(value => value && typeof value === 'object' && 'properties' in value); picks.push(options?.filters?.[0]?.name); return { canceled: false, filePaths: [manifest] }; };
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;
app.on('browser-window-created', (_, window) => {
  if (started) return; started = true;
  const errors = [];
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3 && /uncaught|hydration|error/iu.test(message)) errors.push(message); });
  window.webContents.on('did-finish-load', () => { window.webContents.executeJavaScript("window.electronAPI?.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const evaluate = code => window.webContents.executeJavaScript(code, true);
  const waitFor = async (code, tries = 400, step = 250) => {
    for (let attempt = 0; attempt < tries; attempt++) { try { if (await evaluate(code)) return; } catch {} await pause(step); }
    throw new Error(`Timed out: ${code}`);
  };
  const shot = async name => { await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await window.webContents.capturePage()).toPNG()); };
  const partitions = path.join(directory, 'partitions');
  const leftovers = () => fs.existsSync(partitions) ? fs.readdirSync(partitions).filter(name => name.startsWith('.poetry-pack-')) : [];
  const openBayan = async language => {
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','${language === 'ar' ? 'dark' : 'light'}')`);
    await window.loadURL('http://localhost:3000');
    await waitFor('!!window.electronAPI?.poetry && !!document.querySelector("footer")');
    await evaluate(`[...document.querySelectorAll('[data-nav-item]')].find(b => b.getAttribute('data-nav-item') === 'bayan').click()`);
    await waitFor('!!document.querySelector("[data-bayan-view]")', 400, 250);
  };
  const search = async text => {
    await evaluate(`(()=>{const field=document.querySelector('[data-bayan-view] input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(text)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await waitFor(`document.querySelectorAll('[data-bayan-view] article').length > 0`, 120, 250);
    return evaluate(`document.querySelectorAll('[data-bayan-view] article').length`);
  };
  (async () => {
    const results = [];
    // Arabic: import, cancel, retry, then search.
    await openBayan('ar');
    assert.equal(await evaluate('document.querySelector("[data-bayan-view]").dir'), 'rtl');
    await waitFor('!!document.querySelector("[data-bayan-import-pack]")');
    await shot('ar-before');
    await evaluate(`document.querySelector('[data-bayan-import-pack]').click()`);
    await waitFor('!!document.querySelector("[data-bayan-import-cancel]")');
    await waitFor(`(async () => { const r = await window.electronAPI.poetry.status(); return r.ok && r.data.downloaded > 0; })()`, 200, 100);
    await shot('ar-unpacking');
    await evaluate(`document.querySelector('[data-bayan-import-cancel]').click()`);
    await waitFor('!!document.querySelector("[data-bayan-import-cancelled]")');
    await pause(500);
    const afterCancel = { partition: fs.existsSync(path.join(partitions, 'bayan_poetry.sqlite')), leftovers: leftovers() };
    assert.deepEqual(afterCancel, { partition: false, leftovers: [] });
    await shot('ar-cancelled');
    const started = Date.now();
    await evaluate(`document.querySelector('[data-bayan-import-pack]').click()`);
    await waitFor(`(async () => { const r = await window.electronAPI.poetry.status(); return r.ok && (r.data.phase === 'ready' || r.data.phase === 'error'); })()`, 1200, 500);
    const status = await evaluate(`window.electronAPI.poetry.status().then(r => r.data)`);
    assert.equal(status.phase, 'ready', JSON.stringify(status));
    const importSeconds = Math.round((Date.now() - started) / 1000);
    const arHits = await search('الحب');
    await shot('ar-search');
    results.push({ language: 'ar', dir: 'rtl', afterCancel, importSeconds, bytes: status.downloaded, hits: arHits, leftovers: leftovers() });
    // English: the imported corpus is ready and searchable in LTR.
    await openBayan('en');
    assert.equal(await evaluate('document.querySelector("[data-bayan-view]").dir'), 'ltr');
    const enHits = await search('الليل');
    await shot('en-search');
    results.push({ language: 'en', dir: 'ltr', hits: enHits, importButtonHidden: !(await evaluate('!!document.querySelector("[data-bayan-import-pack]")')) });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, pickerFilterNames: picks, results, rendererErrors: errors }));
    app.quit();
  })().catch(async error => { console.error(error); try { await shot('failure'); } finally { app.exit(1); } });
});
require('../../dist/main/index.js');
