import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importDocxXml, importNotesCsv, importPlainMarkdown, parseCsv, safeFolderName } from '../../src/shared/note-import';
import { exportNotesAsCsv } from '../../src/shared/note-open-formats';

const ids = () => { let n = 0; return () => `id-${++n}`; };

// KEY-345: import notes from Markdown/Obsidian, Word and CSV; export as folders with safe names.
test('Obsidian notes: title, tags and wikilinks between imported files', () => {
  const notes = importPlainMarkdown([
    { path: 'vault/الإيمان.md', text: '---\ntags: [faith, عقيدة]\naliases:\n  - iman\n---\n# أركان الإيمان\nانظر [[الإحسان]] و[[Missing]]. #study' },
    { path: 'vault/الإحسان.md', text: 'أن تعبد الله كأنك تراه' },
  ], ids());
  assert.equal(notes.length, 2);
  assert.equal(notes[0].title, 'أركان الإيمان');
  assert.deepEqual(notes[0].tags, ['faith', 'عقيدة', 'study']);
  assert.deepEqual(notes[0].aliases, ['iman']);
  assert.ok(notes[0].content.includes('[[note:id-2|الإحسان]]'), 'link to the other imported note');
  assert.ok(notes[0].content.includes('[[Missing]]'), 'unknown links stay as written');
  assert.equal(notes[1].title, 'الإحسان', 'the file name names a note without a heading');
});

test('BagLib CSV round-trips into new notes', () => {
  const csv = exportNotesAsCsv([{ id: 'x', title: 'عنوان, مع "فاصلة"', content: 'سطر أول\nسطر ثانٍ', aliases: [], tags: ['tag one'], createdAt: '2026-01-01', updatedAt: '2026-01-02' }]);
  const notes = importNotesCsv(csv, ids());
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'عنوان, مع "فاصلة"');
  assert.equal(notes[0].content, 'سطر أول\nسطر ثانٍ');
  assert.deepEqual(notes[0].tags, ['tag one']);
  assert.notEqual(notes[0].id, 'x', 'an imported row is a new note');
  assert.deepEqual(parseCsv('a,"b ""c""",d\r\n1,2,3'), [['a', 'b "c"', 'd'], ['1', '2', '3']]);
});

test('a Word document splits at its headings; without headings it is one note', () => {
  const p = (text: string, style = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const notes = importDocxXml(`<w:body>${p('الفصل الأول', 'Heading1')}${p('نص &amp; شرح')}${p('Second', 'Heading2')}${p('more')}</w:body>`, 'ملف', ids());
  assert.deepEqual(notes.map(note => [note.title, note.content]), [['الفصل الأول', 'نص & شرح'], ['Second', 'more']]);
  assert.deepEqual(importDocxXml(`<w:body>${p('a')}${p('b')}</w:body>`, 'ملف', ids()).map(note => [note.title, note.content]), [['ملف', 'a\n\nb']]);
});

test('export folder names are safe and keep Arabic', () => {
  assert.equal(safeFolderName('2. البقرة (Al-Baqarah)'), '2. البقرة (Al-Baqarah)');
  assert.equal(safeFolderName('a/b:c*?'), 'a b c');
  assert.equal(safeFolderName('CON'), '_');
  assert.equal(safeFolderName('..'), '_');
});
