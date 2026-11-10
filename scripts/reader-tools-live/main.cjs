const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_KEY314_DIR;
const evidence = process.env.BAGLIB_KEY314_EVIDENCE;
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
    for (const file of files) await evaluate(`window.electronAPI.addBook(${JSON.stringify({ id: file.id, title: file.title, author: 'مُؤَلِّف Author', workType: 'book', bookType: 'digital', digitalFormat: 'PDF', filePath: file.filename })})`);
    for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) for (const width of [1280, 480]) for (const file of files) {
      win.setContentSize(width, 900);
      await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(language)});localStorage.setItem('baglib-theme',${JSON.stringify(theme)})`);
      await win.loadURL('http://localhost:3000');
      await openBook(file, language);
      const prefix = `${file.lang}-${file.textLayer}-${language}-${theme}-${width}`;
      console.log('CASE', prefix);
      await until(`document.querySelector('[data-reader-ocr-chip]')?.dataset.ocrState === '${file.textLayer === 'no' ? 'no-text-layer' : 'text-layer'}'`);
      const frame = await evaluate(`(()=>{const h=document.querySelector('[data-reader-shared-header]');return {overflow:h.scrollWidth-h.clientWidth,dir:h.dir,chip:document.querySelector('[data-reader-ocr-chip]').dataset.ocrState,bottom:document.querySelectorAll('[data-ocr-pill],[data-pdf-bottom-navigation],[data-reader-bottom-bar]').length};})()`);
      assert.ok(frame.overflow <= 1, JSON.stringify(frame));
      assert.equal(frame.dir, language === 'ar' ? 'rtl' : 'ltr');
      assert.equal(frame.bottom, 0);
      await shot(prefix + '-page');
      await evaluate(`document.querySelector('[data-reader-ocr-chip] button').click()`);
      await until('!!document.querySelector("[data-ocr-panel-controls]")');
      await shot(prefix + '-ocr');
      for (const section of ['annotate','organize','convert','optimize','ocr','security','saved-actions']) {
        await evaluate(`document.querySelector('section[data-tool-section="${section}"]').scrollIntoView({block:'start'})`);
        await shot(prefix + '-' + section);
      }
      if (file.textLayer === 'no' && theme === 'light' && width === 1280) {
        await evaluate(`document.querySelector('[data-ocr-panel-controls] button').click()`);
        await until(`document.querySelector('[data-reader-ocr-chip]')?.dataset.ocrState === 'running'`);
        await shot(prefix + '-ocr-running');
        await until(`document.querySelector('[data-reader-ocr-chip]')?.dataset.ocrState !== 'running'`);
        const state = await evaluate(`document.querySelector('[data-reader-ocr-chip]').dataset.ocrState`);
        assert.equal(state, 'done');
        await shot(prefix + '-ocr-done');
        fs.writeFileSync(path.join(evidence,prefix+'-ocr-result.json'),JSON.stringify(await evaluate(`window.electronAPI.ocrRecognizePage(${JSON.stringify({filePath:file.filename,pageNumber:1,language:'ar',engine:'ocrmypdf'})})`),null,2));
      }
      await evaluate(`document.querySelector('[data-reader-ocr-chip] button').click()`);
      await until(`document.activeElement?.closest('[data-ocr-panel-controls]') !== null`);
      const query = language === 'ar' ? 'تَشْفِير' : 'encrypt';
      await evaluate(`(()=>{const e=document.querySelector('[data-pdf-tool-search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(query)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await until(`!!document.querySelector('[data-pdf-tool-item="encrypt"]') && !document.querySelector('[data-pdf-tool-item="watermark"]')`);
      await shot(prefix + '-search');
      await evaluate(`(()=>{const e=document.querySelector('[data-pdf-tool-search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await until(`!!document.querySelector('[data-pdf-tool-item="watermark"]')`);
      await until(`document.querySelector('[data-pdf-tool-item="watermark"]').getAttribute('aria-disabled')==='false'`);
      if (file.textLayer === 'yes' && file.lang === 'ar' && language === 'ar' && theme === 'light' && width === 1280) {
        await click('[data-pdf-tool-item="convert-file-pdf"]');
        await until('!!document.querySelector("[data-stirling-tool-modal]")');
        await shot(prefix + '-file-conversion');
        await click('[data-stirling-tool-modal] button');
        await click('[data-stirling-hub-close]');
      }
      await click('[data-pdf-tool-item="watermark"]');
      await shot(prefix + '-watermark-options');
      await click('[data-reader-tools]');
      await until('!document.querySelector("[data-reader-chrome=tools]")');
      results.push({prefix,frame,sections:7,search:true,options:true});
      fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(results,null,2));
    }
    app.quit();
  })().catch(async error => { console.error(error); await shot('failure').catch(() => {}); app.exit(1); });
});
require('../../dist/main/index.js');
