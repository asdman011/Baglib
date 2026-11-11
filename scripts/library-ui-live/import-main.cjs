const { app, ipcMain, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { translations } = require('../../src/renderer/translations.ts');
const profile = process.env.BAGLIB_KEY300_DIR;
const evidence = process.env.BAGLIB_KEY300_EVIDENCE;
const files = JSON.parse(fs.readFileSync(path.join(profile, 'inputs.json')));
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
const results = [];
const errors = [];
const createdWindows = [];
let summaries = [];
app.on('browser-window-created', (_, win) => {
  createdWindows.push(win.id);
  if (started) throw new Error('Only one Electron window permitted');
  started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const until = async (code, timeout = 120000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(100);
    }
    throw new Error('Timed out ' + code + '\n' + await evaluate('document.body.innerText.slice(-3000)'));
  };
  const click = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
  const button = label => evaluate('(()=>{const b=[...document.querySelectorAll("button,[role=menuitem]")].find(e=>e.getClientRects().length&&(e.textContent.trim()===' + JSON.stringify(label) + '||e.getAttribute("aria-label")===' + JSON.stringify(label) + '));if(!b)throw new Error("Missing button "+' + JSON.stringify(label) + ');b.focus();b.click();})()');
  const key = async (keyCode, modifiers = []) => {
    win.show(); win.focus(); win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await pause(80);
  };
  const shot = async name => { await pause(250); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const save = () => fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ results, summaries, errors, createdWindows }, null, 2));
  const trap = async () => {
    await evaluate('window.importPanel=document.querySelector("[data-ui-dialog]");window.importControls=()=>[...window.importPanel.querySelectorAll("button,input,select,[tabindex]")].filter(e=>e.tabIndex>=0&&!e.disabled&&e.getClientRects().length);window.importControls().at(-1).focus()');
    await key('Tab');
    assert.equal(await evaluate('document.activeElement===window.importControls()[0]'), true, 'Forward wrap');
    await key('Tab', ['shift']);
    assert.equal(await evaluate('document.activeElement===window.importControls().at(-1)'), true, 'Reverse wrap');
    await evaluate('document.querySelector("[data-nav-item=library]").focus()');
    assert.equal(await evaluate('window.importPanel.contains(document.activeElement)'), true, 'External focus containment');
  };
  (async () => {
    win.setMinimumSize(320, 400); win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate("window.electronAPI.settings.set('onboarding.v1',{seen:true})");
    // Register the exact source IPC implementation in the production app. Only cover
    // generation and per-file pacing are substituted to retain one window and allow
    // deterministic UI cancellation while the real validator/extractor/hash/DB run.
    for (const channel of [...ipcMain._invokeHandlers.keys()]) if (channel.startsWith('digital:') || channel.startsWith('storage:')) ipcMain.removeHandler(channel);
    const { PdfPageCoverService } = require('../../src/main/services/metadata/pdf-page-cover.service.ts');
    PdfPageCoverService.prototype.render = async () => ({ coverUrl: '', currentPage: 1, totalPages: 1, documentPages: 1 });
    const { DigitalImportPipelineService } = require('../../src/main/services/digital/digital-import-pipeline.service.ts');
    const originalImport = DigitalImportPipelineService.prototype.importFile;
    DigitalImportPipelineService.prototype.importFile = async function (options) {
      await pause(1200);
      return originalImport.call(this, options);
    };
    const { BackgroundMetadataService } = require('../../src/main/services/digital/background-metadata.service.ts');
    const extractor = new BackgroundMetadataService(path.resolve('dist/main/metadata-worker.js'));
    const extract = BackgroundMetadataService.prototype.extract;
    BackgroundMetadataService.prototype.extract = function (...args) { return extract.apply(extractor, args); };
    app.on('will-quit', () => extractor.dispose());
    require('../../src/main/ipc/digital.ts').setupDigitalIPC();
    const handler = ipcMain._invokeHandlers.get('digital:import-files');
    ipcMain.removeHandler('digital:import-files');
    ipcMain.handle('digital:import-files', async (...args) => { const summary = await handler(...args); summaries.push(summary); save(); return summary; });
    ipcMain.removeHandler('system:open-files-dialog');
    ipcMain.handle('system:open-files-dialog', () => files.map(file => file.filename));
    for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) for (const width of [1280, 480]) {
      const prefix = language + '-' + theme + '-' + width;
      const text = translations[language];
      console.log('CASE', prefix);
      await evaluate('(async()=>{for(const book of await window.electronAPI.getAllBooks()){await window.electronAPI.deleteBook(book.id);await window.electronAPI.permanentlyDeleteBook(book.id);}})()');
      await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(language) + ');localStorage.setItem("baglib-theme",' + JSON.stringify(theme) + ');window.electronAPI.settings.set("shell.navPinned.v1",true)');
      win.setContentSize(width, 900);
      await win.loadURL('http://localhost:3000');
      await until('!!document.querySelector("footer") && !document.querySelector("[data-first-run]")');
      await pause(800);
      await click('[data-nav-item=library]');
      await until('!!document.querySelector("[data-view-mode-toggle]")');
      // The empty-library primary action is the normal import entry point.
      await button(text.importWizardTitle);
      await until('!!document.querySelector("[data-import-minimize]")');
      await button(text.browseFilesBtn);
      await until('document.querySelectorAll("[data-ui-dialog] button").length>8');
      await trap(); await shot(prefix + '-staged');
      await button(text.scanDuplicatesBtn);
      await until('!!document.querySelector("[data-import-cancel]")');
      await trap();
      await key('Escape');
      await until('!!document.querySelector("footer [data-import-resume]") && !document.querySelector("[data-ui-dialog]")');
      await click('[data-nav-item=notes]');
      await until('!!document.querySelector("footer [data-import-resume]")');
      await shot(prefix + '-background');
      // Wait for one real persisted item, then ask the UI to stop the remainder.
      await until('(async()=> (await window.electronAPI.getAllBooks()).length>0)()');
      await click('[data-import-resume]');
      await until('!!document.querySelector("[data-import-cancel]")');
      await click('[data-import-cancel]');
      await until('!!document.querySelector("[data-import-summary]")');
      const cancelledSummary = summaries.at(-1);
      assert.ok(cancelledSummary.successfulImports > 0 && cancelledSummary.successfulImports < files.length, JSON.stringify(cancelledSummary));
      assert.equal(cancelledSummary.failedImports, 0);
      assert.ok(cancelledSummary.results.some(result => result.cancelled));
      const persisted = await evaluate('window.electronAPI.getAllBooks()');
      for (const result of cancelledSummary.results) {
        assert.equal(persisted.some(book => book.id === result.workId), result.success && !result.skipped, 'Finished item persists / unprocessed item absent');
      }
      await trap();
      assert.equal(await evaluate('!!document.querySelector("[data-feedback-toast]")'), false, 'Foreground summary controls unobstructed');
      await shot(prefix + '-summary');
      await click('[data-import-result=cancelled]');
      await shot(prefix + '-unprocessed');
      await click('[data-import-retry]');
      await button(text.scanDuplicatesBtn);
      await until('!!document.querySelector("[data-import-cancel]")');
      await click('[data-import-minimize]');
      await until('!!document.querySelector("footer [data-import-resume]")');
      await until('document.querySelector("[data-import-resume]")?.textContent.includes(' + JSON.stringify(text.importBackgroundFinished) + ')');
      await click('[data-import-resume]');
      await until('!!document.querySelector("[data-import-summary]")');
      const retrySummary = summaries.at(-1);
      assert.equal(retrySummary.failedImports, 0, JSON.stringify(retrySummary));
      assert.equal(retrySummary.successfulImports, cancelledSummary.skippedImports);
      const completed = await evaluate('window.electronAPI.getAllBooks()');
      assert.equal(completed.length, files.length);
      assert.ok(completed.some(book => /[\u0600-\u06ff]/.test(book.title)), 'Arabic canonical title retained');
      assert.equal(await evaluate('!!document.querySelector("[data-feedback-toast]")'), false, 'Resumed summary controls unobstructed');
      await shot(prefix + '-completed');
      await button(text.finishAndExploreBtn);
      await until('!document.querySelector("[data-ui-dialog]") && !!document.querySelector("[data-view-mode-toggle]")');
      if (width === 1280 && theme === 'light') {
        await button(text.newObjectButton); await button(text.newObjectImportBook);
        await until('!!document.querySelector("[data-import-minimize]")');
        await button(text.browseFilesBtn);
        await until('document.querySelectorAll("[data-ui-dialog] button").length>8');
        await button(text.scanDuplicatesBtn);
        await until('[...document.querySelectorAll("button")].some(e=>!e.disabled&&e.textContent.trim()===' + JSON.stringify(text.startImportBtn) + ')');
        await button(text.startImportBtn);
        await until('!!document.querySelector("[data-import-summary]")');
        assert.equal(summaries.at(-1).skippedImports, files.length);
        assert.equal(summaries.at(-1).successfulImports, 0);
        await click('[data-import-result=duplicates]');
        await shot(prefix + '-duplicates');
        assert.equal((await evaluate('window.electronAPI.getAllBooks()')).length, files.length);
        await button(text.finishAndExploreBtn);
        await until('!document.querySelector("[data-ui-dialog]")');
      }
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'), false, 'Document fits');
      assert.equal(BrowserWindow.getAllWindows().length, 1);
      results.push({ language, theme, width, imported: completed.length, cancelled: cancelledSummary.skippedImports, retained: cancelledSummary.successfulImports, keyboard: true, background: true, retry: true });
      save();
    }
    assert.deepEqual(errors, []);
    assert.equal(createdWindows.length, 1);
    save(); app.quit();
  })().catch(async error => { console.error(error); save(); await shot('failure').catch(() => {}); app.exit(1); });
});
require('../../dist/main/index.js');
