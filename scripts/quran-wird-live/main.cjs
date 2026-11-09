const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_WIRD_PROFILE;
const evidence = process.env.BAGLIB_WIRD_EVIDENCE;
const lang = process.env.BAGLIB_WIRD_LANG || 'ar';

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

    // 1. Configure and seed Quran wird settings
    console.log(`[live] Seeding Quran wird settings for ${lang}...`);
    await evaluate(`
      window.electronAPI.studyWird.saveConfig({
        profile: 'hafs',
        unit: 'pages',
        dailyAmount: 2,
        startPosition: { surah: 1, ayah: 1, page: 1, juz: 1 },
        currentPosition: { surah: 1, ayah: 1, page: 1, juz: 1 },
        murajaa: {
          enabled: true,
          unit: 'juz',
          amount: 1,
          currentJuz: 1,
          rangeLimit: 30
        },
        activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
        lastCompletedDate: null,
        catchUpAccumulated: 0
      })
    `);

    // 2. Wait for Today panel and wird step card to appear
    await until('!!document.querySelector("[data-today-study-panel]")');
    await until('!!document.querySelector(\'[data-today-step*="wird"]\')', 15000);

    // Verify wird card details
    const stepText = await evaluate(`
      document.querySelector('[data-today-step*="wird"]')?.textContent || ''
    `);
    console.log(`[live] Step text found: ${stepText.slice(0, 80)}...`);
    assert.ok(stepText.length > 0, 'Wird step card text not found');

    // Screenshot 1: Today panel with Quran wird step at 1280px
    await shot('01-today-wird-1280');

    // 3. Open Quran Wird Settings Modal
    console.log('[live] Opening Quran wird settings modal...');
    await evaluate('document.querySelector("[data-today-wird-settings-button]")?.click()');
    await until('!!document.querySelector("[data-quran-wird-settings-modal]")');
    await pause(400);

    // Screenshot 2: Settings modal at 1280px
    await shot('02-wird-settings-modal-1280');

    // 4. Test missing-layout warning: Select Warsh + Pages unit
    console.log('[live] Selecting Warsh profile to test missing-layout warning...');
    await evaluate('document.querySelector("[data-wird-profile-warsh]")?.click()');
    await pause(500);

    const hasWarning = await evaluate('!!document.querySelector("[data-wird-layout-warning]")');
    console.log(`[live] Missing layout warning shown for Warsh with pages: ${hasWarning}`);
    assert.ok(hasWarning, 'Missing layout warning should be shown for Warsh with pages');

    // Screenshot 3: Missing layout warning
    await shot('03-wird-warsh-missing-layout-warning');

    // Switch to Ayahs unit for Warsh: warning should disappear
    await evaluate('document.querySelector("[data-wird-unit-ayahs]")?.click()');
    await pause(300);
    const warningGone = await evaluate('!document.querySelector("[data-wird-layout-warning]")');
    assert.ok(warningGone, 'Warning should disappear when switching to ayahs');

    // Restore Hafs with pages and close modal
    await evaluate('document.querySelector("[data-wird-profile-hafs]")?.click()');
    await evaluate('document.querySelector("[data-wird-unit-pages]")?.click()');
    await pause(300);
    await evaluate('document.querySelector("[data-wird-settings-close]")?.click()');
    await until('!document.querySelector("[data-quran-wird-settings-modal]")');
    await pause(400);

    // 5. Responsive check at 480px (mobile view)
    console.log('[live] Testing responsive view at 480px...');
    win.setContentSize(480, 800);
    await pause(800);

    // Verify horizontal overflow (0 horizontal scroll)
    const hasHorizontalOverflow = await evaluate(`
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    `);
    console.log(`[live] 480px horizontal overflow: ${hasHorizontalOverflow}`);
    assert.equal(hasHorizontalOverflow, false, 'Expected 0 horizontal overflow at 480px');

    // Screenshot 4: 480px responsive view
    await shot('04-today-wird-480');

    // 6. Test opening the portion in Quran View
    console.log('[live] Restoring size and opening wird portion in Quran view...');
    win.setContentSize(1280, 900);
    await pause(500);

    await evaluate('document.querySelector(\'[data-today-step*="wird"] [data-today-step-open]\')?.click()');
    await pause(1500);

    // Screenshot 5: Quran view opened
    await shot('05-quran-view-opened');

    console.log(`[live] Successfully finished checks for ${lang}!`);
    app.exit(0);
  })().catch((err) => {
    console.error(`[live error] ${err.stack || err}`);
    app.exit(1);
  });
});

require('../../dist/main/index.js');
