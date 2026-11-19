// KEY-429 live run (see run.mjs). Real PDFs from tests/real-files, ar and en UI.
const { app, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_SHARE_PROFILE;
const evidence = process.env.BAGLIB_SHARE_EVIDENCE;
assert.ok(profile && evidence, 'BAGLIB_SHARE_PROFILE and BAGLIB_SHARE_EVIDENCE are required');

app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const hardTimeout = setTimeout(() => {
  console.error('KEY-429 live harness timed out');
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
    assert.ok(pdfAr && pdfEn, 'Real Arabic and English PDFs must exist in tests/real-files/pdf');

    await until("!!window.electronAPI?.settings && !!document.querySelector('[data-nav-item]')");

    for (const lang of ['ar', 'en']) {
      await evaluate(`(async () => {
        window.__baglibDisableTabsPersist = true;
        localStorage.setItem('baglib-lang', ${JSON.stringify(lang)});
        await window.electronAPI.settings.set('workspace.tabs.v1', null);
        await window.electronAPI.settings.set('workspace.prefs.v1', { restoreTabs: true, restoreFocus: 'new', linkTarget: 'new', shareSourceOnly: false });
      })()`);
      win.reload();
      await until("!!window.electronAPI?.settings && !!document.querySelector('[data-nav-item]')");
      await evaluate(`(() => {
        window.__copiedText = '';
        if (navigator.clipboard) {
          navigator.clipboard.writeText = async (txt) => { window.__copiedText = txt; };
        }
      })()`);

      // 1. Open Settings -> Workspace and verify "With my annotations" is selected by default
      await evaluate(`document.querySelector('[data-nav-item="settings"]')?.click()`);
      await until("!!document.querySelector('[data-settings-entry=\"workspace\"]')");
      await evaluate(`document.querySelector('[data-settings-entry="workspace"]')?.click()`);
      await until("!!document.querySelector('[data-workspace-share-mode=\"annotations\"]')");

      const defaultPressed = await evaluate(`document.querySelector('[data-workspace-share-mode="annotations"]')?.getAttribute('aria-pressed')`);
      assert.equal(defaultPressed, 'true', `${lang}: With my annotations should be default`);
      await shot(`01-settings-workspace-${lang}`);

      // Close modal
      await evaluate(`document.querySelector('[data-ui-dialog] button[aria-label]')?.click()`);
      await pause(200);

      // 2. Seed real work, highlight + comment, study note with relation, and personal list
      const pdfPath = lang === 'ar' ? pdfAr : pdfEn;
      const seeded = await evaluate(`(async () => {
        await window.electronAPI.importDigitalFiles([{ filePath: ${JSON.stringify(pdfPath)}, duplicateAction: 'import_anyway' }], 'share-live');
        const works = await window.electronAPI.getAllBooks();
        const workId = works[0]?.workId || works[0]?.id;
        const k = await window.electronAPI.knowledge.save({
          workId,
          knowledgeType: 'highlight',
          location: '1',
          quotedText: ${JSON.stringify(lang === 'ar' ? 'نص مظلل من الكتاب' : 'Highlighted passage from book')},
          color: 'amber',
        });
        await window.electronAPI.knowledgeHistory.addComment(k.id, ${JSON.stringify(lang === 'ar' ? 'تعليق على التظليل' : 'Comment on highlight')});
        await window.electronAPI.studyNotes.save({
          title: ${JSON.stringify(lang === 'ar' ? 'ملاحظة مرتبطة' : 'Linked study note')},
          content: '[[supports::book:' + workId + '#p=1|p. 1]] [[explains::quran:hafs:2:153|2:153]]',
          aliases: [],
          tags: [],
        });
        const listsRes = await window.electronAPI.personalLists.invoke('all');
        const starred = listsRes.data[0];
        const addRes = await window.electronAPI.personalLists.invoke('add', starred.id, { itemKind: 'page', itemRef: 'book:' + workId + '#p=1', label: 'Test Book p. 1' });
        if (!addRes?.ok) throw new Error('personalLists add failed: ' + JSON.stringify(addRes));
        window.dispatchEvent(new CustomEvent('baglib:personal-lists-changed'));
        return { workId };
      })()`);
      assert.ok(seeded.workId, `${lang}: seeded workId`);

      // 3. Navigate to Notes -> Lists hub and click Copy list (default: with annotations)
      await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
      await until("!!document.querySelector('button[data-notes-tab=\"lists\"]')");
      await evaluate(`document.querySelector('button[data-notes-tab="lists"]')?.click()`);
      await until("!!document.querySelector('[data-lists-copy]') && !!document.querySelector('[data-lists-item]')");

      await evaluate(`document.querySelector('[data-lists-copy]')?.click()`);
      await until(`window.__copiedText.length > 0`);
      const copiedWithNotes = await evaluate(`window.__copiedText`);
      assert.ok(
        copiedWithNotes.includes(lang === 'ar' ? 'ملاحظاتي:' : 'My notes:'),
        `${lang}: default copy must include My notes heading, got: ${copiedWithNotes}`,
      );
      assert.ok(copiedWithNotes.includes('↔'), `${lang}: default copy must include connection`);
      await shot(`02-lists-with-notes-${lang}`);

      // 4. Toggle one-off "Source only" checkbox on Lists hub and copy again
      await evaluate(`(() => {
        window.__copiedText = '';
        const cb = document.querySelector('[data-lists-source-only]');
        if (cb && !cb.checked) cb.click();
      })()`);
      await pause(200);
      await evaluate(`document.querySelector('[data-lists-copy]')?.click()`);
      await until(`window.__copiedText.length > 0`);
      const copiedSourceOnly = await evaluate(`window.__copiedText`);
      assert.ok(
        !copiedSourceOnly.includes(lang === 'ar' ? 'ملاحظاتي:' : 'My notes:'),
        `${lang}: one-off source only must omit My notes heading, got: ${copiedSourceOnly}`,
      );
    }

    assert.equal(errors.length, 0, 'Renderer errors: ' + errors.join('; '));
    clearTimeout(hardTimeout);
    console.log('KEY-429 live check PASSED (ar & en)');
    app.exit(0);
  })().catch(err => {
    clearTimeout(hardTimeout);
    console.error('KEY-429 live check FAILED:', err);
    app.exit(1);
  });
});

require(path.resolve(__dirname, '../../dist/main/index.js'));
