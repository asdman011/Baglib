const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_KEY303_DIR;
const evidence = process.env.BAGLIB_KEY303_EVIDENCE;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true).catch(error => { throw new Error(error.message + ' ' + code.slice(0, 1000)); });
  const until = async code => {
    for (let attempt = 0; attempt < 350; attempt++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(200);
    }
    throw new Error('Timed out ' + code + '\n' + await evaluate('document.body.innerText.slice(-1800)'));
  };
  const key = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await pause(200);
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const shot = async name => { await pause(350); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const openBook = async (file, language) => {
    const library = language === 'ar' ? 'المكتبة' : 'Library';
    const read = language === 'ar' ? 'قراءة' : 'Read';
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await key('Escape');
    await evaluate(`document.querySelector('aside button[aria-label=${JSON.stringify(library)}]').click()`);
    await until(`[...document.querySelectorAll('h3,h4')].some(e=>e.textContent.trim()===${JSON.stringify(file.title)})`);
    await pause(500);
    await evaluate(`(()=>{const title=[...document.querySelectorAll('h3,h4')].find(e=>e.textContent.trim()===${JSON.stringify(file.title)});if(!title)throw new Error('Missing title');let e=title;while(e){const button=[...e.querySelectorAll('button')].find(b=>b.title===${JSON.stringify(read)}||b.textContent.trim()===${JSON.stringify(read)});if(button){button.click();return;}e=e.parentElement;}throw new Error('No read button '+document.querySelector('main')?.textContent.slice(-700));})()`);
    await until('!!document.querySelector("[data-reader-shared-header]")');
    await until(file.kind === 'pdf' ? '!!document.querySelector("[data-pdf-width]")' : '!!document.querySelector("[data-epub-marks-status]")');
    await pause(500);
    win.show(); win.focus(); win.webContents.focus();
  };
  (async () => {
    const files = JSON.parse(fs.readFileSync(path.join(directory, 'inputs.json')));
    const results = [];
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate(`window.electronAPI.settings.set('save.policy.v1',{mode:'manual',intervalMinutes:2})`);
    for (const file of files) await evaluate(`window.electronAPI.addBook(${JSON.stringify({ id: file.id, title: file.title, author: 'مُؤَلِّف Author', workType: 'book', bookType: 'digital', digitalFormat: file.kind.toUpperCase(), filePath: file.filename })})`);
    win.webContents.debugger.attach('1.3');
    for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) for (const width of [1280, 480]) for (const file of files) {
      win.setContentSize(width, 900);
      await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(language)});localStorage.setItem('baglib-theme',${JSON.stringify(theme)})`);
      await win.loadURL('http://localhost:3000');
      await openBook(file, language);
      const prefix = `${file.kind}-${file.lang}-${language}-${theme}-${width}`;
      console.log('CASE', prefix);
      // A narrow reader always starts closed, even with an open desktop preference.
      if (width === 480) assert.equal(await evaluate('!!document.querySelector("[data-reader-side-panel]")'), false);
      const frame = await evaluate(`(()=>{const h=document.querySelector('[data-reader-shared-header]'),r=h.getBoundingClientRect();const content=document.querySelector('[data-reader-content]').getBoundingClientRect();return {headerHeight:r.height,headerWidth:r.width,scroll:document.documentElement.scrollWidth,width:innerWidth,dir:h.dir,theme:document.documentElement.className,contentWidth:content.width,headers:document.querySelectorAll('[data-reader-shared-header]').length,overflow:h.scrollWidth-h.clientWidth};})()`);
      assert.equal(frame.headers, 1);
      assert.equal(frame.headerHeight, 56);
      assert.ok(frame.overflow <= 1, prefix + ' header overflow ' + JSON.stringify(frame));
      assert.equal(frame.dir, language === 'ar' ? 'rtl' : 'ltr');
      assert.ok(frame.scroll <= width);
      if (width === 480) assert.ok(frame.contentWidth >= 440, 'readable narrow viewport');
      await shot(prefix + '-page');
      await click('[data-reader-panel-toggle]');
      await until('!!document.querySelector("[data-reader-side-panel]")');
      assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-reader-panel-tab]")].map(e=>e.dataset.readerPanelTab)'), ['toc', 'knowledge', 'annotations', 'search']);
      assert.equal(await evaluate('!!document.querySelector("[data-reader-panel-sheet]")'), width === 480);
      // KEY-308: the open desktop panel narrows the header; every header control must stay inside it.
      if (width > 480) {
        const open = await evaluate(`(()=>{const h=document.querySelector('[data-reader-shared-header]'),r=h.getBoundingClientRect();const last=[...h.querySelectorAll('button')].pop().getBoundingClientRect();return {overflow:h.scrollWidth-h.clientWidth,inside:last.left>=r.left-1&&last.right<=r.right+1};})()`);
        assert.ok(open.overflow <= 1 && open.inside, prefix + ' header overflows with the panel open ' + JSON.stringify(open));
      }
      await click('[data-reader-panel-tab="knowledge"]');
      await until('document.querySelector("[data-reader-panel-tab=knowledge]")?.getAttribute("aria-selected")==="true"');
      await shot(prefix + '-panel');
      // Keyboard tab order mirrors the UI direction, while Notes always follows Marks logically.
      await evaluate('document.querySelector("[data-reader-panel-tab=knowledge]").focus()');
      await key(language === 'ar' ? 'Left' : 'Right');
      await until('document.querySelector("[data-reader-panel-tab=annotations]")?.getAttribute("aria-selected")==="true"');
      if (width === 1280) {
        await evaluate('document.querySelector("[role=separator]").focus()');
        await key(language === 'ar' ? 'Right' : 'Left');
        const remembered = await evaluate(`window.electronAPI.settings.get('reader.chrome.v1:${file.id}')`);
        assert.equal(remembered.tab, 'annotations');
        assert.ok(remembered.width >= 280 && remembered.width <= 480);
      }
      await key('Escape');
      await until('!document.querySelector("[data-reader-side-panel]")');
      await key('F11');
      await evaluate('document.activeElement?.blur()');
      win.webContents.sendInputEvent({ type: 'mouseMove', x: width - 10, y: 450 });
      await pause(500);
      assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-reader-shared-header]")).opacity'), '0');
      await shot(prefix + '-focus');
      await evaluate('document.querySelector("[data-reader-toolbar-toggle]").focus()');
      await key('Tab');
      await pause(350);
      assert.ok(await evaluate('!!document.activeElement.closest("[data-reader-shared-header]")'));
      assert.ok(parseFloat(await evaluate('getComputedStyle(document.querySelector("[data-reader-shared-header]")).opacity')) >= 0.95);
      await key('M', ['alt']);
      await until('document.activeElement?.hasAttribute("data-markup-tool-button")');
      await key('Escape');
      await until('!document.querySelector("[data-reader-focus-mode]")');
      results.push({ prefix, frame, tabs: true, focus: true, keyboardMarkup: true });
      fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
    }
    app.quit();
  })().catch(async error => { console.error(error); await shot('failure').catch(() => {}); app.exit(1); });
});
require('../../dist/main/index.js');
