const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_DASHBOARD_PROFILE || path.resolve('.baglib-data/key302-profile');
const evidence = process.env.BAGLIB_DASHBOARD_EVIDENCE || path.resolve('.baglib-data/KEY-302-evidence');

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

  const setLanguage = async (lang) => {
    await evaluate(`
      (async () => {
        const sel = document.querySelector('select[aria-label="Language"]') || document.querySelector('select[data-lang-selector]');
        if (sel) {
          sel.value = '${lang}';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (window.__baglib_setLanguage) {
          window.__baglib_setLanguage('${lang}');
        }
      })()
    `);
    await pause(300);
  };

  const setTheme = async (theme) => {
    await evaluate(`
      (async () => {
        const root = document.documentElement;
        if ('${theme}' === 'dark') {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      })()
    `);
    await pause(200);
  };

  (async () => {
    try {
      await setDimensions(1280, 850);
      win.show();
      win.focus();

      console.log('[live] Waiting for dashboard view to load at /dashboard-live...');
      await until('!!window.electronAPI && !!document.querySelector("[data-dashboard-view]")');
      console.log('[live] Dashboard view confirmed active at /dashboard-live.');

      // ==========================================
      // STAGE 1: EMPTY / NO-DATA STATE
      // ==========================================
      console.log('[live] Capturing Stage 1: Empty / No-Data Dashboard State...');
      await setLanguage('ar');
      await setTheme('light');
      await setDimensions(1280, 850);
      await shot('dashboard-empty-ar-light-1280');

      await setDimensions(480, 800);
      // Verify 480px stacks in 1 column and has zero horizontal overflow
      const overflow480Empty = await evaluate(`
        (() => {
          const main = document.querySelector('main') || document.querySelector('[data-dashboard-view]');
          return main ? main.scrollWidth <= main.clientWidth + 2 : true;
        })()
      `);
      assert.ok(overflow480Empty, '480px empty dashboard should not have horizontal overflow');
      await shot('dashboard-empty-ar-light-480');

      await setDimensions(1280, 850);
      await setLanguage('en');
      await setTheme('light');
      await shot('dashboard-empty-en-light-1280');

      await setTheme('dark');
      await shot('dashboard-empty-en-dark-1280');

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
      await pause(2000);
      await until('!!document.querySelector("[data-dashboard-view]")');

      // ==========================================
      // STAGE 3: VERIFY CALENDAR & DUAL DATES
      // ==========================================
      console.log('[live] Verifying Calendar Module with Dual Dates...');
      const hasCalendarModule = await evaluate('!!document.querySelector("[data-dashboard-module=\\"calendar\\"]")');
      assert.ok(hasCalendarModule, 'Calendar module should be present on dashboard');

      const hasHeaderHijri = await evaluate('!!document.querySelector("[data-header-hijri-date]")');
      assert.ok(hasHeaderHijri, 'Header should display Hijri date badge');

      const headerHijriText = await evaluate('document.querySelector("[data-header-hijri-date]").textContent.trim()');
      console.log(`[live] Current header Hijri date: "${headerHijriText}"`);
      assert.ok(headerHijriText.length > 0, 'Header Hijri date must not be empty');

      // Verify that calendar cells have Hijri dates under Gregorian days
      const calendarHijriCellsCount = await evaluate('document.querySelectorAll("[data-calendar-day] [data-hijri-date]").length');
      console.log(`[live] Calendar cells with Hijri dates: ${calendarHijriCellsCount}`);
      assert.ok(calendarHijriCellsCount >= 28, 'Calendar month should have at least 28 days with Hijri dates');

      // ==========================================
      // STAGE 4: VERIFY CUSTOMIZATION MODAL
      // ==========================================
      console.log('[live] Testing Dashboard Customization...');
      await evaluate(`
        (() => {
          const btn = document.querySelector('[data-dashboard-customize-btn]');
          if (btn) btn.click();
        })()
      `);
      await pause(500);
      await until('!!document.querySelector("[data-dashboard-customize-content]")');
      await shot('dashboard-customize-modal-ar-1280');

      // Reorder module: Move calendar up to position 1
      await evaluate(`
        (() => {
          const calRow = document.querySelector('[data-customize-module-row="calendar"]');
          if (calRow) {
            const upBtn = calRow.querySelector('button[title*="أعلى"], button[title*="up"], button[aria-label*="أعلى"], button[aria-label*="up"]');
            if (upBtn) upBtn.click();
          }
        })()
      `);
      await pause(400);

      // Close customization modal
      await evaluate(`
        (() => {
          const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('حفظ') || b.textContent.includes('Save') || b.textContent.includes('إغلاق') || b.textContent.includes('Close')));
          if (closeBtn) closeBtn.click();
        })()
      `);
      await pause(500);

      // Verify layout saved in settings
      const savedLayout = await evaluate('window.electronAPI.settings.get("dashboard.layout.v1")');
      console.log('[live] Verified saved layout order:', savedLayout?.modules?.map(m => m.id));
      assert.equal(savedLayout?.modules?.[0]?.id, 'calendar', 'Calendar module should be moved to first slot and persisted');

      // ==========================================
      // STAGE 5: VERIFY SNOOZE MODAL (KEY-239 link)
      // ==========================================
      console.log('[live] Testing Prayer Snooze Modal...');
      await evaluate(`
        (() => {
          const btn = document.querySelector('[data-dashboard-snooze-btn]');
          if (btn) btn.click();
        })()
      `);
      await pause(500);
      await until('!!document.querySelector("[data-dashboard-snooze-modal]")');
      await shot('dashboard-snooze-modal-ar-1280');

      // Close snooze modal
      await evaluate(`
        (() => {
          const closeBtn = document.querySelector('[data-dashboard-snooze-modal] button');
          if (closeBtn) closeBtn.click();
        })()
      `);
      await pause(400);

      // ==========================================
      // STAGE 6: MATRIX OF REAL DATA CAPTURES
      // ==========================================
      console.log('[live] Capturing Matrix with Real Data (ar/en, light/dark, 1280/480)...');

      // 1. Arabic Light 1280px
      await setLanguage('ar');
      await setTheme('light');
      await setDimensions(1280, 850);
      await shot('dashboard-ar-light-1280');

      // 2. Arabic Dark 1280px
      await setTheme('dark');
      await shot('dashboard-ar-dark-1280');

      // 3. Arabic Light 480px (Stacked single column, 0 horizontal overflow)
      await setTheme('light');
      await setDimensions(480, 850);
      const overflow480Ar = await evaluate(`
        (() => {
          const main = document.querySelector('[data-dashboard-view]');
          return main ? main.scrollWidth <= main.clientWidth + 2 : true;
        })()
      `);
      assert.ok(overflow480Ar, '480px Arabic dashboard should stack cleanly without horizontal overflow');
      await shot('dashboard-ar-light-480');

      // 4. Arabic Dark 480px
      await setTheme('dark');
      await shot('dashboard-ar-dark-480');

      // 5. English Light 1280px
      await setDimensions(1280, 850);
      await setLanguage('en');
      await setTheme('light');
      await shot('dashboard-en-light-1280');

      // 6. English Dark 1280px
      await setTheme('dark');
      await shot('dashboard-en-dark-1280');

      // 7. English Light 480px
      await setDimensions(480, 850);
      await setTheme('light');
      const overflow480En = await evaluate(`
        (() => {
          const main = document.querySelector('[data-dashboard-view]');
          return main ? main.scrollWidth <= main.clientWidth + 2 : true;
        })()
      `);
      assert.ok(overflow480En, '480px English dashboard should stack cleanly without horizontal overflow');
      await shot('dashboard-en-light-480');

      // 8. English Dark 480px
      await setTheme('dark');
      await shot('dashboard-en-dark-480');

      console.log('[live] All live assertions and captures completed successfully!');
      app.exit(0);
    } catch (err) {
      console.error('[live failure]', err);
      app.exit(1);
    }
  })();
});

require('../../dist/main/index.js');
