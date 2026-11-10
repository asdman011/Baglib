import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider } from '../../src/renderer/components/context/WorkspaceContext';
import { NotesOverviewView } from '../../src/renderer/components/notes/NotesOverviewView';
import type { StudyNote } from '../../src/shared/study-notes';

function setupDOM() {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  class MockCustomEvent extends window.Event {
    detail?: unknown;
    constructor(type: string, options?: { detail?: unknown; bubbles?: boolean; cancelable?: boolean }) {
      super(type, options);
      this.detail = options?.detail;
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
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  return window;
}

const mockNotes: StudyNote[] = [
  {
    id: 'note-1',
    title: 'قواعد التفسير وأصوله',
    content: 'الملاحظة الأولى حول قواعد التفسير وعلاقتها بالسنة [[quran:hafs:2:153|البقرة]]',
    aliases: ['تفسير', 'أصول'],
    tags: ['فقه', 'تفسير'],
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  },
  {
    id: 'note-2',
    title: 'مناهج المحدثين',
    content: 'ملاحظة ثانية حول علوم الحديث ومناهج الأئمة [[note:note-1|قواعد التفسير]]',
    aliases: ['حديث'],
    tags: ['حديث'],
    createdAt: '2026-11-02T10:00:00Z',
    updatedAt: '2026-11-02T10:00:00Z',
  },
];

test('Notes workspace renders top tabs (Notes, Knowledge Cards, Boards)', async () => {
  const win = setupDOM();
  const rootElement = win.document.getElementById('root')!;
  const root = createRoot(rootElement);

  Object.defineProperty(win, 'electronAPI', {
    configurable: true,
    value: {
      getAllBooks: async () => [],
      getAllNotes: async () => [],
      getCategoryTree: async () => [],
      studyNotes: {
        list: async () => mockNotes,
        onChanged: () => () => {},
      },
      knowledgeCards: {
        list: async () => [],
        listPreserved: async () => [],
        reviewQueue: async () => ({ cards: [], due: 0, reviewedToday: 0, nextDue: null }),
      },
      boards: {
        list: async () => [],
        onChanged: () => () => {},
      },
      knowledgeHistory: {
        commentCounts: async () => ({}),
      },
    },
  });

  await act(async () => {
    root.render(
      createElement(WorkspaceProvider, null, createElement(NotesOverviewView))
    );
  });

  const notesTab = rootElement.querySelector('[data-notes-tab="notes"]');
  const cardsTab = rootElement.querySelector('[data-notes-tab="cards"]');
  const boardsTab = rootElement.querySelector('[data-notes-tab="boards"]');

  assert.ok(notesTab, 'Notes tab must exist');
  assert.ok(cardsTab, 'Cards tab must exist');
  assert.ok(boardsTab, 'Boards tab must exist');

  // Verify 3-pane layout elements in Notes tab
  const listPane = rootElement.querySelector('[data-notes-list-pane]');
  const editorPane = rootElement.querySelector('[data-note-editor-pane]');
  const detailsPane = rootElement.querySelector('[data-note-details-pane]');

  assert.ok(listPane, 'List pane must be rendered in Notes tab');
  assert.ok(editorPane, 'Editor pane must be rendered in Notes tab');
  assert.ok(detailsPane, 'Details pane must be rendered in Notes tab');

  // Verify list shows both notes
  const noteItem1 = rootElement.querySelector('[data-study-note="note-1"]');
  const noteItem2 = rootElement.querySelector('[data-study-note="note-2"]');
  assert.ok(noteItem1, 'Note 1 must be listed');
  assert.ok(noteItem2, 'Note 2 must be listed');
});

test('Workspace navigation switching: tabs and custom events', async () => {
  const win = setupDOM();
  const rootElement = win.document.getElementById('root')!;
  const root = createRoot(rootElement);

  Object.defineProperty(win, 'electronAPI', {
    configurable: true,
    value: {
      getAllBooks: async () => [],
      getAllNotes: async () => [],
      getCategoryTree: async () => [],
      studyNotes: {
        list: async () => mockNotes,
        onChanged: () => () => {},
      },
      knowledgeCards: {
        list: async () => [],
        listPreserved: async () => [],
        reviewQueue: async () => ({ cards: [], due: 2, reviewedToday: 0, nextDue: null }),
      },
      boards: {
        list: async () => [],
        onChanged: () => () => {},
      },
      knowledgeHistory: {
        commentCounts: async () => ({}),
      },
    },
  });

  await act(async () => {
    root.render(
      createElement(WorkspaceProvider, null, createElement(NotesOverviewView))
    );
  });

  // Dispatch baglib:open-cards event
  await act(async () => {
    win.dispatchEvent(new (win as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent('baglib:open-cards'));
  });

  // Verify Cards panel is now visible
  const savedCards = rootElement.querySelector('[data-saved-cards]');
  assert.ok(savedCards, 'SavedCardsPanel must be rendered when baglib:open-cards is dispatched');

  // Dispatch baglib:open-boards event
  await act(async () => {
    win.dispatchEvent(new (win as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent('baglib:open-boards'));
  });

  // Verify Boards workspace is now visible as a first-class view
  const boardsWorkspace = rootElement.querySelector('[data-boards]');
  assert.ok(boardsWorkspace, 'BoardsWorkspace must be rendered when baglib:open-boards is dispatched');

  // Dispatch baglib:start-review event
  await act(async () => {
    win.dispatchEvent(new (win as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent('baglib:start-review'));
  });

  // Verify dedicated review screen is visible
  const reviewScreen = rootElement.querySelector('[data-srs-review-screen]');
  assert.ok(reviewScreen, 'SrsReviewScreen must be rendered when baglib:start-review is dispatched');
});

test('Notes selection and stacked screen navigation (480px model)', async () => {
  const win = setupDOM();
  const rootElement = win.document.getElementById('root')!;
  const root = createRoot(rootElement);

  Object.defineProperty(win, 'electronAPI', {
    configurable: true,
    value: {
      getAllBooks: async () => [],
      getAllNotes: async () => [],
      getCategoryTree: async () => [],
      studyNotes: {
        list: async () => mockNotes,
        onChanged: () => () => {},
      },
      knowledgeCards: {
        list: async () => [],
        listPreserved: async () => [],
        reviewQueue: async () => ({ cards: [], due: 0, reviewedToday: 0, nextDue: null }),
      },
      boards: {
        list: async () => [],
        onChanged: () => () => {},
      },
      knowledgeHistory: {
        commentCounts: async () => ({}),
      },
    },
  });

  await act(async () => {
    root.render(
      createElement(WorkspaceProvider, null, createElement(NotesOverviewView))
    );
  });

  // Click on note-2 item
  const noteItem2 = rootElement.querySelector('[data-study-note="note-2"]') as HTMLElement;
  assert.ok(noteItem2, 'Note 2 item must exist');

  await act(async () => {
    noteItem2.click();
  });

  // Verify editor pane shows note 2 title
  const titleInput = rootElement.querySelector('[data-note-editor-pane] input[type="text"]') as HTMLInputElement;
  assert.ok(titleInput, 'Title input must exist');
  assert.equal(titleInput.value, 'مناهج المحدثين');

  // Verify back button is available when in editor screen on mobile
  const backButton = rootElement.querySelector('[data-notes-back-button]') as HTMLElement | null;
  assert.ok(backButton, 'Back button must be present in editor pane');

  // Click back button to return to list
  await act(async () => {
    backButton.click();
  });

  // List pane should remain available
  const listPane = rootElement.querySelector('[data-notes-list-pane]');
  assert.ok(listPane, 'List pane should be visible after back button click');
});

test('Notes workspace renders open-questions entry and per-note knowledge graph button', async () => {
  const win = setupDOM();
  const rootElement = win.document.getElementById('root')!;
  const root = createRoot(rootElement as unknown as HTMLElement);

  Object.defineProperty(win, 'electronAPI', {
    configurable: true,
    value: {
      getAllBooks: async () => [],
      getAllNotes: async () => [],
      getCategoryTree: async () => [],
      studyNotes: {
        list: async () => mockNotes,
        onChanged: () => () => {},
      },
      knowledgeCards: {
        list: async () => [],
        listPreserved: async () => [],
        reviewQueue: async () => ({ cards: [], due: 0, reviewedToday: 0, nextDue: null }),
      },
      boards: {
        list: async () => [],
        onChanged: () => () => {},
      },
      knowledgeHistory: {
        commentCounts: async () => ({}),
        questions: async () => [
          { id: 'q-1', text: 'ما الفرق بين العام والخاص في التفسير؟', source: 'note:note-1', status: 'open' },
        ],
        trash: async () => [],
        captureEnabled: async () => true,
        conversionReport: async () => ({ issues: [], historyBytes: 100, historyVersions: 1 }),
      },
    },
  });

  await act(async () => {
    root.render(
      createElement(WorkspaceProvider, null, createElement(NotesOverviewView))
    );
  });

  // 1. Verify Note List filter has 'questions' option
  const filterSelect = rootElement.querySelector('[data-notes-list-pane] select') as HTMLSelectElement;
  assert.ok(filterSelect, 'Filter select must exist');
  const questionsOption = Array.from(filterSelect.options).find((o) => o.value === 'questions');
  assert.ok(questionsOption, 'Open questions option must exist in filter select');

  // Switch filter to questions
  await act(async () => {
    filterSelect.value = 'questions';
    // linkedom select options
    const opt = Array.from(filterSelect.options).find(o => o.value === 'questions');
    if (opt) opt.selected = true;
    const changeEvent = new win.Event('change', { bubbles: true });
    Object.defineProperty(changeEvent, 'target', { value: filterSelect });
    filterSelect.dispatchEvent(changeEvent);
  });

  // Verify KnowledgeTools is rendered in notes list
  const toolsInList = rootElement.querySelector('[data-notes-list-pane] [data-knowledge-tools]');
  assert.ok(toolsInList, 'KnowledgeTools must be rendered when questions filter is active');

  // Switch filter back to all
  await act(async () => {
    filterSelect.value = 'all';
    const opt = Array.from(filterSelect.options).find(o => o.value === 'all');
    if (opt) opt.selected = true;
    const changeEvent = new win.Event('change', { bubbles: true });
    Object.defineProperty(changeEvent, 'target', { value: filterSelect });
    filterSelect.dispatchEvent(changeEvent);
  });

  // 2. Select note-2 (which links to note-1)
  const noteItem2 = rootElement.querySelector('[data-study-note="note-2"]') as HTMLElement;
  assert.ok(noteItem2, 'Note 2 item must exist');
  await act(async () => {
    noteItem2.click();
  });

  // Verify per-note knowledge graph button exists in NoteEditorPane header
  const graphButton = rootElement.querySelector('[data-note-editor-pane] [data-graph-button]') as HTMLElement;
  assert.ok(graphButton, 'KnowledgeGraphButton must be present in NoteEditorPane header');
  assert.equal(graphButton.hasAttribute('disabled'), false, 'Graph button should be enabled because note-2 has a link');

  // 3. Verify NoteDetailsPane has the Questions tab
  const questionsTab = rootElement.querySelector('[data-note-details-pane] [data-tab-questions]') as HTMLElement;
  assert.ok(questionsTab, 'Questions tab button must exist in NoteDetailsPane');

  await act(async () => {
    questionsTab.click();
  });

  // Verify KnowledgeTools is rendered inside NoteDetailsPane
  const toolsInDetails = rootElement.querySelector('[data-note-details-pane] [data-knowledge-tools]');
  assert.ok(toolsInDetails, 'KnowledgeTools must be rendered inside NoteDetailsPane under questions tab');
});
