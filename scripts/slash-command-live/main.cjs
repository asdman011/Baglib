const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = path.resolve(process.env.BAGLIB_KEY349_PROFILE);
const evidence = process.env.BAGLIB_KEY349_EVIDENCE;
assert.equal(path.dirname(profile), path.resolve('.baglib-data'));
assert.ok(path.basename(profile).startsWith('KEY-349-live-'));
const inputs = JSON.parse(fs.readFileSync(path.join(profile, 'inputs.json'), 'utf8'));
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
require('tsx/cjs');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../src/main/database/migrator.ts');
const { migrations } = require('../../src/main/database/migrations/index.ts');
const { studyLinkText, bookStudyTarget } = require('../../src/shared/study-notes.ts');
const { SLASH_SCOPES } = require('../../src/shared/slash-command.ts');
fs.mkdirSync(path.join(profile, 'data'), { recursive: true });
const initial = new Database(path.join(profile, 'data/baglib.db'));
runMigrations(initial, migrations); initial.close();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return; started = true;
  const errors = [];
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let attempt = 0; attempt < 300; attempt++) {
      try { if (await evaluate(code)) return; } catch { /* mounting */ }
      await pause(120);
    }
    throw Error('Timeout ' + code + '\n' + await evaluate('document.body.innerText.slice(-2500)'));
  };
  const key = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await pause(90);
  };
  const editor = '[data-study-note-editor]';
  const content = editor + ' .cm-content';
  const text = () => evaluate(`document.querySelector('${editor}').value`);
  const setText = async value => {
    await evaluate(`document.querySelector('${content}').focus()`);
    await key('a', ['control']);
    await win.webContents.insertText(value);
    await key('End', ['control']);
  };
  const optionCount = scope => `document.querySelectorAll('[data-slash-search] [data-slash-scope="${scope}"]').length`;
  const ready = scope => until(`document.querySelector('[data-slash-search]')?.getAttribute('aria-busy')==='false' && ${optionCount(scope)}>0`);
  const shot = async name => {
    await until("!document.querySelector('[data-splash-brand]')"); await pause(250);
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  win.webContents.on('did-finish-load', () => evaluate("window.electronAPI?.settings.set('onboarding.v1',{seen:true})").catch(() => {}));
  (async () => {
    win.setMinimumSize(320, 400); win.setContentSize(1280, 1000); win.show();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    for (const input of inputs) {
      const result = await evaluate(`window.electronAPI.importDigitalFile({filePath:${JSON.stringify(input.copy)},customTitle:${JSON.stringify('\u0627\u0644\u0644\u0647 ' + input.kind + ' ' + input.lang)}})`);
      assert.equal(result.success, true, 'real copy imported: ' + input.path);
    }
    const note = await evaluate(`window.electronAPI.studyNotes.save({title:'\u0627\u0644\u0644\u0647 Mixed \u0639\u0650\u0644\u0652\u0645',content:'Learning body',aliases:['Learning'],tags:[]})`);
    await until("window.electronAPI.quran.readerCatalog().then(r=>r.ok&&r.data.sources.some(s=>s.kind==='script'&&s.profile==='hafs'))");
    const matrix = [];
    for (const lang of ['ar', 'en']) {
      console.log('checking language ' + lang);
      await evaluate(`localStorage.setItem('baglib-lang','${lang}')`);
      await win.loadURL('http://localhost:3000');
      await until(`document.documentElement.lang==='${lang}'&&!!document.querySelector('[data-nav-item=notes]')`);
      await evaluate("document.querySelector('[data-nav-item=notes]').click()");
      await until("!!document.querySelector('[data-notes-overview]')");
      await evaluate("window.dispatchEvent(new CustomEvent('baglib:new-note'))");
      await until(`!!document.querySelector('${content}')`);
      assert.equal(await evaluate('document.documentElement.dir'), lang === 'ar' ? 'rtl' : 'ltr');
      await setText('/');
      await until("document.querySelectorAll('[data-slash-scope]').length===6");
      assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-slash-scope]')].map(e=>e.dataset.slashScope)"), SLASH_SCOPES);
      assert.equal(await evaluate("document.querySelector('[data-slash-search]').dir"), lang === 'ar' ? 'rtl' : 'ltr');
      await shot('scopes-' + lang);
      await key('Up');
      assert.equal(await evaluate("document.querySelector('[data-slash-scope][aria-selected=true]').dataset.slashScope"), 'lectures');
      await key('Down'); await key('Enter');
      assert.equal(await text(), '/quran ');
      await setText('/quran 2:255'); await ready('quran');
      await shot('quran-' + lang); await key('Enter');
      assert.equal(await text(), studyLinkText('quran:hafs:2:255', '2:255'));
      await setText('/notes'); await ready('notes');
      await key('Enter'); assert.equal(await text(), studyLinkText(`note:${note.id}`, note.title));
      await setText('/books \u0627\u0644\u0644\u0647'); await ready('books');
      assert.equal(await evaluate(optionCount('books')), 2);
      await shot('books-' + lang);
      const items = await evaluate("[...document.querySelectorAll('[data-slash-scope=books] bdi')].map(e=>e.textContent)");
      await evaluate("document.querySelectorAll('[data-slash-scope=books]')[1].dispatchEvent(new MouseEvent('mouseenter'))");
      assert.equal(await evaluate("document.querySelector('[aria-selected=true][data-slash-scope] bdi').textContent"), items[1]);
      await evaluate("document.querySelectorAll('[data-slash-scope=books]')[1].click()");
      const selectedBook = await evaluate(`window.electronAPI.getAllBooks().then(books=>books.find(book=>book.title===${JSON.stringify(items[1])}))`);
      assert.equal(await text(), studyLinkText(bookStudyTarget(selectedBook), selectedBook.title));
      await setText('/lectures'); await ready('lectures'); assert.equal(await evaluate(optionCount('lectures')), 2);
      await setText('/sunnah \u0627\u0644\u0644\u0647'); await ready('sunnah'); await shot('sunnah-' + lang); await key('Enter'); assert.ok((await text()).startsWith('[[sunnah:'));
      await setText('/albayan \u0627\u0644\u0644\u0647'); await ready('albayan'); await shot('albayan-' + lang); await key('Enter'); assert.ok((await text()).startsWith('[[poetry:ashaar:'));
      await setText('/\u0627\u0644\u0644\u0647');
      await until("document.querySelector('[data-slash-search]')?.getAttribute('aria-busy')==='false'&&document.querySelectorAll('.cm-slash-heading').length>=6");
      const groups = await evaluate("[...new Set([...document.querySelectorAll('[data-slash-scope]')].map(e=>e.dataset.slashScope))]");
      assert.deepEqual(groups, SLASH_SCOPES);
      for (const scope of SLASH_SCOPES) assert.ok(await evaluate(optionCount(scope)) <= 3);
      for (let step = 0; step < 12; step++) await key('Down');
      await pause(150);
      assert.equal(await evaluate(`(()=>{const menu=document.querySelector('[data-slash-search]');const row=menu.querySelector('[aria-selected=true]');const box=menu.getBoundingClientRect(),item=row.getBoundingClientRect();return item.top>=box.top&&item.bottom<=box.bottom&&menu.scrollTop>0;})()`), true, 'keyboard scrolls selected results into view');
      await shot('free-scrolled-' + lang);
      for (let step = 0; step < 12; step++) await key('Up');
      await shot('free-' + lang);
      await key('Escape'); assert.equal(await evaluate("!!document.querySelector('[data-slash-search]')"), false);
      await setText('/quran Allah'); await ready('quran'); await key('Enter'); assert.ok((await text()).startsWith('[[quran:hafs:'));
      await setText('/quran \u0627\u0644\u0644\u0647'); await pause(260);
      await setText('/notes Learning'); await ready('notes');
      await setText('/books \u0627\u0644\u0644\u0647'); await ready('books'); await pause(500); assert.equal(await evaluate(optionCount('notes')), 0, 'stale notes do not replace books');
      await setText('/'); await until("!!document.querySelector('[data-slash-search]')"); await key('Backspace');
      await until("!document.querySelector('[data-slash-search]')"); assert.equal(await text(), '');
      const aliases = ['\u0627\u0644\u0642\u0631\u0622\u0646 2:255', '\u0627\u0644\u0633\u0646\u0629 \u0627\u0644\u0644\u0647', '\u0627\u0644\u0628\u064a\u0627\u0646 \u0627\u0644\u0644\u0647', '\u0645\u0644\u0627\u062d\u0638\u0627\u062a', '\u0643\u062a\u0628', '\u0645\u062d\u0627\u0636\u0631\u0627\u062a'];
      for (let i = 0; i < aliases.length; i++) { await setText('/' + aliases[i]); await ready(SLASH_SCOPES[i]); }
      await setText('/heading'); await key('Space', ['control']); await until("!!document.querySelector('.cm-tooltip-autocomplete')"); await key('Enter'); assert.equal(await text(), '## ');
      win.setContentSize(480, 760); await setText('/'); await until("!!document.querySelector('[data-slash-search]')"); await shot('narrow-' + lang);
      const bounds = await evaluate("(()=>{const r=document.querySelector('[data-slash-search]').getBoundingClientRect();return {x:r.x,right:r.right,bottom:r.bottom}})()");
      assert.ok(bounds.x >= 0 && bounds.right <= 480 && bounds.bottom <= 760, 'caret menu fits narrow viewport');
      win.setContentSize(1280, 1000);
      matrix.push({ lang, scopes: 6, sources: 6, aliases: 6, keyboard: true, mouse: true, pickerLink: true, stale: true, narrow: true });
    }
    assert.deepEqual(errors, []);
    const result = { passed: matrix.length, matrix, rendererErrors: errors.length, realCopiesImported: inputs.length };
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result)); app.quit();
  })().catch(async error => { console.error(error); console.error(JSON.stringify({ errors })); try { await shot('failure'); } finally { app.exit(1); } });
});
require('../../dist/main/index.js');
