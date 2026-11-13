import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctrlWheelStep, WHEEL_NOTCH } from '../../src/renderer/hooks/useCtrlWheelZoom';

const wheel = (deltaY: number, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; deltaMode: number }> = {}) => ({ ctrlKey: true, metaKey: false, deltaMode: 0, deltaY, ...extra });

// KEY-339: Ctrl+wheel zooms readers; the plain wheel never does.
test('one mouse-wheel notch with Ctrl is one zoom step; up zooms in, down zooms out', () => {
  assert.equal(ctrlWheelStep(wheel(-100), { value: 0 }), 1);
  assert.equal(ctrlWheelStep(wheel(100), { value: 0 }), -1);
  assert.equal(ctrlWheelStep(wheel(-3, { deltaMode: 1 }), { value: 0 }), 1, 'line-based wheels count as a notch');
  assert.equal(ctrlWheelStep(wheel(-100, { ctrlKey: false, metaKey: true }), { value: 0 }), 1, '⌘ on a Mac keyboard');
});

test('the plain wheel never zooms', () => {
  assert.equal(ctrlWheelStep(wheel(-500, { ctrlKey: false }), { value: 0 }), 0);
});

test('a trackpad pinch (many small deltas) adds up to one step, then starts again', () => {
  const carry = { value: 0 };
  const steps = Array.from({ length: Math.ceil(WHEEL_NOTCH / 8) + 1 }, () => ctrlWheelStep(wheel(-8), carry));
  assert.deepEqual(steps.filter(Boolean), [1]);
  assert.ok(Math.abs(carry.value) < WHEEL_NOTCH);
});
