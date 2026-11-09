import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  extractPdfPageTexts,
  runAccessibilityCheck,
  clearPdfPageTextCache,
  getPdfPageTextCacheStats,
  invalidatePdfPageCache,
} from '../../src/main/services/pdf-editor/accessibility';
import {
  readAssistantBookSources,
  AssistantBookError,
  type BookSourceDependencies,
} from '../../src/main/services/assistant-book-sources';
import type { PdfEngineTools } from '../../src/main/services/pdf-editor/python';

const tools: PdfEngineTools = {
  python: path.resolve('.baglib-data/pdf-engine/venv/Scripts/python.exe'),
  script: path.resolve('assets/pdf-editor/engine.py'),
  preferStirling: false,
};

const en240Pdf = path.resolve('tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf');
const arPdf = path.resolve('tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf');
const scannedArPdf = path.resolve('tests/real-files/pdf/ar/scanned-image-only/تفسير الموعذتين لابن تيمية.pdf');

test('page-scoped extraction gives the same text as the full pass for page 200 of 240-page PDF', async () => {
  clearPdfPageTextCache();
  assert.ok(fs.existsSync(en240Pdf), `Missing test file: ${en240Pdf}`);

  const scoped = await extractPdfPageTexts(tools, en240Pdf, [200]);
  assert.equal(scoped.totalPages, 240);
  assert.ok(scoped.pageTexts['200'], 'Page 200 text should be extracted');
  assert.ok(scoped.pageTexts['200'].length > 500);
  assert.equal(scoped.pageTexts['200'].slice(0, 24), 'notes to pages 21–36 187');

  // Compare with full accessibility pass
  const full = await runAccessibilityCheck(tools, en240Pdf);
  assert.equal(full.base.totalPages, 240);
  assert.equal(scoped.pageTexts['200'], full.base.pageTexts?.['200']);
  assert.equal(scoped.pageHasUnmapped['200'], full.base.pageHasUnmapped?.['200']);
});

test('page-scoped repeat call uses in-memory cache and is near-instant', async () => {
  clearPdfPageTextCache();
  const t0 = Date.now();
  const first = await extractPdfPageTexts(tools, en240Pdf, [200]);
  const firstDuration = Date.now() - t0;

  const t1 = Date.now();
  const second = await extractPdfPageTexts(tools, en240Pdf, [200]);
  const repeatDuration = Date.now() - t1;

  assert.equal(first.pageTexts['200'], second.pageTexts['200']);
  assert.ok(repeatDuration <= 20, `Repeat call should be near-instant, took ${repeatDuration}ms`);
  assert.ok(repeatDuration < firstDuration, 'Repeat call must be faster than first call');
  assert.equal(getPdfPageTextCacheStats().size, 1);
});

test('cache is invalidated when the file changes', async () => {
  clearPdfPageTextCache();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-cache-test-'));
  const tempPdf = path.join(tempDir, 'sample.pdf');

  try {
    // Copy real PDF to temp
    fs.copyFileSync(en240Pdf, tempPdf);

    const res1 = await extractPdfPageTexts(tools, tempPdf, [200]);
    assert.equal(getPdfPageTextCacheStats().size, 1);
    const initialHash = res1.sha256;

    // Mutate file content (append trailing bytes)
    fs.appendFileSync(tempPdf, Buffer.from('\n% BagLib cache invalidation test %'));
    // Ensure mtime change is visible
    const newTime = new Date(Date.now() + 2000);
    fs.utimesSync(tempPdf, newTime, newTime);

    // Call extract again - must detect new SHA-256 and invalidate old cache
    const res2 = await extractPdfPageTexts(tools, tempPdf, [200], { forceHash: true });
    assert.notEqual(res2.sha256, initialHash);

    // Explicit invalidation helper test
    invalidatePdfPageCache(res2.sha256);
    assert.equal(getPdfPageTextCacheStats().size, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('no-text-layer still fires on the scanned page in readAssistantBookSources', async () => {
  clearPdfPageTextCache();
  assert.ok(fs.existsSync(scannedArPdf), `Missing test file: ${scannedArPdf}`);

  const deps: BookSourceDependencies = {
    resolve: (work, source) => work === 'work-scanned' && source === 'source-scanned'
      ? { title: 'تفسير الموعذتين', sourceId: 'source-scanned', path: scannedArPdf }
      : null,
    pdf: (file, pages) => extractPdfPageTexts(tools, file, pages),
    epub: async () => '',
  };

  await assert.rejects(
    readAssistantBookSources('book:work-scanned@source-scanned#p=1', undefined, deps),
    (err: unknown) => {
      assert.ok(err instanceof AssistantBookError);
      assert.equal((err as AssistantBookError).message, 'no-text-layer');
      assert.equal((err as AssistantBookError).target, 'book:work-scanned@source-scanned#p=1');
      return true;
    }
  );
});

test('Explain on page 200 of 240-page real PDF via readAssistantBookSources returns accurate text', async () => {
  clearPdfPageTextCache();
  const deps: BookSourceDependencies = {
    resolve: (work, source) => work === 'w-shakespeare' && source === 's-en240'
      ? { title: 'Why lyrics last', sourceId: 's-en240', path: en240Pdf }
      : null,
    pdf: (file, pages) => extractPdfPageTexts(tools, file, pages),
    epub: async () => '',
  };

  const sources = await readAssistantBookSources('book:w-shakespeare@s-en240#p=200', undefined, deps);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].target, 'book:w-shakespeare@s-en240#p=200');
  assert.equal(sources[0].label, 'Why lyrics last (200)');
  assert.ok(sources[0].text.includes('notes to pages 21–36 187'));
  assert.ok(sources[0].text.includes('Berlyne 1971'));
});

test('Explain on page 2 of Arabic text PDF extracts readable body text without boxes', async () => {
  clearPdfPageTextCache();
  const deps: BookSourceDependencies = {
    resolve: (work, source) => work === 'w-azzam' && source === 's-ar'
      ? { title: 'الدفاع عن اراضي المسلمين', sourceId: 's-ar', path: arPdf }
      : null,
    pdf: (file, pages) => extractPdfPageTexts(tools, file, pages),
    epub: async () => '',
  };

  const sources = await readAssistantBookSources('book:w-azzam@s-ar#p=2', undefined, deps);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].target, 'book:w-azzam@s-ar#p=2');
  assert.ok(sources[0].text.length > 200);
  assert.ok(sources[0].text.includes('الدفاع') || sources[0].text.includes('المسلمين'));
  // Ensure no unmapped PUA characters
  assert.ok(!/[\uE000-\uF8FF\u{F0000}-\u{10FFFD}]/u.test(sources[0].text));
});
