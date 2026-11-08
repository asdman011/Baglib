import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuitCleanup } from '../../src/main/services/quit-cleanup';

test('quit cleanup remains inert until confirmed and awaits asynchronous disposal once', async () => {
  const cleanup = new QuitCleanup();
  let calls = 0;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  cleanup.register(async () => { calls++; await waiting; });
  await Promise.resolve();
  assert.equal(calls, 0);
  const done = cleanup.run();
  assert.equal(done, cleanup.run());
  let finished = false;
  void done.then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(finished, false);
  release(); await done;
  assert.equal(finished, true);
  await cleanup.run();
  assert.equal(calls, 1);
});

test('quit cleanup isolates failure, honors removal and drains nested registrations', async () => {
  const cleanup = new QuitCleanup();
  const ran: string[] = [];
  const remove = cleanup.register(() => { ran.push('removed'); });
  remove();
  cleanup.register(() => { throw new Error('fixture failure'); });
  cleanup.register(() => { ran.push('first'); cleanup.register(() => { ran.push('nested'); }); });
  await cleanup.run();
  assert.deepEqual(ran, ['first', 'nested']);
});
