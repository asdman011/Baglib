// KEY-392 live check (one language per launch, window off-screen per KEY-408):
//   the Anki package dialog opens from the deck manager
//   → a copy of the user's real Anki backup is imported through the app's IPC
//   → the Arabic hadith decks appear in the tree, and one is studied in the review screen
//   → one deck is exported to .apkg (zip with collection.anki21 and a media map)
//   → re-importing that export adds nothing
//   → no renderer errors.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_ANKI_PROFILE;
const evidence = process.env.BAGLIB_ANKI_EVIDENCE;
const language = process.env.BAGLIB_ANKI_LANG || 'ar';
const pkg = process.env.BAGLIB_ANKI_PACKAGE;
const exportPath = process.env.BAGLIB_ANKI_EXPORT;

app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;
  const errors = [];
  owner.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message.slice(0, 400));
  });
  owner.webContents.on('did-finish-load', () => {
    owner.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {});
  });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => {
    throw new Error(`${error.message}: ${code.slice(0, 240)}`);
  });
  const until = async (code, tries = 150) => {
    for (let i = 0; i < tries; i++) {
      try {
        if (await evaluate(`(async()=>(${code}))()`)) return;
      } catch {
        /* retry */
      }
      await pause(200);
    }
    throw new Error(`Timed out: ${code}`);
  };
  const shot = async name => {
    await pause(500);
    owner.webContents.invalidate();
    await pause(300);
    fs.writeFileSync(path.join(evidence, `${name}-${language}.png`), (await owner.webContents.capturePage()).toPNG());
  };
  const loadApp = async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.loadURL('http://localhost:3000');
        return;
      } catch (error) {
        if (attempt >= 4) throw error;
        await pause(1000);
      }
    }
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const goDecks = async () => {
    await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
    await until(`!!document.querySelector('button[data-notes-tab="cards"]')`);
    await click('button[data-notes-tab="cards"]');
    await until(`!!document.querySelector('[data-deck-manager]')`);
  };

  (async () => {
    const results = { language };
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','dark')`);
    await loadApp();
    await until('!!window.electronAPI?.ankiPackage && !!document.querySelector("footer")');

    // 1. The dialog opens from the deck manager.
    await goDecks();
    await click('[data-open-anki-package]');
    await until(`!!document.querySelector('[data-anki-package-dialog] [data-anki-import]')`);
    results.dialogDir = await evaluate(`getComputedStyle(document.querySelector('[data-anki-package-dialog]')).direction`);
    assert.equal(results.dialogDir, language === 'ar' ? 'rtl' : 'ltr');
    await shot('01-anki-package-dialog');
    await click('[data-close-anki-package]');

    // 2. Import a copy of the real backup through the app's IPC (the native file dialog can't be driven).
    const t0 = Date.now();
    const imported = await evaluate(`window.electronAPI.ankiPackage.import({ filePath: ${JSON.stringify(pkg)}, language: '${language}' })`);
    results.importMs = Date.now() - t0;
    assert.equal(imported.ok, true, JSON.stringify(imported));
    results.imported = imported.data;
    assert.ok(imported.data.notes.added > 0 && imported.data.cards.added > 0, 'notes and cards imported');
    assert.ok(imported.data.revlog.added > 0, 'history imported');

    // 3. The Arabic hadith decks are in the tree; study one with cards ready.
    await evaluate(`window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'))`);
    const tree = await evaluate(`window.electronAPI.knowledgeCards.deckTree()`);
    const flat = [];
    const walk = nodes => (nodes || []).forEach(n => { flat.push(n); walk(n.children); });
    walk(tree);
    results.hadithDecks = flat.filter(n => /كِتَاب|أحاديث/u.test(n.name)).map(n => ({ name: n.name, new: n.newCount, due: n.dueCount, learning: n.learningCount }));
    assert.ok(results.hadithDecks.length >= 2, 'Arabic hadith decks imported');
    const study = flat.find(n => /كِتَاب/u.test(n.name) && (n.newCount || 0) + (n.dueCount || 0) + (n.learningCount || 0) > 0) || flat.find(n => /كِتَاب/u.test(n.name));
    results.studied = study.name;
    await until(`!!document.querySelector('[data-deck-study=${JSON.stringify(study.id)}]')`);
    await shot('02-deck-tree-after-import');
    await click(`[data-deck-study=${JSON.stringify(study.id)}]`);
    await until(`!!document.querySelector('[data-srs-review-screen]')`);
    await pause(800);
    results.reviewText = (await evaluate(`document.querySelector('[data-srs-card]')?.textContent ?? document.querySelector('[data-srs-review-screen]').textContent`)).slice(0, 300);
    await shot('03-review-imported-hadith');
    await evaluate(`document.querySelector('[data-srs-exit-button]')?.click()`);
    await pause(400);

    // 4. Export that deck to .apkg.
    const exported = await evaluate(`window.electronAPI.ankiPackage.export({ filePath: ${JSON.stringify(exportPath)}, deckIds: [${JSON.stringify(study.id)}], language: '${language}' })`);
    assert.equal(exported.ok, true, JSON.stringify(exported));
    results.exported = exported.data;
    const { unzipSync } = require('fflate');
    const zip = unzipSync(new Uint8Array(fs.readFileSync(exportPath)));
    results.exportEntries = Object.keys(zip).filter(k => !/^\d+$/u.test(k));
    assert.ok(zip['collection.anki21'] && zip.media, 'export holds collection.anki21 and the media map');

    // 5. Re-importing the export adds nothing.
    const again = await evaluate(`window.electronAPI.ankiPackage.import({ filePath: ${JSON.stringify(exportPath)}, policy: 'never', language: '${language}' })`);
    assert.equal(again.ok, true, JSON.stringify(again));
    results.reimport = { notesAdded: again.data.notes.added, cardsAdded: again.data.cards.added, revlogAdded: again.data.revlog.added };
    assert.deepEqual([again.data.notes.added, again.data.cards.added, again.data.revlog.added], [0, 0, 0]);

    // 6. The per-deck export button opens the dialog for that deck.
    await goDecks();
    await until(`!!document.querySelector('[data-deck-export-apkg=${JSON.stringify(study.id)}]')`);
    await click(`[data-deck-export-apkg=${JSON.stringify(study.id)}]`);
    await until(`!!document.querySelector('[data-anki-package-dialog] [data-anki-export]') && !document.querySelector('[data-anki-package-dialog] [data-anki-import]')`);
    await shot('04-export-deck-dialog');
    await click('[data-close-anki-package]');

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon/u.test(line));
    assert.deepEqual(results.rendererErrors, [], 'no renderer errors');
    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[anki-package-live-${language}] passed`, JSON.stringify({ ...results, reviewText: undefined }));
    app.exit(0);
  })().catch(error => {
    console.error(`[anki-package-live-${language}] FAILED`, error);
    try {
      fs.writeFileSync(path.join(evidence, `error-${language}.txt`), String(error && error.stack ? error.stack : error));
    } catch {
      /* ignore */
    }
    owner.webContents.capturePage().then(
      img => {
        fs.writeFileSync(path.join(evidence, `error-${language}.png`), img.toPNG());
        app.exit(1);
      },
      () => app.exit(1)
    );
  });
});

require('../../dist/main/index.js');
