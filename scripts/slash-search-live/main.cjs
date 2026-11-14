const { app } = require('electron');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = path.resolve(process.env.BAGLIB_KEY350_PROFILE);
const evidence = process.env.BAGLIB_KEY350_EVIDENCE;
assert.equal(path.dirname(profile), path.resolve('.baglib-data'));
assert.ok(path.basename(profile).startsWith('KEY-350-live-'));
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
    for (let attempt = 0; attempt < 500; attempt++) {
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
      const result = await evaluate(`window.electronAPI.importDigitalFile({filePath:${JSON.stringify(input.copy)},customTitle:${JSON.stringify(input.textLayer === 'no' ? 'Scanned Arabic' : '\u0627\u0644\u0644\u0647 ' + input.kind + ' ' + input.lang)}})`);
      assert.equal(result.success, true, 'real copy imported: ' + input.path);
    }
    await evaluate(`window.electronAPI.studyNotes.save({title:'\u0627\u0644\u0644\u0647 Mixed \u0639\u0650\u0644\u0652\u0645',content:'Learning body',aliases:['Learning'],tags:[]})`);
    await until("window.electronAPI.quran.readerCatalog().then(r=>r.ok&&r.data.sources.some(s=>s.kind==='script'&&s.profile==='hafs'))");
    const books = await evaluate('window.electronAPI.getAllBooks()');
    const docs = [];
    for (const lang of ['ar', 'en']) {
      const book = books.find(book => book.title === '\u0627\u0644\u0644\u0647 pdf ' + lang && !/scan-ar/.test(book.filePath || ''));
      assert.ok(book, 'real text PDF imported');
      const extracted = await evaluate(`window.electronAPI.extractPdfText(${JSON.stringify(book.filePath)})`);
      assert.ok(extracted?.text && !extracted.isScannedImagePdf, 'real text layer extracted');
      const parts = extracted.text.split(/\r?\n---PAGE_SPLIT_MARKER---\r?\n|\f/u); if (!parts[0].trim()) parts.shift();
      const pages = parts.map((content, index) => ({ pageNumber: index + 1, content }));
      await evaluate(`window.electronAPI.indexBookContent(${JSON.stringify(book.id)},${JSON.stringify(pages)})`);
      const page = pages.find(p => /[a-zA-Z\u0620-\u064a]{4,}/u.test(p.content));
      const word = page.content.match(lang === 'ar' ? /[\u0620-\u064a]{4,}/u : /[a-zA-Z]{5,}/u)?.[0];
      assert.ok(word, 'real search word'); docs.push({ book, word, pages: pages.length, indexPages: pages });
    }
    for (let i = 0; i < 45; i++) await evaluate(`window.electronAPI.studyNotes.save({title:'Learning ${i}',content:'Learning body ${i}',aliases:[],tags:[]})`);
    // Main-loop gaps measure synchronous stalls on the actual production IPC paths.
    const timings = [];
    async function measure(name, call) {
      await pause(30); let last = performance.now(), maxGap = 0;
      const timer = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 1);
      const begin = performance.now(); const response = await evaluate(call); const elapsed = performance.now() - begin;
      await pause(20); clearInterval(timer); assert.ok(response.ok, name + ' succeeded');
      const row = { name, elapsedMs: elapsed, maxMainGapMs: maxGap, count: Array.isArray(response.data) ? response.data.length : response.data.items.length }; timings.push(row); console.log(JSON.stringify(row));
    }
    const catalog = await evaluate('window.electronAPI.quran.readerCatalog()');
    const script = catalog.data.sources.find(s => s.kind === 'script' && s.profile === 'hafs').id;
    for (const phase of ['before', 'after']) {
      const options = phase === 'after' ? { limit: 20, requestId: 'measure-' + phase } : {};
      await measure('quran-' + phase, `window.electronAPI.quran.searchAyahs(${JSON.stringify({ script, text: '\u0627\u0644\u0644\u0647', ...options })})`);
      await measure('sunnah-' + phase, `window.electronAPI.sunnah.search(${JSON.stringify({ text: '\u0627\u0644\u0644\u0647', ...options })})`);
      await measure('poetry-' + phase, `window.electronAPI.poetry.search(${JSON.stringify({ query: '\u0627\u0644\u0644\u0647', limit: phase === 'after' ? 20 : 30, ...options })})`);
    }
    fs.writeFileSync(path.join(evidence, 'ipc-timings.json'), JSON.stringify({ timings, quranSources: catalog.data.sources.length, poetryBytes: fs.statSync(path.join(profile, 'partitions/bayan_poetry.sqlite')).size, sunnahBytes: fs.statSync('release/win-unpacked/resources/sunnah/sunnah_merged_quranlab_v1.sqlite').size }, null, 2));
    await evaluate("window.electronAPI.settings.set('dashboard.layout.v1',{version:1,modules:[{id:'scratchpad',visible:true}]})");
    const matrix = [];
    const action = async name => { await until(`!!document.querySelector('[data-slash-action="${name}"]')`); await evaluate(`document.querySelector('[data-slash-action="${name}"]').click()`); };
    const chooseTitle = async (scope, title) => {
      await setText('/' + scope + ' ' + title); await ready(scope);
      await evaluate(`(()=>{const row=[...document.querySelectorAll('[data-slash-scope="${scope}"]:not([data-slash-action])')].find(row=>row.querySelector('bdi').textContent===${JSON.stringify(title)});if(!row)throw Error('missing title');row.click()})()`);
      await until("!!document.querySelector('[data-slash-action=inside]')");
    };
    for (const lang of ['ar', 'en']) {
      console.log('checking language ' + lang);
      await evaluate(`localStorage.setItem('baglib-lang','${lang}')`); await win.loadURL('http://localhost:3000');
      await until(`document.documentElement.lang==='${lang}'&&!!document.querySelector('[data-nav-item=notes]')`);
      await evaluate("document.querySelector('[data-nav-item=notes]').click()"); await until("!!document.querySelector('[data-notes-overview]')");
      await evaluate("window.dispatchEvent(new CustomEvent('baglib:new-note'))"); await until(`!!document.querySelector('${content}')`);
      await setText('/'); await until("document.querySelectorAll('[data-slash-scope]').length===6"); await shot('scopes-' + lang);
      assert.equal(await evaluate("document.querySelector('[data-slash-search]').dir"), lang === 'ar' ? 'rtl' : 'ltr');
      await key('Up'); await key('Down'); await key('Enter'); assert.equal(await text(), '/quran ');
      for (const [scope, query, target] of [['quran', '2:255', 'quran:hafs:2:255'], ['sunnah', '\u0627\u0644\u0644\u0647', 'sunnah:'], ['albayan', '\u0627\u0644\u0644\u0647', 'poetry:ashaar:']]) {
        await setText('/' + scope + ' ' + query); await ready(scope); await shot(scope + '-' + lang); await key('Enter');
        const inserted = await text(); assert.ok(inserted.includes('[[' + target)); assert.match(inserted, /^> .+\n> \[\[/u); assert.equal(await evaluate("!!document.querySelector('[data-relation-menu]')"), false);
      }
      await setText('/\u0627\u0644\u0644\u0647'); await ready('quran');
      for (const scope of SLASH_SCOPES) assert.ok(await evaluate(optionCount(scope)) <= 9, 'eight hits plus an optional lazy row per free source');
      await shot('free-' + lang);
      await setText('/quran \u0627\u0644\u0644\u0647'); await ready('quran');
      assert.equal(await evaluate(optionCount('quran')), 21); await action('more');
      await until(`${optionCount('quran')}===41`); await shot('quran-more-' + lang);
      await setText('/notes Learning'); await ready('notes'); assert.equal(await evaluate(optionCount('notes')), 21);
      await key('Up'); await key('Enter'); await until(`${optionCount('notes')}===41`); await shot('show-more-' + lang);
      await action('more'); await until(`${optionCount('notes')}===46`);
      await chooseTitle('books', docs[0].book.title); await key('Enter'); assert.equal(await text(), studyLinkText(bookStudyTarget(docs[0].book), docs[0].book.title));
      assert.equal(await evaluate("!!document.querySelector('[data-relation-menu]')"), false);
      for (const { book, word } of docs) {
        await chooseTitle('books', book.title); await action('inside');
        await win.webContents.insertText(word); await ready('books'); await shot('inside-' + book.id.slice(0, 8) + '-' + lang); await key('Enter');
        assert.ok((await text()).includes('[[book:' + book.id)); assert.ok((await text()).includes('#p=')); assert.ok((await text()).startsWith('> '));
      }
      const fallback = docs.find(doc => doc.book.filePath.endsWith('input-pdf-en.pdf'));
      await evaluate(`window.electronAPI.deleteBookContentIndex(${JSON.stringify(fallback.book.id)})`);
      await chooseTitle('books', fallback.book.title); await action('inside'); await win.webContents.insertText(fallback.word); await ready('books'); await shot('text-layer-fallback-' + lang); await key('Enter');
      assert.ok((await text()).includes('[[book:' + fallback.book.id));
      await evaluate(`window.electronAPI.indexBookContent(${JSON.stringify(fallback.book.id)},${JSON.stringify(fallback.indexPages)})`);
      const lectures = books.filter(book => ['lecture', 'video', 'podcast'].includes(book.workType)); assert.equal(lectures.length, 2);
      const withTranscript = lectures.find(book => /input-video-ar/.test(book.filePath || ''));
      const withoutTranscript = lectures.find(book => /input-video-en/.test(book.filePath || ''));
      await chooseTitle('lectures', withTranscript.title); await action('inside'); await win.webContents.insertText('Learning'); await ready('lectures'); await shot('transcript-' + lang); await key('Enter');
      assert.ok((await text()).includes('Learning a whole sentence together.')); assert.ok((await text()).includes('[[media:' + withTranscript.id + ':12|'));
      for (const book of [withoutTranscript, books.find(book => /scan-ar/.test(book.filePath || ''))]) {
        await chooseTitle(book === withoutTranscript ? 'lectures' : 'books', book.title);
        // Duplicate PDF titles are disambiguated by selecting the scanned title below in setup.
        await action('inside'); await until("document.querySelector('[data-slash-search]')?.getAttribute('aria-busy')==='false'");
        await until(`document.querySelector('[data-slash-search]')?.textContent.includes(${JSON.stringify(lang === 'ar' ? '\u0644\u0627 \u064a\u0648\u062c\u062f \u0646\u0635' : 'no searchable text')})`); await shot('no-text-' + (book === withoutTranscript ? 'lecture' : 'scan') + '-' + lang); await key('Escape');
      }
      await evaluate('window.__key350Ticks=[];window.__key350Last=performance.now();window.__key350Timer=setInterval(()=>{const now=performance.now();window.__key350Ticks.push(now-window.__key350Last);window.__key350Last=now},10)');
      let mainLast = performance.now(), maxMainGap = 0; const monitor = setInterval(() => { const now = performance.now(); maxMainGap = Math.max(maxMainGap, now-mainLast); mainLast = now; }, 5);
      await setText('/sunnah \u0627\u0644\u0644\u0647'); await pause(310);
      for (let i = 0; i < 15; i++) { await win.webContents.insertText(i % 2 ? 'x' : '\u0639'); await pause(15); }
      for (let i = 0; i < 15; i++) await key('Backspace');
      await setText('/notes Learning'); await ready('notes'); await pause(400); assert.equal(await evaluate(optionCount('sunnah')), 0);
      clearInterval(monitor); const maxRendererGap = await evaluate('clearInterval(window.__key350Timer);Math.max(...window.__key350Ticks)');
      assert.ok(maxMainGap < 250, 'rapid typing main loop <250ms: ' + maxMainGap); assert.ok(maxRendererGap < 1000, 'rapid typing renderer responds: ' + maxRendererGap);
      await shot('fast-typing-' + lang);
      // Time to results after fast typing: each keystroke cancels the previous request, so a stopped engine would
      // have to reopen its corpus (Sunnah about 7 s) before the newest query could run.
      await setText('/sunnah ');
      const typedAt = Date.now();
      for (const letter of 'الصبر') { await win.webContents.insertText(letter); await pause(60); }
      await ready('sunnah');
      const sunnahAfterTyping = Date.now() - typedAt;
      console.log('KEY-350 sunnah results after fast typing (ms):', sunnahAfterTyping);
      (globalThis.__key350Latency ||= {})[lang] = sunnahAfterTyping;
      assert.ok(sunnahAfterTyping < 4000, 'Sunnah results arrive soon after fast typing: ' + sunnahAfterTyping + 'ms');
      win.setContentSize(480, 760); await setText('/'); await until("!!document.querySelector('[data-slash-search]')"); await shot('narrow-' + lang);
      const bounds = await evaluate("(()=>{const r=document.querySelector('[data-slash-search]').getBoundingClientRect();return {x:r.x,right:r.right,bottom:r.bottom}})()"); assert.ok(bounds.x>=0&&bounds.right<=480&&bounds.bottom<=760); win.setContentSize(1280,1000);
      await key('Escape');
      await evaluate("document.querySelector('[data-nav-item=dashboard]').click()");
      await until("!!document.querySelector('[data-dashboard-module=quick-note-scratchpad] .cm-content')");
      await setText('/quran 2:255'); await ready('quran'); await key('Enter');
      assert.ok((await text()).includes('[[quran:hafs:2:255|')); assert.ok((await text()).startsWith('> '));
      assert.equal(await evaluate("!!document.querySelector('[data-relation-menu]')"), false); await shot('scratchpad-' + lang);
      matrix.push({ lang, scratchpad: true, mainMaxGapMs: maxMainGap, rendererMaxGapMs: maxRendererGap, corpusQuotes:3, documents:2, lectureTranscript:true, noText:2, paginationKeyboard:true, paginationMouse:true });
    }
    assert.deepEqual(errors, []);
    const result = { passed: matrix.length, matrix, rendererErrors: errors.length, realCopiesImported: inputs.length };
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result)); app.quit();
  })().catch(async error => { console.error(error); console.error(JSON.stringify({ errors })); try { await shot('failure'); } finally { app.exit(1); } });
});
require('../../dist/main/index.js');
