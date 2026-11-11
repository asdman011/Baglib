const { app, ipcMain, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { translations } = require('../../src/renderer/translations.ts');
const profile = process.env.BAGLIB_KEY301_DIR;
const evidence = process.env.BAGLIB_KEY301_EVIDENCE;
const files = JSON.parse(fs.readFileSync(path.join(profile, 'inputs.json')));
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) throw new Error('Only one Electron window permitted');
  started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let attempt = 0; attempt < 450; attempt++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(200);
    }
    throw new Error('Timed out ' + code + '\n' + await evaluate('document.body.innerText.slice(-2200)'));
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const captures = [];
  const shot = async name => {
    await pause(700);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))');
    const dimensions = await evaluate(`({width:innerWidth,height:innerHeight,scrollY,reader:!!document.querySelector('[data-reader-content]'),footerBottom:document.querySelector('footer')?.getBoundingClientRect().bottom,bodyChildren:[...document.body.children].map(e=>({tag:e.tagName,cls:e.className,style:e.getAttribute('style'),rect:e.getBoundingClientRect().toJSON(),display:getComputedStyle(e).display,position:getComputedStyle(e).position,flex:getComputedStyle(e).flex,height:getComputedStyle(e).height})),bodyRect:document.body.getBoundingClientRect().toJSON()})`);
    captures.push({ name, ...dimensions });
    fs.writeFileSync(path.join(evidence, 'captures.json'), JSON.stringify(captures, null, 2));
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
    if (!dimensions.reader && dimensions.footerBottom !== undefined) assert.ok(dimensions.footerBottom >= dimensions.height - 1, JSON.stringify({name, ...dimensions}));
  };
  const input = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const key = async (keyCode, modifiers = []) => { win.show(); win.focus(); win.webContents.focus(); win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await pause(150); };
  const navigate = async id => { await key('Escape'); await click(`[data-nav-item="${id}"]`); await pause(300); };
  const context = selector => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.x+20,clientY:r.y+20}));})()`);
  const undo = async text => {
    await until(`!![...document.querySelectorAll('[data-feedback-toast] button')].find(e=>e.textContent===${JSON.stringify(text.undo)})`);
    await evaluate(`[...document.querySelectorAll('[data-feedback-toast] button')].find(e=>e.textContent===${JSON.stringify(text.undo)}).click()`);
  };
  const results = [];
  const errors = [];
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  (async () => {
    win.setMinimumSize(320, 400); win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate(`window.electronAPI.settings.set('onboarding.v1',{seen:true});window.electronAPI.settings.set('save.policy.v1',{mode:'manual',intervalMinutes:2})`);
    // Production validator, metadata extractor, hash and repository import. The injected cover
    // renderer omits covers so importing never creates its separate hidden BrowserWindow.
    const { DigitalImportPipelineService } = require('../../src/main/services/digital/digital-import-pipeline.service.ts');
    await evaluate('(async()=>{for(const book of await window.electronAPI.getAllBooks())await window.electronAPI.deleteBook(book.id);})()');
    const pipeline = new DigitalImportPipelineService(undefined, undefined, undefined, undefined, undefined, async () => ({ coverUrl: '' }));
    for (const file of files) {
      const result = await pipeline.importFile({ filePath: file.filename, duplicateAction: 'import_anyway', customTitle: 'KEY301 ' + file.lang + ' Knowledge علم' });
      assert.equal(result.success, true, JSON.stringify(result)); file.id = result.workId;
    }
    fs.writeFileSync(path.join(evidence, 'imports.json'), JSON.stringify(files, null, 2));
    const originalSearch = ipcMain._invokeHandlers.get('search:query');
    const installDelayedSearch = () => {
      ipcMain.removeHandler('search:query');
      ipcMain.handle('search:query', async (_event, query, options) => {
        await pause(query.query.includes('older') ? 1200 : 100);
        return { results: query.query.includes('older') ? [{ id: 'stale', title: 'STALE_KEY301', providerId: 'local' }] : [], searchId: options.searchId };
      });
    };
    for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) for (const width of [1280, 480]) {
      if (process.env.BAGLIB_FEEDBACK_DEBUG && (language !== 'en' || theme !== 'light' || width !== 1280)) continue;
      const text = translations[language]; const prefix = `${language}-${theme}-${width}`;
      console.log('CASE', prefix);
      await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(language)});localStorage.setItem('baglib-theme',${JSON.stringify(theme)});window.electronAPI.settings.set('shell.navPinned.v1',true)`);
      win.setContentSize(width, 900); await win.loadURL('http://localhost:3000');
      await until('!!document.querySelector("footer") && !document.querySelector("[data-first-run]")');
      await pause(1400);
      await evaluate('window.confirm=()=>true;void 0');
      await navigate('library'); await until('document.querySelectorAll("[data-library-book-card]").length===2');
      await evaluate('(async()=>{for(const book of await window.electronAPI.getAllBooks())await window.electronAPI.deleteBook(book.id);window.dispatchEvent(new Event("baglib:refresh-books"));})()');
      await until(`document.body.textContent.includes(${JSON.stringify(text.emptyLibraryDesc)})`);
      await shot(prefix + '-empty-library');
      await evaluate(`(async()=>{for(const id of ${JSON.stringify(files.map(file=>file.id))})await window.electronAPI.restoreBook(id);window.dispatchEvent(new Event('baglib:refresh-books'));})()`);
      await until('document.querySelectorAll("[data-library-book-card]").length===2');
      // Resolve the production bridge channel by its registered name.
      const booksChannel = [...ipcMain._invokeHandlers.keys()].find(name=>name==='db:get-all-books'||name==='library:get-all-books');
      if (booksChannel) {
        const handler = ipcMain._invokeHandlers.get(booksChannel);
        ipcMain.removeHandler(booksChannel); ipcMain.handle(booksChannel, async (...args)=>{await pause(1600);return handler(...args);});
        await evaluate(`window.dispatchEvent(new Event('baglib:refresh-books'))`);
        await until('!!document.querySelector("[data-library-scroll-container] .animate-pulse")');
        await shot(prefix + '-library-skeleton');
        await until('document.querySelectorAll("[data-library-book-card]").length===2');
        ipcMain.removeHandler(booksChannel);ipcMain.handle(booksChannel,handler);
      }

      const book = files.find(file => file.lang === language);
      await context('[data-library-book-card]'); await until('!!document.querySelector("[data-baglib-menu] [data-menu-action=delete]")');
      await click('[data-baglib-menu] [data-menu-action=delete]');
      await until(`document.body.textContent.includes(${JSON.stringify(text.bookMovedToTrash)})`);
      await shot(prefix + '-trash-undo'); await undo(text);
      await until('document.querySelectorAll("[data-library-book-card]").length===2');
      assert.equal((await evaluate('window.electronAPI.getAllBooks()')).length, 2);
      await input('[data-simple-search-input]', 'NO_MATCH_KEY301'); await shot(prefix + '-empty-library-search');
      await input('[data-simple-search-input]', '');
      // A new mark is persisted through the normal bridge on a real PDF, then deleted and undone through UI.
      const markId = 'key301-' + prefix;
      await evaluate(`window.electronAPI.knowledge.save({id:${JSON.stringify(markId)},actor:'reader',workId:${JSON.stringify(book.id)},type:'note',noteContent:'عِلْم Knowledge feedback',location:JSON.stringify({page:1,shape:'pin',color:'amber',box:{x:40,y:25,width:2,height:2}})})`);
      win.webContents.send('study:navigate', 'book:' + book.id + '#p=1');
      await until('!!document.querySelector("[data-reader-content]")');
      await until(`!!document.querySelector('[data-mark-id="${markId}"]')`);
      await context(`[data-mark-id="${markId}"]`); await until('!!document.querySelector("[data-menu-action=delete]")');
      await click('[data-menu-action=delete]');
      await until(`document.body.textContent.includes(${JSON.stringify(text.feedbackMarkDeleted)})`);
      assert.equal((await evaluate(`window.electronAPI.knowledge.getByWork(${JSON.stringify(book.id)})`)).some(item => item.id === markId), false);
      await shot(prefix + '-mark-undo'); await undo(text);
      await until(`!!document.querySelector('[data-mark-id="${markId}"]')`);
      assert.equal((await evaluate(`window.electronAPI.knowledge.getByWork(${JSON.stringify(book.id)})`)).some(item => item.id === markId), true);
      // Use the existing status endpoint with deliberately missing paths in this profile.
      await navigate('library');
      const originalConfig = await evaluate(`window.electronAPI.settings.get('pdf-editor.engine.v1')`);
      await evaluate(`window.electronAPI.settings.set('pdf-editor.engine.v1',{java:${JSON.stringify(path.join(profile,'missing-java'))},stirlingJar:${JSON.stringify(path.join(profile,'missing-engine.jar'))}})`);
      await evaluate(`window.dispatchEvent(new Event('focus'))`);
      await until(`document.querySelector('[data-readiness]')?.title.includes(${JSON.stringify(text.feedbackPdfUnavailable)})`);
      await shot(prefix + '-engine-missing');
      if (originalConfig) await evaluate(`window.electronAPI.settings.set('pdf-editor.engine.v1',${JSON.stringify(originalConfig)})`);
      else await evaluate(`window.electronAPI.settings.delete('pdf-editor.engine.v1')`);
      await evaluate(`window.dispatchEvent(new Event('focus'))`);
      // Delay old results in the harness, leave renderer sequencing/cancellation untouched.
      installDelayedSearch(); await key('k', ['control']);
      await until('!!document.querySelector("[role=dialog] input")');
      await input('[role=dialog] input', 'older عِلْم'); await key('Enter'); await pause(100);
      await input('[role=dialog] input', 'newer Knowledge'); await key('Enter'); await pause(1400);
      assert.equal(await evaluate('document.body.textContent.includes("STALE_KEY301")'), false);
      await input('[role=dialog] input', ''); await pause(200);
      assert.equal(await evaluate('document.body.textContent.includes("STALE_KEY301")'), false);
      await shot(prefix + '-stale-search'); await key('Escape');
      ipcMain.removeHandler('search:query'); ipcMain.handle('search:query', originalSearch);
      await navigate('notes');
      await until('!!document.querySelector("[data-notes-workspace]") || !!document.querySelector("[data-notes-overview]") || !!document.querySelector("[data-notes-toolbar]")');
      await pause(350); await shot(prefix + '-notes');
      await evaluate(`window.dispatchEvent(new Event('baglib:open-cards'))`);
      await until('!!document.querySelector("[data-saved-cards]")'); await shot(prefix + '-cards-empty');
      const overflow = await evaluate('document.documentElement.scrollWidth > innerWidth + 1');
      assert.equal(overflow, false);
      assert.equal(BrowserWindow.getAllWindows().length, 1);
      results.push({ language, theme, width, trashUndo: true, markUndo: true, staleSearch: true, engineMissing: true, overflow });
      fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    }
    app.quit();
  })().catch(async error => { console.error(error); await shot('failure').catch(() => {}); app.exit(1); });
});
require('../../dist/main/index.js');
