const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_PRIMITIVES_PROFILE || path.resolve('.baglib-data/key296-profile');
const evidence = process.env.BAGLIB_PRIMITIVES_EVIDENCE || path.resolve('.baglib-data/KEY-296-evidence');

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
    win.setContentSize(1280, 900);
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
        filePath: path.resolve('tests/real-files/epub/en/Why Would Feminists Trust the Police -- Leah Cowan -- Verso 2024 -- Anna’s Archive.epub'),
        categories: ['Sociology', 'Law']
      },
      {
        id: 'physical-book-1',
        title: 'مقدمة ابن خلدون',
        author: 'ابن خلدون',
        workType: 'book',
        bookType: 'physical',
        physicalLocation: { room: 'المكتبة الرئيسية', bookcase: 'خزانة 2', shelf: 'رف 3' },
        categories: ['History', 'علم الاجتماع']
      }
    ];

    for (const file of realFiles) {
      await evaluate(`
        (async () => {
          try {
            await window.electronAPI.addBook(${JSON.stringify(file)});
          } catch (e) {
            console.error('Failed to seed book:', e);
          }
        })()
      `);
    }
    await pause(500);

    const setEnv = async ({ lang = 'ar', theme = 'light', width = 1280, height = 900 }) => {
      win.setContentSize(width, height);
      await pause(150);
      await evaluate(`
        (() => {
          localStorage.setItem('baglib-lang', '${lang}');
          localStorage.setItem('baglib-theme', '${theme}');
          const root = document.documentElement;
          root.setAttribute('lang', '${lang}');
          root.setAttribute('dir', '${lang === 'ar' ? 'rtl' : 'ltr'}');
          if ('${theme}' === 'dark') {
            root.classList.add('dark');
          } else {
            root.classList.remove('dark');
          }
          window.dispatchEvent(new Event('storage'));
        })()
      `);
      await pause(300);
    };

    // 2. Capture App Shell in matrix (ar/en, light/dark, 1280/480)
    console.log('[live] Capturing App Shell matrix...');
    for (const lang of ['ar', 'en']) {
      for (const theme of ['light', 'dark']) {
        for (const width of [1280, 480]) {
          await setEnv({ lang, theme, width, height: width === 480 ? 800 : 900 });
          await shot(`shell_${lang}_${theme}_${width}`);
        }
      }
    }

    // 3. Navigate to Playground
    console.log('[live] Navigating to /playground...');
    await win.loadURL('http://127.0.0.1:3000/playground');
    await until('!!document.querySelector("header")');
    await pause(500);

    // 4. Capture Playground Primitives Matrix
    console.log('[live] Capturing Playground Primitives matrix...');
    for (const lang of ['ar', 'en']) {
      for (const theme of ['light', 'dark']) {
        for (const width of [1280, 480]) {
          await setEnv({ lang, theme, width, height: width === 480 ? 950 : 900 });
          await shot(`playground_primitives_${lang}_${theme}_${width}`);
        }
      }
    }

    // 5. Interactive checks: Modal, Sheet, Toast in Playground
    await setEnv({ lang: 'ar', theme: 'light', width: 1280, height: 900 });

    // Open Modal
    console.log('[live] Triggering Modal in Playground...');
    await evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Modal'));
        if (btn) btn.click();
      })()
    `);
    await pause(350);
    await shot('playground_modal_ar_light_1280');

    // Close Modal
    await evaluate(`
      (() => {
        const closeBtn = document.querySelector('[role="dialog"] button');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await pause(250);

    // Open Sheet
    console.log('[live] Triggering Sheet in Playground...');
    await evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Sheet'));
        if (btn) btn.click();
      })()
    `);
    await pause(350);
    await shot('playground_sheet_ar_light_1280');

    // Close Sheet
    await evaluate(`
      (() => {
        const closeBtn = document.querySelector('[role="dialog"] button');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await pause(250);

    // Trigger Toast
    console.log('[live] Triggering Toast with Undo in Playground...');
    await evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Undo'));
        if (btn) btn.click();
      })()
    `);
    await pause(350);
    await shot('playground_toast_undo_ar_light_1280');

    // Switch to Tokens tab
    console.log('[live] Switching to Tokens Tab...');
    await evaluate(`
      (() => {
        const tab = Array.from(document.querySelectorAll('[role="tab"]')).find(t => t.textContent && (t.textContent.includes('Tokens') || t.textContent.includes('الألوان')));
        if (tab) tab.click();
      })()
    `);
    await pause(350);
    await shot('playground_tokens_ar_light_1280');

    console.log('[live] All live test captures completed successfully!');
    app.exit(0);
  })().catch((err) => {
    console.error('[live error]', err);
    app.exit(1);
  });
});

require('../../dist/main/index.js');
