const { app, ipcMain, dialog, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { translations } = require('../../src/renderer/translations.ts');
const { SHORTCUTS } = require('../../src/renderer/components/actions/shortcuts.ts');
const profile = process.env.BAGLIB_KEY298_DIR;
const evidence = process.env.BAGLIB_KEY298_EVIDENCE;
const files = JSON.parse(fs.readFileSync(path.join(profile, 'inputs.json')));
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
const createdWindows = [];
app.on('browser-window-created', (_, win) => {
  createdWindows.push(win.id);
  if (started) { win.destroy(); throw new Error('Only one Electron window permitted'); }
  started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until = async code => {
    for (let attempt = 0; attempt < 250; attempt++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(100);
    }
    throw new Error('Timed out ' + code + '\n' + await evaluate('document.body.innerText.slice(-2200)'));
  };
  const key = async (keyCode, modifiers = []) => {
    win.show(); win.focus(); win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await pause(20);
  };
  const click = selector => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});e.focus();e.click();})()`);
  const mouse = async (selector, index = 0, shift = false) => {
    const point = await evaluate(`(()=>{const e=document.querySelectorAll(${JSON.stringify(selector)})[${index}];if(!e)throw new Error('Missing native target');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
    win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1, modifiers: shift ? ['shift'] : [] });
    win.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1, modifiers: shift ? ['shift'] : [] });
    await pause(80);
  };
  const input = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const button = text => evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw new Error('Missing button '+${JSON.stringify(text)});b.focus();b.click();})()`);
  const shot = async name => { await pause(120); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const count = () => evaluate('document.querySelectorAll("[data-ui-dialog]").length');
  const results = [];
  const unnamed = [];
  const errors = [];
  const save = () => fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ results, unnamed, errors, createdWindows }, null, 2));
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const setupTop = `window.a11yTop=[...document.querySelectorAll('[data-ui-dialog]')].at(-1);window.a11yFocusables=()=>[...window.a11yTop.querySelectorAll('button,a[href],input,select,textarea,[tabindex],[contenteditable]')].filter(e=>e.tabIndex>=0&&!e.matches(':disabled')&&!e.closest('[hidden],[inert],[aria-hidden="true"]')&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');`;
  const trap = async (name, screenshot = true) => {
    await pause(180);
    const details = await evaluate(`(()=>{${setupTop}const d=window.a11yTop;if(!d)throw new Error('No dialog');return {accessibleName:d.getAttribute('aria-label')||document.getElementById(d.getAttribute('aria-labelledby'))?.textContent,focusables:window.a11yFocusables().length,contains:d.contains(document.activeElement),unnamed:[...d.querySelectorAll('button')].filter(e=>!e.textContent.trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!e.querySelector('img[alt]')).map(e=>e.outerHTML.slice(0,600))};})()`);
    assert.ok(details.accessibleName?.trim(), name + ' accessible name');
    assert.ok(details.contains, name + ' initial focus');
    unnamed.push(...details.unnamed.map(html => ({ name, html })));
    await evaluate('window.a11yFocusables().at(-1)?.focus()');
    await key('Tab');
    assert.equal(await evaluate('document.activeElement===(window.a11yFocusables()[0]||window.a11yTop)'), true, name + ' forward wrap');
    if (screenshot) {
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const ring = await evaluate('(()=>{const e=document.activeElement,s=getComputedStyle(e),probe=document.createElement("span");probe.style.color="var(--color-focus)";document.body.appendChild(probe);const token=getComputedStyle(probe).color;probe.remove();return {visible:e.matches(":focus-visible"),style:s.outlineStyle,width:parseFloat(s.outlineWidth),color:s.outlineColor,token};})()');
      assert.ok(ring.visible && ring.width >= 2 && ring.style !== 'none' && ring.color === ring.token, name + ' focus ring ' + JSON.stringify(ring));
      details.focusRing = ring;
      await shot(name + '-focus');
    }
    await key('Tab', ['shift']);
    assert.equal(await evaluate('document.activeElement===(window.a11yFocusables().at(-1)||window.a11yTop)'), true, name + ' backward wrap');
    for (let i = 0; i < details.focusables + 2; i++) {
      await key('Tab');
      assert.equal(await evaluate('window.a11yTop.contains(document.activeElement)'), true, name + ' Tab containment ' + i);
    }
    for (let i = 0; i < details.focusables + 2; i++) {
      await key('Tab', ['shift']);
      assert.equal(await evaluate('window.a11yTop.contains(document.activeElement)'), true, name + ' reverse containment ' + i);
    }
    await evaluate('(document.querySelector("[data-case]") || document.querySelector("aside button")).focus()');
    assert.equal(await evaluate('window.a11yTop.contains(document.activeElement)'), true, name + ' external focus containment');
    const motion = await evaluate(`(()=>{const d=window.a11yTop;return [d,...d.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);return (s.animationName!=='none'&&s.animationDuration.split(',').some(v=>parseFloat(v)>.001))||s.transitionDuration.split(',').some(v=>parseFloat(v)>.001);}).map(e=>e.tagName+':'+e.className);})()`);
    assert.deepEqual(motion, [], name + ' reduced motion');
    results.push({ name, ...details, trap: true, reducedMotion: true }); save();
  };
  const close = async (name, opener, expectedCount = 0) => {
    await key('Escape');
    await until(`document.querySelectorAll('[data-ui-dialog]').length===${expectedCount}`);
    assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(opener)})`), true, name + ' opener return');
    results.at(-1).escape = true; results.at(-1).focusReturn = true; save();
  };
  (async () => {
    win.setMinimumSize(320, 400); win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate("window.electronAPI.settings.set('onboarding.v1',{seen:true})");
    const { DigitalImportPipelineService } = require('../../src/main/services/digital/digital-import-pipeline.service.ts');
    const pipeline = new DigitalImportPipelineService(undefined, undefined, undefined, undefined, undefined, async () => ({ coverUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1cAAAAASUVORK5CYII=' }));
    for (const file of files) {
      const result = await pipeline.importFile({ filePath: file.filename, duplicateAction: 'import_anyway', customTitle: file.title });
      assert.equal(result.success, true, JSON.stringify(result)); file.id = result.workId;
    }
    // Keep the two imported work identities stable. Duplicate imports can enrich/merge work records.
    await evaluate(`window.electronAPI.addBook(${JSON.stringify({id:'key298-trash',title:'KEY298 Trash',author:'KEY298',workType:'book',bookType:'digital',digitalFormat:'PDF',filePath:files[1].filename,coverImage:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1cAAAAASUVORK5CYII='})})`);
    await evaluate("window.electronAPI.deleteBook('key298-trash')");
    const persisted = await evaluate('window.electronAPI.getAllBooks()');
    assert.ok(persisted.length >= 4, 'four production books for range selection');
    for (const file of files) {
      const book = persisted.find(book => book.id === file.id);
      assert.ok(book, 'real imported work remains active');
      file.title = book.title;
    }
    fs.writeFileSync(path.join(evidence, 'inputs.json'), JSON.stringify(files, null, 2));
    for (const file of files) {
      const extracted = await evaluate(`window.electronAPI.extractPdfText(${JSON.stringify(file.filename)})`);
      file.pageText = extracted?.text?.slice(0, 2500) || '';
      assert.ok(file.pageText.length > 20, file.lang + ' real extracted text');
    }
    const pathway = await evaluate("window.electronAPI.pathways.save({name:'KEY298',description:'',kind:'curriculum'})");
    await evaluate("window.electronAPI.categories.create({nameAr:'KEY298',nameEn:'KEY298'})");
    await evaluate("window.electronAPI.tags.create('KEY298')");
    await evaluate("window.electronAPI.tags.create('KEY298-second')");
    const styles = await evaluate('[...document.querySelectorAll("link[rel=stylesheet]")].map(e=>e.href)');
    assert.ok(styles.length, 'production stylesheet');
    const css = (await Promise.all(styles.map(async href => { const response = await fetch(href); assert.ok(response.ok, href); return response.text(); }))).join('\n');
    fs.writeFileSync(path.join(profile, 'fixture.html'), '<!doctype html><html><head><meta charset="utf-8"><base href="http://localhost:3000/"><style>' + css + '</style></head><body style="height:100vh;margin:0"><div id="root" style="height:100%"></div></body></html>');
    const replace = (channel, handler) => { assert.ok(ipcMain._invokeHandlers.has(channel), channel); ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); };
    // Deterministic network boundary for the editions search. No remote provider is contacted.
    replace('enrichment:find-online-editions', async () => ({ candidates: [] }));
    // Controlled storage groups exercise confirmation-only flows. No repair or deletion is run.
    const items = files.map(file => ({ workId: file.id, title: file.title, filePath: file.filename, format: 'PDF', status: 'available', fileSizeBytes: file.bytes, isPrimary: file.lang === 'ar', isDuplicate: true }));
    replace('storage:get-health-summary', async () => ({ totalFiles: 2, availableFiles: 2, missingFiles: 0, duplicateFiles: 1, items }));
    replace('storage:get-analytics', async () => ({ totalSizeBytes: files.reduce((sum, file) => sum + file.bytes, 0), duplicateGroups: [{ hash: 'keyboard-fixture', count: 2, fileSizeBytes: files[0].bytes, wastedBytes: files[1].bytes, items }] }));
    replace('storage:batch-auto-rebind', async () => ({ scannedFilesCount: 2, resolvedCount: 0, unresolvedCount: 0, matches: [] }));
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [profile] });
    win.webContents.debugger.attach('1.3');
    const bundle = fs.readFileSync(path.join(profile, 'fixture.js'), 'utf8');
    const cases = ['lend', 'return', 'audit', 'online', 'trash', 'dictionary', 'export-notes', 'ocr', 'accessibility', 'reflow', 'paragraph', 'rsvp', 'pairing', 'clipper', 'opds', 'exam', 'explain', 'assistant', 'ayah', 'similar', 'tool', 'modal', 'sheet', 'book', 'import', 'search', 'palette', 'providers', 'storage', 'geek', 'candidates', 'diff', 'editions', 'sync', 'ai', 'plugins', 'lock', 'statistics', 'wird', 'save-close', 'export-pdf', 'compare', 'reader-shortcuts'];
    for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) for (const width of [1280, 480]) {
      if (process.env.BAGLIB_A11Y_DEBUG && (language !== 'ar' || theme !== 'light' || width !== 1280)) continue;
      const text = translations[language]; const prefix = `${language}-${theme}-${width}`;
      console.log('CASE', prefix);
      win.setContentSize(width, 900);
      await win.loadFile(path.join(profile, 'fixture.html'), { query: { book: files.find(file => file.lang === language).id, pathway: pathway.id } });
      await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(language)});localStorage.setItem('baglib-theme',${JSON.stringify(theme)})`);
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await evaluate('window.a11yPageText=' + JSON.stringify(files.find(file => file.lang === language).pageText));
      await evaluate(bundle);
      await until('!!document.querySelector("[data-a11y-fixture]") && document.querySelector("[data-typing-editable]")?.textContent.includes("KEY298")');
      assert.equal(await evaluate('document.documentElement.dir'), language === 'ar' ? 'rtl' : 'ltr');
      assert.equal(await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
      if (!process.env.BAGLIB_A11Y_TAIL) {
      for (const id of cases) {
        console.log('DIALOG', prefix, id);
        await click(`[data-case="${id}"]`); await until('!!document.querySelector("[data-ui-dialog]")');
        await trap(prefix + '-' + id);
        await close(prefix + '-' + id, `[data-case="${id}"]`);
      }
      // Nested dirty prompts must close only their own layer and restore editing focus.
      for (const id of ['book', 'providers', 'sync']) {
        await click(`[data-case="${id}"]`); await until('!!document.querySelector("[data-ui-dialog]")'); await pause(300);
        let selector;
        if (id === 'book') selector = '[data-ui-dialog] input[placeholder]';
        else if (id === 'providers') selector = '[data-source-urls] input';
        else selector = '[data-ui-dialog] input[type=text]';
        const previous = await evaluate(`document.querySelector(${JSON.stringify(selector)})?.value`);
        assert.equal(typeof previous, 'string', id + ' editable draft');
        await input(selector, previous + ' KEY298');
        await evaluate('window.a11yDraft=document.activeElement');
        await key('Escape'); await until('document.querySelectorAll("[data-ui-dialog]").length===2');
        await trap(prefix + '-' + id + '-discard');
        await key('Escape'); await until('document.querySelectorAll("[data-ui-dialog]").length===1');
        assert.equal(await evaluate('document.activeElement===window.a11yDraft'), true, id + ' nested return');
        await key('Escape'); await until('document.querySelectorAll("[data-ui-dialog]").length===2');
        await button(text.discardAndClose); await until('!document.querySelector("[data-ui-dialog]")');
        assert.equal(await evaluate(`document.activeElement===document.querySelector('[data-case="${id}"]')`), true, id + ' full return');
        results.at(-1).escape = true; results.at(-1).focusReturn = true; save();
      }
      await click('[data-case="storage"]'); await until('!!document.querySelector("[data-ui-dialog]")');
      await button(text.storageAutoRebindBtn); await until('document.querySelectorAll("[data-ui-dialog]").length===2');
      await evaluate('window.a11yNestedOpener=[...document.querySelectorAll("[data-ui-dialog] button")].find(e=>e.textContent.trim()==='+JSON.stringify(text.storageAutoRebindBtn)+')');
      await trap(prefix + '-storage-results'); await key('Escape'); await until('document.querySelectorAll("[data-ui-dialog]").length===1');
      assert.equal(await evaluate('document.activeElement===window.a11yNestedOpener'), true); results.at(-1).escape = true; results.at(-1).focusReturn = true;
      await button(text.storageTabDuplicates + ' (1)');
      await button(text.storageActionPrune); await until('document.querySelectorAll("[data-ui-dialog]").length===2');
      await trap(prefix + '-storage-prune'); await key('Escape'); await until('document.querySelectorAll("[data-ui-dialog]").length===1');
      assert.equal(await evaluate('document.activeElement.textContent.trim()==='+JSON.stringify(text.storageActionPrune)), true); results.at(-1).escape = true; results.at(-1).focusReturn = true;
      await key('Escape'); await until('!document.querySelector("[data-ui-dialog]")');
      }
      await click('[data-case="trash"]');await until('!!document.querySelector("[data-ui-dialog]")');
      for (const label of ['emptyTrash', 'permanentlyDelete', 'deletePermanentlyBtn']) {
        if (label === 'deletePermanentlyBtn') await button(text.selectAllTrash);
        await evaluate(`(()=>{const b=[...document.querySelectorAll('[data-ui-dialog] button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(text[label])}||e.textContent.trim()===${JSON.stringify(text[label])});window.a11ySurfaceOpener=b;b.focus();b.click();})()`);
        await until('document.querySelectorAll("[data-ui-dialog]").length===2');await trap(prefix+'-trash-'+label);
        await key('Escape');await until('document.querySelectorAll("[data-ui-dialog]").length===1');
        assert.equal(await evaluate('document.activeElement===window.a11ySurfaceOpener'),true,label+' return');results.at(-1).escape=true;results.at(-1).focusReturn=true;save();
      }
      await key('Escape');await until('!document.querySelector("[data-ui-dialog]")');
      await click('[data-case="assistant"]');await until('!!document.querySelector("[data-study-assistant]")');
      await click('[data-assistant-explain-back]');await until('document.querySelectorAll("[data-ui-dialog]").length===2');
      await trap(prefix+'-assistant-explain-back');await key('Escape');await until('document.querySelectorAll("[data-ui-dialog]").length===1');
      assert.equal(await evaluate('document.activeElement===document.querySelector("[data-assistant-explain-back]")'),true,'assistant nested return');results.at(-1).escape=true;results.at(-1).focusReturn=true;save();
      await key('Escape');await until('!document.querySelector("[data-ui-dialog]")');
      // Production surfaces open each converted nested panel through its own control.
      for (const [surface, labels] of [
        ['bulk', ['bulkAssignCategory', 'bulkAddTagsBtn', 'bulkChangeStatus', 'bulkDeleteBtn', 'bulkDownloadMetadata']],
        ['today', ['todayRhythmSettings']], ['toc', ['pdfTocImportTitle']],
        ['categories', ['addCategory', 'editCategory', 'deleteCategory']],
        ['tools', ['pdfWatchedFolderAdd', 'pdfPipelineNew']],
      ]) {
        await click(`[data-case="${surface}"]`); await pause(200);
        for (const label of labels) {
          const opener = await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(text[label])}||e.textContent.trim()===${JSON.stringify(text[label])});if(!b)throw new Error('Missing launch '+${JSON.stringify(label)});window.a11ySurfaceOpener=b;b.focus();b.click();return true;})()`);
          assert.ok(opener); await until('!!document.querySelector("[data-ui-dialog]")');
          await trap(prefix + '-' + surface + '-' + label);
          await key('Escape'); await until('!document.querySelector("[data-ui-dialog]")');
          assert.equal(await evaluate('document.activeElement===window.a11ySurfaceOpener'), true, label + ' return');
          results.at(-1).escape = true; results.at(-1).focusReturn = true; save();
        }
      }
      await click('[data-case="categories"]');
      await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.includes(${JSON.stringify(text.tagsTab)}));b.focus();b.click();})()`);
      for (const label of ['renameTag', 'mergeTags', 'deleteTag']) {
        await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(text[label])});if(!b)throw new Error('Missing '+${JSON.stringify(label)});window.a11ySurfaceOpener=b;b.focus();b.click();})()`);
        await until('!!document.querySelector("[data-ui-dialog]")');await trap(prefix+'-tags-'+label);
        await key('Escape');await until('!document.querySelector("[data-ui-dialog]")');
        assert.equal(await evaluate('document.activeElement===window.a11ySurfaceOpener'),true,label+' return');results.at(-1).escape=true;results.at(-1).focusReturn=true;save();
      }
      await click('[data-case="graph"]');await click('[data-graph-button]');await until('!!document.querySelector("[data-ui-dialog]")');
      await trap(prefix+'-graph');await close(prefix+'-graph','[data-graph-button]');
      await click('[data-case="library"]');
      for (const mode of ['grid', 'list']) {
        const label = text[mode === 'grid' ? 'viewGrid' : 'viewList'];
        await evaluate(`(()=>{const b=[...document.querySelectorAll('[data-view-mode-toggle] button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)});b.focus();b.click();})()`);
        const selector = mode === 'grid' ? '[data-library-book-card] input[type=checkbox]' : 'tbody input[type=checkbox]';
        await until(`document.querySelectorAll(${JSON.stringify(selector)}).length>=4`);
        await evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).forEach(e=>{if(e.checked)e.click()})`);
        await mouse(selector, 0); await mouse(selector, 3, true);
        assert.equal(await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>e.checked).length`), 4, mode + ' Shift range');
        const labels = await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(e=>e.getAttribute('aria-label'))`);
        const libraryBooks = await evaluate('window.electronAPI.getAllBooks()');
        assert.ok(labels.every(label => libraryBooks.some(book => label === text.selectBook.replace('{title}', book.title) || label === text.deselectBook.replace('{title}', book.title))), mode + ' per-book labels ' + JSON.stringify(labels));
        await evaluate(`document.querySelectorAll(${JSON.stringify(selector)})[0].focus()`); await key('Space');
        assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(selector)})[0].checked`), false, mode + ' Space toggle');
        await shot(prefix+'-'+mode+'-selection-focus');
        results.push({name:prefix+'-'+mode+'-selection',shiftRange:true,spaceToggle:true,localizedLabels:true});save();
      }
      await click('[data-case="modal"]'); await key('Escape'); await until('!document.querySelector("[data-ui-dialog]")');
      // Help opens in every scope through the actual production registry handler.
      for (const selector of ['[data-typing-input]', '[data-typing-textarea]', '[data-typing-editable]']) {
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'?',shiftKey:true,bubbles:true,cancelable:true}))`);
        await pause(30); assert.equal(await count(), 0, selector + ' suppress help');
      }
      await evaluate('document.querySelector("[data-case=modal]").focus();window.dispatchEvent(new KeyboardEvent("keydown",{key:"?",shiftKey:true,bubbles:true,cancelable:true}))');
      await until('!!document.querySelector("[data-shortcut-registry]")');
      const registered = await evaluate('[...document.querySelectorAll("[data-shortcut-id]")].map(e=>e.dataset.shortcutId)');
      assert.deepEqual([...new Set(registered)].sort(), SHORTCUTS.map(shortcut => shortcut.id).sort());
      await trap(prefix + '-global-shortcuts'); await close(prefix + '-global-shortcuts', '[data-case=modal]');
      // Exercise the study-draft editor from a real PDF selection in the whole app.
      const file = files.find(file => file.lang === language);
      await win.loadURL('http://localhost:3000');
      await until('!!window.electronAPI && !!document.querySelector("footer")');
      await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(language)});localStorage.setItem('baglib-theme',${JSON.stringify(theme)})`);
      await win.loadURL('http://localhost:3000');await until('!!document.querySelector("footer")');
      await evaluate(`document.querySelector('aside button[aria-label='+${JSON.stringify(JSON.stringify(text.navLibrary))}+']').click()`);
      await until('!!document.querySelector("[data-view-mode-toggle]")');
      await evaluate(`(()=>{const b=[...document.querySelectorAll('[data-view-mode-toggle] button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(text.viewGrid)});b.click();})()`);
      await until(`[...document.querySelectorAll('[data-library-book-card] h3')].some(e=>e.textContent.trim()===${JSON.stringify(file.title)})`);
      await evaluate(`(()=>{const title=[...document.querySelectorAll('[data-library-book-card] h3')].find(e=>e.textContent.trim()===${JSON.stringify(file.title)});title.closest('[data-library-book-card]').querySelector('[data-card-read-button]').click();})()`);
      await until('!!document.querySelector("[data-reader-shared-header]") && !!document.querySelector("[data-reader-go-to]")');
      // Claude: the smallest English text-layer PDF opens on an image-only cover, so step forward until a page has text.
      for (let page = 2; page <= 6; page++) {
        await pause(1200);
        if (await evaluate('[...document.querySelectorAll(".textLayer span")].some(e=>e.textContent.trim().length>3)')) break;
        await evaluate(`(()=>{const input=document.querySelector('[data-reader-go-to]');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'${page}');input.dispatchEvent(new Event('input',{bubbles:true}));input.form.requestSubmit();})()`);
      }
      await until('[...document.querySelectorAll(".textLayer span")].some(e=>e.textContent.trim().length>3)');
      await evaluate(`(()=>{const spans=[...document.querySelectorAll('.textLayer span')].filter(e=>e.firstChild?.nodeType===3&&e.textContent.trim().length>3);const first=spans[0],last=spans[Math.min(2,spans.length-1)];const range=document.createRange();range.setStart(first.firstChild,0);range.setEnd(last.firstChild,last.firstChild.textContent.length);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);last.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);
      await until(`[...document.querySelectorAll('button')].some(e=>e.textContent.trim()===${JSON.stringify(text.readerStudyPractice)})`);
      await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text.readerStudyPractice)});window.a11yReaderOpener=b;b.focus();b.click();})()`);
      await until('!!document.querySelector("[data-reader-study-editor]")');
      await trap(prefix+'-reader-study-draft');await key('Escape');await until('!document.querySelector("[data-reader-study-editor]")');
      assert.equal(await evaluate('document.activeElement===window.a11yReaderOpener'),true,'reader draft opener return');results.at(-1).escape=true;results.at(-1).focusReturn=true;save();
      assert.equal(await evaluate('document.querySelectorAll("main").length'),1,'one main landmark in whole app');
      const workspaceUnnamed = await evaluate(`[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.innerText.trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!e.querySelector('img[alt]')).map(e=>e.outerHTML.slice(0,600))`);
      unnamed.push(...workspaceUnnamed.map(html => ({name:prefix+'-whole-reader',html})));
      assert.deepEqual(workspaceUnnamed, [], 'whole-reader icon names');

      assert.equal(BrowserWindow.getAllWindows().length, 1);
      save();
    }
    assert.equal(createdWindows.length, 1, 'one Electron window throughout the run');
    assert.deepEqual(unnamed, [], 'Every icon-only button in the converted panels has an explicit localized name');
    assert.deepEqual(errors, [], 'Renderer errors');
    save(); app.quit();
  })().catch(async error => { console.error(error); save(); await shot('failure').catch(() => {}); app.exit(1); });
});
require('../../dist/main/index.js');
