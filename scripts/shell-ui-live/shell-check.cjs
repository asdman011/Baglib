const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_SHELL_PROFILE || path.resolve('.baglib-data/key297-profile');
const evidence = process.env.BAGLIB_SHELL_EVIDENCE || path.resolve('.baglib-data/KEY-297-evidence');

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

  (async () => {
    win.setMinimumSize(320, 400);
    win.setContentSize(1280, 850);
    win.show();
    win.focus();

    console.log('[live] Waiting for application initial load...');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    console.log('[live] App shell loaded.');

    // 1. Seed Real Files into Database
    console.log('[live] Seeding real files from tests/real-files/...');
    const realFiles = [
      {
        id: 'pdf-ar-text',
        title: 'الدفاع عن أراضي المسلمين أهم فروض الأعيان',
        author: 'عبد الله عزام',
        workType: 'book',
        bookType: 'digital',
        digitalFormat: 'PDF',
        filePath: path.resolve('tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf'),
        categories: ['Islamic Studies', 'فقه']
      },
      {
        id: 'pdf-en-text',
        title: 'Why Lyrics Last: Evolution, Cognition, and Shakespeare',
        author: 'Brian Boyd',
        workType: 'book',
        bookType: 'digital',
        digitalFormat: 'PDF',
        filePath: path.resolve('tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf'),
        categories: ['Literature', 'Philosophy']
      },
      {
        id: 'epub-en-text',
        title: 'Why Would Feminists Trust the Police',
        author: 'Leah Cowan',
        workType: 'book',
        bookType: 'digital',
        digitalFormat: 'EPUB',
        filePath: path.resolve('tests/real-files/epub/en/Why Would Feminists Trust the Police.epub'),
        categories: ['Sociology']
      }
    ];

    for (const file of realFiles) {
      if (fs.existsSync(file.filePath)) {
        await evaluate(`
          (async () => {
            try {
              await window.electronAPI.addBook(${JSON.stringify(file)});
            } catch (e) {
              console.error('Failed to add book:', e);
            }
          })();
        `);
      }
    }
    await pause(600);
    console.log('[live] Real files seeded.');

    // Helper to set language
    const ensureLanguage = async (targetLang) => {
      const current = await evaluate('document.documentElement.lang');
      if (current !== targetLang) {
        await evaluate(`
          (() => {
            const btn = document.querySelector('header button[aria-label*="Language"], header button[aria-label*="اللغة"], header button[title*="Language"], header button[title*="اللغة"]');
            if (btn) btn.click();
          })();
        `);
        await pause(300);
      }
    };

    // Helper to set theme
    const ensureTheme = async (targetTheme) => {
      const isDark = await evaluate('document.documentElement.classList.contains("dark")');
      const wantsDark = targetTheme === 'dark';
      if (isDark !== wantsDark) {
        await evaluate(`
          (() => {
            const btn = document.querySelector('header button[aria-label*="Theme"], header button[aria-label*="المظهر"], header button[title*="Theme"], header button[title*="المظهر"]');
            if (btn) btn.click();
          })();
        `);
        await pause(300);
      }
    };

    const clickNav = async (labelSnippet) => {
      await evaluate(`
        (() => {
          const btns = Array.from(document.querySelectorAll('aside nav button, [role="dialog"] nav button'));
          const btn = btns.find(b => b.getAttribute('aria-label')?.includes('${labelSnippet}') || b.textContent?.includes('${labelSnippet}'));
          if (btn) btn.click();
        })();
      `);
      await pause(350);
    };

    // 2. Desktop 1280px Breadcrumb & Workspaces Matrix
    win.setContentSize(1280, 850);
    await pause(300);

    const matrix = [
      { lang: 'ar', theme: 'light' },
      { lang: 'ar', theme: 'dark' },
      { lang: 'en', theme: 'light' },
      { lang: 'en', theme: 'dark' },
    ];

    for (const conf of matrix) {
      console.log(`[live] Testing ${conf.lang} ${conf.theme} at 1280px...`);
      await ensureLanguage(conf.lang);
      await ensureTheme(conf.theme);
      await pause(200);

      // A. Dashboard Breadcrumb
      await clickNav(conf.lang === 'ar' ? 'الرئيسية' : 'Dashboard');
      await shot(`breadcrumb_dashboard_${conf.lang}_${conf.theme}_1280`);

      // B. Library Breadcrumb
      await clickNav(conf.lang === 'ar' ? 'المكتبة' : 'Library');
      await shot(`breadcrumb_library_${conf.lang}_${conf.theme}_1280`);

      // C. Reader Breadcrumb (with real book title in breadcrumb!)
      await evaluate(`
        (() => {
          const card = document.querySelector('[data-book-card], [data-library-book-id]');
          if (card) card.click();
        })();
      `);
      await pause(600);
      await shot(`breadcrumb_reader_${conf.lang}_${conf.theme}_1280`);

      // D. Notes Breadcrumb
      await clickNav(conf.lang === 'ar' ? 'الملاحظات' : 'Notes');
      await shot(`breadcrumb_notes_${conf.lang}_${conf.theme}_1280`);

      // E. Quran Breadcrumb
      await clickNav(conf.lang === 'ar' ? 'القرآن' : 'Quran');
      await shot(`breadcrumb_quran_${conf.lang}_${conf.theme}_1280`);

      // F. Sunnah Breadcrumb
      await clickNav(conf.lang === 'ar' ? 'السنة' : 'Sunnah');
      await shot(`breadcrumb_sunnah_${conf.lang}_${conf.theme}_1280`);

      // G. Bayan Breadcrumb
      await clickNav(conf.lang === 'ar' ? 'البيان' : 'Bayan');
      await shot(`breadcrumb_bayan_${conf.lang}_${conf.theme}_1280`);

      // H. Pathways Breadcrumb
      await clickNav(conf.lang === 'ar' ? 'مسارات' : 'Pathways');
      await shot(`breadcrumb_pathways_${conf.lang}_${conf.theme}_1280`);

      // I. Planner Breadcrumb
      await clickNav(conf.lang === 'ar' ? 'مخطط' : 'Planner');
      await shot(`breadcrumb_planner_${conf.lang}_${conf.theme}_1280`);

      // J. New Object Menu Open (D3)
      await evaluate(`
        (() => {
          const btn = document.querySelector('aside button[aria-haspopup="menu"]');
          if (btn) btn.click();
        })();
      `);
      await pause(400);
      await shot(`new_object_menu_${conf.lang}_${conf.theme}_1280`);

      // Close menu with Esc
      await evaluate(`
        (() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        })();
      `);
      await pause(200);

      // K. Support Sheet Open
      await evaluate(`
        (() => {
          const btns = Array.from(document.querySelectorAll('aside button'));
          const supportBtn = btns.find(b => b.getAttribute('aria-label')?.includes('${conf.lang === 'ar' ? 'الدعم' : 'Support'}'));
          if (supportBtn) supportBtn.click();
        })();
      `);
      await pause(400);
      await shot(`support_sheet_${conf.lang}_${conf.theme}_1280`);

      // Close support sheet with Esc
      await evaluate(`
        (() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        })();
      `);
      await pause(200);
    }

    // 3. Narrow 480px Drawer & Responsive Matrix
    console.log('[live] Testing 480px narrow drawer...');
    win.setContentSize(480, 800);
    await pause(350);

    for (const conf of matrix) {
      console.log(`[live] Testing 480px drawer in ${conf.lang} ${conf.theme}...`);
      await ensureLanguage(conf.lang);
      await ensureTheme(conf.theme);
      win.setContentSize(480, 800);
      await pause(350);

      // Verify no horizontal overflow at 480px
      const scrollWidth = await evaluate('document.documentElement.scrollWidth');
      const clientWidth = await evaluate('document.documentElement.clientWidth');
      console.log(`[live] Viewport at 480px: clientWidth=${clientWidth}, scrollWidth=${scrollWidth}`);
      assert.ok(
        scrollWidth <= clientWidth + 2,
        `Horizontal overflow at 480px: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`
      );

      // Capture closed 480px shell
      await shot(`shell_480_${conf.lang}_${conf.theme}`);

      // Click mobile drawer menu button in Titlebar
      await evaluate(`
        (() => {
          const btn = document.querySelector('header button[aria-label*="القائمة"], header button[aria-label*="navigation"]');
          if (btn) btn.click();
        })();
      `);
      await pause(450);

      const isDrawerOpen = await evaluate('!!document.querySelector("[role=\\"dialog\\"]")');
      assert.ok(isDrawerOpen, '480px drawer Sheet must be open');

      // Capture open 480px drawer
      await shot(`drawer_open_480_${conf.lang}_${conf.theme}`);

      // Open New Object menu inside drawer
      await evaluate(`
        (() => {
          const btn = document.querySelector('[role="dialog"] button[aria-haspopup="menu"]');
          if (btn) btn.click();
        })();
      `);
      await pause(350);
      await shot(`drawer_new_object_menu_480_${conf.lang}_${conf.theme}`);

      // Close menu & drawer
      await evaluate(`
        (() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        })();
      `);
      await pause(200);
      await evaluate(`
        (() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        })();
      `);
      await pause(250);
    }

    console.log('[live] All live test captures completed successfully!');
    app.exit(0);
  })().catch((err) => {
    console.error('[live failure]', err);
    app.exit(1);
  });
});

require('../../dist/main/index.js');
