import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeNormalizedRects,
  parseHighlightLocation,
  HIGHLIGHT_COLOR_HEX,
  type NormalizedRect,
} from '../../src/renderer/components/reader/PdfNativeViewer';
import fs from 'node:fs';
import path from 'node:path';

test('Native PDF Viewer & Highlighting Engine Tests', async (t) => {
  await t.test('mergeNormalizedRects Algorithm', async (t2) => {
    await t2.test('returns unchanged if empty or single rect', () => {
      assert.deepEqual(mergeNormalizedRects([]), []);
      const single: NormalizedRect[] = [{ x: 10, y: 20, width: 30, height: 5 }];
      assert.deepEqual(mergeNormalizedRects(single), single);
    });

    await t2.test('merges adjacent rects on the same line', () => {
      const adjacent: NormalizedRect[] = [
        { x: 10, y: 20, width: 25, height: 5 },
        { x: 35, y: 20.2, width: 30, height: 5.1 },
      ];
      const merged = mergeNormalizedRects(adjacent);
      assert.equal(merged.length, 1);
      assert.equal(merged[0].x, 10);
      assert.equal(merged[0].width, 55);
    });

    await t2.test('does not merge rects on different lines', () => {
      const differentLines: NormalizedRect[] = [
        { x: 10, y: 20, width: 40, height: 5 },
        { x: 10, y: 35, width: 50, height: 5 },
      ];
      const merged = mergeNormalizedRects(differentLines);
      assert.equal(merged.length, 2);
      assert.equal(merged[0].y, 20);
      assert.equal(merged[1].y, 35);
    });

    await t2.test('does not merge rects with significant horizontal gap on same line', () => {
      const gapRects: NormalizedRect[] = [
        { x: 10, y: 20, width: 15, height: 5 },
        { x: 40, y: 20, width: 20, height: 5 },
      ];
      const merged = mergeNormalizedRects(gapRects);
      assert.equal(merged.length, 2);
    });
  });

  await t.test('parseHighlightLocation JSON / Fallback Parser', async (t2) => {
    await t2.test('parses full JSON location payload with normalized rects', () => {
      const jsonPayload = JSON.stringify({
        page: 7,
        rects: [
          { x: 12.5, y: 34.0, width: 45.2, height: 3.5 },
          { x: 10.0, y: 38.0, width: 60.0, height: 3.5 },
        ],
        text: 'Sample highlighted phrase',
        color: 'emerald',
      });

      const parsed = parseHighlightLocation(jsonPayload);
      assert.equal(parsed.page, 7);
      assert.equal(parsed.rects.length, 2);
      assert.equal(parsed.rects[0].x, 12.5);
      assert.equal(parsed.rects[1].width, 60.0);
    });

    await t2.test('gracefully parses legacy plain page number strings', () => {
      const parsedNumber = parseHighlightLocation('14');
      assert.equal(parsedNumber.page, 14);
      assert.deepEqual(parsedNumber.rects, []);

      const parsedEmpty = parseHighlightLocation('');
      assert.equal(parsedEmpty.page, 1);
      assert.deepEqual(parsedEmpty.rects, []);
    });

    await t2.test('safely handles corrupted JSON without crashing', () => {
      const parsedCorrupt = parseHighlightLocation('{page: 12, rects: broken');
      assert.equal(parsedCorrupt.page, 1);
      assert.deepEqual(parsedCorrupt.rects, []);
    });
  });

  await t.test('Semantic Highlight Colors Palette', async (t2) => {
    await t2.test('maps all 5 core colors to proper hex values', () => {
      assert.equal(HIGHLIGHT_COLOR_HEX.amber, '#FACC15');
      assert.equal(HIGHLIGHT_COLOR_HEX.yellow, '#FACC15');
      assert.equal(HIGHLIGHT_COLOR_HEX.emerald, '#4ADE80');
      assert.equal(HIGHLIGHT_COLOR_HEX.green, '#4ADE80');
      assert.equal(HIGHLIGHT_COLOR_HEX.rose, '#F87171');
      assert.equal(HIGHLIGHT_COLOR_HEX.red, '#F87171');
      assert.equal(HIGHLIGHT_COLOR_HEX.sky, '#60A5FA');
      assert.equal(HIGHLIGHT_COLOR_HEX.blue, '#60A5FA');
      assert.equal(HIGHLIGHT_COLOR_HEX.violet, '#C084FC');
      assert.equal(HIGHLIGHT_COLOR_HEX.purple, '#C084FC');
    });
  });

  await t.test('Architectural Verification: Zero Iframe PDF Guarantee', async (t2) => {
    await t2.test('confirms no iframe is used for PDF rendering in FullPageBookReader', () => {
      const fullPageReaderCode = fs.readFileSync(
        path.join(__dirname, '../../src/renderer/components/reader/FullPageBookReader.tsx'),
        'utf8'
      );
      assert.doesNotMatch(
        fullPageReaderCode,
        /<iframe[^>]*pdfBlobUrl/i,
        'FullPageBookReader must not render an iframe for PDF files'
      );
      assert.match(
        fullPageReaderCode,
        /<PdfNativeViewer/i,
        'FullPageBookReader must render PdfNativeViewer'
      );
    });

    await t2.test('confirms no iframe is used for PDF rendering in ReaderPane', () => {
      const readerPaneCode = fs.readFileSync(
        path.join(__dirname, '../../src/renderer/components/reader/ReaderPane.tsx'),
        'utf8'
      );
      assert.doesNotMatch(
        readerPaneCode,
        /<iframe[^>]*pdfBlobUrl/i,
        'ReaderPane must not render an iframe for PDF files'
      );
      assert.match(
        readerPaneCode,
        /<PdfNativeViewer/i,
        'ReaderPane must render PdfNativeViewer'
      );
    });
  });

  await t.test('PDF Strict LTR Isolation & Arabic (RTL) Layout Immunity', async (t2) => {
    const globalsCss = fs.readFileSync(
      path.join(__dirname, '../../src/renderer/app/globals.css'),
      'utf8'
    );
    const pdfNativeViewerCode = fs.readFileSync(
      path.join(__dirname, '../../src/renderer/components/reader/PdfNativeViewer.tsx'),
      'utf8'
    );
    const fullPageReaderCode = fs.readFileSync(
      path.join(__dirname, '../../src/renderer/components/reader/FullPageBookReader.tsx'),
      'utf8'
    );
    const readerPaneCode = fs.readFileSync(
      path.join(__dirname, '../../src/renderer/components/reader/ReaderPane.tsx'),
      'utf8'
    );

    await t2.test('enforces strict LTR direction and unicode-bidi rules in globals.css', () => {
      assert.match(
        globalsCss,
        /\.pdf-page-container,\s*\.canvasWrapper,\s*\.textLayer\s*\{[^}]*direction:\s*ltr\s*!important/s,
        'globals.css must enforce direction: ltr !important on .pdf-page-container, .canvasWrapper, and .textLayer'
      );
      assert.match(
        globalsCss,
        /\.pdf-page-container,\s*\.canvasWrapper,\s*\.textLayer\s*\{[^}]*unicode-bidi:\s*normal\s*!important/s,
        'globals.css must enforce unicode-bidi: normal !important on .pdf-page-container, .canvasWrapper, and .textLayer'
      );
      assert.match(
        globalsCss,
        /\.textLayer\s*\{[^}]*position:\s*absolute\s*!important/s,
        '.textLayer must be absolute positioned'
      );
      assert.match(
        globalsCss,
        /\.textLayer\s*\{[^}]*overflow:\s*hidden\s*!important/s,
        '.textLayer must have overflow: hidden !important'
      );
      assert.match(
        globalsCss,
        /\.textLayer\s+span\s*\{[^}]*position:\s*absolute/s,
        '.textLayer span must be positioned absolutely'
      );
      assert.match(
        globalsCss,
        /\.textLayer\s+span\s*\{[^}]*transform-origin:\s*0%\s*0%/s,
        '.textLayer span must have transform-origin at 0% 0%'
      );
    });

    await t2.test('guarantees explicit LTR attributes on PDF page container and viewport', () => {
      assert.match(
        pdfNativeViewerCode,
        /className="pdf-page-container[^"]*"\s+style=\{\{[^}]*direction:\s*'ltr'/s,
        'PdfPageItem container must declare direction: ltr'
      );
      assert.match(
        pdfNativeViewerCode,
        /className="pdf-page-container[^"]*"\s+style=\{\{[^}]*display:\s*'block'/s,
        'PdfPageItem container must use display: block to prevent flex coordinate disruption'
      );
      assert.match(
        pdfNativeViewerCode,
        /viewMode === 'single'[\s\S]*?dir="ltr"/s,
        'Single page mode viewport must enforce dir="ltr"'
      );
      assert.match(
        pdfNativeViewerCode,
        /viewMode === 'scrolled'[\s\S]*?dir="ltr"/s,
        'Scrolled continuous mode viewport must enforce dir="ltr"'
      );
    });

    await t2.test('guarantees outer reader workspace wraps PDF viewer with strict LTR isolation', () => {
      assert.match(
        fullPageReaderCode,
        /pdf-viewer-workspace[\s\S]*?dir="ltr"[\s\S]*?direction:\s*'ltr'[\s\S]*?unicodeBidi:\s*'isolate'/s,
        'FullPageBookReader must wrap PdfNativeViewer in an isolated LTR container'
      );
      assert.match(
        readerPaneCode,
        /pdf-viewer-workspace[\s\S]*?dir="ltr"[\s\S]*?direction:\s*'ltr'[\s\S]*?unicodeBidi:\s*'isolate'/s,
        'ReaderPane must wrap PdfNativeViewer in an isolated LTR container'
      );
    });
  });

  await t.test('Selection Blue Side Strip / Margin Artifact Suppression', async (t2) => {
    const pdfNativeViewerCode = fs.readFileSync(
      path.join(__dirname, '../../src/renderer/components/reader/PdfNativeViewer.tsx'),
      'utf8'
    );

    await t2.test('mergeNormalizedRects discards sub-pixel micro rects and artifacts', () => {
      const noisyRects: NormalizedRect[] = [
        { x: 0, y: 15, width: 0.2, height: 12 }, // Margin line-break artifact (0.2% width)
        { x: 0, y: 30, width: 0.4, height: 15 }, // Micro boundary leak
        { x: 12, y: 40, width: 35, height: 4 }, // Legitimate text selection
      ];
      const cleaned = mergeNormalizedRects(noisyRects);
      assert.equal(cleaned.length, 1);
      assert.equal(cleaned[0].x, 12);
      assert.equal(cleaned[0].width, 35);
    });

    await t2.test('parseHighlightLocation filters out sub-threshold micro rects', () => {
      const payload = JSON.stringify({
        page: 2,
        rects: [
          { x: 0, y: 20, width: 0.1, height: 8 },
          { x: 25, y: 20, width: 40, height: 8 },
        ],
      });
      const parsed = parseHighlightLocation(payload);
      assert.equal(parsed.rects.length, 1);
      assert.equal(parsed.rects[0].x, 25);
    });

    await t2.test('PdfNativeViewer filters clientRects smaller than 3px and outside page bounds', () => {
      assert.match(
        pdfNativeViewerCode,
        /r\.width\s*<\s*3\s*\|\|\s*r\.height\s*<\s*3/,
        'Must filter out client rects with width < 3 or height < 3'
      );
      assert.match(
        pdfNativeViewerCode,
        /r\.left\s*<=\s*pageRect\.left|r\.right\s*<=\s*pageRect\.left\s*\+\s*2/,
        'Must filter out client rects touching or outside left/right margins'
      );
    });

    await t2.test('activeSelectionRects overlay filters rects < 0.5% width/height', () => {
      assert.match(
        pdfNativeViewerCode,
        /activeSelectionRects[\s\S]*?filter\(\(r\)\s*=>\s*r\.width\s*>=\s*0\.5\s*&&\s*r\.height\s*>=\s*0\.5/,
        'activeSelectionRects overlay must suppress sub-0.5% rects'
      );
    });
  });
});
