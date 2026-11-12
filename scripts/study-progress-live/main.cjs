const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const profile = process.env.BAGLIB_PROGRESS_PROFILE;
const evidence = process.env.BAGLIB_PROGRESS_EVIDENCE;
const lang = process.env.BAGLIB_PROGRESS_LANG || 'ar';
const files = JSON.parse(process.env.BAGLIB_PROGRESS_FILES || '[]');

app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
app.setAsDefaultProtocolClient = () => {
  throw new Error('No protocol registration in live check');
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let started = false;

app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;

  win.webContents.on('console-message', (_, level, message) => {
    console.log(`[renderer console] ${message}`);
  });

  const evaluate = (code) => win.webContents.executeJavaScript(code, true);
  const until = async (code, timeoutMs = 60000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await evaluate(code)) return;
      } catch {}
      await pause(200);
    }
    throw new Error(`Timeout waiting for: ${code}`);
  };

  const shot = async (name) => {
    win.show();
    win.focus();
    win.webContents.focus();
    await pause(600);
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(evidence, `${lang}-${name}.png`), image.toPNG());
  };

  (async () => {
    win.setContentSize(1280, 900);
    win.show();
    win.focus();
    win.webContents.focus();

    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate(`localStorage.setItem('baglib-lang', ${JSON.stringify(lang)})`);
    // KEY-317: since KEY-302 the study-progress module is hidden by default; show it in this throwaway profile, and skip the first-run guide.
    await evaluate("Promise.all([window.electronAPI.settings.set('onboarding.v1',{seen:true}), window.electronAPI.settings.set('dashboard.layout.v1',{version:1,modules:[{id:'today',visible:true},{id:'calendar',visible:true},{id:'readingGoals',visible:false},{id:'activeReads',visible:false},{id:'studyProgress',visible:true},{id:'studyInsights',visible:false},{id:'scratchpad',visible:false},{id:'athan',visible:false},{id:'khatmah',visible:false},{id:'studyRhythm',visible:false}]})])");
    win.reload();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await pause(800);

    // 1. Seed Real PDF books into BagLib
    for (const file of files) {
      const bookId = `real-book-${file.lang}`;
      let books = await evaluate('window.electronAPI.getAllBooks()');
      if (!books.some((b) => b.id === bookId)) {
        await evaluate(
          `window.electronAPI.addBook({ id: ${JSON.stringify(bookId)}, title: ${JSON.stringify(
            (file.lang === 'ar' ? 'كتاب: ' : 'Book: ') + path.basename(file.path)
          )}, bookType: 'digital', digitalFormat: 'PDF', filePath: ${JSON.stringify(file.path)} })`
        );
      }
    }

    // 2. Direct SQLite Seeding of Reading Stats, Pathway, Cards & Practice Attempts
    const dbPath = path.join(profile, 'data', 'baglib.db');
    assert.ok(fs.existsSync(dbPath), 'Database baglib.db exists');
    const db = new Database(dbPath);

    try {
      // Seed Reading Stats for real books
      for (const file of files) {
        const bookId = `real-book-${file.lang}`;
        db.prepare(`
          INSERT OR REPLACE INTO reading_book_stat (id, title, pages, total_read_pages, total_read_time)
          VALUES (?, ?, 100, 5, 450)
        `).run(bookId, path.basename(file.path));

        // Pages with >= 30s dwell (actually read)
        db.prepare(`INSERT OR IGNORE INTO reading_page_stat (id_book, page, start_time, duration, total_pages) VALUES (?, 1, 1000, 120, 100)`).run(bookId);
        db.prepare(`INSERT OR IGNORE INTO reading_page_stat (id_book, page, start_time, duration, total_pages) VALUES (?, 2, 2000, 60, 100)`).run(bookId);
        db.prepare(`INSERT OR IGNORE INTO reading_page_stat (id_book, page, start_time, duration, total_pages) VALUES (?, 3, 3000, 45, 100)`).run(bookId);
        // Pages with < 30s dwell (opened only)
        db.prepare(`INSERT OR IGNORE INTO reading_page_stat (id_book, page, start_time, duration, total_pages) VALUES (?, 4, 4000, 15, 100)`).run(bookId);
        db.prepare(`INSERT OR IGNORE INTO reading_page_stat (id_book, page, start_time, duration, total_pages) VALUES (?, 5, 5000, 10, 100)`).run(bookId);
      }

      // Seed Pathway with 2 sections
      const pathwayId = 'pathway-classical-study';
      db.prepare(`
        INSERT OR REPLACE INTO collection (id, name, description, collection_type)
        VALUES (?, ?, ?, 'curriculum')
      `).run(
        pathwayId,
        lang === 'ar' ? 'منهاج دراسة النصوص الكلاسيكية' : 'Classical Texts Curriculum',
        lang === 'ar' ? 'دراسة متعمقة للمصادر والأساليب' : 'In-depth study of sources and methods'
      );

      db.prepare(`
        INSERT OR REPLACE INTO pathway_item (id, collection_id, section, kind, reference, title, sort_order, created_at)
        VALUES
          ('item-1', ?, 'Section 1: Foundations', 'resource', 'book:real-book-ar#p=1-10', 'Arabic Source Reading', 1, datetime('now')),
          ('item-2', ?, 'Section 2: Analysis', 'resource', 'book:real-book-en#p=1-10', 'English Source Reading', 2, datetime('now'))
      `).run(pathwayId, pathwayId);

      // Seed Cards with Practice Attempts & SRS Schedule
      const baseTime = Date.parse('2026-11-01T10:00:00Z');
      for (const file of files) {
        const bookId = `real-book-${file.lang}`;
        const cardId1 = `card-mastered-${file.lang}`;
        const cardId2 = `card-self-${file.lang}`;

        db.prepare(`
          INSERT OR REPLACE INTO knowledge (id, work_id, knowledge_type, created_at)
          VALUES (?, ?, 'card', datetime('now'))
        `).run(cardId1, bookId);

        db.prepare(`
          INSERT OR REPLACE INTO knowledge (id, work_id, knowledge_type, created_at)
          VALUES (?, ?, 'card', datetime('now'))
        `).run(cardId2, bookId);

        db.prepare(`
          INSERT OR REPLACE INTO card_detail (knowledge_id, front, back, source_kind, source_ref, source_label)
          VALUES
            (?, ?, ?, 'book', ?, 'Section 1: Foundations'),
            (?, ?, ?, 'book', ?, 'Section 2: Analysis')
        `).run(
          cardId1,
          (file.lang === 'ar' ? 'سؤال تحليلي: ' : 'Analytical question: ') + file.passage.slice(0, 60),
          file.passage,
          `book:${bookId}#p=${file.page}`,
          cardId2,
          (file.lang === 'ar' ? 'مراجعة استذكار: ' : 'Recall review: ') + file.passage.slice(0, 60),
          file.passage,
          `book:${bookId}#p=${file.page}`
        );

        // SRS due: cardId1 due today, cardId2 due in 3 days
        db.prepare(`
          INSERT OR REPLACE INTO srs_state (knowledge_id, state, due_at, reps, lapses)
          VALUES
            (?, 'review', datetime('now', '+2 hours'), 4, 0),
            (?, 'review', datetime('now', '+3 days'), 2, 0)
        `).run(cardId1, cardId2);

        // Practice attempts for cardId1 -> achieves Mastered (3 correct + delayed retrieval)
        db.prepare(`
          INSERT OR REPLACE INTO practice_attempt (id, knowledge_id, question_kind, answer_text, result, check_method, context, created_at)
          VALUES
            ('att-${file.lang}-1', ?, 'choice', 'A', 'correct', 'auto', 'practice', ?),
            ('att-${file.lang}-2', ?, 'choice', 'A', 'correct', 'auto', 'practice', ?),
            ('att-${file.lang}-3', ?, 'choice', 'A', 'correct', 'auto', 'practice', ?),
            ('att-${file.lang}-4', ?, 'short', 'A', 'correct', 'judgment', 'challenge', ?)
        `).run(
          cardId1, new Date(baseTime).toISOString(),
          cardId1, new Date(baseTime + 60000).toISOString(),
          cardId1, new Date(baseTime + 120000).toISOString(),
          cardId1, new Date(baseTime + 25 * 3600 * 1000).toISOString()
        );

        // CardId2 has only self ratings (check_method = 'self') -> kept separate!
        db.prepare(`
          INSERT OR REPLACE INTO practice_attempt (id, knowledge_id, question_kind, answer_text, result, check_method, context, created_at)
          VALUES
            ('att-${file.lang}-self', ?, 'recall', 'A', 'correct', 'self', 'practice', datetime('now'))
        `).run(cardId2);
      }
    } finally {
      db.close();
    }

    // Refresh UI to display newly seeded data
    win.reload();
    await until('!!document.querySelector("[data-study-progress-panel]")');
    await pause(1000);

    // 3. Verify Progress Panel and Three Separate Measures
    const hasPanel = await evaluate('!!document.querySelector("[data-study-progress-panel]")');
    assert.ok(hasPanel, 'Progress panel rendered');

    const hasReadingMeasure = await evaluate('!!document.querySelector(\'[data-measure="reading-coverage"]\')');
    assert.ok(hasReadingMeasure, 'Reading coverage measure exists');

    const hasKnowledgeMeasure = await evaluate('!!document.querySelector(\'[data-measure="demonstrated-knowledge"]\')');
    assert.ok(hasKnowledgeMeasure, 'Demonstrated knowledge measure exists');

    const hasReviewsMeasure = await evaluate('!!document.querySelector(\'[data-measure="reviews-due"]\')');
    assert.ok(hasReviewsMeasure, 'Reviews due measure exists');

    const hasSelfRated = await evaluate('!!document.querySelector(\'[data-measure="self-rated"]\')');
    assert.ok(hasSelfRated, 'Self-rated cards kept separate');

    // 4. Capture Desktop 1280px screenshot
    await shot('01-progress-1280');

    // 5. Open InfoTip on Reading Coverage
    await evaluate('document.querySelector(\'[data-info-tip="reading-coverage"]\').click()');
    await pause(300);
    const hasInfoTipBubble = await evaluate('!!document.querySelector("[data-info-tip-text]")');
    assert.ok(hasInfoTipBubble, 'InfoTip tooltip opened on click');
    await shot('02-progress-infotip');
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await pause(200);

    // 6. Switch target in picker to a Book
    await evaluate('document.querySelector("[data-target-picker-trigger]").click()');
    await pause(300);
    await evaluate('document.querySelectorAll("[data-target-picker-menu] button")[1]?.click()');
    await pause(500);
    await shot('03-progress-book-target');

    // 7. Responsive Check at 480px width
    win.setContentSize(480, 850);
    await pause(800);

    const overflow = await evaluate('document.body.scrollWidth > window.innerWidth');
    console.log(`[live] 480px horizontal overflow: ${overflow}`);
    assert.equal(overflow, false, 'No horizontal overflow at 480px');
    await shot('04-progress-480');

    console.log(`[live] All KEY-284 checks passed successfully for ${lang}!`);
    process.exit(0);
  })().catch((err) => {
    console.error(`[live error] ${err.stack || err}`);
    process.exit(1);
  });
});

require('../../dist/main/index.js');
