import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForReaderIdle } from '../../src/shared/reader-idle';

test('reader idle work waits until scrolling settles and releases listeners', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const target = new EventTarget();
  let settled = false;
  const pending = waitForReaderIdle(target, new AbortController().signal).then(() => { settled = true; });
  context.mock.timers.tick(140);
  target.dispatchEvent(new Event('scroll'));
  context.mock.timers.tick(140);
  await Promise.resolve();
  assert.equal(settled, false);
  context.mock.timers.tick(10);
  await pending;
  assert.equal(settled, true);
});

test('reader idle work rejects on cancellation, including already aborted requests', async () => {
  const target = new EventTarget(), controller = new AbortController();
  const pending = waitForReaderIdle(target, controller.signal);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  await assert.rejects(waitForReaderIdle(target, controller.signal), /cancelled/);
});
