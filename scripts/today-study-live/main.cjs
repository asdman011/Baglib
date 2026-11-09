const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const profile = process.env.BAGLIB_TODAY_PROFILE;
const evidence = process.env.BAGLIB_TODAY_EVIDENCE;
const lang = process.env.BAGLIB_TODAY_LANG || 'ar';
const files = JSON.parse(process.env.BAGLIB_TODAY_FILES || '[]');

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

  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
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
            (file.lang === 'ar' ? 'كتاب تجريبي: ' : 'Test Book: ') + path.basename(file.path)
          )}, bookType: 'digital', digitalFormat: 'PDF', filePath: ${JSON.stringify(file.path)} })`
        );
      }
    }

    // 2. Seed Knowledge cards from real book passages
    for (const file of files) {
      const card = await evaluate(
        `window.electronAPI.knowledgeCards.save({
          workId: ${JSON.stringify(`real-book-${file.lang}`)},
          sourceKind: 'book',
          sourceRef: ${JSON.stringify(`book:real-book-${file.lang}:p${file.page}`)},
          front: ${JSON.stringify((file.lang === 'ar' ? 'سؤال استذكار: ' : 'Recall question: ') + file.passage.slice(0, 80))},
          back: ${JSON.stringify(file.passage)},
          questionKind: 'recall'
        })`
      );
      if (card && card.id) {
        await evaluate(`window.electronAPI.knowledgeCards.setMemorizing(${JSON.stringify(card.id)}, true)`);
      }
    }

    // 3. Seed Planner tasks via planner.save
    const todayCivil = new Date().toISOString().split('T')[0];
    await evaluate(`window.electronAPI.planner.save({
      title: ${JSON.stringify(lang === 'ar' ? 'مهمة مستحقة اليوم: قراءة الباب الأول' : 'Task due today: Read chapter 1')},
      description: 'Daily study reading',
      status: 'open',
      startDate: null,
      dueDate: ${JSON.stringify(todayCivil)},
      priority: 2,
      sortOrder: 0,
      references: []
    })`);

    await evaluate(`window.electronAPI.planner.save({
      title: ${JSON.stringify(lang === 'ar' ? 'مهمة متأخرة: مراجعة الفهرس' : 'Overdue task: Review index')},
      description: 'Overdue task review',
      status: 'open',
      startDate: null,
      dueDate: '2026-11-01',
      priority: 3,
      sortOrder: 1,
      references: []
    })`);

    await evaluate(`window.electronAPI.planner.save({
      title: ${JSON.stringify(lang === 'ar' ? 'مهمة قادمة: تلخيص النتائج' : 'Upcoming task: Summarize findings')},
      description: 'Upcoming task summary',
      status: 'open',
      startDate: null,
      dueDate: '2026-11-20',
      priority: 1,
      sortOrder: 2,
      references: []
    })`);

    // 4. Seed a Pathway via pathways.save and pathways.addStep
    try {
      const pathway = await evaluate(`window.electronAPI.pathways.save({
        name: ${JSON.stringify(lang === 'ar' ? 'مسار القراءة المتعمقة' : 'Deep Reading Pathway')},
        description: 'Test pathway for study rhythm',
        kind: 'curriculum'
      })`);
      if (pathway && pathway.id) {
        await evaluate(`window.electronAPI.pathways.addStep(
          ${JSON.stringify(pathway.id)},
          'Intro',
          ${JSON.stringify(lang === 'ar' ? 'خطوة المسار الأولى: قراءة التمهيد' : 'Pathway Step 1: Read preface')}
        )`);
      }
    } catch (e) {
      console.warn('Pathway seed warning:', e);
    }

    // 5. Seed SQLite reading_page_stat and srs_review_log for prior days of current week
    const dbPath = path.join(profile, 'data', 'baglib.db');
    if (fs.existsSync(dbPath)) {
      const db = new Database(dbPath);
      try {
        // Find week Saturday
        const now = new Date();
        const satOffset = (now.getDay() + 1) % 7;
        const sat = new Date(now);
        sat.setDate(now.getDate() - satOffset);
        const satStr = sat.toISOString().split('T')[0];

        // Seed reading book stat if needed
        db.prepare(`INSERT OR IGNORE INTO reading_book_stat (id, title) VALUES ('seed-book', 'Seed Book')`).run();

        // Seed 1 active reading session on Saturday (dwell >= 30s)
        const satTime = Math.floor(new Date(`${satStr}T10:00:00Z`).getTime() / 1000);
        db.prepare(
          `INSERT OR IGNORE INTO reading_page_stat (id_book, page, start_time, duration) VALUES ('seed-book', 1, ?, 120)`
        ).run(satTime);

        // Seed 1 active reading session on Sunday
        const sun = new Date(sat);
        sun.setDate(sat.getDate() + 1);
        const sunStr = sun.toISOString().split('T')[0];
        const sunTime = Math.floor(new Date(`${sunStr}T11:00:00Z`).getTime() / 1000);
        db.prepare(
          `INSERT OR IGNORE INTO reading_page_stat (id_book, page, start_time, duration) VALUES ('seed-book', 2, ?, 180)`
        ).run(sunTime);
      } finally {
        db.close();
      }
    }

    // Reload page to display fresh state on Dashboard
    win.reload();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await pause(1000);

    // Navigate to dashboard if not already there
    await until('!!document.querySelector("[data-today-study-panel]")');
    await until('document.querySelectorAll("[data-today-step]").length > 0');

    // Verification 1: Header dates (Hijri and Gregorian)
    const dateText = await evaluate('document.querySelector("[data-today-date-display]")?.textContent');
    assert.ok(dateText && dateText.length > 5, 'Date display must contain text');

    // Verification 2: Weekly Rhythm strip
    const rhythmDaysCount = await evaluate('document.querySelectorAll("[data-rhythm-day]").length');
    assert.equal(rhythmDaysCount, 7, 'Must display exactly 7 days (Saturday to Friday)');

    // Verification 3: Weekly Goal Progress bar
    const goalText = await evaluate('document.querySelector("[data-today-goal-progress]")?.textContent');
    assert.ok(goalText && goalText.length > 0, 'Goal progress text must be rendered');

    // Verification 4: Step Selection (up to 3 steps rendered)
    const initialStepsCount = await evaluate('document.querySelectorAll("[data-today-step]").length');
    assert.ok(initialStepsCount >= 1 && initialStepsCount <= 3, `Expected 1..3 steps, got ${initialStepsCount}`);

    // Verification 5: Actions on steps (open, swap, skip)
    const hasOpenBtn = await evaluate('!!document.querySelector("[data-today-step-open]")');
    assert.ok(hasOpenBtn, 'Step open button must be rendered');

    // Test Swap button if candidates exist
    const hasSwapBtn = await evaluate('!!document.querySelector("[data-today-step-swap]")');
    if (hasSwapBtn) {
      const stepIdBefore = await evaluate('document.querySelector("[data-today-step]")?.dataset.todayStep');
      await click('[data-today-step-swap]');
      await pause(300);
      const stepIdAfter = await evaluate('document.querySelector("[data-today-step]")?.dataset.todayStep');
      // If pool had more candidates, the step ID changed
      console.log(`[live] Swap tested: before=${stepIdBefore}, after=${stepIdAfter}`);
    }

    // Test Skip button
    const hasSkipBtn = await evaluate('!!document.querySelector("[data-today-step-skip]")');
    if (hasSkipBtn) {
      const countBefore = await evaluate('document.querySelectorAll("[data-today-step]").length');
      await click('[data-today-step-skip]');
      await pause(300);
      const countAfter = await evaluate('document.querySelectorAll("[data-today-step]").length');
      console.log(`[live] Skip tested: before=${countBefore}, after=${countAfter}`);
    }

    // Capture 1280px screenshot
    await evaluate("document.querySelector('[data-today-study-panel]').scrollIntoView({ block: 'start' })");
    await shot('panel-1280');

    // Verification 6: Rhythm Settings Modal
    await click('[data-today-settings-button]');
    // Wait for settings modal
    await until('!!document.querySelector("[data-today-settings-modal]")');
    await pause(400);
    await shot('settings-modal');

    // Adjust settings: change goal value
    await evaluate(`(()=>{
      const input = document.querySelector('[data-today-settings-modal] input[type="number"]');
      if (input) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '25');
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);

    // Submit settings form
    await click('[data-today-settings-modal] button[type="submit"]');
    await until('!document.querySelector("[data-today-settings-modal]")');
    await pause(500);

    // Verification 7: Mobile 480px responsive check
    win.setContentSize(480, 900);
    await pause(600);
    await evaluate("document.querySelector('[data-today-study-panel]').scrollIntoView({ block: 'start' })");
    await shot('panel-480');

    // Check no horizontal overflow
    const noOverflow = await evaluate('document.documentElement.scrollWidth <= innerWidth + 2');
    assert.ok(noOverflow, 'Page must not have horizontal scroll at 480px width');

    fs.writeFileSync(
      path.join(evidence, `${lang}-results.json`),
      JSON.stringify(
        {
          passed: true,
          lang,
          dateText,
          rhythmDaysCount,
          initialStepsCount,
          noOverflow,
        },
        null,
        2
      )
    );

    console.log(`[live] Completed checks successfully for ${lang}`);
    app.quit();
  })().catch(async (error) => {
    console.error(error);
    fs.writeFileSync(path.join(evidence, `${lang}-failure.txt`), String(error.stack));
    try {
      fs.writeFileSync(path.join(evidence, `${lang}-failure.html`), await evaluate('document.body.innerHTML'));
      await shot('failure');
    } catch {}
    app.exit(1);
  });
});

require('../../dist/main/index.js');
