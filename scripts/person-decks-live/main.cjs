// KEY-401 live check: (1) a real book with its author → a biography deck from the deck manager;
// (2) a real Wikipedia lookup in the knowledge-card popover (real network request to Arabic or
// English Wikipedia) → "Make a revision card" → the card holds the article title as written, the
// summary, the link and the edition. One language per launch, window off-screen (KEY-408).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_PERSON_PROFILE;
const evidence = process.env.BAGLIB_PERSON_EVIDENCE;
const language = process.env.BAGLIB_PERSON_LANG || 'ar';
const realPdf = process.env.BAGLIB_PERSON_PDF;
const authorName = process.env.BAGLIB_PERSON_AUTHOR;
const lookup = process.env.BAGLIB_PERSON_LOOKUP;

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
  const setText = (selector, value) =>
    evaluate(`(()=>{const i=document.querySelector(${JSON.stringify(selector)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}));})()`);

  (async () => {
    const results = { language, lookup };
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','dark')`);
    await loadApp();
    await until('!!window.electronAPI?.personDecks && !!document.querySelector("footer")');

    // A real book, with its author set the way the book details form does.
    await evaluate(`window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(realPdf)}, copyToStorage: false })`);
    const book = (await evaluate(`window.electronAPI.getAllBooks()`))[0];
    assert.ok(book, 'real book imported');
    await evaluate(`window.electronAPI.updateBook(${JSON.stringify({ ...book, author: authorName })})`);
    results.book = { title: book.title, author: authorName };
    await loadApp();
    await until('!!window.electronAPI?.personDecks && !!document.querySelector("footer")');
    await pause(800);

    // 1. Biography deck from the deck manager.
    await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
    await until(`!!document.querySelector('button[data-notes-tab="cards"]')`);
    await click('button[data-notes-tab="cards"]');
    await until(`!!document.querySelector('[data-open-person-deck-btn]')`);
    await click('[data-open-person-deck-btn]');
    await until(`!!document.querySelector('[data-person-deck-dialog]')`);
    const deckName = language === 'ar' ? 'تراجم مكتبتي' : 'My library people';
    await setText('[data-person-deck-name]', deckName);
    await shot('01-person-deck-dialog');
    await click('[data-person-deck-create]');
    await until(`!!document.querySelector('[data-person-deck-message]') || !!document.querySelector('[data-person-deck-error]')`, 300);
    assert.equal(await evaluate(`document.querySelector('[data-person-deck-error]')?.textContent ?? ''`), '', 'biography deck without error');
    results.personMessage = await evaluate(`document.querySelector('[data-person-deck-message]').textContent`);
    const deck = (await evaluate(`window.electronAPI.knowledgeCards.deckTree()`)).find(d => d.name === deckName);
    assert.ok(deck, 'biography deck created');
    const people = await evaluate(`window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(deck.id)}, limit: 50 })`);
    // The profile also holds the app's seeded sample books, so every author in the library gets a card.
    assert.ok(people.length >= 2, 'one card per author in the library');
    assert.ok(people.every(p => p.noteTypeId === 'stock-person'));
    const mine = people.find(p => p.fields.Name === authorName);
    assert.ok(mine, `a card for the real book's author: ${people.map(p => p.fields.Name).join(' | ')}`);
    assert.ok(mine.fields.Works.includes(book.title.slice(0, 12).replace(/&/gu, '&amp;')), 'the author’s work in the library');
    assert.ok(!people.some(p => ['غير معروف', 'Unknown Author'].includes(p.fields.Name)), 'no placeholder author');
    results.people = people.map(p => p.fields.Name);
    results.personCard = mine.fields;
    await click('[data-close-person-deck]');

    // 2. A real Wikipedia lookup in the knowledge-card popover → quick-card.
    await evaluate(`window.dispatchEvent(new CustomEvent('baglib:knowledge-card-open', { detail: { text: ${JSON.stringify(lookup)}, context: { kind: 'note' }, x: 640, y: 300 } }))`);
    await until(`!!document.querySelector('[data-knowledge-card]')`);
    const wikiLabel = language === 'ar' ? await evaluate(`document.querySelector('[data-knowledge-card]').textContent`) : '';
    void wikiLabel;
    await until(`[...document.querySelectorAll('[data-knowledge-card] button')].some(b => b.querySelector('svg') && /Wikipedia|ويكيبيديا/u.test(b.textContent))`, 100);
    await evaluate(`[...document.querySelectorAll('[data-knowledge-card] button')].find(b => /Wikipedia|ويكيبيديا/u.test(b.textContent)).click()`);
    await until(`!!document.querySelector('[data-wikipedia-make-card]')`, 150);
    await shot('02-wikipedia-lookup');
    await click('[data-wikipedia-make-card]');
    await until(`!!document.querySelector('[data-wikipedia-card-message]')`, 150);
    results.wikiMessage = await evaluate(`document.querySelector('[data-wikipedia-card-message]').textContent`);
    assert.equal(await evaluate(`document.querySelector('[data-wikipedia-card-message]').getAttribute('role')`), 'status', `quick-card made: ${results.wikiMessage}`);
    const wikiDeck = (await evaluate(`window.electronAPI.knowledgeCards.deckTree()`)).find(d => d.name === (language === 'ar' ? 'ويكيبيديا' : 'Wikipedia'));
    assert.ok(wikiDeck, 'the Wikipedia deck');
    const wiki = (await evaluate(`window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(wikiDeck.id)}, limit: 10 })`))[0];
    assert.ok(wiki && wiki.noteTypeId === 'stock-person', 'a person card');
    assert.ok(wiki.fields.Name.trim() && wiki.fields.Bio.trim().length > 40, 'title and summary');
    const host = lookup.match(/[؀-ۿ]/u) ? 'ar.wikipedia.org' : 'en.wikipedia.org';
    assert.ok(wiki.fields.Source.includes(`https://${host}/`), 'the article link of that edition');
    assert.ok(wiki.fields.Source.includes(language === 'ar' ? 'ويكيبيديا' : 'Wikipedia'), 'the edition is named');
    results.wikiCard = { Name: wiki.fields.Name, Source: wiki.fields.Source, bioStart: wiki.fields.Bio.slice(0, 80) };
    await shot('03-wikipedia-card-made');

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon/u.test(line));
    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[person-live-${language}] passed`, JSON.stringify(results));
    app.exit(0);
  })().catch(error => {
    console.error(`[person-live-${language}] FAILED`, error);
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
