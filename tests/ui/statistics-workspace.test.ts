import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DASHBOARD_MODULES, validateDashboardLayout } from '../../src/renderer/components/dashboard/dashboard-layout-config';
import { areaCoordinates, buildTimeline, bucketSeries, calendarCells, donutSegments, progressRatio, reviewForecast, examCountdown } from '../../src/shared/statistics-workspace';

test('fresh dashboard enables only Today, calendar and prayer with details available to customize', () => {
  assert.deepEqual(DEFAULT_DASHBOARD_MODULES.filter(item => item.visible).map(item => item.id), ['today', 'calendar', 'athan']);
  assert.equal(DEFAULT_DASHBOARD_MODULES.length, 10);
});
test('saved v1 order and visibility survive even when identical to old defaults', () => {
  const saved = { version: 1 as const, modules: DEFAULT_DASHBOARD_MODULES.map(item => ({ ...item, visible: true })).reverse() };
  assert.deepEqual(validateDashboardLayout(saved), saved);
  assert.equal(validateDashboardLayout(null).modules.filter(item => item.visible).length, 3);
});
test('daily timeline fills gaps, merges duplicate dates, excludes future and clips range inclusively', () => {
  const points = buildTimeline([{date:'2026-11-09',value:3},{date:'2026-11-09',value:2},{date:'2026-11-11',value:99},{date:'2026-11-01',value:9}], 'week', '2026-11-10');
  assert.equal(points.length, 7);
  assert.equal(points[0].date, '2026-11-04');
  assert.equal(points[5].value, 5);
  assert.equal(points[6].value, 0);
});
test('all includes older history and month/year span calendar boundaries safely', () => {
  assert.equal(buildTimeline([{date:'2020-02-29',value:1}], 'all', '2026-11-10')[0].date, '2020-02-29');
  assert.equal(buildTimeline([], 'month', '2024-03-01').length, 30);
  assert.equal(buildTimeline([], 'year', '2024-03-01').length, 365);
});
test('bars aggregate long timelines without losing totals and keep chronological order', () => {
  const days = buildTimeline([{date:'2026-11-10',value:23}], 'year', '2026-11-10');
  const bars = bucketSeries(days, 12);
  assert.ok(bars.length <= 12);
  assert.equal(bars.reduce((sum, point) => sum + point.value, 0), 23);
  assert.ok(bars[0].date < bars[bars.length - 1].date);
});
test('donuts and progress rings handle empty, invalid and out-of-bounds values', () => {
  assert.deepEqual(donutSegments([]), []);
  assert.deepEqual(donutSegments([0, -1, NaN]), []);
  assert.equal(donutSegments([1, 3])[1].fraction, 0.75);
  assert.equal(progressRatio(3, 0), 0);
  assert.equal(progressRatio(8, 4), 1);
  assert.equal(progressRatio(-1, 4), 0);
});
test('due forecast includes overdue today and excludes suspended and later cards', () => {
  const points = reviewForecast([{dueAt:'2026-11-01T10:00:00Z',count:2},{dueAt:'2026-11-11T10:00:00Z',count:3}], '2026-11-10');
  assert.equal(points.length, 7);
  assert.equal(points[0].value, 2);
  assert.equal(points[1].value, 3);
});
test('exam countdown uses civil days through DST and distinguishes passed dates', () => {
  assert.equal(examCountdown('2026-11-12', '2026-11-10'), 2);
  assert.equal(examCountdown('2026-11-09', '2026-11-10'), -1);
  assert.equal(examCountdown(null, '2026-11-10'), null);
});

test('heatmap uses real weekdays and Arabic Saturday-first rows through week boundaries', () => {
  const days = buildTimeline([], 'week', '2026-11-10');
  const english = calendarCells(days);
  const arabic = calendarCells(days, 6);
  assert.equal(english[0].row, 3); // Wednesday
  assert.equal(arabic[0].row, 4);
  assert.equal(arabic[3].row, 0); // Saturday starts the next column
  assert.equal(arabic[3].column, 1);
  assert.deepEqual(calendarCells([]), []);
});

test('area chart coordinates preserve chronology and mirror the time axis in RTL', () => {
  const input = [{date:'2026-11-09',value:0},{date:'2026-11-10',value:4}];
  const ltr = areaCoordinates(input);
  const rtl = areaCoordinates(input, true);
  assert.equal(ltr[0].y,116);
  assert.equal(ltr[1].y,12);
  assert.equal(ltr[0].x + rtl[0].x,400);
  assert.equal(ltr[1].x + rtl[1].x,400);
  assert.deepEqual(areaCoordinates([]), []);
});
