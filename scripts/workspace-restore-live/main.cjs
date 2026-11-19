// KEY-423 live restart runner (see run.mjs).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_RESTORE_PROFILE;
const evidence = process.env.BAGLIB_RESTORE_EVIDENCE;
const phase = process.env.BAGLIB_RESTORE_PHASE;
const lang = process.env.BAGLIB_RESTORE_LANG || 'ar';
const rtl = lang === 'ar';

app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Hard internal timeout so this Electron process can never hang.
const hardTimer = setTimeout(() => {
  console.error(`[workspace-restore-live] Hard timeout in phase ${phase} (${lang})`);
  app.exit(1);
}, 110_000);

let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) errors.push(message);
  });

  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async (code, tries = 200) => {
    for (let i = 0; i < tries; i += 1) {
      try {
        if (await evaluate(code)) return;
      } catch {}
      await pause(150);
    }
    console.error('[until timeout] errors:', errors, 'tabIds:', await tabIds().catch(() => []));
    throw new Error(`Timed out waiting for: ${code}`);
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const key = (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  };
  const shot = async name => {
    await pause(300);
    fs.writeFileSync(path.join(evidence, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabIds = () => evaluate("[...document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]')].map(t => t.dataset.tabId)");
  const activeId = () => evaluate("document.querySelector('[data-workspace-tab-row] [aria-selected=\"true\"]')?.dataset.tabId");
  const mounted = () => evaluate("[...document.querySelectorAll('[data-tab-panel]')].map(p => p.dataset.tabPanel)");
  const visiblePanel = "document.querySelector('[data-tab-panel]:not([hidden])')";
  const formatPage = n => new Intl.NumberFormat(lang, { numberingSystem: rtl ? 'arab' : 'latn', useGrouping: false }).format(n);

  win.webContents.on('did-finish-load', () => {
    void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1', { seen: true })").catch(() => {});
  });

  (async () => {
    win.setMinimumSize(320, 400);
    win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');

    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
    const pdfAr = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'ar' && f.path.includes('/text-layer/'));
    const pdfEn = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'en' && f.path.includes('/text-layer/'));
    assert.ok(pdfAr && pdfEn, 'real ar & en text-layer PDFs present');
    const pathAr = path.resolve('tests/real-files', pdfAr.path);
    const pathEn = path.resolve('tests/real-files', pdfEn.path);

    if (phase === 'seed') {
      const imported = await evaluate(
        `window.electronAPI.importDigitalFiles(${JSON.stringify([
          { filePath: pathAr, duplicateAction: 'import_anyway' },
          { filePath: pathEn, duplicateAction: 'import_anyway' },
        ])}, "workspace-restore")`,
      );
      assert.equal(imported.successfulImports, 2);
      await evaluate('window.electronAPI.settings.set("workspace.prefs.v1", { restoreTabs: false, restoreFocus: "new", linkTarget: "new" })');
      clearTimeout(hardTimer);
      app.quit();
      return;
    }

    if (phase === 'session1') {
      await evaluate(`localStorage.setItem("baglib-lang", ${JSON.stringify(lang)})`);
      await win.loadURL('http://localhost:3000');
      await until("!!document.querySelector('[data-workspace-tab-row] [data-tab-id]') && !!document.querySelector('[data-nav-item=library]')");
      assert.equal((await tabIds()).length, 1, 'session1 starts fresh with 1 Home tab');
      await evaluate('window.electronAPI.settings.set("workspace.prefs.v1", { restoreTabs: true, restoreFocus: "new", linkTarget: "new" })');
      await evaluate('window.electronAPI.settings.set("workspace.closed.v1", [])');
    } else {
      await until("!!document.querySelector('[data-workspace-tab-row] [data-tab-id]') && !!document.querySelector('[data-nav-item=library]')");
    }
    assert.equal(await evaluate('document.documentElement.dir'), rtl ? 'rtl' : 'ltr');

    const books = await evaluate('window.electronAPI.getAllBooks()');
    const bookAr = books.find(b => b.filePath === pathAr);
    const bookEn = books.find(b => b.filePath === pathEn);
    assert.ok(bookAr && bookEn, 'imported ar & en books found');

    const openPdfInCurrentTab = async (book, pageNum) => {
      await click('[data-nav-item=library]');
      await until(`!!${visiblePanel}?.querySelector('[data-view-mode-toggle]')`);
      await evaluate(`${visiblePanel}.querySelector('[data-view-mode-toggle] button:last-child').click()`);
      await until(`[...${visiblePanel}.querySelectorAll('[data-library-book-row]')].some(r => r.getAttribute('aria-label') === ${JSON.stringify(book.title)})`);
      await evaluate(`[...${visiblePanel}.querySelectorAll('[data-library-book-row]')].find(r => r.getAttribute('aria-label') === ${JSON.stringify(book.title)}).focus()`);
      key('Enter');
      await until(`!!${visiblePanel}?.querySelector('[data-reader-go-to]') && !!${visiblePanel}?.querySelector('.pdf-page-container canvas')`);
      const formatted = formatPage(pageNum);
      await evaluate(`${visiblePanel}.querySelector('[data-reader-go-to]').focus(); ${visiblePanel}.querySelector('[data-reader-go-to]').select()`);
      await win.webContents.insertText(formatted);
      key('Enter');
      await until(`${visiblePanel}?.querySelector('[data-reader-go-to]')?.value === ${JSON.stringify(formatted)} && !!${visiblePanel}?.querySelector('.pdf-page-container[data-page-number="${pageNum}"] canvas')`);
    };

    const openNewTab = async (expectedCount) => {
      await click('[data-tab-new]');
      await until(`document.querySelectorAll("[data-workspace-tab-row] [data-tab-id]").length === ${expectedCount}`);
    };

    if (phase === 'session1') {
      // Tab 1: ar PDF on page 3
      await openPdfInCurrentTab(bookAr, 3);
      // Tab 2: en PDF on page 5
      await openNewTab(2);
      await openPdfInCurrentTab(bookEn, 5);
      // Tab 3: Library
      await openNewTab(3);
      await click('[data-nav-item=library]');
      await until(`!!${visiblePanel}?.querySelector('[data-view-mode-toggle]')`);
      // Tab 4: Home
      await openNewTab(4);
      // Tab 5: Quran, then close it so workspace.closed.v1 has an entry for Ctrl+Shift+T after restart
      await openNewTab(5);
      await click('[data-nav-item=quran]');
      await until(`!!${visiblePanel}?.querySelector('[data-quran-reader],[data-quran-view],[data-quran-home]') || ${visiblePanel}?.textContent.includes(${JSON.stringify(rtl ? 'القرآن' : 'Quran')})`);
      const quranTabId = await activeId();
      await click(`[data-tab-close="${quranTabId}"]`);
      await until('document.querySelectorAll("[data-workspace-tab-row] [data-tab-id]").length === 4');

      // Wait for 500ms debounced persist to complete
      await pause(800);
      await shot(`${lang}-1-before-quit`);
      assert.equal(errors.length, 0, `renderer errors in session1: ${errors.join('; ')}`);
      clearTimeout(hardTimer);
      app.quit();
      return;
    }

    if (phase === 'relaunch-default') {
      // 4 saved tabs + 1 new focused Home tab = 5 tabs
      await until('document.querySelectorAll("[data-workspace-tab-row] [data-tab-id]").length === 5');
      const ids = await tabIds();
      const focused = await activeId();
      assert.equal(focused, ids[4], 'default restore focuses the new Home tab at the end');
      const awake = await mounted();
      assert.equal(awake.length, 1, 'restored tabs start asleep; only the focused Home tab mounts');
      assert.equal(awake[0], focused);
      await shot(`${lang}-2-restored-default`);

      // Wake Tab 1 (ar PDF) and verify it opens on page 3
      await click(`[data-tab-id="${ids[0]}"]`);
      await until(`${visiblePanel}?.dataset.tabPanel === ${JSON.stringify(ids[0])} && ${visiblePanel}?.querySelector('[data-reader-go-to]')?.value === ${JSON.stringify(formatPage(3))} && !!${visiblePanel}?.querySelector('.pdf-page-container[data-page-number="3"] canvas')`);
      await shot(`${lang}-3-woke-reader-ar`);

      // Wake Tab 2 (en PDF) and verify it opens on page 5
      await click(`[data-tab-id="${ids[1]}"]`);
      await until(`${visiblePanel}?.dataset.tabPanel === ${JSON.stringify(ids[1])} && ${visiblePanel}?.querySelector('[data-reader-go-to]')?.value === ${JSON.stringify(formatPage(5))} && !!${visiblePanel}?.querySelector('.pdf-page-container[data-page-number="5"] canvas')`);

      // Ctrl+Shift+T after restart reopens the closed Quran tab
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'T', code: 'KeyT', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))");
      await until('document.querySelectorAll("[data-workspace-tab-row] [data-tab-id]").length === 6');

      // Open Settings -> Workspace & tabs, set "The tab I was on last"
      await click('[data-nav-item=settings]');
      await until('!!document.querySelector("[data-settings-entry=workspace]")');
      await click('[data-settings-entry=workspace]');
      await until('!!document.querySelector("[data-workspace-restore-focus=last]")');
      await click('[data-workspace-restore-focus=last]');
      await until('document.querySelector("[data-workspace-restore-focus=last]")?.getAttribute("aria-pressed") === "true"');
      await shot(`${lang}-4-settings-last`);
      key('Escape');

      // Focus Tab 2 (en PDF) so it is "the tab I was on last" before quitting
      await click(`[data-tab-id="${ids[1]}"]`);
      await until(`${visiblePanel}?.dataset.tabPanel === ${JSON.stringify(ids[1])}`);
      await pause(800);
      assert.equal(errors.length, 0, `renderer errors in relaunch-default: ${errors.join('; ')}`);
      clearTimeout(hardTimer);
      app.quit();
      return;
    }

    if (phase === 'relaunch-last') {
      // No new Home tab added; Tab 2 (en PDF) is focused on page 5
      await until('document.querySelectorAll("[data-workspace-tab-row] [data-tab-id]").length >= 5');
      const focused = await activeId();
      const awake = await mounted();
      assert.equal(awake.length, 1, 'only the last focused tab mounts');
      assert.equal(awake[0], focused);
      await until(`${visiblePanel}?.querySelector('[data-reader-go-to]')?.value === ${JSON.stringify(formatPage(5))} && !!${visiblePanel}?.querySelector('.pdf-page-container[data-page-number="5"] canvas')`);
      await shot(`${lang}-5-restored-last`);

      // Switch to "Start fresh" in Settings -> Workspace & tabs
      await click('[data-nav-item=settings]');
      await until('!!document.querySelector("[data-settings-entry=workspace]")');
      await click('[data-settings-entry=workspace]');
      await until('!!document.querySelector("[data-workspace-restore-tabs=fresh]")');
      await click('[data-workspace-restore-tabs=fresh]');
      await until('document.querySelector("[data-workspace-restore-focus=last]")?.disabled === true');
      await shot(`${lang}-6-settings-fresh`);
      await pause(800);
      assert.equal(errors.length, 0, `renderer errors in relaunch-last: ${errors.join('; ')}`);
      clearTimeout(hardTimer);
      app.quit();
      return;
    }

    if (phase === 'relaunch-fresh') {
      await pause(600);
      const ids = await tabIds();
      assert.equal(ids.length, 1, 'start fresh opens exactly one Home tab');
      assert.equal(await evaluate(`!!${visiblePanel}?.querySelector('[data-reader-go-to]')`), false, 'not on reader');
      await shot(`${lang}-7-restored-fresh`);
      assert.equal(errors.length, 0, `renderer errors in relaunch-fresh: ${errors.join('; ')}`);
      clearTimeout(hardTimer);
      app.quit();
    }
  })().catch(err => {
    console.error(`[workspace-restore-live] Error in phase ${phase} (${lang}):`, err);
    clearTimeout(hardTimer);
    app.exit(1);
  });
});

require('../../dist/main/index.js');
