// KEY-410 live check (one language per launch, window off-screen per KEY-408): following a
// dictionary and a personal list from the deck manager's "follow a source" window.
//   the REAL repos/arabic_lexicons-main.zip is imported (KEY-413 path) → a deck follows
//   al-Muʿjam al-Wasīṭ, words starting with كت, at most 20 → cards appear; "Sync now" adds nothing
//   new → a second deck follows a personal list holding a real PDF → its card appears → no
//   renderer errors.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_LEXSYNC_PROFILE;
const evidence = process.env.BAGLIB_LEXSYNC_EVIDENCE;
const language = process.env.BAGLIB_LEXSYNC_LANG || 'ar';
const packZip = process.env.BAGLIB_LEXSYNC_ZIP;
const pdf = process.env.BAGLIB_LEXSYNC_PDF;

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
  const setValue = (selector, value) =>
    evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const deckNode = id => evaluate(`(async()=>{const walk=(ns)=>{for(const n of ns){if(n.id===${JSON.stringify(id)})return n;const f=walk(n.children||[]);if(f)return f;}return null;};return walk(await window.electronAPI.knowledgeCards.deckTree());})()`);
  const openFollow = async deckId => {
    await click('button[data-notes-tab="cards"]');
    await until(`!!document.querySelector('[data-deck-subscriptions=${JSON.stringify(deckId)}]')`);
    await click(`[data-deck-subscriptions=${JSON.stringify(deckId)}]`);
    await until(`!!document.querySelector('[data-deck-subscriptions-modal] [data-deck-sync-kind]')`);
  };

  (async () => {
    const results = { language };
    owner.setContentSize(1280, 920);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','dark')`);
    await evaluate("window.electronAPI.settings.set('onboarding.v1',{seen:true})");
    await loadApp();
    await until('!!window.electronAPI?.deckSync && !!document.querySelector("footer")');

    const imported = await evaluate(`window.electronAPI.dictionaryImportArabicLexicons({ sourcePath: ${JSON.stringify(packZip)}, lang: ${JSON.stringify(language)} })`);
    assert.ok(Array.isArray(imported) && imported.length === 11, '11 dictionaries imported');
    const wordsDeck = await evaluate(`window.electronAPI.knowledgeCards.createDeck({ name: ${JSON.stringify(language === 'ar' ? 'مفردات الوسيط — كت' : 'Wasit words — كت')} })`);
    const listDeck = await evaluate(`window.electronAPI.knowledgeCards.createDeck({ name: ${JSON.stringify(language === 'ar' ? 'قائمة القراءة' : 'Reading list')} })`);
    const book = { id: 'lexsync-book', title: path.basename(pdf, '.pdf'), author: 'عبد الله عزام', bookType: 'digital', digitalFormat: 'PDF', filePath: pdf, categories: [], tags: [], lendingHistory: [] };
    await evaluate(`window.electronAPI.addBook(${JSON.stringify(book)})`);
    const list = await evaluate(`window.electronAPI.personalLists.invoke('create', ${JSON.stringify(language === 'ar' ? 'للقراءة' : 'To read')}).then(r=>r.data)`);
    await evaluate(`window.electronAPI.personalLists.invoke('add', ${JSON.stringify(list.id)}, { itemKind: 'book', itemRef: 'book:lexsync-book', label: ${JSON.stringify(book.title)} })`);

    // 1. A deck follows al-Wasīṭ, words starting with كت, at most 20.
    await click('[data-nav-item="notes"]');
    await until(`!!document.querySelector('button[data-notes-tab="cards"]')`);
    await openFollow(wordsDeck.id);
    results.modalDir = await evaluate(`getComputedStyle(document.querySelector('[data-deck-subscriptions-modal]')).direction`);
    assert.equal(results.modalDir, language === 'ar' ? 'rtl' : 'ltr');
    await setValue('[data-deck-sync-kind]', 'lexicon');
    await until(`document.querySelectorAll('[data-deck-sync-dictionary] option').length > 5`);
    await setValue('[data-deck-sync-dictionary]', 'arlex-wasit');
    await setValue('[data-deck-sync-prefix]', 'كت');
    await setValue('[data-deck-sync-limit]', '20');
    await until(`!document.querySelector('[data-deck-subscribe-btn]').disabled`);
    await shot('01-follow-dictionary');
    await click('[data-deck-subscribe-btn]');
    await until(`!!document.querySelector('[data-deck-sync-message]')`, 300);
    results.lexiconMessage = await evaluate(`document.querySelector('[data-deck-sync-message]').textContent`);
    const words = await deckNode(wordsDeck.id);
    results.lexiconCards = words.newCount;
    assert.ok(words.newCount >= 5 && words.newCount <= 20, `dictionary cards: ${words.newCount}`);
    const sub = (await evaluate(`window.electronAPI.deckSync.list(${JSON.stringify(wordsDeck.id)})`))[0];
    assert.equal(sub.sourceKind, 'lexicon');
    assert.deepEqual(sub.lexicon, { prefix: 'كت', limit: 20 });
    const again = await evaluate(`window.electronAPI.deckSync.syncNow(${JSON.stringify(sub.id)})`);
    results.resync = { added: again.added, unchanged: again.unchanged, orphaned: again.orphaned };
    assert.equal(again.added + again.orphaned, 0, 'a second sync changes nothing');
    await shot('02-dictionary-followed');
    await click('[data-close-deck-subscriptions]');

    // 2. A second deck follows a personal list from the same window.
    await openFollow(listDeck.id);
    await setValue('[data-deck-sync-kind]', 'list');
    await until(`!!document.querySelector('[data-deck-sync-list] option[value=${JSON.stringify(list.id)}]')`);
    await setValue('[data-deck-sync-list]', list.id);
    await until(`!document.querySelector('[data-deck-subscribe-btn]').disabled`);
    await click('[data-deck-subscribe-btn]');
    await until(`!!document.querySelector('[data-deck-sync-message]')`, 300);
    const listNode = await deckNode(listDeck.id);
    results.listCards = listNode.newCount;
    assert.equal(listNode.newCount, 1, 'the book in the list made one card');
    await shot('03-list-followed');
    await click('[data-close-deck-subscriptions]');

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon|reminder check failed/iu.test(line));
    assert.deepEqual(results.rendererErrors, [], 'no renderer errors');
    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[lexicon-sync-live-${language}] passed`, JSON.stringify(results));
    app.exit(0);
  })().catch(error => {
    console.error(`[lexicon-sync-live-${language}] FAILED`, error);
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
