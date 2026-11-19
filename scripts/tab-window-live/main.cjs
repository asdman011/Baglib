// KEY-427 live run (see run.mjs): drag tab out, drag tab back in, restart and confirm secondary window returns, ar and en.
// Hard limits: run.mjs kills this process after 150s, and any failure quits the app with exit code 1.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_TABS_PROFILE;
const evidence = process.env.BAGLIB_TABS_EVIDENCE;
const phase = process.env.BAGLIB_TABS_PHASE || 'session1';
const language = process.env.BAGLIB_TABS_LANG || 'ar';
const rtl = language === 'ar';

app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const windows = [];
app.on('browser-window-created', (_, win) => {
  windows.push(win);
});
setTimeout(() => { console.error('Hard timeout in phase', phase, language); app.exit(1); }, 140_000).unref();

let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
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
  const key = (target, keyCode, modifiers = []) => {
    target.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode === 'Enter') target.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    target.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  };
  const shot = async (target, name) => { await pause(300); fs.writeFileSync(path.join(evidence, name + '.png'), (await target.webContents.capturePage()).toPNG()); };
  const tabIds = target => evalIn(target, "[...document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]')].map(tab => tab.dataset.tabId)");
  const dragTabToScreenPoint = (target, tabId, screenX, screenY) => evalIn(target, `(() => {
    const el = document.querySelector('[data-tab-id="${tabId}"]');
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: cx, clientY: cy, screenX: window.screenX + cx, screenY: window.screenY + cy }));
    el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 1, clientX: cx + 20, clientY: cy + 50, screenX: ${Math.round(screenX)}, screenY: ${Math.round(screenY)} }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: cx + 20, clientY: cy + 50, screenX: ${Math.round(screenX)}, screenY: ${Math.round(screenY)} }));
    return true;
  })()`);
  const appWindows = () => windows.filter(item => !item.isDestroyed() && item.webContents.getURL().startsWith('http://localhost:3000'));

  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });

  (async () => {
    win.setMinimumSize(320, 400);
    win.setBounds({ x: -3000, y: 0, width: 1280, height: 900 });
    await until('!!window.electronAPI && !!document.querySelector("footer")');

    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
    const pdfs = Object.fromEntries(['ar', 'en'].map(lang => [lang, manifest.files.find(file => file.kind === 'pdf' && file.lang === lang && file.path.includes('/text-layer/'))]));
    assert.ok(pdfs.ar && pdfs.en, 'real files present');
    const real = file => path.resolve('tests/real-files', file.path);

    if (phase === 'seed') {
      const imported = await evaluate('window.electronAPI.importDigitalFiles(' + JSON.stringify(['ar', 'en'].map(lang => ({ filePath: real(pdfs[lang]), duplicateAction: 'import_anyway' }))) + ',"tab-window")');
      assert.equal(imported.successfulImports, 2);
      app.quit();
      return;
    }

    const books = await evaluate('window.electronAPI.getAllBooks()');
    const book = books.find(item => item.filePath === real(pdfs[language]));
    assert.ok(book, 'imported book found');

    if (phase === 'session1') {
      await evaluate("(() => { window.__baglibDisableTabsPersist = true; return Promise.all(['workspace.tabs.v1', 'workspace.closed.v1', 'workspace.tabs.v1.windows'].map(key => window.electronAPI.settings.set(key, null))); })()");
      await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(language) + ')');
      await win.loadURL('http://localhost:3000');
      await until("!!document.querySelector('[data-workspace-tab-row] [data-tab-id]') && !!document.querySelector('[data-nav-item=library]')");
      assert.equal(await evaluate('document.documentElement.dir'), rtl ? 'rtl' : 'ltr');
      const homeId = (await tabIds(win))[0];

      // Open the real PDF in tab 1.
      await evaluate('document.querySelector("[data-nav-item=library]").click()');
      await until('!!document.querySelector("[data-view-mode-toggle]")');
      await evaluate('document.querySelector("[data-view-mode-toggle] button:last-child").click()');
      await until('[...document.querySelectorAll("[data-library-book-row]")].some(row=>row.getAttribute("aria-label")===' + JSON.stringify(book.title) + ')');
      await evaluate('[...document.querySelectorAll("[data-library-book-row]")].find(row=>row.getAttribute("aria-label")===' + JSON.stringify(book.title) + ').focus()');
      key(win, 'Enter');
      await until('!!document.querySelector("[data-tab-panel]:not([hidden]) [data-reader-go-to]")', 400);
      const readerTab = homeId;

      // Open a second tab (Ctrl+T) so primary keeps a tab.
      key(win, 'T', ['control']);
      await until("document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]').length===2");
      const keptId = (await tabIds(win)).find(id => id !== readerTab);
      assert.ok(keptId, 'a second tab exists');
      await shot(win, `${language}-1-before-drag`);

      // Drag the reader tab outside the window bounds to detach it into a new secondary window.
      const winBounds = win.getBounds();
      const dropOutX = winBounds.x - 1400;
      const dropOutY = winBounds.y + 80;
      assert.equal(await dragTabToScreenPoint(win, readerTab, dropOutX, dropOutY), true);

      for (let i = 0; i < 200 && appWindows().length < 2; i++) await pause(150);
      assert.equal(appWindows().length, 2, 'a second app window opened on drag-out');
      const second = appWindows()[1];
      watch(second);
      second.setBounds({ x: -1600, y: 0, width: 1000, height: 800 });
      await untilIn(second, '!!window.electronAPI && !!document.querySelector("[data-workspace-tab-row] [data-tab-id]")', 400);
      await untilIn(second, '!!document.querySelector("[data-tab-panel]:not([hidden]) [data-reader-go-to]")', 400);
      assert.equal(await evalIn(second, 'window.electronAPI.workspaceWindow.isSecondary'), true);
      const secondTabId = (await tabIds(second))[0];
      assert.ok(secondTabId, 'secondary window has its tab');
      await until(`!document.querySelector('[data-tab-id="${readerTab}"]')`);
      await shot(second, `${language}-2-dragged-out`);

      // Drag the tab from the secondary window back into the primary window's bounds.
      const primaryBounds = win.getBounds();
      assert.equal(await dragTabToScreenPoint(second, secondTabId, primaryBounds.x + 200, primaryBounds.y + 200), true);
      await until("document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]').length===2", 300);
      await until('!!document.querySelector("[data-tab-panel]:not([hidden]) [data-reader-go-to]")', 400);
      for (let i = 0; i < 100 && appWindows().length > 1; i++) await pause(100);
      assert.equal(appWindows().length, 1, 'empty secondary window closed after moving its last tab back');
      await shot(win, `${language}-3-dragged-back`);

      // Move the reader tab out again via menu so both windows are open when the app quits for restart.
      const returnedReaderTab = (await tabIds(win)).find(id => id !== keptId);
      assert.ok(returnedReaderTab, 'returned reader tab present');
      await evaluate(`(() => { const t = document.querySelector('[data-tab-id="${returnedReaderTab}"]'); const r = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); })()`);
      await until("[...document.querySelectorAll('[role=menuitem]')].some(item => /new window|نافذة جديدة/.test(item.textContent))");
      await evaluate("[...document.querySelectorAll('[role=menuitem]')].find(item => /new window|نافذة جديدة/.test(item.textContent)).click()");
      for (let i = 0; i < 200 && appWindows().length < 2; i++) await pause(150);
      assert.equal(appWindows().length, 2, 'second window opened before restart');
      const beforeRestartSecond = appWindows()[1];
      watch(beforeRestartSecond);
      beforeRestartSecond.setBounds({ x: -1600, y: 0, width: 1000, height: 800 });
      await untilIn(beforeRestartSecond, '!!document.querySelector("[data-tab-panel]:not([hidden]) [data-reader-go-to]")', 400);
      await evaluate('window.__baglibDisableTabsPersist = false');
      // Wait for debounce persistence in both windows.
      await pause(1200);
      const savedWinList = await evaluate("window.electronAPI.settings.get('workspace.tabs.v1.windows')");
      assert.ok(Array.isArray(savedWinList) && savedWinList.length === 1, 'secondary window persisted before quit');
      assert.equal(errors.length, 0, 'no renderer errors in session1: ' + errors.join(' | '));
      app.quit();
      return;
    }

    if (phase === 'restart') {
      // Both primary and saved secondary window should reopen.
      for (let i = 0; i < 250 && appWindows().length < 2; i++) await pause(150);
      assert.equal(appWindows().length, 2, 'reopened primary and secondary windows on restart');
      const second = appWindows().find(w => w.id !== win.id);
      assert.ok(second, 'secondary window found on restart');
      watch(second);
      second.setBounds({ x: -1600, y: 0, width: 1000, height: 800 });
      await untilIn(second, '!!window.electronAPI && !!document.querySelector("[data-workspace-tab-row] [data-tab-id]")', 400);
      await untilIn(second, '!!document.querySelector("[data-tab-panel]:not([hidden]) [data-reader-go-to]")', 400);
      assert.equal(await evalIn(second, 'window.electronAPI.workspaceWindow.isSecondary'), true);
      assert.ok(await evalIn(second, `document.querySelector('[data-workspace-tab-row]').textContent.includes(${JSON.stringify(book.title.slice(0, 12))})`), 'restored secondary window kept the book tab');
      await shot(second, `${language}-4-restarted-secondary`);

      // Closing the secondary window by its X discards its saved entry and sends its tab to primary's closedTabs.
      const closedPromise = new Promise(resolve => second.once('closed', resolve));
      second.close();
      await closedPromise;
      await pause(500);
      const afterCloseList = await evaluate("window.electronAPI.settings.get('workspace.tabs.v1.windows')");
      assert.equal(Array.isArray(afterCloseList) ? afterCloseList.length : 0, 0, 'closing secondary window by X discards its saved state');
      // Ctrl+Shift+T in primary window reopens the closed secondary window's tab.
      const beforeReopenCount = (await tabIds(win)).length;
      key(win, 'T', ['control', 'shift']);
      await until(`document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]').length === ${beforeReopenCount + 1}`);
      await until('!!document.querySelector("[data-tab-panel]:not([hidden]) [data-reader-go-to]")', 400);
      await shot(win, `${language}-5-reopened-from-closed-secondary`);
      assert.equal(errors.length, 0, 'no renderer errors in restart: ' + errors.join(' | '));
      app.quit();
    }
  })().catch(async error => {
    console.error(error);
    console.error('Renderer errors:', JSON.stringify(errors.slice(-10)));
    fs.writeFileSync(path.join(evidence, `failure-${phase}-${language}.txt`), String(error.stack || error) + '\n' + errors.join('\n'));
    try { await shot(win, `failure-${phase}-${language}`); } finally { app.exit(1); }
  });
});

require('../../dist/main/index.js');
