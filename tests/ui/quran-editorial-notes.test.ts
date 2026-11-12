import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuranRichText, withEditorialNotes } from '../../src/renderer/components/quran/QuranRichText';

// Tafsir editorial notes ([[...]]) show as small muted notes; the surrounding text is kept exactly.
test('editorial notes become small notes without brackets', () => {
  const html = renderToStaticMarkup(React.createElement(QuranRichText, { nodes: [{ tag: 'text', text: 'وَبِهَا تُفْتَحُ [[في أ: "يفتتح".]] الْقِرَاءَةُ' }] as never }));
  assert.ok(!html.includes('[['), 'no raw brackets');
  assert.match(html, /<small data-tafsir-note="true"[^>]*>في أ: &quot;يفتتح&quot;.<\/small>/u);
  assert.ok(html.startsWith('وَبِهَا تُفْتَحُ '), 'text before the note is unchanged');
  assert.ok(html.endsWith(' الْقِرَاءَةُ'), 'text after the note is unchanged');
});

test('text without notes is returned as it is, and several notes are all marked', () => {
  assert.equal(withEditorialNotes('بِسْمِ اللَّهِ'), 'بِسْمِ اللَّهِ');
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, withEditorialNotes('أ [[١]] ب [[٢]] ج')));
  assert.equal((html.match(/data-tafsir-note/gu) || []).length, 2);
  assert.ok(html.startsWith('أ ') && html.endsWith(' ج'));
});
