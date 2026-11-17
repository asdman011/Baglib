import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLiveHarnessRun, offscreenPosition } from '../../src/main/live-harness-window';

test('live harness runs are detected from a scripts/<name>/main.cjs entry; real app runs are not', () => {
  const electron = String.raw`C:\app\node_modules\electron\dist\electron.exe`;
  assert.equal(isLiveHarnessRun([electron, 'scripts/scheduler-live/main.cjs', '--user-data-dir=x'], {}), true);
  assert.equal(isLiveHarnessRun([electron, String.raw`D:\repo\scripts\srs-live\main.cjs`], {}), true);
  assert.equal(isLiveHarnessRun([electron, '.'], {}), false);
  assert.equal(isLiveHarnessRun([String.raw`C:\Program Files\BagLib\BagLib.exe`], {}), false);
  assert.equal(isLiveHarnessRun([electron, 'scripts/srs-live/main.cjs'], { BAGLIB_LIVE_VISIBLE: '1' }), false);
});

test('off-screen position sits past the leftmost display', () => {
  assert.deepEqual(offscreenPosition([0], 1280), { x: -1480, y: 0 });
  assert.deepEqual(offscreenPosition([-1920, 0], 1200), { x: -3320, y: 0 });
  assert.deepEqual(offscreenPosition([], 800), { x: -1000, y: 0 });
});
