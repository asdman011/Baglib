const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_MARKUP_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
const labels = { ar: { library: 'المكتبة', read: 'قراءة' }, en: { library: 'Library', read: 'Read' } };
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 2) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  const until = async (code, tries = 200) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(300); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(500); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const key = (value, extra = '') => evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(value)},bubbles:true${extra}}))`);
  const load = async language => { owner.setContentSize(1280, 900); await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000'); await until('!!window.electronAPI && !!document.querySelector("footer")'); await key('Escape'); await pause(1200); };
  // Select the whole text of one PDF text-layer span and release the mouse, as a user drag would.
  const selectSpan = index => evaluate(`(()=>{const spans=[...document.querySelectorAll('.textLayer span')].filter(s=>s.textContent.trim().length>3);const span=spans[${index}];if(!span)throw new Error('no span');const range=document.createRange();range.selectNodeContents(span);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);span.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return span.textContent;})()`);
  const highlightCount = () => evaluate(`window.electronAPI.knowledge.getByWork ? window.electronAPI.knowledge.getByWork('markup-work','highlight').then(rows=>rows.filter(r=>(r.knowledgeType||r.type)==='highlight').length) : -1`);
  (async () => {
    const results = {};
    await load('en');
    await evaluate(`window.electronAPI.addBook({id:'markup-work',title:'علم — Knowledge',author:'',workType:'book',bookType:'digital',digitalFormat:'PDF',filePath:${JSON.stringify(path.join(directory, 'markup.pdf'))}})`);
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      await evaluate(`document.querySelector('aside button[aria-label=${JSON.stringify(labels[language].library)}]').click()`);
      await until(`[...document.querySelectorAll('button')].some(b=>b.title===${JSON.stringify(labels[language].read)}||b.textContent.trim()===${JSON.stringify(labels[language].read)})`);
      await evaluate(`(()=>{const read=${JSON.stringify(labels[language].read)};const isRead=b=>b.title===read||b.textContent.trim()===read;const title=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.includes('Knowledge')&&e.textContent.includes('علم'));let node=title;while(node&&![...node.querySelectorAll('button')].some(isRead))node=node.parentElement;if(!node)throw new Error('no read button for test book');[...node.querySelectorAll('button')].find(isRead).click();})()`);
      await until("!!document.querySelector('[data-reader-markup-bar]') && document.querySelectorAll('.textLayer span').length > 0", 100);
      result.barDirection = await evaluate("getComputedStyle(document.querySelector('[data-reader-markup-bar]')).direction");
      result.lockLabel = await evaluate("document.querySelector('[data-markup-lock]').getAttribute('aria-label')");
      // Colour keys: 3 picks the third colour (rose); Arabic-Indic ٢ picks emerald.
      await key('3'); await pause(200);
      result.afterKey3 = await evaluate("document.querySelector('[data-markup-color][aria-pressed=true]').dataset.markupColor");
      await key('٢'); await pause(200);
      result.afterArabicKey2 = await evaluate("document.querySelector('[data-markup-color][aria-pressed=true]').dataset.markupColor");
      await shot(`bar-${language}-1280`);
      // Without the lock, a selection opens the menu and saves nothing.
      const before = await highlightCount();
      await selectSpan(0); await pause(800);
      result.menuWithoutLock = await evaluate("!!document.querySelector('[role=toolbar]') && [...document.querySelectorAll('button')].some(b=>b.title && b.title.length && b.closest('.fixed,.absolute'))");
      result.savedWithoutLock = (await highlightCount()) - before;
      await key('Escape'); await evaluate('getSelection().removeAllRanges()'); await pause(300);
      // H turns the lock on; a selection is saved at once in emerald.
      await key('h'); await pause(200);
      result.lockOn = await evaluate("document.querySelector('[data-markup-lock]').getAttribute('aria-pressed')");
      await selectSpan(1); await pause(1500);
      result.savedWithLock = (await highlightCount()) - before;
      result.savedColor = await evaluate(`window.electronAPI.knowledge.getByWork('markup-work').then(rows=>rows.find(r=>(r.knowledgeType||r.type)==='highlight')?.color)`);
      result.toast = await evaluate(`document.body.innerText.includes(${JSON.stringify(language === 'ar' ? 'حُفظ التظليل في الصفحة 1' : 'Highlight saved on page 1')})`);
      await shot(`locked-${language}-1280`);
      // Typing in a field must not toggle the lock.
      await evaluate(`(()=>{const input=document.createElement('input');input.id='probe';document.body.appendChild(input);input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'h',bubbles:true}));input.remove();})()`);
      result.lockAfterTyping = await evaluate("document.querySelector('[data-markup-lock]').getAttribute('aria-pressed')");
      await key('Escape'); await pause(200);
      result.lockAfterEscape = await evaluate("document.querySelector('[data-markup-lock]').getAttribute('aria-pressed')");
      await key('?'); await until("!!document.querySelector('[data-reader-shortcuts]')");
      result.sheetRows = await evaluate("document.querySelectorAll('[data-reader-shortcuts] dt').length");
      await shot(`sheet-${language}-1280`);
      await evaluate("[...document.querySelectorAll('[data-reader-shortcuts] button')].pop().click()");
      owner.setContentSize(480, 900); await pause(800); await shot(`bar-${language}-480`);
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.equal(result.afterKey3, 'rose'); assert.equal(result.afterArabicKey2, 'emerald');
      assert.equal(result.savedWithoutLock, 0); assert.equal(result.lockOn, 'true'); assert.equal(result.savedWithLock, 1);
      assert.equal(result.savedColor, 'emerald'); assert.equal(result.lockAfterTyping, 'true'); assert.equal(result.lockAfterEscape, 'false'); assert.equal(result.sheetRows, 7); assert.equal(result.toast, true);
      await evaluate(`window.electronAPI.knowledge.getByWork('markup-work').then(rows=>Promise.all(rows.map(r=>window.electronAPI.knowledge.delete?window.electronAPI.knowledge.delete(r.id):null)))`).catch(() => {});
    }
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(async error => { console.error(error); try { consoleLines.push('DOM ' + await evaluate("JSON.stringify({visible:document.visibilityState,containers:document.querySelectorAll('.pdf-page-container').length,canvases:document.querySelectorAll('canvas').length,textLayers:document.querySelectorAll('.textLayer').length,spans:document.querySelectorAll('.textLayer span').length,workspace:!!document.querySelector('.pdf-viewer-workspace'),viewer:document.querySelector('.pdf-viewport-container')?.outerHTML.slice(0,2500)})")); } catch (dumpError) { consoleLines.push(String(dumpError)); } fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
