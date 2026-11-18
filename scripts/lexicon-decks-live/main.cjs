// KEY-400 live check:
// 1. Copy Readest StarDict fixture (eng-nld) into throwaway profile, import into vocabulary deck,
//    verify Basic (and reversed) cards created (source_lang !== target_lang) and second import adds no duplicates;
// 2. Quick-add a word from the reader dictionary lookup (on a real PDF from tests/real-files/) and verify
//    duplicate prevention ("Already in deck");
// 3. Quick-add a word from the Quran word lookup (word-by-word meanings in QuranMushafWorkspace);
// 4. Make a Quranic root card (ishtiqaq) and a Quranic root deck (no hifz);
// 5. Make a tafsir deck from a real highlight and comment on a tafsir work and Quran commentary note;
// 6. Review one card from each deck in SrsReviewScreen.
// Runs in ar (RTL) and en (LTR), window off-screen (KEY-408).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_LEXICON_PROFILE;
const evidence = process.env.BAGLIB_LEXICON_EVIDENCE;
const language = process.env.BAGLIB_LEXICON_LANG || 'ar';
const realPdf = process.env.BAGLIB_LEXICON_PDF;
const dictIfoPath = process.env.BAGLIB_LEXICON_IFO;

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
    owner.webContents
      .executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})")
      .catch(() => {});
  });
  const evaluate = code =>
    owner.webContents.executeJavaScript(code, true).catch(error => {
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
  const shot = async name => {
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
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const setText = (selector, value) =>
    evaluate(
      `(()=>{const i=document.querySelector(${JSON.stringify(selector)});const proto=i.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const set=Object.getOwnPropertyDescriptor(proto,'value').set;set.call(i,${JSON.stringify(String(value))});i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()`
    );
  const setSelect = (selector, value) =>
    evaluate(
      `(()=>{const s=document.querySelector(${JSON.stringify(selector)});const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,${JSON.stringify(String(value))});s.dispatchEvent(new Event('change',{bubbles:true}));})()`
    );

  (async () => {
    const results = { language };
    owner.setContentSize(1280, 900);
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
    await until('!!window.electronAPI?.lexiconDecks && !!document.querySelector("footer")');

    // Verify document directionality (RTL for ar, LTR for en)
    results.docDir = await evaluate(`document.documentElement.dir`);
    assert.equal(results.docDir, language === 'ar' ? 'rtl' : 'ltr', 'document dir matches language');

    // 0. Import the copied Readest StarDict fixture (eng-nld) and the real PDF book from tests/real-files/
    const importedDict = await evaluate(
      `window.electronAPI.dictionaryImport({ sourcePath: ${JSON.stringify(dictIfoPath)}, title: 'English-Dutch FreeDict', sourceLang: 'en', targetLang: 'nl' })`
    );
    assert.ok(importedDict && importedDict.entryCount > 1000, 'Readest StarDict dictionary imported');
    results.dictionary = { id: importedDict.id, title: importedDict.title, entryCount: importedDict.entryCount };

    await evaluate(
      `window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(realPdf)}, copyToStorage: false })`
    );
    const books = await evaluate(`window.electronAPI.getAllBooks()`);
    const book = books[0];
    assert.ok(book, 'real PDF imported');
    const tafsirBookTitle = language === 'ar' ? `تفسير — ${book.title}` : `Tafsir — ${book.title}`;
    await evaluate(
      `window.electronAPI.updateBook(${JSON.stringify({
        ...book,
        title: tafsirBookTitle,
        categories: ['التفسير', 'Tafsir'],
      })})`
    );
    results.realBook = { id: book.id, title: tafsirBookTitle };

    // Add a real highlight + comment on the tafsir work, and a Quran commentary note on 1:1
    const highlightText =
      language === 'ar'
        ? 'تفسير قوله تعالى في سورة البقرة 2:255 الله لا إله إلا هو الحي القيوم وبيان توحيد الألوهية'
        : 'Tafsir of Surah Al-Baqarah 2:255 explaining divine self-subsistence and eternal sovereignty';
    const highlightComment =
      language === 'ar'
        ? 'تعليق القارئ: آية الكرسي تجمع أصول الأسماء والصفات'
        : 'Reader comment: Ayat al-Kursi synthesizes the foundational attributes';
    await evaluate(
      `window.electronAPI.saveAnnotation({ bookId: ${JSON.stringify(book.id)}, type: 'note', locationCfiOrPage: '1', selectedText: ${JSON.stringify(highlightText)}, noteContent: ${JSON.stringify(highlightComment)}, color: '#ffeb3b' })`
    );
    await evaluate(
      `window.electronAPI.commentary.save({ reference: 'quran:hafs:1:1', kind: 'reflection', text: ${JSON.stringify(
        language === 'ar' ? 'تفسير البسملة في مطلع سورة الفاتحة' : 'Commentary on the Basmala opening Al-Fatihah'
      )} })`
    );

    await loadApp();
    await until('!!window.electronAPI?.lexiconDecks && !!document.querySelector("footer")');
    await pause(600);

    // -------------------------------------------------------------------------
    // Stage 1 & 2: Lexicon deck import + reversed translation cards
    // -------------------------------------------------------------------------
    await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
    await until(`!!document.querySelector('button[data-notes-tab="cards"]')`);
    await click('button[data-notes-tab="cards"]');
    await until(`!!document.querySelector('[data-open-lexicon-deck-btn]')`);
    await click('[data-open-lexicon-deck-btn]');
    await until(`!!document.querySelector('[data-lexicon-deck-dialog]') && !!document.querySelector('[data-lexicon-dict-select]')`);

    // Because sourceLang ('en') !== targetLang ('nl'), reversed checkbox is auto-checked
    const reversedChecked = await evaluate(`document.querySelector('[data-lexicon-reversed-checkbox]')?.checked`);
    assert.equal(reversedChecked, true, 'translation dictionary auto-selects Basic (and reversed) cards');

    const lexiconDeckName = language === 'ar' ? 'مفردات إنجليزي هولندي' : 'English-Dutch Vocab';
    await setText('[data-lexicon-prefix-input]', 'a');
    await setText('[data-lexicon-limit-input]', '8');
    await setText('[data-lexicon-deck-name]', lexiconDeckName);
    await shot('01-lexicon-import-dialog');

    await click('[data-lexicon-import-submit]');
    await until(
      `!!document.querySelector('[data-lexicon-deck-message]') || !!document.querySelector('[data-lexicon-deck-error]')`,
      300
    );
    assert.equal(
      await evaluate(`document.querySelector('[data-lexicon-deck-error]')?.textContent ?? ''`),
      '',
      'lexicon import succeeded without error'
    );
    results.lexiconImportFirstMsg = await evaluate(`document.querySelector('[data-lexicon-deck-message]').textContent`);

    const lexiconDeck = (await evaluate(`window.electronAPI.knowledgeCards.deckTree()`)).find(
      d => d.name === lexiconDeckName
    );
    assert.ok(lexiconDeck, 'lexicon vocabulary deck created');
    const lexiconNotes = await evaluate(
      `window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(lexiconDeck.id)}, limit: 50 })`
    );
    assert.equal(lexiconNotes.length, 8, '8 headword notes created');
    assert.ok(
      lexiconNotes.every(n => n.noteTypeId === 'stock-basic-reversed'),
      'all notes use stock-basic-reversed'
    );
    assert.equal(lexiconDeck.newCount, 16, '8 notes x 2 directions = 16 cards in deck');

    // Re-import the same dictionary filter and verify 0 duplicates are added
    await click('[data-lexicon-import-submit]');
    await pause(150);
    await until(
      `!document.querySelector('[data-lexicon-import-submit]')?.disabled && !!document.querySelector('[data-lexicon-deck-message]')`,
      200
    );
    results.lexiconImportSecondMsg = await evaluate(
      `document.querySelector('[data-lexicon-deck-message]').textContent`
    );
    const lexiconDeckAfter = (await evaluate(`window.electronAPI.knowledgeCards.deckTree()`)).find(
      d => d.name === lexiconDeckName
    );
    assert.equal(lexiconDeckAfter.newCount, 16, 're-importing adds no duplicate cards');

    // -------------------------------------------------------------------------
    // Stage 4 (Part A): Quranic root deck (ishtiqaq) from LexiconDeckDialog
    // -------------------------------------------------------------------------
    await click('[data-lexicon-tab="roots"]');
    await until(`!!document.querySelector('[data-root-deck-surah]')`);
    const rootDeckName = language === 'ar' ? 'جذور سورة الفاتحة' : 'Al-Fatihah Roots';
    await setSelect('[data-root-deck-surah]', '1');
    await setText('[data-root-deck-limit]', '10');
    await setText('[data-root-deck-name]', rootDeckName);
    await shot('02-root-deck-dialog');

    await click('[data-root-deck-submit]');
    await until(
      `!!document.querySelector('[data-lexicon-deck-message]') || !!document.querySelector('[data-lexicon-deck-error]')`,
      300
    );
    assert.equal(
      await evaluate(`document.querySelector('[data-lexicon-deck-error]')?.textContent ?? ''`),
      '',
      'root deck succeeded without error'
    );
    results.rootDeckMsg = await evaluate(`document.querySelector('[data-lexicon-deck-message]').textContent`);
    const rootDeck = (await evaluate(`window.electronAPI.knowledgeCards.deckTree()`)).find(
      d => d.name === rootDeckName
    );
    assert.ok(rootDeck && rootDeck.newCount > 0, 'root deck created with root cards');
    const rootNotes = await evaluate(
      `window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(rootDeck.id)}, limit: 50 })`
    );
    assert.ok(rootNotes.length >= 5, 'Surah Al-Fatihah root notes created');
    assert.ok(
      rootNotes.every(n => n.fields.Front.includes('-')),
      'every root card front shows dashed root letters'
    );

    // -------------------------------------------------------------------------
    // Stage 5: Tafsir deck from real tafsir highlights & comments
    // -------------------------------------------------------------------------
    await click('[data-lexicon-tab="tafsir"]');
    await until(`!!document.querySelector('[data-tafsir-deck-name]')`);
    const tafsirDeckName = language === 'ar' ? 'بطاقات التفسير' : 'Tafsir Cards';
    await setText('[data-tafsir-deck-name]', tafsirDeckName);
    await shot('03-tafsir-deck-dialog');

    await click('[data-tafsir-deck-submit]');
    await until(
      `!!document.querySelector('[data-lexicon-deck-message]') || !!document.querySelector('[data-lexicon-deck-error]')`,
      300
    );
    assert.equal(
      await evaluate(`document.querySelector('[data-lexicon-deck-error]')?.textContent ?? ''`),
      '',
      'tafsir deck succeeded without error'
    );
    results.tafsirDeckMsg = await evaluate(`document.querySelector('[data-lexicon-deck-message]').textContent`);
    const tafsirDeck = (await evaluate(`window.electronAPI.knowledgeCards.deckTree()`)).find(
      d => d.name === tafsirDeckName
    );
    assert.ok(tafsirDeck && tafsirDeck.newCount >= 2, 'tafsir deck created with highlight and commentary cards');
    const tafsirNotes = await evaluate(
      `window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(tafsirDeck.id)}, limit: 50 })`
    );
    assert.equal(tafsirNotes.length, 2, '2 tafsir notes created');
    assert.ok(
      tafsirNotes.some(n => n.fields.Front.includes('2:255') && n.fields.Back.includes(highlightComment.slice(0, 15))),
      'tafsir card includes ayah reference on front and user comment on back'
    );
    await click('[data-close-lexicon-deck]');
    await until(`!document.querySelector('[data-lexicon-deck-dialog]')`);

    // -------------------------------------------------------------------------
    // Stage 3 (Part A): Quick-add from Reader DictionaryLookupModal on real PDF
    // -------------------------------------------------------------------------
    const readLabel = language === 'ar' ? 'قراءة' : 'Read';
    await evaluate(`document.querySelector('[data-nav-item="library"]')?.click()`);
    await until(
      `[...document.querySelectorAll('button')].some(b => b.title === ${JSON.stringify(readLabel)} || b.textContent.trim() === ${JSON.stringify(readLabel)})`
    );
    await evaluate(
      `(()=>{const read=${JSON.stringify(readLabel)};const btn=[...document.querySelectorAll('button')].find(b=>b.title===read||b.textContent.trim()===read);btn.click();})()`
    );
    await until(`!!document.querySelector('[data-pdf-header-more]')`, 180);
    await click('[data-pdf-header-more]');
    const dictMenuLabel = language === 'ar' ? 'المعاجم والموسوعات' : 'Dictionary & Encyclopedia Lookup';
    await until(
      `[...document.querySelectorAll('[role="menuitem"]')].some(m => m.textContent.includes(${JSON.stringify(dictMenuLabel)}))`
    );
    await evaluate(
      `[...document.querySelectorAll('[role="menuitem"]')].find(m => m.textContent.includes(${JSON.stringify(dictMenuLabel)})).click()`
    );
    await until(`!!document.querySelector('[data-dictionary-lookup-modal]')`);

    // Look up 'book' first so the dictionary entries and quick-add deck picker appear
    await setText('[data-dictionary-search-input]', 'book');
    await click('[data-dictionary-search-btn]');
    await until(
      `!!document.querySelector('[data-dictionary-quick-add="0"]') && !!document.querySelector('[data-quick-add-deck-select]')`,
      150
    );
    await setSelect('[data-quick-add-deck-select]', lexiconDeck.id);
    await click('[data-dictionary-quick-add="0"]');
    await until(`!!document.querySelector('[data-dictionary-quick-add-status="0"]')`, 100);
    results.readerQuickAddFirstMsg = await evaluate(
      `document.querySelector('[data-dictionary-quick-add-status="0"]').textContent`
    );
    await shot('04-reader-dictionary-quick-add');

    // Click again to verify duplicate check ("Already in deck")
    await click('[data-dictionary-quick-add="0"]');
    await until(
      `document.querySelector('[data-dictionary-quick-add-status="0"]')?.textContent !== ${JSON.stringify(results.readerQuickAddFirstMsg)}`,
      100
    );
    results.readerQuickAddSecondMsg = await evaluate(
      `document.querySelector('[data-dictionary-quick-add-status="0"]').textContent`
    );
    assert.ok(
      results.readerQuickAddSecondMsg.includes(language === 'ar' ? 'موجودة من قبل' : 'Already in'),
      `duplicate quick-add message shown: ${results.readerQuickAddSecondMsg}`
    );

    // Close DictionaryLookupModal and close reader without writing into the real PDF file
    await click('[data-dictionary-close]');
    await until(`!document.querySelector('[data-dictionary-lookup-modal]')`);
    await evaluate(`document.querySelector('[data-reader-shared-header] button')?.click()`);
    await until(`!document.querySelector('[data-pdf-header-more]') || !!document.querySelector('[data-save-close-discard]')`);
    if (await evaluate(`!!document.querySelector('[data-save-close-discard]')`)) {
      await click('[data-save-close-discard]');
    }
    await until(`!document.querySelector('[data-pdf-header-more]')`);

    // -------------------------------------------------------------------------
    // Stage 3 (Part B) & Stage 4 (Part B): Quran word lookup quick-add & root card
    // -------------------------------------------------------------------------
    await evaluate(`document.querySelector('[data-nav-item="quran"]')?.click()`);
    await until(`!!document.querySelector('[data-quran-mushaf]') && !!document.querySelector('[data-reader-panel-toggle]')`, 200);
    await click('[data-reader-panel-toggle]');
    await until(`!!document.querySelector('[data-islamic-reader-panel]')`);
    // Click the 'related' tab (4th tab in IslamicReaderPanel) which opens explore (morphology + meanings)
    await evaluate(`document.querySelectorAll('[data-islamic-reader-panel] [role="tab"]')[3].click()`);
    await until(
      `!!document.querySelector('[data-quran-word-quick-add]') && !!document.querySelector('[data-quran-make-root-card]')`,
      200
    );
    await click('[data-quran-word-quick-add]');
    await until(`!!document.querySelector('[data-quran-word-quick-add-status]')`, 100);
    results.quranWordQuickAddMsg = await evaluate(
      `document.querySelector('[data-quran-word-quick-add-status]').textContent`
    );

    await click('[data-quran-make-root-card]');
    await until(`!!document.querySelector('[data-quran-make-root-card-status]')`, 100);
    results.quranRootCardMsg = await evaluate(
      `document.querySelector('[data-quran-make-root-card-status]').textContent`
    );
    await shot('05-quran-word-and-root-quick-add');

    // -------------------------------------------------------------------------
    // Review one card from each deck in SrsReviewScreen
    // -------------------------------------------------------------------------
    await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
    await until(`!!document.querySelector('button[data-notes-tab="cards"]')`);
    await click('button[data-notes-tab="cards"]');
    await until(`!!document.querySelector('[data-deck-manager]')`);
    await shot('06-deck-manager-all-decks');

    const decksToReview = [
      { key: 'lexicon', id: lexiconDeck.id },
      { key: 'roots', id: rootDeck.id },
      { key: 'tafsir', id: tafsirDeck.id },
    ];
    results.reviewed = [];

    for (const d of decksToReview) {
      await until(`!!document.querySelector('[data-deck-study=${JSON.stringify(d.id)}]')`);
      await click(`[data-deck-study=${JSON.stringify(d.id)}]`);
      await until(`!!document.querySelector('[data-srs-review-screen]') && !!document.querySelector('[data-srs-card]')`);
      await click('input[name="srs-confidence-screen"][value="3"]');
      await until(`!document.querySelector('[data-srs-reveal]').disabled`);
      await click('[data-srs-reveal]');
      await until(`!!document.querySelector('[data-srs-rating="3"]')`);
      await shot(`07-review-${d.key}`);
      const cardId = await evaluate(`document.querySelector('[data-srs-card]').getAttribute('data-srs-card')`);
      await click('[data-srs-rating="3"]');
      await pause(400);
      results.reviewed.push({ key: d.key, deckId: d.id, cardId });
      await click('[data-srs-exit-button]');
      await until(`!!document.querySelector('[data-deck-manager]')`);
    }

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon/u.test(line));
    assert.deepEqual(results.rendererErrors, [], `zero renderer errors in ${language}`);

    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[lexicon-live-${language}] passed`, JSON.stringify(results));
    app.exit(0);
  })().catch(error => {
    console.error(`[lexicon-live-${language}] FAILED`, error);
    try {
      fs.writeFileSync(
        path.join(evidence, `error-${language}.txt`),
        String(error && error.stack ? error.stack : error)
      );
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
