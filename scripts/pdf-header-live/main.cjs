const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_HEADER_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
const labels = { ar: { library: 'المكتبة', read: 'قراءة' }, en: { library: 'Library', read: 'Read' } };
const WIDTHS = [1280, 900, 640, 480, 380];
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  const until = async (code, tries = 200) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(300); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(500); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  // A fresh window may open maximised or full screen, where setContentSize is ignored.
  const size = async width => { if (owner.isMinimized()) owner.restore(); if (owner.isFullScreen()) owner.setFullScreen(false); if (owner.isMaximized()) owner.unmaximize(); owner.setMinimumSize(320, 400); owner.setContentSize(width, 820); await pause(900); const [actual] = owner.getContentSize(); if (actual !== width) throw new Error(`window is ${actual}px wide, not ${width}px (maximized ${owner.isMaximized()}, full screen ${owner.isFullScreen()})`); };
  const key = value => evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(value)},bubbles:true}))`);
  const load = async language => { owner.setContentSize(1280, 900); await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000'); await until('!!window.electronAPI && !!document.querySelector("footer")'); await key('Escape'); await pause(1200); };
  // Every visible control in the PDF header row (not in an open popover): whether it lies fully inside the window and the header.
  const measure = () => evaluate(`(()=>{
    const header=document.querySelector('[data-reader-markup-bar]').closest('header');const box=header.getBoundingClientRect();const width=document.documentElement.clientWidth;
    const controls=[...header.querySelectorAll('button,select,input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.closest('[data-pdf-header-menu]')&&!(e.parentElement.closest('.fixed,.absolute')&&header.contains(e.parentElement.closest('.fixed,.absolute')));});
    const outside=controls.filter(e=>{const r=e.getBoundingClientRect();return r.left<-0.5||r.right>width+0.5||r.left<box.left-0.5||r.right>box.right+0.5;}).map(e=>e.getAttribute('aria-label')||e.title||e.textContent.trim().slice(0,30));
    const more=header.querySelector('[data-pdf-header-more]');
    // The floating OCR bar: every control inside the window and inside the view it floats over.
    const pills=[...document.querySelectorAll('[data-ocr-pill]')].filter(p=>p.getBoundingClientRect().width>0);
    const ocrOutside=pills.flatMap(p=>{const view=(p.offsetParent||document.body).getBoundingClientRect();return [...p.querySelectorAll('button,select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left<Math.max(0,view.left)-0.5||r.right>Math.min(width,view.right)+0.5);}).map(e=>e.getAttribute('aria-label')||e.textContent.trim().slice(0,30));});
    const ocr=pills.map(p=>({level:p.dataset.level,run:p.querySelector('[data-ocr-run]')?.getAttribute('aria-label')||null,layout:!!p.querySelector('select[title]')}));
    return {width,header:Math.round(box.width),scroll:header.scrollWidth,client:header.clientWidth,count:controls.length,outside,more:!!more&&more.getBoundingClientRect().width>0,ocr,ocrOutside};
  })()`);
  (async () => {
    const results = {};
    await load('en');
    await evaluate(`window.electronAPI.addBook({id:'header-work',title:'علم — Header',author:'',workType:'book',bookType:'digital',digitalFormat:'PDF',filePath:${JSON.stringify(path.join(directory, 'markup.pdf'))}})`);
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      await evaluate(`document.querySelector('aside button[aria-label=${JSON.stringify(labels[language].library)}]').click()`);
      await until(`[...document.querySelectorAll('button')].some(b=>b.title===${JSON.stringify(labels[language].read)}||b.textContent.trim()===${JSON.stringify(labels[language].read)})`);
      await evaluate(`(()=>{const read=${JSON.stringify(labels[language].read)};const isRead=b=>b.title===read||b.textContent.trim()===read;const title=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.includes('Header')&&e.textContent.includes('علم'));let node=title;while(node&&![...node.querySelectorAll('button')].some(isRead))node=node.parentElement;[...node.querySelectorAll('button')].find(isRead).click();})()`);
      await until("!!document.querySelector('[data-markup-tool-button]') && document.querySelectorAll('.textLayer span').length > 0", 100);
      for (const width of WIDTHS) {
        await size(width);
        result[width] = await measure();
        await shot(`header-${language}-${width}`);
      }
      // At 480 the More menu holds what the row has no room for, and its items work.
      await size(480);
      if (result[480].more) {
        await evaluate("document.querySelector('[data-pdf-header-more]').click()"); await pause(400);
        result.menu = await evaluate("[...document.querySelectorAll('[data-pdf-header-menu] [role^=menuitem]')].map(e=>e.dataset.pdfHeaderItem)");
        result.menuInside = await evaluate("(()=>{const r=document.querySelector('[data-pdf-header-menu]').getBoundingClientRect();return r.left>=0&&r.right<=document.documentElement.clientWidth;})()");
        await shot(`header-${language}-480-menu`);
        await key('Escape'); await pause(300);
        result.menuClosedByEscape = await evaluate("!document.querySelector('[data-pdf-header-menu]')");
        // The bookmark item toggles the bookmark like the row button does, and the menu closes after a choice.
        await evaluate("document.querySelector('[data-pdf-header-more]').click()"); await pause(300);
        const before = await evaluate("document.querySelector('[data-pdf-header-item=\"bookmark\"]').getAttribute('aria-checked')");
        await evaluate("document.querySelector('[data-pdf-header-item=\"bookmark\"]').click()"); await pause(800);
        result.menuClosedAfterChoice = await evaluate("!document.querySelector('[data-pdf-header-menu]')");
        await evaluate("document.querySelector('[data-pdf-header-more]').click()"); await pause(300);
        result.bookmarkToggled = before !== await evaluate("document.querySelector('[data-pdf-header-item=\"bookmark\"]').getAttribute('aria-checked')");
        await evaluate("document.querySelector('[data-pdf-header-item=\"bookmark\"]').click()"); await pause(800);
      }
      // The compact markup bar: its palette holds every tool and the colours, inside the window.
      result.compactBar = await evaluate("!!document.querySelector('[data-reader-markup-bar][data-markup-compact]')");
      if (result.compactBar) {
        await evaluate("document.querySelector('[data-markup-palette]').click()"); await pause(400);
        result.paletteTools = await evaluate("document.querySelectorAll('[data-markup-palette-panel] [data-markup-tool-button]').length");
        result.paletteInside = await evaluate("(()=>{const r=document.querySelector('[data-markup-palette-panel]').getBoundingClientRect();return r.left>=0&&r.right<=document.documentElement.clientWidth;})()");
        await evaluate("document.querySelector('[data-markup-palette-panel] [data-markup-color=\"sky\"]').click()"); await pause(300);
        result.paletteColor = await evaluate("document.querySelector('[data-markup-palette-panel] [data-markup-color=\"sky\"]').getAttribute('aria-pressed')");
        await shot(`header-${language}-480-palette`);
        await evaluate("document.querySelector('[data-markup-palette-panel] [data-markup-tool-button=\"underline\"]').click()"); await pause(400);
        result.paletteClosedAfterTool = await evaluate("!document.querySelector('[data-markup-palette-panel]')");
        result.toolShown = await evaluate("document.querySelector('[data-reader-markup-bar] [data-markup-tool-button]').dataset.markupToolButton");
        await key('Escape'); await pause(300);
      }
      owner.setContentSize(1280, 900);
      results[language] = result; console.log(JSON.stringify({ language, result }));
      for (const width of WIDTHS) {
        assert.deepEqual(result[width].outside, [], `${language} ${width}: controls outside the window`);
        assert.ok(result[width].scroll <= result[width].client + 1, `${language} ${width}: header overflows`);
        assert.ok(result[width].ocr.length >= 1, `${language} ${width}: OCR bar shown`);
        assert.deepEqual(result[width].ocrOutside, [], `${language} ${width}: OCR bar controls outside the view`);
        for (const pill of result[width].ocr) { assert.ok(pill.run, 'the run button keeps its name'); assert.equal(pill.layout, true, 'the layout choice stays'); }
      }
      assert.equal(result[1280].more, false, 'no More menu when everything fits');
      assert.equal(result[1280].ocr[0].level, '0', 'the OCR bar is full at 1280');
      assert.equal(result[480].more, true);
      for (const item of ['bookmark', 'undo', 'history']) assert.ok(result.menu.includes(item), `menu has ${item}`);
      assert.equal(result.menuInside, true);
      assert.equal(result.menuClosedByEscape, true); assert.equal(result.menuClosedAfterChoice, true); assert.equal(result.bookmarkToggled, true);
      assert.equal(result.compactBar, true, 'the markup bar is compact at 480');
      assert.equal(result.paletteTools, 10); assert.equal(result.paletteInside, true); assert.equal(result.paletteColor, 'true');
      assert.equal(result.paletteClosedAfterTool, true); assert.equal(result.toolShown, 'underline');
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught|error/iu.test(line) && !/Electron Security Warning/u.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
