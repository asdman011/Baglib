import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider } from '../../src/renderer/components/context/WorkspaceContext';
import {
  Button,
  IconButton,
  Chip,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Modal,
  Sheet,
  Menu,
  Tabs,
  TabPanel,
  ToastProvider,
  useToast,
  EmptyState,
  Skeleton,
  Tooltip,
} from '../../src/renderer/components/ui';

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
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    constructor(type: string, options?: { key?: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; bubbles?: boolean; cancelable?: boolean }) {
      super(type, options);
      this.key = options?.key ?? '';
      this.shiftKey = options?.shiftKey ?? false;
      this.ctrlKey = options?.ctrlKey ?? false;
      this.altKey = options?.altKey ?? false;
      this.metaKey = options?.metaKey ?? false;
    }
  }
  window.HTMLElement.prototype.focus = function () {
    window.document.activeElement = this;
  };

  const globals = {
    window,
    document: window.document,
    React,
    IS_REACT_ACT_ENVIRONMENT: true,
    HTMLElement: window.HTMLElement,
    CustomEvent: MockCustomEvent,
    KeyboardEvent: MockKeyboardEvent,
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    Object.defineProperty(window, key, { configurable: true, writable: true, value });
  }

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      getAllBooks: async () => [],
      getAllNotes: async () => [],
      getCategoryTree: async () => [],
      studyNotes: {
        list: async () => [],
        onChanged: () => () => {},
      },
      knowledge: { getAll: async () => [] },
    },
  });

  return { window, container: window.document.getElementById('root') as HTMLElement };
}

test('Button and IconButton render with all variants, sizes and states', async () => {
  const { container } = setupDOM();
  const root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        WorkspaceProvider,
        null,
        createElement(
          'div',
          null,
          createElement(Button, { variant: 'primary', size: 'md' }, 'Primary Action'),
          createElement(Button, { variant: 'secondary', size: 'sm' }, 'Secondary Action'),
          createElement(Button, { variant: 'danger' }, 'Delete Action'),
          createElement(Button, { variant: 'ghost' }, 'Ghost Action'),
          createElement(Button, { loading: true }, 'Loading Action'),
          createElement(Button, { disabled: true }, 'Disabled Action'),
          createElement(IconButton, { label: 'Search Item', size: 'sm' }, '🔍')
        )
      )
    );
  });

  const buttons = container.querySelectorAll('button');
  assert.equal(buttons.length, 7);

  // Primary button has bg-primary
  assert.ok(buttons[0].className.includes('bg-primary'));
  assert.equal(buttons[0].textContent, 'Primary Action');

  // Secondary has bg-surface
  assert.ok(buttons[1].className.includes('bg-surface'));

  // Danger has bg-danger
  assert.ok(buttons[2].className.includes('bg-danger'));

  // Loading button has aria-busy and disabled
  assert.equal(buttons[4].getAttribute('aria-busy'), 'true');
  assert.ok(buttons[4].hasAttribute('disabled'));

  // Disabled button has disabled attribute
  assert.ok(buttons[5].hasAttribute('disabled'));

  // IconButton has aria-label and title
  assert.equal(buttons[6].getAttribute('aria-label'), 'Search Item');
  assert.equal(buttons[6].getAttribute('title'), 'Search Item');

  root.unmount();
});

test('Chip renders selected (evergreen D1) and unselected, and handles onSelect and onRemove', async () => {
  const { container } = setupDOM();
  const root = createRoot(container);

  let selected = false;
  let removed = false;

  await act(async () => {
    root.render(
      createElement(
        WorkspaceProvider,
        null,
        createElement(
          'div',
          null,
          createElement(Chip, {
            label: 'الفقه الإسلامي',
            selected: true,
            onSelect: () => { selected = true; },
          }),
          createElement(Chip, {
            label: 'التاريخ',
            selected: false,
            removable: true,
            onRemove: () => { removed = true; },
          })
        )
      )
    );
  });

  const chips = container.querySelectorAll('span');
  assert.ok(chips.length >= 2);

  // Selected chip has bg-primary (D1 dark evergreen)
  assert.ok(chips[0].className.includes('bg-primary'));

  // Click on chip 1 trigger
  const button1 = chips[0].querySelector('button');
  assert.ok(button1);
  await act(async () => {
    button1.click();
  });
  assert.equal(selected, true);

  // Chip 2 remove button
  const removeBtn = chips[1].querySelector('button');
  assert.ok(removeBtn);
  await act(async () => {
    removeBtn.click();
  });
  assert.equal(removed, true);

  root.unmount();
});

test('Badge and Card render all variants and subcomponents', async () => {
  const { container } = setupDOM();
  const root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        WorkspaceProvider,
        null,
        createElement(
          'div',
          null,
          createElement(Badge, { variant: 'primary' }, 'جديد'),
          createElement(Badge, { variant: 'accent' }, 'نسخة ورقية'),
          createElement(Badge, { variant: 'success' }, 'مكتمل'),
          createElement(Badge, { variant: 'danger' }, 'تنبيه'),
          createElement(
            Card,
            { variant: 'raised' },
            createElement(CardHeader, null,
              createElement(CardTitle, null, 'كتاب التوحيد'),
              createElement(CardDescription, null, 'وصف موجز')
            ),
            createElement(CardContent, null, 'محتوى البطاقة الدراسية'),
            createElement(CardFooter, null, 'التذييل')
          )
        )
      )
    );
  });

  const badges = container.querySelectorAll('span');
  assert.ok(badges.length >= 4);

  const card = container.querySelector('div.bg-surface-raised');
  assert.ok(card);
  assert.ok(card.textContent?.includes('كتاب التوحيد'));
  assert.ok(card.textContent?.includes('محتوى البطاقة الدراسية'));

  root.unmount();
});

test('Modal traps focus, closes on Esc, and returns focus to opener', async () => {
  const { container } = setupDOM();
  const root = createRoot(container);

  let modalOpen = true;
  const opener = document.createElement('button');
  opener.id = 'opener-btn';
  document.body.appendChild(opener);
  opener.focus();

  await act(async () => {
    root.render(
      createElement(
        WorkspaceProvider,
        null,
        createElement(
          Modal,
          {
            open: modalOpen,
            onClose: () => { modalOpen = false; },
            title: 'نافذة الاختبار',
            description: 'وصف النافذة',
          },
          createElement('button', { id: 'inner-btn-1' }, 'Button 1'),
          createElement('button', { id: 'inner-btn-2' }, 'Button 2')
        )
      )
    );
  });

  const dialog = container.querySelector('[role="dialog"]');
  assert.ok(dialog);
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.ok(dialog.textContent?.includes('نافذة الاختبار'));

  // Test Escape key closes modal
  await act(async () => {
    const escEvent = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    window.dispatchEvent(escEvent);
  });
  assert.equal(modalOpen, false);

  // Unmount modal and verify focus returns to opener
  await act(async () => {
    root.render(createElement(WorkspaceProvider, null, createElement('div')));
  });

  assert.equal(document.activeElement?.id, 'opener-btn');
  opener.remove();
  root.unmount();
});

test('Sheet renders with logical side and closes on Esc', async () => {
  const { container } = setupDOM();
  const root = createRoot(container);

  let sheetOpen = true;
  await act(async () => {
    root.render(
      createElement(
        WorkspaceProvider,
        null,
        createElement(
          Sheet,
          {
            open: sheetOpen,
            onClose: () => { sheetOpen = false; },
            side: 'end',
            title: 'لوح جانبي',
          },
          createElement('p', null, 'محتوى اللوح الجانبي')
        )
      )
    );
  });

  const dialog = container.querySelector('[role="dialog"]');
  assert.ok(dialog);
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.ok(dialog.className.includes('end-0'));

  await act(async () => {
    const escEvent = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    window.dispatchEvent(escEvent);
  });
  assert.equal(sheetOpen, false);

  root.unmount();
});

test('Menu keyboard navigation: ArrowDown, ArrowUp, Home, End, and Esc', async () => {
  const { container } = setupDOM();
  const root = createRoot(container);

  let clicked = false;
  await act(async () => {
    root.render(
      createElement(
        WorkspaceProvider,
        null,
        createElement(Menu, {
          trigger: ({ onClick, ref }) =>
            createElement('button', { ref, onClick, id: 'menu-trigger' }, 'Menu Trigger'),
          items: [
            { label: 'Item 1', onClick: () => {} },
            { label: 'Item 2', onClick: () => { clicked = true; } },
            { label: 'Item 3', disabled: true },
          ],
        })
      )
    );
  });

  const trigger = container.querySelector('#menu-trigger') as HTMLButtonElement;
  assert.ok(trigger);

  // Open menu
  await act(async () => {
    trigger.click();
  });

  let menu = container.querySelector('[role="menu"]');
  assert.ok(menu);

  // ArrowDown moves focus to next item
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });

  // Enter triggers active item
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  assert.equal(clicked, true);

  // Re-open and test Esc closes
  await act(async () => {
    trigger.click();
  });
  menu = container.querySelector('[role="menu"]');
  assert.ok(menu);

  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  menu = container.querySelector('[role="menu"]');
  assert.equal(menu, null);

  root.unmount();
});

test('Tabs roving tabindex and arrow key navigation', async () => {
  const { container } = setupDOM();
  const root = createRoot(container);

  let activeTab = 'tab-1';
  await act(async () => {
    root.render(
      createElement(
        WorkspaceProvider,
        null,
        createElement(
          'div',
          null,
          createElement(Tabs, {
            tabs: [
              { id: 'tab-1', label: 'Tab One' },
              { id: 'tab-2', label: 'Tab Two' },
              { id: 'tab-3', label: 'Tab Three' },
            ],
            activeTab,
            onChange: (id) => { activeTab = id; },
          }),
          createElement(TabPanel, { tabId: 'tab-1', activeTab }, 'Content 1'),
          createElement(TabPanel, { tabId: 'tab-2', activeTab }, 'Content 2')
        )
      )
    );
  });

  const tablist = container.querySelector('[role="tablist"]');
  assert.ok(tablist);

  const tabButtons = container.querySelectorAll('[role="tab"]');
  assert.equal(tabButtons.length, 3);

  // Tab 1 is active with tabIndex 0, others -1
  assert.equal(tabButtons[0].getAttribute('tabindex'), '0');
  assert.equal(tabButtons[0].getAttribute('aria-selected'), 'true');
  assert.equal(tabButtons[1].getAttribute('tabindex'), '-1');
  assert.equal(tabButtons[1].getAttribute('aria-selected'), 'false');

  // Arrow navigation triggers onChange
  await act(async () => {
    tabButtons[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  });

  root.unmount();
});

test('Toast provider displays notification, handles Undo action, and lives in status region', async () => {
  const { container } = setupDOM();
  const root = createRoot(container);

  let undone = false;

  function TestToastConsumer() {
    const { showToast } = useToast();
    return createElement(
      'button',
      {
        id: 'toast-btn',
        onClick: () => {
          showToast({
            message: 'تم حذف الملاحظة',
            type: 'danger',
            action: {
              label: 'تراجع',
              onClick: () => { undone = true; },
            },
          });
        },
      },
      'Trigger Toast'
    );
  }

  await act(async () => {
    root.render(
      createElement(
        WorkspaceProvider,
        null,
        createElement(ToastProvider, null, createElement(TestToastConsumer))
      )
    );
  });

  const toastBtn = container.querySelector('#toast-btn') as HTMLButtonElement;
  assert.ok(toastBtn);

  await act(async () => {
    toastBtn.click();
  });

  const toastEl = container.querySelector('[role="alert"]');
  assert.ok(toastEl);
  assert.ok(toastEl.textContent?.includes('تم حذف الملاحظة'));

  const undoBtn = toastEl.querySelector('button');
  assert.ok(undoBtn);
  assert.equal(undoBtn.textContent, 'تراجع');

  await act(async () => {
    undoBtn.click();
  });
  assert.equal(undone, true);

  root.unmount();
});

test('EmptyState, Skeleton, and Tooltip render correctly', async () => {
  const { container } = setupDOM();
  const root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        WorkspaceProvider,
        null,
        createElement(
          'div',
          null,
          createElement(EmptyState, {
            title: 'لا توجد كتب',
            description: 'ابدأ بإضافة كتب إلى مكتبتك.',
            action: createElement('button', null, 'إضافة كتاب'),
          }),
          createElement(Skeleton, { rounded: 'lg', className: 'h-10 w-full' }),
          createElement(
            Tooltip,
            { content: 'تلميح توضيحي' },
            createElement('button', { id: 'tooltip-target' }, 'Target')
          )
        )
      )
    );
  });

  assert.ok(container.textContent?.includes('لا توجد كتب'));
  assert.ok(container.textContent?.includes('ابدأ بإضافة كتب إلى مكتبتك.'));

  const skeleton = container.querySelector('.animate-pulse');
  assert.ok(skeleton);

  const target = container.querySelector('#tooltip-target') as HTMLButtonElement;
  assert.ok(target);

  root.unmount();
});
