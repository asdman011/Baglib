import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';

test('detail summary preserves every edition and source and counts all active notes/cards', () => {
  const db = createTestDatabase();
  const repository = new SqliteWorkRepository(db);
  try {
    const book = repository.addBook({ id: 'detail-work', title: 'كِتاب Knowledge', author: 'المؤلف Author', bookType: 'hybrid', filePath: 'D:/book.pdf', edition: 'الأولى', categories: [], tags: [], lendingHistory: [] });
    db.prepare('INSERT INTO edition (id,work_id,label,publisher) VALUES (?,?,?,?)').run('second', book.id, 'Second', 'Publisher');
    db.prepare('INSERT INTO source (id,edition_id,source_type,status) VALUES (?,?,?,?)').run('epub', 'second', 'linked_file', 'active');
    db.prepare('INSERT INTO file_source_detail (source_id,file_path,file_format) VALUES (?,?,?)').run('epub', 'D:/book.epub', 'EPUB');
    const firstEdition = repository.getDetailSummary(book.id)!.editions[0].id;
    db.prepare('INSERT INTO source (id,edition_id,source_type,status) VALUES (?,?,?,?)').run('physical', firstEdition, 'physical', 'active');
    for (let index = 0; index < 61; index++) db.prepare('INSERT INTO knowledge (id,work_id,knowledge_type,deleted_at) VALUES (?,?,?,?)').run('card-' + index, book.id, 'card', index === 60 ? '2026-01-01' : null);
    for (const type of ['note', 'study_note', 'reading_reflection', 'highlight']) db.prepare('INSERT INTO knowledge (id,work_id,knowledge_type) VALUES (?,?,?)').run(type, book.id, type);
    const summary = repository.getDetailSummary(book.id)!;
    assert.equal(summary.editions.length, 2);
    assert.equal(summary.editions[0].sources.length, 2);
    assert.deepEqual(summary.editions[0].sources.map(source => source.type).sort(), ['hybrid', 'physical']);
    assert.equal(summary.editions[1].sources[0].format, 'EPUB');
    assert.equal(summary.cards, 60, 'Counts beyond the card-list page size');
    assert.equal(summary.notes, 3);
    assert.equal(repository.getById(book.id)?.title, 'كِتاب Knowledge');
    assert.equal(repository.getDetailSummary('missing'), null);
    repository.softDeleteBook(book.id);
    assert.equal(repository.getDetailSummary(book.id), null);
  } finally { db.close(); }
});
