import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DASHBOARD_MODULES,
  validateDashboardLayout,
  moveDashboardModule,
  toggleDashboardModuleVisibility,
  type DashboardLayoutState,
} from '../../src/renderer/components/dashboard/dashboard-layout-config';

test('validateDashboardLayout returns default 10 modules on invalid or null input', () => {
  const def = validateDashboardLayout(null);
  assert.equal(def.version, 1);
  assert.equal(def.modules.length, 10);
  assert.equal(def.modules[0].id, 'today', 'Today panel must be first in default module order');
  assert.equal(def.modules[1].id, 'calendar', 'Calendar module must be second in default module order');
  assert.deepEqual(
    def.modules.map((m) => m.id),
    DEFAULT_DASHBOARD_MODULES.map((m) => m.id)
  );

  const defEmpty = validateDashboardLayout({});
  assert.equal(defEmpty.modules.length, 10);
  assert.equal(defEmpty.modules[0].id, 'today', 'Today panel must be first in default module order');
  assert.equal(defEmpty.modules[1].id, 'calendar', 'Calendar module must be second in default module order');
});

test('validateDashboardLayout sanitizes unknown modules and preserves order and visibility', () => {
  const custom: unknown = {
    version: 1,
    modules: [
      { id: 'calendar', visible: true },
      { id: 'fake_module_xyz', visible: true },
      { id: 'today', visible: false },
    ],
  };

  const validated = validateDashboardLayout(custom);
  assert.equal(validated.version, 1);
  // calendar was first, today was second (false), remaining 8 filled in default order
  assert.equal(validated.modules[0].id, 'calendar');
  assert.equal(validated.modules[0].visible, true);
  assert.equal(validated.modules[1].id, 'today');
  assert.equal(validated.modules[1].visible, false);
  assert.equal(validated.modules.length, 10);
  // Fake module excluded
  assert.ok(!validated.modules.some((m) => (m.id as string) === 'fake_module_xyz'));
});

test('moveDashboardModule moves module up and down within bounds', () => {
  const initial = [...DEFAULT_DASHBOARD_MODULES];
  assert.equal(initial[0].id, 'today');
  assert.equal(initial[1].id, 'calendar');

  // Moving first module up does nothing
  const noop = moveDashboardModule(initial, 'today', 'up');
  assert.equal(noop[0].id, 'today');

  // Moving calendar up swaps with today
  const movedUp = moveDashboardModule(initial, 'calendar', 'up');
  assert.equal(movedUp[0].id, 'calendar');
  assert.equal(movedUp[1].id, 'today');

  // Moving calendar down moves it back
  const movedDown = moveDashboardModule(movedUp, 'calendar', 'down');
  assert.equal(movedDown[0].id, 'today');
  assert.equal(movedDown[1].id, 'calendar');
});

test('toggleDashboardModuleVisibility toggles visible flag', () => {
  const initial = [...DEFAULT_DASHBOARD_MODULES];
  assert.equal(initial[0].visible, true);

  const toggled = toggleDashboardModuleVisibility(initial, 'today');
  assert.equal(toggled[0].visible, false);

  const toggledBack = toggleDashboardModuleVisibility(toggled, 'today');
  assert.equal(toggledBack[0].visible, true);
});

test('Module order survives a restart simulation via storage round-trip', async () => {
  // Simulate moving calendar to top and enabling the optional studyRhythm module
  const currentLayout: DashboardLayoutState = {
    version: 1,
    modules: [...DEFAULT_DASHBOARD_MODULES],
  };

  currentLayout.modules = moveDashboardModule(currentLayout.modules, 'calendar', 'up');
  currentLayout.modules = toggleDashboardModuleVisibility(currentLayout.modules, 'studyRhythm');

  // Serialize to JSON (simulating store save)
  const serialized = JSON.stringify(currentLayout);

  // Restart / App relaunch: read from store & validate
  const reloaded = JSON.parse(serialized);
  const validatedAfterRestart = validateDashboardLayout(reloaded);

  assert.equal(validatedAfterRestart.modules[0].id, 'calendar');
  assert.equal(validatedAfterRestart.modules[1].id, 'today');

  const studyRhythm = validatedAfterRestart.modules.find((m) => m.id === 'studyRhythm');
  assert.ok(studyRhythm);
  assert.equal(studyRhythm.visible, true);
});
