const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_KEY244_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;
  const errors = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true);
  owner.webContents.on('did-finish-load', () => { evaluate("window.electronAPI?.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until = async (code, tries = 150) => {
    for (let index = 0; index < tries; index++) {
      try { if (await evaluate(code)) return; } catch { /* Startup can briefly replace the document. */ }
      await pause(200);
    }
    throw new Error('Timed out: ' + code);
  };
  const shot = async name => {
    await pause(250);
    owner.webContents.invalidate();
    await pause(150);
    fs.writeFileSync(path.join(process.env.BAGLIB_KEY244_EVIDENCE, name + '.png'), (await owner.webContents.capturePage()).toPNG());
  };
  const click = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(200); };
  const choose = async (selector, value) => {
    await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.value=${JSON.stringify(value)};element.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await pause(250);
  };
  const box = selector => evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
  const point = async selector => { const r = await box(selector); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };
  const mouse = (type, point, modifiers = []) => owner.webContents.sendInputEvent({ type, x: Math.round(point.x), y: Math.round(point.y), button: 'left', clickCount: 1, modifiers });
  const drag = async (from, to, modifiers = [], during) => {
    mouse('mouseMove', from, modifiers); await pause(40);
    mouse('mouseDown', from, modifiers); await pause(50);
    for (let index = 1; index <= 6; index++) {
      mouse('mouseMove', { x: from.x + (to.x - from.x) * index / 6, y: from.y + (to.y - from.y) * index / 6 }, modifiers);
      await pause(50);
    }
    if (during) await during();
    mouse('mouseUp', to, modifiers); await pause(150);
  };
  const key = async (keyCode, modifiers = []) => {
    owner.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    owner.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await pause(200);
  };
  const position = id => evaluate(`(()=>{const e=document.querySelector('[data-board-item="${id}"]');return {x:parseFloat(e.style.insetInlineStart),y:parseFloat(e.style.top)};})()`);
  const downloads = [];
  owner.webContents.session.on('will-download', (_event, item) => {
    const filename = path.join(directory, downloads.length + '-' + item.getFilename());
    const download = { filename, state: 'started' };
    downloads.push(download);
    item.setSavePath(filename);
    item.once('done', (_event, state) => { download.state = state; });
  });
  (async () => {
    const matrix = [];
    await until('!!window.electronAPI?.boards && !!document.querySelector("footer")');
    await evaluate("window.electronAPI.studyNotes.save({id:'linked-source',title:'الصَّبر — Patience',content:'Original linked note',aliases:[],tags:[],expectedRevision:0})");
    for (const language of ['ar', 'en']) for (const width of [1280, 480]) {
      owner.setContentSize(1280, 1000);
      await evaluate(`localStorage.setItem('baglib-lang','${language}')`);
      await owner.loadURL('http://localhost:3000');
      await until('!!window.electronAPI?.boards && !!document.querySelector("footer")');
      const id = `board-${language}-${width}`;
      const card = (id, x, y, text) => ({ id, x, y, w: 160, h: 100, kind: 'card', color: 'sky', text });
      const input = { id, title: language === 'ar' ? 'خريطة الصَّبر — Patience' : 'Patience — الصَّبر', preset: 'mind', expectedRevision: 0,
        items: [{ ...card('a', 0, 0, 'الصَّبر — Patience'), target: 'note:linked-source', label: 'Linked source' }, card('b', 300, 10, 'Evidence — دليل'), card('c', 300, 180, 'Example — مثال'), card('d', 600, 180, 'Outside selection')],
        edges: [{ id: 'ab', from: 'a', to: 'b', label: 'يؤيد — supports' }, { id: 'ab2', from: 'a', to: 'b', label: 'parallel' }, { id: 'ac', from: 'a', to: 'c', label: '' }] };
      await evaluate(`window.electronAPI.boards.save(${JSON.stringify(input)})`);
      await click('[data-nav-item="notes"]');
      await until('!!document.querySelector("[data-notes-boards]")');
      await click('[data-notes-boards]');
      await until(`!!document.querySelector('[data-boards-entry="${id}"]')`);
      await click(`[data-boards-entry="${id}"] button`);
      await until('document.querySelectorAll("[data-board-item]").length===4');
      owner.setContentSize(width, 1000);
      await pause(300);
      await evaluate("document.querySelector('[data-board-fit]').click()");
      await pause(300);
      assert.equal(await evaluate('document.documentElement.dir'), language === 'ar' ? 'rtl' : 'ltr');
      assert.equal(await evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth'), false);
      const a = await box('[data-board-item="a"]');
      const b = await box('[data-board-item="b"]');
      await drag({ x: a.x - 8, y: a.y - 8 }, { x: b.x + b.w / 4, y: b.y + b.h / 3 }, ['shift'], async () => {
        assert.equal(await evaluate('!!document.querySelector("[data-board-marquee]")'), true);
        await shot(`marquee-${language}-${width}`);
      });
      assert.match(await evaluate('document.querySelector("[data-board-selection-count]")?.textContent || ""'), /2|٢/u);
      const alignBefore = await position('b');
      await choose('[data-board-align]', 'start');
      assert.equal((await position('a')).x, (await position('b')).x);
      await click('[data-board-undo]');
      assert.deepEqual(await position('b'), alignBefore);
      const beforeA = await position('a');
      const beforeB = await position('b');
      const handle = await point('[data-board-item="a"] [data-board-handle]');
      await drag(handle, { x: handle.x + 25, y: handle.y + 20 }, ['alt']);
      const movedA = await position('a');
      const movedB = await position('b');
      assert.ok(movedA.x > beforeA.x);
      assert.ok(Math.abs((movedA.x - beforeA.x) - (movedB.x - beforeB.x)) < 0.01);
      await key('z', ['control']);
      assert.deepEqual(await position('a'), beforeA);
      await key('y', ['control']);
      assert.deepEqual(await position('a'), movedA);
      // Nudge, duplicate and delete operate on the same selected group.
      await key('Right');
      assert.equal((await position('a')).x, movedA.x + 1);
      await key('Left', ['shift']);
      assert.equal((await position('a')).x, movedA.x - 9);
      await key('d', ['control']);
      assert.equal(await evaluate('document.querySelectorAll("[data-board-item]").length'), 6);
      await key('Delete');
      assert.equal(await evaluate('document.querySelectorAll("[data-board-item]").length'), 4);
      await click('[data-board-undo]');
      await click('[data-board-undo]');
      await click('[data-board-undo]');
      await click('[data-board-undo]');
      // A real pointer drag snaps the third card to the second card's vertical edge.
      const cHandle = await point('[data-board-item="c"] [data-board-handle]');
      const cBox = await box('[data-board-item="c"]');
      const bBox = await box('[data-board-item="b"]');
      await drag(cHandle, { x: cHandle.x + bBox.x - cBox.x + 1, y: cHandle.y + 12 }, [], async () => {
        assert.ok(await evaluate('document.querySelectorAll("[data-board-guide]").length') > 0);
        await shot(`snap-${language}-${width}`);
      });
      // Clear selection before layout so maximum degree chooses the root.
      const surface = await box('[data-board-surface]');
      const empty = { x: surface.x + 10, y: surface.y + surface.h - 10 };
      mouse('mouseDown', empty); mouse('mouseUp', empty); await pause(100);
      await click('[data-board-layout]');
      const root = await position('a');
      const branch = await position('b');
      assert.ok(language === 'ar' ? branch.x < root.x : branch.x > root.x);
      const laidOut = await position('b');
      await click('[data-board-undo]');
      assert.notDeepEqual(await position('b'), laidOut);
      await click('[data-board-redo]');
      assert.deepEqual(await position('b'), laidOut);
      await choose('[data-board-shape]', 'curved');
      const paths = await evaluate('[...document.querySelectorAll("[data-board-path]")].map(e=>e.getAttribute("d"))');
      assert.ok(paths.every(d => d.includes(' Q ')));
      assert.notEqual(paths[0], paths[1]);
      await evaluate("document.querySelector('[data-board-fit]').click()");
      await pause(250);
      // No empty reserved selection row. Label hit boxes clear cards and each other.
      assert.equal(await evaluate('!!document.querySelector("[data-board-selection]")'), false);
      const toolsBox = await box('[data-board-tools]');
      const canvasBox = await box('[data-board-surface]');
      assert.ok(Math.abs(canvasBox.y - toolsBox.y - toolsBox.h) < 2);
      const clearance = await evaluate(`(()=>{
        const labels=[...document.querySelectorAll('[data-board-edge-text]')].map(e=>e.getBoundingClientRect());
        const cards=[...document.querySelectorAll('[data-board-item]')].map(e=>e.getBoundingClientRect());
        const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
        return labels.every((label,i)=>cards.every(card=>!overlaps(label,card))&&labels.slice(0,i).every(prior=>!overlaps(label,prior)));
      })()`);
      assert.equal(clearance, true, 'labels clear cards and earlier labels');
      await shot(`layout-curves-${language}-${width}`);
      // Whole-board and selection SVG/2x PNG use real downloads, reopened and decoded.
      for (const scope of ['board', 'selection']) {
        if (scope === 'selection') {
          const selectedHandle = await point('[data-board-item="a"] [data-board-handle]');
          mouse('mouseDown', selectedHandle); mouse('mouseUp', selectedHandle); await pause(100);
        }
        for (const format of ['svg', 'png']) {
          const previous = downloads.length;
          await choose('[data-board-export]', format);
          for (let i = 0; i < 100 && downloads.length === previous; i++) await pause(100);
          assert.equal(downloads.length, previous + 1, 'image download starts');
          const download = downloads.at(-1);
          for (let i = 0; i < 100 && download.state === 'started'; i++) await pause(100);
          assert.equal(download.state, 'completed');
          const bytes = fs.readFileSync(download.filename);
          assert.ok(bytes.length > 100);
          if (format === 'png') {
            const image = nativeImage.createFromPath(download.filename);
            assert.equal(image.isEmpty(), false);
            assert.ok(image.getSize().width > 1);
          } else {
            assert.match(bytes.toString('utf8'), /<svg/u);
            if (scope === 'board') assert.match(bytes.toString('utf8'), / Q /u);
            else assert.ok(!bytes.toString('utf8').includes('Outside selection'));
            assert.equal(await evaluate(`(async()=>{const img=new Image();img.src='data:image/svg+xml;base64,${bytes.toString('base64')}';await img.decode();return img.naturalWidth>0;})()`), true);
          }
        }
      }
      // Select only the linked root, then convert it through the real notes API.
      const rootHandle = await point('[data-board-item="a"] [data-board-handle]');
      mouse('mouseDown', rootHandle); mouse('mouseUp', rootHandle); await pause(150);
      await click('[data-board-to-note]');
      await until('!document.querySelector("[data-boards]") && !!document.querySelector("[data-study-note]")');
      const notes = await evaluate('window.electronAPI.studyNotes.list()');
      const created = notes.find(note => note.id !== 'linked-source' && note.title === input.title);
      assert.ok(created);
      const note = created;
      assert.match(note.content, /note:linked-source/u);
      assert.ok(!note.content.includes('Outside selection'));
      assert.ok(!note.content.includes('Evidence'));
      await shot(`selection-note-${language}-${width}`);
      matrix.push({ language, width, passed: true });
      console.log(JSON.stringify(matrix.at(-1)));
    }
    assert.deepEqual(errors, [], 'zero renderer errors');
    console.log(JSON.stringify({ passed: matrix.length, matrix, downloads: downloads.length, rendererErrors: errors.length }));
    app.quit();
  })().catch(async error => {
    console.error(error);
    console.error(errors);
    try { await shot('failure'); } finally { app.exit(1); }
  });
});
require('../../dist/main/index.js');
