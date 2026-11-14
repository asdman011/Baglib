const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = path.resolve(process.env.BAGLIB_KEY348_PROFILE);
const evidence = process.env.BAGLIB_KEY348_EVIDENCE;
assert.equal(path.dirname(profile), path.resolve('.baglib-data'));
assert.ok(path.basename(profile).startsWith('KEY-348-live-'));
const inputs = JSON.parse(fs.readFileSync(path.join(profile, 'inputs.json'), 'utf8'));
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
require('tsx/cjs');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../src/main/database/migrator.ts');
const { migrations } = require('../../src/main/database/migrations/index.ts');
const { SqliteWorkRepository } = require('../../src/main/database/repositories/work.repository.ts');
fs.mkdirSync(path.join(profile, 'data'), { recursive: true });
const initial = new Database(path.join(profile, 'data', 'baglib.db'));
runMigrations(initial, migrations);
// Already-imported media has no cover. Provider mount must lazily generate one.
const legacyId = 'b7df1f22-02a8-4ef3-a3d7-14325d1b7bd9';
new SqliteWorkRepository(initial).addBook({ id: legacyId, title: 'عِلْم Legacy video', workType: 'video', bookType: 'digital', filePath: inputs.single, digitalFormat: 'mp4' });
initial.close();
const choices = [];
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: choices.shift() || [] });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const errors = [];
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let attempt = 0; attempt < 300; attempt++) {
      try { if (await evaluate(code)) return; } catch { /* mounting */ }
      await pause(150);
    }
    throw Error('Timeout ' + code + '\n' + await evaluate('document.body.innerText.slice(-2200)'));
  };
  const click = async selector => {
    await until(`!!document.querySelector(${JSON.stringify(selector)})`);
    return evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const shot = async name => {
    await until("!document.querySelector('[data-splash-brand]')");
    await pause(300);
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  const wheel = async (deltaY, ctrlKey = true, selector = '[data-library-scroll-container]') => evaluate(`(()=>{const event=new WheelEvent('wheel',{deltaY:${deltaY},ctrlKey:${ctrlKey},bubbles:true,cancelable:true});document.querySelector(${JSON.stringify(selector)}).dispatchEvent(event);return event.defaultPrevented;})()`);
  const changeSearch = async value => evaluate(`(()=>{const input=document.querySelector('[data-library-controls] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  win.webContents.on('did-finish-load', () => evaluate("window.electronAPI?.settings.set('onboarding.v1',{seen:true})").catch(() => {}));
  (async () => {
    win.setMinimumSize(320, 400); win.setContentSize(1440, 1100); win.show();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await until(`window.electronAPI.getAllBooks().then(books=>!!books.find(book=>book.id==='${legacyId}')?.coverImage)`);
    await click('[data-nav-item=lectures]');
    for (const lang of ['ar', 'en']) {
      choices.push([inputs[lang].folder]);
      await click('[data-lecture-add-folder]');
      await until(`window.electronAPI.lectures.series.list().then(groups=>groups.some(group=>group.name==='${lang} Course'&&group.items.length===2))`);
    }
    await until('window.electronAPI.getAllBooks().then(books=>books.length===5&&books.every(book=>!!book.coverImage))');
    const groups = await evaluate('window.electronAPI.lectures.series.list()');
    const books = await evaluate('window.electronAPI.getAllBooks()');
    for (const book of books) {
      assert.ok(book.coverImage.startsWith(path.join(profile, 'covers')), 'existing profile cover directory');
      assert.ok(fs.statSync(book.coverImage).size > 1000, 'nonempty video frame');
    }
    const ar = groups.find(group => group.name === 'ar Course');
    await evaluate(`window.electronAPI.lectures.series.update('${ar.id}',{name:'دُرُوس Mixed course'})`);
    // Explicit membership keeps its ordering regardless of title sort or search.
    const order = ar.items.map(item => path.basename(books.find(book => book.id === item.workId).filePath));
    assert.deepEqual(order, ['2.mp4', '10.mp4']);
    const matrix = [];
    for (const lang of ['ar', 'en']) {
      await evaluate(`localStorage.setItem('baglib-lang','${lang}');window.electronAPI.settings.saveViewPreferences({viewMode:'grid',cardDensity:'comfortable',listDensity:'normal'})`);
      await win.loadURL('http://localhost:3000');
      await until(`document.documentElement.lang==='${lang}'&&!!document.querySelector('[data-nav-item=library]')`);
      await until("!document.querySelector('[data-splash-brand]')");
      assert.equal(await evaluate('document.documentElement.dir'), lang === 'ar' ? 'rtl' : 'ltr');
      await click('[data-nav-item=library]');
      await until("document.querySelectorAll('[data-library-series]').length===2 && document.querySelector('[data-library-view]')?.dataset.cardDensity==='comfortable'");
      assert.equal(await evaluate("document.querySelectorAll('[data-library-book-card]').length"), 3, 'two series and standalone media');
      await until("[...document.querySelectorAll('[data-library-series] img')].every(img=>img.complete&&img.naturalWidth>0)");
      assert.equal(await evaluate("document.querySelectorAll('[data-no-cover-placeholder]').length"), 0);
      const seriesSelector = `[data-library-series="lecture-series-${ar.id}"]`;
      const firstCover = books.find(book => book.id === ar.items[0].workId).coverImage.replace(/\\/g, '/');
      assert.ok((await evaluate(`document.querySelector(${JSON.stringify(seriesSelector + ' img')}).src`)).endsWith(path.basename(firstCover)));
      await shot('grid-' + lang + '-1440');
      const zoom = win.webContents.getZoomFactor();
      for (let count = 0; count < 4; count++) assert.equal(await wheel(-100), true);
      await until("document.querySelector('[data-library-view]').dataset.cardDensity==='spacious'");
      assert.equal(await evaluate("window.electronAPI.settings.getViewPreferences().then(p=>p.cardDensity)"), 'spacious');
      assert.equal(win.webContents.getZoomFactor(), zoom);
      const libraryPoint = await evaluate("(()=>{const b=document.querySelector('[data-library-scroll-container]').getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};})()");
      win.webContents.sendInputEvent({ type: 'mouseWheel', ...libraryPoint, deltaY: 100, deltaX: 0, modifiers: ['control'], canScroll: true });
      await pause(200);
      assert.equal(win.webContents.getZoomFactor(), zoom, 'native Ctrl+wheel suppresses browser zoom');
      assert.equal(await wheel(100, true, 'footer'), false, 'outside library retains browser wheel handling');
      for (let count = 0; count < 4; count++) await wheel(100);
      await until("document.querySelector('[data-library-view]').dataset.cardDensity==='compact'");
      assert.equal(await wheel(100, false), false, 'plain wheel allowed to scroll');
      // Native wheel input actually scrolls the library without Ctrl.
      win.setContentSize(480, 600);
      await pause(300);
      const bounds = await evaluate("(()=>{const b=document.querySelector('[data-library-scroll-container]').getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};})()");
      win.webContents.sendInputEvent({ type: 'mouseWheel', ...bounds, deltaY: -400, deltaX: 0, canScroll: true });
      await pause(400);
      // The synthetic wheel's nonprevented result is also checked when content fits.
      const scroll = await evaluate("document.querySelector('[data-library-scroll-container]').scrollTop");
      assert.ok(scroll > 0, 'plain native wheel scrolls the library');
      win.setContentSize(1440, 1100);
      await click(seriesSelector);
      await until("!!document.querySelector('[data-library-series-items]')");
      const actual = await evaluate("[...document.querySelectorAll('[data-series-item]')].map(button=>button.dataset.seriesItem)");
      assert.deepEqual(actual, ar.items.map(item => item.workId));
      await shot('series-' + lang + '-1440');
      await click(`[data-series-item="${ar.items[1].workId}"]`);
      await until(`document.querySelector('[data-lecture-row="${ar.items[1].workId}"] [data-lecture-select]')?.getAttribute('aria-current')==='true'`);
      await until("document.querySelector('[data-lecture-player]')?.readyState>=1");
      await shot('opened-item-' + lang);
      await click('[data-nav-item=library]');
      await until("!!document.querySelector('[data-library-controls] input')");
      await changeSearch('\u0639\u0644\u0645');
      await until("document.querySelectorAll('[data-library-book-card]').length===1&&document.querySelectorAll('[data-library-series]').length===0");
      assert.ok(await evaluate("document.querySelector('[data-library-book-card]').textContent.includes('Legacy video')"));
      await shot('arabic-search-' + lang);
      await changeSearch('10');
      await until("document.querySelectorAll('[data-library-book-card]').length===2&&document.querySelectorAll('[data-library-series]').length===0");
      await shot('search-items-' + lang);
      await changeSearch('');
      await until("document.querySelectorAll('[data-library-series]').length===2");
      // Resolve the translated view toggle by its current title from the centralized catalog.
      const { translations } = require('../../src/renderer/translations.ts');
      const listKey = 'viewList';
      const listTitle = translations[lang][listKey];
      const switched = await evaluate(`(()=>{const buttons=[...document.querySelectorAll('[data-library-controls] button')];const b=buttons.find(b=>b.title===${JSON.stringify(listTitle)}||b.getAttribute('aria-label')===${JSON.stringify(listTitle)});if(b)b.click();return !!b;})()`);
      assert.ok(switched, 'list view toggle ' + listTitle);
      await until("document.querySelectorAll('[data-library-series-row]').length===2");
      for (let count = 0; count < 4; count++) await wheel(100);
      await until("document.querySelector('[data-library-view]').dataset.listDensity==='compact'");
      await shot('list-compact-' + lang + '-1440');
      for (let count = 0; count < 4; count++) await wheel(-100);
      await until("document.querySelector('[data-library-view]').dataset.listDensity==='normal'");
      assert.equal(await evaluate('window.electronAPI.settings.getViewPreferences().then(p=>p.listDensity)'), 'normal');
      win.setContentSize(480, 900);
      await shot('list-' + lang + '-480');
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      win.setContentSize(1440, 1100);
      await win.loadURL('http://localhost:3000');
      await until("!!document.querySelector('[data-nav-item=library]')&&!document.querySelector('[data-splash-brand]')");
      await click('[data-nav-item=library]');
      await until("document.querySelector('[data-library-view]')?.dataset.cardDensity==='compact'&&document.querySelector('[data-library-view]')?.dataset.listDensity==='normal'&&document.querySelectorAll('[data-library-series-row]').length===2");
      matrix.push({lang,passed:true,series:2,entries:3,orderedItems:2,searchItems:2,covers:5,gridBounds:true,rowBounds:true,persistedAfterReload:true,browserZoom:zoom,plainWheelAllowed:true,scroll});
    }
    assert.deepEqual(errors, [], 'zero renderer errors');
    const result = { matrix, passed: matrix.length, rendererErrors: errors.length, covers: books.map(book => ({ id: book.id, bytes: fs.statSync(book.coverImage).size })) };
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result)); app.quit();
  })().catch(async error => { console.error(error); console.error(JSON.stringify({errors})); try { await shot('failure'); } finally { app.exit(1); } });
});
require('../../dist/main/index.js');
