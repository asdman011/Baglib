// KEY-381 live run (see run.mjs): drag passages from readers into a manuscript side by side, ar and en.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_TABS_PROFILE;
const evidence = process.env.BAGLIB_TABS_EVIDENCE;
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('Hard timeout'); app.exit(1); }, 280_000).unref();

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
  const key = (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  };
  const shot = async name => { await pause(300); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });

  (async () => {
    win.setMinimumSize(320, 400);
    win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');

    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
    const pdfs = Object.fromEntries(['ar', 'en'].map(lang => [lang, manifest.files.find(file => file.kind === 'pdf' && file.lang === lang && file.path.includes('/text-layer/'))]));
    assert.ok(pdfs.ar && pdfs.en, 'real files present');
    const real = file => path.resolve('tests/real-files', file.path);
    const imported = await evaluate('window.electronAPI.importDigitalFiles(' + JSON.stringify(['ar', 'en'].map(lang => ({ filePath: real(pdfs[lang]), duplicateAction: 'import_anyway' }))) + ',"source-drag")');
    assert.equal(imported.successfulImports, 2);
    const books = await evaluate('window.electronAPI.getAllBooks()');

    // Create one manuscript chapter to drop into.
    const ms = await evaluate("window.electronAPI.manuscripts.create('Drag Test Manuscript', 'research')");
    const doc = await evaluate("window.electronAPI.manuscripts.createDocument(" + JSON.stringify(ms.id) + ", 'Chapter 1')");
    assert.ok(ms?.id && doc?.id, 'manuscript created');

    const results = [];
    for (const language of ['ar', 'en']) {
      const rtl = language === 'ar';
      const book = books.find(item => item.filePath === real(pdfs[language]));
      assert.ok(book, 'imported book found');
      errors.length = 0;

      await evaluate("(() => { window.__baglibDisableTabsPersist = true; return Promise.all(['workspace.tabs.v1', 'workspace.closed.v1'].map(key => window.electronAPI.settings.set(key, null))); })()");
      await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(language) + ')');
      await evaluate(`localStorage.setItem('baglib:last-manuscript-id', ${JSON.stringify(ms.id)}); localStorage.setItem('baglib:last-chapter-id', ${JSON.stringify(doc.id)});`);
      win.setContentSize(1280, 900);
      await win.loadURL('http://localhost:3000');
      await until("!!document.querySelector('[data-workspace-tab-row] [data-tab-id]') && !!document.querySelector('[data-nav-item=library]')");
      assert.equal(await evaluate('document.documentElement.dir'), rtl ? 'rtl' : 'ltr');

      // Tab 1: open real PDF in reader.
      await evaluate('document.querySelector("[data-nav-item=library]").click()');
      await until('!!document.querySelector("[data-view-mode-toggle]")');
      await evaluate('document.querySelector("[data-view-mode-toggle] button:last-child").click()');
      await until('[...document.querySelectorAll("[data-library-book-row]")].some(row=>row.getAttribute("aria-label")===' + JSON.stringify(book.title) + ')');
      await evaluate('[...document.querySelectorAll("[data-library-book-row]")].find(row=>row.getAttribute("aria-label")===' + JSON.stringify(book.title) + ').focus()');
      key('Enter');
      await until('!!document.querySelector("[data-tab-panel]:not([hidden]) [data-reader-go-to]")', 400);
      const readerTabId = await evaluate("document.querySelector('[data-workspace-tab-row] [aria-selected=\"true\"]').dataset.tabId");

      // Tab 2: open Research Editor and put it side by side with Tab 1.
      key('T', ['control']);
      await until("document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]').length === 2 && !!document.querySelector('[data-nav-item=\"notes-editor\"]')");
      await evaluate('document.querySelector("[data-nav-item=\\"notes-editor\\"]").click()');
      await until('!!document.querySelector("iframe.research-editor-frame")?.contentWindow?.__baglibResearchEditor?.ready', 400);
      const editorTabId = await evaluate("document.querySelector('[data-workspace-tab-row] [aria-selected=\"true\"]').dataset.tabId");

      // Open Tab 1 beside Tab 2 (split view).
      await evaluate(`(() => { const t = document.querySelector('[data-tab-id="${readerTabId}"]'); const r = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); })()`);
      await until("!!document.querySelector('[data-menu-action=\"open-beside\"]')");
      await evaluate("document.querySelector('[data-menu-action=\"open-beside\"]').click()");
      await until("document.querySelector('[data-tab-panels]')?.getAttribute('data-tab-panels') === 'split'");
      await until(`!!document.querySelector('[data-tab-panel="${readerTabId}"] [data-reader-go-to]') && !!document.querySelector('[data-tab-panel="${editorTabId}"] iframe.research-editor-frame')`);

      // 1. Book reader selection drag: select text from the real PDF in Pane 1 and drag into Research Editor in Pane 2.
      await until(`!!document.querySelector('[data-tab-panel="${readerTabId}"] .pdf-page-container .textLayer span')`, 400);
      await evaluate(`(() => {
        const panel = document.querySelector('[data-tab-panel="${readerTabId}"]');
        const spans = [...panel.querySelectorAll('.pdf-page-container .textLayer span')].filter(s => (s.textContent || '').trim().length >= 3);
        const span = spans[0];
        if (!span || !span.firstChild) throw new Error('No PDF text span');
        const range = document.createRange();
        range.selectNodeContents(span);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const rect = span.getBoundingClientRect();
        span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: rect.left + 5, clientY: rect.top + 5 }));
      })()`);
      await until("!!document.querySelector('[data-source-drag-handle=\"book\"]')", 150);

      const draggedBook = await evaluate(`(() => {
        const handle = document.querySelector('[data-source-drag-handle="book"]');
        const frame = document.querySelector('[data-tab-panel="${editorTabId}"] iframe.research-editor-frame');
        if (!handle || !frame || !frame.contentDocument) return false;
        const dt = new DataTransfer();
        handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
        frame.contentDocument.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        frame.contentDocument.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        return dt.types.includes('application/x-baglib-source');
      })()`);
      assert.equal(draggedBook, true, 'book drag handle wrote x-baglib-source and dropped into editor iframe');

      await until(`(() => {
        const frame = document.querySelector('[data-tab-panel="${editorTabId}"] iframe.research-editor-frame');
        return (frame?.contentDocument?.querySelectorAll('baglib-book-quote').length ?? 0) >= 1;
      })()`, 150);

      await shot(`${language}-split-drag-drop`);
      const sourceCount = await evaluate(`document.querySelector('[data-tab-panel="${editorTabId}"] iframe.research-editor-frame')?.contentDocument?.querySelectorAll('baglib-book-quote').length ?? 0`);
      results.push({ language, sourceCount, errors: errors.slice() });
      assert.equal(errors.length, 0, 'no renderer errors: ' + errors.join(' | '));
    }

    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(results, null, 2));
    console.log('PASS source drag', JSON.stringify(results));
    app.quit();
  })().catch(async error => {
    console.error(error);
    console.error('Renderer errors:', JSON.stringify(errors.slice(-10)));
    fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error.stack || error) + '\n' + errors.join('\n'));
    try { await shot('failure'); } finally { app.exit(1); }
  });
});

require('../../dist/main/index.js');
