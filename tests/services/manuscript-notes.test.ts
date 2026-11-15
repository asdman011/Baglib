import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initialManuscriptSnapshot, insertBlockIntoManuscriptSnapshot } from '../../src/shared/manuscript-snapshot';
import { embeddedNoteIds, groupBacklinks, noteEmbedProps, noteIdFromTarget, noteTarget } from '../../src/shared/manuscript-notes';
import type { ResearchSourceProps } from '../../src/shared/research-editor-sources';
import { ManuscriptRepository } from '../../src/main/database/repositories/manuscript.repository';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';

test('note targets round-trip and drop anchors', () => {
  assert.equal(noteTarget('n1'), 'note:n1');
  assert.equal(noteIdFromTarget('note:n1'), 'n1');
  assert.equal(noteIdFromTarget('note:n1#heading'), 'n1');
  assert.equal(noteIdFromTarget('quran:hafs:2:255'), null);
});

test('noteEmbedProps keeps only the reference and a title, never a copy of the note', () => {
  const props = noteEmbedProps({ id: 'n1', title: '', content: '# فوائد لغوية\n\nنص الملاحظة' });
  assert.deepEqual(props, { url: 'note:n1', noteId: 'n1', title: 'فوائد لغوية' });
  assert.equal(noteEmbedProps({ id: 'n2', title: 'Rhetoric notes', content: 'x' }).title, 'Rhetoric notes');
});

test('groupBacklinks groups by manuscript and chapter; embeddedNoteIds is unique and note-only', () => {
  const row = (m: string, d: string, b: string, scheme: 'note' | 'quran', id: string) => ({ manuscript_id: m, manuscript_title: m.toUpperCase(), document_id: d, document_title: d.toUpperCase(), block_id: b, target_scheme: scheme, target_id: id });
  const rows = [row('m1', 'd1', 'b1', 'note', 'n1'), row('m1', 'd1', 'b2', 'note', 'n1'), row('m1', 'd2', 'b3', 'note', 'n1#h'), row('m2', 'd3', 'b4', 'note', 'n2'), row('m2', 'd3', 'b5', 'quran', 'hafs:1:1')];
  const grouped = groupBacklinks(rows.slice(0, 3));
  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0].chapters.map(c => [c.documentId, c.blockIds]), [['d1', ['b1', 'b2']], ['d2', ['b3']]]);
  assert.deepEqual(embeddedNoteIds(rows), ['n1', 'n2']);
});

test('repository backlinks and links read manuscript_link and skip trashed chapters', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  runMigrations(db, migrations);
  try {
    const repo = new ManuscriptRepository(db);
    const ms = repo.create('بحث في البلاغة', 'research');
    const one = repo.createDocument(ms.id, 'الفصل الأول');
    const two = repo.createDocument(ms.id, 'الفصل الثاني');
    const embed = (id: string, noteId: string) => {
      const props = noteEmbedProps({ id: noteId, title: 'فوائد' }) as unknown as ResearchSourceProps;
      const { snapshot } = insertBlockIntoManuscriptSnapshot(initialManuscriptSnapshot(id, 'x'), 'note-embed' as never, props);
      repo.save({ id, snapshot });
    };
    embed(one.id, 'n1');
    embed(two.id, 'n1');
    assert.equal(repo.backlinks('note:n1').length, 2);
    assert.deepEqual(embeddedNoteIds(repo.links(ms.id)), ['n1']);
    repo.trashDocument(two.id);
    assert.deepEqual(repo.backlinks('note:n1').map(r => r.document_id), [one.id]);
    assert.equal(repo.backlinks('note:other').length, 0);
    assert.throws(() => repo.backlinks('javascript:alert(1)'), /invalid-request/);
  } finally {
    db.close();
  }
});
