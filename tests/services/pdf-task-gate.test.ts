import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PdfTaskGate } from '../../src/main/services/pdf-editor/task-gate';

test('PDF task admission starts explicitly and shutdown waits for admitted work', async () => {
  const gate = new PdfTaskGate();
  let accesses = 0;
  await assert.rejects(gate.run(() => { accesses++; }), /busy/u);
  assert.equal(accesses, 0);
  gate.open();
  let finish!: () => void;
  const task = gate.run(async () => { accesses++; await new Promise<void>(resolve => { finish = resolve; }); accesses++; return 'saved'; });
  await Promise.resolve();
  let closed = false;
  const closing = gate.close().then(() => { closed = true; });
  await assert.rejects(gate.run(() => { accesses++; }), /busy/u);
  assert.equal(closed, false);
  finish();
  assert.equal(await task, 'saved');
  await closing;
  assert.equal(accesses, 2);
  await assert.rejects(gate.run(() => { accesses++; }), /busy/u);
  assert.equal(accesses, 2);
  assert.throws(() => gate.open(), /busy/u);
});

test('admitted queued work survives immediate close and rejected tasks do not block shutdown', async () => {
  const gate = new PdfTaskGate();
  gate.open();
  const successful = gate.run(() => 'complete');
  const failed = gate.run(() => { throw new Error('fixture failure'); });
  const rejected = assert.rejects(failed, /fixture failure/u);
  const first = gate.close();
  assert.equal(gate.close(), first);
  assert.equal(await successful, 'complete');
  await rejected;
  await first;
});

test('shutdown before startup prevents late admission', async () => {
  const gate = new PdfTaskGate();
  await gate.close();
  assert.throws(() => gate.open(), /busy/u);
});
