require('tsx/cjs');
const { translations } = require('../../src/renderer/translations.ts');
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = process.env.BAGLIB_RECENT_PROFILE;
const evidence = process.env.BAGLIB_RECENT_EVIDENCE;
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async (code, attempts = 200) => {
    for (let i = 0; i < attempts; i++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(200);
    }
    throw new Error('Timed out ' + code);
  };
  const click = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
  const press = keyCode => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode }); };
  const shot = async name => { await pause(400); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const clickLabel = async label => {
    const found = await evaluate('(() => { const el = [...document.querySelectorAll("button")].find(el => el.getAttribute("aria-label") === ' + JSON.stringify(label) + ' || el.textContent.trim() === ' + JSON.stringify(label) + '); if (el) el.click(); return Boolean(el); })()');
    assert.ok(found, 'Button missing ' + label);
  };
  const books = () => evaluate('window.electronAPI.getAllBooks()');
  const labels = () => evaluate('[...document.querySelectorAll("[data-library-book-card]")].map(el=>el.getAttribute("aria-label"))');
  const select = async view => { await click('[data-recent-view="' + view + '"]'); await pause(450); };
  const navigateLibrary = async () => {
    await until('!!document.querySelector("[data-nav-item=library]")');
    await click('[data-nav-item=library]');
    await until('!!document.querySelector("[data-library-recent]")');
  };
  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  (async () => {
    win.setMinimumSize(320, 400);
    win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await pause(1000);
    // Reload after persisting onboarding before the first meaningful interaction.
    await win.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    // Soft-delete the four demo records seeded into this newly created throwaway profile.
    await evaluate('window.electronAPI.getAllBooks().then(async books => { for (const book of books) await window.electronAPI.deleteBook(book.id); })');
    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
    const files = ['ar', 'en'].map(lang => manifest.files.find(file => file.kind === 'pdf' && file.lang === lang && file.path.includes('/text-layer/')));
    assert.ok(files.every(Boolean), 'Arabic and English real PDFs required');
    const options = files.map((file, i) => ({ filePath: path.resolve('tests/real-files', file.path), title: i === 0 ? 'قِراءة عربية Arabic' : 'English Reading العربية', duplicateAction: 'import_anyway' }));
    const imported = await evaluate('window.electronAPI.importDigitalFiles(' + JSON.stringify(options) + ',"recent-live")');
    assert.equal(imported.successfulImports, 2, JSON.stringify(imported));
    console.log('Real imports completed', imported.successfulImports);
    const records = await books();
    assert.equal(records.length, 2);
    await win.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await navigateLibrary();
    await until('document.querySelectorAll("[data-library-book-card]").length === 2');
    console.log('Library loaded');
    // Open a real book through its normal Library entry point.
    await click('[data-library-book-card] [data-card-read-button]');
    await until('window.electronAPI.reader.getRecentActivity().then(rows => rows.length > 0)');
    await pause(1200);
    await navigateLibrary();
    console.log('Reader opened and returned to Library');
    const activity = await evaluate('window.electronAPI.reader.getRecentActivity()');
    assert.ok(activity.length > 0);
    const openedId = activity.sort((a,b) => b.lastOpenedAt-a.lastOpenedAt)[0].workId;
    const openedTitle = records.find(book => book.id === openedId).title;
    // A completed historical session must also be included, behind the real opening.
    const other = records.find(book => book.id !== openedId);
    await evaluate('window.electronAPI.reader.recordSession(' + JSON.stringify({ workId: other.id, startedAt: '2026-01-01T10:00:00Z', endedAt: '2026-01-01T10:01:00Z', pagesRead: 1 }) + ')');
    const results = [];
    for (const lang of ['ar', 'en']) {
      await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(lang) + ')');
      await win.loadURL('http://localhost:3000');
      await until('!!window.electronAPI && !!document.querySelector("footer")');
      await navigateLibrary();
      assert.equal(await evaluate('document.documentElement.dir'), lang === 'ar' ? 'rtl' : 'ltr');
      for (const width of [1280, 480]) {
        win.setContentSize(width, 900);
        await pause(600);
        console.log('Matrix', lang, width);
        for (const view of ['opened', 'imported']) {
          await select(view);
          await until('document.querySelectorAll("[data-library-book-card]").length === 2');
          const actual = await labels();
          const recentText = await evaluate('document.querySelector("[data-library-recent]").textContent');
          assert.ok(!recentText.includes('?'), 'Recent labels must preserve Arabic text');
          if (view === 'opened') assert.deepEqual(actual, [openedTitle, other.title]);
          else {
            const expected = [...records].sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt) || a.id.localeCompare(b.id)).map(book => book.title);
            assert.deepEqual(actual, expected);
          }
          assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Page overflow');
          await shot(lang + '-' + width + '-' + view + '-grid');
          await click('[data-view-mode-toggle] button:last-child');
          await until('document.querySelectorAll("tbody tr").length === 2');
          const list = await evaluate('[...document.querySelectorAll("tbody tr")].map(el=>el.textContent)');
          assert.ok(list.every((text,i) => text.includes(actual[i])));
          await shot(lang + '-' + width + '-' + view + '-list');
          await click('[data-view-mode-toggle] button:first-child');
          await until('document.querySelectorAll("[data-library-book-card]").length === 2');
          results.push({ lang, width, view, titles: actual });
        }
        // Real selection + bulk shelf, tags, and metadata audit on Imported.
        await evaluate('[...document.querySelectorAll("[data-library-book-card] input[type=checkbox]")].forEach(el=>el.click())');
        await until('!!document.querySelector("[data-bulk-shelf]")');
        await click('[data-bulk-shelf]');
        await until('!!document.querySelector("[data-bulk-shelf-dialog] input")');
        await evaluate('document.querySelector("[data-bulk-shelf-dialog] input").focus()');
        await win.webContents.insertText('رف Recent ' + lang);
        press('Enter');
        await until('!document.querySelector("[data-bulk-shelf-dialog]")');
        await select('all');
        await select('imported');
        await evaluate('[...document.querySelectorAll("[data-library-book-card] input[type=checkbox]")].forEach(el=>el.click())');
        await clickLabel(translations[lang].bulkAddTagsBtn);
        await until('!!document.querySelector("[role=dialog] input[role=combobox]")');
        await evaluate('document.querySelector("[role=dialog] input[role=combobox]").focus()');
        const tag = 'مراجعة-Recent-' + lang + '-' + width;
        await win.webContents.insertText(tag);
        press('Enter');
        await pause(300);
        await clickLabel(translations[lang].bulkApplyBtn);
        await until('!document.querySelector("[role=dialog]")');
        await until('window.electronAPI.getAllBooks().then(books=>books.every(book=>book.tags.includes(' + JSON.stringify(tag) + ')))');
        await select('all');
        await select('imported');
        await evaluate('[...document.querySelectorAll("[data-library-book-card] input[type=checkbox]")].forEach(el=>el.click())');
        await clickLabel(translations[lang].auditAndRefreshMetadata);
        await until('!!document.querySelector("[role=dialog]")');
        const audit = await evaluate('document.querySelector("[role=dialog]").textContent');
        assert.ok(records.every(book => audit.includes(book.title)), 'Imported books in audit');
        await shot(lang + '-' + width + '-imported-audit');
        press('Escape');
        await until('!document.querySelector("[role=dialog]")');
        await select('all');
        await select('imported');
        // The existing filter rail remains usable in each responsive layout.
        await click('[data-advanced-filter-button]');
        await until('!!document.querySelector("[data-library-filter-rail]")');
        await shot(lang + '-' + width + '-imported-filters');
        if (width === 480) { press('Escape'); await until('!document.querySelector("[role=dialog]")'); }
        else await click('[data-advanced-filter-button]');
      }
    }
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ imported, results }, null, 2));
    console.log(JSON.stringify(results));
    app.exit(0);
  })().catch(async error => { console.error(error); try { await shot('failure'); } catch {} app.exit(1); });
});
require('../../dist/main/index.js');
