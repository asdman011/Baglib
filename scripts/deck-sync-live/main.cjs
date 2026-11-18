// KEY-393 live check: a deck follows a real book's highlights. Through the UI: follow the book,
// then add a highlight (the same IPC call the reader makes) and see the card appear; edit it and
// see the card update; delete it and resolve the orphaned card. One language per launch,
// window off-screen (KEY-408).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_SYNC_PROFILE;
const evidence = process.env.BAGLIB_SYNC_EVIDENCE;
const language = process.env.BAGLIB_SYNC_LANG || 'ar';
const realPdf = process.env.BAGLIB_SYNC_REAL_PDF;

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
  const setSelect = (selector, value) =>
    evaluate(`(()=>{const s=document.querySelector(${JSON.stringify(selector)});const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const openCards = async () => {
    await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
    await until(`!!document.querySelector('button[data-notes-tab="cards"]')`);
    await evaluate(`document.querySelector('button[data-notes-tab="cards"]').click()`);
    await until(`!!document.querySelector('[data-deck-manager]')`);
  };

  (async () => {
    const results = { language };
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','dark')`);
    await loadApp();
    await until('!!window.electronAPI?.deckSync && !!document.querySelector("footer")');

    // A real book in the library.
    await evaluate(`window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(realPdf)}, copyToStorage: false })`);
    const books = await evaluate(`window.electronAPI.getAllBooks()`);
    assert.ok(books.length >= 1, 'real book imported');
    const book = books[0];
    results.book = { id: book.id, title: book.title };
    await loadApp(); // the library list in the UI picks the book up
    await until('!!window.electronAPI?.deckSync && !!document.querySelector("footer")');
    await pause(800);

    const deckName = language === 'ar' ? 'تظليلاتي' : 'My highlights';
    const deck = await evaluate(`window.electronAPI.knowledgeCards.createDeck({ name: ${JSON.stringify(deckName)} })`);
    await openCards();
    await until(`!!document.querySelector('[data-deck-subscriptions=${JSON.stringify(deck.id)}]')`);

    // Follow the book's highlights through the UI.
    await evaluate(`document.querySelector('[data-deck-subscriptions=${JSON.stringify(deck.id)}]').click()`);
    await until(`!!document.querySelector('[data-deck-subscribe-form]')`);
    await setSelect('[data-deck-sync-kind]', 'book_highlights');
    await until(`!!document.querySelector('[data-deck-sync-book] option[value=${JSON.stringify(book.id)}]')`);
    await setSelect('[data-deck-sync-book]', book.id);
    await evaluate(`document.querySelector('[data-deck-subscribe-btn]').click()`);
    await until(`!!document.querySelector('[data-deck-subscription]')`);
    results.subscribeMessage = await evaluate(`document.querySelector('[data-deck-sync-message]')?.textContent ?? ''`);
    await shot('01-subscribed');
    await evaluate(`document.querySelector('[data-close-deck-subscriptions]').click()`);

    // Add a highlight the way the reader does; the card appears in the deck by itself.
    const text1 = language === 'ar' ? 'فرض العين ما يجب على كل مسلم بعينه' : 'Every reader keeps a note of what matters most';
    const saved = await evaluate(
      `window.electronAPI.saveAnnotation({ bookId: ${JSON.stringify(book.id)}, type: 'highlight', locationCfiOrPage: '3', selectedText: ${JSON.stringify(text1)}, color: '#ffeb3b' })`
    );
    await until(`document.querySelector('[data-deck-new=${JSON.stringify(deck.id)}]')?.textContent?.trim() === '1'`, 100);
    results.newCountAfterHighlight = 1;
    const notesAfterAdd = await evaluate(`window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(deck.id)} })`);
    assert.equal(notesAfterAdd.length, 1);
    assert.equal(notesAfterAdd[0].fields.Front, text1);
    await shot('02-card-appeared');

    // Study it: the card shows the highlight.
    await evaluate(`document.querySelector('[data-deck-study=${JSON.stringify(deck.id)}]').click()`);
    await until(`!!document.querySelector('[data-srs-review-screen] [data-srs-card]')`);
    const cards = await evaluate(`window.electronAPI.cardNotes.getCards(${JSON.stringify(notesAfterAdd[0].id)})`);
    assert.ok(cards[0].front.includes(text1.split(' ')[0]), 'the card front holds the highlight');
    await shot('03-review-card');
    await evaluate(`document.querySelector('[data-srs-review-screen] button')?.click()`);
    await evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}))`);
    await until(`!document.querySelector('[data-srs-review-screen]')`).catch(() => {});
    await openCards();

    // Edit the highlight: the card updates in place.
    const text2 = `${text1} ${language === 'ar' ? '(مصحح)' : '(corrected)'}`;
    await evaluate(
      `window.electronAPI.saveAnnotation({ id: ${JSON.stringify(saved.id)}, bookId: ${JSON.stringify(book.id)}, type: 'highlight', locationCfiOrPage: '3', selectedText: ${JSON.stringify(text2)}, color: '#ffeb3b' })`
    );
    await until(`(async()=>{const n=await window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(deck.id)} });return n.length===1&&n[0].fields.Front===${JSON.stringify(text2)};})()`, 100);
    results.editedCardUpdated = true;

    // Delete the highlight: the card is orphaned, the banner asks, and the user keeps it.
    await evaluate(`window.electronAPI.deleteAnnotation(${JSON.stringify(saved.id)})`);
    await until(`!!document.querySelector('[data-sync-review-banner]')`, 100);
    results.bannerText = await evaluate(`document.querySelector('[data-sync-review-banner]').textContent`);
    await evaluate(`document.querySelector('[data-sync-review-banner]').click()`);
    await until(`!!document.querySelector('[data-sync-orphan]')`);
    await shot('04-orphaned-review');
    await evaluate(`document.querySelector('[data-orphan-keep]').click()`);
    await until(`!document.querySelector('[data-sync-orphan]')`);
    results.orphanKept = true;
    await evaluate(`document.querySelector('[data-close-sync-review]').click()`);
    await until(`!document.querySelector('[data-sync-review-banner]')`);

    // KEY-409: follow a real Sunnah bab and a real poem through the pickers (throwaway corpus copies).
    if (process.env.BAGLIB_SYNC_CORPUS === '1') {
      const corpusDeck = await evaluate(`window.electronAPI.knowledgeCards.createDeck({ name: ${JSON.stringify(language === 'ar' ? 'سنة وشعر' : 'Sunnah and poetry')} })`);
      await evaluate(`window.dispatchEvent(new Event('baglib:knowledge-card-saved'))`);
      await until(`!!document.querySelector('[data-deck-subscriptions=${JSON.stringify(corpusDeck.id)}]')`);
      await evaluate(`document.querySelector('[data-deck-subscriptions=${JSON.stringify(corpusDeck.id)}]').click()`);
      await until(`!!document.querySelector('[data-deck-subscribe-form]')`);

      // Sunnah bab: collection, then kitab, then bab.
      await setSelect('[data-deck-sync-kind]', 'sunnah_bab');
      await until(`document.querySelectorAll('[data-deck-sync-collection] option').length > 1`, 300);
      results.sunnahCollection = await evaluate(`document.querySelector('[data-deck-sync-collection] option[value="Bukhari"]') ? 'Bukhari' : document.querySelectorAll('[data-deck-sync-collection] option')[1].value`);
      await setSelect('[data-deck-sync-collection]', results.sunnahCollection);
      await until(`document.querySelectorAll('[data-deck-sync-chapter] option').length > 1`);
      await setSelect('[data-deck-sync-chapter]', await evaluate(`document.querySelectorAll('[data-deck-sync-chapter] option')[1].value`));
      await until(`document.querySelectorAll('[data-deck-sync-bab] option').length > 1`, 300);
      await setSelect('[data-deck-sync-bab]', await evaluate(`document.querySelectorAll('[data-deck-sync-bab] option')[1].value`));
      await until(`!document.querySelector('[data-deck-subscribe-btn]').disabled`);
      await evaluate(`document.querySelector('[data-deck-subscribe-btn]').click()`);
      await until(`document.querySelectorAll('[data-deck-subscription]').length === 1`, 300);
      results.babMessage = await evaluate(`document.querySelector('[data-deck-sync-message]')?.textContent ?? ''`);
      const babNotes = await evaluate(`window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(corpusDeck.id)} })`);
      assert.ok(babNotes.length >= 1, 'the bab brought its hadiths');
      assert.ok(babNotes.every(n => n.noteTypeId === 'stock-hadith-variants' && n.fields.Hadith.trim().length > 0), 'Hadith notes carry the matn');
      results.babHadiths = babNotes.length;
      await shot('05-sunnah-bab');

      // Poem: search, pick, follow.
      await setSelect('[data-deck-sync-kind]', 'poem');
      await until(`!!document.querySelector('[data-deck-sync-poetry-query]')`);
      await evaluate(`(()=>{const i=document.querySelector('[data-deck-sync-poetry-query]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,${JSON.stringify('قفا نبك')});i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await until(`document.querySelectorAll('[data-deck-sync-poetry-pick] option').length > 0`, 300);
      await setSelect('[data-deck-sync-poetry-pick]', await evaluate(`document.querySelectorAll('[data-deck-sync-poetry-pick] option')[0].value`));
      await until(`!document.querySelector('[data-deck-subscribe-btn]').disabled`);
      await evaluate(`document.querySelector('[data-deck-subscribe-btn]').click()`);
      await until(`document.querySelectorAll('[data-deck-subscription]').length === 2`, 300);
      const poemNotes = (await evaluate(`window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(corpusDeck.id)} })`)).filter(n => n.noteTypeId === 'stock-context-cloze');
      assert.equal(poemNotes.length, 1, 'the poem became one note');
      const poemCards = await evaluate(`window.electronAPI.cardNotes.getCards(${JSON.stringify(poemNotes[0].id)})`);
      assert.ok(poemCards.length >= 1, 'one card per bayt');
      results.poemCards = poemCards.length;
      results.subscriptionLabels = await evaluate(`[...document.querySelectorAll('[data-deck-subscription] p.font-semibold')].map(p=>p.textContent)`);
      await shot('06-poem-and-bab-followed');
      await evaluate(`document.querySelector('[data-close-deck-subscriptions]').click()`);
    }

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon/u.test(line));
    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[sync-live-${language}] passed`, JSON.stringify(results));
    app.exit(0);
  })().catch(error => {
    console.error(`[sync-live-${language}] FAILED`, error);
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
