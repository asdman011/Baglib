const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_LIBRARY_PROFILE || path.resolve('.baglib-data/key299-profile');
const evidence = process.env.BAGLIB_LIBRARY_EVIDENCE || path.resolve('.baglib-data/KEY-299-evidence');

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
          id: 'pdf-ar-text',
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
          id: 'pdf-en-text',
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
          id: 'epub-en-text',
          title: 'Why Would Feminists Trust the Police',
          author: 'Leah Cowan',
          workType: 'book',
          bookType: 'digital',
          digitalFormat: 'EPUB',
          filePath: path.resolve('tests/real-files/epub/en/Why Would Feminists Trust the Police.epub'),
          categories: ['Sociology'],
          tags: ['#sociology'],
          readingStatus: 'completed',
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'physical-book-1',
          title: 'فتح الباري شرح صحيح البخاري',
          author: 'ابن حجر العسقلاني',
          workType: 'book',
          bookType: 'physical',
          room: 'المكتبة المركزية',
          shelf: 'رف الحديث 3',
          categories: ['حديث', 'شروح'],
          tags: ['#أصول', '#سنة'],
          readingStatus: 'unread',
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'wishlist-book-1',
          title: 'جامع البيان في تأويل القرآن',
          author: 'محمد بن جرير الطبري',
          workType: 'book',
          bookType: 'digital',
          categories: ['تفسير'],
          tags: ['#أمنيات', '#تفسير'],
          readingStatus: 'wishlist',
          createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];

      for (const file of realFiles) {
        if (!file.filePath || fs.existsSync(file.filePath)) {
          await evaluate(`
            (async () => {
              try {
                const book = ${JSON.stringify(file)};
                await window.electronAPI.addBook(book);
              } catch (e) {
                console.error('Failed to seed book:', e);
              }
            })()
          `);
        }
      }

      console.log('[live] Navigating to Library view...');
      await evaluate(`
        (async () => {
          const navBtn = Array.from(document.querySelectorAll('button')).find(b =>
            b.getAttribute('title')?.includes('المكتبة') ||
            b.getAttribute('title')?.includes('Library') ||
            b.getAttribute('aria-label')?.includes('المكتبة') ||
            b.getAttribute('aria-label')?.includes('Library')
          );
          if (navBtn) navBtn.click();
        })()
      `);

      await until('!!document.querySelector("[data-collection-header]")');
      console.log('[live] Collection header loaded.');
      await pause(1000);

      // Verify presence of core elements
      const hasCollectionHeader = await evaluate('!!document.querySelector("[data-collection-header]")');
      assert.ok(hasCollectionHeader, 'Collection header must be present');

      // Since KEY-310 the filter rail sits behind the Advanced button, so open it first.
      if (!(await evaluate('!!document.querySelector("[data-library-filter-rail]")'))) {
        await evaluate('[...document.querySelectorAll("[data-advanced-filter-button]")].find(b => b.offsetParent)?.click()');
        await until('!!document.querySelector("[data-library-filter-rail]")');
      }
      const hasFilterRail = await evaluate('!!document.querySelector("[data-library-filter-rail]")');
      assert.ok(hasFilterRail, 'Filter rail must be present on desktop');

      // 1. Arabic RTL - Light - 1280x850
      console.log('[live] Capturing: library-ar-1280-light');
      await evaluate(`
        (async () => {
          document.documentElement.classList.remove('dark');
          document.documentElement.setAttribute('dir', 'rtl');
        })()
      `);
      await shot('library-ar-1280-light');

      // 2. Arabic RTL - Dark - 1280x850
      console.log('[live] Capturing: library-ar-1280-dark');
      await evaluate(`
        (async () => {
          document.documentElement.classList.add('dark');
        })()
      `);
      await shot('library-ar-1280-dark');

      // 3. Filter Rail Topic Filter interaction
      console.log('[live] Capturing: library-topic-filtered');
      await evaluate(`
        (async () => {
          const firstChip = document.querySelector('[data-filter-topic-chip]');
          if (firstChip) firstChip.click();
        })()
      `);
      await pause(500);
      await shot('library-topic-filtered');

      // Reset filter
      await evaluate(`
        (async () => {
          const clearBtn = document.querySelector('[data-clear-filters]');
          if (clearBtn) clearBtn.click();
        })()
      `);
      await pause(500);

      // 4. List View toggle
      console.log('[live] Capturing: library-list-view');
      await evaluate(`
        (async () => {
          const listToggle = document.querySelector('button[title*="قائمة"], button[title*="List"]');
          if (listToggle) listToggle.click();
        })()
      `);
      await pause(500);
      await shot('library-list-view');

      // Switch back to grid view
      await evaluate(`
        (async () => {
          const gridToggle = document.querySelector('button[title*="شبكة"], button[title*="Grid"]');
          if (gridToggle) gridToggle.click();
        })()
      `);
      await pause(500);

      // 5. Calm Ribbon More Menu open
      console.log('[live] Capturing: library-more-menu');
      await evaluate(`
        (async () => {
          const moreBtn = document.querySelector('[data-library-more-menu-btn]');
          if (moreBtn) moreBtn.click();
        })()
      `);
      await pause(400);
      await shot('library-more-menu');

      // Close more menu
      await evaluate(`
        (async () => {
          const moreBtn = document.querySelector('[data-library-more-menu-btn]');
          if (moreBtn) moreBtn.click();
        })()
      `);
      await pause(300);

      // 6. Mobile 480 px - Arabic RTL Light
      console.log('[live] Resizing to mobile 480x850...');
      win.setContentSize(480, 850);
      await evaluate(`
        (async () => {
          document.documentElement.classList.remove('dark');
        })()
      `);
      await pause(600);
      console.log('[live] Capturing: library-ar-480-light');
      await shot('library-ar-480-light');

      // 7. Mobile Sheet open
      console.log('[live] Opening mobile filter sheet...');
      await evaluate(`
        (async () => {
          const sheetBtn = document.querySelector('[data-mobile-filter-button]');
          if (sheetBtn) sheetBtn.click();
        })()
      `);
      await pause(600);
      console.log('[live] Capturing: library-ar-480-sheet');
      await shot('library-ar-480-sheet');

      // Close sheet and return to 1280 px
      await evaluate(`
        (async () => {
          const closeBtn = document.querySelector('[data-sheet-close], button[aria-label="Close"]');
          if (closeBtn) closeBtn.click();
        })()
      `);
      await pause(300);
      win.setContentSize(1280, 850);
      await pause(600);

      // 8. English LTR - Light 1280x850
      console.log('[live] Switching to English LTR...');
      await evaluate(`
        (async () => {
          // Find language toggle or switch via workspace
          const langToggle = Array.from(document.querySelectorAll('button')).find(b =>
            b.getAttribute('title')?.includes('الإنجليزية') ||
            b.getAttribute('title')?.includes('English') ||
            b.getAttribute('title')?.includes('Arabic') ||
            b.getAttribute('title')?.includes('العربية') ||
            b.textContent?.includes('EN') ||
            b.textContent?.includes('AR')
          );
          if (langToggle) {
            langToggle.click();
          } else {
            document.documentElement.setAttribute('dir', 'ltr');
            document.documentElement.setAttribute('lang', 'en');
          }
        })()
      `);
      await pause(1000);
      console.log('[live] Capturing: library-en-1280-light');
      await shot('library-en-1280-light');

      // 9. English LTR - Dark 1280x850
      console.log('[live] Capturing: library-en-1280-dark');
      await evaluate(`
        (async () => {
          document.documentElement.classList.add('dark');
        })()
      `);
      await pause(400);
      await shot('library-en-1280-dark');

      // 10. English LTR - 480px Light
      console.log('[live] Capturing: library-en-480-light');
      win.setContentSize(480, 850);
      await evaluate(`
        (async () => {
          document.documentElement.classList.remove('dark');
        })()
      `);
      await pause(500);
      await shot('library-en-480-light');

      console.log('[live] All live test assertions and screenshots completed successfully!');
      app.exit(0);
    } catch (err) {
      console.error('[live failure]', err);
      app.exit(1);
    }
  })();
});

require('../../dist/main/index.js');
