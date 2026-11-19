// KEY-421 (WS-5) live runner (see run.mjs).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_LINKS_PROFILE;
const evidence = process.env.BAGLIB_LINKS_EVIDENCE;

app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = msg => {
  try { fs.appendFileSync(path.join(evidence, 'run.log'), `${new Date().toISOString()} ${msg}\n`); } catch {}
  console.log(msg);
};

const hardTimer = setTimeout(() => {
  console.error('[workspace-links-live] Hard timeout');
  app.exit(1);
}, 170_000);

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
    throw new Error(`Timed out waiting for: ${code}`);
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const shot = async name => {
    await pause(350);
    fs.writeFileSync(path.join(evidence, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabIds = () => evaluate("[...document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]')].map(t => t.dataset.tabId)");
  const activeId = () => evaluate("document.querySelector('[data-workspace-tab-row] [aria-selected=\"true\"]')?.dataset.tabId");
  const visiblePanel = "document.querySelector('[data-tab-panel]:not([hidden])')";

  win.webContents.on('did-finish-load', () => {
    void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1', { seen: true })").catch(() => {});
  });

  (async () => {
    log('[links-live] window created');
    win.setMinimumSize(320, 400);
    win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    log('[links-live] app ready');

    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
    const pdfAr = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'ar' && f.path.includes('/text-layer/'));
    const pdfEn = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'en' && f.path.includes('/text-layer/'));
    assert.ok(pdfAr && pdfEn, 'real ar & en text-layer PDFs present');

    const imported = await evaluate(
      `window.electronAPI.importDigitalFiles(${JSON.stringify([
        { filePath: path.resolve('tests/real-files', pdfAr.path), duplicateAction: 'import_anyway' },
        { filePath: path.resolve('tests/real-files', pdfEn.path), duplicateAction: 'import_anyway' },
      ])}, "workspace-links")`,
    );
    assert.equal(imported.successfulImports, 2);

    const books = await evaluate('window.electronAPI.getAllBooks()');
    const bookAr = books.find(b => b.filePath && b.filePath.includes(path.basename(pdfAr.path)));
    const bookEn = books.find(b => b.filePath && b.filePath.includes(path.basename(pdfEn.path)));
    assert.ok(bookAr && bookEn, 'imported ar & en books found');
    console.log('[links-live] seeded books:', bookAr.id, bookEn.id);

    for (const lang of ['ar', 'en']) {
      console.log('[links-live] starting lang:', lang);
      const rtl = lang === 'ar';
      const book = rtl ? bookAr : bookEn;
      const bookTarget = `book:${book.id}#p=3`;
      const quranTarget = 'quran:hafs:1:2';
      const noteTitle = rtl ? 'ملاحظة اختبار الروابط' : 'Links Live Test Note';
      const noteContent = `${noteTitle}\n\n[[${bookTarget}|${book.title}]]\n[[${quranTarget}|Al-Fatiha 1:2]]`;

      await evaluate(`window.electronAPI.studyNotes.save({ title: ${JSON.stringify(noteTitle)}, content: ${JSON.stringify(noteContent)}, aliases: [], tags: [] })`);
      await evaluate('window.electronAPI.settings.set("workspace.tabs.v1", null)');
      await evaluate('window.electronAPI.settings.set("workspace.closed.v1", [])');
      // Start fresh on load even if beforeunload flushes the previous language's tabs, then restore linkTarget: "new".
      await evaluate('window.electronAPI.settings.set("workspace.prefs.v1", { restoreTabs: false, restoreFocus: "new", linkTarget: "new" })');
      await evaluate(`localStorage.setItem("baglib-lang", ${JSON.stringify(lang)})`);

      await win.loadURL('http://localhost:3000');
      log(`[links-live] loaded localhost:3000 for ${lang}`);
      await until("!!document.querySelector('[data-workspace-tab-row] [data-tab-id]') && !!document.querySelector('[data-nav-item=notes]')");
      await evaluate('window.electronAPI.settings.set("workspace.prefs.v1", { restoreTabs: true, restoreFocus: "new", linkTarget: "new" })');
      assert.equal(await evaluate('document.documentElement.dir'), rtl ? 'rtl' : 'ltr');
      assert.equal((await tabIds()).length, 1, `${lang}: starts with 1 tab`);

      const openNotePreview = async () => {
        await click('[data-nav-item=notes]');
        await until(`!!${visiblePanel}?.querySelector('[data-study-note]')`);
        await evaluate(`(() => {
          const panel = ${visiblePanel};
          const btn = [...panel.querySelectorAll('[data-study-note]')].find(b => b.textContent?.includes(${JSON.stringify(noteTitle)}));
          if (btn) btn.click();
        })()`);
        await until(`!!${visiblePanel}?.querySelector('[data-note-preview-toggle]')`);
        await evaluate(`(() => {
          const panel = ${visiblePanel};
          const toggle = panel.querySelector('[data-note-preview-toggle]');
          if (toggle && toggle.getAttribute('data-note-preview-toggle') === 'edit') toggle.click();
        })()`);
        await until(`!!${visiblePanel}?.querySelector('[data-study-link=${JSON.stringify(bookTarget)}]')`);
      };

      await openNotePreview();
      await shot(`01-note-preview-${lang}`);

      // 1. Default ("new"): click book link -> opens new tab on page 3
      await evaluate(`${visiblePanel}.querySelector('[data-study-link=${JSON.stringify(bookTarget)}]').click()`);
      await until(`document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]').length === 2`);
      await until(`!!${visiblePanel}?.querySelector('[data-reader-go-to]') && !!${visiblePanel}?.querySelector('.pdf-page-container[data-page-number="3"] canvas')`);
      const tabsAfterDefaultBook = await tabIds();
      assert.equal(await activeId(), tabsAfterDefaultBook[1], `${lang}: new tab is active`);
      await shot(`02-default-new-tab-book-${lang}`);

      // 2. Ctrl+click ayah link in tab 1 -> opens in current tab (tab 1)
      await click(`[data-workspace-tab-row] [data-tab-id="${tabsAfterDefaultBook[0]}"]`);
      await until(`!!${visiblePanel}?.querySelector('[data-study-link=${JSON.stringify(quranTarget)}]')`);
      await evaluate(`(() => {
        const el = ${visiblePanel}.querySelector('[data-study-link=${JSON.stringify(quranTarget)}]');
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      })()`);
      await until(`!!${visiblePanel}?.querySelector('[data-quran-mushaf]')`);
      assert.equal((await tabIds()).length, 2, `${lang}: Ctrl+click stayed in current tab`);
      assert.equal(await activeId(), tabsAfterDefaultBook[0], `${lang}: tab 1 remains active`);
      await shot(`03-ctrl-click-same-tab-quran-${lang}`);

      // 3. Switch setting to "The same tab"
      await click('[data-nav-item=settings]');
      await until(`!!${visiblePanel}?.querySelector('[data-settings-entry="workspace"]')`);
      await click('[data-settings-entry="workspace"]');
      await until(`!!${visiblePanel}?.querySelector('[data-workspace-link-target="same"]')`);
      await click('[data-workspace-link-target="same"]');
      await until(`${visiblePanel}?.querySelector('[data-workspace-link-target="same"]')?.getAttribute('aria-pressed') === 'true'`);
      await shot(`04-settings-same-tab-${lang}`);

      // 4. With "same": normal click opens in current tab; Ctrl+click opens in new tab
      await openNotePreview();
      await evaluate(`${visiblePanel}.querySelector('[data-study-link=${JSON.stringify(bookTarget)}]').click()`);
      await until(`!!${visiblePanel}?.querySelector('[data-reader-go-to]') && !!${visiblePanel}?.querySelector('.pdf-page-container[data-page-number="3"] canvas')`);
      assert.equal((await tabIds()).length, 2, `${lang}: click with "same" stayed in tab 1`);
      assert.equal(await activeId(), tabsAfterDefaultBook[0]);
      await shot(`05-same-tab-click-book-${lang}`);

      await openNotePreview();
      await evaluate(`(() => {
        const el = ${visiblePanel}.querySelector('[data-study-link=${JSON.stringify(quranTarget)}]');
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      })()`);
      await until(`document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]').length === 3`);
      await until(`!!${visiblePanel}?.querySelector('[data-quran-mushaf]')`);
      const tabsAfterCtrlNew = await tabIds();
      assert.equal(await activeId(), tabsAfterCtrlNew[2], `${lang}: Ctrl+click with "same" opened tab 3`);
      await shot(`06-same-tab-ctrl-new-tab-quran-${lang}`);

      // 5. Right-click menu: "Open in new tab" & "Open here"
      await click(`[data-workspace-tab-row] [data-tab-id="${tabsAfterCtrlNew[0]}"]`);
      await openNotePreview();
      await evaluate(`(() => {
        const el = ${visiblePanel}.querySelector('[data-study-link=${JSON.stringify(bookTarget)}]');
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + 4 }));
      })()`);
      await until(`!!document.querySelector('[data-baglib-menu]')`);
      const menuLabels = await evaluate("[...document.querySelectorAll('[data-baglib-menu] [role=\"menuitem\"]')].map(m => m.textContent.trim())");
      const newTabText = rtl ? 'فتح في علامة تبويب جديدة' : 'Open in new tab';
      const hereText = rtl ? 'فتح هنا' : 'Open here';
      assert.ok(menuLabels.some(l => l.includes(newTabText)), `${lang}: menu has "${newTabText}"`);
      assert.ok(menuLabels.some(l => l.includes(hereText)), `${lang}: menu has "${hereText}"`);
      await shot(`07-context-menu-${lang}`);

      // Click "Open in new tab" -> opens tab 4
      await evaluate(`(() => {
        const item = [...document.querySelectorAll('[data-baglib-menu] [role="menuitem"]')].find(m => m.textContent.includes(${JSON.stringify(newTabText)}));
        item.click();
      })()`);
      await until(`document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]').length === 4`);
      await until(`!!${visiblePanel}?.querySelector('[data-reader-go-to]') && !!${visiblePanel}?.querySelector('.pdf-page-container[data-page-number="3"] canvas')`);

      // Switch back to tab 1, right-click ayah link and click "Open here" -> opens in tab 1
      await click(`[data-workspace-tab-row] [data-tab-id="${tabsAfterCtrlNew[0]}"]`);
      await until(`!!${visiblePanel}?.querySelector('[data-study-link=${JSON.stringify(quranTarget)}]')`);
      await evaluate(`(() => {
        const el = ${visiblePanel}.querySelector('[data-study-link=${JSON.stringify(quranTarget)}]');
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + 4 }));
      })()`);
      await until(`!!document.querySelector('[data-baglib-menu]')`);
      await evaluate(`(() => {
        const item = [...document.querySelectorAll('[data-baglib-menu] [role="menuitem"]')].find(m => m.textContent.includes(${JSON.stringify(hereText)}));
        item.click();
      })()`);
      await until(`!!${visiblePanel}?.querySelector('[data-quran-mushaf]')`);
      assert.equal((await tabIds()).length, 4, `${lang}: "Open here" stayed in tab 1`);
      assert.equal(await activeId(), tabsAfterCtrlNew[0]);
    }

    assert.equal(errors.length, 0, `Renderer errors: ${errors.join('; ')}`);
    clearTimeout(hardTimer);
    app.quit();
  })().catch(err => {
    console.error(err);
    clearTimeout(hardTimer);
    app.exit(1);
  });
});

require('../../dist/main/index.js');
