const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = process.env.BAGLIB_PAGES_PROFILE;
const evidence = process.env.BAGLIB_PAGES_EVIDENCE;
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let i = 0; i < 250; i++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(150);
    }
    throw new Error('Timed out ' + code);
  };
  const click = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
  const press = keyCode => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    if (keyCode === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  };
  const shot = async name => { await pause(250); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  (async () => {
    win.setMinimumSize(320, 400);
    win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
    const files = ['ar', 'en'].map(lang => manifest.files.find(file => file.kind === 'pdf' && file.lang === lang && file.path.includes('/text-layer/')));
    assert.ok(files.every(Boolean));
    const result = await evaluate('window.electronAPI.importDigitalFiles(' + JSON.stringify(files.map(file => ({ filePath: path.resolve('tests/real-files', file.path), duplicateAction: 'import_anyway' }))) + ',"reader-pages")');
    assert.equal(result.successfulImports, 2);
    const books = await evaluate('window.electronAPI.getAllBooks()');
    const results = [];
    for (const language of ['ar', 'en']) {
      for (const file of files) {
        await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(language) + ')');
        await win.loadURL('http://localhost:3000');
        await until('!!document.querySelector("[data-nav-item=library]")');
        await click('[data-nav-item=library]');
        await until('!!document.querySelector("[data-view-mode-toggle]")');
        await click('[data-view-mode-toggle] button:last-child');
        const book = books.find(book => book.filePath === path.resolve('tests/real-files', file.path));
        assert.ok(book);
        await until('[...document.querySelectorAll("[data-library-book-row]")].some(row=>row.getAttribute("aria-label")===' + JSON.stringify(book.title) + ')');
        await evaluate('[...document.querySelectorAll("[data-library-book-row]")].find(row=>row.getAttribute("aria-label")===' + JSON.stringify(book.title) + ').focus()');
        press('Enter');
        await until('!!document.querySelector("[data-reader-go-to]") && !!document.querySelector(".pdf-page-container canvas")');
        assert.equal(await evaluate('document.documentElement.dir'), language === 'ar' ? 'rtl' : 'ltr');
        for (const width of [1280, 480]) {
          win.setContentSize(width, 900);
          for (const page of [1, 5, 4]) {
            const displayed = new Intl.NumberFormat(language, { numberingSystem: language === 'ar' ? 'arab' : 'latn', useGrouping: false }).format(page);
            await evaluate('document.querySelector("[data-reader-go-to]").focus();document.querySelector("[data-reader-go-to]").select()');
            await win.webContents.insertText(displayed);
            press('Enter');
            await until('document.querySelector("[data-reader-go-to]")?.value===' + JSON.stringify(displayed) + ' && !!document.querySelector(' + JSON.stringify('.pdf-page-container[data-page-number="' + page + '"] canvas') + ')');
            assert.equal(await evaluate('document.querySelector("[data-reader-go-to]").title'), displayed);
            assert.equal(await evaluate('document.querySelector("[data-reader-go-to]").getAttribute("aria-valuenow")'), String(page));
            const prefix = `${language}-${file.lang}-${width}-${page}`;
            await shot(prefix);
            results.push({ language, file: file.path, width, page, displayed });
          }
        }
      }
    }
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(results, null, 2));
    console.log('PASS reader page numbers', results.length);
    app.quit();
  })().catch(async error => {
    console.error(error);
    fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error.stack || error));
    try { await shot('failure'); } finally { app.exit(1); }
  });
});
require('../../dist/main/index.js');
