// KEY-396 live check: from the Sunnah reader, right-click a kitab → "Add this book as a revision
// deck" with the three card templates, then a narrator deck with chosen fields. Real hadith data
// (the linked Sunnah research corpus). One language per launch, window off-screen (KEY-408).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_SDECK_PROFILE;
const evidence = process.env.BAGLIB_SDECK_EVIDENCE;
const language = process.env.BAGLIB_SDECK_LANG || 'ar';

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
  const rightClick = selector =>
    evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+Math.min(r.height/2,30)}));})()`);
  const setText = (selector, value) =>
    evaluate(`(()=>{const i=document.querySelector(${JSON.stringify(selector)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}));})()`);

  (async () => {
    const results = { language };
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','dark')`);
    await loadApp();
    await until('!!window.electronAPI?.deckSync && !!document.querySelector("footer")');
    await pause(800);

    // Open the Sunnah reader; it starts on the first kitab of the first collection.
    await evaluate(`window.dispatchEvent(new Event('baglib:sunnah-open'))`);
    await until(`!!document.querySelector('[data-sunnah-chapter-heading]') && !!document.querySelector('[data-hadith-id]')`, 400);
    await pause(800);

    // 1. Right-click the kitab heading → "Add this book as a revision deck", all three cards.
    await rightClick('[data-sunnah-chapter-heading]');
    await until(`!!document.querySelector('[data-menu-action="deck-book"]')`);
    await shot('01-kitab-menu');
    await evaluate(`document.querySelector('[data-menu-action="deck-book"]').click()`);
    await until(`!!document.querySelector('[data-sunnah-deck-dialog]')`);
    results.bookLabel = await evaluate(`document.querySelector('[data-sunnah-deck-dialog] p[dir="auto"]').textContent`);
    const deckName = language === 'ar' ? `حفظ ${Date.now() % 1000}` : `Memorise ${Date.now() % 1000}`;
    await setText('[data-sunnah-deck-name]', deckName);
    for (const card of ['matn', 'isnad']) await evaluate(`document.querySelector('[data-sunnah-deck-card="${card}"]').click()`);
    await shot('02-hadith-deck-dialog');
    await evaluate(`document.querySelector('[data-sunnah-deck-create]').click()`);
    await until(`!!document.querySelector('[data-sunnah-deck-message]') || !!document.querySelector('[data-sunnah-deck-error]')`, 600);
    const error = await evaluate(`document.querySelector('[data-sunnah-deck-error]')?.textContent ?? ''`);
    assert.equal(error, '', `hadith deck created without error: ${error}`);
    results.hadithMessage = await evaluate(`document.querySelector('[data-sunnah-deck-message]').textContent`);

    const decks = await evaluate(`window.electronAPI.knowledgeCards.deckTree()`);
    const deck = decks.find(d => d.name === deckName);
    assert.ok(deck, 'deck created');
    const notes = await evaluate(`window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(deck.id)}, limit: 500 })`);
    assert.ok(notes.length >= 1, 'hadith notes created');
    assert.ok(notes.every(n => n.noteTypeId === 'stock-hadith-variants'), 'variants type');
    const withIsnad = notes.find(n => n.fields.Isnad && n.fields.Isnad.trim());
    assert.ok(withIsnad, 'real hadiths carry a separate isnad');
    const cards = await evaluate(`window.electronAPI.cardNotes.getCards(${JSON.stringify(withIsnad.id)})`);
    results.hadithNotes = notes.length;
    results.cardsForOneHadith = cards.length;
    assert.equal(cards.length, 3, 'bab → isnad and matn, bab → matn, isnad → matn');
    // Verbatim: the Matn field holds the corpus matn exactly (only & < > escaped).
    assert.ok(!/<(?!br)/u.test(withIsnad.fields.Matn), 'no markup injected into the matn');

    // 2. Narrator deck for the same kitab, with teachers added to the default fields.
    await evaluate(`document.querySelector('[data-sunnah-deck-mode="narrator"]').click()`);
    await until(`!!document.querySelector('[data-narrator-field="teachers"]')`);
    await setText('[data-sunnah-deck-name]', `${deckName} — ${language === 'ar' ? 'الرواة' : 'narrators'}`);
    await evaluate(`document.querySelector('[data-narrator-field="teachers"]').click()`);
    await shot('03-narrator-dialog');
    await evaluate(`document.querySelector('[data-narrator-deck-create]').click()`);
    await until(`(document.querySelector('[data-sunnah-deck-message]')?.textContent ?? '').includes('${language === 'ar' ? 'راويًا' : 'narrators'}') || !!document.querySelector('[data-sunnah-deck-error]')`, 900);
    const narratorError = await evaluate(`document.querySelector('[data-sunnah-deck-error]')?.textContent ?? ''`);
    assert.equal(narratorError, '', `narrator deck created without error: ${narratorError}`);
    results.narratorMessage = await evaluate(`document.querySelector('[data-sunnah-deck-message]').textContent`);
    const narratorDeck = (await evaluate(`window.electronAPI.knowledgeCards.deckTree()`)).find(d => d.name.endsWith(language === 'ar' ? 'الرواة' : 'narrators'));
    assert.ok(narratorDeck, 'narrator deck created');
    const narratorNotes = await evaluate(`window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(narratorDeck.id)}, limit: 500 })`);
    assert.ok(narratorNotes.length >= 1, 'narrator notes created');
    assert.ok(narratorNotes.every(n => n.noteTypeId === 'stock-narrator' && n.fields.Name.trim()), 'every narrator card has a name');
    assert.ok(narratorNotes.every(n => n.fields.Laqab === ''), 'laqab was not chosen, so it is empty');
    assert.ok(narratorNotes.some(n => n.fields.Teachers.trim()), 'teachers were chosen and filled where known');
    results.narrators = narratorNotes.length;
    results.sampleNarrator = { name: narratorNotes[0].fields.Name, grade: narratorNotes[0].fields.Grade };
    await shot('04-narrator-done');
    await evaluate(`document.querySelector('[data-close-sunnah-deck]').click()`);

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon/u.test(line));
    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[sdeck-live-${language}] passed`, JSON.stringify(results));
    app.exit(0);
  })().catch(error => {
    console.error(`[sdeck-live-${language}] FAILED`, error);
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
