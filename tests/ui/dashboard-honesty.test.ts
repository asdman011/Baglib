import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider } from '../../src/renderer/components/context/WorkspaceContext';
import { ReadingAnalyticsModule } from '../../src/renderer/components/dashboard/ReadingAnalyticsModule';
import { StudyInsightsModule } from '../../src/renderer/components/dashboard/StudyInsightsModule';
import { consumeStudyNote } from '../../src/renderer/utils/study-navigation';
import { translations } from '../../src/renderer/translations';
import type { StudyInsights } from '../../src/shared/study-insights';

for (const lang of ['ar', 'en'] as const) {
  for (const heatmap of [[], [{ date: '2026-11-14', totalDurationSeconds: 0, pagesRead: 0 }], [{ date: '2026-11-14', totalDurationSeconds: 120, pagesRead: 3 }]]) {
    test(`dashboard honest weekly totals and identifiable recent edits / ${lang} / ${JSON.stringify(heatmap)}`, async () => {
      const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
      const storage = new Map([['baglib-lang', lang]]);
      const localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
      const globals = { window, document: window.document, localStorage, React, CustomEvent: window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true };
      const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
      for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
      Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorage });
      const title = '\u062a\u064e\u0623\u064e\u0645\u0651\u064f\u0644 Faith 2026';
      const kinds = ['study_note', 'note', 'reading_reflection', 'highlight', 'quote', 'bookmark', 'question', 'unknown'];
      const summary: StudyInsights = { timeSource: 'none', seconds: 0, pages: 0, sessionCount: null, secondsPerPage: null, secondsPerSession: null, subjects: [], days: [], knowledge: 8, ideas: 1, completedTasks: 0, totalTasks: 0, reflections: [], edits: kinds.map((kind, index) => ({ id: `edit-${index}`, kind, title: index === 0 ? title : index === 1 ? '   ' : null, updatedAt: '2026-11-14T12:00:00Z' })), partial: false };
      const empty = async () => [];
      Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
        getAllBooks: empty, getAllNotes: empty, categories: { getTree: empty }, tags: { getAll: empty },
        settings: { get: async () => undefined }, knowledge: { getAll: empty },
        studyNotes: { list: empty, onChanged: () => () => {} },
        statistics: { getStreakStats: async () => ({ currentStreakDays: 0, longestStreakDays: 5, totalReadTimeSeconds: 99999, totalReadPages: 999 }), getDailyHeatmap: async () => heatmap },
        studyInsights: { summary: async () => summary, preferences: async () => ({ dailyMinutes: 0, dailyPages: 0, taskOrder: [] }) }, planner: { list: empty },
      } });
      const root = createRoot(window.document.getElementById('root')!);
      try {
        await act(async () => root.render(createElement(WorkspaceProvider, null,
          createElement('div', { id: 'analytics' }, createElement(ReadingAnalyticsModule)), createElement(StudyInsightsModule))));
        const t = translations[lang];
        const analytics = window.document.querySelector('#analytics')!;
        const labels = [...analytics.querySelectorAll('span, div')];
        const time = labels.find(node => node.tagName === 'SPAN' && node.textContent === t.dashStatsWeeklyTime)!;
        assert.equal(time.parentElement!.nextElementSibling!.textContent!.trim(), heatmap[0]?.totalDurationSeconds ? `2 ${t.statsMinutesUnit}` : `0 ${t.statsMinutesUnit}`);
        const pages = labels.find(node => node.textContent === t.dashStatsPagesThisWeek)!;
        assert.equal(pages.previousElementSibling!.textContent, String(heatmap[0]?.pagesRead || 0));
        assert.ok(!analytics.textContent!.includes('999'));
        const edits = [...window.document.querySelectorAll<HTMLElement>('[data-study-recent-edit]')];
        assert.equal(edits.length, 8);
        assert.equal(edits[0].querySelector('bdi')!.textContent, title);
        assert.equal(edits[1].querySelector('bdi')!.textContent, t.historyKindNote);
        const types = [t.historyKindNote, t.historyKindNote, t.waveReflection, t.historyKindHighlight, t.historyKindQuote, t.historyKindBookmark, t.historyKindQuestion, t.studyKnowledgeItem];
        edits.forEach((row, index) => {
          assert.ok(row.textContent!.includes(types[index]));
          assert.equal(row.querySelector('time')!.getAttribute('dateTime'), '2026-11-14T12:00:00Z');
          assert.equal(row.tagName, index < 3 ? 'BUTTON' : 'DIV');
        });
        for (const row of edits.slice(0, 3)) {
          await act(async () => row.click());
          assert.deepEqual(consumeStudyNote(), { id: row.dataset.studyRecentEdit });
        }
        assert.match(t.statsWordsPerMinuteEstimated, lang === 'ar' ? /\u062a\u0642\u062f\u064a\u0631\u064a\u0629/ : /Estimated/);
      } finally {
        await act(async () => root.unmount());
        for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
      }
    });
  }
}
