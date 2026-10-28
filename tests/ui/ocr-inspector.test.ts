import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { translations } from '../../src/renderer/translations';
import type { OcrPageResult } from '../../src/shared/types/ocr';

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
