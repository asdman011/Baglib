const { app, dialog, ipcMain, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_COMPARE_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
const labels = { ar: { library: 'المكتبة', read: 'قراءة' }, en: { library: 'Library', read: 'Read' } };
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  // KEY-317: throwaway profiles would show the KEY-307 first-run guide, which takes focus.
  owner.webContents.on('did-finish-load', () => { owner.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until = async (code, tries = 200) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(300); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(500); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const key = value => evaluate(`(document.activeElement||document).dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(value)},bubbles:true,cancelable:true}))`);
  const load = async language => { owner.setContentSize(1280, 900); await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000'); await until('!!window.electronAPI && !!document.querySelector("footer")'); await key('Escape'); await pause(1200); };
  const pick = (selector, value) => evaluate(`(()=>{const s=document.querySelector('${selector}');const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,'${value}');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const run = async () => { await evaluate("document.querySelector('[data-compare-run]').click()"); await until("!!document.querySelector('[data-compare-summary], [data-compare-error]')", 100); };
  (async () => {
    const results = {};
    await load('en');
    await evaluate(`window.electronAPI.addBook({id:'edition-a',title:'رسالة — Edition A',author:'',workType:'book',bookType:'digital',digitalFormat:'PDF',filePath:${JSON.stringify(path.join(directory, 'a.pdf'))}})`);
    await evaluate(`window.electronAPI.addBook({id:'edition-b',title:'رسالة — Edition B',author:'',workType:'book',bookType:'digital',digitalFormat:'PDF',filePath:${JSON.stringify(path.join(directory, 'b.pdf'))}})`);
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      await evaluate(`[...document.querySelectorAll('[data-nav-item]')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(labels[language].library)}).click()`);
      await until(`[...document.querySelectorAll('button')].some(b=>b.title===${JSON.stringify(labels[language].read)}||b.textContent.trim()===${JSON.stringify(labels[language].read)})`);
      await evaluate(`(()=>{const read=${JSON.stringify(labels[language].read)};const isRead=b=>b.title===read||b.textContent.trim()===read;const title=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.includes('Edition A'));let node=title;while(node&&![...node.querySelectorAll('button')].some(isRead))node=node.parentElement;[...node.querySelectorAll('button')].find(isRead).click();})()`);
      // At 1280 px the narrow header keeps Compare in its "more" menu; focus must come back to that button.
      await until("(!!document.querySelector('[data-compare-open]') || !!document.querySelector('[data-pdf-header-more]')) && document.querySelectorAll('.textLayer span').length > 0", 100);
      await evaluate(`(async()=>{const direct=document.querySelector('[data-compare-open]');if(direct){window.__compareOpener=direct;direct.focus();direct.click();return;}const label=${JSON.stringify(language === 'ar' ? 'مقارنة طبعتين' : 'Compare two editions')};for(const more of document.querySelectorAll('[data-pdf-header-more]')){window.__compareOpener=more;more.focus();more.click();for(let i=0;i<20;i++){const item=[...document.querySelectorAll('[role=menuitem]')].find(b=>b.textContent.trim()===label);if(item){item.click();return;}await new Promise(r=>setTimeout(r,100));}more.click();}throw new Error('no Compare item');})()`);
      await until("!!document.querySelector('[data-pdf-compare]')");
      owner.webContents.focus();
      for (const modifiers of [[], ['shift']]) for (let index = 0; index < 40; index++) {
        owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab', modifiers });
        owner.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab', modifiers });
        await pause(15);
        assert.equal(await evaluate("!!document.activeElement?.closest('[data-pdf-compare]')"), true);
      }
      await evaluate("document.querySelector('[data-pdf-compare] header button').focus()");
      result.choices = await evaluate("[...document.querySelectorAll('[data-compare-other] option')].map(o=>o.value).filter(Boolean)");
      await pick('[data-compare-other]', 'edition-b');
      // Tashkeel ignored (the default): the diacritics-only change on page 2 is not counted.
      await run();
      result.summary = await evaluate("document.querySelector('[data-compare-summary]').textContent");
      result.hunks = await evaluate("[...document.querySelectorAll('[data-compare-hunk]')].map(h=>[h.querySelector('[data-compare-removed]')?.textContent||'',h.querySelector('[data-compare-added]')?.textContent||''])");
      result.position = await evaluate("document.querySelector('[data-compare-position]').textContent");
      await evaluate("document.querySelector('[data-compare-next]').click()"); await pause(200);
      result.afterNext = await evaluate("document.querySelector('[data-compare-position]').textContent");
      await key('p'); await pause(200);
      result.afterKeyPrevious = await evaluate("document.querySelector('[data-compare-position]').textContent");
      await shot(`compare-${language}-1280`);
      // With tashkeel counted, page 2's vowelled words become a difference too.
      await evaluate("document.querySelector('[data-compare-diacritics]').click()");
      assert.equal(await evaluate("!!document.querySelector('[data-compare-summary]')"), false);
      await run();
      result.withDiacritics = await evaluate("document.querySelectorAll('[data-compare-hunk]').length");
      // Go to page closes nothing but moves the reader to that page of this edition.
      await evaluate("[...document.querySelectorAll('[data-compare-hunk]')].find(h=>h.textContent.includes('المصنف')).querySelector('[data-compare-go]').click()"); await pause(800);
      await evaluate("document.querySelector('[data-pdf-compare] header button').click()"); await pause(500);
      result.readerPage = await evaluate("document.querySelector('[data-reader-page]')?.dataset.readerPage"); // KEY-309 replaced the numeric page input
      result.focusRestored = await evaluate("document.activeElement===window.__compareOpener");
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.deepEqual(result.choices, ['edition-b']);
      assert.deepEqual(result.hunks, [['', 'واجبة'], ['الشيخ', 'المصنف'], ['action.', 'deeds.']]);
      assert.equal(result.position, '1 / 3'); assert.equal(result.afterNext, '2 / 3'); assert.equal(result.afterKeyPrevious, '1 / 3');
      assert.equal(result.withDiacritics, 4, 'the vowelled words on page 2 count only when tashkeel is compared');
      assert.equal(result.readerPage, '2');
      assert.equal(result.focusRestored, true);
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught|error/iu.test(line) && !/Electron Security Warning/u.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true }));
    if (process.env.BAGLIB_SAVE_LIFECYCLE_CHECK) {
      const original = ipcMain._invokeHandlers.get('material-save:choose-folder');
      const policy = ipcMain._invokeHandlers.get('material-save:policy');
      let completed;
      let release;
      let quitting = false;
      const originalPicker = dialog.showOpenDialog;
      dialog.showOpenDialog = () => new Promise(resolve => { release = resolve; });
      ipcMain.removeHandler('material-save:choose-folder');
      ipcMain.handle('material-save:choose-folder', async (event, language) => { completed = await original(event, language); return completed; });
      await evaluate("void window.electronAPI.materialSave.chooseFolder('en'); true");
      for (let index = 0; index < 100 && !release; index++) await pause(20);
      assert.equal(typeof release, 'function', 'folder request admitted');
      const probePath = path.join(directory, 'shutdown-probe.html');
      fs.writeFileSync(probePath, '<html><body></body></html>');
      const probe = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
      await probe.loadFile(probePath);
      app.once('will-quit', () => {
        quitting = true;
        try {
          assert.equal(completed?.ok, true, 'admitted folder change completed before database shutdown');
          assert.equal(completed.data, path.join(directory, 'emergency-fixture'));
          dialog.showOpenDialog = originalPicker;
          fs.writeFileSync(path.join(directory, 'lifecycle.json'), JSON.stringify({ drained: true, lateRequestRejected: true }));
        } catch (error) { fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack)); app.exit(1); }
      });
      app.quit();
      await pause(80);
      assert.equal(quitting, false, 'quit waits for pending settings write');
      assert.deepEqual(await policy({ sender: probe.webContents, senderFrame: probe.webContents.mainFrame }), { ok: false, error: 'busy' });
      release({ canceled: false, filePaths: [path.join(directory, 'emergency-fixture')] });
      return;
    }
    app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
