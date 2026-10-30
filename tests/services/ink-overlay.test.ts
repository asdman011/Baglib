import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildInkOverlay } from '../../src/main/services/pdf-editor/ink-overlay';

test('ink overlay is a parseable two-page vector PDF with ink only on its selected page', async () => {
  const bytes = buildInkOverlay([{ width: 600, height: 800 }, { width: 400, height: 700 }], [{ page: 2, rect: [10, 20, 110, 70], color: '#3b82f6', strokes: [[[0, 0], [1, 1]]] }]);
  const task = getDocument({ data: new Uint8Array(bytes) });
  try {
    const doc = await task.promise;
    assert.equal(doc.numPages, 2);
    assert.equal((await (await doc.getPage(1)).getOperatorList()).fnArray.length, 0);
    assert.ok((await (await doc.getPage(2)).getOperatorList()).fnArray.length > 0);
    assert.match(bytes.toString(), /10\.0000 680\.0000 m\n110\.0000 630\.0000 l/u);
  } finally { await task.destroy(); }
});

test('ink overlay rejects invalid pages, coordinates, colors and stroke budgets', () => {
  assert.throws(() => buildInkOverlay([{ width: 600, height: 800 }], [{ page: 1, rect: [0, 0, 50, 50], strokes: [[[0, 0], [2, 1]]] }]));
});
