const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_OCR_REVIEW_LIVE_DIR;
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

  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => {
    consoleLines.push(message.slice(0, 400));
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
    console.log(`[ocr-review-live] Captured screenshot: ${name}.png`);
  };

  const key = (value, extra = '') =>
    evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(value)},bubbles:true${extra}}))`);

  const load = async (language) => {
    owner.setContentSize(1280, 900);
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`);
    await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await key('Escape');
    await pause(1200);
  };

  (async () => {
    const results = {};
    const arabicPdfPath = path.join(directory, 'arabic-scan.pdf');
    const englishPdfPath = path.join(directory, 'english-sample.pdf');

    // 1. Initial load to initialize database and add books
    await load('en');

    console.log('[ocr-review-live] Adding test books to database');
    await evaluate(`
      window.electronAPI.addBook({
        id: 'ocr-arabic-book',
        title: 'تفسير المعوذتين — Arabic Scan',
        author: 'ابن تيمية',
        workType: 'book',
        bookType: 'digital',
        digitalFormat: 'PDF',
        filePath: ${JSON.stringify(arabicPdfPath)}
      })
    `);

    await evaluate(`
      window.electronAPI.addBook({
        id: 'ocr-english-book',
        title: 'New Scientist 2016 — English',
        author: 'New Scientist',
        workType: 'book',
        bookType: 'digital',
        digitalFormat: 'PDF',
        filePath: ${JSON.stringify(englishPdfPath)}
      })
    `);

    // ==========================================
    // 2. Arabic Scanned Benchmark Flow (RTL)
    // ==========================================
    console.log('[ocr-review-live] Reloading in Arabic (RTL)');
    await load('ar');

    await evaluate(`document.querySelector('aside button[aria-label=${JSON.stringify(labels.ar.library)}]').click()`);
    await until(`[...document.querySelectorAll('button')].some(b=>b.title===${JSON.stringify(labels.ar.read)}||b.textContent.trim()===${JSON.stringify(labels.ar.read)})`);

    console.log('[ocr-review-live] Opening Arabic scanned book in reader');
    await evaluate(`(() => {
      const read = ${JSON.stringify(labels.ar.read)};
      const isRead = b => b.title === read || b.textContent.trim() === read;
      const title = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.includes('المعوذتين'));
      let node = title;
      while (node && ![...node.querySelectorAll('button')].some(isRead)) node = node.parentElement;
      if (!node) throw new Error('no read button for arabic book');
      [...node.querySelectorAll('button')].find(isRead).click();
    })()`);

    // Wait for PDF canvas to render
    await until("!!document.querySelector('canvas.pdf-canvas')", 120);
    await pause(1500);

    // Trigger OCR page recognition from bottom pill
    console.log('[ocr-review-live] Clicking Recognize Page Text (OCR) button on pill');
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('التعرف على النص') || b.textContent.includes('Recognize Page Text'));
      if (!btn) throw new Error('OCR recognize button not found on bottom pill');
      btn.click();
    })()`);

    // Wait for OCR to complete (Tesseract on page 1 of scan)
    console.log('[ocr-review-live] Waiting for OCR words to appear in overlay...');
    await until("document.querySelectorAll('.ocr-word-node').length > 0", 250);
    const arabicWordsCount = await evaluate("document.querySelectorAll('.ocr-word-node').length");
    console.log(`[ocr-review-live] Arabic OCR completed! Words detected: ${arabicWordsCount}`);

    // Open OCR Inspector drawer via pill button
    await pause(1000);
    await evaluate(`(() => {
      const toggleBtn = [...document.querySelectorAll('button')].find(b => b.title?.includes('فاحص') || b.title?.includes('Inspector') || b.querySelector('.lucide-sliders'));
      if (toggleBtn) toggleBtn.click();
      else throw new Error('Inspector drawer toggle button not found on pill');
    })()`);

    // Wait for drawer dialog to be open
    await until("!!document.querySelector('aside[role=dialog]')", 50);
    await pause(1000);

    // Switch to Review tab in OcrInspectorDrawer
    console.log('[ocr-review-live] Switching to Review tab in drawer');
    await evaluate(`(() => {
      const reviewTab = [...document.querySelectorAll('aside[role=dialog] button')].find(b => b.textContent.includes('مراجعة') || b.textContent.includes('Review'));
      if (reviewTab) reviewTab.click();
      else throw new Error('Review tab button not found in drawer');
    })()`);
    await pause(1200);

    // Inspect Review state
    const arabicReviewState = await evaluate(`(() => {
      const drawer = document.querySelector('aside[role=dialog]');
      const countBadge = drawer?.querySelector('.lucide-sparkles')?.parentElement?.parentElement?.querySelector('span.font-mono')?.textContent;
      const cropCanvas = drawer?.querySelector('canvas');
      const activeWord = document.querySelector('.ocr-word-node[data-ocr-active="true"]')?.textContent;
      return {
        hasDrawer: !!drawer,
        countBadge,
        hasCropCanvas: !!cropCanvas,
        activeWord,
        dir: drawer?.getAttribute('dir') || getComputedStyle(drawer).direction,
      };
    })()`);
    console.log('[ocr-review-live] Arabic review state:', arabicReviewState);

    // Capture Arabic screenshots at 1280px and 480px
    await shot('arabic-review-1280');
    owner.setContentSize(480, 900);
    await pause(800);
    await shot('arabic-review-480');

    owner.setContentSize(1280, 900);
    await pause(800);

    // Test Edit word functionality
    console.log('[ocr-review-live] Testing word edit and persistence');
    await evaluate(`(() => {
      const editBtn = [...document.querySelectorAll('aside[role=dialog] button')].find(b => b.title === 'تعديل' || b.textContent.includes('تعديل') || b.querySelector('.lucide-edit-3'));
      if (editBtn) editBtn.click();
      else throw new Error('Edit button not found in drawer');
    })()`);
    await pause(600);

    const testCorrectedText = 'تصحيح-اختباري';
    await evaluate(`(() => {
      const input = document.querySelector('aside[role=dialog] input[type=text]');
      if (!input) throw new Error('Edit input not found');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(testCorrectedText)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await pause(300);

    // Click Save edit
    await evaluate(`(() => {
      const saveBtn = [...document.querySelectorAll('aside[role=dialog] button')].find(b => b.textContent.includes('حفظ') || b.querySelector('.lucide-check'));
      if (saveBtn) saveBtn.click();
      else throw new Error('Save edit button not found');
    })()`);
    await pause(1200);

    // Verify word updated in OCR text layer
    const wordUpdated = await evaluate(`[...document.querySelectorAll('.ocr-word-node')].some(node => node.textContent.includes(${JSON.stringify(testCorrectedText)}))`);
    assert.ok(wordUpdated, 'Corrected word must appear in the reader OCR text layer');
    console.log('[ocr-review-live] Word updated in live text overlay: verified');

    // Capture screenshot of edited state
    await shot('arabic-edited-persisted-1280');

    // Test Re-OCR / engine switch with stale correction
    console.log('[ocr-review-live] Testing re-OCR and stale correction non-misapplication');
    await evaluate(`(async () => {
      const sources = await window.electronAPI.pdfEditor?.sources?.('ocr-arabic-book') || [];
      const srcKey = sources[0]?.id ? 'ocr.corrections.v1:' + sources[0].id + ':1' : 'ocr.corrections.v1:ocr-arabic-book:1';
      const staleData = {
        '0': { original: 'نص-قديم-غير-مطابق', corrected: 'تصحيح-خاطئ-يجب-عدم-تطبيقه', engine: 'ocrmypdf' }
      };
      await window.electronAPI.settings.set(srcKey, staleData);
      await window.electronAPI.settings.set('ocr.corrections.v1:ocr-arabic-book:1', staleData);
    })()`);
    await pause(800);

    // Re-trigger OCR recognition to verify word 0 is NOT replaced with stale text
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('التعرف على النص') || b.textContent.includes('Recognize Page Text'));
      if (btn) btn.click();
    })()`);
    await until("document.querySelectorAll('.ocr-word-node').length > 0", 250);
    await pause(1200);

    // Verify word 0 does NOT have the stale text
    const firstWordText = await evaluate(`document.querySelector('.ocr-word-node')?.textContent`);
    assert.ok(!firstWordText?.includes('تصحيح-خاطئ'), 'Stale correction must NOT be misapplied to mismatched word');
    console.log('[ocr-review-live] Verified: stale correction was not misapplied to word 0:', firstWordText);

    // Check that stale correction warning is visible in drawer
    const hasStaleWarning = await evaluate(`[...document.querySelectorAll('aside[role=dialog] *')].some(el => el.textContent.includes('التعديل لم يعد يتطابق'))`);
    assert.ok(hasStaleWarning, 'Stale correction warning must be visible in the review drawer');
    console.log('[ocr-review-live] Verified: stale correction notice displayed in review drawer');

    await shot('arabic-stale-correction-detected-1280');

    // ==========================================
    // 3. English LTR Flow
    // ==========================================
    console.log('[ocr-review-live] Reloading in English (LTR)');
    await load('en');

    await evaluate(`document.querySelector('aside button[aria-label=${JSON.stringify(labels.en.library)}]').click()`);
    await until(`[...document.querySelectorAll('button')].some(b=>b.title===${JSON.stringify(labels.en.read)}||b.textContent.trim()===${JSON.stringify(labels.en.read)})`);

    console.log('[ocr-review-live] Opening English book in reader');
    await evaluate(`(() => {
      const read = ${JSON.stringify(labels.en.read)};
      const isRead = b => b.title === read || b.textContent.trim() === read;
      const title = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.includes('New Scientist'));
      let node = title;
      while (node && ![...node.querySelectorAll('button')].some(isRead)) node = node.parentElement;
      if (!node) throw new Error('no read button for english book');
      [...node.querySelectorAll('button')].find(isRead).click();
    })()`);

    await until("!!document.querySelector('canvas.pdf-canvas')", 120);
    await pause(1500);

    // Trigger OCR on English sample
    console.log('[ocr-review-live] Triggering OCR page recognition on English sample');
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Recognize Page Text') || b.textContent.includes('التعرف على النص'));
      if (!btn) throw new Error('OCR recognize button not found on bottom pill for English book');
      btn.click();
    })()`);
    await until("document.querySelectorAll('.ocr-word-node').length > 0", 250);
    const englishWordsCount = await evaluate("document.querySelectorAll('.ocr-word-node').length");
    console.log(`[ocr-review-live] English OCR completed! Words detected: ${englishWordsCount}`);

    // Open OCR Inspector
    await pause(1000);
    await evaluate(`(() => {
      const toggleBtn = [...document.querySelectorAll('button')].find(b => b.title?.includes('Inspector') || b.title?.includes('فاحص') || b.querySelector('.lucide-sliders'));
      if (toggleBtn) toggleBtn.click();
      else throw new Error('Inspector drawer toggle button not found on English pill');
    })()`);
    await until("!!document.querySelector('aside[role=dialog]')", 50);
    await pause(1000);

    // Switch to Review tab
    await evaluate(`(() => {
      const reviewTab = [...document.querySelectorAll('aside[role=dialog] button')].find(b => b.textContent.includes('Review') || b.querySelector('.lucide-check-check'));
      if (reviewTab) reviewTab.click();
      else throw new Error('Review tab button not found in English drawer');
    })()`);
    await pause(1000);

    const englishDir = await evaluate(`getComputedStyle(document.querySelector('aside[role=dialog]')).direction`);
    assert.equal(englishDir, 'ltr', 'English review drawer must be LTR');

    // Capture English screenshots
    await shot('english-review-1280');
    owner.setContentSize(480, 900);
    await pause(800);
    await shot('english-review-480');

    results.arabic = arabicReviewState;
    results.arabicWordsCount = arabicWordsCount;
    results.wordUpdated = wordUpdated;
    results.englishWordsCount = englishWordsCount;
    results.englishDir = englishDir;
    results.passed = true;

    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2));
    if (evidenceDir && evidenceDir !== directory) {
      fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(results, null, 2));
    }

    console.log('[ocr-review-live] All live checks passed successfully!', results);
    app.quit();
  })().catch(async (error) => {
    console.error('[ocr-review-live] Error:', error);
    try {
      consoleLines.push('DOM ' + await evaluate("JSON.stringify({visible:document.visibilityState,drawers:document.querySelectorAll('aside').length,canvases:document.querySelectorAll('canvas').length,words:document.querySelectorAll('.ocr-word-node').length})"));
    } catch {}
    fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n'));
    if (evidenceDir && evidenceDir !== directory) {
      try {
        fs.writeFileSync(path.join(evidenceDir, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n'));
      } catch {}
    }
    owner.webContents.capturePage().then((image) => {
      fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG());
      if (evidenceDir && evidenceDir !== directory) {
        fs.writeFileSync(path.join(evidenceDir, 'failure.png'), image.toPNG());
      }
    }).finally(() => app.exit(1));
  });
});

require('../../dist/main/index.js');
