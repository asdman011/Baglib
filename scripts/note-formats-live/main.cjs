require('tsx/cjs');
const { translations } = require('../../src/renderer/translations.ts');
const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = process.env.BAGLIB_FORMATS_PROFILE;
const evidence = process.env.BAGLIB_FORMATS_EVIDENCE;
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const picked = path.join(profile, 'picked');
fs.mkdirSync(picked);
let importPaths = [];
dialog.showOpenDialog = async (...args) => ({ canceled: false, filePaths: args.at(-1).properties.includes('openFile') ? importPaths : [picked] });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let i = 0; i < 200; i++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(150);
    }
    throw new Error('Timed out ' + code);
  };
  const click = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
  const input = (selector, value, type = 'HTMLInputElement') => evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(${type}.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const shot = async name => { await pause(350); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  (async () => {
    win.setMinimumSize(320, 400);
    win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
    const realFiles = ['ar', 'en'].map(lang => manifest.files.find(file => file.kind === 'pdf' && file.lang === lang && file.path.includes('/text-layer/')));
    assert.ok(realFiles.every(Boolean));
    const imported = await evaluate('window.electronAPI.importDigitalFiles(' + JSON.stringify(realFiles.map(file => ({ filePath: path.resolve('tests/real-files', file.path), duplicateAction: 'import_anyway' }))) + ',"formats-live")');
    assert.equal(imported.successfulImports, 2);
    const books = await evaluate('window.electronAPI.getAllBooks()');
    const notes = [
      { id: 'format-ar', title: 'بَغْلِب — Arabic', content: '## عِلْمٌ\n[[supports::note:format-en|English]]\n[[quran:hafs:2:255|آية الكرسي]]\n  \n', tags: ['أخلاق حسنة'], aliases: ['علم'], workId: books.find(book => book.filePath === path.resolve('tests/real-files', realFiles[0].path))?.id },
      { id: 'format-en', title: 'English "Notes"', content: 'English, "quoted"\n[[note:format-ar|عِلْمٌ]]\nSecond line ^p1', tags: ['English'], aliases: ['Notes'] },
    ];
    assert.ok(notes[0].workId, 'Arabic note linked to real imported PDF');
    for (const note of notes) await evaluate('window.electronAPI.studyNotes.save(' + JSON.stringify(note) + ')');
    const results = [];
    for (const lang of ['ar', 'en']) {
      await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(lang) + ')');
      await win.loadURL('http://localhost:3000');
      await until('!!document.querySelector("[data-nav-item=notes]")');
      await click('[data-nav-item=notes]');
      await until('document.querySelectorAll("[data-study-note]").length===2');
      assert.equal(await evaluate('document.documentElement.dir'), lang === 'ar' ? 'rtl' : 'ltr');
      for (const width of [1280, 480]) {
        win.setContentSize(width, 900);
        await pause(300);
        for (const format of ['markdown', 'csv', 'latex']) {
          const before = fs.readdirSync(picked);
          await click('[data-notes-export-markdown]');
          await until('!!document.querySelector("[data-notes-format-options]")');
          await input('[data-notes-format]', format, 'HTMLSelectElement');
          const key = format === 'markdown' ? 'notesMarkdownLoss' : format === 'csv' ? 'notesCsvLoss' : 'notesLatexLoss';
          await until('document.querySelector("[data-notes-format-loss]")?.textContent===' + JSON.stringify(translations[lang][key]));
          await shot(`${lang}-${width}-${format}`);
          assert.equal(await evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'), false);
          await click('[data-notes-format-go]');
          await until('!document.querySelector("[data-notes-format-options]")');
          const folder = path.join(picked, fs.readdirSync(picked).find(name => !before.includes(name)));
          const filenames = fs.readdirSync(folder);
          if (format === 'markdown') {
            assert.equal(filenames.length, 2);
            importPaths = filenames.map(name => path.join(folder, name));
            const beforeNotes = await evaluate('window.electronAPI.studyNotes.list()');
            await click('[data-notes-import-markdown]');
            await until('!!document.querySelector("[data-notes-imported]")');
            const afterNotes = await evaluate('window.electronAPI.studyNotes.list()');
            assert.deepEqual(afterNotes, beforeNotes, 'unchanged re-import keeps revisions and dates');
            const file = importPaths.find(file => fs.readFileSync(file, 'utf8').includes('baglib_id: "format-en"'));
            // Change only the readable body, leaving JSON metadata intact.
            const text = fs.readFileSync(file, 'utf8');
            const end = text.indexOf('\n---\n') + 5;
            fs.writeFileSync(file, text.slice(0, end) + text.slice(end).replace('Second line ^p1', 'Edited second line ^p1'));
            const updated = await evaluate('window.electronAPI.studyNotes.importMarkdown()');
            assert.equal(updated.count, 2);
            const saved = await evaluate('window.electronAPI.studyNotes.list()');
            assert.equal(saved.length, 2);
            assert.ok(saved.find(note => note.id === 'format-en').content.includes('Edited second line'));
          } else {
            const content = fs.readFileSync(path.join(folder, filenames[0]), 'utf8');
            assert.ok(content.includes('عِلْمٌ'));
            if (format === 'latex') assert.ok(content.includes('\\textarabic{عِلْمٌ}'));
          }
          results.push({ lang, width, format, files: filenames.length });
        }
      }
      // Filtered and single-note context exports use the same dialog.
      await input('[data-notes-overview] input[type=search]', 'Arabic');
      await until('document.querySelectorAll("[data-study-note]").length===1');
      const before = fs.readdirSync(picked);
      await click('[data-notes-export-markdown]');
      await until('!!document.querySelector("[data-notes-format-go]")');
      await click('[data-notes-format-go]');
      await until('!document.querySelector("[data-notes-format-go]")');
      const folder = path.join(picked, fs.readdirSync(picked).find(name => !before.includes(name)));
      assert.equal(fs.readdirSync(folder).length, 1);
    }
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(results, null, 2));
    console.log('PASS note formats', results.length);
    app.quit();
  })().catch(async error => {
    console.error(error);
    fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error.stack || error));
    try { await shot('failure'); } finally { app.exit(1); }
  });
});
require('../../dist/main/index.js');
