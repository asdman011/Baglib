import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWarshLayout, type SharedLayoutPage, type WarshLayoutWord } from '../../src/main/services/quran/warsh-layout';

const template: SharedLayoutPage[] = [
  { pageNumber: 1, words: [{ id: 'hafs-1', surah: 1, ayah: 1, wordIndex: 1, line: 7, textHafs: 'بسم' }, { id: 'hafs-2', surah: 1, ayah: 1, wordIndex: 2, line: 7, textHafs: 'الله' }] },
  { pageNumber: 2, words: [{ id: 'hafs-3', surah: 2, ayah: 1, wordIndex: 1, line: 3, textHafs: 'الم' }] },
  { pageNumber: 3, words: [{ id: 'hafs-4', surah: 2, ayah: 2, wordIndex: 1, line: 1, textHafs: 'ذلك' }] },
];
const words: WarshLayoutWord[] = [
  { id: 1, surah: 1, ayah: 1, word: 1, text: 'اِ۬لْحَمْدُ' },
  { id: 2, surah: 1, ayah: 1, word: 2, text: 'لِلهِ' },
  { id: 3, surah: 2, ayah: 1, word: 1, text: 'الم' },
  { id: 4, surah: 2, ayah: 1, word: 2, text: 'ذَٰلِكَ' },
  { id: 5, surah: 2, ayah: 2, word: 1, text: 'اَ۬لْكِتَٰبُ' },
];

test('shared SVG template reflows the supplied Warsh words without copying Hafs text or numbering', () => {
  const original = JSON.stringify({ template, words });
  const result = buildWarshLayout(template, words);
  assert.equal(result.pages.size, 3);
  const rendered = [...result.pages.values()].flatMap(page => page.words.filter(word => word.type !== 'aya-mark'));
  assert.deepEqual(rendered.map(word => [word.surah, word.ayah, word.wordIndex, word.canonicalText]), words.map(word => [word.surah, word.ayah, word.word, word.text]));
  for (const page of result.pages.values()) {
    assert.equal(page.profile, 'warsh');
    assert.equal(page.layoutMode, 'adapted');
    assert.equal(page.svg, '');
    assert.equal(page.glyphLines?.length, 15);
    assert.ok(page.words.every(word => word.textHafs === undefined));
  }
  assert.equal(result.references.get('2:1'), 2);
  assert.equal(result.references.get('2:2'), 3);
  assert.equal(result.references.has('1:2'), false);
  assert.equal(JSON.stringify({ template, words }), original);
});

test('Warsh adaptation rejects incomplete templates, invalid coordinates and duplicate canonical locations', () => {
  assert.throws(() => buildWarshLayout([], words));
  assert.throws(() => buildWarshLayout(template.slice(0, 1), words));
  assert.throws(() => buildWarshLayout(template, [...words, words[0]]));
  assert.throws(() => buildWarshLayout([{ pageNumber: 1, words: [{ ...template[0].words[0], line: 16 }] }], words.slice(0, 2)));
  assert.throws(() => buildWarshLayout([template[0], template[0]], words.slice(0, 2)));
});
