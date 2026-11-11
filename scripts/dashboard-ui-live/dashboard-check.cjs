const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_DASHBOARD_PROFILE || path.resolve('.baglib-data/key302-profile');
const evidence = process.env.BAGLIB_DASHBOARD_EVIDENCE || path.resolve('.baglib-data/KEY-302-evidence/fix1');

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
    if (level >= 3) {
      console.log(`[renderer error] ${message}`);
    }
  });

  const evaluate = (code) => win.webContents.executeJavaScript(code, true);
  // KEY-317: throwaway profiles would show the KEY-307 first-run guide, which takes focus.
  win.webContents.on('did-finish-load', () => { win.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });

  const until = async (code, timeoutMs = 30000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await evaluate(code)) return;
      } catch {}
      await pause(150);
    }
    throw new Error(`Timeout waiting for: ${code}`);
  };

  const ensureNoModalsOpen = async () => {
    const modalOpen = await evaluate('!!document.querySelector("[role=\\"dialog\\"]")');
    if (modalOpen) {
      await evaluate(`
        (() => {
          const closeBtn = document.querySelector('[data-customize-close-btn], [role="dialog"] button[aria-label*="إغلاق"], [role="dialog"] button[aria-label*="close"], [role="dialog"] button[aria-label*="Close"]');
          if (closeBtn) {
            closeBtn.click();
          } else {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          }
        })()
      `);
      await pause(400);
    }
    const stillOpen = await evaluate('!!document.querySelector("[role=\\"dialog\\"]")');
    assert.ok(!stillOpen, 'No modal should remain open over the dashboard view');
  };

  const shot = async (name) => {
    win.show();
    win.focus();
    win.webContents.focus();
    await pause(350);
    const image = await win.webContents.capturePage();
    const filePath = path.join(evidence, `${name}.png`);
    fs.writeFileSync(filePath, image.toPNG());
    console.log(`[shot] ${name}.png saved (${image.getSize().width}x${image.getSize().height})`);
  };

  const setDimensions = async (width, height) => {
    win.setMinimumSize(320, 300);
    win.setContentSize(width, height);
    win.setSize(width, height);
    await pause(300);
  };

  const setLanguage = async (targetLang) => {
    const current = await evaluate('document.documentElement.getAttribute("lang") || "ar"');
    if (current !== targetLang) {
      console.log(`[live] Switching language from ${current} to ${targetLang}...`);
      await evaluate(`
        (() => {
          const btn = document.querySelector('header button[aria-label*="Language"], header button[aria-label*="اللغة"], header button[title*="Language"], header button[title*="اللغة"]');
          if (btn) btn.click();
        })()
      `);
      await pause(400);
    }
    await until(`document.documentElement.getAttribute("lang") === "${targetLang}"`);
    const actualLang = await evaluate('document.documentElement.getAttribute("lang")');
    const actualDir = await evaluate('document.documentElement.getAttribute("dir")');
    assert.equal(actualLang, targetLang, `HTML lang attribute must be ${targetLang}`);
    assert.equal(actualDir, targetLang === 'ar' ? 'rtl' : 'ltr', `HTML dir attribute must match ${targetLang}`);
    await pause(250);
  };

  const setTheme = async (targetTheme) => {
    const isDark = await evaluate('document.documentElement.classList.contains("dark")');
    const wantsDark = targetTheme === 'dark';
    if (isDark !== wantsDark) {
      console.log(`[live] Switching theme to ${targetTheme}...`);
      await evaluate(`
        (() => {
          const btn = document.querySelector('header button[aria-label*="Theme"], header button[aria-label*="المظهر"], header button[title*="Theme"], header button[title*="المظهر"]');
          if (btn) btn.click();
        })()
      `);
      await pause(350);
    }
    await until(`"${targetTheme}" === "dark" ? document.documentElement.classList.contains("dark") : !document.documentElement.classList.contains("dark")`);
    await pause(200);
  };

  (async () => {
    try {
      await setDimensions(1280, 850);
      win.show();
      win.focus();

      console.log('[live] Waiting for real application shell and dashboard view...');
      await until('!!window.electronAPI && !!document.querySelector("aside nav") && !!document.querySelector("[data-dashboard-view]")');
      console.log('[live] Real app shell with KEY-297 navigation rail and dashboard active.');

      // ==========================================
      // STAGE 1: EMPTY / NO-DATA DASHBOARD STATE
      // ==========================================
      console.log('[live] Capturing Stage 1: Empty State in real app shell...');
      await ensureNoModalsOpen();
      await setLanguage('ar');
      await setTheme('light');
      await setDimensions(1280, 850);
      await ensureNoModalsOpen();
      await shot('empty-dashboard-ar-light-1280');

      await setDimensions(480, 800);
      await pause(300);
      const overflow480Empty = await evaluate(`
        (() => {
          const main = document.querySelector('[data-dashboard-view]');
          return main ? main.scrollWidth <= main.clientWidth + 2 : true;
        })()
      `);
      assert.ok(overflow480Empty, '480px empty dashboard should not have horizontal overflow');
      await ensureNoModalsOpen();
      await shot('empty-dashboard-ar-light-480');

      await setDimensions(1280, 850);
      await setLanguage('en');
      await setTheme('light');
      await ensureNoModalsOpen();
      await shot('empty-dashboard-en-light-1280');

      await setTheme('dark');
      await ensureNoModalsOpen();
      await shot('empty-dashboard-en-dark-1280');

      // ==========================================
      // STAGE 2: SEED REAL DATA
      // ==========================================
      console.log('[live] Seeding real data (PDFs, EPUB, Tasks, Curriculum Exams)...');
      const realPdfAr = path.resolve('tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf');
      const realPdfEn = path.resolve('tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf');
      const realEpubEn = path.resolve('tests/real-files/epub/en/Why Would Feminists Trust the Police.epub');

      await evaluate(`
        (async () => {
          const api = window.electronAPI;

          // 1. Books
          if (api?.books?.add) {
            await api.books.add({
              title: 'الدفاع عن أراضي المسلمين أهم فروض الأعيان',
              author: 'عبد الله عزام',
              filePath: ${JSON.stringify(realPdfAr)},
              readingStatus: 'reading',
              readingProgress: 42,
              digitalFormat: 'PDF',
              pagesCount: 88,
            });
            await api.books.add({
              title: 'Why Lyrics Last: Evolution, Cognition, and Shakespeare',
              author: 'Brian Boyd',
              filePath: ${JSON.stringify(realPdfEn)},
              readingStatus: 'completed',
              readingProgress: 100,
              digitalFormat: 'PDF',
              pagesCount: 240,
            });
            await api.books.add({
              title: 'Why Would Feminists Trust the Police',
              author: 'Leah Cowan',
              filePath: ${JSON.stringify(realEpubEn)},
              readingStatus: 'reading',
              readingProgress: 15,
              digitalFormat: 'EPUB',
              pagesCount: 160,
            });
          }

          // 2. Planner Tasks for Today
          const todayIso = new Date().toISOString().slice(0, 10);
          if (api?.planner?.save) {
            await api.planner.save({
              title: 'مراجعة الباب الثاني وحل المسائل',
              description: 'مراجعة شاملة للباب الثاني مع تدريبات الفقه المقارن',
              status: 'open',
              dueDate: todayIso,
              startDate: todayIso,
              priority: 2,
              sortOrder: 1,
              references: [],
            });
            await api.planner.save({
              title: 'قراءة الفصل الثالث في الشكسبيرية',
              description: 'تحليل النماذج المعرفية في مسرحيات العصر الإليزابيثي',
              status: 'completed',
              dueDate: todayIso,
              startDate: todayIso,
              priority: 1,
              sortOrder: 2,
              references: [],
            });
          }

          // 3. Curriculum Pathway and Exam Date
          if (api?.pathways?.save && api?.pathwayExam?.saveConfig) {
            const pathway = await api.pathways.save({
              name: 'منهج الإحصاء الرياضي المتقدم',
              description: 'دراسة المتغيرات العشوائية والتوزيعات الاحتمالية واختبارات الفروض',
              kind: 'curriculum',
            });
            if (pathway && pathway.id) {
              await api.pathwayExam.saveConfig({
                pathwayId: pathway.id,
                examDate: todayIso,
                availableMinutesPerDay: { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 0, 6: 60 },
                defaultStepMinutes: 30,
              });
            }
          }
        })()
      `);
      await pause(1500);

      // Reload dashboard view to refresh data
      await evaluate(`
        (async () => {
          if (window.electronAPI?.settings?.saveViewPreferences) {
            await window.electronAPI.settings.saveViewPreferences({ viewMode: 'dashboard' });
          }
          window.location.reload();
        })()
      `);
      console.log('[live] Page reloaded to render real data.');
      await pause(2500);
      await until('!!document.querySelector("[data-dashboard-view]") && !!document.querySelector("aside nav")');

      // Ensure default module order: Today panel first, then calendar, then rest
      await evaluate(`
        (async () => {
          const api = window.electronAPI;
          if (api?.settings?.set) {
            await api.settings.set('dashboard.layout.v1', {
              version: 1,
              modules: [
                { id: 'today', visible: true },
                { id: 'calendar', visible: true },
                { id: 'readingGoals', visible: true },
                { id: 'activeReads', visible: true },
                { id: 'studyProgress', visible: true },
                { id: 'studyInsights', visible: true },
                { id: 'scratchpad', visible: true },
                { id: 'athan', visible: true },
                { id: 'khatmah', visible: true },
                { id: 'studyRhythm', visible: true }
              ]
            });
          }
        })()
      `);

      // ==========================================
      // STAGE 3: CALENDAR MODULE & HIJRI DATES
      // ==========================================
      console.log('[live] Verifying Calendar Module with Dual Dates...');
      await ensureNoModalsOpen();
      await setLanguage('ar');
      await setTheme('light');
      await setDimensions(1280, 850);

      const hasCalendarModule = await evaluate('!!document.querySelector("[data-dashboard-module=\\"calendar\\"]")');
      assert.ok(hasCalendarModule, 'Calendar module should be present on dashboard');

      const hasHeaderHijri = await evaluate('!!document.querySelector("[data-header-hijri-date]")');
      assert.ok(hasHeaderHijri, 'Header should display Hijri date badge');

      const headerHijriText = await evaluate('document.querySelector("[data-header-hijri-date]").textContent.trim()');
      console.log(`[live] Current header Hijri date: "${headerHijriText}"`);
      assert.ok(headerHijriText.length > 0, 'Header Hijri date must not be empty');

      // Scroll calendar into view
      await evaluate(`
        (() => {
          const cal = document.querySelector('[data-dashboard-module="calendar"]');
          if (cal) cal.scrollIntoView({ behavior: 'instant', block: 'center' });
        })()
      `);
      await pause(300);
      await ensureNoModalsOpen();
      await shot('calendar-module-hijri-ar-1280');

      // Calendar in English
      await setLanguage('en');
      await evaluate(`
        (() => {
          const cal = document.querySelector('[data-dashboard-module="calendar"]');
          if (cal) cal.scrollIntoView({ behavior: 'instant', block: 'center' });
        })()
      `);
      await pause(300);
      await ensureNoModalsOpen();
      await shot('calendar-module-hijri-en-1280');

      // Scroll back to top
      await evaluate(`
        (() => {
          const view = document.querySelector('[data-dashboard-view]');
          if (view) view.scrollTop = 0;
        })()
      `);
      await pause(200);

      // ==========================================
      // STAGE 4: CUSTOMIZE MODAL ON ITS OWN
      // ==========================================
      console.log('[live] Testing Dashboard Customize Modal...');
      await setLanguage('ar');
      await setTheme('light');
      await setDimensions(1280, 850);

      // Open customize modal in Arabic
      await evaluate(`
        (() => {
          const btn = document.querySelector('[data-dashboard-customize-btn]');
          if (btn) btn.click();
        })()
      `);
      await pause(500);
      await until('!!document.querySelector("[data-dashboard-customize-content]")');
      await shot('customize-modal-ar-1280');

      // Close customize modal
      await evaluate(`
        (() => {
          const closeBtn = document.querySelector('[data-customize-close-btn]');
          if (closeBtn) closeBtn.click();
        })()
      `);
      await pause(400);
      await ensureNoModalsOpen();
      console.log('[live] Arabic customize modal closed successfully.');

      // Open customize modal in English
      await setLanguage('en');
      await evaluate(`
        (() => {
          const btn = document.querySelector('[data-dashboard-customize-btn]');
          if (btn) btn.click();
        })()
      `);
      await pause(500);
      await until('!!document.querySelector("[data-dashboard-customize-content]")');
      await shot('customize-modal-en-1280');

      // Close customize modal
      await evaluate(`
        (() => {
          const closeBtn = document.querySelector('[data-customize-close-btn]');
          if (closeBtn) closeBtn.click();
        })()
      `);
      await pause(400);
      await ensureNoModalsOpen();
      console.log('[live] English customize modal closed successfully.');

      // ==========================================
      // STAGE 5: SNOOZE MODAL ON ITS OWN
      // ==========================================
      console.log('[live] Testing Prayer Snooze Modal...');
      await setLanguage('ar');
      await evaluate(`
        (() => {
          const btn = document.querySelector('[data-dashboard-snooze-btn]');
          if (btn) btn.click();
        })()
      `);
      await pause(500);
      await until('!!document.querySelector("[data-dashboard-snooze-modal]")');
      await shot('snooze-modal-ar-1280');

      // Close snooze modal
      await evaluate(`
        (() => {
          const closeBtn = document.querySelector('[data-dashboard-snooze-modal] button:last-child');
          if (closeBtn) closeBtn.click();
        })()
      `);
      await pause(400);
      await ensureNoModalsOpen();
      console.log('[live] Snooze modal closed successfully.');

      // ==========================================
      // STAGE 6: FULL REAL DATA MATRIX (NO MODALS!)
      // ==========================================
      console.log('[live] Capturing Stage 6: Matrix with Real Data in real shell (ar/en, light/dark, 1280/480)...');

      // Scroll view to top
      await evaluate(`
        (() => {
          const view = document.querySelector('[data-dashboard-view]');
          if (view) view.scrollTop = 0;
        })()
      `);

      // 1. Arabic Light 1280px
      await setLanguage('ar');
      await setTheme('light');
      await setDimensions(1280, 850);
      await ensureNoModalsOpen();
      await shot('dashboard-ar-light-1280');

      // 2. Arabic Dark 1280px
      await setTheme('dark');
      await ensureNoModalsOpen();
      await shot('dashboard-ar-dark-1280');

      // 3. Arabic Light 480px (Stacked single column, 0 horizontal overflow)
      await setTheme('light');
      await setDimensions(480, 850);
      await pause(300);
      const overflow480Ar = await evaluate(`
        (() => {
          const main = document.querySelector('[data-dashboard-view]');
          return main ? main.scrollWidth <= main.clientWidth + 2 : true;
        })()
      `);
      assert.ok(overflow480Ar, '480px Arabic dashboard should stack cleanly without horizontal overflow');
      await ensureNoModalsOpen();
      await shot('dashboard-ar-light-480');

      // 4. Arabic Dark 480px
      await setTheme('dark');
      await ensureNoModalsOpen();
      await shot('dashboard-ar-dark-480');

      // 5. English Light 1280px
      await setDimensions(1280, 850);
      await setLanguage('en');
      await setTheme('light');
      await ensureNoModalsOpen();
      await shot('dashboard-en-light-1280');

      // 6. English Dark 1280px
      await setTheme('dark');
      await ensureNoModalsOpen();
      await shot('dashboard-en-dark-1280');

      // 7. English Light 480px
      await setDimensions(480, 850);
      await setTheme('light');
      await pause(300);
      const overflow480En = await evaluate(`
        (() => {
          const main = document.querySelector('[data-dashboard-view]');
          return main ? main.scrollWidth <= main.clientWidth + 2 : true;
        })()
      `);
      assert.ok(overflow480En, '480px English dashboard should stack cleanly without horizontal overflow');
      await ensureNoModalsOpen();
      await shot('dashboard-en-light-480');

      // 8. English Dark 480px
      await setTheme('dark');
      await ensureNoModalsOpen();
      await shot('dashboard-en-dark-480');

      console.log('[live] All live assertions and captures completed successfully with 0 modals left open!');
      app.exit(0);
    } catch (err) {
      console.error('[live failure]', err);
      app.exit(1);
    }
  })();
});

require('../../dist/main/index.js');
