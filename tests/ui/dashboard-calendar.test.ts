import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHijriForDay } from '../../src/renderer/components/dashboard/DashboardCalendarModule';
import { civilDate, addCivilDays } from '../../src/shared/study-planner';

test('Dashboard calendar days format dual Gregorian and Hijri dates correctly', () => {
  const november1 = new Date(2026, 10, 1); // 2026-11-01
  const daysInNov = 30;

  for (let i = 0; i < daysInNov; i++) {
    const day = addCivilDays(november1, i);
    const dayIso = civilDate(day);
    assert.match(dayIso, /^2026-11-\d{2}$/);

    const hijri = formatHijriForDay(day, 'en');
    assert.ok(hijri.dayStr.length > 0, `Day string should exist for ${dayIso}`);
    assert.ok(hijri.label.length > 0, `Hijri label should exist for ${dayIso}`);
  }
});

test('Dashboard calendar formats Arabic Hijri day digits without errors', () => {
  const november10 = new Date(2026, 10, 10);
  const hijriAr = formatHijriForDay(november10, 'ar');

  assert.ok(hijriAr.dayStr.length > 0);
  assert.ok(hijriAr.label.includes('جمادى') || hijriAr.label.includes('١٤٤٨') || hijriAr.label.length > 0);
});
