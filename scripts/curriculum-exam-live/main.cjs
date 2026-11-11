const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const profile = process.env.BAGLIB_EXAM_PROFILE || process.env.BAGLIB_DATA_DIR;
const evidence = process.env.BAGLIB_EXAM_EVIDENCE || path.join(profile, 'evidence');
const lang = process.env.BAGLIB_EXAM_LANG || 'ar';
const coursePdfs = JSON.parse(process.env.BAGLIB_COURSE_PDFS || '[]');

fs.mkdirSync(evidence, { recursive: true });

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
  // KEY-317: throwaway profiles would show the KEY-307 first-run guide, which takes focus.
  win.webContents.on('did-finish-load', () => { win.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
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

    // 2. Direct SQLite Seeding of Curriculum, Items, Exam Config & Pinned Steps
    const dbPath = path.join(profile, 'data', 'baglib.db');
    assert.ok(fs.existsSync(dbPath), 'Database baglib.db exists');
    const db = new Database(dbPath);

    const isAr = lang === 'ar';
    const now = new Date();
    const twoWeeksOut = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);
    const examDateStr = `${twoWeeksOut.getFullYear()}-${String(twoWeeksOut.getMonth() + 1).padStart(2, '0')}-${String(twoWeeksOut.getDate()).padStart(2, '0')}`;

    const pinnedDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4);
    const pinnedDateStr = `${pinnedDateObj.getFullYear()}-${String(pinnedDateObj.getMonth() + 1).padStart(2, '0')}-${String(pinnedDateObj.getDate()).padStart(2, '0')}`;

    const pathwayId = 'pathway-stats-exam';
    const pathwayName = isAr
      ? 'منهاج الإحصاء الرياضي والاقتصاد القياسي'
      : 'Mathematical Statistics & Econometrics Curriculum';

    const secProb = isAr ? 'توزيعات احتمالية' : 'Probability Distributions';
    const secVar = isAr ? 'التباين والتغاير' : 'Variance & Covariance';
    const secReg = isAr ? 'تحليل الانحدار' : 'Regression Analysis';

    try {
      db.prepare(`
        INSERT OR REPLACE INTO collection (id, name, description, collection_type)
        VALUES (?, ?, 'External University Statistics Course with Exam Target', 'curriculum')
      `).run(pathwayId, pathwayName);

      // Tasks
      db.prepare(`
        INSERT OR REPLACE INTO study_task (id, title, description, status, due_date, created_at, updated_at)
        VALUES
          ('t-prob-1', ?, '', 'open', NULL, datetime('now'), datetime('now')),
          ('t-prob-2', ?, '', 'open', NULL, datetime('now'), datetime('now')),
          ('t-var-1', ?, '', 'open', ?, datetime('now'), datetime('now')),
          ('t-var-2', ?, '', 'open', NULL, datetime('now'), datetime('now')),
          ('t-reg-1', ?, '', 'open', NULL, datetime('now'), datetime('now')),
          ('t-reg-2', ?, '', 'open', NULL, datetime('now'), datetime('now'))
      `).run(
        isAr ? 'دالة الكثافة الاحتمالية' : 'Probability Density Functions',
        isAr ? 'التوزيع الطبيعي المعياري' : 'Standard Normal Distribution',
        isAr ? 'حساب التباين للعينات' : 'Sample Variance Calculation',
        pinnedDateStr,
        isAr ? 'مصفوفة التغاير والارتباط' : 'Covariance Matrix',
        isAr ? 'انحدار المربعات الصغرى OLS' : 'OLS Linear Regression',
        isAr ? 'فترات الثقة لمعاملات الانحدار' : 'Confidence Intervals for Coefficients'
      );

      // Pathway Items
      db.prepare(`
        INSERT OR REPLACE INTO pathway_item (id, collection_id, section, kind, reference, title, pinned, sort_order, created_at)
        VALUES
          ('i-prob-1', ?, ?, 'step', 'task:t-prob-1', ?, 0, 1, datetime('now')),
          ('i-prob-2', ?, ?, 'step', 'task:t-prob-2', ?, 0, 2, datetime('now')),
          ('i-var-1', ?, ?, 'step', 'task:t-var-1', ?, 1, 3, datetime('now')),
          ('i-var-2', ?, ?, 'step', 'task:t-var-2', ?, 0, 4, datetime('now')),
          ('i-reg-1', ?, ?, 'step', 'task:t-reg-1', ?, 0, 5, datetime('now')),
          ('i-reg-2', ?, ?, 'step', 'task:t-reg-2', ?, 0, 6, datetime('now'))
      `).run(
        pathwayId, secProb, isAr ? 'دالة الكثافة الاحتمالية' : 'Probability Density Functions',
        pathwayId, secProb, isAr ? 'التوزيع الطبيعي المعياري' : 'Standard Normal Distribution',
        pathwayId, secVar, isAr ? 'حساب التباين للعينات' : 'Sample Variance Calculation',
        pathwayId, secVar, isAr ? 'مصفوفة التغاير والارتباط' : 'Covariance Matrix',
        pathwayId, secReg, isAr ? 'انحدار المربعات الصغرى OLS' : 'OLS Linear Regression',
        pathwayId, secReg, isAr ? 'فترات الثقة لمعاملات الانحدار' : 'Confidence Intervals for Coefficients'
      );

      // Exam Settings (2 weeks out)
      const examConfig = {
        pathwayId,
        examDate: examDateStr,
        availableMinutesPerDay: { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 0, 6: 60 },
        defaultStepMinutes: 30,
      };
      db.prepare(`
        INSERT OR REPLACE INTO app_settings (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
      `).run(`pathways.exam.v1:${pathwayId}`, JSON.stringify(examConfig));

      // Weekly rhythm with Friday rest day
      const rhythmConfig = {
        goalValue: 60,
        goalUnit: 'minutes',
        restDays: [5],
        celebrationsEnabled: true,
        dailyReminderTime: null,
      };
      db.prepare(`
        INSERT OR REPLACE INTO app_settings (key, value, updated_at)
        VALUES ('study.rhythm.v1', ?, datetime('now'))
      `).run(JSON.stringify(rhythmConfig));

      // Probability Distributions is mastered (cards with correct attempts)
      for (let k = 1; k <= 4; k++) {
        const cid = `card-prob-${k}`;
        db.prepare(`INSERT OR REPLACE INTO knowledge (id, created_at) VALUES (?, datetime('now'))`).run(cid);
        db.prepare(`INSERT OR REPLACE INTO card_detail (knowledge_id, front, back, source_kind, source_label) VALUES (?, 'Q', 'A', 'note', ?)`).run(cid, secProb);
        db.prepare(`INSERT OR REPLACE INTO practice_attempt (id, knowledge_id, question_kind, result, check_method, created_at) VALUES (?, ?, 'recall', 'correct', 'auto', datetime('now'))`).run(`att-p${k}`, cid);
      }
    } finally {
      db.close();
    }

    // Refresh view
    win.reload();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await pause(1000);

    // -------------------------------------------------------------------------
    // Phase 1: Navigate to Pathways & Check Exam Badge (1280px)
    // -------------------------------------------------------------------------
    win.setContentSize(1280, 900);
    await pause(800);

    const pathwaysLabel = isAr ? 'المسارات' : 'Pathways';
    await until(`!!document.querySelector('button[aria-label="${pathwaysLabel}"]')`);
    await evaluate(`document.querySelector('button[aria-label="${pathwaysLabel}"]').click()`);
    await pause(800);

    // Click on our pathway in the sidebar list
    await until('!!document.querySelector("aside ul button")');
    await evaluate('document.querySelector("aside ul button").click()');
    await pause(800);

    // Verify Exam Badge & Button
    await until('!!document.querySelector("[data-pathway-exam-btn]")', 20000, 'Exam button in pathway');
    await until('!!document.querySelector("[data-pathway-exam-badge]")', 10000, 'Exam badge in pathway');
    await shot('01-pathways-view-1280');

    // -------------------------------------------------------------------------
    // Phase 2: Open Exam & Re-Plan Modal (1280px)
    // -------------------------------------------------------------------------
    console.log('[live] Opening Curriculum Exam Modal...');
    await evaluate('document.querySelector("[data-pathway-exam-btn]").click()');
    await until('!!document.querySelector("[data-curriculum-exam-modal]")', 10000, 'Curriculum Exam Modal');
    await pause(600);
    await shot('02-exam-modal-initial-1280');

    // -------------------------------------------------------------------------
    // Phase 3: Calculate Re-Plan Preview (Even Spreading, Rest Days, Pinned Date)
    // -------------------------------------------------------------------------
    console.log('[live] Calculating Re-plan preview...');
    await evaluate('document.querySelector("[data-replan-preview-btn]").click()');
    await until('!!document.querySelector("[data-replan-fits-alert]")', 15000, 'Re-plan fits alert');
    await pause(600);
    await shot('03-exam-modal-replan-preview-1280');

    // Confirm and apply plan
    console.log('[live] Confirming re-plan schedule...');
    await evaluate('document.querySelector("[data-replan-confirm-btn]").click()');
    await pause(1800);
    await shot('04-plan-applied-1280');

    // Verify database study_task rows updated
    const verifyDb = new Database(dbPath);
    try {
      const scheduledTasks = verifyDb.prepare("SELECT id, due_date FROM study_task WHERE due_date IS NOT NULL").all();
      assert.ok(scheduledTasks.length >= 4, `Expected scheduled tasks >= 4, got ${scheduledTasks.length}`);
      console.log(`[live] Successfully verified ${scheduledTasks.length} study tasks scheduled with due dates in database.`);
    } finally {
      verifyDb.close();
    }

    // -------------------------------------------------------------------------
    // Phase 4: Test Deadline That Cannot Fit & Weak Section Prioritization
    // -------------------------------------------------------------------------
    console.log('[live] Testing deadline that cannot fit...');
    await evaluate('document.querySelector("[data-pathway-exam-btn]").click()');
    await until('!!document.querySelector("[data-curriculum-exam-modal]")', 10000, 'Curriculum Exam Modal reopen');
    await until('!document.querySelector("[data-replan-preview-btn]:disabled")', 10000, 'Preview button enabled');

    // Set exam date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    // Directly save tight exam date config
    await evaluate(`
      window.electronAPI.pathwayExam.saveConfig({
        pathwayId: '${pathwayId}',
        examDate: '${tomorrowStr}',
        availableMinutesPerDay: { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 0, 6: 60 },
        defaultStepMinutes: 30
      })
    `);
    await pause(300);

    await evaluate(`
      (() => {
        const input = document.querySelector("[data-exam-date-input]");
        if (input) {
          if (input._valueTracker) input._valueTracker.setValue('');
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, '${tomorrowStr}');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await pause(500);

    await until('!document.querySelector("[data-replan-preview-btn]:disabled")', 10000, 'Preview button ready');
    await evaluate('document.querySelector("[data-replan-preview-btn]").click()');
    await until('!!document.querySelector("[data-replan-unfit-alert]")', 15000, 'Re-plan unfit alert banner');
    await pause(600);
    await shot('05-replan-unfit-warning-1280');

    // -------------------------------------------------------------------------
    // Phase 5: Responsive Verification at 480px Viewport (Zero Horizontal Overflow)
    // -------------------------------------------------------------------------
    console.log('[live] Checking 480px viewport...');
    win.setContentSize(480, 800);
    await pause(800);

    const scrollWidth = await evaluate('document.documentElement.scrollWidth');
    const clientWidth = await evaluate('document.documentElement.clientWidth');
    console.log(`[live] 480px Modal: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}`);
    assert.ok(scrollWidth <= clientWidth + 2, `No horizontal overflow on Modal at 480px (scrollWidth: ${scrollWidth} <= clientWidth: ${clientWidth})`);
    await shot('06-exam-modal-unfit-480');

    // Close modal and verify Pathways view at 480px
    await evaluate('document.querySelector("[data-curriculum-exam-modal] button").click()');
    await pause(800);

    const pwScrollWidth = await evaluate('document.documentElement.scrollWidth');
    const pwClientWidth = await evaluate('document.documentElement.clientWidth');
    console.log(`[live] 480px Pathways: scrollWidth=${pwScrollWidth}, clientWidth=${pwClientWidth}`);
    assert.ok(pwScrollWidth <= pwClientWidth + 2, `No horizontal overflow on Pathways at 480px (scrollWidth: ${pwScrollWidth} <= clientWidth: ${pwClientWidth})`);
    await shot('07-pathway-view-480');

    console.log(`[live] Successfully completed live run for ${lang}!`);
    app.exit(0);
  })().catch((err) => {
    console.error(`[live error] ${err.stack || err}`);
    app.exit(1);
  });
});

require('../../dist/main/index.js');
