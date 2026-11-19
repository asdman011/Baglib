// KEY-427 live run (see run.mjs): "Move to new window" with a real PDF, ar and en UI.
// Hard limits: run.mjs kills this process after 5 minutes, and any failure quits the app with exit code 1.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = process.env.BAGLIB_TABS_PROFILE;
const evidence = process.env.BAGLIB_TABS_EVIDENCE;
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const windows = [];
app.on('browser-window-created', (_, win) => { windows.push(win); });
setTimeout(() => { console.error('Hard timeout'); app.exit(1); }, 280_000).unref();
app.once('browser-window-created', (_, win) => {
  const errors = [];
  const watch = target => target.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  watch(win);
  const evalIn = (target, code) => target.webContents.executeJavaScript(code, true);
  const untilIn = async (target, code, tries = 250) => {
    for (let i = 0; i < tries; i++) {
      try { if (await evalIn(target, code)) return; } catch {}
      await pause(150);
    }
    throw new Error('Timed out ' + code);
  };
  const evaluate = code => evalIn(win, code);
  const until = (code, tries) => untilIn(win, code, tries);
  const key = (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  };
  const shot = async (target, name) => { await pause(300); fs.writeFileSync(path.join(evidence, name + '.png'), (await target.webContents.capturePage()).toPNG()); };
  const tabIds = target => evalIn(target, "[...document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]')].map(tab => tab.dataset.tabId)");
  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });

  (async () => {
    win.setMinimumSize(320, 400);
    win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
    const pdfs = Object.fromEntries(['ar', 'en'].map(lang => [lang, manifest.files.find(file => file.kind === 'pdf' && file.lang === lang && file.path.includes('/text-layer/'))]));
    assert.ok(pdfs.ar && pdfs.en, 'real files present');
    const real = file => path.resolve('tests/real-files', file.path);
    const imported = await evaluate('window.electronAPI.importDigitalFiles(' + JSON.stringify(['ar', 'en'].map(lang => ({ filePath: real(pdfs[lang]), duplicateAction: 'import_anyway' }))) + ',"tab-window")');
    assert.equal(imported.successfulImports, 2);
    const books = await evaluate('window.electronAPI.getAllBooks()');
    const results = [];

    for (const language of ['ar', 'en']) {
      const rtl = language === 'ar';
      const book = books.find(item => item.filePath === real(pdfs[language]));
      assert.ok(book, 'imported book found');
      errors.length = 0;
      // Each language starts from a clean workspace; a reload must not re-save the previous run's tabs.
      await evaluate("(() => { window.__baglibDisableTabsPersist = true; return Promise.all(['workspace.tabs.v1', 'workspace.closed.v1'].map(key => window.electronAPI.settings.set(key, null))); })()");
      await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(language) + ')');
      win.setContentSize(1280, 900);
      await win.loadURL('http://localhost:3000');
      await until("!!document.querySelector('[data-workspace-tab-row] [data-tab-id]') && !!document.querySelector('[data-nav-item=library]')");
      assert.equal(await evaluate('document.documentElement.dir'), rtl ? 'rtl' : 'ltr');
      assert.equal((await tabIds(win)).length, 1, 'one Home tab at start');
      const homeId = (await tabIds(win))[0];

      // Open the real PDF in the reader, in its own tab.
      await evaluate('document.querySelector("[data-nav-item=library]").click()');
      await until('!!document.querySelector("[data-view-mode-toggle]")');
      await evaluate('document.querySelector("[data-view-mode-toggle] button:last-child").click()');
      await until('[...document.querySelectorAll("[data-library-book-row]")].some(row=>row.getAttribute("aria-label")===' + JSON.stringify(book.title) + ')');
      await evaluate('[...document.querySelectorAll("[data-library-book-row]")].find(row=>row.getAttribute("aria-label")===' + JSON.stringify(book.title) + ').focus()');
      key('Enter');
      await until('!!document.querySelector("[data-tab-panel]:not([hidden]) [data-reader-go-to]")', 400);
      assert.deepEqual(await tabIds(win), [homeId], 'the book opened in the Home tab');
      const readerTab = homeId;
      // A second tab (Ctrl+T) so the source window still has a tab once the reader tab leaves.
      key('T', ['control']);
      await until("document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]').length===2");
      const keptId = (await tabIds(win)).find(id => id !== readerTab);
      assert.ok(keptId, 'a second tab exists');
      await shot(win, `${language}-1-before-move`);

      // Right-click the reader tab and choose "Move to new window".
      await evaluate(`(() => { const t = document.querySelector('[data-tab-id="${readerTab}"]'); const r = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); })()`);
      await until("[...document.querySelectorAll('[role=menuitem]')].some(item => /new window|نافذة جديدة/.test(item.textContent))");
      const label = await evaluate("[...document.querySelectorAll('[role=menuitem]')].find(item => /new window|نافذة جديدة/.test(item.textContent)).textContent.trim()");
      assert.equal(label, rtl ? 'نقل إلى نافذة جديدة' : 'Move to new window');
      await evaluate("[...document.querySelectorAll('[role=menuitem]')].find(item => /new window|نافذة جديدة/.test(item.textContent)).click()");

      // A second app window opens and shows the same book in one tab.
      const appWindows = () => windows.filter(item => !item.isDestroyed() && item.webContents.getURL().startsWith('http://localhost:3000'));
      for (let i = 0; i < 200 && appWindows().length < 2; i++) await pause(150);
      assert.equal(appWindows().length, 2, 'a second app window opened');
      const second = appWindows()[1];
      watch(second);
      second.setContentSize(1100, 800);
      await untilIn(second, '!!window.electronAPI && !!document.querySelector("[data-workspace-tab-row] [data-tab-id]")', 400);
      await untilIn(second, '!!document.querySelector("[data-tab-panel]:not([hidden]) [data-reader-go-to]")', 400);
      assert.equal((await tabIds(second)).length, 1, 'the new window holds exactly the moved tab');
      assert.equal(await evalIn(second, 'document.documentElement.dir'), rtl ? 'rtl' : 'ltr');
      assert.equal(await evalIn(second, 'window.electronAPI.workspaceWindow.isSecondary'), true);
      assert.ok(await evalIn(second, `document.querySelector('[data-workspace-tab-row]').textContent.includes(${JSON.stringify(book.title.slice(0, 12))})`), 'the tab keeps the book title');
      await shot(second, `${language}-2-second-window`);

      // The source window closed its tab and kept Home.
      await until(`!document.querySelector('[data-tab-id="${readerTab}"]')`);
      assert.deepEqual(await tabIds(win), [keptId], 'the source window keeps only its other tab');
      await shot(win, `${language}-3-source-after-move`);

      // The second window never wrote the saved workspace; only the first window's tabs are saved.
      await evaluate('window.__baglibDisableTabsPersist = false');
      await pause(4000);
      const saved = await evaluate("window.electronAPI.settings.get('workspace.tabs.v1')");
      const savedTabs = (typeof saved === 'string' ? JSON.parse(saved) : saved)?.tabs ?? [];
      assert.ok(savedTabs.every(tab => tab.history.every(entry => entry.view !== 'reader')), 'the second window did not overwrite the saved workspace');
      results.push({ language, windows: windows.filter(item => !item.isDestroyed()).length, errors: errors.slice() });
      assert.equal(errors.length, 0, 'no renderer errors: ' + errors.join(' | '));
      second.destroy();
      await pause(500);
    }
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(results, null, 2));
    console.log('PASS tab window', JSON.stringify(results));
    app.quit();
  })().catch(async error => {
    console.error(error);
    console.error('Renderer errors:', JSON.stringify(errors.slice(-10)));
    for (const [index, target] of windows.entries()) {
      try { console.error('WINDOW ' + index + ' ' + await evalIn(target, "JSON.stringify({ url: location.href, secondary: window.electronAPI?.workspaceWindow?.isSecondary, tabs: [...document.querySelectorAll('[data-tab-id]')].map(t => t.dataset.tabId + ':' + t.textContent.trim()), panels: [...document.querySelectorAll('[data-tab-panel]')].map(p => p.dataset.tabPanel + ':' + p.hidden + ':' + p.textContent.slice(0, 80)) })")); } catch (e) { console.error('dump failed', e.message); }
    }
    fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error.stack || error) + '\n' + errors.join('\n'));
    try { await shot(win, 'failure'); } finally { app.exit(1); }
  });
});
require('../../dist/main/index.js');
