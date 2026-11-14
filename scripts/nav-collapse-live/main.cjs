const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = path.resolve(process.env.BAGLIB_KEY379_PROFILE || '.baglib-data/KEY-379-live');
const evidence = path.resolve(process.env.BAGLIB_KEY379_EVIDENCE || '.baglib-data/KEY-379-evidence');

app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
app.setAsDefaultProtocolClient = () => {
  throw new Error('No protocol registration in live check');
};

require('tsx/cjs');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../src/main/database/migrator.ts');
const { migrations } = require('../../src/main/database/migrations/index.ts');
fs.mkdirSync(path.join(profile, 'data'), { recursive: true });
const initial = new Database(path.join(profile, 'data/baglib.db'));
runMigrations(initial, migrations);
initial.close();

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

  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(
      "window.electronAPI && Promise.all([window.electronAPI.settings.set('onboarding.v1',{seen:true})])"
    ).catch(() => {});
  });

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
      win.setContentSize(1280, 800);
      win.show();
      win.focus();

      console.log('[live] Waiting for Next renderer page to load...');
      for (let i = 0; i < 150 && (!win.webContents.getURL().startsWith('http://localhost:3000') || win.webContents.isLoading()); i++) {
        await pause(200);
      }
      console.log('[live] Current URL:', win.webContents.getURL());

      console.log('[live] Waiting for application shell and aside navigation rail...');
      await until("document.querySelector('aside') !== null");
      await pause(1000);

      // --- Scenario 1: Arabic (RTL) Auto-Collapse and Manual Expansion ---
      console.log('[live] Checking Arabic initial state...');
      await evaluate("document.documentElement.dir = 'rtl'; document.documentElement.lang = 'ar'");
      await pause(300);

      const isInitiallyCollapsed = await evaluate(
        "document.querySelector('aside').getAttribute('data-sidebar-collapsed') === 'true'"
      );
      assert.strictEqual(isInitiallyCollapsed, true, 'Sidebar must initially be collapsed to its rail');

      const initialWidth = await evaluate(
        "document.querySelector('aside').getBoundingClientRect().width"
      );
      assert.ok(initialWidth <= 70, `Collapsed rail width must be compact, got: ${initialWidth}`);
      await shot('01-ar-initial-collapsed');

      // Click Expand button
      console.log('[live] Clicking expand button by hand...');
      await evaluate("document.querySelector('button[data-testid=\"expand-sidebar-btn\"]').click()");
      await pause(400);

      const isCollapsed = await evaluate(
        "document.querySelector('aside').getAttribute('data-sidebar-collapsed') === 'true'"
      );
      assert.strictEqual(isCollapsed, false, 'Sidebar must be expanded after clicking expand button');

      const expandedWidth = await evaluate(
        "document.querySelector('aside').getBoundingClientRect().width"
      );
      assert.ok(expandedWidth >= 200, `Expanded sidebar width must be ~224px, got: ${expandedWidth}`);
      await shot('02-ar-manually-expanded');

      // Click a workspace tab (Library)
      console.log('[live] Entering Library workspace tab from expanded sidebar...');
      await evaluate("document.querySelector('button[data-nav-item=\"library\"]').click()");
      await pause(400);

      const isCollapsedAfterTab = await evaluate(
        "document.querySelector('aside').getAttribute('data-sidebar-collapsed') === 'true'"
      );
      assert.strictEqual(isCollapsedAfterTab, true, 'Sidebar must automatically collapse to rail upon entering tab');

      const collapsedWidthAfterTab = await evaluate(
        "document.querySelector('aside').getBoundingClientRect().width"
      );
      assert.ok(collapsedWidthAfterTab <= 70, `Rail width must return to compact, got: ${collapsedWidthAfterTab}`);
      await shot('03-ar-library-tab-collapsed');

      // Manually expand again on Library tab
      console.log('[live] Re-expanding on Library tab...');
      await evaluate("document.querySelector('button[data-testid=\"expand-sidebar-btn\"]').click()");
      await pause(400);
      await shot('04-ar-library-re-expanded');

      // Navigate to Quran tab via click
      console.log('[live] Entering Quran tab...');
      await evaluate("document.querySelector('button[data-nav-item=\"quran\"]').click()");
      await pause(400);

      const isCollapsedQuran = await evaluate(
        "document.querySelector('aside').getAttribute('data-sidebar-collapsed') === 'true'"
      );
      assert.strictEqual(isCollapsedQuran, true, 'Sidebar must auto-collapse when entering Quran tab');
      await shot('05-ar-quran-tab-collapsed');

      // --- Scenario 2: English (LTR) ---
      console.log('[live] Switching to English (LTR)...');
      await evaluate("document.documentElement.dir = 'ltr'; document.documentElement.lang = 'en'");
      await pause(300);
      await shot('06-en-initial-collapsed');

      // Expand sidebar in English
      console.log('[live] Expanding sidebar in English...');
      await evaluate("document.querySelector('button[data-testid=\"expand-sidebar-btn\"]').click()");
      await pause(400);
      await shot('07-en-manually-expanded');

      // Click Notes tab
      console.log('[live] Entering Notes tab in English...');
      await evaluate("document.querySelector('button[data-nav-item=\"notes\"]').click()");
      await pause(400);

      const isCollapsedNotes = await evaluate(
        "document.querySelector('aside').getAttribute('data-sidebar-collapsed') === 'true'"
      );
      assert.strictEqual(isCollapsedNotes, true, 'Sidebar must auto-collapse when entering Notes tab in English');
      await shot('08-en-notes-tab-collapsed');

      // Click Dashboard brand button
      console.log('[live] Re-expanding and clicking Dashboard button...');
      await evaluate("document.querySelector('button[data-testid=\"expand-sidebar-btn\"]').click()");
      await pause(400);
      await evaluate("document.querySelector('button[data-nav-item=\"dashboard\"]').click()");
      await pause(400);

      const isCollapsedDash = await evaluate(
        "document.querySelector('aside').getAttribute('data-sidebar-collapsed') === 'true'"
      );
      assert.strictEqual(isCollapsedDash, true, 'Sidebar must auto-collapse when entering Dashboard tab');
      await shot('09-en-dashboard-collapsed');

      console.log('[live] All live navigation collapse assertions passed successfully!');
      fs.writeFileSync(
        path.join(evidence, 'results.json'),
        JSON.stringify(
          {
            passed: true,
            checked: [
              'ar-initial-collapsed',
              'ar-manually-expanded',
              'ar-library-tab-collapsed',
              'ar-library-re-expanded',
              'ar-quran-tab-collapsed',
              'en-initial-collapsed',
              'en-manually-expanded',
              'en-notes-tab-collapsed',
              'en-dashboard-collapsed',
            ],
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );

      app.exit(0);
    } catch (err) {
      console.error('[live error]', err);
      app.exit(1);
    }
  })();
});

require('../../dist/main/index.js');
