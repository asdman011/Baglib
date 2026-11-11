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
app.on('browser-window-created', (_, win) => {
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
  const input = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const button = text => evaluate(`(()=>{const b=[...document.querySelectorAll('[data-ui-dialog] button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw new Error('Missing button '+${JSON.stringify(text)});b.focus();b.click();})()`);
  const shot = async name => { await pause(120); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const count = () => evaluate('document.querySelectorAll("[data-ui-dialog]").length');
  const results = [];
  const unnamed = [];
  const errors = [];
  const save = () => fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ results, unnamed, errors }, null, 2));
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
    await evaluate('document.querySelector("[data-case]").focus()');
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
    fs.writeFileSync(path.join(evidence, 'inputs.json'), JSON.stringify(files, null, 2));
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
    const cases = ['modal', 'sheet', 'book', 'import', 'search', 'palette', 'providers', 'storage', 'geek', 'candidates', 'diff', 'editions', 'sync', 'ai', 'plugins', 'lock', 'statistics', 'wird', 'save-close', 'export-pdf', 'compare', 'reader-shortcuts'];
    for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) for (const width of [1280, 480]) {
      if (process.env.BAGLIB_A11Y_DEBUG && (language !== 'ar' || theme !== 'light' || width !== 1280)) continue;
      const text = translations[language]; const prefix = `${language}-${theme}-${width}`;
      console.log('CASE', prefix);
      win.setContentSize(width, 900);
      await win.loadFile(path.join(profile, 'fixture.html'), { query: { book: files.find(file => file.lang === language).id } });
      await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(language)});localStorage.setItem('baglib-theme',${JSON.stringify(theme)})`);
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await evaluate(bundle);
      await until('!!document.querySelector("[data-a11y-fixture]") && document.querySelector("[data-typing-editable]")?.textContent.includes("KEY298")');
      assert.equal(await evaluate('document.documentElement.dir'), language === 'ar' ? 'rtl' : 'ltr');
      assert.equal(await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
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
      assert.equal(BrowserWindow.getAllWindows().length, 1);
      save();
    }
    assert.deepEqual(unnamed, [], 'Every icon-only button in the converted panels has an explicit localized name');
    assert.deepEqual(errors, [], 'Renderer errors');
    save(); app.quit();
  })().catch(async error => { console.error(error); save(); await shot('failure').catch(() => {}); app.exit(1); });
});
require('../../dist/main/index.js');
