import path from 'node:path';
import assert from 'node:assert/strict';
import {
  extractPdfPageTexts,
  runAccessibilityCheck,
  clearPdfPageTextCache,
  getPdfPageTextCacheStats,
} from '../../src/main/services/pdf-editor/accessibility';
import {
  readAssistantBookSources,
  AssistantBookError,
  type BookSourceDependencies,
} from '../../src/main/services/assistant-book-sources';

async function main() {
  console.log('=== KEY-289 LIVE VERIFICATION ===\n');

  const tools = {
    python: path.resolve('.baglib-data/pdf-engine/venv/Scripts/python.exe'),
    script: path.resolve('assets/pdf-editor/engine.py'),
    preferStirling: false,
  };

  const en240Pdf = path.resolve('tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf');
  const arPdf = path.resolve('tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf');
  const scannedArPdf = path.resolve('tests/real-files/pdf/ar/scanned-image-only/تفسير الموعذتين لابن تيمية.pdf');

  // 1. 240-page English PDF: Timing comparison & Explain on page 200
  console.log('--- 1. 240-Page Real English PDF (Why lyrics last...) ---');
  clearPdfPageTextCache();
  const tFullStart = Date.now();
  const full = await runAccessibilityCheck(tools, en240Pdf);
  const fullDuration = Date.now() - tFullStart;
  console.log(`[Before KEY-289] Whole-document extraction pass: ${fullDuration} ms (Total pages: ${full.base.totalPages})`);

  clearPdfPageTextCache();
  const tColdStart = Date.now();
  const scoped1 = await extractPdfPageTexts(tools, en240Pdf, [200]);
  const coldDuration = Date.now() - tColdStart;
  console.log(`[After KEY-289] Page-scoped cold extraction: ${coldDuration} ms (Pages: [200])`);

  const tWarmStart = Date.now();
  const scoped2 = await extractPdfPageTexts(tools, en240Pdf, [200]);
  const warmDuration = Date.now() - tWarmStart;
  console.log(`[After KEY-289] Repeat call (in-memory cache hit): ${warmDuration} ms`);

  assert.equal(scoped1.totalPages, 240);
  assert.equal(scoped1.pageTexts['200'], full.base.pageTexts?.['200']);
  assert.equal(scoped2.pageTexts['200'], scoped1.pageTexts['200']);
  console.log(`✓ Text exact match verified: ${scoped1.pageTexts['200'].length} characters.`);
  console.log(`  Preview: "${scoped1.pageTexts['200'].slice(0, 70)}..."\n`);

  // Explain passage integration on page 200
  const depsEn: BookSourceDependencies = {
    resolve: () => ({ title: 'Why lyrics last', sourceId: 'src-en', path: en240Pdf }),
    pdf: (file, pages) => extractPdfPageTexts(tools, file, pages),
    epub: async () => '',
  };
  const sourcesEn = await readAssistantBookSources('book:work-en@src-en#p=200', undefined, depsEn);
  assert.equal(sourcesEn.length, 1);
  assert.equal(sourcesEn[0].target, 'book:work-en@src-en#p=200');
  assert.ok(sourcesEn[0].text.includes('notes to pages 21–36 187'));
  console.log(`✓ readAssistantBookSources on page 200 succeeded. Target: ${sourcesEn[0].target}\n`);

  // 2. Arabic text-layer PDF: Page 2 extraction with fonts lacking /ToUnicode
  console.log('--- 2. Real Arabic Text-Layer PDF (الدفاع عن اراضي المسلمين...) ---');
  clearPdfPageTextCache();
  const depsAr: BookSourceDependencies = {
    resolve: () => ({ title: 'الدفاع عن اراضي المسلمين', sourceId: 'src-ar', path: arPdf }),
    pdf: (file, pages) => extractPdfPageTexts(tools, file, pages),
    epub: async () => '',
  };
  const tArStart = Date.now();
  const sourcesAr = await readAssistantBookSources('book:work-ar@src-ar#p=2', undefined, depsAr);
  const arDuration = Date.now() - tArStart;
  console.log(`Arabic page 2 extracted in: ${arDuration} ms`);
  assert.equal(sourcesAr.length, 1);
  assert.equal(sourcesAr[0].target, 'book:work-ar@src-ar#p=2');
  assert.ok(sourcesAr[0].text.length > 200);
  // Ensure no unmapped PUA characters
  assert.ok(!/[\uE000-\uF8FF\u{F0000}-\u{10FFFD}]/u.test(sourcesAr[0].text));
  console.log(`✓ Arabic text verified: ${sourcesAr[0].text.length} characters, no tofu boxes.`);
  console.log(`  Preview: "${sourcesAr[0].text.slice(0, 60).replace(/\n/g, ' ')}..."\n`);

  // 3. Arabic Scanned PDF: No text layer refusal
  console.log('--- 3. Real Arabic Scanned PDF (تفسير الموعذتين...) ---');
  clearPdfPageTextCache();
  const depsScanned: BookSourceDependencies = {
    resolve: () => ({ title: 'تفسير الموعذتين', sourceId: 'src-scanned', path: scannedArPdf }),
    pdf: (file, pages) => extractPdfPageTexts(tools, file, pages),
    epub: async () => '',
  };
  let errorCaught = false;
  try {
    await readAssistantBookSources('book:work-scanned@src-scanned#p=1', undefined, depsScanned);
  } catch (err) {
    if (err instanceof AssistantBookError && err.message === 'no-text-layer') {
      errorCaught = true;
      console.log(`✓ Scanned page correctly refused with AssistantBookError: 'no-text-layer' (target: ${err.target})`);
    } else {
      throw err;
    }
  }
  assert.ok(errorCaught, 'Expected no-text-layer error on scanned PDF page');

  console.log('\n=== ALL LIVE CHECKS PASSED SUCCESSFULLY ===');
}

main().catch(err => {
  console.error('LIVE RUN FAILED:', err);
  process.exit(1);
});
