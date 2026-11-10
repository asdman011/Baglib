const { app, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { translations } = require('../../src/renderer/translations.ts');
const profile = process.env.BAGLIB_KEY307_DIR;
const evidence = process.env.BAGLIB_KEY307_EVIDENCE;
const files = JSON.parse(fs.readFileSync(path.join(profile, 'inputs.json')));
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
// The harness is a CJS entry rather than electron-dot. Match the product package metadata.
app.getVersion = () => require('../../package.json').version;
let selectedFolder = path.dirname(files[0].filename);
// Exercise the production picker IPC with a deterministic native dialog response.
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedFolder] });
let openedLogs;
let reportUrl;
shell.openExternal = async url => { reportUrl = url; };
shell.openPath = async target => { openedLogs = target; return ''; };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) throw new Error('Only one Electron window permitted');
  started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let attempt = 0; attempt < 450; attempt++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(200);
    }
    throw new Error('Timed out ' + code + '\n' + await evaluate('document.body.innerText.slice(-2200)'));
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const shot = async name => { await pause(350); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const input = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const key = async keyCode => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode }); await pause(200); };
  const buttonText = text => evaluate(`(()=>{const button=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!button)throw new Error('Missing button '+${JSON.stringify(text)});button.click();})()`);
  const results = [];
  const errors = [];
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  (async () => {
    await until('!!window.electronAPI && !!document.querySelector("[data-first-run]")');
    for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) for (const width of [1280, 480]) {
      const text = translations[language];
      const prefix = `${language}-${theme}-${width}`;
      console.log('CASE', prefix);
      selectedFolder = path.dirname(files.find(file => file.lang === language).filename);
      await evaluate(`window.electronAPI.settings.delete('onboarding.v1')`);
      await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(language)});localStorage.setItem('baglib-theme',${JSON.stringify(theme)});window.electronAPI.settings.set('shell.navPinned.v1',false)`);
      win.setContentSize(width, 900);
      await win.loadURL('http://localhost:3000');
      await until('!!document.querySelector("[data-first-run]")');
      assert.equal(await evaluate('document.querySelector("[data-first-run]").closest("[dir]").dir'), language === 'ar' ? 'rtl' : 'ltr');
      await shot(prefix + '-guide-language');
      await click('[data-guide-theme]'); await click('[data-guide-theme]');
      await click('[data-guide-language]'); await click('[data-guide-language]');
      await click('[data-guide-next]');
      await click('[data-guide-folder]');
      await until(`document.querySelector('[data-first-run]').textContent.includes(${JSON.stringify(selectedFolder)})`);
      await shot(prefix + '-guide-folder');
      await click('[data-guide-next]');
      await until('document.querySelector("[data-pack-status]")?.querySelectorAll("dd").length===3');
      await pause(500);
      await shot(prefix + '-guide-packs');
      await click('[data-guide-next]');
      await shot(prefix + '-guide-import');
      if (theme === 'light' && width === 1280) {
        await click('[data-guide-import]');
        await until(`[...document.querySelectorAll('[role=dialog] button')].some(e=>e.textContent.trim()===${JSON.stringify(text.scanDuplicatesBtn)}&&!e.disabled)`);
        await shot(prefix + '-import-real-files');
        // Staging real files exercises the guide-to-import handoff without the
        // import pipeline's separate hidden PDF-cover BrowserWindow.
        await buttonText(text.cancel);
      } else await click('[data-guide-next]');
      await until('!document.querySelector("[data-first-run]")');
      assert.equal((await evaluate(`window.electronAPI.settings.get('onboarding.v1')`)).seen, true);
      await win.loadURL('http://localhost:3000');
      await until('!!document.querySelector("footer") && !document.querySelector("[data-first-run]")');
      await pause(1700);
      assert.equal(await evaluate('!!document.querySelector("[data-first-run]")'), false);
      // Navigate through the actual shell, then cross-language search.
      await evaluate(`window.dispatchEvent(new Event('baglib:first-run'))`);
      await until('!!document.querySelector("[data-first-run]")');
      await click('[data-guide-skip]');
      await evaluate(`document.querySelector('[data-nav-peek-trigger-edge]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`);
      await until(`!!document.querySelector('button[aria-label=${JSON.stringify(text.navSettings)}]')`);
      await click(`button[aria-label="${text.navSettings}"]`);
      await until('!!document.querySelector("[data-settings-directory]")');
      await key('Escape');
      await shot(prefix + '-directory');
      assert.ok(await evaluate('document.querySelector("[data-settings-directory]").scrollWidth<=document.querySelector("[data-settings-directory]").clientWidth+1'));
      for (const query of ['ادارة التخزين', 'Storage manager', 'إلذَّكاء الاصْطِنَاعِيّ', 'API مفاتيح']) {
        await input('[data-settings-search]', query);
        await until('document.querySelectorAll("[data-settings-entry]").length>0');
      }
      await shot(prefix + '-search-mixed');
      await input('[data-settings-search]', '');
      await until('document.querySelectorAll("[data-settings-entry]").length>=25');
      for (const entry of ['saving', 'wird', 'ai', 'providers', 'sync', 'storage', 'lock', 'plugins', 'searchProviders']) {
        await click(`[data-settings-entry="${entry}"]`);
        await until('!!document.querySelector("[role=dialog]")');
        await pause(400);
        await shot(prefix + '-' + entry);
        await key('Escape');
        await until('!document.querySelector("[role=dialog]")');
      }
      await click('[data-settings-entry="about"]');
      await until('!!document.querySelector("[data-about-support]")');
      const info = await evaluate('window.electronAPI.getSystemInfo()');
      assert.equal(info.dataLocation, profile);
      assert.equal(info.version, require('../../package.json').version);
      await click('[data-support-logs]');
      await until('!!document.querySelector("[data-support-shortcuts]")');
      for (let attempt = 0; attempt < 100 && openedLogs !== info.logsLocation; attempt++) await pause(50);
      assert.equal(openedLogs, info.logsLocation);
      await click('[data-support-report]');
      for (let attempt = 0; attempt < 100 && !reportUrl; attempt++) await pause(50);
      assert.equal(reportUrl, 'https://github.com/asdman011/Baglib/issues/new');
      await shot(prefix + '-about');
      await click('[data-support-shortcuts]');
      await until('!!document.querySelector("[data-shortcut-registry]")');
      await shot(prefix + '-shortcuts');
      await key('Escape');
      await click('[data-settings-entry="about"]');
      await until('!!document.querySelector("[data-support-guide]")');
      await click('[data-support-guide]');
      await until('!!document.querySelector("[data-first-run]")');
      await click('[data-guide-skip]');
      results.push({ language, theme, width, guide: true, persisted: true, helpReopen: true, bilingualSearch: true, modals: 9, logs: true, shortcuts: true });
      fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    }
    app.quit();
  })().catch(async error => { console.error(error); await shot('failure').catch(() => {}); app.exit(1); });
});
require('../../dist/main/index.js');
