require('tsx/cjs');
const { translations } = require('../../src/renderer/translations.ts');
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = process.env.BAGLIB_KEYS_PROFILE;
const evidence = process.env.BAGLIB_KEYS_EVIDENCE;
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true).catch(error => { throw new Error(error.message + ': ' + code.slice(0, 300)); });
  const until = async (code, attempts = 200) => {
    for (let i = 0; i < attempts; i++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(150);
    }
    throw new Error('Timed out ' + code);
  };
  const click = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
  const press = (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    // Native button activation uses Enter's keypress in addition to raw keydown/up.
    if (keyCode === 'Enter' && modifiers.length === 0) win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  };
  const shot = async name => { await pause(350); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const navigateLibrary = async () => {
    await until('!!document.querySelector("[data-nav-item=library]")');
    await click('[data-nav-item=library]');
    await until('!!document.querySelector("[data-library-recent]")');
  };
  const focusIndex = async (selector, index) => {
    await until('document.querySelectorAll(' + JSON.stringify(selector) + ').length > ' + index);
    await evaluate('[...document.querySelectorAll(' + JSON.stringify(selector) + ')][' + index + '].focus()');
  };
  const activeIndex = selector => evaluate('[...document.querySelectorAll(' + JSON.stringify(selector) + ')].indexOf(document.activeElement)');
  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  (async () => {
    win.setMinimumSize(320, 400);
    win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await pause(700);
    await win.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate('window.electronAPI.getAllBooks().then(async books => { for (const book of books) await window.electronAPI.deleteBook(book.id); })');
    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
    const files = ['ar', 'en'].map(lang => manifest.files.find(file => file.kind === 'pdf' && file.lang === lang && file.path.includes('/text-layer/')));
    assert.ok(files.every(Boolean));
    const options = files.map(file => ({ filePath: path.resolve('tests/real-files', file.path), duplicateAction: 'import_anyway' }));
    const imported = await evaluate('window.electronAPI.importDigitalFiles(' + JSON.stringify(options) + ',"keys-live")');
    assert.equal(imported.successfulImports, 2);
    for (let i = 0; i < 6; i++) {
      await evaluate('window.electronAPI.addBook(' + JSON.stringify({ id: 'focus-' + i, title: 'كتاب Focus ' + i, author: 'مؤلف Author', bookType: 'physical', workType: 'book', readingStatus: 'unread', tags: [] }) + ')');
    }
    const results = [];
    for (const lang of ['ar', 'en']) {
      await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(lang) + ')');
      await win.loadURL('http://localhost:3000');
      await until('!!window.electronAPI && !!document.querySelector("footer")');
      await navigateLibrary();
      assert.equal(await evaluate('document.documentElement.dir'), lang === 'ar' ? 'rtl' : 'ltr');
      for (const width of [1280, 480]) {
        console.log('Keyboard matrix', lang, width);
        win.setContentSize(width, 900);
        await pause(450);
        for (const view of ['grid', 'list']) {
          console.log('View', view);
          const toggle = '[data-view-mode-toggle] button:' + (view === 'grid' ? 'first-child' : 'last-child');
          // Switch view using the existing keyboard-accessible controls.
          await evaluate('document.querySelector(' + JSON.stringify(toggle) + ').focus()');
          await until('document.activeElement === document.querySelector(' + JSON.stringify(toggle) + ')');
          await pause(150);
          press('Enter');
          const selector = view === 'grid' ? '[data-library-book-card]' : '[data-library-book-row]';
          await until('document.querySelectorAll(' + JSON.stringify(selector) + ').length === 8');
          press('Tab'); await pause(100);
          await focusIndex(selector, 1);
          const forward = lang === 'ar' ? 'Left' : 'Right';
          const backward = lang === 'ar' ? 'Right' : 'Left';
          press(forward); await pause(150); assert.equal(await activeIndex(selector), 2);
          press(backward); await pause(150); assert.equal(await activeIndex(selector), 1);
          const columns = await evaluate('(() => { const nodes=[...document.querySelectorAll(' + JSON.stringify(selector) + ')]; const top=nodes[0].getBoundingClientRect().top; return nodes.filter(node=>Math.abs(node.getBoundingClientRect().top-top)<2).length; })()');
          press('Down'); await pause(150); assert.equal(await activeIndex(selector), Math.min(7, 1 + columns));
          press('Up'); await pause(150); assert.equal(await activeIndex(selector), 1);
          press('Home'); await pause(150); assert.equal(await activeIndex(selector), 0);
          press(backward); await pause(150); assert.equal(await activeIndex(selector), 0);
          press('End'); await pause(150); assert.equal(await activeIndex(selector), 7);
          press('Down'); await pause(150); assert.equal(await activeIndex(selector), 7);
          const focus = await evaluate('({visible:document.activeElement.matches(":focus-visible"),outline:getComputedStyle(document.activeElement).outlineStyle,shadow:getComputedStyle(document.activeElement).boxShadow,cellShadow:document.activeElement.querySelector("td")?getComputedStyle(document.activeElement.querySelector("td")).boxShadow:null})');
          assert.equal(focus.visible, true);
          assert.ok(focus.outline !== 'none' || focus.shadow !== 'none');
          if (view === 'list') assert.notEqual(focus.cellShadow, 'none', 'Inset focus remains visible inside a scrolling table');
          assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Page overflow');
          if (view === 'list' && width === 480) {
            // KEY-309: phone rows fit the table without horizontal scrolling; the row menu stays reachable.
            const fit = await evaluate('(() => { const table=document.querySelector("[data-library-book-row]").closest("table"); const box=table.parentElement; const menu=document.querySelector("[data-library-book-row] [data-row-menu-button]"); const r=menu&&menu.getBoundingClientRect(); return { scrolls: box.scrollWidth > box.clientWidth + 1, menuVisible: !!r && r.width > 0 && r.left >= 0 && r.right <= innerWidth }; })()');
            assert.deepEqual(fit, { scrolls: false, menuVisible: true }, 'list rows at 480 px: ' + JSON.stringify(fit));
          }
          await shot(lang + '-' + width + '-' + view + '-focus');
          // Text controls retain their own arrow handling and Escape clears the controlled query.
          await evaluate('document.querySelector("[data-simple-search-input]").focus()');
          await until('document.activeElement.hasAttribute("data-simple-search-input")');
          await win.webContents.insertText(lang === 'ar' ? 'كِتَاب' : 'Focus');
          await until('document.querySelectorAll(' + JSON.stringify(selector) + ').length === 6');
          press('Down'); await pause(120);
          assert.equal(await evaluate('document.activeElement.hasAttribute("data-simple-search-input")'), true);
          press('Escape');
          await until('document.querySelector("[data-simple-search-input]").value === "" && document.querySelectorAll(' + JSON.stringify(selector) + ').length === 8');
          await click(selector + ' input[type=checkbox]');
          await focusIndex(selector, 0);
          press('Escape');
          await until('document.querySelectorAll(' + JSON.stringify(selector + ' input[type=checkbox]:checked') + ').length === 0');
          results.push({ lang, width, view, columns, focus });
        }
        // Recent Imported shares the search path, including Arabic orthographic variants.
        await click('[data-recent-view="imported"]');
        await until('document.querySelectorAll("[data-library-book-row]").length === 2');
        await evaluate('document.querySelector("[data-simple-search-input]").focus()');
        await until('document.activeElement.hasAttribute("data-simple-search-input")');
        await win.webContents.insertText(lang === 'ar' ? 'أراضي' : 'New Scientist');
        await until('document.querySelectorAll("[data-library-book-row]").length === 1');
        press('Escape');
        await until('document.querySelectorAll("[data-library-book-row]").length === 2');
        await click('[data-recent-view="all"]');
        await until('document.querySelectorAll("[data-library-book-row]").length === 8');
        console.log('Grid/list and Recent Arabic search checks passed');
        // Ctrl+K, Escape and workspace switching through existing palette behavior.
        await focusIndex('[data-library-book-row]', 0);
        press('K', ['control']);
        await until('!!document.querySelector("[role=dialog] input[type=search]")');
        await until('document.activeElement.matches("[role=dialog] input[type=search]")');
        await evaluate('document.activeElement.select()');
        await win.webContents.insertText('/workspaces ' + translations[lang].navDashboard);
        await pause(300);
        press('Enter');
        await until('!document.querySelector("[role=dialog]") && !document.querySelector("[data-library-recent]")');
        await evaluate('document.body.focus()');
        press('K', ['control']);
        await until('!!document.querySelector("[role=dialog] input[type=search]")');
        console.log('Dashboard palette open');
        await until('document.activeElement.matches("[role=dialog] input[type=search]")');
        await evaluate('document.activeElement.select()');
        await win.webContents.insertText('/workspaces ' + translations[lang].navLibrary);
        await pause(300);
        press('Enter');
        await until('!!document.querySelector("[data-library-recent]")');
        await focusIndex('[data-library-book-row]', 0);
        press('K', ['control']);
        await until('!!document.querySelector("[role=dialog]")');
        press('Escape');
        await until('!document.querySelector("[role=dialog]")');
        await evaluate("window.dispatchEvent(new CustomEvent('baglib:shortcut-help'))");
        await until('!!document.querySelector("[data-shortcut-scope=library]")');
        assert.equal(await evaluate('document.querySelectorAll("[data-shortcut-scope=library] [data-shortcut-id]").length'), 8);
        await evaluate('document.querySelector("[data-shortcut-scope=library]").scrollIntoView({block:"start"})');
        await shot(lang + '-' + width + '-help');
        press('Escape');
        await until('!document.querySelector("[role=dialog]")');
      }
      // Enter on a list row opens an actual imported real PDF.
      const titles = await evaluate('window.electronAPI.getAllBooks().then(books=>books.filter(book=>!!book.filePath).map(book=>book.title))');
      const title = titles[lang === 'ar' ? 0 : 1];
      await until('document.querySelectorAll("[data-library-book-row]").length === 8');
      await evaluate('([...document.querySelectorAll("[data-library-book-row]")].find(row=>row.getAttribute("aria-label") === ' + JSON.stringify(title) + ')).focus()');
      press('Enter');
      await until('!document.querySelector("[data-library-recent]")');
      await until('window.electronAPI.reader.getRecentActivity().then(rows=>rows.length>0)');
      await navigateLibrary();
    }
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
    app.exit(0);
  })().catch(async error => { console.error(error); try { await shot('failure'); } catch {} app.exit(1); });
});
require('../../dist/main/index.js');
