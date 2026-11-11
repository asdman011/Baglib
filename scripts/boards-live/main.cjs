const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_BOARDS_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const boardsFolder = path.join(directory, 'boards');
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  // KEY-317: throwaway profiles would show the KEY-307 first-run guide, which takes focus.
  owner.webContents.on('did-finish-load', () => { owner.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(500); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const boardFiles = () => (fs.existsSync(boardsFolder) ? fs.readdirSync(boardsFolder).filter(name => name.endsWith('.json')) : []);
  const readBoard = id => JSON.parse(fs.readFileSync(path.join(boardsFolder, `${id}.json`), 'utf8'));
  const rect = selector => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const mouse = (type, x, y) => owner.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
  const dragBy = async (selector, dx, dy) => {
    const start = await rect(selector);
    mouse('mouseMove', start.x, start.y); await pause(50);
    mouse('mouseDown', start.x, start.y); await pause(50);
    for (let step = 1; step <= 5; step++) { mouse('mouseMove', start.x + (dx * step) / 5, start.y + (dy * step) / 5); await pause(40); }
    mouse('mouseUp', start.x + dx, start.y + dy); await pause(100);
  };
  // A point inside the element that is not covered by another box.
  const visiblePoint = selector => evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); const r = element.getBoundingClientRect(); for (let fy = 0.2; fy < 1; fy += 0.2) for (let fx = 0.1; fx < 1; fx += 0.2) { const x = r.x + r.width * fx, y = r.y + r.height * fy; if (element.contains(document.elementFromPoint(x, y))) return { x, y }; } return null; })()`);
  const click = async selector => { const point = await visiblePoint(selector); if (!point) throw new Error(`covered: ${selector}`); mouse('mouseMove', point.x, point.y); await pause(30); mouse('mouseDown', point.x, point.y); await pause(30); mouse('mouseUp', point.x, point.y); await pause(150); };
  const typeInto = async (selector, text) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`); await pause(150); await owner.webContents.insertText(text); await pause(150); };
  const savedRevision = () => evaluate("document.querySelector('[data-board-save]')?.getAttribute('data-board-save')");
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")'); await pause(800);
    await evaluate("document.querySelector('[data-nav-item=\"notes\"]').click()");
    await until("document.querySelectorAll('[data-study-note]').length>=1");
  };
  (async () => {
    const results = {};
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await until('!!window.electronAPI?.studyNotes');
    await evaluate(`window.electronAPI.studyNotes.save(${JSON.stringify({ id: 'board-note', title: 'الصبر — Patience', content: 'الصبر ضياء', aliases: [], tags: [], expectedRevision: 0 })})`);
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      await evaluate("document.querySelector('[data-notes-boards]').click()");
      await until("!!document.querySelector('[data-boards]')");
      result.dir = await evaluate("document.querySelector('[data-boards]').closest('[dir]').getAttribute('dir')");
      result.surfaceDir = null;
      // Mind map preset: a centre with four branches, saved to its own JSON file.
      const before = boardFiles();
      await evaluate("document.querySelector('[data-boards-new=\"mind\"]').click()");
      await until("document.querySelectorAll('[data-board-item]').length===5");
      await until(`window.electronAPI.boards.list().then(list => list.length > ${before.length})`);
      const mindFile = boardFiles().find(name => !before.includes(name));
      const mindId = mindFile.slice(0, -5);
      result.mindOnDisk = readBoard(mindId);
      result.surfaceDir = await evaluate("document.querySelector('[data-board-surface]').getAttribute('dir')");
      result.arrowsDrawn = await evaluate("document.querySelectorAll('[data-board-edge]').length");
      await shot(`mind-${language}-1280`);
      // Rename, add a sticky note with text, drag it, and draw a labelled arrow to it from the centre.
      await evaluate("document.querySelector('[data-board-title]').select()");
      await typeInto('[data-board-title]', language === 'ar' ? 'خريطة الصبر' : 'Patience map');
      await evaluate("document.querySelector('[data-board-add=\"sticky\"]').click()");
      await until("document.querySelectorAll('[data-board-item]').length===6");
      const stickyId = await evaluate("[...document.querySelectorAll('[data-board-item][data-board-kind=\"sticky\"]')].pop().getAttribute('data-board-item')");
      await typeInto(`[data-board-item="${stickyId}"] textarea`, language === 'ar' ? 'الصبر عند الصدمة الأولى' : 'Patience at the first blow');
      const startPosition = await rect(`[data-board-item="${stickyId}"] [data-board-handle]`);
      await dragBy(`[data-board-item="${stickyId}"] [data-board-handle]`, 120, -140);
      const endPosition = await rect(`[data-board-item="${stickyId}"] [data-board-handle]`);
      result.dragged = { dx: Math.round(endPosition.x - startPosition.x), dy: Math.round(endPosition.y - startPosition.y) };
      const centreId = result.mindOnDisk.items[0].id;
      await evaluate("document.querySelector('[data-board-connect]').click()");
      await click(`[data-board-item="${centreId}"] textarea`);
      await click(`[data-board-item="${stickyId}"] textarea`);
      await until("!!document.querySelector('[data-board-edge-label]')");
      await typeInto('[data-board-edge-label]', language === 'ar' ? 'مثال' : 'example');
      await until("document.querySelectorAll('[data-board-edge-text]').length===1");
      // A card for a note, chosen from the list.
      await evaluate("(() => { const select = document.querySelector('[data-board-note]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(select, 'board-note'); select.dispatchEvent(new Event('change', { bubbles: true })); })()");
      await until("!!document.querySelector('[data-board-open]')");
      await until("document.querySelector('[data-board-save]')?.getAttribute('data-board-save')==='saved'");
      await pause(900);
      await until("document.querySelector('[data-board-save]')?.getAttribute('data-board-save')==='saved'");
      const saved = readBoard(mindId);
      result.saved = { title: saved.title, items: saved.items.length, edges: saved.edges.length, revision: saved.revision, sticky: saved.items.find(item => item.id === stickyId), labelled: saved.edges.find(edge => edge.label), linkCard: saved.items.find(item => item.target) };
      result.horizontalOverflow = await evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth');
      await shot(`edited-${language}-1280`);
      owner.setContentSize(420, 900);
      await shot(`edited-${language}-420`);
      result.narrowOverflow = await evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth');
      owner.setContentSize(1280, 900);
      // Reopen from the list: the saved board comes back as it was.
      await evaluate("document.querySelector('[data-boards-back]').click()");
      await until(`!!document.querySelector('[data-boards-entry="${mindId}"]')`);
      result.listText = await evaluate(`document.querySelector('[data-boards-entry="${mindId}"]').textContent`);
      await evaluate(`document.querySelector('[data-boards-entry="${mindId}"] button').click()`);
      await until("document.querySelectorAll('[data-board-item]').length===7");
      result.reopenedLabel = await evaluate("document.querySelector('[data-board-edge-text]')?.textContent");
      // The link card opens its note in Notes and closes the boards.
      await evaluate("document.querySelector('[data-board-open]').click()");
      await until("!document.querySelector('[data-boards]') && document.querySelectorAll('[data-study-note]').length===1 && !!document.querySelector('[data-study-note=\"board-note\"]')");
      result.openedNote = true;
      // Argument map preset with labelled arrows in this language; then delete it (moves to boards/deleted).
      await evaluate("document.querySelector('[data-notes-boards]').click()");
      await until("!!document.querySelector('[data-boards-new=\"argument\"]')");
      const beforeArgument = boardFiles();
      await evaluate("document.querySelector('[data-boards-new=\"argument\"]').click()");
      await until("document.querySelectorAll('[data-board-edge-text]').length===2");
      result.argumentLabels = await evaluate("[...document.querySelectorAll('[data-board-edge-text]')].map(e=>e.textContent)");
      await shot(`argument-${language}-1280`);
      await until(`window.electronAPI.boards.list().then(list => list.length > ${beforeArgument.length})`);
      const argumentId = boardFiles().find(name => !beforeArgument.includes(name)).slice(0, -5);
      await evaluate("document.querySelector('[data-boards-back]').click()");
      await until(`!!document.querySelector('[data-boards-entry="${argumentId}"]')`);
      await evaluate(`window.confirm = () => true; document.querySelector('[data-boards-entry="${argumentId}"] button[aria-label]').click()`);
      await until(`!document.querySelector('[data-boards-entry="${argumentId}"]')`);
      result.argumentDeletedFile = !fs.existsSync(path.join(boardsFolder, `${argumentId}.json`)) && fs.readdirSync(path.join(boardsFolder, 'deleted')).some(name => name.startsWith(argumentId));
      // Since KEY-304 Boards is a tab of the Notes page with no close button; the next language reloads the page.
      await evaluate("document.querySelector('[data-boards] header button[aria-label]:last-child')?.click()");
      results[language] = result; console.log(JSON.stringify({ language, result: { ...result, mindOnDisk: { items: result.mindOnDisk.items.length, edges: result.mindOnDisk.edges.length, firstText: result.mindOnDisk.items[0].text } } }, null, 1));
      const words = language === 'ar' ? { centre: 'الفكرة الرئيسة', supports: 'يؤيد', opposes: 'يعترض', title: 'خريطة الصبر', sticky: 'الصبر عند الصدمة الأولى', label: 'مثال' } : { centre: 'Main idea', supports: 'supports', opposes: 'opposes', title: 'Patience map', sticky: 'Patience at the first blow', label: 'example' };
      assert.equal(result.dir, language === 'ar' ? 'rtl' : 'ltr');
      assert.equal(result.surfaceDir, 'ltr');
      assert.equal(result.mindOnDisk.items.length, 5); assert.equal(result.mindOnDisk.edges.length, 4); assert.equal(result.mindOnDisk.items[0].text, words.centre);
      assert.equal(result.arrowsDrawn, 4);
      assert.equal(result.saved.title, words.title);
      assert.equal(result.saved.items, 7); assert.equal(result.saved.edges, 5);
      assert.equal(result.saved.sticky.text, words.sticky);
      assert.ok(Math.abs(result.dragged.dx - 120) <= 2 && Math.abs(result.dragged.dy + 140) <= 2, JSON.stringify(result.dragged));
      assert.deepEqual([result.saved.labelled.from, result.saved.labelled.to, result.saved.labelled.label], [centreId, stickyId, words.label]);
      assert.equal(result.saved.linkCard.target, 'note:board-note');
      assert.equal(result.reopenedLabel, words.label);
      assert.deepEqual(result.argumentLabels.sort(), [words.supports, words.opposes].sort());
      assert.equal(result.argumentDeletedFile, true);
      assert.equal(result.horizontalOverflow, false); assert.equal(result.narrowOverflow, false);
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught|error/iu.test(line) && !/Electron Security Warning/u.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
