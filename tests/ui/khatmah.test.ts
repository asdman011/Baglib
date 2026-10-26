import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { KhatmahCard, KhatmahForm } from '../../src/renderer/components/quran/QuranKhatmah';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import type { KhatmahPlan } from '../../src/shared/types/khatmah';

const plan: KhatmahPlan = { id: 'one', title: 'تدبر • Ramadan', script: 'script', layout: 'layout', startDate: '2026-10-26', targetDate: '2026-11-24', mode: 'duration', durationDays: 30, pagesPerSession: 2, sessionsPerDay: 5, juzPerDay: 1, automatic: false, reminder: { enabled: false, time: '06:00', language: 'ar' }, binding: { script: 'script', layout: 'layout', profile: 'hafs', adapted: false, totalPages: 604, juzPages: [], juzEndPages: [] }, paused: false, reads: [{ page: 1, date: '2026-10-26' }] };
for (const lang of ['ar', 'en'] as const) {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params || {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), translations[lang][key]);
  test(`Khatmah card localizes progress and targets in ${lang}`, () => {
    const html = renderToStaticMarkup(createElement(KhatmahCard, { plan, today: '2026-10-26', t, lang, busy: false, available: true, onRead() {}, onMark() {}, onEdit() {}, onPause() {}, onDelete() {} }));
    const { document } = parseHTML(html);
    assert.equal(document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow'), '1');
    assert.ok(document.querySelector('[data-khatmah-card]')?.textContent.includes(plan.title));
    for (const key of ['khatmahReadToday', 'khatmahMarkToday', 'khatmahPause', 'khatmahEdit', 'khatmahDelete', 'khatmahForecast'] as const) assert.ok(document.documentElement.textContent.includes(t(key)));
    assert.equal(document.querySelectorAll('[disabled]').length, 0);
    assert.ok(!html.includes('{pages}'));
  });
  test(`Khatmah form exposes optional reminders and manual-by-default reading in ${lang}`, () => {
    const html = renderToStaticMarkup(createElement(KhatmahForm, { initial: plan, sources: [{ id: 'script', kind: 'script', title: 'حفص • Hafs', profile: 'hafs' }, { id: 'layout', kind: 'mushaf-layout', title: 'SVG', profile: 'hafs' }], t, lang, supported: true, busy: false, onSave: async () => true, onCancel() {} }));
    const { document } = parseHTML(html);
    assert.equal(document.querySelectorAll('input[type=checkbox][checked]').length, 0);
    assert.equal(document.querySelectorAll('input[type=date]').length, 1);
    assert.ok(html.includes(t('khatmahReminderNotice')));
    assert.equal(document.querySelectorAll('select[disabled]').length, 2);
  });
}
