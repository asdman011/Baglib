import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';

// KEY-44 acceptance: a bulk edit is all-or-nothing. If one row fails, no row changes.
describe('Bulk edits roll back on failure (KEY-44)', () => {
  const setup = () => {
    const db = createTestDatabase();
    const repo = new SqliteWorkRepository(db);
    const ids = ['المقدمة', 'Why lyrics last', 'تاريخ الرسل والملوك'].map(title => repo.addBook({ title, author: 'مؤلف Author', language: 'ar', readingStatus: 'unread', readingProgress: 0 }).id);
    return { db, repo, ids };
  };
  const statusOf = (repo: SqliteWorkRepository, ids: string[]) => ids.map(id => [repo.getById(id)?.readingStatus, repo.getById(id)?.readingProgress]);

  it('a reading-status bulk edit that fails part-way leaves every book unchanged', () => {
    const { db, repo, ids } = setup();
    const before = statusOf(repo, ids);
    // Make the third update fail inside the transaction.
    db.exec(`CREATE TRIGGER fail_third BEFORE UPDATE OF reading_status ON work WHEN NEW.id = '${ids[2]}' BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
    assert.throws(() => repo.bulkUpdateReadingStatus(ids, 'completed', 100), /forced failure/);
    assert.deepEqual(statusOf(repo, ids), before);
  });

  it('a tag bulk edit that fails part-way adds no tag to any book', () => {
    const { db, repo, ids } = setup();
    db.exec(`CREATE TRIGGER fail_tag BEFORE INSERT ON work_tag WHEN NEW.work_id = '${ids[1]}' BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
    assert.throws(() => repo.bulkAddTags(ids, ['تراث']), /forced failure/);
    const tagged = db.prepare('SELECT COUNT(*) AS n FROM work_tag').get() as { n: number };
    assert.equal(tagged.n, 0);
  });

  it('a successful bulk edit updates every selected book and nothing else', () => {
    const { repo, ids } = setup();
    const other = repo.addBook({ title: 'كتاب آخر', author: 'مؤلف', language: 'ar', readingStatus: 'unread', readingProgress: 0 }).id;
    assert.equal(repo.bulkUpdateReadingStatus(ids, 'completed', 100), 3);
    assert.deepEqual(statusOf(repo, ids), ids.map(() => ['completed', 100]));
    assert.deepEqual(statusOf(repo, [other]), [['unread', 0]]);
  });
});
