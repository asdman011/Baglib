import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { StudyDeepLinkBridge } from '../../src/renderer/components/notes/StudyDeepLinkBridge';
import { translations } from '../../src/renderer/translations';

for (const language of ['ar', 'en'] as const) {
  test(`StudyDeepLinkBridge notice dismisses, times out, pauses on hover/focus, and re-shows in ${language}`, async context => {
    context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });

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
      CustomEvent: MockCustomEvent,
    };
    for (const [key, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }

    let onNavigateCallback: ((target: string) => void) | null = null;
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getAllBooks: async () => [],
        getAllNotes: async () => [],
        getCategoryTree: async () => [],
        studyNotes: {
          list: async () => [{ id: 'valid-note', title: 'Valid Note', content: 'content', aliases: [], tags: [] }],
          onChanged: () => () => {},
        },
        knowledge: { getAll: async () => [] },
        onStudyNavigate: (cb: (target: string) => void) => {
          onNavigateCallback = cb;
          return () => { onNavigateCallback = null; };
        },
      },
    });

    let workspace!: ReturnType<typeof useWorkspace>;
    function Harness() {
      workspace = useWorkspace();
      return createElement('div', { dir: workspace.dir }, createElement(StudyDeepLinkBridge));
    }

    const root = createRoot(window.document.getElementById('root')!);

    try {
      await act(async () => {
        root.render(createElement(WorkspaceProvider, null, createElement(Harness)));
      });
      if (language === 'en' && workspace.lang !== 'en') {
        await act(async () => {
          workspace.toggleLanguage();
        });
      } else if (language === 'ar' && workspace.lang !== 'ar') {
        await act(async () => {
          workspace.toggleLanguage();
        });
      }

      // 1. Initially no alert is visible
      assert.equal(window.document.querySelector('[data-study-link-missing]'), null);

      // 2. Dispatch a missing deep link -> notice appears
      await act(async () => {
        onNavigateCallback?.('baglib:note:non-existent-note');
      });
      // Let microtasks settle for promise rejection in bridge
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const alert = window.document.querySelector('[data-study-link-missing]');
      assert.ok(alert, 'Notice element should be in DOM');
      assert.equal(alert.getAttribute('role'), 'alert');
      assert.ok(alert.textContent?.includes(translations[language].studyLinkTargetMissing));

      const dismissBtn = alert.querySelector('[data-study-link-dismiss]') as HTMLButtonElement | null;
      assert.ok(dismissBtn, 'Close button should be present in notice');
      assert.equal(dismissBtn.getAttribute('aria-label'), translations[language].studyLinkDismiss);

      // 3. Test keyboard reachability and activation (Enter / Space)
      assert.equal(dismissBtn.tagName, 'BUTTON');
      assert.equal(dismissBtn.getAttribute('type'), 'button');
      assert.equal(dismissBtn.disabled, false);
      // Simulate Space / Enter key triggering click on the focused button
      await act(async () => {
        const keyEvent = new window.Event('keydown', { bubbles: true, cancelable: true });
        Object.assign(keyEvent, { key: 'Enter' });
        dismissBtn.dispatchEvent(keyEvent);
        dismissBtn.click();
      });
      assert.equal(window.document.querySelector('[data-study-link-missing]'), null);

      // 4. A new missing link re-shows the notice
      await act(async () => {
        onNavigateCallback?.('baglib:note:another-missing-note');
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      assert.ok(window.document.querySelector('[data-study-link-missing]'));

      // 5. Test auto-dismiss timeout (8000ms): after 4000ms still visible, after 8000ms gone
      await act(async () => {
        context.mock.timers.tick(4000);
      });
      assert.ok(window.document.querySelector('[data-study-link-missing]'), 'Still visible at 4s');

      await act(async () => {
        context.mock.timers.tick(4100);
      });
      assert.equal(window.document.querySelector('[data-study-link-missing]'), null, 'Auto-dismissed after 8s');

      // 6. Test hover pause: notice appears, user hovers at 3s, stays 10s, unhovers, then auto-dismisses after remaining 5s
      await act(async () => {
        onNavigateCallback?.('baglib:note:third-missing-note');
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const hoverAlert = window.document.querySelector('[data-study-link-missing]') as HTMLElement;
      assert.ok(hoverAlert);

      // 3 seconds elapse
      await act(async () => {
        context.mock.timers.tick(3000);
      });
      assert.ok(window.document.querySelector('[data-study-link-missing]'));

      // Hover starts
      await act(async () => {
        hoverAlert.dispatchEvent(new window.Event('pointerenter', { bubbles: true }));
        hoverAlert.dispatchEvent(new window.Event('mouseenter', { bubbles: true }));
        hoverAlert.dispatchEvent(new window.Event('mouseover', { bubbles: true }));
      });

      // 10 seconds pass while hovered -> should NOT dismiss
      await act(async () => {
        context.mock.timers.tick(10000);
      });
      assert.ok(window.document.querySelector('[data-study-link-missing]'), 'Hover paused timer');

      // Unhover
      await act(async () => {
        hoverAlert.dispatchEvent(new window.Event('pointerleave', { bubbles: true }));
        hoverAlert.dispatchEvent(new window.Event('mouseleave', { bubbles: true }));
        hoverAlert.dispatchEvent(new window.Event('mouseout', { bubbles: true }));
      });

      // 4 seconds pass -> still visible (remaining was ~5s)
      await act(async () => {
        context.mock.timers.tick(4000);
      });
      assert.ok(window.document.querySelector('[data-study-link-missing]'), 'Still visible before remaining time');

      // 2 more seconds pass -> now auto-dismisses
      await act(async () => {
        context.mock.timers.tick(2000);
      });
      assert.equal(window.document.querySelector('[data-study-link-missing]'), null, 'Dismissed after remaining time elapsed');

      // 7. Test focus pause: notice appears, focus enters, stays 10s, leaves, then dismisses
      await act(async () => {
        onNavigateCallback?.('baglib:note:fourth-missing-note');
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const focusAlert = window.document.querySelector('[data-study-link-missing]') as HTMLElement;
      assert.ok(focusAlert);

      await act(async () => {
        context.mock.timers.tick(2000);
      });

      // Focus enters
      await act(async () => {
        focusAlert.dispatchEvent(new window.Event('focus', { bubbles: true }));
        focusAlert.dispatchEvent(new window.Event('focusin', { bubbles: true }));
      });

      // 10s pass while focused
      await act(async () => {
        context.mock.timers.tick(10000);
      });
      assert.ok(window.document.querySelector('[data-study-link-missing]'), 'Focus paused timer');

      // Focus leaves
      await act(async () => {
        const blurEvent = new window.Event('blur', { bubbles: true });
        Object.defineProperty(blurEvent, 'relatedTarget', { value: null });
        focusAlert.dispatchEvent(blurEvent);
        const focusoutEvent = new window.Event('focusout', { bubbles: true });
        Object.defineProperty(focusoutEvent, 'relatedTarget', { value: null });
        focusAlert.dispatchEvent(focusoutEvent);
      });

      // Advance remaining 6.5s
      await act(async () => {
        context.mock.timers.tick(6500);
      });
      assert.equal(window.document.querySelector('[data-study-link-missing]'), null, 'Dismissed after focus release');

      // 8. Test Escape key dismiss
      await act(async () => {
        onNavigateCallback?.('baglib:note:fifth-missing-note');
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const escapeAlert = window.document.querySelector('[data-study-link-missing]') as HTMLElement;
      assert.ok(escapeAlert);

      await act(async () => {
        const escEvent = new window.Event('keydown', { bubbles: true, cancelable: true });
        Object.assign(escEvent, { key: 'Escape' });
        escapeAlert.dispatchEvent(escEvent);
      });
      assert.equal(window.document.querySelector('[data-study-link-missing]'), null, 'Dismissed on Escape');

      // 9. Test sourceMissing event (baglib:study-source-missing)
      await act(async () => {
        window.dispatchEvent(new window.Event('baglib:study-source-missing'));
      });
      const sourceAlert = window.document.querySelector('[data-study-link-missing]');
      assert.ok(sourceAlert);
      assert.ok(sourceAlert.textContent?.includes(translations[language].studyLinkFileMissing));

      // 10. A new link still clears any old notice
      await act(async () => {
        window.dispatchEvent(new window.Event('baglib:study-source-missing'));
      });
      assert.ok(window.document.querySelector('[data-study-link-missing]'));

      // Dispatch a valid note link
      await act(async () => {
        onNavigateCallback?.('note:valid-note');
      });
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
      assert.equal(window.document.querySelector('[data-study-link-missing]'), null, 'New valid link cleared old notice');

    } finally {
      await act(async () => {
        root.render(null);
      });
      context.mock.timers.reset();
    }
  });
}
