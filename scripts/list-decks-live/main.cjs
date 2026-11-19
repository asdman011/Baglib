// KEY-399 live check (one language per launch, window off-screen per KEY-408): "Revise this list".
//   a mixed personal list (a real PDF book, a Bukhari hadith, a real poem, an ayah) → Notes → Lists
//   → "Revise this list" → a deck with each kind's card → an item added to the list appears in the
//   deck through background sync → the list's right-click menu offers "Revise this list" → the deck
//   is studied in the review screen → no renderer errors.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_LDECK_PROFILE;
const evidence = process.env.BAGLIB_LDECK_EVIDENCE;
const language = process.env.BAGLIB_LDECK_LANG || 'ar';
const pdf = process.env.BAGLIB_LDECK_PDF;

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
  const click = selector => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('missing '+${JSON.stringify(selector)});e.click();})()`);
  const setText = (selector, value) =>
    evaluate(`(()=>{const i=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(String(value))});i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const lists = (action, ...args) => evaluate(`window.electronAPI.personalLists.invoke(${JSON.stringify(action)}, ...${JSON.stringify(args)}).then(r=>{if(!r.ok)throw new Error(r.error);return r.data;})`);
  const deckCards = deckId => evaluate(`(async()=>{const subs=await window.electronAPI.deckSync.list(${JSON.stringify(deckId)});return subs.length?(await window.electronAPI.knowledgeCards.deckTree()).find(d=>d.id===${JSON.stringify(deckId)}):null;})()`);

  (async () => {
    const results = { language };
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','dark')`);
    await evaluate("window.electronAPI.settings.set('onboarding.v1',{seen:true})");
    await loadApp();
    await until('!!window.electronAPI?.personalLists && !!document.querySelector("footer")');

    // 1. A mixed list: a real PDF book, a Bukhari hadith, a real poem and an ayah.
    const book = { id: 'ldeck-book', title: path.basename(pdf, '.pdf'), author: 'عبد الله عزام', bookType: 'digital', digitalFormat: 'PDF', filePath: pdf, categories: [], tags: [], lendingHistory: [] };
    await evaluate(`window.electronAPI.addBook(${JSON.stringify(book)})`);
    const chapter = await evaluate(`window.electronAPI.sunnah.chapter('Bukhari', 1).then(r=>r.data)`);
    const hadith = chapter.hadiths[0];
    const listName = language === 'ar' ? 'خطبة الصبر' : 'Patience khutbah';
    const list = await lists('create', listName);
    await lists('add', list.id, { itemKind: 'book', itemRef: 'book:ldeck-book', label: book.title });
    await lists('add', list.id, { itemKind: 'hadith', itemRef: `sunnah:Bukhari:1:${hadith.id}`, label: (hadith.text.ar.matn || hadith.text.ar.full).slice(0, 120) });
    await lists('add', list.id, { itemKind: 'poem', itemRef: 'poetry:ashaar:1:0:0', label: 'poem 1' });
    await lists('add', list.id, { itemKind: 'ayah', itemRef: 'quran:hafs:2:153', label: '2:153' });

    // 2. Notes → Lists → "Revise this list".
    await click('[data-nav-item="notes"]');
    await until(`!!document.querySelector('button[data-notes-tab="lists"]')`);
    await click('button[data-notes-tab="lists"]');
    await until(`!!document.querySelector('[data-lists-open="${list.id}"]')`);
    await click(`[data-lists-open="${list.id}"]`);
    await until(`document.querySelectorAll('[data-lists-item]').length===4`);
    // The list's right-click menu offers it too.
    await evaluate(`(()=>{const e=document.querySelector('[data-lists-row="${list.id}"]');const r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.x+30,clientY:r.y+10}));})()`);
    const reviseLabel = language === 'ar' ? 'راجِع هذه القائمة' : 'Revise this list';
    await until(`[...document.querySelectorAll('[role=menuitem]')].some(e=>e.textContent.includes(${JSON.stringify(reviseLabel)}))`);
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await pause(300);
    await click(`[data-lists-revise="${list.id}"]`);
    await until(`!!document.querySelector('[data-list-deck-dialog] [data-list-deck-create]')`);
    results.dialogDir = await evaluate(`getComputedStyle(document.querySelector('[data-list-deck-dialog]')).direction`);
    assert.equal(results.dialogDir, language === 'ar' ? 'rtl' : 'ltr');
    assert.equal(await evaluate(`document.querySelector('[data-list-deck-name]').value`), listName, 'the deck is named after the list');
    await shot('01-revise-this-list');
    await click('[data-list-deck-create]');
    await until(`!!document.querySelector('[data-list-deck-message]') || !!document.querySelector('[data-list-deck-error]')`, 300);
    assert.equal(await evaluate(`!!document.querySelector('[data-list-deck-error]')`), false, await evaluate(`document.querySelector('[data-list-deck-error]')?.textContent||''`));
    results.created = await evaluate(`document.querySelector('[data-list-deck-message]').textContent`);
    const sub = (await evaluate(`window.electronAPI.deckSync.list()`)).find(s => s.sourceKind === 'list' && s.sourceRef === list.id);
    assert.ok(sub, 'the deck follows the list');
    let deck = await deckCards(sub.deckId);
    results.cardsAfterCreate = deck ? deck.newCount : null;
    assert.ok(deck && deck.newCount >= 3, `cards made from the mixed list: ${JSON.stringify(deck)}`);
    await shot('02-deck-created');
    await click('[data-close-list-deck]');

    // 3. Add an item to the list → the background sync adds its card.
    await lists('add', list.id, { itemKind: 'ayah', itemRef: 'quran:hafs:2:255', label: '2:255' });
    const before = results.cardsAfterCreate;
    await until(`(async()=>{const d=(await window.electronAPI.knowledgeCards.deckTree()).find(x=>x.id===${JSON.stringify(sub.deckId)});return d&&d.newCount>${before};})()`, 100);
    deck = await deckCards(sub.deckId);
    results.cardsAfterAdd = deck.newCount;

    // 4. Study the deck: the first new card is the first list item.
    await click('button[data-notes-tab="cards"]');
    await until(`!!document.querySelector('[data-deck-study=${JSON.stringify(sub.deckId)}]')`);
    await shot('03-deck-in-manager');
    await click(`[data-deck-study=${JSON.stringify(sub.deckId)}]`);
    await until(`!!document.querySelector('[data-srs-review-screen]')`);
    await pause(800);
    results.firstCard = (await evaluate(`(document.querySelector('[data-srs-card]')||document.querySelector('[data-srs-review-screen]')).textContent`)).replace(/\s+/gu, ' ').slice(0, 160);
    await shot('04-review-first-card');

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon|reminder check failed/iu.test(line));
    assert.deepEqual(results.rendererErrors, [], 'no renderer errors');
    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[list-decks-live-${language}] passed`, JSON.stringify(results));
    app.exit(0);
  })().catch(error => {
    console.error(`[list-decks-live-${language}] FAILED`, error);
    try {
      fs.writeFileSync(path.join(evidence, `error-${language}.txt`), String(error && error.stack ? error.stack : error) + '\n' + JSON.stringify(errors, null, 2));
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
