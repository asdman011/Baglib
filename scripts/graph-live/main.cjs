const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_GRAPH_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
const NOTES = [
  { id: 'graph-a', title: 'الصبر — Patience', content: 'الصبر ضياء [[quran:hafs:2:153|البقرة 2:153]] [[book:graph-book#p=4|رياض الصالحين (4)]] [[note:graph-b|Gratitude]]', tags: ['أخلاق'] },
  { id: 'graph-b', title: 'Gratitude — الشكر', content: 'Linked from patience. [[book:graph-book#p=9|رياض الصالحين (9)]]', tags: ['أخلاق'] },
  { id: 'graph-c', title: 'وحيدة — Alone', content: 'No links here.', tags: [] },
  { id: 'graph-d', title: 'Far away', content: 'Only linked to C? No: [[book:other-book|Other]]', tags: [] },
];
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(500); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")'); await pause(800);
    await evaluate(`[...document.querySelectorAll('aside button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(language === 'ar' ? 'سجل الملاحظات' : 'Notes Log')}).click()`);
    await until("document.querySelectorAll('[data-study-note]').length>=4");
  };
  const nodeIds = () => evaluate("[...document.querySelectorAll('[data-knowledge-graph] [data-graph-node]')].map(n=>n.getAttribute('data-graph-node')).sort()");
  (async () => {
    const results = {};
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await until('!!window.electronAPI?.studyNotes');
    await evaluate("window.electronAPI.addBook({id:'graph-book',title:'رياض الصالحين',author:'',workType:'book',bookType:'physical'})");
    for (const note of NOTES) await evaluate(`window.electronAPI.studyNotes.save(${JSON.stringify({ ...note, aliases: [], expectedRevision: 0 })})`);
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      result.aloneDisabled = await evaluate("document.querySelector('[data-study-note=\"graph-c\"] [data-graph-button]').disabled");
      result.linkedEnabled = await evaluate("!document.querySelector('[data-study-note=\"graph-a\"] [data-graph-button]').disabled");
      const started = Date.now();
      await evaluate("document.querySelector('[data-study-note=\"graph-a\"] [data-graph-button]').click()");
      await until("!!document.querySelector('[data-knowledge-graph] [data-graph-node]')");
      result.openMs = Date.now() - started;
      result.localNodes = await nodeIds();
      result.listCount = await evaluate("document.querySelectorAll('[data-graph-list] li').length");
      await shot(`local-${language}-1280`);
      await evaluate("document.querySelector('[data-graph-whole]').click()");
      await until("document.querySelectorAll('[data-knowledge-graph] [data-graph-node]').length>5");
      result.wholeNodes = await nodeIds();
      await shot(`whole-${language}-1280`);
      // Clicking the Gratitude dot opens that note.
      await evaluate("document.querySelector('[data-graph-node=\"note:graph-b\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
      await until("!document.querySelector('[data-knowledge-graph]') && document.querySelectorAll('[data-study-note]').length===1 && !!document.querySelector('[data-study-note=\"graph-b\"]')");
      result.openedNote = true;
      // Editing a note shows the button in the editor toolbar too.
      await load(language);
      await evaluate(`document.querySelector('[data-study-note="graph-a"] button[aria-label=${JSON.stringify(language === 'ar' ? 'تحرير الملاحظة' : 'Edit note')}]')?.click()`);
      await until("!!document.querySelector('[data-notes-overview] [data-study-note-editor]')", 50).catch(() => {});
      // The editor's own notes list loads after it opens; the button turns on once the links are known.
      await until("!!document.querySelector('[data-scratchpad-dir-toggle]')?.parentElement?.querySelector('[data-graph-button]:not([disabled])')", 50).catch(() => {});
      result.editorButton = await evaluate("!!document.querySelector('[data-scratchpad-dir-toggle]')?.parentElement?.querySelector('[data-graph-button]:not([disabled])')");
      owner.setContentSize(800, 900);
      await evaluate("document.querySelector('[data-study-note=\"graph-a\"] [data-graph-button]')?.click()");
      await until("!!document.querySelector('[data-knowledge-graph] [data-graph-node]')").catch(() => {});
      await shot(`local-${language}-800`);
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.equal(result.aloneDisabled, true); assert.equal(result.linkedEnabled, true);
      assert.deepEqual(result.localNodes, ['book:graph-book', 'note:graph-a', 'note:graph-b', 'quran:2:153', 'tag:أخلاق'].sort());
      assert.equal(result.listCount, 4);
      for (const id of ['note:graph-c', 'note:graph-d', 'book:other-book']) assert.ok(result.wholeNodes.includes(id), id);
      assert.ok(result.openMs < 3000, `opened in ${result.openMs} ms`);
      assert.equal(result.editorButton, true);
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught|error/iu.test(line) && !/Electron Security Warning/u.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
