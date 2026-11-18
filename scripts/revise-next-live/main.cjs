// KEY-412 live check: "Revise next" on the Dashboard and the empty review screen.
// A real book with two real highlights is marked finished. A deck of cards made from the real
// passages gets a review history that is weeks old, written directly to the profile's database:
// the rules depend on days passing, which a live run cannot wait for. Five mastered hadith cards
// are seeded the same way. Then:
//   Dashboard list (backlog with likely-forgotten cards, finished book, narrators)
//   → "Review" opens that deck in the review screen
//   → "Make deck" opens the book deck dialog on that book
//   → "Narrator deck" opens the narrator dialog
//   → dismissing an item survives a reload
//   → the empty review screen shows the list.
// One language per launch, window off-screen (KEY-408).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_RNEXT_PROFILE;
const evidence = process.env.BAGLIB_RNEXT_EVIDENCE;
const language = process.env.BAGLIB_RNEXT_LANG || 'ar';
const realPdf = process.env.BAGLIB_RNEXT_PDF;
const passages = JSON.parse(process.env.BAGLIB_RNEXT_PASSAGES);

app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Seeds an old review history in the profile's database (a second WAL connection, closed afterwards). */
function seed(workId) {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(directory, 'data', 'baglib.db'));
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  const old = '2026-09-01T00:00:00.000Z';
  const day = 86_400_000;
  const now = Date.now();
  const deckName = language === 'ar' ? 'مراجعة الكتاب' : 'Book review';
  const emptyName = language === 'ar' ? 'مجموعة فارغة' : 'Empty deck';
  db.prepare(`INSERT INTO deck (id, name, kind, created_at, updated_at) VALUES ('live-deck', ?, 'normal', ?, ?)`).run(deckName, old, old);
  db.prepare(`INSERT INTO deck (id, name, kind, created_at, updated_at) VALUES ('live-empty', ?, 'normal', ?, ?)`).run(emptyName, old, old);
  const card = (id, front, back, ref, state) => {
    db.prepare(`INSERT INTO knowledge (id, work_id, knowledge_type, created_at, updated_at) VALUES (?, ?, 'card', ?, ?)`).run(id, workId, old, old);
    db.prepare(`INSERT INTO card_detail (knowledge_id, front, back, source_kind, source_ref, source_label) VALUES (?, ?, ?, 'book', ?, NULL)`).run(id, front, back, ref);
    db.prepare(`INSERT INTO srs_state (knowledge_id, state, due_at, stability, difficulty, reps, lapses, last_review) VALUES (?, ?, ?, ?, 5, 3, 0, ?)`)
      .run(id, state.state, state.due, state.stability, state.lastReview);
  };
  // Six cards from the real passages: overdue by a week; four long forgotten (stability 1 day, last seen 30 days ago).
  for (let i = 0; i < 6; i++) {
    const p = passages[i % passages.length];
    const words = p.text.split(' ');
    card(`live-c${i}`, words.slice(0, 4).join(' ') + ' …', p.text, null, {
      state: 'review',
      due: new Date(now - 7 * day).toISOString(),
      stability: i < 4 ? 1 : 400,
      lastReview: new Date(now - 30 * day).toISOString(),
    });
    db.prepare(`INSERT INTO deck_card (deck_id, knowledge_id, position, added_at) VALUES ('live-deck', ?, ?, ?)`).run(`live-c${i}`, i, old);
  }
  // Five mastered hadith (not due), no narrator cards.
  for (let i = 0; i < 5; i++) {
    card(`live-h${i}`, `hadith ${i}`, 'متن', `sunnah-hadith:bukhari:1:${i + 1}`, {
      state: 'review',
      due: new Date(now + 60 * day).toISOString(),
      stability: 60,
      lastReview: new Date(now - 5 * day).toISOString(),
    });
  }
  db.close();
  return { deckName, emptyName };
}

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
  const itemText = id => evaluate(`document.querySelector('[data-revise-next-id=${JSON.stringify(id)}]')?.textContent ?? ''`);
  const goDashboard = async () => {
    await evaluate(`document.querySelector('[data-nav-item="dashboard"]')?.click()`);
    await until(`!!document.querySelector('[data-today-study-panel] [data-revise-next]')`);
  };

  (async () => {
    const results = { language, passages };
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','dark')`);
    await loadApp();
    await until('!!window.electronAPI?.revisionRecommendations && !!document.querySelector("footer")');

    // A real book with two real highlights, marked finished.
    await evaluate(`window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(realPdf)}, copyToStorage: false })`);
    const book = (await evaluate(`window.electronAPI.getAllBooks()`))[0];
    assert.ok(book, 'real book imported');
    results.book = { id: book.id, title: book.title };
    for (const p of passages) {
      await evaluate(`window.electronAPI.saveAnnotation({ bookId: ${JSON.stringify(book.id)}, type: 'highlight', locationCfiOrPage: '${p.page}', selectedText: ${JSON.stringify(p.text)}, color: '#ffeb3b' })`);
    }
    await evaluate(`window.electronAPI.updateReadingStatus(${JSON.stringify(book.id)}, 'completed')`);
    const { deckName, emptyName } = seed(book.id);
    await loadApp();
    await until('!!window.electronAPI?.revisionRecommendations && !!document.querySelector("footer")');

    // 1. Dashboard list.
    await goDashboard();
    await until(`document.querySelectorAll('[data-revise-next-item]').length >= 3`);
    results.items = await evaluate(`[...document.querySelectorAll('[data-revise-next-item]')].map(li => ({ id: li.dataset.reviseNextId, text: li.textContent }))`);
    assert.equal(results.items[0].id, 'backlog:live-deck', 'the backlog with forgotten cards comes first');
    assert.ok(results.items[0].text.includes(deckName) && results.items[0].text.includes('6') && results.items[0].text.includes('4'), `backlog text: ${results.items[0].text}`);
    const finished = await itemText(`finished-book:${book.id}`);
    assert.ok(finished.includes(book.title), `finished book names the real title: ${finished}`);
    assert.ok((await itemText('narrators:mastered')).includes('5'), 'narrators item counts the mastered hadith');
    const dir = await evaluate(`getComputedStyle(document.querySelector('[data-revise-next]')).direction`);
    assert.equal(dir, language === 'ar' ? 'rtl' : 'ltr');
    await shot('01-dashboard-revise-next');

    // 2. "Review" opens the deck in the review screen.
    await click(`[data-revise-next-id="backlog:live-deck"] [data-revise-next-action]`);
    await until(`(document.querySelector('[data-srs-deck-name]')?.textContent ?? '').includes(${JSON.stringify(deckName)})`, 200);
    results.reviewDeck = await evaluate(`document.querySelector('[data-srs-deck-name]').textContent`);
    await shot('02-review-opened');

    // 3. "Make deck" opens the book deck dialog on that book.
    await goDashboard();
    await click(`[data-revise-next-id="finished-book:${book.id}"] [data-revise-next-action]`);
    await until(`document.querySelector('[data-book-deck-dialog] [data-book-deck-book]')?.value === ${JSON.stringify(book.id)}`);
    await shot('03-book-deck-dialog');
    await click('[data-close-book-deck]');

    // 4. "Narrator deck" opens the narrator dialog in the deck manager.
    await goDashboard();
    await click(`[data-revise-next-id="narrators:mastered"] [data-revise-next-action]`);
    await until(`!!document.querySelector('[data-sunnah-deck-dialog]')`, 200);
    await shot('04-narrator-dialog');
    await evaluate(`document.querySelector('[data-sunnah-deck-dialog] button[aria-label]')?.click()`);
    await pause(400);

    // 5. Dismiss survives a reload.
    await goDashboard();
    await click(`[data-revise-next-id="narrators:mastered"] [data-revise-next-dismiss]`);
    await until(`!document.querySelector('[data-revise-next-id="narrators:mastered"]')`);
    await loadApp();
    await until('!!window.electronAPI?.revisionRecommendations && !!document.querySelector("footer")');
    await goDashboard();
    await until(`document.querySelectorAll('[data-revise-next-item]').length >= 2`);
    assert.equal(await evaluate(`!!document.querySelector('[data-revise-next-id="narrators:mastered"]')`), false, 'dismissed item stays hidden after reload');

    // 6. The empty review screen shows the list.
    await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
    await until(`!!document.querySelector('button[data-notes-tab="cards"]')`);
    await evaluate(`window.dispatchEvent(new CustomEvent('baglib:start-review', { detail: { deckId: 'live-empty' } }))`);
    await until(`!!document.querySelector('[data-srs-return-button]') && !!document.querySelector('[data-revise-next] [data-revise-next-item]')`, 200);
    results.emptyReviewItems = await evaluate(`document.querySelectorAll('[data-revise-next] [data-revise-next-item]').length`);
    results.emptyDeck = emptyName;
    await shot('05-empty-review');

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon/u.test(line));
    assert.deepEqual(results.rendererErrors, [], 'no renderer errors');
    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[rnext-live-${language}] passed`, JSON.stringify({ ...results, passages: undefined }));
    app.exit(0);
  })().catch(error => {
    console.error(`[rnext-live-${language}] FAILED`, error);
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
