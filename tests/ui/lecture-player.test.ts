import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider } from '../../src/renderer/components/context/WorkspaceContext';
import { LecturesView } from '../../src/renderer/components/lectures/LecturesView';
import { translations } from '../../src/renderer/translations';
import type { LectureSeries } from '../../src/shared/lecture-series';

for (const lang of ['ar', 'en'] as const) {
  for (const hasTranscript of [false, true]) {
    test(`lecture player translated controls stay LTR, transcript visibility and study notes / ${lang} / ${hasTranscript}`, async () => {
      const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
      const storage = new Map([['baglib-lang', lang], ['baglib.lectures.layout', 'study']]);
      const localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) };
      const globals = { window, document: window.document, localStorage, React, CustomEvent: window.CustomEvent, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
      const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
      for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
      const tracks = Object.assign([], { addEventListener() {}, removeEventListener() {} });
      const mediaProperties = { textTracks: tracks, buffered: { length: 0 }, currentTime: 0, duration: 120, playbackRate: 1, volume: 1, muted: false, paused: true, readyState: 1 };
      const originals = new Map(Object.keys(mediaProperties).map(key => [key, Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, key)]));
      for (const [key, value] of Object.entries(mediaProperties)) Object.defineProperty(window.HTMLElement.prototype, key, { configurable: true, writable: true, value });
      const empty = async () => [];
      const lecture = { id: 'lecture-one', title: '\u0627\u0644\u0639\u0650\u0644\u0652\u0645 Lecture 2', kind: 'video', path: 'D:/2.mp4', sections: [], sectionSource: 'none', addedAt: '' };
      let groups: LectureSeries[] = [{ id: 'series-one', name: 'Course', autoplayNext: false, createdAt: '', updatedAt: '', items: [{workId: lecture.id,title:lecture.title,completed:false}] }];
      const updates: unknown[] = [];
      Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
        getAllBooks: empty, getAllNotes: empty, categories: { getTree: empty }, tags: { getAll: empty }, settings: { get: async () => undefined }, knowledge: { getAll: empty }, studyNotes: { list: empty, onChanged: () => () => {} },
        lectures: { list: async () => [lecture], subtitles: async () => hasTranscript ? { cues: [{ start: 20, end: 30, text: '\u0639\u0650\u0644\u0652\u0645 Knowledge' }] } : null, progress: async () => null, saveProgress: async () => {}, series: { list: async () => groups, update: async (id: string, changes: {autoplayNext: boolean}) => { updates.push({ id, changes }); groups = groups.map(group => ({...group, ...changes})); } } },
      } });
      const root = createRoot(window.document.getElementById('root')!);
      try {
        await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(LecturesView))));
        await act(async () => window.document.querySelector<HTMLButtonElement>('[data-lecture-select]')!.click());
        const bar = window.document.querySelector('[data-lecture-control-bar]')!;
        assert.equal(bar.getAttribute('dir'), 'ltr');
        assert.equal(bar.querySelector('[data-lecture-play]')!.getAttribute('aria-label'), translations[lang].lecturePlay);
        assert.equal(window.document.querySelectorAll('[data-lecture-transcript-slot]').length, Number(hasTranscript));
        assert.equal(window.document.querySelectorAll('[data-transcript-search]').length, Number(hasTranscript));
        assert.ok(window.document.querySelector('[data-lecture-study-tools] [data-lecture-inline-notes] textarea'));
        // Study tools put the notes box first, with Sections below it.
        const tools = [...window.document.querySelector('[data-lecture-study-tools]')!.children].map(child => child.hasAttribute('data-lecture-notes') ? 'notes' : child.hasAttribute('data-lecture-sections') ? 'sections' : null).filter(Boolean);
        assert.deepEqual(tools, ['notes', 'sections']);
        assert.equal(window.document.querySelector('[data-note-side-panel]'), null);
        assert.ok(window.document.querySelector('[data-lecture-note-save]')!.textContent!.includes(translations[lang].notePanelSave));
        const toggle = window.document.querySelector<HTMLInputElement>('[data-lecture-autoplay]')!;
        assert.ok(toggle);
        // Trigger React's change handler with the same checked value a native checkbox supplies.
        const props = Object.keys(toggle).find(key => key.startsWith('__reactProps'))!;
        const handler = (toggle as unknown as Record<string, {onChange: (event: {target: {checked: boolean}}) => void}>)[props].onChange;
        await act(async () => handler({ target: { checked: true } }));
        assert.deepEqual(updates, [{id:'series-one',changes:{autoplayNext:true}}]);
        assert.ok(window.document.querySelector<HTMLInputElement>('[data-lecture-autoplay]')!.checked);
        // The overlay layout keeps the same notes box, under the video.
        await act(async () => window.document.querySelector<HTMLButtonElement>('[data-lecture-layout-switch]')!.click());
        assert.equal(storage.get('baglib.lectures.layout'), 'overlay');
        const player = window.document.querySelector('[data-lecture-player]')!;
        const box = window.document.querySelector('[data-lecture-study-tools] [data-lecture-inline-notes] textarea')!;
        assert.ok(box);
        const order = [...window.document.querySelectorAll('*')];
        assert.ok(order.indexOf(box) > order.indexOf(player), 'the notes box follows the video');
      } finally {
        await act(async () => root.unmount());
        for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(window.HTMLElement.prototype, key, descriptor); else Reflect.deleteProperty(window.HTMLElement.prototype, key); }
        for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
      }
    });
  }
}
