require('tsx/cjs');
const { translations } = require('../../src/renderer/translations.ts');
const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = process.env.BAGLIB_ADVANCED_PROFILE;
const evidence = process.env.BAGLIB_ADVANCED_EVIDENCE;
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
let saveMode = 'save';
let saveIndex = 0;
const saved = [];
dialog.showSaveDialog = async (_owner, options) => {
  if (saveMode === 'cancel') return { canceled: true };
  const filePath = path.join(saveMode === 'fail' ? path.join(profile, 'missing') : evidence, (++saveIndex) + '-' + options.defaultPath);
  saved.push({ filePath, title: options.title });
  return { canceled: false, filePath };
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let i = 0; i < 200; i++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(150);
    }
    throw new Error('Timed out ' + code);
  };
  const click = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
  const shot = async name => { await pause(500); await until('!document.querySelector("[data-splash-brand]")'); await pause(250); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const errors = [];
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3 && !message.includes('favicon')) errors.push(message); });
  (async () => {
    win.setMinimumSize(320, 400);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
    const files = ['ar', 'en'].map(lang => manifest.files.find(file => file.kind === 'pdf' && file.lang === lang && file.path.includes('/text-layer/')));
    assert.ok(files.every(Boolean));
    const imported = await evaluate('window.electronAPI.importDigitalFiles(' + JSON.stringify(files.map(file => ({ filePath: path.resolve('tests/real-files', file.path), duplicateAction: 'import_anyway' }))) + ',"advanced-live")');
    assert.equal(imported.successfulImports, 2);
    const books = await evaluate('window.electronAPI.getAllBooks()');
    const arabic = 'عِلْمٌ، "Arabic"\nEnglish';
    // Real imports are retained and a canonical mixed-script title exercises exact export text.
    await evaluate('window.electronAPI.updateBook(' + JSON.stringify({ ...books[0], title: arabic }) + ')');
    const results = [];
    for (const lang of ['ar', 'en']) for (const theme of ['light', 'dark']) {
      await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(lang) + ');localStorage.setItem("baglib-theme",' + JSON.stringify(theme) + ')');
      await win.loadURL('http://localhost:3000');
      await until('!!document.querySelector("[data-nav-item=settings]") && !document.querySelector("[data-splash-brand]")');
      await click('[data-nav-item=settings]');
      await until('!!document.querySelector("[data-settings-entry=advanced]")');
      await evaluate('document.querySelector("[data-settings-entry=advanced]").closest("details").open=true');
      await click('[data-settings-entry=advanced]');
      await until('!!document.querySelector("[data-advanced-settings]")');
      for (const width of [1280, 480]) {
        win.setContentSize(width, 900);
        await pause(250);
        assert.equal(await evaluate('document.documentElement.dir'), lang === 'ar' ? 'rtl' : 'ltr');
        await shot(lang + '-' + theme + '-' + width + '-tools');
        for (const format of ['json', 'csv']) {
          await click('[data-catalog-export=' + format + ']');
          await until('!document.querySelector("[data-catalog-export=json]").disabled');
          const chosen = saved.at(-1);
          assert.equal(chosen.title, translations[lang].advancedExport);
          const text = fs.readFileSync(chosen.filePath, 'utf8');
          assert.ok(text.includes(arabic.split('\n')[0].replaceAll('"','""')) || format === 'json');
          if (format === 'json') {
            const catalog = JSON.parse(text);
            assert.equal(catalog.tables.work.find(row => row.id === books[0].id).title, arabic);
            assert.ok(catalog.tables.edition.length >= 2 && catalog.tables.source.length >= 2);
            for (const key of ['tag', 'category', 'work_tag', 'work_author']) assert.ok(Array.isArray(catalog.tables[key]));
          } else assert.deepEqual([...fs.readFileSync(chosen.filePath).subarray(0, 3)], [239,187,191]);
        }
        await evaluate('window.__advancedProgress=[];void(window.__advancedUnsubscribe=window.electronAPI.advanced.onRebuildProgress(p=>window.__advancedProgress.push(p)))');
        await click('[data-search-rebuild]');
        await until('!document.querySelector("[data-search-rebuild]").disabled');
        assert.deepEqual(await evaluate('window.__advancedProgress'), [{ completed:0,total:1 },{ completed:1,total:1 }]);
        await evaluate('window.__advancedUnsubscribe()');
        assert.ok(await evaluate('document.body.textContent.includes(' + JSON.stringify(translations[lang].advancedRebuilt) + ')'));
        await click('[data-database-health]');
        await until('!!document.querySelector("[data-database-health-result]") && !document.querySelector("[data-database-health]").disabled');
        const health = await evaluate('window.electronAPI.advanced.health()');
        assert.deepEqual(health.integrity, ['ok']);
        assert.equal(health.sizeBytes, health.pageCount * health.pageSize);
        assert.equal(health.rows.find(row => row.table === 'work').count, books.length);
        assert.equal(await evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'), false);
        assert.equal(await evaluate('document.querySelector("[data-advanced-settings]").scrollWidth > document.querySelector("[data-advanced-settings]").clientWidth'), false);
        await shot(lang + '-' + theme + '-' + width + '-health');
        results.push({ lang, theme, width, exports:2, rebuild:true, integrity:'ok' });
      }
      saveMode = 'cancel';
      const count = saved.length;
      await click('[data-catalog-export=json]');
      await until('!document.querySelector("[data-catalog-export=json]").disabled');
      assert.equal(saved.length, count);
      saveMode = 'fail';
      await click('[data-catalog-export=csv]');
      await until('!document.querySelector("[data-catalog-export=json]").disabled');
      assert.ok(await evaluate('document.body.textContent.includes(' + JSON.stringify(translations[lang].studyActionFailed) + ')'));
      saveMode = 'save';
    }
    assert.equal((await evaluate('window.electronAPI.getAllBooks()')).length, books.length);
    assert.equal(require('electron').BrowserWindow.getAllWindows().filter(window => window.isVisible()).length, 1);
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ results, errors }, null, 2));
    assert.deepEqual(errors, []);
    console.log('PASS Advanced settings', results.length);
    app.quit();
  })().catch(async error => {
    console.error(error);
    fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error.stack || error));
    try { await shot('failure'); } finally { app.exit(1); }
  });
});
require('../../dist/main/index.js');
