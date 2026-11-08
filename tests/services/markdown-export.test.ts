import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportFileNames, exportFolderName, exportNoteBody, exportNotesAsMarkdown, safeFileStem } from '../../src/shared/markdown-export';

const base = { aliases: [], tags: [], createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z' };

test('file names are safe on every system and keep Arabic whole', () => {
  assert.equal(safeFileStem('الصبر: ضياء / نور?', 'x'), 'الصبر ضياء نور');
  assert.equal(safeFileStem('  ...  ', 'First line'), 'First line');
  assert.equal(safeFileStem('CON', 'con'), 'con note');
  assert.equal([...safeFileStem('ب'.repeat(120), 'x')].length, 80);
  assert.equal(safeFileStem('[[x]] #tag ^a', 'y'), 'x tag a');
});

test('repeated titles get numbered names, case-insensitively', () => {
  const names = exportFileNames([
    { id: 'a', title: 'Patience', content: 'x' }, { id: 'b', title: 'patience', content: 'y' }, { id: 'c', title: '', content: '## الشكر\nنص' },
  ]);
  assert.deepEqual([...names.values()], ['Patience', 'patience (2)', 'الشكر']);
});

test('links between exported notes become wikilinks; others keep their BagLib reference', () => {
  const names = new Map([['a', 'الصبر'], ['b', 'Gratitude']]);
  const body = exportNoteBody('See [[note:b|الشكر]] and [[note:b#^p1|فقرة]] ![[note:b|embed]] [[note:gone|Lost]] [[quran:hafs:2:153|البقرة 2:153]] [[book:w1#p=4|رياض (4)]] `[[note:b|code]]`', names);
  assert.equal(body, 'See [[Gratitude|الشكر]] and [[Gratitude#^p1|فقرة]] ![[Gratitude|embed]] Lost [البقرة 2:153](<baglib:quran:hafs:2:153>) [رياض (4)](<baglib:book:w1#p=4>) `[[note:b|code]]`');
});

test('each note becomes a file with front matter, and paragraph anchors stay', () => {
  const files = exportNotesAsMarkdown([
    { ...base, id: 'a', title: 'الصبر "ضياء"', content: 'الصبر ضياء ^p1\n\n[[note:b|Gratitude]]', aliases: ['Sabr'], tags: ['أخلاق حسنة'], workId: 'w1' },
    { ...base, id: 'b', title: 'Gratitude', content: 'Thanks' },
  ], new Map([['w1', 'رياض الصالحين']]));
  assert.equal(files[0].name, 'الصبر ضياء.md');
  assert.equal(files[0].text, [
    '---', 'baglib_id: "a"', 'title: "الصبر \\"ضياء\\""', 'aliases:', '  - "Sabr"', 'tags:', '  - "أخلاق_حسنة"', 'book: "رياض الصالحين"',
    'created: "2026-11-01T10:00:00.000Z"', 'updated: "2026-11-02T10:00:00.000Z"', '---', 'الصبر ضياء ^p1', '', '[[Gratitude|Gratitude]]', '',
  ].join('\n'));
  assert.equal(files[1].text.endsWith('---\nThanks\n'), true);
});

test('the export folder never reuses an existing name', () => {
  const existing = new Set(['BagLib notes 2026-11-05', 'BagLib notes 2026-11-05 (2)']);
  assert.equal(exportFolderName(new Date('2026-11-05T12:00:00Z'), name => existing.has(name)), 'BagLib notes 2026-11-05 (3)');
});
