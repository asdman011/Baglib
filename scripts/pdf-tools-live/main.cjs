const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_TOOLS_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
const page = Number(process.env.BAGLIB_MARKUP_PAGE);
const labels = { ar: { library: 'المكتبة', read: 'قراءة' }, en: { library: 'Library', read: 'Read' } };
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  owner.webContents.on('did-finish-load', () => { evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until = async (code, tries = 200) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(300); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(500); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const key = value => evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(value)},bubbles:true}))`);
  const load = async language => { owner.setContentSize(1280, 900); await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000'); await until('!!window.electronAPI && !!document.querySelector("footer")'); await key('Escape'); await pause(1200); };
  const selectSpan = index => evaluate(`(()=>{const spans=[...document.querySelectorAll('[data-page-number="${page}"] .textLayer span')].filter(s=>s.textContent.trim().length>3);const span=spans[${index}];if(!span)throw new Error('no span');const range=document.createRange();range.selectNodeContents(span);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);span.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return span.textContent;})()`);
  let workId;
  const items = () => evaluate(`window.electronAPI.knowledge.getByWork(${JSON.stringify(workId)})`);
  // A point on the first page, as fractions of its width and height, in window coordinates.
  const pagePoint = (fx, fy) => evaluate(`(()=>{
    const r=document.querySelector('.pdf-page-container[data-page-number="${page}"]').getBoundingClientRect();
    const left=Math.max(16,r.left), right=Math.min(innerWidth-16,r.right);
    const top=Math.max(80,r.top), bottom=Math.min(innerHeight-16,r.bottom);
    return {x:Math.round(left+(right-left)*${fx}),y:Math.round(top+(bottom-top)*${fy})};
  })()`);
  const mouse = (type, point) => owner.webContents.sendInputEvent({ type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
  const drag = async (from, to) => { mouse('mouseMove', from); await pause(60); mouse('mouseDown', from); await pause(60); for (let step = 1; step <= 6; step++) { mouse('mouseMove', { x: Math.round(from.x + ((to.x - from.x) * step) / 6), y: Math.round(from.y + ((to.y - from.y) * step) / 6) }); await pause(40); } mouse('mouseUp', to); await pause(500); };
  const click = async point => { mouse('mouseMove', point); await pause(60); mouse('mouseDown', point); await pause(60); mouse('mouseUp', point); await pause(600); };
  const tool = async id => {
    if (!await evaluate(`!!document.querySelector('[data-markup-palette-panel]')`)) {
      await evaluate("document.querySelector('[data-markup-palette]').click()");
      await until("!!document.querySelector('[data-markup-palette-panel]')");
    }
    await evaluate(`document.querySelector('[data-markup-tool-button="${id}"]').click()`);
    await evaluate('document.activeElement?.blur()');
  };
  const insert = async (selector, text) => { await evaluate(`document.querySelector('${selector}').focus()`); await pause(150); await owner.webContents.insertText(text); await pause(200); };
  (async () => {
    owner.show(); owner.focus(); owner.webContents.focus();
    owner.webContents.setBackgroundThrottling(false);
    const results = {};
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await load('en');
    for (const language of ['ar', 'en']) await evaluate(`window.electronAPI.addBook({id:'tools-work-${language}',title:'علم — Tools',author:'',workType:'book',bookType:'digital',digitalFormat:'PDF',filePath:${JSON.stringify(path.join(directory, 'markup.pdf'))}})`);
    for (const language of ['ar', 'en']) {
      const result = {};
      workId = 'tools-work-' + language;
      const startCount = (await items()).length;
      await load(language);
      owner.webContents.send('study:navigate', `book:${workId}#p=${page}`);
      await until(`document.querySelector('[data-reader-page]')?.dataset.readerPage==='${page}' && document.querySelectorAll('[data-page-number="${page}"] .textLayer span').length > 1`);
      result.compactTools = await evaluate("[...document.querySelectorAll('[data-markup-tool-button]')].map(b=>b.dataset.markupToolButton)");
      // Underline tool: one selection is saved as an underline, then the tool returns to selecting text (not locked).
      await tool('underline');
      await selectSpan(0); await pause(1500);
      result.underlineDrawn = await evaluate("document.querySelectorAll('[data-pdf-text-mark=\"underline\"]').length > 0");
      result.toolAfterOne = await evaluate("document.querySelector('[data-reader-markup-bar]').dataset.markupTool");
      // Strike-out from the expanded bar.
      await tool('strike'); await selectSpan(1); await pause(1500);
      result.strikeDrawn = await evaluate("document.querySelectorAll('[data-pdf-text-mark=\"strike\"]').length > 0");
      // Expanded drawing tools; a rectangle dragged on the page.
      await evaluate("document.querySelector('[data-markup-palette]').click()"); await until("!!document.querySelector('[data-markup-palette-panel]')");
      result.expandedTools = await evaluate("document.querySelectorAll('[data-markup-tool-button]').length");
      await tool('rect');
      await until("!!document.querySelector('[data-pdf-draw-surface=\"rect\"]')", 30);
      await drag(await pagePoint(0.1, 0.55), await pagePoint(0.5, 0.75));
      await until("!!document.querySelector('[data-pdf-mark=\"rect\"]')", 30);
      result.rectDrawn = true;
      // An arrow.
      await tool('arrow'); await pause(200);
      await drag(await pagePoint(0.6, 0.6), await pagePoint(0.85, 0.8));
      await until("!!document.querySelector('[data-pdf-mark=\"arrow\"]')", 30);
      // A text box: a click places it and opens it for its text.
      await tool('text'); await pause(200);
      await click(await pagePoint(0.15, 0.85));
      await until("!!document.querySelector('[data-pdf-mark-popover=\"text\"]')", 30);
      await insert('[data-mark-text]', language === 'ar' ? 'راجع هذا الموضع' : 'Check this passage');
      await evaluate("document.querySelector('[data-mark-save]').click()"); await pause(800);
      result.textBox = await evaluate("[...document.querySelectorAll('[data-pdf-mark=\"text\"]')].map(e=>e.textContent).join('|')");
      await evaluate("document.querySelector('[data-pdf-mark-popover] button[aria-label]').click()"); await pause(300);
      // Comment mode (C): a click places a pin; its thread takes a comment, then is resolved.
      await key('c'); await pause(300);
      result.commentToolByKey = await evaluate("document.querySelector('[data-reader-markup-bar]').dataset.markupTool");
      await click(await pagePoint(0.7, 0.3));
      await until("!!document.querySelector('[data-pdf-mark-popover=\"pin\"] [data-comment-new]')", 30);
      await insert('[data-comment-new]', language === 'ar' ? 'هل هذا صحيح؟' : 'Is this right?');
      await evaluate("document.querySelector('[data-comment-add]').click()");
      await until("!!document.querySelector('[data-pdf-mark-popover] [data-comment-thread]')", 30);
      await shot(`pin-${language}-1280`);
      await evaluate("document.querySelector('[data-pdf-mark-popover] [data-comment-resolve]').click()"); await pause(600);
      await evaluate("document.querySelector('[data-pdf-mark-popover] button[aria-label]').click()"); await pause(600);
      result.pinColorAfterResolve = await evaluate("getComputedStyle(document.querySelector('[data-pdf-mark=\"pin\"]')).backgroundColor");
      const saved = (await items()).slice(0, (await items()).length - startCount);
      result.savedKinds = (await items()).filter(item => /"shape"|"style"/u.test(item.location)).map(item => JSON.parse(item.location).shape || JSON.parse(item.location).style).sort();
      result.savedCount = saved.length;
      await shot(`marks-page-${language}-1280`);
      // The marks list: both layers, filters.
      if (!await evaluate("!!document.querySelector('[data-reader-side-panel]')")) {
        await evaluate("document.querySelector('[data-reader-panel-toggle]').click()");
      }
      await until("!!document.querySelector('[data-reader-panel-tab=knowledge]')");
      await evaluate("document.querySelector('[data-reader-panel-tab=knowledge]').click()");
      await until("!!document.querySelector('[data-pdf-marks]')", 30);
      result.listRows = await evaluate("document.querySelectorAll('[data-marks-row]').length");
      const pick = (selector, value) => evaluate(`(()=>{const s=document.querySelector('${selector}');const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,'${value}');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await pick('[data-marks-kind]', 'rect'); await pause(200);
      result.rectRows = await evaluate("[...document.querySelectorAll('[data-marks-row]')].map(r=>r.dataset.marksRowKind)");
      await pick('[data-marks-kind]', 'all'); await pick('[data-marks-status]', 'resolved'); await pause(200);
      result.resolvedRows = await evaluate("[...document.querySelectorAll('[data-marks-row]')].map(r=>r.dataset.marksRowKind)");
      await pick('[data-marks-status]', 'all');
      await insert('[data-marks-search]', language === 'ar' ? 'الموضع' : 'passage'); await pause(300);
      result.searchRows = await evaluate("[...document.querySelectorAll('[data-marks-row]')].map(r=>r.dataset.marksRowKind)");
      await shot(`marks-list-${language}-1280`);
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.deepEqual(result.compactTools, ['select']);
      assert.equal(result.underlineDrawn, true); assert.equal(result.toolAfterOne, 'select');
      assert.equal(result.strikeDrawn, true);
      assert.equal(result.expandedTools, 13);
      assert.ok(result.textBox.includes(language === 'ar' ? 'راجع هذا الموضع' : 'Check this passage'), result.textBox);
      assert.equal(result.commentToolByKey, 'comment');
      assert.equal(result.pinColorAfterResolve, 'rgb(156, 163, 175)', 'a resolved pin turns grey');
      // Separate works keep native pin clicks clear of the preceding language's marks.
      const round = 1;
      assert.deepEqual(result.rectRows, Array(round).fill('rect'));
      assert.deepEqual(result.resolvedRows, Array(round).fill('pin'));
      assert.deepEqual(result.searchRows, ['text']);
      assert.ok(result.listRows >= 6, String(result.listRows));
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught|error/iu.test(line) && !/Electron Security Warning/u.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
