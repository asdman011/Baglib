// KEY-244 live verification script in Electron (ar & en, real files).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY244_PROFILE;
const evidence = process.env.BAGLIB_KEY244_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('KEY-244 hard timeout'); app.exit(1); }, 200_000).unref();

let running = false;
app.on('browser-window-created', (_, win) => {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message);
  });
  win.webContents.on('did-finish-load', () => {
    if (running || win.webContents.getURL().startsWith('devtools:')) return;
    running = true;
    run(win, errors).catch(async error => {
      console.error(error);
      fs.writeFileSync(path.join(evidence, 'failure.txt'), (error.stack || String(error)) + '\n' + JSON.stringify(errors));
      try {
        fs.writeFileSync(path.join(evidence, 'failure.png'), (await win.webContents.capturePage()).toPNG());
      } catch {}
      app.exit(1);
    });
  });
});

async function run(win, errors) {
  win.setSize(1440, 960);
  win.show();
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const frame = () => win.webContents.mainFrame.frames.find(f => f.url.includes('/research-editor/'));
  const edit = code => {
    const f = frame();
    assert.ok(f, 'editor iframe');
    return f.executeJavaScript(code, true);
  };
  async function until(code, child = false, tries = 200) {
    for (let i = 0; i < tries; i++) {
      try {
        if (await (child ? edit(code) : evaluate(code))) return;
      } catch {}
      await pause(120);
    }
    throw new Error('Timed out: ' + code);
  }
  const shot = async name => {
    await pause(350);
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };

  await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=notes]")');
  await evaluate(`(async () => {
    await window.electronAPI.settings.set("onboarding.v1", { seen: true });
    await window.electronAPI.settings.set("workspace.tabs.v1", null);
    await window.electronAPI.settings.set("workspace.closed.v1", null);
  })()`);
  await evaluate('location.reload()');
  await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=notes]")');

  // Import real ar and en PDFs
  const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
  const arPdf = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'ar' && f.textLayer === 'yes');
  const enPdf = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'en' && f.textLayer === 'yes');
  assert.ok(arPdf && enPdf);
  await evaluate(`window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(path.resolve('tests/real-files', arPdf.path))} })`);
  await evaluate(`window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(path.resolve('tests/real-files', enPdf.path))} })`);
  const books = await evaluate('window.electronAPI.getAllBooks()');
  const arBook = books.find(b => b.filePath === path.resolve('tests/real-files', arPdf.path));
  const enBook = books.find(b => b.filePath === path.resolve('tests/real-files', enPdf.path));
  assert.ok(arBook && enBook);

  // Create a study note to link/embed
  const noteRes = await evaluate(`window.electronAPI.studyNotes.save({ title: 'ملاحظة فقهية للاختبار', content: 'نص الملاحظة السريعة للربط على اللوحة', aliases: [], tags: [] })`);
  const noteId = noteRes?.id || noteRes?.note?.id;
  assert.ok(noteId, 'note created');

  // Create manuscripts for ar & en
  const msAr = await evaluate(`window.electronAPI.manuscripts.create('KEY-244 Arabic Canvas', 'research')`);
  const docAr = await evaluate(`window.electronAPI.manuscripts.createDocument(${JSON.stringify(msAr.id)}, 'فصل الخريطة الذهنية')`);
  const msEn = await evaluate(`window.electronAPI.manuscripts.create('KEY-244 English Canvas', 'research')`);
  const docEn = await evaluate(`window.electronAPI.manuscripts.createDocument(${JSON.stringify(msEn.id)}, 'English Mindmap Chapter')`);
  assert.ok(msAr?.id && docAr?.id && msEn?.id && docEn?.id);

  // === PART 1: ARABIC (RTL) ===
  await evaluate(`localStorage.setItem('baglib-lang', 'ar');`);
  await evaluate('location.reload()');
  await until('!!document.querySelector("[data-nav-item=notes-editor]")');
  await evaluate('document.querySelector("[data-nav-item=notes-editor]").click()');
  await until('window.__baglibResearchEditor?.ready', true);
  await until(`!![...document.querySelectorAll('.research-sidebar-manuscript-row')].find(el => el.textContent.includes('KEY-244 Arabic Canvas'))`);
  await evaluate(`[...document.querySelectorAll('.research-sidebar-manuscript-row')].find(el => el.textContent.includes('KEY-244 Arabic Canvas')).click()`);
  await until(`!![...document.querySelectorAll('.research-sidebar-tree-row')].find(el => el.textContent.includes('فصل الخريطة الذهنية'))`);
  await evaluate(`[...document.querySelectorAll('.research-sidebar-tree-row')].find(el => el.textContent.includes('فصل الخريطة الذهنية')).click()`);
  await until(`window.__baglibResearchEditor.editor.doc.id === ${JSON.stringify(docAr.id)}`, true);

  // Switch to edgeless mode
  await evaluate(`document.querySelectorAll('.research-mode-btn')[1]?.click()`);
  await until(`window.__baglibResearchEditor.mode === 'edgeless'`, true);
  await pause(400);

  // (a) + (e): Mindmap (style 1, root + children, add/remove child, RTL layoutType 0 -> auto-switched to 1), concept map (shapes + connector), frame
  const arCanvas = await edit(`(() => {
    const editor = window.__baglibResearchEditor.editor;
    const doc = editor.doc;
    const surface = doc.getModelsByFlavour('affine:surface')[0];
    doc.addBlock('affine:frame', { xywh: '[-420,-240,520,300]' }, surface.id);
    const s1 = surface.addElement({ type: 'shape', shapeType: 'rect', xywh: '[-380,-160,180,70]', text: 'الأصل الأول: النية' });
    const s2 = surface.addElement({ type: 'shape', shapeType: 'rect', xywh: '[-120,-160,180,70]', text: 'الفرع: قبول العمل' });
    surface.addElement({ type: 'connector', mode: 0, source: { id: s1 }, target: { id: s2 } });
    const mmId = surface.addElement({
      type: 'mindmap',
      style: 1,
      layoutType: 0, // created with default RIGHT, our RTL sync should flip to LEFT (1)
      children: {
        text: 'أصول الفقه',
        xywh: '[260,-100,160,50]',
        children: [
          { text: 'القرآن الكريم', xywh: '[40,-160,130,40]', children: [] },
          { text: 'السنة النبوية', xywh: '[40,-40,130,40]', children: [] },
          { text: 'عقدة مؤقتة', xywh: '[40,40,120,40]', children: [] },
        ],
      },
    });
    const mm = surface.getElementById(mmId);
    // Add a child node and remove the temporary node
    mm.addChild(mm.tree, { text: 'الإجماع' });
    const tempNode = mm.tree.children.find(c => c.element.text?.toString() === 'عقدة مؤقتة');
    if (tempNode) mm.removeChild(tempNode.element);
    doc.captureSync();
    return {
      frameCount: doc.getModelsByFlavour('affine:frame').length,
      connectorCount: surface.elementModels.filter(e => e.type === 'connector').length,
      mindmapCount: surface.elementModels.filter(e => e.type === 'mindmap').length,
      mindmapChildren: mm.tree.children.length,
      mindmapLayout: mm.layoutType,
    };
  })()`);

  // (b) Use Canvas Link button to link our Study Note on canvas
  await evaluate(`document.querySelector('[data-action="canvas-link"]').click()`);
  await until(`!!document.querySelector('[data-canvas-link-dialog]')`);
  await evaluate(`document.querySelector('[data-canvas-link-dialog] .picker-board-btn').click()`);
  await until(`window.__baglibResearchEditor.editor.doc.getModelsByFlavour('baglib:note-embed').length === 1`, true);

  // Also add a Quran ayah source + BagLib book link onto the canvas note
  await edit(`(() => {
    const doc = window.__baglibResearchEditor.editor.doc;
    const note = doc.getModelsByFlavour('affine:note')[0];
    doc.addBlock('baglib:ayah', {
      url: 'quran:hafs:2:255',
      label: 'سورة البقرة — آية ٢٥٥',
      text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ',
      grade: '',
      verses: [],
    }, note.id);
    doc.captureSync();
  })()`);

  await edit(`window.__baglibResearchEditor.fitToScreen()`);
  await pause(500);
  await shot('01-canvas-ar');

  // Test clicking the quick-note embed ON THE CANVAS (real click via coordinates)
  const noteCardRect = await edit(`(() => {
    const findDeep = (root, sel) => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) { const r = findDeep(el.shadowRoot, sel); if (r) return r; }
      }
      return null;
    };
    const embed = findDeep(document, 'baglib-note-embed');
    const r = (embed?.shadowRoot ?? embed)?.querySelector('.note-card')?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  })()`);
  const frameRect = await evaluate(`document.querySelector('iframe.research-editor-frame').getBoundingClientRect().toJSON()`);
  assert.ok(noteCardRect, 'noteCardRect present on canvas');
  const clickX = Math.round(frameRect.left + noteCardRect.x);
  const clickY = Math.round(frameRect.top + noteCardRect.y);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: clickX, y: clickY, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: clickX, y: clickY, button: 'left', clickCount: 1 });
  await pause(700);
  const tabAfterNoteClick = await evaluate(`document.querySelector('[data-workspace-tab-row] [aria-selected="true"]')?.textContent?.trim()`);
  await shot('02-canvas-note-opened-ar');

  // Return to editor tab and test arrangeSourcesOnCanvas (d)
  await evaluate(`document.querySelectorAll('[data-workspace-tab-row] [data-tab-id]')[0]?.click()`);
  await pause(400);
  await evaluate(`document.querySelector('[data-action="arrange-sources"]').click()`);
  await until(`!!document.querySelector('[data-canvas-generated-badge]')`);
  const generatedFramesAr = await edit(`window.__baglibResearchEditor.editor.doc.getModelsByFlavour('affine:frame').map(f => f.title?.toString() || f.props?.title?.toString() || '')`);
  await pause(500);
  await shot('03-arranged-generated-ar');

  // (c) Explicit save + reload app and verify persistence
  await edit(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true }))`);
  await pause(800);
  await evaluate('location.reload()');
  await until('!!document.querySelector("[data-nav-item=notes-editor]")');
  await evaluate('document.querySelector("[data-nav-item=notes-editor]").click()');
  await until('window.__baglibResearchEditor?.ready', true);
  await until(`!![...document.querySelectorAll('.research-sidebar-manuscript-row')].find(el => el.textContent.includes('KEY-244 Arabic Canvas'))`);
  await evaluate(`[...document.querySelectorAll('.research-sidebar-manuscript-row')].find(el => el.textContent.includes('KEY-244 Arabic Canvas')).click()`);
  await until(`!![...document.querySelectorAll('.research-sidebar-tree-row')].find(el => el.textContent.includes('فصل الخريطة الذهنية'))`);
  await evaluate(`[...document.querySelectorAll('.research-sidebar-tree-row')].find(el => el.textContent.includes('فصل الخريطة الذهنية')).click()`);
  await until(`window.__baglibResearchEditor.editor.doc.id === ${JSON.stringify(docAr.id)}`, true);
  await pause(500);

  const afterReloadAr = await edit(`(() => {
    const editor = window.__baglibResearchEditor.editor;
    const doc = editor.doc;
    const surface = doc.getModelsByFlavour('affine:surface')[0];
    return {
      mode: editor.mode,
      frameCount: doc.getModelsByFlavour('affine:frame').length,
      connectorCount: surface.elementModels.filter(e => e.type === 'connector').length,
      mindmapCount: surface.elementModels.filter(e => e.type === 'mindmap').length,
      noteEmbedCount: doc.getModelsByFlavour('baglib:note-embed').length,
      ayahCount: doc.getModelsByFlavour('baglib:ayah').length,
    };
  })()`);

  // === PART 2: ENGLISH (LTR) ===
  await evaluate(`localStorage.setItem('baglib-lang', 'en');`);
  await evaluate('location.reload()');
  await until('!!document.querySelector("[data-nav-item=notes-editor]")');
  await evaluate('document.querySelector("[data-nav-item=notes-editor]").click()');
  await until('window.__baglibResearchEditor?.ready', true);
  await until(`!![...document.querySelectorAll('.research-sidebar-manuscript-row')].find(el => el.textContent.includes('KEY-244 English Canvas'))`);
  await evaluate(`[...document.querySelectorAll('.research-sidebar-manuscript-row')].find(el => el.textContent.includes('KEY-244 English Canvas')).click()`);
  await until(`!![...document.querySelectorAll('.research-sidebar-tree-row')].find(el => el.textContent.includes('English Mindmap Chapter'))`);
  await evaluate(`[...document.querySelectorAll('.research-sidebar-tree-row')].find(el => el.textContent.includes('English Mindmap Chapter')).click()`);
  await until(`window.__baglibResearchEditor.editor.doc.id === ${JSON.stringify(docEn.id)}`, true);
  await evaluate(`document.querySelectorAll('.research-mode-btn')[1]?.click()`);
  await until(`window.__baglibResearchEditor.mode === 'edgeless'`, true);
  await pause(400);

  await edit(`(() => {
    const editor = window.__baglibResearchEditor.editor;
    const doc = editor.doc;
    const surface = doc.getModelsByFlavour('affine:surface')[0];
    surface.addElement({
      type: 'mindmap',
      style: 1,
      layoutType: 0,
      children: {
        text: 'Research Map',
        xywh: '[-100,-100,140,45]',
        children: [
          { text: 'Primary Source', xywh: '[150,-140,120,38]', children: [] },
          { text: 'Commentary', xywh: '[150,-60,120,38]', children: [] },
        ],
      },
    });
    const note = doc.getModelsByFlavour('affine:note')[0];
    doc.addBlock('baglib:book-quote', {
      url: 'book:' + ${JSON.stringify(enBook.id)} + '#p=1',
      label: ${JSON.stringify(enBook.title)} + ' — p. 1',
      text: 'Sample excerpt from real English PDF.',
      grade: '',
      verses: [],
    }, note.id);
    doc.captureSync();
  })()`);
  await evaluate(`document.querySelector('[data-action="arrange-sources"]').click()`);
  await until(`!!document.querySelector('[data-canvas-generated-badge]')`);
  const generatedFramesEn = await edit(`window.__baglibResearchEditor.editor.doc.getModelsByFlavour('affine:frame').map(f => f.title?.toString() || f.props?.title?.toString() || '')`);
  await edit(`window.__baglibResearchEditor.fitToScreen()`);
  await pause(500);
  await shot('04-canvas-en');

  const result = {
    arCanvas,
    tabAfterNoteClick,
    generatedFramesAr,
    afterReloadAr,
    generatedFramesEn,
    errors,
  };
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  console.log('KEY-244 LIVE RESULT:', JSON.stringify(result, null, 2));
  assert.equal(errors.length, 0, 'Expected 0 renderer errors, got: ' + JSON.stringify(errors));
  app.exit(0);
}

require(path.resolve('dist/main/index.js'));
