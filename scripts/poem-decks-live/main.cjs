// KEY-397 live check: in the poetry reader, right-click a real long poem's title → "Add this poem as
// a revision deck", verse by verse with 6 new verses a day; then check the cards, the day's queue
// (the first six bayts, in order) and the card in the review screen. Then a whole-poem deck for
// the poet from the poet's name. Real poetry data (a throwaway copy of the installed partition).
// One language per launch, window off-screen (KEY-408).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_PDECK_PROFILE;
const evidence = process.env.BAGLIB_PDECK_EVIDENCE;
const language = process.env.BAGLIB_PDECK_LANG || 'ar';

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

    // Open al-Bayan and a real long poem: Imru' al-Qays's mu'allaqa.
    await click('[data-nav-item="bayan"]');
    await until(`!!document.querySelector('input[type="search"]')`, 300);
    await setText('input[type="search"]', 'قفا نبك من ذكرى حبيب ومنزل');
    await until(`!!document.querySelector('article h2 button')`, 300);
    await click('article h2 button');
    await until(`!!document.querySelector('[data-poem-heading]') && document.querySelectorAll('[data-poetry-row]').length > 20`, 300);
    results.poemTitle = await evaluate(`document.querySelector('[data-poem-heading]').textContent`);
    results.poemRows = await evaluate(`document.querySelectorAll('[data-poetry-row]').length`);
    await pause(600);

    // 1. Right-click the title → verse-by-verse deck, ajuz hidden, 6 new verses a day.
    await rightClick('[data-poem-heading]');
    await until(`!!document.querySelector('[data-menu-action="deck-poem"]') && !!document.querySelector('[data-menu-action="deck-poet"]')`);
    await shot('01-poem-menu');
    await click('[data-menu-action="deck-poem"]');
    await until(`!!document.querySelector('[data-poem-deck-dialog]')`);
    const deckName = language === 'ar' ? `حفظ المعلقة ${Date.now() % 1000}` : `Learn the Mu'allaqa ${Date.now() % 1000}`;
    await setText('[data-poem-deck-name]', deckName);
    await setText('[data-poem-deck-per-day]', '6');
    await shot('02-poem-deck-dialog');
    await click('[data-poem-deck-create]');
    await until(`!!document.querySelector('[data-poem-deck-message]') || !!document.querySelector('[data-poem-deck-error]')`, 600);
    const error = await evaluate(`document.querySelector('[data-poem-deck-error]')?.textContent ?? ''`);
    assert.equal(error, '', `poem deck created without error: ${error}`);
    results.poemMessage = await evaluate(`document.querySelector('[data-poem-deck-message]').textContent`);

    const deck = (await evaluate(`window.electronAPI.knowledgeCards.deckTree()`)).find(d => d.name === deckName);
    assert.ok(deck, 'deck created');
    const notes = await evaluate(`window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(deck.id)}, limit: 50 })`);
    assert.equal(notes.length, 1, 'the poem is one note');
    assert.equal(notes[0].noteTypeId, 'stock-context-cloze');
    assert.equal(notes[0].fields.Chunk, '6');
    assert.equal(notes[0].fields['Whole verse'], '');
    const cards = (await evaluate(`window.electronAPI.cardNotes.getCards(${JSON.stringify(notes[0].id)})`)).sort((a, b) => a.ord - b.ord);
    results.bayts = cards.length;
    assert.ok(cards.length >= 20, 'a long poem: one card per bayt');

    const queue = await evaluate(`window.electronAPI.knowledgeCards.reviewQueue(${JSON.stringify(deck.id)})`);
    const fresh = queue.cards.filter(c => c.state === 'new');
    results.newToday = fresh.length;
    assert.equal(fresh.length, 6, 'six new verses today');
    const cardIdOf = c => c.knowledgeId ?? c.id;
    assert.deepEqual(
      fresh.map(c => cards.findIndex(x => cardIdOf(x) === c.id)),
      [0, 1, 2, 3, 4, 5],
      'the first six bayts, in order'
    );
    const second = fresh[1];
    assert.ok(second.front.includes('class="context-before"') && second.front.includes('class="bayt"'), 'previous bayt as the anchor, hemistich layout');
    assert.ok(second.front.includes('class="cloze"'), 'the ajuz is hidden');
    assert.ok(second.back.includes('class="cloze"') && !second.back.includes('[...]'), 'the back reveals it');

    // 2. The card in the review screen (RTL hemistichs, diacritics).
    await evaluate(`document.querySelector('[data-close-poem-deck]').click()`);
    await click('[data-nav-item="notes"]');
    await until('!!document.querySelector("[data-notes-tab=notes]")', 300);
    await evaluate(`window.dispatchEvent(new CustomEvent('baglib:start-review', { detail: { deckId: ${JSON.stringify(deck.id)} } }))`);
    await until(`[...document.querySelectorAll('[data-srs-review] iframe')].some(f => (f.getAttribute('srcdoc') ?? '').includes('class="bayt"'))`, 300);
    await shot('03-review-front');
    results.reviewDir = await evaluate(`document.querySelector('[data-srs-review]').dir`);
    assert.equal(results.reviewDir, language === 'ar' ? 'rtl' : 'ltr');

    // 3. Back in the poem: a whole-poem deck for every poem of the poet, from the poet's name.
    await click('[data-nav-item="bayan"]');
    await until(`!!document.querySelector('article h2 button') || !!document.querySelector('[data-poem-poet]')`, 300);
    if (!(await evaluate(`!!document.querySelector('[data-poem-poet]')`))) {
      await click('article h2 button');
      await until(`!!document.querySelector('[data-poem-poet]')`, 300);
    }
    await rightClick('[data-poem-poet]');
    await until(`!!document.querySelector('[data-menu-action="deck-poet"]')`);
    await click('[data-menu-action="deck-poet"]');
    await until(`!!document.querySelector('[data-poem-deck-dialog]')`);
    const poetDeckName = `${deckName} — ${language === 'ar' ? 'الديوان' : 'diwan'}`;
    await setText('[data-poem-deck-name]', poetDeckName);
    await click('[data-poem-deck-option="layout:whole"]');
    await until(`!document.querySelector('[data-poem-deck-per-day]')`);
    await shot('04-poet-deck-dialog');
    await click('[data-poem-deck-create]');
    await until(`!!document.querySelector('[data-poem-deck-message]') || !!document.querySelector('[data-poem-deck-error]')`, 1500);
    const poetError = await evaluate(`document.querySelector('[data-poem-deck-error]')?.textContent ?? ''`);
    assert.equal(poetError, '', `poet deck created without error: ${poetError}`);
    results.poetMessage = await evaluate(`document.querySelector('[data-poem-deck-message]').textContent`);
    const poetDeck = (await evaluate(`window.electronAPI.knowledgeCards.deckTree()`)).find(d => d.name === poetDeckName);
    assert.ok(poetDeck, 'poet deck created');
    const poetNotes = await evaluate(`window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(poetDeck.id)}, limit: 500 })`);
    results.poetPoems = poetNotes.length;
    assert.ok(poetNotes.length >= 2, 'every poem of the poet');
    assert.ok(poetNotes.every(n => n.noteTypeId === 'stock-poem-whole' && n.fields.Title.trim() && /class="(bayt|verse)"/u.test(n.fields.Poem)), 'whole-poem notes, every poem laid out');
    results.poetPoemsInBayts = poetNotes.filter(n => n.fields.Poem.includes('class="bayt"')).length;
    assert.ok(results.poetPoemsInBayts >= 1, 'bayt poems as two hemistichs');
    await shot('05-poet-deck-done');
    await click('[data-close-poem-deck]');

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon/u.test(line));
    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[pdeck-live-${language}] passed`, JSON.stringify(results));
    app.exit(0);
  })().catch(error => {
    console.error(`[pdeck-live-${language}] FAILED`, error);
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
