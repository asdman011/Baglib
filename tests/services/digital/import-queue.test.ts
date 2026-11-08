import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImportQueue } from '../../../src/main/services/digital/import-queue';
import { QuitCleanup } from '../../../src/main/services/quit-cleanup';
import { createTestDatabase } from '../../helpers/test-db';

test('confirmed shutdown finishes accepted import writes before disposing and closing SQLite', async () => {
  const db = createTestDatabase();
  const events: string[] = [];
  const cleanup = new QuitCleanup();
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const queue = new ImportQueue(() => { events.push('disposed'); });
  cleanup.register(() => { events.push('shared services disposed'); });
  cleanup.registerDrain(() => queue.close());
  try {
    const first = queue.enqueue(async () => { await wait; db.prepare("INSERT INTO work(id,work_type_id,title) VALUES('first','wt-book','عِلْم English')").run(); events.push('first'); });
    const second = queue.enqueue(async () => { db.prepare("INSERT INTO work(id,work_type_id,title) VALUES('second','wt-book','Second')").run(); events.push('second'); return 2; });
    const closing = cleanup.run();
    await Promise.resolve();
    await assert.rejects(queue.enqueue(async () => { events.push('late'); }), /busy/u);
    assert.deepEqual(events, []);
    release();
    await first;
    assert.equal(await second, 2);
    await closing;
    assert.equal((db.prepare('SELECT title FROM work WHERE id=?').get('first') as { title: string }).title, 'عِلْم English');
    assert.deepEqual(events, ['first', 'second', 'disposed', 'shared services disposed']);
    await queue.close();
    assert.equal(events.length, 4);
  } finally { db.close(); }
});

test('failed imports do not block later accepted work or disposal', async () => {
  let disposed = 0;
  const queue = new ImportQueue(() => { disposed++; });
  const failed = queue.enqueue(async () => { throw new Error('invalid fixture'); });
  const successful = queue.enqueue(async () => 42);
  const closing = queue.close();
  assert.equal(queue.close(), closing);
  await assert.rejects(failed, /invalid fixture/u);
  assert.equal(await successful, 42);
  await closing;
  assert.equal(disposed, 1);
  await assert.rejects(queue.enqueue(async () => 1), /busy/u);
});
