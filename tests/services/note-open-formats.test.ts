import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportNotesAsMarkdown, type ExportNote } from '../../src/shared/markdown-export';
import { exportNotesAsCsv, exportNotesAsLatex, importNotesFromMarkdown, latexText } from '../../src/shared/note-open-formats';
import { StudyNotesService } from '../../src/main/services/study-notes';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { SqliteKnowledgeRepository } from '../../src/main/database/repositories/knowledge.repository';
import { createTestDatabase } from '../helpers/test-db';

const notes: ExportNote[] = [
  { id: 'a', title: 'بَغْلِب — Notes', content: '# عِلْمٌ\n[[supports::note:b#^p1|تأمل]] ![[note:outside|Outside]]\n[[quran:hafs:2:255|آية]]\n`[[note:b|code]]`\n  \n', aliases: ['علم', 'Knowledge'], tags: ['أخلاق حسنة', 'test'], createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z' },
  { id: 'b', title: 'English', content: 'Quoted "text", comma\nParagraph ^p1\n[[note:a|العودة]]', aliases: [], tags: [], createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z' },
];

test('Markdown export/import preserves exact Arabic, whitespace, canonical references and tags', () => {
  assert.deepEqual(importNotesFromMarkdown(exportNotesAsMarkdown(notes)), notes);
  assert.deepEqual(importNotesFromMarkdown(exportNotesAsMarkdown([notes[0]])), [notes[0]], 'filtered exports retain excluded references');
});

test('edited readable bodies and legacy exports resolve folder links, anchors, embeds and relations', () => {
  const files = exportNotesAsMarkdown(notes).map(file => ({ ...file, text: file.text.replace(/^baglib_roundtrip:.*\n/mu, '') }));
  files[0].text = files[0].text.replace('# عِلْمٌ', '# عِلْمٌ edited');
  const imported = importNotesFromMarkdown(files);
  assert.match(imported[0].content, /# عِلْمٌ edited/u);
  assert.ok(imported[0].content.includes('[[supports::note:b#^p1|تأمل]]'));
  assert.ok(imported[0].content.includes('[[quran:hafs:2:255|آية]]'));
  assert.ok(imported[1].content.includes('[[note:a|العودة]]'));
});

test('CSV quotes cells and preserves exact Unicode, quotes and newlines', () => {
  const csv = exportNotesAsCsv(notes);
  assert.ok(csv.startsWith('\uFEFF"baglib_id","title"'));
  assert.ok(csv.includes('"Quoted ""text"", comma\nParagraph ^p1\n[[note:a|العودة]]"'));
  assert.ok(csv.includes('بَغْلِب — Notes'));
  assert.ok(csv.includes('أخلاق حسنة'));
});

test('LaTeX escapes syntax before wrapping Arabic runs, preserving tashkeel and digits', () => {
  assert.equal(latexText('Cafe\u0301 بَغْلِب'), 'Cafe\u0301 \\textarabic{بَغْلِب}');
  assert.equal(latexText('Hello بَغْلِب ١٢ & 5% {x} \\end'), 'Hello \\textarabic{بَغْلِب ١٢} \\& 5\\% \\{x\\} \\textbackslash{}end');
  const latex = exportNotesAsLatex(notes);
  assert.ok(latex.includes('\\usepackage{polyglossia}'));
  assert.ok(latex.includes('\\newfontfamily\\arabicfont[Script=Arabic]{Amiri}'));
  assert.ok(latex.includes('\\textarabic{عِلْمٌ}'));
});

test('database import updates by id, creates once, preserves dates and is idempotent', () => {
  const db = createTestDatabase();
  try {
    const service = new StudyNotesService(new SqliteSettingsRepository(db), db);
    const files = exportNotesAsMarkdown(notes);
    assert.deepEqual(service.importMarkdown(files), { count: 2 });
    assert.equal(service.list().length, 2);
    const revisions = service.list().map(note => [note.id, note.revision]);
    service.importMarkdown(files);
    assert.deepEqual(service.list().map(note => [note.id, note.revision]), revisions);
    for (const note of service.list()) {
      const expected = notes.find(item => item.id === note.id)!;
      assert.equal(note.content, expected.content);
      assert.equal(note.createdAt, expected.createdAt);
      assert.equal(note.updatedAt, expected.updatedAt);
      assert.deepEqual([...note.tags].sort(), [...expected.tags].sort());
    }
    service.importMarkdown(exportNotesAsMarkdown([{ ...notes[0], content: 'Updated تأمل' }]));
    assert.equal(service.list('a')[0].content, 'Updated تأمل');
    assert.equal(service.list().length, 2);
  } finally { db.close(); }
});

test('conflicting ids and malformed files fail atomically without converting other knowledge', () => {
  const db = createTestDatabase();
  try {
    const service = new StudyNotesService(new SqliteSettingsRepository(db), db);
    new SqliteKnowledgeRepository(db).saveKnowledge({ id: 'b', knowledgeType: 'bookmark', workId: null, label: 'Keep' });
    assert.throws(() => service.importMarkdown(exportNotesAsMarkdown(notes)), /import-id-conflict/u);
    assert.equal(service.list().length, 0);
    const repeated = exportNotesAsMarkdown([notes[0], { ...notes[0], content: 'different' }]);
    assert.throws(() => importNotesFromMarkdown(repeated), /duplicate-markdown-id/u);
    assert.throws(() => service.importMarkdown([{ name: 'x.md', text: '---\nbaglib_id: "../x"\n---\ntext' }]), /invalid-markdown/u);
    assert.equal(service.list().length, 0);
  } finally { db.close(); }
});

test('existing reader notes and reflection context survive Markdown update', () => {
  const db = createTestDatabase();
  try {
    const repository = new SqliteKnowledgeRepository(db);
    repository.saveKnowledge({ id: 'a', knowledgeType: 'note', workId: null, location: '5', noteContent: 'Before' });
    repository.saveKnowledge({ id: 'b', knowledgeType: 'reading_reflection', workId: null, noteContent: 'Review', entryDate: '2026-11-01', mood: 'calm', lessons: 'Keep lessons' });
    const service = new StudyNotesService(new SqliteSettingsRepository(db), db);
    service.importMarkdown(exportNotesAsMarkdown(notes));
    const reader = repository.getAllKnowledge().find(note => note.id === 'a')!;
    assert.equal(reader.knowledgeType, 'note');
    assert.equal(reader.location, '5');
    assert.equal(reader.noteContent, notes[0].content);
    assert.deepEqual(db.prepare('SELECT entry_date,mood,lessons FROM reading_reflection_detail WHERE knowledge_id=?').get('b'), { entry_date: '2026-11-01', mood: 'calm', lessons: 'Keep lessons' });
  } finally { db.close(); }
});
