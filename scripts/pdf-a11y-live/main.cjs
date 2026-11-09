const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_PDF_A11Y_LIVE_DIR;
const evidenceDir = process.env.BAGLIB_EVIDENCE_DIR || directory;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));

const pause = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
const labels = {
  ar: { library: 'المكتبة', read: 'قراءة' },
  en: { library: 'Library', read: 'Read' },
};

let started = false;

app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;
  owner.show();
  owner.focus();
  owner.webContents.focus();

  const consoleLines = [];
  owner.webContents.on('console-message', (_event, _level, message) => {
    consoleLines.push(message.slice(0, 400));
    console.log('[renderer]', message.slice(0, 300));
  });

  const evaluate = (code) =>
    owner.webContents.executeJavaScript(code, true).catch((error) => {
      throw new Error(`${error.message}: ${code.slice(0, 200)}`);
    });

  const until = async (code, tries = 300) => {
    for (let index = 0; index < tries; index++) {
      try {
        if (await evaluate(code)) return;
      } catch {}
      await pause(400);
    }
    throw new Error(`Timed out waiting for: ${code}`);
  };

  const shot = async (name) => {
    await pause(800);
    owner.webContents.invalidate();
    await pause(400);
    const png = (await owner.webContents.capturePage()).toPNG();
    fs.writeFileSync(path.join(directory, `${name}.png`), png);
    if (evidenceDir && evidenceDir !== directory) {
      try {
        fs.writeFileSync(path.join(evidenceDir, `${name}.png`), png);
      } catch {}
    }
    console.log(`[pdf-a11y-live] Captured screenshot: ${name}.png`);
  };

  const key = (value, extra = '') =>
    evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(value)},bubbles:true${extra}}))`);

  const load = async (language, width = 1280, height = 900) => {
    owner.setContentSize(width, height);
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`);
    await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await key('Escape');
    await pause(1000);
  };

  (async () => {
    try {
      const throwawayArabicScan = path.join(directory, 'arabic-scanned.pdf');
      const throwawayArabicText = path.join(directory, 'arabic-text.pdf');
      const throwawayEnglishMag = path.join(directory, 'english-magazine.pdf');
      const throwawayEnglishBook = path.join(directory, 'english-book.pdf');

      // 1. Initial load to initialize database
      console.log('[pdf-a11y-live] Loading English interface at 1280x900');
      await load('en', 1280, 900);

      // Add books to DB
      console.log('[pdf-a11y-live] Registering test books in throwaway DB');
      await evaluate(`
        window.electronAPI.addBook({
          id: 'test-en-book',
          title: 'Why Lyrics Last',
          author: 'Brian Boyd',
          workType: 'book',
          bookType: 'digital',
          digitalFormat: 'PDF',
          filePath: ${JSON.stringify(throwawayEnglishBook)}
        })
      `);

      await evaluate(`
        window.electronAPI.addBook({
          id: 'test-ar-book',
          title: 'الدفاع عن أراضي المسلمين',
          author: 'عبدالله عزام',
          workType: 'book',
          bookType: 'digital',
          digitalFormat: 'PDF',
          filePath: ${JSON.stringify(throwawayArabicText)}
        })
      `);

      // ==========================================
      // SECTION 1: Backend Accessibility Engine Checks on All 4 Benchmark PDFs
      // ==========================================
      console.log('[pdf-a11y-live] --- 1. Checking Arabic Scanned PDF (Image Only) ---');
      const arScanCheck = await evaluate(`
        window.electronAPI.pdfEditor.accessibilityCheck({
          path: ${JSON.stringify(throwawayArabicScan)},
          runVeraPdf: false
        })
      `);
      assert.ok(arScanCheck.ok, `Arabic scan check failed: ${arScanCheck.error}`);
      assert.equal(arScanCheck.data.base.isTagged, false, 'Arabic scan should not be tagged');
      assert.equal(arScanCheck.data.base.pagesWithoutText.length, 42, 'Arabic scan must report 42 pages without text');
      console.log('✓ Arabic scanned PDF correctly verified (42 pages without text, untagged, no crash)');

      console.log('[pdf-a11y-live] --- 2. Checking Arabic Text-Layer PDF (PUA glyphs) ---');
      const arTextCheck = await evaluate(`
        window.electronAPI.pdfEditor.accessibilityCheck({
          path: ${JSON.stringify(throwawayArabicText)},
          runVeraPdf: false
        })
      `);
      assert.ok(arTextCheck.ok, `Arabic text check failed: ${arTextCheck.error}`);
      assert.equal(arTextCheck.data.base.pagesWithoutText.length, 0, 'Arabic text PDF should have text on all pages');
      assert.ok(arTextCheck.data.base.fontsWithoutToUnicode.length > 0, 'Arabic text PDF should detect fonts lacking /ToUnicode');
      console.log(`✓ Arabic text PDF correctly verified (${arTextCheck.data.base.fontsWithoutToUnicode.length} fonts lacking /ToUnicode)`);

      console.log('[pdf-a11y-live] --- 3. Checking English Magazine (Multi-column) ---');
      const enMagCheck = await evaluate(`
        window.electronAPI.pdfEditor.accessibilityCheck({
          path: ${JSON.stringify(throwawayEnglishMag)},
          runVeraPdf: false
        })
      `);
      assert.ok(enMagCheck.ok, `English mag check failed: ${enMagCheck.error}`);
      assert.ok(enMagCheck.data.base.readingOrder.length > 0, 'English magazine should have reading order blocks');
      assert.ok(enMagCheck.data.base.pagesWithoutText.includes(3), 'English magazine page 3 (ad) has no text');
      console.log(`✓ English magazine correctly verified (${enMagCheck.data.base.readingOrder.length} reading order blocks, pages 3/4 ads detected)`);

      console.log('[pdf-a11y-live] --- 4. Checking English Book (Title set, veraPDF) ---');
      const enBookCheck = await evaluate(`
        window.electronAPI.pdfEditor.accessibilityCheck({
          path: ${JSON.stringify(throwawayEnglishBook)},
          runVeraPdf: true
        })
      `);
      assert.ok(enBookCheck.ok, `English book check failed: ${enBookCheck.error}`);
      assert.equal(enBookCheck.data.base.hasTitle, true, 'English book has title metadata');
      assert.equal(enBookCheck.data.base.displayDocTitle, false, 'English book DisplayDocTitle is initially false');
      assert.ok(enBookCheck.data.veraPdfAvailable, 'veraPDF should be available from .baglib-data/pdf-engine/');
      assert.ok(enBookCheck.data.veraPdfReport !== null, 'veraPDF report should be populated');
      console.log(`✓ English book correctly verified (title detected, DisplayDocTitle false, veraPDF checked: compliant=${enBookCheck.data.veraPdfReport.compliant})`);

      // ==========================================
      // SECTION 2: Staged Fix & ADR-012 Emergency Copy
      // ==========================================
      console.log('[pdf-a11y-live] --- 5. Staged Fix & ADR-012 Emergency Copy Verification ---');
      const fixResult = await evaluate(`
        window.electronAPI.pdfEditor.fixAccessibility({
          path: ${JSON.stringify(throwawayEnglishBook)},
          language: 'en',
          title: 'Why Lyrics Last: Evolution & Cognition'
        })
      `);
      assert.ok(fixResult.ok, `Fix staging failed: ${fixResult.error}`);
      const stagedFile = fixResult.data.output || fixResult.data.stagedPath;
      assert.ok(fs.existsSync(stagedFile), 'Staged fixed file must exist on disk');
      console.log('✓ Accessibility fix staged successfully at', stagedFile);

      // Save staged fix over target file
      const saveResult = await evaluate(`
        window.electronAPI.pdfEditor.saveAccessibilityFix({
          path: ${JSON.stringify(throwawayEnglishBook)},
          stagedPath: ${JSON.stringify(stagedFile)}
        })
      `);
      assert.ok(saveResult.ok, `Saving accessibility fix failed: ${saveResult.error}`);
      console.log('✓ Accessibility fix saved to target file');

      // Verify exactly ONE emergency copy exists (ADR-012)
      const allFiles = fs.readdirSync(directory);
      const backups = allFiles.filter(f => f.includes('.baglib-backup-'));
      assert.equal(backups.length, 1, `Expected exactly 1 emergency backup file, found ${backups.length}: ${JSON.stringify(backups)}`);
      console.log(`✓ ADR-012 Emergency backup verified: exactly one backup exists (${backups[0]})`);

      // Verify metadata is now updated in the saved file
      const verifyCheck = await evaluate(`
        window.electronAPI.pdfEditor.accessibilityCheck({
          path: ${JSON.stringify(throwawayEnglishBook)},
          runVeraPdf: false
        })
      `);
      assert.ok(verifyCheck.ok);
      assert.equal(verifyCheck.data.base.hasLanguage, true, 'Language must be set after fix');
      assert.equal(verifyCheck.data.base.language, 'en', 'Language must be "en"');
      assert.equal(verifyCheck.data.base.displayDocTitle, true, 'DisplayDocTitle must be true after fix');
      console.log('✓ Saved file verified: language="en", displayDocTitle=true');

      // ==========================================
      // SECTION 3: UI Reader & Accessibility Drawer (English LTR)
      // ==========================================
      console.log('[pdf-a11y-live] --- 6. UI Reader Verification in English LTR ---');
      await load('en', 1280, 900);

      await evaluate(`document.querySelector('aside button[aria-label=${JSON.stringify(labels.en.library)}]')?.click()`);
      await until(`[...document.querySelectorAll('button')].some(b => b.title === ${JSON.stringify(labels.en.read)} || b.textContent.trim() === ${JSON.stringify(labels.en.read)})`);
      console.log('[pdf-a11y-live] Opening English book in reader');
      await evaluate(`(() => {
        const read = ${JSON.stringify(labels.en.read)};
        const isRead = b => b.title === read || b.textContent.trim() === read;
        const title = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.includes('Why Lyrics Last'));
        let node = title;
        while (node && ![...node.querySelectorAll('button')].some(isRead)) node = node.parentElement;
        if (!node) throw new Error('no read button for english book');
        [...node.querySelectorAll('button')].find(isRead).click();
      })()`);

      // Wait for reader top bar & accessibility button
      await until('!!document.querySelector("[data-pdf-accessibility-button]")', 200);
      await pause(1500);

      // Verify keyboard accessibility of top bar buttons
      const buttonsAccessible = await evaluate(`
        (() => {
          const a11yBtn = document.querySelector('[data-pdf-accessibility-button]');
          const reflowBtn = document.querySelector('[data-pdf-reflow-top-button]');
          return Boolean(a11yBtn && a11yBtn.tabIndex === 0 && reflowBtn && reflowBtn.tabIndex === 0);
        })()
      `);
      assert.ok(buttonsAccessible, 'Accessibility & Reflow top-bar buttons must be keyboard focusable (tabIndex === 0)');
      console.log('✓ Top bar accessibility and reflow buttons are keyboard accessible');

      // Open Accessibility Drawer
      await evaluate('document.querySelector("[data-pdf-accessibility-button]").click()');
      await until('!!document.querySelector("[data-pdf-accessibility-drawer]")', 100);
      await until('!!document.querySelector("[data-toggle-reading-order]")', 150);
      await pause(1000);
      await shot('01-a11y-drawer-en-1280');

      // Toggle Reading Order Overlay
      await evaluate('document.querySelector("[data-toggle-reading-order]").click()');
      await until('!!document.querySelector("[data-pdf-reading-order-overlay]")', 100);
      await pause(800);
      await shot('02-reading-order-overlay-en');

      // Open Reflow View Modal
      await evaluate('document.querySelector("[data-pdf-reflow-button]")?.click() || document.querySelector("[data-pdf-reflow-top-button]")?.click()');
      await until('!!document.querySelector("[data-pdf-reflow-modal]")', 100);
      await pause(1000);
      await shot('03-reflow-modal-en-1280');

      // Test English Read-Aloud sentence highlight & play
      await evaluate('document.querySelector("[data-reflow-play]").click()');
      await pause(1200);
      await shot('04-reflow-reading-en-1280');

      // Test responsive 480px width (assert no horizontal overflow)
      console.log('[pdf-a11y-live] Testing 480px responsive layout (English LTR)');
      owner.setContentSize(480, 800);
      await pause(1200);
      const enOverflow = await evaluate(`
        document.body.scrollWidth > document.body.clientWidth ||
        document.querySelector('[data-reflow-content]')?.scrollWidth > document.querySelector('[data-reflow-content]')?.clientWidth
      `);
      assert.equal(enOverflow, false, 'No horizontal overflow allowed at 480px');
      await shot('05-reflow-modal-en-480');
      console.log('✓ 480px layout verified: no horizontal overflow in English');

      // ==========================================
      // SECTION 4: Arabic RTL Interface & Missing Voice Graceful Handling
      // ==========================================
      console.log('[pdf-a11y-live] --- 7. UI Verification in Arabic RTL ---');
      await load('ar', 1280, 900);

      await evaluate(`document.querySelector('aside button[aria-label=${JSON.stringify(labels.ar.library)}]')?.click()`);
      await until(`[...document.querySelectorAll('button')].some(b => b.title === ${JSON.stringify(labels.ar.read)} || b.textContent.trim() === ${JSON.stringify(labels.ar.read)})`);
      console.log('[pdf-a11y-live] Opening Arabic book in reader');
      await evaluate(`(() => {
        const read = ${JSON.stringify(labels.ar.read)};
        const isRead = b => b.title === read || b.textContent.trim() === read;
        const title = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.includes('أراضي المسلمين'));
        let node = title;
        while (node && ![...node.querySelectorAll('button')].some(isRead)) node = node.parentElement;
        if (!node) throw new Error('no read button for arabic book');
        [...node.querySelectorAll('button')].find(isRead).click();
      })()`);

      // Wait for reader top bar & accessibility button
      await until('!!document.querySelector("[data-pdf-accessibility-button]")', 200);
      await pause(1500);

      // Open Accessibility Drawer in Arabic
      await evaluate('document.querySelector("[data-pdf-accessibility-button]").click()');
      await until('!!document.querySelector("[data-pdf-accessibility-drawer]")', 100);
      await until('!!document.querySelector("[data-toggle-reading-order]")', 150);
      await pause(1000);
      await shot('06-a11y-drawer-ar-1280');

      // Open Reflow View in Arabic
      await evaluate('document.querySelector("[data-pdf-reflow-button]")?.click() || document.querySelector("[data-pdf-reflow-top-button]")?.click()');
      await until('!!document.querySelector("[data-pdf-reflow-modal]")', 100);
      await pause(1000);

      // Advance to Page 2 which contains real Arabic body text
      console.log('[pdf-a11y-live] Advancing reflow view to Page 2 (real Arabic body text)');
      await evaluate('document.querySelector("[data-reflow-next-page]").click()');
      await until('[...document.querySelectorAll("[data-reflow-paragraph]")].some(p => p.textContent.includes("إنفروا خفافا"))', 100);
      await pause(1000);

      // Verify readable joined Arabic without any PUA or box characters
      const page2Text = await evaluate('document.querySelector("[data-reflow-content]").textContent');
      assert.ok(page2Text.includes('إنفروا خفافا وثقالا'), 'Page 2 must contain readable Arabic text');
      assert.ok(!/[\uE000-\uF8FF]/u.test(page2Text), 'Page 2 must not contain any raw PUA box characters');
      console.log('✓ Page 2 verified: readable joined Arabic rendered cleanly without boxes');
      await shot('07-reflow-modal-ar-1280');

      // Test Arabic Read-Aloud when no Arabic voice is installed
      console.log('[pdf-a11y-live] Testing Arabic read-aloud: assert localized notice displayed without crash');
      await evaluate('document.querySelector("[data-reflow-play]").click()');
      await until('!!document.querySelector("[data-reflow-no-voice-notice]")', 100);
      const noticeText = await evaluate('document.querySelector("[data-reflow-no-voice-notice]").textContent');
      assert.ok(noticeText.includes('لا يوجد صوت عربي مثبت على هذا الجهاز'), `Expected Arabic missing voice notice, got: "${noticeText}"`);
      await pause(600);
      await shot('08-reflow-no-voice-notice-ar-1280');
      console.log('✓ Localized notice displayed successfully without crash:', noticeText.trim());

      // Test responsive 480px width in Arabic
      console.log('[pdf-a11y-live] Testing 480px responsive layout (Arabic RTL)');
      owner.setContentSize(480, 800);
      await pause(1200);
      const arOverflow = await evaluate(`
        document.body.scrollWidth > document.body.clientWidth ||
        document.querySelector('[data-reflow-content]')?.scrollWidth > document.querySelector('[data-reflow-content]')?.clientWidth
      `);
      assert.equal(arOverflow, false, 'No horizontal overflow allowed at 480px in Arabic');
      await shot('09-reflow-modal-ar-480');
      console.log('✓ 480px layout verified: no horizontal overflow in Arabic');

      console.log('[pdf-a11y-live] ALL VERIFICATION STEPS PASSED SUCCESSFULLY!');
      owner.destroy();
      app.quit();
    } catch (err) {
      console.error('[pdf-a11y-live] ERROR:', err);
      try {
        await shot('error-state');
      } catch {}
      owner.destroy();
      app.exit(1);
    }
  })();
});

require('../../dist/main/index.js');
