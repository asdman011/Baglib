import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHijriDate } from '../../src/shared/athan-calculator';
import { formatHijriForDay } from '../../src/renderer/components/dashboard/DashboardCalendarModule';

test('Hijri Date Acceptance Criteria: checks 2026-11-10 is 30 Jumada al-Ula 1448 AH', () => {
  // Acceptance criterion: A unit test checks the Hijri date for a known date.
  // For example, 2026-11-10 is 30 Jumada al-Ula 1448 AH, which matches the app's current header.
  const knownDate = new Date('2026-11-10T12:00:00Z');
  const hijri = calculateHijriDate(knownDate);

  assert.equal(hijri.day, 30, 'Day should be 30');
  assert.equal(hijri.month, 5, 'Month 5 is Jumada al-Ula');
  assert.equal(hijri.year, 1448, 'Year should be 1448 AH');
  assert.equal(hijri.monthNameAr, 'جمادى الأولى');
  assert.equal(hijri.monthNameEn, 'Jumada al-Ula');
  assert.equal(hijri.formattedEn, '30 Jumada al-Ula 1448 AH');
  assert.equal(hijri.formattedAr, '٣٠ جمادى الأولى ١٤٤٨ هـ');
});

test('Intl.DateTimeFormat with islamic-umalqura formats 2026-11-10 correctly in Arabic and English', () => {
  const date = new Date('2026-11-10T12:00:00Z');

  // Arabic Umalqura
  const arFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const arFormatted = arFormatter.format(date);
  assert.ok(
    arFormatted.includes('٣٠') || arFormatted.includes('30'),
    `Arabic formatted date should contain day 30: ${arFormatted}`
  );
  assert.ok(
    arFormatted.includes('جمادى الأولى'),
    `Arabic formatted date should contain Jumada al-Ula: ${arFormatted}`
  );
  assert.ok(
    arFormatted.includes('١٤٤٨') || arFormatted.includes('1448'),
    `Arabic formatted date should contain 1448: ${arFormatted}`
  );

  // English Umalqura
  const enFormatter = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const enFormatted = enFormatter.format(date);
  assert.ok(
    enFormatted.includes('30'),
    `English formatted date should contain day 30: ${enFormatted}`
  );
  assert.ok(
    enFormatted.includes('Jumada') || enFormatted.includes('Jum.'),
    `English formatted date should contain Jumada: ${enFormatted}`
  );
  assert.ok(
    enFormatted.includes('1448'),
    `English formatted date should contain 1448: ${enFormatted}`
  );
});

test('formatHijriForDay formats localized day digits for calendar cells', () => {
  const date = new Date('2026-11-10T12:00:00Z');

  const ar = formatHijriForDay(date, 'ar');
  assert.ok(ar.dayStr.length > 0);
  assert.ok(ar.label.length > 0);

  const en = formatHijriForDay(date, 'en');
  assert.ok(en.dayStr.includes('30'));
  assert.ok(en.label.includes('1448'));
});
