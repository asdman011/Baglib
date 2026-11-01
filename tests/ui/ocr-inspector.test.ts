import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import { OCR_ENGINE_ORDER, ocrEngineBlocker, ocrEngineInfo, ocrEngineName, ocrFallbackMessage } from '../../src/renderer/components/reader/ocr-status';
import type { OcrEngineInfo, OcrPageResult } from '../../src/shared/types/ocr';

describe('PaddleOCR-VL-1.6 Visual Layout & Inspector UI Tests', () => {
  it('contains centralized localization keys in Arabic and English for all OCR elements', () => {
    const requiredKeys = [
      'ocrEngineBadge',
      'ocrEngineLocalCpu',
      'ocrToggleBoxes',
      'ocrHideBoxes',
      'ocrOpenInspector',
      'ocrInspectorTitle',
      'ocrInspectorSubtitle',
      'ocrTabMarkdown',
      'ocrTabText',
      'ocrTabTables',
      'ocrTabBboxes',
      'ocrCopyMarkdown',
      'ocrCopyText',
      'ocrCopied',
      'ocrMetricWords',
      'ocrMetricLines',
      'ocrMetricDuration',
      'ocrMetricDimensions',
      'ocrNoResultYet',
      'ocrConfidence',
      'ocrFilterWords',
      'ocrRawMarkdown',
      'ocrFormattedPreview',
      'ocrCopyTable',
      'ocrTableCopied',
      'ocrSelectedWord',
      'ocrClickWordHint',
      'ocrStatusRecognized',
      'ocrStatusUnrecognized',
      'ocrCollapsePill',
      'ocrExpandPill',
      'ocrRescanPageBtn',
      'ocrDownloadModelBtn',
      'ocrDownloadingModel',
      'ocrModelReady',
      'ocrModelFilesCount',
      'ocrEngineWindowsBadge',
      'ocrEngineNotReady',
      'ocrRuntimeMissing',
      'ocrModelMissing',
      'ocrEngineFailed',
      'ocrEmptyResult',
      'ocrCpuSlowHint',
    ] as const;

    for (const key of requiredKeys) {
      assert.ok(translations.ar[key], `Missing Arabic translation for: ${key}`);
      assert.ok(translations.en[key], `Missing English translation for: ${key}`);
      assert.ok(translations.ar[key].length > 0);
      assert.ok(translations.en[key].length > 0);
    }

    assert.ok(translations.ar.ocrEngineBadge.includes('PaddleOCR-VL-1.6'));
    assert.ok(translations.en.ocrEngineBadge.includes('PaddleOCR-VL-1.6'));
    assert.ok(translations.ar.ocrEngineLocalCpu.includes('AVX2'));
    assert.ok(translations.en.ocrEngineLocalCpu.includes('AVX2'));
  });

  it('names what blocks the engine instead of showing it as ready', () => {
    const ready: OcrEngineInfo = {
      id: 'paddleocr_vl',
      name: 'PaddleOCR-VL-1.6',
      version: '1.6.0',
      parameters: '0.9B',
      device: 'CPU',
      modelPath: '',
      isDownloaded: true,
      runtimeReady: true,
      missingPackages: [],
      supportedLanguages: [],
    };
    assert.equal(ocrEngineBlocker(null), null);
    assert.equal(ocrEngineBlocker(ready), null);
    assert.equal(ocrEngineBlocker({ ...ready, isDownloaded: false }), 'model-missing');
    assert.equal(ocrEngineBlocker({ ...ready, runtimeReady: false }), 'runtime-missing');

    for (const lang of ['ar', 'en'] as const) {
      const t = (key: TranslationKey, params?: Record<string, string | number>) =>
        translations[lang][key].replace('{packages}', String(params?.packages)).replace('{engine}', String(params?.engine));
      const message = ocrFallbackMessage(t, 'runtime-missing', ['torch', 'transformers'], 'paddleocr_vl');
      assert.ok(message.includes('torch, transformers'));
      assert.ok(message.includes('PaddleOCR-VL'));
      assert.ok(!message.includes('{'));

      // A failure names the engine the reader chose, and the OS engine that stood in for it
      const failed = ocrFallbackMessage(t, 'engine-failed', [], 'ocrmypdf');
      assert.ok(failed.includes('OCRmyPDF'));
      assert.ok(failed.includes(translations[lang].ocrEngineWindowsBadge));

      const noLanguage = ocrFallbackMessage(t, 'model-missing', ['ara'], 'ocrmypdf');
      assert.ok(noLanguage.includes('ara'));
      assert.notEqual(noLanguage, ocrFallbackMessage(t, 'model-missing', ['ara'], 'paddleocr_vl'));
    }
  });

  it('shows the engine that actually ran', () => {
    const t = (key: TranslationKey) => translations.en[key];
    assert.equal(ocrEngineName(t, 'ocrmypdf'), 'OCRmyPDF');
    assert.equal(ocrEngineName(t, 'paddleocr_vl'), 'PaddleOCR-VL');
    assert.equal(ocrEngineName(t, 'windows_media_ocr'), translations.en.ocrEngineWindowsBadge);
  });

  it('offers OCRmyPDF first and finds each engine by id', () => {
    assert.deepEqual(OCR_ENGINE_ORDER, ['ocrmypdf', 'paddleocr_vl']);
    const info = { id: 'ocrmypdf' } as OcrEngineInfo;
    assert.equal(ocrEngineInfo([info], 'ocrmypdf'), info);
    assert.equal(ocrEngineInfo([info], 'paddleocr_vl'), null);
  });

  it('localizes the engine choice in both languages', () => {
    for (const key of ['ocrEngineLabel', 'ocrEngineUnavailableOption', 'ocrRanWithEngine', 'ocrEngineOcrmypdfHint', 'ocrEnginePaddleHint', 'ocrEngineBadgeOcrmypdf', 'ocrEngineOcrmypdfLocal', 'ocrLanguageDataMissing'] as const) {
      assert.ok(translations.ar[key].length > 0, `Missing Arabic translation for: ${key}`);
      assert.ok(translations.en[key].length > 0, `Missing English translation for: ${key}`);
      assert.notEqual(translations.ar[key], translations.en[key]);
    }
  });

  it('structures OcrPageResult correctly for side-by-side inspection', () => {
    const samplePageResult: OcrPageResult = {
      pageNumber: 1,
      text: 'المكتبة التراثية والعلوم الإسلامية',
      markdown: '# المكتبة التراثية والعلوم الإسلامية\n\nنص تجريبي للتعرف الضوئي.',
      lines: [
        {
          text: 'المكتبة التراثية والعلوم الإسلامية',
          words: [
            { text: 'المكتبة', bbox: { x: 50, y: 80, width: 60, height: 24 }, confidence: 0.99 },
            { text: 'التراثية', bbox: { x: 120, y: 80, width: 70, height: 24 }, confidence: 0.98 },
            { text: 'والعلوم', bbox: { x: 200, y: 80, width: 65, height: 24 }, confidence: 0.97 },
            { text: 'الإسلامية', bbox: { x: 275, y: 80, width: 80, height: 24 }, confidence: 0.99 },
          ],
          bbox: { x: 50, y: 80, width: 305, height: 24 },
        },
      ],
      words: [
        { text: 'المكتبة', bbox: { x: 50, y: 80, width: 60, height: 24 }, confidence: 0.99 },
        { text: 'التراثية', bbox: { x: 120, y: 80, width: 70, height: 24 }, confidence: 0.98 },
        { text: 'والعلوم', bbox: { x: 200, y: 80, width: 65, height: 24 }, confidence: 0.97 },
        { text: 'الإسلامية', bbox: { x: 275, y: 80, width: 80, height: 24 }, confidence: 0.99 },
      ],
      width: 600,
      height: 800,
      engine: 'paddleocr_vl',
      durationMs: 1420,
      tables: [
        {
          headers: ['الفصل', 'الصفحة'],
          rows: [
            ['المقدمة', '1'],
            ['الفهرس', '5'],
          ],
        },
      ],
    };

    assert.equal(samplePageResult.engine, 'paddleocr_vl');
    assert.equal(samplePageResult.words.length, 4);
    assert.equal(samplePageResult.tables?.length, 1);
    assert.equal(samplePageResult.tables?.[0].headers.length, 2);
    assert.equal(samplePageResult.tables?.[0].rows.length, 2);
    assert.ok(samplePageResult.markdown?.startsWith('#'));

    // Test markdown table generation
    const table = samplePageResult.tables![0];
    const headerLine = `| ${table.headers.join(' | ')} |`;
    const sepLine = `| ${table.headers.map(() => '---').join(' | ')} |`;
    const rowsLines = table.rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
    const mdTable = `${headerLine}\n${sepLine}\n${rowsLines}`;
    assert.ok(mdTable.includes('| الفصل | الصفحة |'));
    assert.ok(mdTable.includes('| المقدمة | 1 |'));

    // Test word filter query logic
    const filterQuery = 'علوم';
    const matches = samplePageResult.words.filter(w => w.text.includes(filterQuery));
    assert.equal(matches.length, 1);
    assert.equal(matches[0].text, 'والعلوم');
  });
});
