import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';

// KEY-44 item 4: a bulk "assign shelf" sets the shelf of each selected book's physical copy.
describe('Bulk shelf assignment (KEY-44)', () => {
  const setup = () => {
    const db = createTestDatabase();
    const repo = new SqliteWorkRepository(db);
    const physical = ['المقدمة', 'Why lyrics last'].map(title => repo.addBook({ title, author: 'مؤلف', language: 'ar', bookType: 'physical', shelf: 'old', room: 'المكتبة' }).id);
    const digital = repo.addBook({ title: 'كتاب رقمي', author: 'مؤلف', language: 'ar', bookType: 'digital' }).id;
    const other = repo.addBook({ title: 'غير محدد', author: 'مؤلف', language: 'ar', bookType: 'physical', shelf: 'keep' }).id;
    return { db, repo, physical, digital, other };
  };

  it('sets the shelf on the physical copies, skips digital-only books and leaves other books alone', () => {
    const { repo, physical, digital, other } = setup();
    const result = repo.bulkUpdateShelf([...physical, digital], 'رف ٣ — Shelf 3');
    assert.deepEqual(result, { updated: 2, skipped: 1 });
    for (const id of physical) assert.equal(repo.getById(id)?.shelf, 'رف ٣ — Shelf 3');
    assert.equal(repo.getById(physical[0])?.room, 'المكتبة', 'other physical fields are kept');
    assert.equal(repo.getById(other)?.shelf, 'keep');
  });

  it('an empty shelf name clears the shelf', () => {
    const { repo, physical } = setup();
    repo.bulkUpdateShelf([physical[0]], '   ');
    assert.ok(!repo.getById(physical[0])?.shelf);
  });

  it('is all-or-nothing when a write fails part-way', () => {
    const { db, repo, physical } = setup();
    const second = (db.prepare('SELECT s.id FROM source s JOIN edition e ON e.id=s.edition_id WHERE e.work_id=?').get(physical[1]) as { id: string }).id;
    db.exec(`CREATE TRIGGER fail_shelf BEFORE UPDATE OF shelf ON physical_source_detail WHEN NEW.source_id = '${second}' BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
    assert.throws(() => repo.bulkUpdateShelf(physical, 'new'), /forced failure/);
    for (const id of physical) assert.equal(repo.getById(id)?.shelf, 'old');
  });
});
