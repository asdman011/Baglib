import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUESTION_KINDS, kindKey } from '../../src/shared/practice';
import { translations } from '../../src/renderer/translations';

test('review screen shows the question kind through translations, never the raw kind id', () => {
  const src = readFileSync('src/renderer/components/knowledge/SrsReviewScreen.tsx', 'utf8');
  assert.ok(src.includes("t(kindKey(card.questionKind ?? 'recall'))"));
  assert.ok(!/\{card\.questionKind \?\? 'recall'\}/u.test(src), 'raw question kind must not be rendered');
});

test('every question kind has an Arabic and an English label', () => {
  for (const kind of QUESTION_KINDS) {
    const key = kindKey(kind);
    assert.ok(translations.ar[key], `ar label for ${kind}`);
    assert.ok(translations.en[key], `en label for ${kind}`);
    assert.notEqual(translations.ar[key], kind);
  }
  assert.equal(translations.ar[kindKey('recall')], 'استدعاء');
});
