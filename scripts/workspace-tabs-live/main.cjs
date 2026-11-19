// KEY-419 / KEY-420 live run (see run.mjs). Real PDFs and lecture videos from tests/real-files, ar and en UI.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = process.env.BAGLIB_TABS_PROFILE;
const evidence = process.env.BAGLIB_TABS_EVIDENCE;
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async (code, tries = 250) => {
    for (let i = 0; i < tries; i++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(150);
    }
    throw new Error('Timed out ' + code);
  };
  const click = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
  const key = (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  };
  const shot = async name => { await pause(300); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const tabIds = () => evaluate("[...document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]')].map(tab => tab.dataset.tabId)");
  const activeId = () => evaluate("document.querySelector('[data-workspace-tab-row] [aria-selected=\"true\"]')?.dataset.tabId");
  const mounted = () => evaluate("[...document.querySelectorAll('[data-tab-panel]')].map(panel => panel.dataset.tabPanel)");
  const visiblePanel = "document.querySelector('[data-tab-panel]:not([hidden])')";
  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });

  (async () => {
    win.setMinimumSize(320, 400);
    win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
    const pdfs = Object.fromEntries(['ar', 'en'].map(lang => [lang, manifest.files.find(file => file.kind === 'pdf' && file.lang === lang && file.path.includes('/text-layer/'))]));
    const videos = Object.fromEntries(['ar', 'en'].map(lang => [lang, manifest.files.find(file => file.kind === 'video' && file.lang === lang)]));
    assert.ok(pdfs.ar && pdfs.en && videos.ar && videos.en, 'real files present');
    const real = file => path.resolve('tests/real-files', file.path);
    const imported = await evaluate('window.electronAPI.importDigitalFiles(' + JSON.stringify(['ar', 'en'].map(lang => ({ filePath: real(pdfs[lang]), duplicateAction: 'import_anyway' }))) + ',"workspace-tabs")');
    assert.equal(imported.successfulImports, 2);
    await evaluate('window.electronAPI.lectures.addPaths(' + JSON.stringify(['ar', 'en'].map(lang => real(videos[lang]))) + ')');
    const books = await evaluate('window.electronAPI.getAllBooks()');
    const lectures = await evaluate('window.electronAPI.lectures.list()');
    const results = [];

    for (const language of ['ar', 'en']) {
      const rtl = language === 'ar';
      const book = books.find(item => item.filePath === real(pdfs[language === 'ar' ? 'ar' : 'en']));
      const lecture = lectures.find(item => item.path === real(videos[language]));
      assert.ok(book && lecture, 'imported items found');
      errors.length = 0;
      // KEY-423 restores tabs across reloads; each language starts from a clean workspace.
      await evaluate("Promise.all(['workspace.tabs.v1', 'workspace.closed.v1'].map(key => window.electronAPI.settings.set(key, null)))");
      await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(language) + ')');
      win.setContentSize(1280, 900);
      await win.loadURL('http://localhost:3000');
      await until("!!document.querySelector('[data-workspace-tab-row] [data-tab-id]') && !!document.querySelector('[data-nav-item=library]')");
      assert.equal(await evaluate('document.documentElement.dir'), rtl ? 'rtl' : 'ltr');
      assert.equal((await tabIds()).length, 1, 'one Home tab at start');
      const first = await activeId();

      // Tab 1: open the real PDF in the reader and go to page 5.
      await click('[data-nav-item=library]');
      await until('!!document.querySelector("[data-view-mode-toggle]")');
      await click('[data-view-mode-toggle] button:last-child');
      await until('[...document.querySelectorAll("[data-library-book-row]")].some(row=>row.getAttribute("aria-label")===' + JSON.stringify(book.title) + ')');
      await evaluate('[...document.querySelectorAll("[data-library-book-row]")].find(row=>row.getAttribute("aria-label")===' + JSON.stringify(book.title) + ').focus()');
      key('Enter');
      await until('!!document.querySelector("[data-reader-go-to]") && !!document.querySelector(".pdf-page-container canvas")');
      const five = new Intl.NumberFormat(language, { numberingSystem: rtl ? 'arab' : 'latn', useGrouping: false }).format(5);
      await evaluate('document.querySelector("[data-reader-go-to]").focus();document.querySelector("[data-reader-go-to]").select()');
      await win.webContents.insertText(five);
      key('Enter');
      await until('document.querySelector("[data-reader-go-to]")?.value===' + JSON.stringify(five) + ' && !!document.querySelector(\'.pdf-page-container[data-page-number="5"] canvas\')');
      assert.equal(await evaluate(`document.querySelector('[data-tab-id="${first}"]').getAttribute('title')`), book.title, 'the tab shows the book title');
      await shot(`${language}-1-reader`);

      // Tab 2: Ctrl+T opens Home; play the lecture video there.
      key('T', ['control']);
      await until(`document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]').length===2 && ${visiblePanel}?.querySelector('[data-nav-item],[data-dashboard],main,section') !== null`);
      assert.equal(win.isDestroyed(), false);
      const lectureTab = await activeId();
      await click('[data-nav-item=lectures]');
      await until(`!!${visiblePanel}?.querySelector('[data-lecture-row="${lecture.id}"] [data-lecture-select]')`);
      await evaluate(`${visiblePanel}.querySelector('[data-lecture-row="${lecture.id}"] [data-lecture-select]').click()`);
      await until(`${visiblePanel}?.querySelector('[data-lecture-player]')?.readyState>=1`);
      await evaluate(`(() => { const video = ${visiblePanel}.querySelector('[data-lecture-player]'); video.muted = true; return video.play().then(() => true); })()`);
      await until(`${visiblePanel}?.querySelector('[data-lecture-player]')?.paused===false`);
      await shot(`${language}-2-lecture-playing`);

      // Tabs 3-8: six more Home tabs. The reader tab (least recently used) sleeps; the playing lecture never does.
      for (let n = 0; n < 6; n++) {
        const before = (await tabIds()).length;
        key('T', ['control']);
        await until(`document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]').length===${before + 1}`);
        await pause(150);
      }
      await until(`!document.querySelector('[data-tab-panel="${first}"]')`);
      const awake = await mounted();
      assert.ok(awake.includes(lectureTab), 'the playing lecture tab stays mounted');
      assert.ok(await evaluate(`!!document.querySelector('[data-tab-id="${lectureTab}"] [data-tab-playing]')`), 'the playing tab shows a speaker icon');
      assert.ok(awake.length <= 7, `at most 6 tabs plus the playing one are mounted (${awake.length})`);
      assert.equal(await evaluate(`document.querySelector('[data-tab-panel="${lectureTab}"] [data-lecture-player]').paused`), false, 'the hidden lecture keeps playing');
      assert.equal(await evaluate(`document.querySelector('[data-tab-id="${first}"]').hasAttribute('data-tab-id')`), true, 'the sleeping tab is still in the bar');
      await shot(`${language}-3-eight-tabs`);

      // Ctrl+1 wakes the reader tab on the same book, back on page 5.
      key('1', ['control']);
      await until(`${visiblePanel}?.dataset.tabPanel===${JSON.stringify(first)} && !!${visiblePanel}.querySelector('[data-reader-go-to]')`);
      await until(`${visiblePanel}.querySelector('[data-reader-go-to]')?.value===${JSON.stringify(five)} && !!${visiblePanel}.querySelector('.pdf-page-container[data-page-number="5"] canvas')`);
      await shot(`${language}-4-woke-on-page-5`);

      // Back and forward in this tab: Alt+Left in English, Alt+Right in Arabic, goes back to the library.
      const backKey = rtl ? 'Right' : 'Left';
      const forwardKey = rtl ? 'Left' : 'Right';
      // KEY-420: Library -> book -> Quran, back twice, forward.
      await click('[data-nav-item=quran]');
      await until(`!!${visiblePanel}?.querySelector('[data-quran-reader],[data-quran-view],[data-quran-home]') || ${visiblePanel}?.textContent.includes(${JSON.stringify(rtl ? 'القرآن' : 'Quran')})`);
      await until(`!${visiblePanel}?.querySelector('[data-reader-go-to]')`);
      await shot(`${language}-4b-quran`);
      key(backKey, ['alt']);
      await until(`${visiblePanel}?.querySelector('[data-reader-go-to]')?.value===${JSON.stringify(five)}`);
      key(backKey, ['alt']);
      await until(`!!${visiblePanel}?.querySelector('[data-view-mode-toggle]')`);
      assert.equal(await evaluate("document.querySelector('[data-history=\"forward\"]').disabled"), false);
      key(forwardKey, ['alt']);
      await until(`${visiblePanel}?.querySelector('[data-reader-go-to]')?.value===${JSON.stringify(five)}`);
      // The history list from a right-click on the back arrow.
      await evaluate("document.querySelector('[data-history=\"back\"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))");
      await until("document.querySelectorAll('[data-history-list] [role=menuitem]').length>=2");
      // The list must be on top of the reader, not just in the page.
      assert.equal(await evaluate("(() => { const item = document.querySelector('[data-history-list] [role=menuitem]').getBoundingClientRect(); return !!document.elementFromPoint(item.left + item.width / 2, item.top + item.height / 2)?.closest('[data-history-list]'); })()"), true, 'the history list shows above the reader');
      await shot(`${language}-5-history-list`);
      key('Escape');
      await until("!document.querySelector('[data-history-list]')");

      // Drag the reader tab to the end of the bar.
      const box = await evaluate(`(() => { const r = document.querySelector('[data-tab-id="${first}"]').getBoundingClientRect(); const list = document.querySelector('[role=tablist]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, end: ${rtl ? 'list.left + 4' : 'list.right - 4'} }; })()`);
      win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(box.x), y: Math.round(box.y), button: 'left', clickCount: 1 });
      for (let step = 1; step <= 12; step++) {
        const x = Math.round(box.x + (box.end - box.x) * step / 12);
        win.webContents.sendInputEvent({ type: 'mouseMove', x, y: Math.round(box.y), button: 'left' });
        await pause(30);
      }
      win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(box.end), y: Math.round(box.y), button: 'left', clickCount: 1 });
      await until(`(() => { const ids = [...document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]')].map(t => t.dataset.tabId); return ids[ids.length - 1] === ${JSON.stringify(first)}; })()`);
      await shot(`${language}-6-dragged-to-end`);

      // Ctrl+W closes the focused tab and leaves the window open; Ctrl+Shift+T brings it back on its book.
      key('W', ['control']);
      await until(`!document.querySelector('[data-tab-id="${first}"]')`);
      await pause(400);
      assert.equal(win.isDestroyed(), false, 'Ctrl+W did not close the window');
      assert.equal((await tabIds()).length, 7);
      key('T', ['control', 'shift']);
      await until(`document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]').length===8 && !!${visiblePanel}?.querySelector('[data-reader-go-to]')`);
      await until(`${visiblePanel}.querySelector('[data-reader-go-to]')?.value===${JSON.stringify(five)}`);

      // Ctrl+Tab moves on; Ctrl+9 jumps to the last tab.
      const beforeCycle = await activeId();
      key('Tab', ['control']);
      await until(`document.querySelector('[data-workspace-tab-row] [aria-selected="true"]')?.dataset.tabId !== ${JSON.stringify(beforeCycle)}`);
      // The screen follows the focus: the visible panel is the focused tab's, and no other panel shows.
      await until("document.querySelector('[data-tab-panel]:not([hidden])')?.dataset.tabPanel === document.querySelector('[data-workspace-tab-row] [aria-selected=true]')?.dataset.tabId && document.querySelectorAll('[data-tab-panel]:not([hidden])').length === 1");

      // KEY-422: the + panel. Focus + and press Down: Most used has entries, Recent lists the opened book, and
      // picking it opens a new tab on that book.
      const bookKey = JSON.stringify(book.title.slice(0, 20));
      await evaluate("document.querySelector('[data-tab-new]').focus()");
      key('Down');
      await until("!!document.querySelector('[data-quick-open]')");
      assert.ok(await evaluate("document.querySelectorAll('[data-quick-open-item=destination]').length >= 3"), 'Most used lists destinations');
      await until(`[...document.querySelectorAll('[data-quick-open-item=recent]')].some(item => item.textContent.includes(${bookKey}))`);
      assert.equal(await evaluate("(() => { const r = document.querySelector('[data-quick-open]').getBoundingClientRect(); return !!document.elementFromPoint(r.left + r.width / 2, r.top + 20)?.closest('[data-quick-open]'); })()"), true, 'the + panel shows on top');
      assert.equal(await evaluate("(() => { const r = document.querySelector('[data-quick-open]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()"), true, 'the + panel stays inside the window');
      await shot(`${language}-6b-quick-open`);
      const tabsBefore = (await tabIds()).length;
      await evaluate(`[...document.querySelectorAll('[data-quick-open-item=recent]')].find(item => item.textContent.includes(${bookKey})).click()`);
      await until(`document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]').length===${tabsBefore + 1} && !!${visiblePanel}?.querySelector('[data-reader-go-to]')`);
      assert.equal(await evaluate(`document.querySelector('[data-workspace-tab-row] [aria-selected="true"]').getAttribute('title')`), book.title, 'the new tab is on the book');

      // KEY-425: reader and research editor side by side, click each pane, drag the divider, close the split.
      const readerSplitTab = await activeId();
      key('T', ['control']);
      await until(`document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]').length===${tabsBefore + 2} && !!document.querySelector('[data-nav-item="notes-editor"]')`);
      const editorSplitTab = await activeId();
      await click('[data-nav-item="notes-editor"]');
      await until(`!!${visiblePanel}?.querySelector('iframe')`);
      await evaluate(`(() => { const t = document.querySelector('[data-tab-id="${readerSplitTab}"]'); const r = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); })()`);
      await until("!!document.querySelector('[data-menu-action=\"open-beside\"]')");
      await click('[data-menu-action="open-beside"]');
      await until("document.querySelector('[data-tab-panels]')?.getAttribute('data-tab-panels') === 'split'");
      await until(`!!document.querySelector('[data-tab-panel="${readerSplitTab}"][data-split-pane]') && !!document.querySelector('[data-tab-panel="${editorSplitTab}"][data-split-pane]')`);
      await shot(`${language}-6c-split`);
      const readerBox = await evaluate(`(() => { const r = document.querySelector('[data-tab-panel="${readerSplitTab}"]').getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + 80) }; })()`);
      win.webContents.sendInputEvent({ type: 'mouseDown', x: readerBox.x, y: readerBox.y, button: 'left', clickCount: 1 });
      win.webContents.sendInputEvent({ type: 'mouseUp', x: readerBox.x, y: readerBox.y, button: 'left', clickCount: 1 });
      await until(`document.querySelector('[data-tab-panel="${readerSplitTab}"]')?.hasAttribute('data-focused') && document.querySelector('[data-workspace-tab-row] [aria-selected="true"]')?.dataset.tabId === ${JSON.stringify(readerSplitTab)}`);
      const editorBox = await evaluate(`(() => { const r = document.querySelector('[data-tab-panel="${editorSplitTab}"]').getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + 80) }; })()`);
      win.webContents.sendInputEvent({ type: 'mouseDown', x: editorBox.x, y: editorBox.y, button: 'left', clickCount: 1 });
      win.webContents.sendInputEvent({ type: 'mouseUp', x: editorBox.x, y: editorBox.y, button: 'left', clickCount: 1 });
      await until(`document.querySelector('[data-tab-panel="${editorSplitTab}"]')?.hasAttribute('data-focused') && document.querySelector('[data-workspace-tab-row] [aria-selected="true"]')?.dataset.tabId === ${JSON.stringify(editorSplitTab)}`);
      const divBox = await evaluate("(() => { const r = document.querySelector('[data-split-divider]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), before: document.querySelector('[data-split-divider]').getAttribute('aria-valuenow') }; })()");
      const divTargetX = divBox.x + (rtl ? -140 : 140);
      win.webContents.sendInputEvent({ type: 'mouseMove', x: divBox.x, y: divBox.y });
      await pause(30);
      win.webContents.sendInputEvent({ type: 'mouseDown', x: divBox.x, y: divBox.y, button: 'left', clickCount: 1 });
      await pause(50);
      for (let step = 1; step <= 8; step++) {
        win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(divBox.x + (divTargetX - divBox.x) * step / 8), y: divBox.y, button: 'left', modifiers: ['leftButtonDown'] });
        await pause(25);
      }
      win.webContents.sendInputEvent({ type: 'mouseUp', x: divTargetX, y: divBox.y, button: 'left', clickCount: 1 });
      await until(`document.querySelector('[data-split-divider]')?.getAttribute('aria-valuenow') !== ${JSON.stringify(divBox.before)}`);
      await shot(`${language}-6d-split-dragged`);
      await click('[data-split-close]');
      await until("document.querySelector('[data-tab-panels]')?.getAttribute('data-tab-panels') === 'single' && document.querySelectorAll('[data-tab-panel]:not([hidden])').length === 1");

      // KEY-428: multi-select (Ctrl+click, Esc) and full tab right-click menu.
      const selBox = await evaluate(`(() => { const r = document.querySelector('[data-tab-id="${readerSplitTab}"]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
      win.webContents.sendInputEvent({ type: 'mouseDown', x: selBox.x, y: selBox.y, button: 'left', clickCount: 1, modifiers: ['control'] });
      await pause(50);
      win.webContents.sendInputEvent({ type: 'mouseUp', x: selBox.x, y: selBox.y, button: 'left', clickCount: 1, modifiers: ['control'] });
      await until("document.querySelectorAll('[data-tab-id][data-selected]').length === 2");
      await shot(`${language}-6e-multiselect`);
      await evaluate(`(() => { const t = document.querySelector('[data-tab-id="${readerSplitTab}"]'); const r = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); })()`);
      await until("!!document.querySelector('[data-menu-action=\"selection-count\"]') && !!document.querySelector('[data-menu-action=\"open-side-by-side\"]') && !!document.querySelector('[data-menu-action=\"copy-links\"]') && !!document.querySelector('[data-menu-action=\"add-to-list\"]')");
      await shot(`${language}-6f-tab-menu`);
      await click('[data-menu-action="copy-links"]');
      await until("!document.querySelector('[data-baglib-menu]')");
      key('Escape');
      await until("document.querySelectorAll('[data-tab-id][data-selected]').length === 1");

      // KEY-426: tab groups UI (create, collapse, expand, group context menu, ungroup).
      await evaluate(`(() => { const t = document.querySelector('[data-tab-id="${readerSplitTab}"]'); const r = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); })()`);
      await until("!!document.querySelector('[data-menu-action=\"add-to-group\"]')");
      await click('[data-menu-action="add-to-group"]');
      await until("!!document.querySelector('[data-menu-action=\"new-group\"]')");
      await click('[data-menu-action="new-group"]');
      await until("!!document.querySelector('[data-group-dialog]')");
      await evaluate("document.querySelector('[data-group-name-input]').focus()");
      await win.webContents.insertText(rtl ? 'دراسة' : 'Study');
      await click('[data-group-color-pick="green"]');
      await click('[data-group-submit]');
      await until("!!document.querySelector('[data-group-id][data-group-color=\"green\"]')");
      await shot(`${language}-6g-tab-group`);
      await click('[data-group-id]');
      await until("!!document.querySelector('[data-group-id][data-group-collapsed]')");
      await shot(`${language}-6h-group-collapsed`);
      await click('[data-group-id]');
      await until("!document.querySelector('[data-group-id][data-group-collapsed]')");
      await evaluate("(() => { const g = document.querySelector('[data-group-id]'); const r = g.getBoundingClientRect(); g.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); })()");
      await until("!!document.querySelector('[data-menu-action=\"group-ungroup\"]')");
      await click('[data-menu-action="group-ungroup"]');
      await until("!document.querySelector('[data-group-id]')");

      // Narrow window: the bar scrolls sideways and the page never does.
      win.setContentSize(480, 900);
      await until('innerWidth <= 500');
      await pause(600);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'no sideways page scroll at 480px');
      assert.equal(await evaluate("(() => { const list = document.querySelector('[role=tablist]'); return list.scrollWidth > list.clientWidth; })()"), true, 'tab bar overflows into a scroll');
      await shot(`${language}-7-480`);

      const pageErrors = errors.filter(message => !/Download the React DevTools|\[HMR\]|Fast Refresh/u.test(message));
      results.push({ language, tabs: (await tabIds()).length, mountedAfterEight: awake.length, errors: pageErrors });
      assert.deepEqual(pageErrors.filter(message => /Uncaught|Warning: |Error: /u.test(message)), [], `no renderer errors (${language})`);
      await evaluate("document.querySelectorAll('[data-lecture-player]').forEach(video => video.pause())");
    }
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(results, null, 2));
    console.log('PASS workspace tabs', JSON.stringify(results));
    app.quit();
  })().catch(async error => {
    console.error(error);
    console.error('Renderer errors:', JSON.stringify(errors.slice(-10)));
    try { console.error('PANELS ' + await evaluate("JSON.stringify({ active: document.querySelector('[data-workspace-tab-row] [aria-selected=true]')?.dataset.tabId, tabs: [...document.querySelectorAll('[data-tab-id]')].map(t => ({ id: t.dataset.tabId, sel: t.hasAttribute('data-selected'), act: t.getAttribute('aria-selected') })), panels: [...document.querySelectorAll('[data-tab-panel]')].map(p => ({ id: p.dataset.tabPanel, hidden: p.hidden, display: getComputedStyle(p).display, reader: !!p.querySelector('[data-reader-go-to]'), quran: !!p.querySelector('[data-quran-reader]') })), readers: document.querySelectorAll('[data-reader-go-to]').length, width: innerWidth })")); } catch (e) { console.error('panel dump failed', e); }
    fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error.stack || error) + '\n' + errors.join('\n'));
    try { await shot('failure'); } finally { app.exit(1); }
  });
});
require('../../dist/main/index.js');
