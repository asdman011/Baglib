import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstStrongDirection, markdownBlockDirections, markdownLineDirection } from '../../src/shared/text-direction';

// KEY-243: each block of a note that mixes Arabic and Latin gets the direction of its own first strong character.

test('the first strong character decides the direction', () => {
  assert.equal(firstStrongDirection('مرحبا بالعالم'), 'rtl');
  assert.equal(firstStrongDirection('hello world'), 'ltr');
  assert.equal(firstStrongDirection('שלום עולם'), 'rtl', 'Hebrew reads right to left');
  assert.equal(firstStrongDirection('123 456 !?'), null, 'digits and punctuation are neutral');
  assert.equal(firstStrongDirection('٠١٢٣ ٤٥٦'), null, 'Arabic-Indic digits are neutral');
  assert.equal(firstStrongDirection('، ؛ ؟ ٪'), null, 'Arabic punctuation is neutral');
  assert.equal(firstStrongDirection('ًّ ُ'), null, 'tashkeel alone is neutral');
  assert.equal(firstStrongDirection('😀 🎉'), null, 'emoji and symbols are neutral');
  assert.equal(firstStrongDirection(''), null);
});

test('a line that starts with digits reads in the direction of its first letter', () => {
  assert.equal(markdownLineDirection('2 الباب', 'ltr'), 'rtl');
  assert.equal(markdownLineDirection('2024 report', 'rtl'), 'ltr');
  assert.equal(markdownLineDirection('١. الباب الأول', 'ltr'), 'rtl', 'Arabic-Indic ordered marker');
  assert.equal(markdownLineDirection('1. Introduction', 'rtl'), 'ltr');
});

test('headings are read without their marks', () => {
  assert.equal(markdownLineDirection('# Introduction', 'rtl'), 'ltr');
  assert.equal(markdownLineDirection('## مقدمة', 'ltr'), 'rtl');
  assert.equal(markdownLineDirection('### שלום', 'ltr'), 'rtl');
});

test('list bullets and task boxes do not decide the direction', () => {
  assert.equal(markdownLineDirection('- البند الأول', 'ltr'), 'rtl');
  assert.equal(markdownLineDirection('* Introduction', 'rtl'), 'ltr');
  assert.equal(markdownLineDirection('+ نص عربي', 'ltr'), 'rtl');
  assert.equal(markdownLineDirection('- [x] مهمة', 'ltr'), 'rtl');
  assert.equal(markdownLineDirection('> - [ ] task', 'rtl'), 'ltr', 'indented nested markers');
});

test('a blockquote callout reads from its header text', () => {
  assert.equal(markdownLineDirection('> [!note] ملاحظة', 'ltr'), 'rtl');
  assert.equal(markdownLineDirection('> [!ملاحظة] note', 'rtl'), 'ltr');
});

test('a Markdown link ignores its target', () => {
  assert.equal(markdownLineDirection('[الفاتحة](https://x.y)', 'ltr'), 'rtl');
  assert.equal(markdownLineDirection('[Introduction](https://x.y/مرحبا)', 'rtl'), 'ltr');
});

test('a study link reads from its label, or its target when there is no label', () => {
  assert.equal(markdownLineDirection('[[quran:hafs:1:1|الفاتحة]] is the opening', 'ltr'), 'rtl');
  assert.equal(markdownLineDirection('[[quran:hafs:1:1]] is the opening', 'ltr'), 'ltr', 'without a label the target counts');
});

test('inline code is ignored', () => {
  assert.equal(markdownLineDirection('`npm install` ثم اقرأ', 'ltr'), 'rtl');
  assert.equal(markdownLineDirection('Use `const` for that', 'rtl'), 'ltr');
  assert.equal(markdownLineDirection('`مرحبا`', 'ltr'), 'ltr', 'code alone leaves nothing strong');
});

test('URLs and footnote markers are ignored', () => {
  assert.equal(markdownLineDirection('https://example.com/مرحبا then some text', 'rtl'), 'ltr');
  assert.equal(markdownLineDirection('[^1] ملاحظة', 'ltr'), 'rtl');
  assert.equal(markdownLineDirection('[^1]', 'rtl'), 'rtl');
});

test('a table row reads from its cells', () => {
  assert.equal(markdownLineDirection('| 2 | الباب |', 'ltr'), 'rtl');
  assert.equal(markdownLineDirection('| 1 | Introduction |', 'rtl'), 'ltr');
});

test('a neutral line inherits the direction of the previous line of its block', () => {
  assert.deepEqual(markdownBlockDirections('مرحبا بالعالم\n---\n\n# مقدمة', 'ltr'), ['rtl', 'rtl', 'rtl', 'rtl']);
  assert.deepEqual(markdownBlockDirections('hello\n42\nworld', 'rtl'), ['ltr', 'ltr', 'ltr']);
});

test('a neutral first line of a block uses the fallback', () => {
  assert.deepEqual(markdownBlockDirections('12345\nمرحبا', 'ltr'), ['ltr', 'rtl']);
  assert.deepEqual(markdownBlockDirections('12345\nمرحبا', 'rtl'), ['rtl', 'rtl']);
  assert.deepEqual(markdownBlockDirections('42', 'rtl'), ['rtl']);
  assert.deepEqual(markdownBlockDirections('', 'rtl'), ['rtl'], 'empty content is one blank line');
});

test('fenced code is always left to right, fence lines included', () => {
  const backticks = ['# مقدمة', '```ts', 'const greeting = "hello";', 'مرحبا', '```', 'نص عربي'].join('\n');
  assert.deepEqual(markdownBlockDirections(backticks, 'rtl'), ['rtl', 'ltr', 'ltr', 'ltr', 'ltr', 'rtl']);
  const tildes = ['~~~', 'مرحبا', '~~~'].join('\n');
  assert.deepEqual(markdownBlockDirections(tildes, 'rtl'), ['ltr', 'ltr', 'ltr']);
});

test('mixed Arabic and Latin lines keep their own directions, one per line', () => {
  const content = ['# Introduction', '', 'مقدمة', '- first point', '- النقطة الثانية'].join('\n');
  assert.deepEqual(markdownBlockDirections(content, 'ltr'), ['ltr', 'ltr', 'rtl', 'ltr', 'rtl']);
});

test('odd input never throws', () => {
  for (const value of ['\u0000', '\uD800', '> [!note]', '[[', '](', '[^', '`', '|', '~~~~']) {
    assert.ok(['rtl', 'ltr'].includes(markdownLineDirection(value, 'ltr')));
    assert.equal(markdownBlockDirections(value, 'rtl').length, value.split('\n').length);
  }
});
