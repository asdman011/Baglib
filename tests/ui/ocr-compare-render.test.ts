import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider } from '../../src/renderer/components/context/WorkspaceContext';
import { OcrCompare } from '../../src/renderer/components/reader/OcrCompare';

// KEY-259 review: a reference text (such as Shamela's) beside OCR output highlights each difference,
// and neither text is changed.
test('OCR compare highlights changed and extra words against a reference', () => {
  const ocr = 'قال الشيخ رحمه الله في كتابه الكبير';
  const reference = 'قال المصنف رحمه الله في كتابه';
  const html = renderToStaticMarkup(createElement(WorkspaceProvider, null, createElement(OcrCompare, { text: ocr, initialReference: reference })));
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  const kinds = [...document.querySelectorAll('[data-compare]')].map(element => [element.getAttribute('data-compare'), element.textContent]);
  assert.ok(kinds.some(([kind, text]) => kind === 'changed' && text === 'الشيخ'), JSON.stringify(kinds));
  assert.ok(kinds.some(([kind, text]) => kind === 'extra' && text === 'الكبير'), 'the extra OCR word is marked');
  assert.ok(kinds.filter(([kind]) => kind === 'same').length >= 4, 'matching words are not highlighted');
  assert.equal(document.querySelector('[data-ocr-compare] textarea')?.textContent, reference, 'the reference is kept as typed');
  assert.ok(React);
});

test('without a reference nothing is highlighted', () => {
  const html = renderToStaticMarkup(createElement(WorkspaceProvider, null, createElement(OcrCompare, { text: 'نص' })));
  assert.equal(html.includes('data-compare='), false);
});
