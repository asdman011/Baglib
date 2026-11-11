import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider } from '../../src/renderer/components/context/WorkspaceContext';
import { SrsReviewScreen, formatInterval } from '../../src/renderer/components/knowledge/SrsReviewScreen';
import type { ReviewQueue, ReviewRating } from '../../src/shared/srs';

function setupDOM() {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  class MockCustomEvent extends window.Event {
    detail?: unknown;
    constructor(type: string, options?: { detail?: unknown; bubbles?: boolean; cancelable?: boolean }) {
      super(type, options);
      this.detail = options?.detail;
    }
  }
  class MockKeyboardEvent extends window.Event {
    key: string;
    code: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    constructor(
      type: string,
      options?: {
        key?: string;
        code?: string;
        shiftKey?: boolean;
        ctrlKey?: boolean;
        altKey?: boolean;
        metaKey?: boolean;
        bubbles?: boolean;
        cancelable?: boolean;
      }
    ) {
      super(type, options);
      this.key = options?.key ?? '';
      this.code = options?.code ?? '';
      this.shiftKey = options?.shiftKey ?? false;
      this.ctrlKey = options?.ctrlKey ?? false;
      this.altKey = options?.altKey ?? false;
      this.metaKey = options?.metaKey ?? false;
    }
  }

  const globals = {
    window,
    document: window.document,
    React,
    IS_REACT_ACT_ENVIRONMENT: true,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLSelectElement: window.HTMLSelectElement,
    CustomEvent: MockCustomEvent,
    KeyboardEvent: MockKeyboardEvent,
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  return window;
}


// KEY-234 (user decision 2026-11-11): a recall card needs a confidence choice before Reveal, so every
// review also records its practice attempt. Keys 1-4 choose confidence before Reveal and never grade.
test('recall review requires a confidence choice before Reveal and records it with the grade', async () => {
  const win = setupDOM();
  const root = createRoot(win.document.getElementById('root')!);
  const card = { id: 'card-c', revision: 'rev-1', cardRevision: 3, front: 'سؤال الثقة — Confidence question', back: 'الجواب — Answer', sourceKind: 'note' as const, sourceRef: 'note:c', sourceLabel: null, memorizing: true, createdAt: new Date().toISOString() };
  const queue = { cards: [card], due: 1, reviewedToday: 0, nextDue: null } as unknown as ReviewQueue;
  let graded: ReviewRating | null = null;
  const attempts: { confidence: number; cardRevision: number }[] = [];
  Object.defineProperty(win, 'electronAPI', { configurable: true, value: {
    getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [],
    studyNotes: { list: async () => [], onChanged: () => () => {} },
    knowledgeCards: {
      reviewQueue: async () => queue,
      gradeReview: async (input: { rating: ReviewRating }) => { graded = input.rating; return { cards: [], due: 0, reviewedToday: 1, nextDue: null }; },
      recordAttempt: async (input: { confidence: number; cardRevision: number }) => { attempts.push(input); },
    },
  } });
  const press = (key: string, code: string) => act(async () => { win.dispatchEvent(new (win as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent('keydown', { key, code, bubbles: true })); });
  try {
    await act(async () => root.render(createElement(WorkspaceProvider, null, createElement(SrsReviewScreen, { onClose: () => {} }))));
    await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
    const reveal = () => win.document.querySelector('[data-srs-reveal]') as HTMLButtonElement | null;
    assert.ok(reveal(), 'reveal button shown');
    assert.equal(reveal()!.disabled, true, 'Reveal waits for a confidence choice');
    await press(' ', 'Space');
    assert.equal(win.document.querySelector('[data-srs-rating="1"]'), null, 'Space does not reveal without confidence');
    await press('2', 'Digit2');
    assert.equal(graded, null, 'a digit before Reveal never grades');
    assert.equal(reveal()!.disabled, false, 'choosing confidence enables Reveal');
    await press(' ', 'Space');
    assert.ok(win.document.querySelector('[data-srs-rating="3"]'), 'revealed after confidence');
    await press('3', 'Digit3');
    await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
    assert.equal(graded, 3);
    assert.equal(attempts.length, 1, 'the practice attempt is recorded');
    assert.equal(attempts[0].confidence, 2);
    assert.equal(attempts[0].cardRevision, 3);
  } finally {
    await act(async () => root.unmount());
  }
});
