import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PDF_TOOL_SECTIONS,
  PDF_TOOL_CATALOGUE,
  getPdfToolCatalogue,
  getPdfToolSections,
  getToolsBySection,
  searchPdfTools,
  getOcrStatusChipInfo,
  type PdfToolSectionId,
} from '../../src/renderer/components/reader/pdf-tool-catalogue';
import { translations, type TranslationKey } from '../../src/renderer/translations';

const EXPECTED_SECTIONS: PdfToolSectionId[] = [
  'annotate',
  'organize',
  'convert',
  'optimize',
  'ocr',
  'security',
  'saved-actions',
];

test('PDF tool catalogue: all 7 required sections exist with icons and descriptions', () => {
  const sections = getPdfToolSections();
  assert.equal(sections.length, 7, 'Must have exactly 7 sections');

  for (const expectedId of EXPECTED_SECTIONS) {
    const section = sections.find((s) => s.id === expectedId);
    assert.ok(section, `Section ${expectedId} must exist`);
    assert.ok(section.iconName && section.iconName.length > 0, `Section ${expectedId} must have an icon`);
    assert.ok(translations.ar[section.nameKey], `Section ${expectedId} must have Arabic name`);
    assert.ok(translations.en[section.nameKey], `Section ${expectedId} must have English name`);
    assert.ok(translations.ar[section.descriptionKey], `Section ${expectedId} must have Arabic desc`);
    assert.ok(translations.en[section.descriptionKey], `Section ${expectedId} must have English desc`);
  }
});

test('PDF tool catalogue: every tool has an icon, name, description, section, and result hint', () => {
  const tools = getPdfToolCatalogue();
  assert.ok(tools.length >= 24, 'Catalogue must cover all supported PDF tools');

  const validHints = new Set(['save', 'new-file', 'new-files', 'inspect', 'ocr', 'workflow']);

  for (const tool of tools) {
    assert.ok(tool.id, 'Tool must have an id');
    assert.ok(
      EXPECTED_SECTIONS.includes(tool.section),
      `Tool ${tool.id} section "${tool.section}" must be one of the 7 sections`
    );
    assert.ok(tool.iconName && tool.iconName.length > 0, `Tool ${tool.id} must have an icon`);
    assert.ok(validHints.has(tool.resultHint), `Tool ${tool.id} must have a valid result hint`);

    // Verify Arabic translations
    assert.ok(translations.ar[tool.nameKey], `Tool ${tool.id} must have Arabic name (${tool.nameKey})`);
    assert.ok(
      translations.ar[tool.descriptionKey],
      `Tool ${tool.id} must have Arabic description (${tool.descriptionKey})`
    );

    // Verify English translations
    assert.ok(translations.en[tool.nameKey], `Tool ${tool.id} must have English name (${tool.nameKey})`);
    assert.ok(
      translations.en[tool.descriptionKey],
      `Tool ${tool.id} must have English description (${tool.descriptionKey})`
    );
  }
});

test('PDF tool catalogue: getToolsBySection partitions tools correctly', () => {
  for (const sectionId of EXPECTED_SECTIONS) {
    const tools = getToolsBySection(sectionId);
    assert.ok(tools.length > 0, `Section ${sectionId} must contain at least one tool`);
    for (const tool of tools) {
      assert.equal(tool.section, sectionId);
    }
  }
});

test('PDF tool catalogue: search filters by name, description, and section in both languages', () => {
  const tEn = (key: TranslationKey) => translations.en[key] ?? String(key);
  const tAr = (key: TranslationKey) => translations.ar[key] ?? String(key);

  // Empty query returns all tools
  assert.equal(searchPdfTools('', tEn).length, PDF_TOOL_CATALOGUE.length);
  assert.equal(searchPdfTools('   ', tAr).length, PDF_TOOL_CATALOGUE.length);

  // Search in English
  const ocrResultsEn = searchPdfTools('OCR', tEn);
  assert.ok(ocrResultsEn.length > 0);
  assert.ok(ocrResultsEn.some((t) => t.id === 'ocr'));

  const waterResultsEn = searchPdfTools('watermark', tEn);
  assert.ok(waterResultsEn.some((t) => t.id === 'watermark'));

  // Search in Arabic
  const ocrResultsAr = searchPdfTools('ضوئي', tAr);
  assert.ok(ocrResultsAr.length > 0);
  assert.ok(ocrResultsAr.some((t) => t.id === 'ocr'));

  const encryptResultsAr = searchPdfTools('تشفير', tAr);
  assert.ok(encryptResultsAr.some((t) => t.id === 'encrypt'));
});

test('OCR status chip: correctly produces states for no-text-layer, text-layer, running, and done', () => {
  const tEn = (key: TranslationKey, params?: Record<string, string | number>) => {
    let str = translations.en[key] ?? String(key);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(`{${k}}`, String(v));
      }
    }
    return str;
  };
  const tAr = (key: TranslationKey, params?: Record<string, string | number>) => {
    let str = translations.ar[key] ?? String(key);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(`{${k}}`, String(v));
      }
    }
    return str;
  };

  // State 1: No text layer (scanned Arabic PDF)
  const noTextEn = getOcrStatusChipInfo('no-text-layer', null, tEn);
  assert.equal(noTextEn.state, 'no-text-layer');
  assert.equal(noTextEn.label, 'No text layer');
  assert.ok(noTextEn.tooltip.includes('scanned image-only'));

  const noTextAr = getOcrStatusChipInfo('no-text-layer', null, tAr);
  assert.equal(noTextAr.state, 'no-text-layer');
  assert.equal(noTextAr.label, 'بدون طبقة نص');
  assert.ok(noTextAr.tooltip.includes('صور ممسوحة'));

  // State 2: Text layer (English or Arabic digital PDF)
  const textLayerEn = getOcrStatusChipInfo('text-layer', null, tEn);
  assert.equal(textLayerEn.state, 'text-layer');
  assert.equal(textLayerEn.label, 'Text layer');

  const textLayerAr = getOcrStatusChipInfo('text-layer', null, tAr);
  assert.equal(textLayerAr.state, 'text-layer');
  assert.equal(textLayerAr.label, 'طبقة نص');

  // State 3: Running OCR
  const runningEn = getOcrStatusChipInfo('running', null, tEn);
  assert.equal(runningEn.state, 'running');
  assert.equal(runningEn.label, 'Running OCR…');

  const runningAr = getOcrStatusChipInfo('running', null, tAr);
  assert.equal(runningAr.state, 'running');
  assert.equal(runningAr.label, 'جارٍ التعرف الضوئي…');

  // State 4: OCR Done with confidence summary
  const doneEn = getOcrStatusChipInfo('done', { confidence: 94.2, wordCount: 320 }, tEn);
  assert.equal(doneEn.state, 'done');
  assert.equal(doneEn.label, 'OCR: 94%');
  assert.equal(doneEn.confidence, 94);
  assert.equal(doneEn.wordCount, 320);
  assert.ok(doneEn.tooltip.includes('320 words'));

  const doneAr = getOcrStatusChipInfo('done', { confidence: 94, wordCount: 320 }, tAr);
  assert.equal(doneAr.state, 'done');
  assert.equal(doneAr.label, 'OCR: 94٪');
  assert.equal(doneAr.confidence, 94);
});


test('PDF tool search normalizes Arabic diacritics without merging taa marbuta and haa', () => {
  const tAr = (key: TranslationKey) => translations.ar[key];
  assert.deepEqual(searchPdfTools('تَشْفِير', tAr), searchPdfTools('تشفير', tAr));
  assert.equal(searchPdfTools('zz-no-such-tool', tAr).length, 0);
  assert.equal(new Set(PDF_TOOL_CATALOGUE.map(tool => tool.id)).size, PDF_TOOL_CATALOGUE.length);
  assert.ok(PDF_TOOL_CATALOGUE.some(tool => tool.id === 'review'));
});

test('OCR chip reports document progress, checking and missing confidence honestly', () => {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => {
    let text: string = translations.en[key];
    for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, String(value));
    return text;
  };
  assert.equal(getOcrStatusChipInfo('checking', null, t).label, 'Checking text layer…');
  assert.equal(getOcrStatusChipInfo('running', { current: 3, total: 20 }, t).label, 'OCR 3 / 20');
  assert.equal(getOcrStatusChipInfo('done', { wordCount: 5 }, t).confidence, undefined);
  assert.match(getOcrStatusChipInfo('done', null, t).label, /unavailable/);
});
