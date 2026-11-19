// KEY-395 live run (see run.mjs). Real PDFs from tests/real-files, ar and en UI.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_REV_PROFILE;
const evidence = process.env.BAGLIB_REV_EVIDENCE;
assert.ok(profile && evidence, 'BAGLIB_REV_PROFILE and BAGLIB_REV_EVIDENCE are required');

app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const hardTimeout = setTimeout(() => {
  console.error('KEY-395 live harness timed out');
  app.exit(1);
}, 120_000);

const pickFirstPdf = (dir) => {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = pickFirstPdf(full);
      if (found) return found;
    } else if (entry.name.toLowerCase().endsWith('.pdf') && !dir.includes('scanned-image-only')) {
      return full;
    }
  }
  return null;
};

let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async (code, tries = 250) => {
    for (let i = 0; i < tries; i++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(150);
    }
    throw new Error('Timed out ' + code);
  };
  const shot = async name => { await pause(300); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };

  (async () => {
    const pdfAr = pickFirstPdf(path.resolve('tests/real-files/pdf/ar'));
    const pdfEn = pickFirstPdf(path.resolve('tests/real-files/pdf/en'));
    assert.ok(pdfAr && pdfEn, 'Real Arabic and English PDFs must exist');

    await until("!!window.electronAPI?.settings && !!document.querySelector('[data-nav-item]')");

    for (const lang of ['ar', 'en']) {
      await evaluate(`(async () => {
        window.__baglibDisableTabsPersist = true;
        localStorage.setItem('baglib-lang', ${JSON.stringify(lang)});
        await window.electronAPI.settings.set('workspace.tabs.v1', null);
        await window.electronAPI.settings.set('revision.savedSearches.v1', []);
      })()`);
      win.reload();
      await until("!!window.electronAPI?.settings && !!document.querySelector('[data-nav-item]')");

      const pdfPath = lang === 'ar' ? pdfAr : pdfEn;
      await evaluate(`(async () => {
        await window.electronAPI.importDigitalFiles([{ filePath: ${JSON.stringify(pdfPath)}, duplicateAction: 'import_anyway' }], 'rev-live');
        const books = await window.electronAPI.getAllBooks();
        const workId = books[0]?.workId || books[0]?.id;
        await window.electronAPI.knowledgeCards.save({
          front: ${JSON.stringify(lang === 'ar' ? 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ' : 'Actions are by intentions')},
          back: 'Bukhari 1',
          sourceKind: 'hadith',
          sourceRef: 'sunnah:Bukhari:1:1',
          sourceLabel: 'Bukhari 1',
        });
        await window.electronAPI.knowledgeCards.save({
          front: ${JSON.stringify(lang === 'ar' ? 'مسألة أصولية من الكتاب' : 'Book principle card')},
          back: 'Page 1',
          sourceKind: 'book',
          sourceRef: 'book:' + workId + '#p=1',
          sourceLabel: 'Book p. 1',
          workId,
        });
      })()`);

      // Navigate to Notes -> Cards/Revision -> Revision Browser subtab
      await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
      await until("!!document.querySelector('button[data-notes-tab=\"cards\"]')");
      await evaluate(`document.querySelector('button[data-notes-tab="cards"]')?.click()`);
      await until("!!document.querySelector('[data-revision-subtab=\"browser\"]')");
      await evaluate(`document.querySelector('[data-revision-subtab="browser"]')?.click()`);
      await until("!!document.querySelector('[data-revision-browser]') && document.querySelectorAll('[data-revision-row]').length >= 2");

      await shot(`01-revision-browser-${lang}`);

      // Filter by source type: sunnah
      const beforeCount = await evaluate(`document.querySelectorAll('[data-revision-row]').length`);
      await evaluate(`(() => {
        const sel = document.querySelector('[data-revision-source]');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, 'sunnah');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await until(`document.querySelectorAll('[data-revision-row]').length > 0 && document.querySelectorAll('[data-revision-row]').length < ${beforeCount}`);

      // Save search in settings
      await evaluate(`(() => {
        const input = document.querySelector('[data-revision-save-search-name]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Sunnah Filter');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await pause(100);
      await evaluate(`document.querySelector('[data-revision-save-search]')?.click()`);
      await until("document.querySelectorAll('[data-revision-saved-search]').length >= 1");
      await shot(`02-revision-browser-filtered-${lang}`);

      const saved = await evaluate(`window.electronAPI.settings.get('revision.savedSearches.v1')`);
      assert.ok(Array.isArray(saved) && saved.length >= 1, `${lang}: saved search persisted in settings`);
    }

    assert.equal(errors.length, 0, 'Renderer errors: ' + errors.join('; '));
    clearTimeout(hardTimeout);
    console.log('KEY-395 live check PASSED (ar & en)');
    app.exit(0);
  })().catch(err => {
    clearTimeout(hardTimeout);
    console.error('KEY-395 live check FAILED:', err);
    app.exit(1);
  });
});

require(path.resolve(__dirname, '../../dist/main/index.js'));
