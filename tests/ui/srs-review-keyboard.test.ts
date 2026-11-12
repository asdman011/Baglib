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

// The rating buttons show the scheduler's real next interval (minutes), formatted with locale units and digits.
test('formatInterval formats scheduler minutes in Arabic and English', () => {
  assert.equal(formatInterval(10, 'ar'), '١٠ د');
  assert.equal(formatInterval(1440, 'ar'), 'يوم');
  assert.equal(formatInterval(3 * 1440, 'ar'), '٣ أيام');
  assert.equal(formatInterval(120, 'ar'), '٢ س');

  assert.equal(formatInterval(10, 'en'), '10 min');
  assert.equal(formatInterval(1440, 'en'), '1 day');
  assert.equal(formatInterval(3 * 1440, 'en'), '3 days');
  assert.equal(formatInterval(120, 'en'), '2 hr');

  assert.equal(formatInterval(undefined, 'en'), '', 'no preview, no label');
  assert.equal(formatInterval(0, 'ar'), '');
});

test('SRS review keyboard model: Space reveals card, 1-4 grades after reveal', async () => {
  const win = setupDOM();
  const rootElement = win.document.getElementById('root')!;
  const root = createRoot(rootElement);

  const mockCard = {
    id: 'card-1',
    revision: 'rev-1',
    front: 'السؤال الأول — First Question',
    back: 'الإجابة الأولى — First Answer',
    sourceKind: 'note' as const,
    sourceRef: 'note:123',
    sourceLabel: 'ملاحظة تجريبية',
    memorizing: true,
    createdAt: new Date().toISOString(),
  };

  const queue: ReviewQueue = {
    cards: [mockCard],
    due: 1,
    reviewedToday: 0,
    nextDue: null,
  };

  let gradedRating: ReviewRating | null = null;
  let closeCalled = false;

  Object.defineProperty(win, 'electronAPI', {
    configurable: true,
    value: {
      getAllBooks: async () => [],
      getAllNotes: async () => [],
      getCategoryTree: async () => [],
      studyNotes: {
        list: async () => [],
        onChanged: () => () => {},
      },
      knowledgeCards: {
        reviewQueue: async () => queue,
        gradeReview: async (input: { id: string; rating: ReviewRating }) => {
          gradedRating = input.rating;
          return {
            cards: [],
            due: 0,
            reviewedToday: 1,
            nextDue: null,
          };
        },
        recordAttempt: async () => {},
      },
    },
  });

  await act(async () => {
    root.render(
      createElement(
        WorkspaceProvider,
        null,
        createElement(SrsReviewScreen, {
          onClose: () => {
            closeCalled = true;
          },
        })
      )
    );
  });

  // Verify card front is rendered
  const cardElement = rootElement.querySelector('[data-srs-card="card-1"]');
  assert.ok(cardElement, 'Card element must be rendered');
  assert.ok(cardElement.textContent?.includes('السؤال الأول'));

  // Rating buttons should not be present before reveal
  assert.equal(rootElement.querySelector('[data-srs-rating="1"]'), null);

  // Pressing 1 before reveal does NOT grade the card
  await act(async () => {
    win.dispatchEvent(
      new (win as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent('keydown', {
        key: '1',
        code: 'Digit1',
        bubbles: true,
      })
    );
  });
  assert.equal(gradedRating, null, 'Pressing 1 before reveal must not grade card');

  // Press Space to reveal answer
  await act(async () => {
    win.dispatchEvent(
      new (win as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        bubbles: true,
      })
    );
  });

  // Answer should now be revealed
  const answerElement = rootElement.querySelector('[data-srs-answer]');
  assert.ok(answerElement, 'Answer should be displayed after Space press');
  assert.ok(answerElement.textContent?.includes('الإجابة الأولى'));

  // Rating buttons should now be visible
  const ratingBtn1 = rootElement.querySelector('[data-srs-rating="1"]');
  const ratingBtn2 = rootElement.querySelector('[data-srs-rating="2"]');
  const ratingBtn3 = rootElement.querySelector('[data-srs-rating="3"]');
  const ratingBtn4 = rootElement.querySelector('[data-srs-rating="4"]');
  assert.ok(ratingBtn1 && ratingBtn2 && ratingBtn3 && ratingBtn4, 'All 4 rating buttons must be visible');

  // Press key 3 (Good) to grade
  await act(async () => {
    win.dispatchEvent(
      new (win as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent('keydown', {
        key: '3',
        code: 'Digit3',
        bubbles: true,
      })
    );
  });
  assert.equal(gradedRating, 3, 'Pressing 3 must submit Good rating (3)');

  // Press Escape to trigger close
  await act(async () => {
    win.dispatchEvent(
      new (win as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
      })
    );
  });
  assert.equal(closeCalled, true, 'Pressing Escape must call onClose()');
});

test('SRS review screen empty state when queue has 0 cards', async () => {
  const win = setupDOM();
  const rootElement = win.document.getElementById('root')!;
  const root = createRoot(rootElement);

  const emptyQueue: ReviewQueue = {
    cards: [],
    due: 0,
    reviewedToday: 5,
    nextDue: '2026-11-10T12:00:00Z',
  };

  let returnClicked = false;

  Object.defineProperty(win, 'electronAPI', {
    configurable: true,
    value: {
      getAllBooks: async () => [],
      getAllNotes: async () => [],
      getCategoryTree: async () => [],
      studyNotes: {
        list: async () => [],
        onChanged: () => () => {},
      },
      knowledgeCards: {
        reviewQueue: async () => emptyQueue,
      },
    },
  });

  await act(async () => {
    root.render(
      createElement(
        WorkspaceProvider,
        null,
        createElement(SrsReviewScreen, {
          onClose: () => {
            returnClicked = true;
          },
        })
      )
    );
  });

  // Verify return button is present
  const returnBtn = rootElement.querySelector('[data-srs-return-button]') as HTMLElement | null;
  assert.ok(returnBtn, 'Return button must be present on empty state');

  await act(async () => {
    returnBtn.click();
  });
  assert.equal(returnClicked, true, 'Clicking return button must trigger onClose()');
});
