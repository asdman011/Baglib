const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_LIBRARY_PROFILE || path.resolve('.baglib-data/key310-profile');
const evidence = process.env.BAGLIB_LIBRARY_EVIDENCE || path.resolve('.baglib-data/KEY-310-evidence');

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
    try {
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
          id: 'pdf-ar-text-1',
          title: 'الدفاع عن أراضي المسلمين أهم فروض الأعيان',
          author: 'عبد الله عزام',
          workType: 'book',
          bookType: 'digital',
          digitalFormat: 'PDF',
          filePath: path.resolve('tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf'),
          categories: ['دراسات إسلامية', 'فقه'],
          tags: ['#جهاد', '#فقه'],
          readingStatus: 'reading',
          readingProgress: 42,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'pdf-en-text-1',
          title: 'Why Lyrics Last: Evolution, Cognition, and Shakespeare',
          author: 'Brian Boyd',
          workType: 'book',
          bookType: 'digital',
          digitalFormat: 'PDF',
          filePath: path.resolve('tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf'),
          categories: ['Literature', 'Philosophy'],
          tags: ['#shakespeare', '#cognition'],
          readingStatus: 'unread',
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'epub-en-text-1',
          title: 'Why Would Feminists Trust the Police',
          author: 'Leah Cowan',
          workType: 'book',
          bookType: 'digital',
          digitalFormat: 'EPUB',
          filePath: path.resolve('tests/real-files/epub/en/Why Would Feminists Trust the Police.epub'),
          categories: ['Politics', 'Social Sciences'],
          tags: ['#politics', '#feminism'],
          readingStatus: 'completed',
          readingProgress: 100,
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'book-phys-ar-1',
          title: 'البداية والنهاية - المجلد الأول',
          author: 'ابن كثير',
          workType: 'book',
          bookType: 'physical',
          shelf: 'A-12',
          room: 'المكتبة الرئيسية',
          categories: ['تاريخ'],
          tags: ['#تاريخ', '#تراث'],
          readingStatus: 'reading',
          readingProgress: 18,
          createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'book-phys-en-1',
          title: 'The Structure of Scientific Revolutions',
          author: 'Thomas Kuhn',
          workType: 'book',
          bookType: 'physical',
          shelf: 'B-04',
          room: 'Main Hall',
          categories: ['Philosophy', 'Science'],
          tags: ['#epistemology', '#science'],
          readingStatus: 'unread',
          createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];

      // Add extra mock items to make the catalog scrollable
      for (let i = 1; i <= 25; i++) {
        realFiles.push({
          id: `volume-scroll-${i}`,
          title: `مجلد تراثي وموسوعة علمية رقم ${i}`,
          author: i % 2 === 0 ? 'أبو حامد الغزالي' : 'ابن رشد الأندلسي',
          workType: 'book',
          bookType: i % 3 === 0 ? 'physical' : 'digital',
          digitalFormat: 'PDF',
          categories: ['علوم إسلامية', 'فلسفة'],
          tags: ['#موسوعة', '#تراث'],
          readingStatus: i % 4 === 0 ? 'reading' : 'unread',
          readingProgress: i % 4 === 0 ? 30 : 0,
          createdAt: new Date(Date.now() - (20 + i) * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      await evaluate(`
        (async () => {
          const books = ${JSON.stringify(realFiles)};
          for (const b of books) {
            try {
              await window.electronAPI.addBook(b);
            } catch (e) {
              console.warn('[live seed error]', e);
            }
          }
          window.dispatchEvent(new CustomEvent('baglib:refresh-books'));
        })()
      `);
      console.log('[live] Real files seeded.');
      await pause(1000);

      // Navigate to Library View
      console.log('[live] Navigating to library view...');
      await evaluate(`
        (() => {
          const libBtn = Array.from(document.querySelectorAll('button')).find(
            b => b.textContent && (b.textContent.includes('المكتبة') || b.textContent.includes('Library'))
          );
          if (libBtn) libBtn.click();
        })()
      `);
      await pause(1000);

      // Wait until cards are rendered
      await until("document.querySelectorAll('[data-library-book-card]').length >= 10", 30000);
      console.log('[live] Books rendered in library grid.');

      // Dismiss splash if present
      await evaluate(`
        (() => {
          const splash = document.querySelector('[data-splash-screen]');
          if (splash) splash.remove();
        })()
      `);
      await pause(500);

      // Helper to set theme and language
      const setLocale = async (targetLang, targetTheme) => {
        await evaluate(`
          (() => {
            const currentLang = document.documentElement.getAttribute('lang') || 'ar';
            if (currentLang !== '${targetLang}') {
              const langBtn = Array.from(document.querySelectorAll('button')).find(
                b => b.title && (b.title.includes('Language') || b.title.includes('اللغة') || b.title.includes('English') || b.title.includes('العربية'))
              );
              if (langBtn) langBtn.click();
            }
            const isDark = document.documentElement.classList.contains('dark');
            const currentTheme = isDark ? 'dark' : 'light';
            if (currentTheme !== '${targetTheme}') {
              const themeBtn = Array.from(document.querySelectorAll('button')).find(
                b => b.title && (b.title.includes('Theme') || b.title.includes('المظهر') || b.title.includes('Dark') || b.title.includes('Light'))
              );
              if (themeBtn) themeBtn.click();
            }
          })()
        `);
        await pause(400);
      };

      // Ensure Arabic RTL Light initially
      await setLocale('ar', 'light');
      let dir = await evaluate('document.documentElement.getAttribute("dir")');
      assert.strictEqual(dir, 'rtl', 'Expected RTL for Arabic');

      // ----------------------------------------------------
      // SECTION 1: Arabic RTL 1280px (Light Mode)
      // ----------------------------------------------------
      win.setContentSize(1280, 850);
      await pause(400);

      // Shot 1: Top of Library List (Full Header: collection title, ribbon, simple search, sort, view toggle)
      await evaluate('window.scrollTo(0, 0); const c = document.querySelector("[data-library-scroll-container]"); if (c) c.scrollTop = 0;');
      await pause(300);
      await shot('01-ar-light-1280-top');

      // Shot 2: Scroll down -> Auto-hiding header slides away, slim sticky bar appears
      console.log('[live] Testing auto-hiding header on scroll down...');
      await evaluate(`
        (() => {
          const container = document.querySelector('[data-library-scroll-container]');
          if (container) {
            container.scrollTop = 320;
            container.dispatchEvent(new Event('scroll'));
          }
        })()
      `);
      await pause(500);
      const isStickyVisible = await evaluate('!!document.querySelector("[data-library-sticky-header]")');
      console.log('[live] Is sticky header visible after scroll down?', isStickyVisible);
      assert.strictEqual(isStickyVisible, true, 'Sticky header must be visible after scrolling down');
      await shot('02-ar-light-1280-scrolled');

      // Restore scroll to top
      await evaluate(`
        (() => {
          const container = document.querySelector('[data-library-scroll-container]');
          if (container) {
            container.scrollTop = 0;
            container.dispatchEvent(new Event('scroll'));
          }
        })()
      `);
      await pause(400);

      // Shot 3: Card Hover / Focus overlay on cover
      console.log('[live] Testing card hover / focus overlay...');
      await evaluate(`
        (() => {
          const card = document.querySelector('[data-library-book-card]');
          if (card) {
            card.focus();
            card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          }
        })()
      `);
      await pause(400);
      await shot('03-ar-light-1280-card-hover');

      // Shot 4: Card ⋯ actions menu
      console.log('[live] Testing card actions ⋯ menu dropdown...');
      await evaluate(`
        (() => {
          const menuBtn = document.querySelector('[data-library-book-card] [data-card-menu-button]');
          if (menuBtn) menuBtn.click();
        })()
      `);
      await pause(400);
      await shot('04-ar-light-1280-card-menu');

      // Close card menu
      await evaluate(`
        (() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        })()
      `);
      await pause(300);

      // Shot 5: Pin-or-peek side menu: Toggle Unpinned (Menu button / Ctrl+B)
      console.log('[live] Testing unpinned side navigation...');
      await evaluate(`
        (() => {
          const menuBtn = document.querySelector('[data-nav-menu-button]');
          if (menuBtn) menuBtn.click();
        })()
      `);
      await pause(500);
      await shot('05-ar-light-1280-unpinned');

      // Shot 6: Hover start edge strip -> Peek overlay appears without content shift
      console.log('[live] Triggering peek overlay via start edge trigger strip...');
      await evaluate(`
        (() => {
          const edge = document.querySelector('[data-nav-peek-trigger-edge]');
          if (edge) {
            edge.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            edge.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          }
        })()
      `);
      await pause(500);
      const isPeekActive = await evaluate('!!document.querySelector("[data-nav-peek-overlay]")');
      console.log('[live] Is peek overlay visible?', isPeekActive);
      await shot('06-ar-light-1280-peek');

      // Shot 7: Pin back in flow
      console.log('[live] Pinning side navigation back in normal flow...');
      await evaluate(`
        (() => {
          const menuBtn = document.querySelector('[data-nav-menu-button]');
          if (menuBtn) menuBtn.click();
        })()
      `);
      await pause(400);
      await shot('07-ar-light-1280-pinned');

      // Shot 8: Simple Search with query + active filter chip
      console.log('[live] Testing simple search...');
      await evaluate(`
        (() => {
          const input = document.querySelector('[data-simple-search-input]');
          if (input) {
            input.value = 'عزام';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `);
      await pause(500);
      await shot('08-ar-light-1280-search');

      // Clear search
      await evaluate(`
        (() => {
          const input = document.querySelector('[data-simple-search-input]');
          if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `);
      await pause(300);

      // Shot 9: Advanced Filters Panel open on desktop (side rail with topics, authors, and density)
      console.log('[live] Opening Advanced filters panel on desktop...');
      await evaluate(`
        (() => {
          const advBtn = document.querySelector('[data-advanced-filter-button]');
          if (advBtn) advBtn.click();
        })()
      `);
      await pause(500);
      await shot('09-ar-light-1280-advanced-panel');

      // Close advanced panel
      await evaluate(`
        (() => {
          const advBtn = document.querySelector('[data-advanced-filter-button]');
          if (advBtn) advBtn.click();
        })()
      `);
      await pause(300);

      // ----------------------------------------------------
      // SECTION 2: Arabic Dark Mode ("Scholar Night")
      // ----------------------------------------------------
      console.log('[live] Switching to Dark mode...');
      await setLocale('ar', 'dark');
      await pause(400);
      await shot('10-ar-dark-1280-top');

      // ----------------------------------------------------
      // SECTION 3: Arabic 480px Viewport (Narrow / Mobile)
      // ----------------------------------------------------
      console.log('[live] Resizing to 480px narrow viewport...');
      win.setContentSize(480, 850);
      await pause(500);
      await setLocale('ar', 'light');
      dir = await evaluate('document.documentElement.getAttribute("dir")');
      assert.strictEqual(dir, 'rtl');
      await shot('11-ar-light-480-top');

      // Shot 12: 480px Advanced Filter Sheet
      console.log('[live] Opening Advanced filters Sheet at 480px...');
      await evaluate(`
        (() => {
          const advBtn = document.querySelector('[data-advanced-filter-button]');
          if (advBtn) advBtn.click();
        })()
      `);
      await pause(500);
      await shot('12-ar-light-480-advanced-sheet');

      // Close sheet
      await evaluate(`
        (() => {
          const closeBtn = document.querySelector('[data-sheet-close]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('إغلاق'));
          if (closeBtn) closeBtn.click();
        })()
      `);
      await pause(300);

      // ----------------------------------------------------
      // SECTION 4: English LTR 1280px
      // ----------------------------------------------------
      win.setContentSize(1280, 850);
      await pause(400);
      console.log('[live] Switching to English LTR...');
      await setLocale('en', 'light');
      dir = await evaluate('document.documentElement.getAttribute("dir")');
      assert.strictEqual(dir, 'ltr', 'Expected LTR for English');

      // Shot 13: English top of library list
      await shot('13-en-light-1280-top');

      // Shot 14: English scrolled down -> slim sticky bar
      console.log('[live] Testing English auto-hiding header on scroll down...');
      await evaluate(`
        (() => {
          const container = document.querySelector('[data-library-scroll-container]');
          if (container) {
            container.scrollTop = 320;
            container.dispatchEvent(new Event('scroll'));
          }
        })()
      `);
      await pause(500);
      const isEnStickyVisible = await evaluate('!!document.querySelector("[data-library-sticky-header]")');
      console.log('[live] Is English sticky header visible after scroll down?', isEnStickyVisible);
      assert.strictEqual(isEnStickyVisible, true, 'English sticky header must be visible after scrolling down');
      await shot('14-en-light-1280-scrolled');

      // Reset scroll
      await evaluate(`
        (() => {
          const container = document.querySelector('[data-library-scroll-container]');
          if (container) {
            container.scrollTop = 0;
            container.dispatchEvent(new Event('scroll'));
          }
        })()
      `);
      await pause(300);

      // Shot 15: English Card Hover / Focus overlay on cover
      console.log('[live] Testing English card hover / focus overlay...');
      await evaluate(`
        (() => {
          const card = document.querySelector('[data-library-book-card]');
          if (card) {
            card.focus();
            card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          }
        })()
      `);
      await pause(400);
      await shot('15-en-light-1280-card-hover');

      // Shot 16: English Card ⋯ actions menu
      console.log('[live] Testing English card actions ⋯ menu dropdown...');
      await evaluate(`
        (() => {
          const menuBtn = document.querySelector('[data-library-book-card] [data-card-menu-button]');
          if (menuBtn) menuBtn.click();
        })()
      `);
      await pause(400);
      await shot('16-en-light-1280-card-menu');

      // Close card menu
      await evaluate(`
        (() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        })()
      `);
      await pause(300);

      // Shot 17: English unpinned
      await evaluate(`
        (() => {
          const menuBtn = document.querySelector('[data-nav-menu-button]');
          if (menuBtn) menuBtn.click();
        })()
      `);
      await pause(400);
      await shot('17-en-light-1280-unpinned');

      // Shot 18: English peek overlay on left edge
      await evaluate(`
        (() => {
          const edge = document.querySelector('[data-nav-peek-trigger-edge]');
          if (edge) {
            edge.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            edge.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          }
        })()
      `);
      await pause(500);
      await shot('18-en-light-1280-peek');

      // Pin back in English
      await evaluate(`
        (() => {
          const menuBtn = document.querySelector('[data-nav-menu-button]');
          if (menuBtn) menuBtn.click();
        })()
      `);
      await pause(300);

      // Shot 19: English Advanced panel open
      await evaluate(`
        (() => {
          const advBtn = document.querySelector('[data-advanced-filter-button]');
          if (advBtn) advBtn.click();
        })()
      `);
      await pause(500);
      await shot('19-en-light-1280-advanced-panel');

      // Close advanced panel
      await evaluate(`
        (() => {
          const advBtn = document.querySelector('[data-advanced-filter-button]');
          if (advBtn) advBtn.click();
        })()
      `);
      await pause(300);

      // Shot 20: English dark mode
      await setLocale('en', 'dark');
      await pause(400);
      await shot('20-en-dark-1280-top');

      // ----------------------------------------------------
      // SECTION 5: English 480px Viewport
      // ----------------------------------------------------
      win.setContentSize(480, 850);
      await pause(400);
      await setLocale('en', 'light');
      dir = await evaluate('document.documentElement.getAttribute("dir")');
      assert.strictEqual(dir, 'ltr');
      await shot('21-en-light-480-top');

      // Shot 22: English 480px Advanced Sheet
      await evaluate(`
        (() => {
          const advBtn = document.querySelector('[data-advanced-filter-button]');
          if (advBtn) advBtn.click();
        })()
      `);
      await pause(500);
      await shot('22-en-light-480-advanced-sheet');

      console.log('[live] All 22 screenshots captured successfully!');
      app.exit(0);
    } catch (err) {
      console.error('[live failure]', err);
      app.exit(1);
    }
  })();
});

require('../../dist/main/index.js');
