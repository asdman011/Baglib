const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const profile = process.env.BAGLIB_PREREQ_PROFILE;
const evidence = process.env.BAGLIB_PREREQ_EVIDENCE;
const lang = process.env.BAGLIB_PREREQ_LANG || 'ar';
const coursePdfs = JSON.parse(process.env.BAGLIB_COURSE_PDFS || '[]');

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
    console.log(`[live] Captured ${lang}-${name}.png`);
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

    // 1. Seed Real Statistics Books
    for (const pdf of coursePdfs) {
      let books = await evaluate('window.electronAPI.getAllBooks()');
      if (!books.some((b) => b.id === pdf.id)) {
        await evaluate(
          `window.electronAPI.addBook({ id: ${JSON.stringify(pdf.id)}, title: ${JSON.stringify(
            pdf.title
          )}, bookType: 'digital', digitalFormat: 'PDF', filePath: ${JSON.stringify(pdf.filePath)} })`
        );
      }
    }

    // 2. Direct SQLite Seeding of Curriculum, Items, Prereqs, Cards & Failures
    const dbPath = path.join(profile, 'data', 'baglib.db');
    assert.ok(fs.existsSync(dbPath), 'Database baglib.db exists');
    const db = new Database(dbPath);

    const isAr = lang === 'ar';
    const pathwayId = 'pathway-statistics-econometrics';
    const pathwayName = isAr
      ? 'منهاج الإحصاء الرياضي والاقتصاد القياسي'
      : 'Mathematical Statistics & Econometrics Curriculum';
    const pathwayDesc = isAr
      ? 'مسار دراسي متكامل من التباين والتغاير إلى نماذج الانحدار'
      : 'Complete curriculum from variance and covariance to regression models';

    const secVariance = isAr ? 'التباين' : 'Variance';
    const secCovariance = isAr ? 'التغاير' : 'Covariance';
    const secRegression = isAr ? 'الانحدار' : 'Regression';

    try {
      db.prepare(`
        INSERT OR REPLACE INTO collection (id, name, description, collection_type)
        VALUES (?, ?, ?, 'curriculum')
      `).run(pathwayId, pathwayName, pathwayDesc);

      db.prepare(`
        INSERT OR REPLACE INTO pathway_item (id, collection_id, section, kind, reference, title, sort_order, created_at)
        VALUES
          ('item-v', ?, ?, 'resource', 'book:stat-guide#p=1-5', ?, 1, datetime('now')),
          ('item-c', ?, ?, 'resource', 'book:stat-guide#p=6-10', ?, 2, datetime('now')),
          ('item-r', ?, ?, 'resource', 'book:econ-guide#p=1-15', ?, 3, datetime('now'))
      `).run(
        pathwayId,
        secVariance,
        isAr ? 'قراءة التباين والانحراف المعياري' : 'Reading Variance & Standard Deviation',
        pathwayId,
        secCovariance,
        isAr ? 'قراءة التغاير والارتباط المشترك' : 'Reading Covariance & Joint Correlation',
        pathwayId,
        secRegression,
        isAr ? 'قراءة نموذج الانحدار الخطي' : 'Reading Linear Regression Models'
      );

      // Save initial prerequisites:
      // Covariance -> Variance
      // Regression -> Covariance, Variance
      const prereqsKey = `pathways.prerequisites.v1:${pathwayId}`;
      const prereqsMap = {
        [secCovariance]: [secVariance],
        [secRegression]: [secCovariance, secVariance],
      };
      db.prepare(`
        INSERT OR REPLACE INTO app_settings (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
      `).run(prereqsKey, JSON.stringify(prereqsMap));

      // Seed Cards
      // Variance: 1 card, 0 attempts (not_started -> weakest prerequisite!)
      db.prepare(`INSERT OR REPLACE INTO knowledge (id, created_at) VALUES ('card-v', datetime('now'))`).run();
      db.prepare(`INSERT OR REPLACE INTO card_detail (knowledge_id, front, back, source_kind, source_label) VALUES ('card-v', 'What is sample variance?', 'Measure of dispersion', 'note', ?)`).run(secVariance);

      // Covariance: 1 card, 2 correct attempts (familiar)
      db.prepare(`INSERT OR REPLACE INTO knowledge (id, created_at) VALUES ('card-c', datetime('now'))`).run();
      db.prepare(`INSERT OR REPLACE INTO card_detail (knowledge_id, front, back, source_kind, source_label) VALUES ('card-c', 'What does covariance indicate?', 'Direction of linear relationship', 'note', ?)`).run(secCovariance);
      db.prepare(`INSERT OR REPLACE INTO practice_attempt (id, knowledge_id, question_kind, result, check_method, created_at) VALUES ('att-c1', 'card-c', 'recall', 'correct', 'auto', datetime('now')), ('att-c2', 'card-c', 'recall', 'correct', 'auto', datetime('now'))`).run();

      // Regression: 1 card with 2 lapses / failures (struggling -> triggers revisit hint!)
      db.prepare(`INSERT OR REPLACE INTO knowledge (id, created_at) VALUES ('card-r', datetime('now'))`).run();
      db.prepare(`INSERT OR REPLACE INTO card_detail (knowledge_id, front, back, source_kind, source_label) VALUES ('card-r', 'How is regression slope computed?', 'Cov(X,Y) / Var(X)', 'note', ?)`).run(secRegression);
      db.prepare(`INSERT OR REPLACE INTO srs_state (knowledge_id, state, due_at, reps, lapses) VALUES ('card-r', 'relearning', datetime('now'), 3, 2)`).run();
      db.prepare(`INSERT OR REPLACE INTO practice_attempt (id, knowledge_id, question_kind, result, check_method, created_at) VALUES ('att-r1', 'card-r', 'recall', 'incorrect', 'auto', datetime('now'))`).run();
    } finally {
      db.close();
    }

    // Refresh view
    win.reload();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await pause(1000);

    // -------------------------------------------------------------------------
    // Phase 1: Verify Today Panel Revisit Hint (1280px)
    // -------------------------------------------------------------------------
    win.setContentSize(1280, 900);
    await pause(800);

    await until('!!document.querySelector("[data-today-prereq-hint]")');
    const hintText = await evaluate('document.querySelector("[data-today-prereq-hint]").innerText');
    console.log(`[live] Found Today Revisit Hint: ${hintText.replace(/\n+/g, ' ')}`);
    assert.ok(hintText.includes(secVariance), 'Hint recommends weakest prerequisite (Variance)');
    assert.ok(hintText.includes(secRegression), 'Hint mentions struggling section (Regression)');

    await shot('01-today-prereq-hint-1280');

    // -------------------------------------------------------------------------
    // Phase 2: Verify Pathways View Prerequisites & Cycle Rejection (1280px)
    // -------------------------------------------------------------------------
    // Click the revisit button directly on the hint to navigate to Pathways view!
    await evaluate('document.querySelector("[data-today-prereq-revisit]").click()');
    await pause(800);

    // Select the curriculum pathway in the sidebar list
    await until('!!document.querySelector("aside ul button")');
    await evaluate('document.querySelector("aside ul button").click()');
    await pause(600);

    await until('!!document.querySelector("[data-pathway-prereq-edit]")');
    await shot('02-pathways-curriculum-sections-1280');

    // Click to edit dependencies for Variance to test cycle detection
    await evaluate(`document.querySelector('[data-pathway-prereq-edit="${secVariance}"]').click()`);
    await pause(500);
    await until(`!!document.querySelector('[data-pathway-prereq-selector="${secVariance}"]')`);

    // Toggle Regression on Variance to cause a cycle: Regression -> Covariance -> Variance -> Regression
    await evaluate(`document.querySelector('[data-pathway-prereq-selector="${secVariance}"] [data-pathway-dep-toggle="${secRegression}"]').click()`);
    await pause(600);

    // Verify localized cycle error is displayed
    await until('!!document.querySelector("[data-pathway-cycle-error]")');
    const cycleErrorText = await evaluate('document.querySelector("[data-pathway-cycle-error]").innerText');
    console.log(`[live] Cycle rejected as expected: ${cycleErrorText}`);
    assert.ok(cycleErrorText.includes(secRegression) && cycleErrorText.includes(secVariance), 'Cycle error names cycle sections');

    await shot('03-pathways-cycle-rejection-1280');

    // -------------------------------------------------------------------------
    // Phase 3: Verify Dismissal on Today Panel (1280px)
    // -------------------------------------------------------------------------
    // Navigate back to Dashboard / Today
    const homeLabel = isAr ? 'الرئيسية' : 'Dashboard';
    await evaluate(`document.querySelector('button[aria-label="${homeLabel}"]').click()`);
    await pause(800);
    await until('!!document.querySelector("[data-today-prereq-hint]")');

    // Click Dismiss button
    await evaluate('document.querySelector("[data-today-prereq-dismiss]").click()');
    await pause(600);

    // Verify hint is removed
    const hintExists = await evaluate('!!document.querySelector("[data-today-prereq-hint]")');
    assert.equal(hintExists, false, 'Hint dismissed from view');
    console.log('[live] Hint successfully dismissed.');

    await shot('04-today-hint-dismissed-1280');

    // -------------------------------------------------------------------------
    // Phase 4: Mobile View (480px) with 0 Horizontal Overflow
    // -------------------------------------------------------------------------
    win.setContentSize(480, 800);
    await pause(800);

    // Clear dismissal directly in settings so we can capture the hint at 480px
    const db2 = new Database(dbPath);
    db2.prepare(`DELETE FROM app_settings WHERE key LIKE 'pathways.prerequisites.dismissed.v1:%'`).run();
    db2.close();

    win.reload();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await pause(800);
    await until('!!document.querySelector("[data-today-prereq-hint]")');

    // Check horizontal scroll width
    const scrollWidth = await evaluate('document.documentElement.scrollWidth');
    const clientWidth = await evaluate('document.documentElement.clientWidth');
    console.log(`[live] 480px viewport: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}`);
    assert.ok(scrollWidth <= clientWidth + 2, `No horizontal overflow at 480px (scrollWidth: ${scrollWidth} <= clientWidth: ${clientWidth})`);

    await shot('05-today-prereq-hint-480');

    // Pathways view at 480px
    const pathwaysLabel = isAr ? 'المسارات' : 'Pathways';
    await evaluate(`document.querySelector('button[aria-label="${pathwaysLabel}"]').click()`);
    await pause(800);
    await until('!!document.querySelector("aside ul button")');
    await evaluate('document.querySelector("aside ul button").click()');
    await pause(600);
    await until('!!document.querySelector("[data-pathway-prereq-edit]")');

    const pwScrollWidth = await evaluate('document.documentElement.scrollWidth');
    const pwClientWidth = await evaluate('document.documentElement.clientWidth');
    console.log(`[live] Pathways 480px viewport: scrollWidth=${pwScrollWidth}, clientWidth=${pwClientWidth}`);
    assert.ok(pwScrollWidth <= pwClientWidth + 2, `No horizontal overflow on Pathways at 480px (scrollWidth: ${pwScrollWidth} <= clientWidth: ${pwClientWidth})`);

    await shot('06-pathways-prereqs-480');

    console.log(`[live] Successfully completed live run for ${lang}!`);
    app.exit(0);
  })().catch((err) => {
    console.error(`[live error] ${err.stack || err}`);
    app.exit(1);
  });
});

require('../../dist/main/index.js');
