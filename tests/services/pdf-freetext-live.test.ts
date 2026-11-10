import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { assertSavedAppearances } = require('../../scripts/save-live/appearance-assertions.cjs');
const before = { foreign: ['foreign-digest'], fonts: 8, owned: [] };
const saved = { foreign: before.foreign, fonts: 12, owned: ['a', 'b', 'c'].map(id => ({ id, subtype: '/FreeText', appearance: true })) };
test('live save assertions require three unique FreeText appearances and unchanged foreign annotations', () => {
  assertSavedAppearances(before, saved, saved);
  for (const broken of [
    { ...saved, owned: saved.owned.slice(1) },
    { ...saved, owned: [saved.owned[0], saved.owned[0], saved.owned[2]] },
    { ...saved, owned: saved.owned.map(a => ({ ...a, appearance: false })) },
    { ...saved, owned: saved.owned.map(a => ({ ...a, subtype: '/Text' })) },
    { ...saved, foreign: ['changed'] },
  ]) assert.throws(() => assertSavedAppearances(before, broken, saved));
});
test('repeat live save keeps annotation identities and total font objects stable', () => {
  assert.throws(() => assertSavedAppearances(before, saved, { ...saved, fonts: 14 }));
  assert.throws(() => assertSavedAppearances(before, saved, { ...saved, owned: saved.owned.map(a => ({ ...a, id: a.id + '-copy' })) }));
});
