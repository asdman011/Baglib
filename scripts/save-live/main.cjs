const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_SAVE_LIVE_DIR;
const phase = process.env.BAGLIB_SAVE_LIVE_PHASE;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
const book = path.join(directory, 'book.pdf');
const backups = path.join(directory, 'emergency-copies');
const python = path.resolve(__dirname, '../../.baglib-data/pdf-engine/venv/Scripts/python.exe');
const helper = path.resolve(__dirname, '../../assets/pdf-editor/baglib_marks.py');
const inspect = file => JSON.parse(execFileSync(python, ['-I', helper, 'inspect', file], { encoding: 'utf8' }));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const emergency = () => fs.existsSync(backups) ? fs.readdirSync(backups) : [];
let exported = 0;
dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(directory, `export-${++exported}.pdf`) });
const labels = { ar: { library: 'المكتبة', read: 'قراءة', settings: 'الإعدادات', back: 'العودة إلى المكتبة' }, en: { library: 'Library', read: 'Read', settings: 'Settings', back: 'Back to Library' } };
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  const until = async (code, tries = 200, every = 300) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(every); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(500); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const key = (value, mods = {}) => evaluate(`(document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(value)},ctrlKey:${!!mods.ctrl},shiftKey:${!!mods.shift},bubbles:true}))`);
  const load = async language => { if (owner.isMinimized()) owner.restore(); owner.setContentSize(1280, 900); await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000'); await until('!!window.electronAPI && !!document.querySelector("footer")'); await key('Escape'); await pause(1200); };
  const nav = label => evaluate(`document.querySelector('aside button[aria-label=${JSON.stringify(label)}]').click()`);
  const openBook = async language => {
    await nav(labels[language].library);
    await until(`[...document.querySelectorAll('button')].some(b=>b.title===${JSON.stringify(labels[language].read)}||b.textContent.trim()===${JSON.stringify(labels[language].read)})`);
    await evaluate(`(()=>{const read=${JSON.stringify(labels[language].read)};const isRead=b=>b.title===read||b.textContent.trim()===read;const title=[...document.querySelectorAll('h3,h4')].find(e=>e.textContent.trim()==='علم — Save');if(!title)throw new Error('Fixture book heading missing');let node=title;while(node&&![...node.querySelectorAll('button')].some(isRead))node=node.parentElement;if(!node||node===document.body)throw new Error('Fixture card missing');[...node.querySelectorAll('button')].find(isRead).click();})()`);
    try {
      await until("!!document.querySelector('[data-markup-tool-button]') && document.querySelectorAll('.textLayer span').length > 0 && !!document.querySelector('[data-pdf-save-state]')", 100);
    } catch (error) {
      console.log(JSON.stringify({ reopenDiagnostics: await evaluate("({body:document.body.innerText.slice(-6000),canvases:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height,data:{...c.dataset}}))})") }));
      throw error;
    }
    await pause(1500);
  };
  const selectSpan = async index => { await until(`[...document.querySelectorAll('.textLayer span')].filter(s=>s.textContent.trim().length>3).length>${index}`, 100); return evaluate(`(()=>{const spans=[...document.querySelectorAll('.textLayer span')].filter(s=>s.textContent.trim().length>3);const span=spans[${index}];if(!span)throw new Error('no span');const range=document.createRange();range.selectNodeContents(span);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);span.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return span.textContent;})()`); };
  const pagePoint = (fx, fy) => evaluate(`(()=>{const r=document.querySelector('[data-page-number="1"]').getBoundingClientRect();return {x:Math.round(r.left+r.width*${fx}),y:Math.round(r.top+r.height*${fy})};})()`);
  const mouse = (type, point) => owner.webContents.sendInputEvent({ type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
  const drag = async (from, to) => { mouse('mouseMove', from); await pause(60); mouse('mouseDown', from); await pause(60); for (let step = 1; step <= 6; step++) { mouse('mouseMove', { x: Math.round(from.x + ((to.x - from.x) * step) / 6), y: Math.round(from.y + ((to.y - from.y) * step) / 6) }); await pause(40); } mouse('mouseUp', to); await pause(500); };
  const tool = id => evaluate(`document.querySelector('[data-markup-tool-button="${id}"]').click()`);
  const state = () => evaluate("document.querySelector('[data-pdf-save-state]')?.dataset.pdfSaveState");
  const waitState = (value, tries = 60) => until(`document.querySelector('[data-pdf-save-state]')?.dataset.pdfSaveState === ${JSON.stringify(value)}`, tries, 250);
  const policy = mode => evaluate(`window.electronAPI.materialSave.setPolicy({mode:'${mode}',intervalMinutes:1}).then(r=>{window.dispatchEvent(new CustomEvent('baglib:save-policy',{detail:r.data}));return r.data.mode;})`);
  const owned = () => inspect(book).owned;
  const waitOwned = async (count, tries = 60) => { for (let i = 0; i < tries; i++) { if (owned() === count) return; await pause(300); } throw new Error(`file holds ${owned()} BagLib annotations, not ${count}`); };
  const marks = () => evaluate("window.electronAPI.knowledge.getByWork('save-work').then(items=>items.length)");
  const results = {};
  const record = (name, value) => { results[name] = value; console.log(JSON.stringify({ [name]: value })); };

  const lifecycle = async () => {
    await load('en');
    await evaluate(`window.electronAPI.addBook({id:'save-work',title:'علم — Save',author:'',workType:'book',bookType:'digital',digitalFormat:'PDF',filePath:${JSON.stringify(book)}})`);
    await load('en');
    await policy('manual');
    await openBook('en');
    const originalHash = sha(book);
    const addNote = async id => {
      await evaluate(`window.electronAPI.addNote({id:${JSON.stringify(id)},bookId:'save-work',pageNumber:1,content:${JSON.stringify(id)}})`);
      await load('en');
      await openBook('en');
      await waitState('recorded');
    };
    await addNote('lifecycle-note-1');
    assert.equal(sha(book), originalHash);
    assert.equal(emergency().length, 0);
    await key('s', { ctrl: true });
    await waitState('saved');
    await waitOwned(1);
    assert.equal(inspect(book).outside, 1);
    assert.equal(emergency().length, 1);
    assert.equal(sha(path.join(backups, emergency()[0])), originalHash);
    const savedHash = sha(book);
    await addNote('lifecycle-note-2');
    assert.equal(sha(book), savedHash);
    app.quit();
    await until("!!document.querySelector('[data-save-close]')", 40);
    await evaluate("document.querySelector('[data-save-close-cancel]').click()");
    await pause(300);
    assert.equal(owner.isDestroyed(), false);
    assert.equal(sha(book), savedHash);
    await load('ar');
    await openBook('ar');
    await waitState('recorded');
    fs.writeFileSync(path.join(directory, 'results-lifecycle.json'), JSON.stringify({ quitCancel: true, expectFinalOwned: 2, expectedBackupHash: savedHash }));
    app.quit();
    await until("!!document.querySelector('[data-save-close]')", 40);
    await evaluate("document.querySelector('[data-save-close-save]').click()");
  };

  const first = async () => {
    await load('en');
    await evaluate(`window.electronAPI.addBook({id:'save-work',title:'علم — Save',author:'',workType:'book',bookType:'digital',digitalFormat:'PDF',filePath:${JSON.stringify(book)}})`);
    await load('en');
    // Settings: three modes with information icons (hover, focus, click; Escape closes; inside the window).
    await nav(labels.en.settings);
    await until("!!document.querySelector('[data-save-settings] [data-save-mode]')");
    record('infoIcons', await evaluate("document.querySelectorAll('[data-save-settings] [data-info-tip]').length"));
    record('infoLabels', await evaluate("[...document.querySelectorAll('[data-save-settings] [data-info-tip]')].map(b=>b.getAttribute('aria-label'))"));
    owner.show(); owner.focus(); owner.webContents.focus(); await pause(300);
    await evaluate("document.querySelector('[data-info-tip]').focus()"); await pause(300);
    record('tipOnFocus', await evaluate("(()=>{const t=document.querySelector('[data-info-tip-text]');if(!t)return null;const r=t.getBoundingClientRect();return {text:t.textContent,inside:r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,described:document.querySelector('[data-info-tip]').getAttribute('aria-describedby')===t.id};})()"));
    await evaluate("document.querySelector('[data-info-tip]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await pause(300);
    record('tipClosedByEscape', await evaluate("!document.querySelector('[data-info-tip-text]')"));
    await evaluate("document.querySelector('[data-info-tip]').blur()");
    await evaluate("document.querySelector('[data-save-mode=\"manual\"]').click()"); await pause(600);
    record('policyFromSettings', await evaluate("window.electronAPI.materialSave.policy().then(r=>r.data.policy.mode)"));
    await evaluate("document.querySelectorAll('[data-info-tip]')[2].click()"); await pause(300);
    await shot('settings-en');
    await evaluate("document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); await pause(200);

    // Manual: marks are recorded in BagLib; the file and the backup folder are untouched until Ctrl+S.
    const H0 = sha(book);
    await openBook('en');
    record('openState', await state());
    record('noBackupOnOpen', emergency().length === 0);
    await tool('highlight'); await selectSpan(0); await pause(1500);
    await waitState('recorded');
    record('manualRecorded', { state: await state(), fileUnchanged: sha(book) === H0, backups: emergency() });
    await shot('recorded-en');
    await key('s', { ctrl: true });
    await waitState('saved');
    const H1 = sha(book);
    record('ctrlS', { owned: owned(), outside: inspect(book).outside, copies: emergency(), copyHoldsBefore: sha(path.join(backups, emergency()[0])) === H0 });
    await shot('saved-en');

    // After every change: two quick actions are grouped into one write (the copy then holds H1, not an in-between file).
    await policy('after-change');
    await evaluate("document.querySelector('[data-markup-more]').click()"); await pause(200);
    await tool('rect'); await until("!!document.querySelector('[data-pdf-draw-surface=\"rect\"]')", 30);
    await drag(await pagePoint(0.1, 0.55), await pagePoint(0.5, 0.75));
    await tool('underline'); await selectSpan(1);
    await waitOwned(3);
    await waitState('saved');
    record('afterChange', { owned: owned(), copyHoldsPrevious: sha(path.join(backups, emergency()[0])) === H1, copies: emergency() });

    // Ctrl+Z twice: the underline, then the rectangle; each undo is a pending change, written in this mode.
    await key('z', { ctrl: true }); await waitOwned(2);
    await key('z', { ctrl: true }); await waitOwned(1);
    record('undoTwice', { owned: owned(), marks: await marks() });
    await waitState('saved');
    // Closing with nothing pending: the window closes without asking.
    fs.writeFileSync(path.join(directory, 'results-first.json'), JSON.stringify(results, null, 2));
    owner.close();
  };

  const restart = async () => {
    await load('en');
    await openBook('en');
    // Redo after a restart, from database history.
    await key('z', { ctrl: true, shift: true }); await waitOwned(2);
    await key('z', { ctrl: true, shift: true }); await waitOwned(3);
    record('redoAfterRestart', { owned: owned(), marks: await marks() });
    await waitState('saved');

    // At an interval: nothing is written until the interval passes (1 minute).
    await policy('interval');
    const before = sha(book);
    await tool('highlight');
    await until("[...document.querySelectorAll('.textLayer span')].filter(span=>span.textContent.trim().length>3).length > 2");
    await selectSpan(2); await pause(1500);
    await waitState('recorded');
    await pause(5000);
    record('intervalWaits', { unchangedAfter5s: sha(book) === before });
    await waitOwned(4, 300);
    record('intervalWrote', owned());

    // Manual and closing the book: Cancel stays; Close without writing keeps the mark in BagLib only.
    await policy('manual');
    await waitState('saved');
    await tool('highlight'); await selectSpan(0); await pause(1500);
    await waitState('recorded');
    const marksBefore = await marks();
    await evaluate(`document.querySelector('button[aria-label=${JSON.stringify(labels.en.back)}]').click()`);
    await until("!!document.querySelector('[data-save-close]')");
    await shot('close-book-en');
    await evaluate("document.querySelector('[data-save-close-cancel]').click()"); await pause(500);
    record('cancelStays', await evaluate("!!document.querySelector('[data-pdf-save-state]') && !document.querySelector('[data-save-close]')"));
    await evaluate(`document.querySelector('button[aria-label=${JSON.stringify(labels.en.back)}]').click()`);
    await until("!!document.querySelector('[data-save-close]')");
    await evaluate("document.querySelector('[data-save-close-discard]').click()");
    await until("!document.querySelector('[data-pdf-save-state]')");
    record('discard', { owned: owned(), marksKept: await marks() === marksBefore });

    // Selective export: clear all → no BagLib additions, outside annotation kept; text marks only.
    await openBook('en');
    const working = sha(book);
    await evaluate("document.querySelector('[data-export-open]').click()");
    await until("!!document.querySelector('[data-export-pdf]')");
    const beforeExportUndo = await marks();
    await key('z', { ctrl: true }); await pause(400);
    assert.equal(await marks(), beforeExportUndo, 'export dialog must not undo underlying marks');
    await evaluate("document.querySelector('[data-export-clear-all]').click()");
    await evaluate("document.querySelector('[data-export-go]').click()");
    await until("!!document.querySelector('[data-export-message]')", 120);
    const clean = inspect(path.join(directory, 'export-1.pdf'));
    await evaluate("document.querySelector('[data-export-category=\"textMarks\"]').click()");
    await evaluate("document.querySelector('[data-export-go]').click()"); await pause(500);
    await until("document.querySelector('[data-export-message]')?.textContent.includes('export-2')", 120);
    const textOnly = inspect(path.join(directory, 'export-2.pdf'));
    await shot('export-en');
    await evaluate("document.querySelector('[data-export-pdf] header button').click()"); await pause(300);
    record('export', { clean: [clean.owned, clean.outside], textOnly: [textOnly.owned, textOnly.outside, textOnly.names], workingUnchanged: sha(book) === working, ownedInWorking: owned() });

    // Arabic: settings, export dialog, close dialog.
    await load('ar');
    await nav(labels.ar.settings);
    await until("!!document.querySelector('[data-save-settings]')");
    await evaluate("document.querySelectorAll('[data-info-tip]')[0].click()"); await pause(300);
    record('arTip', await evaluate("(()=>{const t=document.querySelector('[data-info-tip-text]');const r=t.getBoundingClientRect();return {text:t.textContent,inside:r.left>=0&&r.right<=innerWidth,dir:getComputedStyle(t).direction};})()"));
    await shot('settings-ar');
    await openBook('ar');
    await evaluate("document.querySelector('[data-export-open]').click()");
    await until("!!document.querySelector('[data-export-pdf]')");
    await shot('export-ar');
    const beforeArabicUndo = await marks();
    await key('z', { ctrl: true }); await pause(400);
    assert.equal(await marks(), beforeArabicUndo, 'Arabic export dialog must not undo underlying marks');
    await evaluate("document.querySelector('[data-export-pdf] header button').click()"); await pause(300);

    // Closing the window with a pending change (manual): the dialog asks; Cancel keeps the window; Save writes and closes.
    await waitState('recorded');
    const ownedBefore = owned();
    if (process.env.BAGLIB_SAVE_LIFECYCLE_CHECK) app.quit(); else owner.close();
    await until("!!document.querySelector('[data-save-close]')", 40);
    await shot('close-window-ar');
    await evaluate("document.querySelector('[data-save-close-cancel]').click()"); await pause(1500);
    record('windowCancel', !owner.isDestroyed());
    fs.writeFileSync(path.join(directory, 'results-restart.json'), JSON.stringify({ ...results, expectFinalOwned: ownedBefore + 1 }, null, 2));
    assertAll();
    if (process.env.BAGLIB_SAVE_LIFECYCLE_CHECK) app.quit(); else owner.close();
    await until("!!document.querySelector('[data-save-close]')", 40);
    await evaluate("document.querySelector('[data-save-close-save]').click()");
  };

  const assertAll = () => {
    const errors = consoleLines.filter(line => /uncaught|error/iu.test(line) && !/Electron Security Warning/u.test(line));
    assert.deepEqual(errors, []);
    if (phase === 'restart') {
      assert.deepEqual(results.redoAfterRestart.owned, 3);
      assert.equal(results.intervalWaits.unchangedAfter5s, true);
      assert.equal(results.intervalWrote, 4);
      assert.equal(results.cancelStays, true);
      assert.deepEqual(results.discard, { owned: 4, marksKept: true });
      assert.deepEqual(results.export.clean, [0, 1]);
      assert.equal(results.export.textOnly[1], 1);
      assert.ok(results.export.textOnly[0] >= 3);
      assert.equal(results.export.workingUnchanged, true);
      assert.equal(results.arTip.inside, true); assert.equal(results.arTip.dir, 'rtl');
      assert.equal(results.windowCancel, true);
    }
  };

  (async () => {
    if (process.env.BAGLIB_SAVE_QUIT_ONLY) { await lifecycle(); return; }
    if (phase === 'first') {
      await first();
      const r = results;
      assert.ok(r.infoIcons >= 5); assert.equal(r.tipOnFocus.inside, true); assert.equal(r.tipOnFocus.described, true); assert.equal(r.tipClosedByEscape, true);
      assert.equal(r.policyFromSettings, 'manual');
      assert.equal(r.openState, 'saved'); assert.equal(r.noBackupOnOpen, true);
      assert.deepEqual(r.manualRecorded, { state: 'recorded', fileUnchanged: true, backups: [] });
      assert.deepEqual(r.ctrlS, { owned: 1, outside: 1, copies: ['s'.repeat(0) + r.ctrlS.copies[0]], copyHoldsBefore: true });
      assert.equal(r.ctrlS.copies.length, 1);
      assert.equal(r.afterChange.copyHoldsPrevious, true, 'two quick actions were one write');
      assert.equal(r.afterChange.copies.length, 1);
      assert.equal(r.undoTwice.owned, 1);
      assertAll();
    } else await restart();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, `failure-${phase}.txt`), String(error.stack || error) + '\n' + JSON.stringify(results) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, `failure-${phase}.png`), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
