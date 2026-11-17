// KEY-391 live check: image occlusion through the real UI, with a real image (a page of the
// scanned Arabic manuscript in tests/real-files, rendered by Chromium's PDF viewer).
// One language per launch. The window stays off-screen (KEY-408).
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_IO_PROFILE;
const evidence = process.env.BAGLIB_IO_EVIDENCE;
const language = process.env.BAGLIB_IO_LANG || 'ar';
const realPdf = process.env.BAGLIB_IO_REAL_PDF;
const exportDir = process.env.BAGLIB_IO_EXPORT;

app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
const imagePath = path.join(evidence, `real-page-${language}.png`);

// The real UI calls the native dialogs; answer them with the real image and the export path.
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [imagePath] });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(exportDir, `baglib-image-occlusion-${language}.txt`) });

async function renderRealPage() {
  const win = new BrowserWindow({ width: 900, height: 1200, webPreferences: { plugins: true } });
  win.show();
  await win.loadURL(`${pathToFileURL(realPdf).href}#toolbar=0&navpanes=0&view=FitH`);
  await pause(5000);
  win.webContents.invalidate();
  await pause(500);
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 900, height: 1200 });
  win.destroy();
  const png = image.toPNG();
  fs.writeFileSync(imagePath, png);
  // A blank capture would be one colour; a real page has ink.
  const bitmap = image.toBitmap();
  let dark = 0;
  for (let i = 0; i < bitmap.length; i += 4) if (bitmap[i] < 100 && bitmap[i + 1] < 100 && bitmap[i + 2] < 100) dark += 1;
  return { bytes: png.length, darkShare: dark / (bitmap.length / 4), size: image.getSize() };
}

app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;
  const errors = [];
  owner.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message.slice(0, 400));
  });
  owner.webContents.on('did-finish-load', () => {
    owner.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {});
  });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => {
    throw new Error(`${error.message}: ${code.slice(0, 240)}`);
  });
  const until = async (code, tries = 150) => {
    for (let i = 0; i < tries; i++) {
      try {
        if (await evaluate(`(async()=>(${code}))()`)) return;
      } catch {
        /* retry */
      }
      await pause(200);
    }
    throw new Error(`Timed out: ${code}`);
  };
  const shot = async name => {
    await pause(500);
    owner.webContents.invalidate();
    await pause(300);
    fs.writeFileSync(path.join(evidence, `${name}-${language}.png`), (await owner.webContents.capturePage()).toPNG());
  };
  const loadApp = async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.loadURL('http://localhost:3000');
        return;
      } catch (error) {
        if (attempt >= 4) throw error;
        await pause(1000);
      }
    }
  };
  // Real mouse input, in window coordinates.
  const mouse = async (type, x, y, extra = {}) => {
    owner.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
    await pause(40);
  };
  const click = async (x, y) => {
    await mouse('mouseDown', x, y);
    await mouse('mouseUp', x, y);
  };
  const drag = async (x1, y1, x2, y2) => {
    await mouse('mouseMove', x1, y1);
    await mouse('mouseDown', x1, y1);
    for (let i = 1; i <= 6; i++) await mouse('mouseMove', x1 + ((x2 - x1) * i) / 6, y1 + ((y2 - y1) * i) / 6);
    await mouse('mouseUp', x2, y2);
  };
  // Keyboard as DOM events on the focused element: the window never takes OS focus (KEY-408),
  // so synthetic OS key input would not reach it.
  const KEYS = { p: ['p', 'KeyP'], m: ['m', 'KeyM'], 3: ['3', 'Digit3'], Space: [' ', 'Space'], Return: ['Enter', 'Enter'], Escape: ['Escape', 'Escape'] };
  const key = async name => {
    const [k, code] = KEYS[name];
    await evaluate(`(()=>{const el=document.activeElement&&document.activeElement!==document.body?document.activeElement:document.body;for(const type of ['keydown','keyup'])el.dispatchEvent(new KeyboardEvent(type,{key:${JSON.stringify(k)},code:${JSON.stringify(code)},bubbles:true,cancelable:true}));})()`);
    await pause(120);
  };
  const canvasRect = () =>
    evaluate(`(()=>{const r=document.querySelector('[data-io-canvas]').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};})()`);
  // Counts pixels near the mask colours inside a frame: active #ff8e8e, inactive #ffeba2.
  const maskPixels = async selector => {
    await until(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});return !!f && !!f.style.height;})()`);
    await pause(1500);
    owner.webContents.invalidate();
    await pause(400);
    const rect = await evaluate(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});f.scrollIntoView({block:'center'});const r=f.getBoundingClientRect();return {x:Math.max(0,Math.round(r.left)),y:Math.max(0,Math.round(r.top)),width:Math.round(r.width),height:Math.round(Math.min(r.height,860))};})()`);
    await pause(500);
    const bitmap = (await owner.webContents.capturePage(rect)).toBitmap();
    let active = 0;
    let inactive = 0;
    const near = (i, r, g, b) => Math.abs(bitmap[i + 2] - r) < 14 && Math.abs(bitmap[i + 1] - g) < 14 && Math.abs(bitmap[i] - b) < 14;
    for (let i = 0; i < bitmap.length; i += 4) {
      if (near(i, 0xff, 0x8e, 0x8e)) active += 1;
      else if (near(i, 0xff, 0xeb, 0xa2)) inactive += 1;
    }
    return { active, inactive };
  };

  (async () => {
    const results = { language };
    results.realImage = await renderRealPage();
    assert.ok(results.realImage.darkShare > 0.005, `real page rendered with ink (${results.realImage.darkShare})`);

    owner.setContentSize(1400, 950);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','dark')`);
    await loadApp();
    await until('!!window.electronAPI?.cardMedia && !!document.querySelector("footer")');
    await pause(800);

    await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
    await until(`!!document.querySelector('button[data-notes-tab="cards"]')`);
    await evaluate(`document.querySelector('button[data-notes-tab="cards"]').click()`);
    await until(`!!document.querySelector('button[data-new-note-btn]')`);

    // --- Note 1: hide all, guess one ---
    const createNote = async (mode, draw) => {
      await evaluate(`document.querySelector('button[data-new-note-btn]').click()`);
      await until(`!!document.querySelector('[data-note-type-select]')`);
      await evaluate(`(()=>{const s=document.querySelector('[data-note-type-select]');const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,'stock-image-occlusion');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await until(`!!document.querySelector('[data-io-pick-image]')`);
      await evaluate(`document.querySelector('[data-io-pick-image]').click()`);
      await until(`!!document.querySelector('[data-io-canvas]')`);
      await pause(500);
      await evaluate(`document.querySelector('[data-io-mode="${mode}"]').click()`);
      await draw();
      await pause(400);
    };

    await createNote('hide-all', async () => {
      const r = await canvasRect();
      const at = (fx, fy) => [r.x + r.w * fx, r.y + r.h * fy];
      await evaluate(`document.querySelector('[data-io-tool="rect"]').click()`);
      await drag(...at(0.1, 0.1), ...at(0.4, 0.2));
      await drag(...at(0.55, 0.3), ...at(0.85, 0.4));
      await evaluate(`document.querySelector('[data-io-tool="ellipse"]').click()`);
      await drag(...at(0.5, 0.6), ...at(0.8, 0.75));
      // Group the second rectangle with the ellipse: select tool, click one, Shift+click the other.
      await evaluate(`document.querySelector('[data-io-tool="select"]').click()`);
      await click(...at(0.7, 0.35));
      await mouse('mouseDown', ...at(0.65, 0.675), { modifiers: ['shift'] });
      await mouse('mouseUp', ...at(0.65, 0.675), { modifiers: ['shift'] });
      await evaluate(`document.querySelector('[data-io-group]').click()`);
      // Polygon by keyboard shortcut P, three clicks and Enter.
      await evaluate(`document.querySelector('[data-io-canvas]').focus()`);
      await key('p');
      await until(`document.querySelector('[data-io-tool="polygon"]').getAttribute('aria-pressed') === 'true'`);
      await pause(200);
      const rp = await canvasRect();
      const atP = (fx, fy) => [rp.x + rp.w * fx, rp.y + rp.h * fy];
      await click(...atP(0.1, 0.5));
      await click(...atP(0.35, 0.55));
      await click(...atP(0.2, 0.8));
      await evaluate(`document.querySelector('[data-io-canvas]').focus()`);
      await key('Return');
      // Text label.
      await evaluate(`document.querySelector('[data-io-tool="text"]').click()`);
      await evaluate(`(()=>{const i=document.querySelector('[data-io-label-text]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,${JSON.stringify(language === 'ar' ? 'سورة الفلق' : 'Surat al-Falaq')});i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await pause(200);
      const rt = await canvasRect();
      await click(rt.x + rt.w * 0.6, rt.y + rt.h * 0.85);
    });
    const shapesInfo = await evaluate(`[...document.querySelectorAll('[data-io-canvas] [data-shape-id]')].map(e=>({kind:e.getAttribute('data-io-kind'),ordinal:Number(e.getAttribute('data-io-ordinal'))}))`);
    results.note1Shapes = shapesInfo;
    assert.equal(shapesInfo.length, 5, `5 shapes drawn: ${JSON.stringify(shapesInfo)}`);
    const ordinals = shapesInfo.map(s => s.ordinal);
    assert.deepEqual(ordinals, [1, 2, 2, 3, 0], 'rect 1; rect 2 + ellipse grouped as 2; polygon 3; text label 0');
    results.note1Summary = await evaluate(`document.querySelector('[data-io-summary]').textContent`);
    await shot('01-editor-hide-all');

    // Preview of card 1 (front): the active mask is red, the others yellow (hide all).
    results.previewMasks = await maskPixels('[data-io="1"] iframe[data-card-frame]');
    assert.ok(results.previewMasks.active > 500, `active mask drawn in preview: ${JSON.stringify(results.previewMasks)}`);
    assert.ok(results.previewMasks.inactive > 500, `inactive masks drawn in preview (hide all): ${JSON.stringify(results.previewMasks)}`);

    await evaluate(`document.querySelector('button[data-save-note-btn]').click()`);
    await until(`!document.querySelector('button[data-save-note-btn]')`);
    const note1 = (await evaluate(`window.electronAPI.cardNotes.listNotes({noteTypeId:'stock-image-occlusion'})`))[0];
    const cards1 = await evaluate(`window.electronAPI.cardNotes.getCards(${JSON.stringify(note1.id)})`);
    results.note1Cards = cards1.length;
    assert.equal(cards1.length, 3, 'three groups make three cards');
    assert.ok(note1.fields.Occlusion.includes(':oi=1'), 'hide-all mode stored as oi=1');
    assert.match(note1.fields.Image, /^<img src="[a-f0-9]{40}\.png">$/u);

    // --- Review the note ---
    const deck = await evaluate(`window.electronAPI.knowledgeCards.createDeck({ name: ${JSON.stringify(language === 'ar' ? 'إخفاء الصور' : 'Image occlusion')} })`);
    await evaluate(`window.electronAPI.cardNotes.linkDeck(${JSON.stringify(note1.id)}, ${JSON.stringify(deck.id)})`);
    await evaluate(`window.dispatchEvent(new Event('baglib:knowledge-card-saved'))`);
    await until(`!!document.querySelector('[data-deck-study=${JSON.stringify(deck.id)}]')`, 100).catch(async () => {
      await evaluate(`document.querySelector('button[data-notes-tab="cards"]').click()`);
    });
    await until(`!!document.querySelector('[data-deck-study=${JSON.stringify(deck.id)}]')`);
    await evaluate(`document.querySelector('[data-deck-study=${JSON.stringify(deck.id)}]').click()`);
    await until(`!!document.querySelector('[data-srs-review-screen] iframe[data-card-frame]')`);
    results.reviewFront = await maskPixels('[data-srs-review-screen] iframe[data-card-frame]');
    assert.ok(results.reviewFront.active > 500 && results.reviewFront.inactive > 500, `review front masks: ${JSON.stringify(results.reviewFront)}`);
    await shot('02-review-front-hide-all');

    // Confidence then reveal (keyboard), then the back: active shape becomes a highlight outline.
    await key('3');
    await until(`!document.querySelector('[data-srs-reveal]')?.disabled`);
    await key('Space');
    await until(`!!document.querySelector('[data-srs-rating="3"]')`);
    results.reviewBack = await maskPixels('[data-srs-review-screen] iframe[data-card-frame]');
    assert.ok(results.reviewBack.inactive > 500, `back keeps inactive masks: ${JSON.stringify(results.reviewBack)}`);
    assert.ok(results.reviewBack.active < results.reviewFront.active / 4, `back no longer fills the active mask: ${JSON.stringify(results.reviewBack)}`);
    await shot('03-review-back');

    // M toggles masks off (only labels stay), as in Anki.
    await key('m');
    results.reviewToggled = await maskPixels('[data-srs-review-screen] iframe[data-card-frame]');
    assert.ok(results.reviewToggled.inactive < 50, `M hides the masks: ${JSON.stringify(results.reviewToggled)}`);
    await shot('04-review-masks-toggled');
    await evaluate(`document.querySelector('[data-srs-review-screen] button')?.click()`);
    await key('Escape');
    await until(`!document.querySelector('[data-srs-review-screen]')`).catch(() => {});

    // --- Note 2: hide one, guess one ---
    await until(`!!document.querySelector('button[data-new-note-btn]')`);
    await createNote('hide-one', async () => {
      const r = await canvasRect();
      const at = (fx, fy) => [r.x + r.w * fx, r.y + r.h * fy];
      await evaluate(`document.querySelector('[data-io-tool="rect"]').click()`);
      await drag(...at(0.15, 0.15), ...at(0.45, 0.3));
      await drag(...at(0.5, 0.5), ...at(0.85, 0.65));
    });
    results.hideOnePreview = await maskPixels('[data-io="1"] iframe[data-card-frame]');
    assert.ok(results.hideOnePreview.active > 500, `hide one: active mask drawn: ${JSON.stringify(results.hideOnePreview)}`);
    assert.ok(results.hideOnePreview.inactive < 50, `hide one: other shapes are not covered: ${JSON.stringify(results.hideOnePreview)}`);
    await shot('05-editor-hide-one');
    await evaluate(`document.querySelector('button[data-save-note-btn]').click()`);
    await until(`!document.querySelector('button[data-save-note-btn]')`);
    const allNotes = await evaluate(`window.electronAPI.cardNotes.listNotes({noteTypeId:'stock-image-occlusion'})`);
    const note2 = allNotes.find(n => n.id !== note1.id);
    assert.ok(note2 && !note2.fields.Occlusion.includes(':oi=1'), 'hide-one mode stored without oi');
    await evaluate(`window.electronAPI.cardNotes.linkDeck(${JSON.stringify(note2.id)}, ${JSON.stringify(deck.id)})`);

    // --- Export to Anki ---
    const exported = await evaluate(`window.electronAPI.knowledgeCards.exportDeck(${JSON.stringify(deck.id)})`);
    assert.equal(exported, true);
    const base = path.join(exportDir, `baglib-image-occlusion-${language}`);
    const ioText = fs.readFileSync(`${base} - Image Occlusion.txt`, 'utf8');
    const mediaFiles = fs.readdirSync(`${base} - media`);
    results.export = { ioRows: ioText.trimEnd().split('\n').length - 6, mediaFiles };
    assert.equal(results.export.ioRows, 2, 'two notes exported');
    assert.equal(mediaFiles.length, 1, 'the shared image is exported once');

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon/u.test(line));
    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[io-live-${language}] passed`, JSON.stringify(results));
    app.exit(0);
  })().catch(error => {
    console.error(`[io-live-${language}] FAILED`, error);
    try {
      fs.writeFileSync(path.join(evidence, `error-${language}.txt`), String(error && error.stack ? error.stack : error));
    } catch {
      /* ignore */
    }
    owner.webContents.capturePage().then(
      img => {
        fs.writeFileSync(path.join(evidence, `error-${language}.png`), img.toPNG());
        app.exit(1);
      },
      () => app.exit(1)
    );
  });
});

require('../../dist/main/index.js');
