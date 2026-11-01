import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownHasText, textToHtml, textToMarkdown } from '../../src/main/services/pdf-editor/text-export';

test('Markdown made only of image placeholders counts as having no text', () => {
  assert.equal(markdownHasText('<image redacted: 450x698px, 449x698pt, ~72dpi, PNG, DEVICE_RGB, 32bpp>\n\n<image redacted: 435x698px>\n'), false);
  assert.equal(markdownHasText('<image redacted: 450x698px>\n\n# فصل\n'), true);
});

test('reflowed HTML keeps paragraphs, escapes markup and follows the language direction', () => {
  const html = textToHtml('بحث <مهم>\n\nسطر ثان\fPage two', 'ar');
  assert.match(html, /<html lang="ar" dir="rtl">/u);
  assert.match(html, /<p dir="auto">بحث &lt;مهم&gt;<\/p><p dir="auto">سطر ثان<\/p>/u);
  assert.equal(html.match(/<section>/gu)?.length, 2);
  assert.match(textToHtml('Text', 'en'), /<html lang="en" dir="ltr">/u);
});

test('reflowed Markdown separates pages and normalizes Windows line endings', () => {
  assert.equal(textToMarkdown('One\r\n\r\nTwo\f\fThree'), 'One\n\nTwo\n\n---\n\nThree\n');
});
