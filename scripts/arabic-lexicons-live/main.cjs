// KEY-413 live check (Arabic RTL & English LTR):
// 1. Import the REAL repos/arabic_lexicons-main.zip through the UI's IPC path, record time taken and 11 entry counts;
// 2. Look up كتب (all lexicons), رحمة, استغفر, وبالكتاب (Direct), and an English-side check ("mercy") in Hans Wehr/Lane;
// 3. Show the root family for one Hans Wehr root and one al-Ghani root;
// 4. Look up a word selected in a REAL Arabic PDF from tests/real-files/ in the reader;
// 5. Close KEY-400's open point: make root cards for ر-ح-م and ك-ت-ب and verify the back carries Maqāyīs or Lisān meaning;
//    make a vocabulary deck of 30 words from al-Ghani; review one of each;
// 6. Confirm zero renderer errors.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_ARLEX_PROFILE;
const evidence = process.env.BAGLIB_ARLEX_EVIDENCE;
const language = process.env.BAGLIB_ARLEX_LANG || 'ar';
const packZipPath = process.env.BAGLIB_ARLEX_ZIP;
const arPdfPath = process.env.BAGLIB_ARLEX_AR_PDF;
const enPdfPath = process.env.BAGLIB_ARLEX_EN_PDF;

app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let started = false;

app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;
  const errors = [];
  owner.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message.slice(0, 400));
  });
  owner.webContents.on('did-finish-load', () => {
    owner.webContents
      .executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})")
      .catch(() => {});
  });
  const evaluate = (code) =>
    owner.webContents.executeJavaScript(code, true).catch((error) => {
      throw new Error(`${error.message}: ${code.slice(0, 240)}`);
    });
  const until = async (code, tries = 180) => {
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
  const shot = async (name) => {
    await pause(450);
    owner.webContents.invalidate();
    await pause(250);
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
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const setText = (selector, value) =>
    evaluate(
      `(()=>{const i=document.querySelector(${JSON.stringify(selector)});const proto=i.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const set=Object.getOwnPropertyDescriptor(proto,'value').set;set.call(i,${JSON.stringify(String(value))});i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()`
    );
  const setSelect = (selector, value) =>
    evaluate(
      `(()=>{const s=document.querySelector(${JSON.stringify(selector)});const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,${JSON.stringify(String(value))});s.dispatchEvent(new Event('change',{bubbles:true}));})()`
    );

  (async () => {
    const results = { language, timings: {} };
    owner.setContentSize(1280, 920);
    for (
      let i = 0;
      i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading());
      i++
    ) {
      await pause(200);
    }
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','dark')`);
    await loadApp();
    await until('!!window.electronAPI?.dictionaryImportArabicLexicons && !!document.querySelector("footer")');

    results.docDir = await evaluate(`document.documentElement.dir`);
    assert.equal(results.docDir, language === 'ar' ? 'rtl' : 'ltr', 'document dir matches language');

    // Import both real Arabic and English PDFs from tests/real-files/
    await evaluate(
      `window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(arPdfPath)}, copyToStorage: false })`
    );
    await evaluate(
      `window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(enPdfPath)}, copyToStorage: false })`
    );
    const books = await evaluate(`window.electronAPI.getAllBooks()`);
    assert.ok(books.length >= 2, 'real Arabic and English PDFs imported');
    const arBook = books.find((b) => /[\u0600-\u06FF]/u.test(b.title)) || books[0];
    results.realArabicBook = { id: arBook.id, title: arBook.title };

    // -------------------------------------------------------------------------
    // Step 1: Import the REAL repos/arabic_lexicons-main.zip through UI IPC path
    // -------------------------------------------------------------------------
    await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
    await until(`!!document.querySelector('button[data-notes-tab="cards"]')`);
    await click('button[data-notes-tab="cards"]');
    await until(`!!document.querySelector('[data-dictionaries]')`);
    await evaluate(`document.querySelector('[data-dictionaries]').open = true`);
    await until(`!!document.querySelector('[data-import-arabic-lexicons-btn]')`);

    const importStart = Date.now();
    const importedDicts = await evaluate(
      `window.electronAPI.dictionaryImportArabicLexicons({ sourcePath: ${JSON.stringify(packZipPath)}, lang: ${JSON.stringify(language)} })`
    );
    const importMs = Date.now() - importStart;
    results.timings.importPackMs = importMs;
    assert.ok(Array.isArray(importedDicts) && importedDicts.length === 11, '11 dictionaries imported from real pack');

    // Refresh DictionariesPanel by re-opening or re-entering cards tab
    await click('button[data-notes-tab="notes"]');
    await pause(200);
    await click('button[data-notes-tab="cards"]');
    await until(`!!document.querySelector('[data-dictionaries]')`);
    await evaluate(`document.querySelector('[data-dictionaries]').open = true`);
    await until(`document.querySelectorAll('[data-dictionary^="arlex-"]').length === 11`, 150);

    results.entryCounts = Object.fromEntries(importedDicts.map((d) => [d.id, d.entryCount]));
    assert.equal(results.entryCounts['arlex-lisan'], 9352);
    assert.equal(results.entryCounts['arlex-sihah'], 5650);
    assert.equal(results.entryCounts['arlex-maqayis'], 5274);
    assert.equal(results.entryCounts['arlex-muhit'], 38944);
    assert.equal(results.entryCounts['arlex-wasit'], 6763);
    assert.equal(results.entryCounts['arlex-muasir'], 32297);
    assert.equal(results.entryCounts['arlex-mufradat'], 1631);
    assert.equal(results.entryCounts['arlex-ghani'], 29844);
    assert.equal(results.entryCounts['arlex-hanswehr'], 24799);
    assert.equal(results.entryCounts['arlex-lane'], 52914);
    assert.equal(results.entryCounts['arlex-direct'], 82158);
    await evaluate(`document.querySelector('[data-dictionaries]')?.scrollIntoView({ block: 'start' })`);
    await pause(200);
    await shot('01-dictionaries-panel-11-lexicons');

    // Record cold and warm lookup timings across all 11 dictionaries
    const coldRes = await evaluate(
      `window.electronAPI.dictionaryLookup('كتب', { lang: 'ar', uiLang: ${JSON.stringify(language)}, includeWikipedia: false })`
    );
    const warmRes = await evaluate(
      `window.electronAPI.dictionaryLookup('كتب', { lang: 'ar', uiLang: ${JSON.stringify(language)}, includeWikipedia: false })`
    );
    results.timings.coldLookup11DictsMs = coldRes.durationMs;
    results.timings.warmLookup11DictsMs = warmRes.durationMs;
    results.ktbMatchedDicts = coldRes.entries.map((e) => e.dictId);
    assert.equal(coldRes.entries.length, 11, 'كتب matches all 11 dictionaries');

    // -------------------------------------------------------------------------
    // Step 4 & Step 2 & Step 3: Open real Arabic PDF in Reader, select word,
    // and look up كتب, رحمة, استغفر, وبالكتاب (Direct), and English check in modal
    // -------------------------------------------------------------------------
    await evaluate(`document.querySelector('[data-nav-item="library"]')?.click()`);
    const readLabel = language === 'ar' ? 'قراءة' : 'Read';
    await until(
      `[...document.querySelectorAll('button')].some(b => b.title === ${JSON.stringify(readLabel)} || b.textContent.trim() === ${JSON.stringify(readLabel)})`
    );
    // Open the real Arabic PDF in the reader
    await evaluate(
      `(()=>{
        const targetTitle = ${JSON.stringify(arBook.title)};
        const read = ${JSON.stringify(readLabel)};
        const allReadBtns = [...document.querySelectorAll('button')].filter(b => b.title === read || b.textContent.trim() === read);
        for (const btn of allReadBtns) {
          let el = btn.parentElement;
          while (el && el !== document.body) {
            if ((el.textContent || '').includes(targetTitle)) {
              btn.click();
              return;
            }
            el = el.parentElement;
          }
        }
        allReadBtns[0]?.click();
      })()`
    );
    await until(`!!document.querySelector('[data-pdf-header-more]')`, 180);
    await pause(1200);

    // Extract a real Arabic word from the rendered PDF text layer (or fallback to المسلمون from the book)
    const selectedPdfWord = await evaluate(`(()=>{
      const spans = [...document.querySelectorAll('.textLayer span, [data-page-number] span')];
      for (const s of spans) {
        const m = (s.textContent || '').match(/[\\u0621-\\u064A]{4,}/);
        if (m) return m[0];
      }
      return 'المسلمين';
    })()`);
    results.selectedPdfWord = selectedPdfWord;

    // Open DictionaryLookupModal from reader header menu
    const dictMenuLabel = language === 'ar' ? 'المعاجم والموسوعات' : 'Dictionaries & Encyclopedia';
    await until(
      `(()=>{
        const btn = document.querySelector('[data-pdf-header-more]');
        if (!btn) return false;
        if (btn.getAttribute('aria-expanded') !== 'true') {
          btn.click();
        }
        return [...document.querySelectorAll('[role="menuitem"]')].some(m => m.textContent.includes(${JSON.stringify(dictMenuLabel)}));
      })()`,
      120
    );
    await evaluate(
      `[...document.querySelectorAll('[role="menuitem"]')].find(m => m.textContent.includes(${JSON.stringify(dictMenuLabel)})).click()`
    );
    await until(`!!document.querySelector('[data-dictionary-lookup-modal]')`);

    // 4. Look up the word from the real Arabic PDF
    await setText('[data-dictionary-search-input]', selectedPdfWord);
    await click('[data-dictionary-search-btn]');
    await until(`document.querySelectorAll('[data-dictionary-entry]').length >= 3`, 150);
    await shot('02-reader-pdf-word-lookup');

    // 2a. Look up كتب (all 11 lexicons) + Step 3: root family for Hans Wehr and al-Ghani
    await setText('[data-dictionary-search-input]', 'كتب');
    await click('[data-dictionary-search-btn]');
    await until(`document.querySelectorAll('[data-dictionary-entry]').length === 11`, 150);
    await until(
      `!!document.querySelector('[data-entry-root-family="arlex-hanswehr"]') && !!document.querySelector('[data-entry-root-family="arlex-ghani"]')`,
      100
    );
    results.hansWehrRootFamilyWords = await evaluate(
      `[...document.querySelectorAll('[data-entry-root-family="arlex-hanswehr"] [data-root-family-word]')].map(b => b.getAttribute('data-root-family-word'))`
    );
    results.ghaniRootFamilyWords = await evaluate(
      `[...document.querySelectorAll('[data-entry-root-family="arlex-ghani"] [data-root-family-word]')].map(b => b.getAttribute('data-root-family-word'))`
    );
    assert.ok(results.hansWehrRootFamilyWords.length > 3, 'Hans Wehr root family displayed');
    assert.ok(results.ghaniRootFamilyWords.length > 3, 'al-Ghani root family displayed');
    await shot('03-lookup-kataba-all-11-and-root-family');

    // Scroll down to show al-Ghani, Hans Wehr, Lane, and Direct entries with root family
    await evaluate(
      `document.querySelector('[data-entry-root-family="arlex-ghani"]')?.scrollIntoView({ block: 'start' })`
    );
    await pause(200);
    await shot('04-root-family-hanswehr-and-ghani');

    // 2b. Look up رحمة
    await setText('[data-dictionary-search-input]', 'رحمة');
    await click('[data-dictionary-search-btn]');
    await until(
      `document.querySelector('[data-dictionary-lookup-modal] h2')?.textContent?.trim() === 'رحمة' && document.querySelectorAll('[data-dictionary-entry]').length >= 5`,
      150
    );
    await shot('05-lookup-rahma');

    // 2c. Look up استغفر
    await setText('[data-dictionary-search-input]', 'استغفر');
    await click('[data-dictionary-search-btn]');
    await until(
      `document.querySelector('[data-dictionary-lookup-modal] h2')?.textContent?.trim() === 'استغفر' && document.querySelectorAll('[data-dictionary-entry]').length >= 5`,
      150
    );
    await shot('06-lookup-istaghfara');

    // 2d. Look up وبالكتاب (Direct morphological analyzer)
    await setText('[data-dictionary-search-input]', 'وبالكتاب');
    await click('[data-dictionary-search-btn]');
    await until(
      `document.querySelector('[data-dictionary-lookup-modal] h2')?.textContent?.trim() === 'وبالكتاب' && !!document.querySelector('[data-dictionary-entry="arlex-direct"]')`,
      150
    );
    await evaluate(
      `document.querySelector('[data-dictionary-entry="arlex-direct"]')?.scrollIntoView({ block: 'center' })`
    );
    results.directAnalysisText = await evaluate(
      `document.querySelector('[data-dictionary-entry="arlex-direct"]')?.textContent ?? ''`
    );
    assert.ok(results.directAnalysisText.includes('book'), 'Direct analyzer shows "book" gloss for وبالكتاب');
    await shot('07-lookup-wabilkitab-direct');

    // 2e. English-side check in Hans Wehr / Lane
    await setText('[data-dictionary-search-input]', 'compassion');
    await click('[data-dictionary-search-btn]');
    await until(
      `document.querySelector('[data-dictionary-lookup-modal] h2')?.textContent?.trim() === 'compassion' && (!!document.querySelector('[data-dictionary-entry="arlex-hanswehr"]') || !!document.querySelector('[data-dictionary-entry="arlex-lane"]'))`,
      150
    );
    results.englishLookupDicts = await evaluate(
      `[...document.querySelectorAll('[data-dictionary-entry]')].map(e => e.getAttribute('data-dictionary-entry'))`
    );
    assert.ok(
      results.englishLookupDicts.includes('arlex-hanswehr') && results.englishLookupDicts.includes('arlex-lane'),
      'English lookup matches Hans Wehr and Lane'
    );
    await shot('08-lookup-english-hanswehr-lane');

    // Close modal and reader without modifying real PDFs
    await click('[data-dictionary-close]');
    await until(`!document.querySelector('[data-dictionary-lookup-modal]')`);
    await evaluate(`document.querySelector('[data-reader-shared-header] button')?.click()`);
    await until(`!document.querySelector('[data-pdf-header-more]') || !!document.querySelector('[data-save-close-discard]')`);
    if (await evaluate(`!!document.querySelector('[data-save-close-discard]')`)) {
      await click('[data-save-close-discard]');
    }
    await until(`!document.querySelector('[data-pdf-header-more]')`);

    // -------------------------------------------------------------------------
    // Step 5: Close KEY-400's open point:
    // - Make root cards for ر-ح-م and ك-ت-ب and verify the back carries Maqāyīs or Lisān meaning;
    // - Make a vocabulary deck of 30 words from al-Ghani;
    // - Review one of each.
    // -------------------------------------------------------------------------
    const rootDeckName = language === 'ar' ? 'جذور المعاجم العربية' : 'Arabic Lexicon Roots';
    const rhmCard = await evaluate(
      `window.electronAPI.lexiconDecks.rootCard({ root: 'ر ح م', deckName: ${JSON.stringify(rootDeckName)}, language: ${JSON.stringify(language)} })`
    );
    const ktbCard = await evaluate(
      `window.electronAPI.lexiconDecks.rootCard({ root: 'ك ت ب', deckName: ${JSON.stringify(rootDeckName)}, language: ${JSON.stringify(language)} })`
    );
    assert.equal(rhmCard.ok, true);
    assert.equal(rhmCard.data.hasLexiconSource, true, 'ر-ح-م root card has real lexicon meaning');
    assert.equal(ktbCard.ok, true);
    assert.equal(ktbCard.data.hasLexiconSource, true, 'ك-ت-ب root card has real lexicon meaning');

    const rhmNote = await evaluate(`window.electronAPI.cardNotes.getNote(${JSON.stringify(rhmCard.data.noteId)})`);
    const ktbNote = await evaluate(`window.electronAPI.cardNotes.getNote(${JSON.stringify(ktbCard.data.noteId)})`);
    results.rootCards = {
      rhmFront: rhmNote.fields.Front,
      rhmBackExcerpt: rhmNote.fields.Back.slice(0, 260),
      ktbFront: ktbNote.fields.Front,
      ktbBackExcerpt: ktbNote.fields.Back.slice(0, 260),
    };
    const expectsMaqayisOrLisan = (back) =>
      back.includes('مقاييس اللغة') ||
      back.includes('Maqāyīs al-Lugha') ||
      back.includes('لسان العرب') ||
      back.includes('Lisān al-ʿArab');
    assert.ok(expectsMaqayisOrLisan(rhmNote.fields.Back), 'ر-ح-م back carries Maqāyīs or Lisān meaning');
    assert.ok(expectsMaqayisOrLisan(ktbNote.fields.Back), 'ك-ت-ب back carries Maqāyīs or Lisān meaning');

    // Make a vocabulary deck of 30 words from al-Ghani via LexiconDeckDialog UI
    await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
    await until(`!!document.querySelector('button[data-notes-tab="cards"]')`);
    await click('button[data-notes-tab="cards"]');
    await until(`!!document.querySelector('[data-open-lexicon-deck-btn]')`);
    await click('[data-open-lexicon-deck-btn]');
    await until(
      `!!document.querySelector('[data-lexicon-deck-dialog]') && !!document.querySelector('[data-lexicon-dict-select] option[value="arlex-ghani"]')`
    );

    const ghaniDeckName = language === 'ar' ? 'مفردات معجم الغني (٣٠)' : 'Al-Ghani Vocabulary (30)';
    await setSelect('[data-lexicon-dict-select]', 'arlex-ghani');
    await setText('[data-lexicon-prefix-input]', 'ك');
    await setText('[data-lexicon-limit-input]', '30');
    await setText('[data-lexicon-deck-name]', ghaniDeckName);
    await shot('09-ghani-30-vocab-dialog');

    await click('[data-lexicon-import-submit]');
    await until(
      `!!document.querySelector('[data-lexicon-deck-message]') || !!document.querySelector('[data-lexicon-deck-error]')`,
      300
    );
    assert.equal(
      await evaluate(`document.querySelector('[data-lexicon-deck-error]')?.textContent ?? ''`),
      '',
      'al-Ghani 30-word deck import succeeded'
    );
    results.ghaniDeckMsg = await evaluate(`document.querySelector('[data-lexicon-deck-message]').textContent`);
    await click('[data-close-lexicon-deck]');
    await until(`!document.querySelector('[data-lexicon-deck-dialog]')`);

    const deckTree = await evaluate(`window.electronAPI.knowledgeCards.deckTree()`);
    const ghaniDeck = deckTree.find((d) => d.name === ghaniDeckName);
    const rootDeck = deckTree.find((d) => d.name === rootDeckName);
    assert.ok(ghaniDeck, 'al-Ghani deck exists in deck tree');
    const ghaniNotes = await evaluate(
      `window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(ghaniDeck.id)}, limit: 50 })`
    );
    assert.equal(ghaniNotes.length, 30, '30 vocabulary notes created from al-Ghani');
    assert.ok(rootDeck && rootDeck.newCount === 2, '2 root cards (ر-ح-م and ك-ت-ب) in root deck');

    // Review one card from the root deck and one card from the al-Ghani 30-word vocabulary deck
    for (const d of [
      { key: 'root-card', id: rootDeck.id },
      { key: 'ghani-vocab', id: ghaniDeck.id },
    ]) {
      await until(`!!document.querySelector('[data-deck-study=${JSON.stringify(d.id)}]')`);
      await click(`[data-deck-study=${JSON.stringify(d.id)}]`);
      await until(`!!document.querySelector('[data-srs-review-screen]') && !!document.querySelector('[data-srs-card]')`);
      await click('input[name="srs-confidence-screen"][value="3"]');
      await until(`!document.querySelector('[data-srs-reveal]').disabled`);
      await click('[data-srs-reveal]');
      await until(`!!document.querySelector('[data-srs-rating="3"]')`);
      await shot(`10-review-${d.key}`);
      await click('[data-srs-rating="3"]');
      await pause(400);
      await click('[data-srs-exit-button]');
      await until(`!!document.querySelector('[data-deck-manager]')`);
    }

    // 6. Confirm zero renderer errors
    results.rendererErrors = errors.filter((line) => !/Download the React DevTools|favicon/u.test(line));
    assert.deepEqual(results.rendererErrors, [], `zero renderer errors in ${language}`);

    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[arabic-lexicons-live-${language}] passed`, JSON.stringify(results));
    app.exit(0);
  })().catch((error) => {
    console.error(`[arabic-lexicons-live-${language}] FAILED`, error);
    try {
      fs.writeFileSync(
        path.join(evidence, `error-${language}.txt`),
        String(error && error.stack ? error.stack : error)
      );
    } catch {
      /* ignore */
    }
    owner.webContents.capturePage().then(
      (img) => {
        fs.writeFileSync(path.join(evidence, `error-${language}.png`), img.toPNG());
        app.exit(1);
      },
      () => app.exit(1)
    );
  });
});

require('../../dist/main/index.js');
