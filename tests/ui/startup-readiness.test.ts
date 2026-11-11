import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { translations } from '../../src/renderer/translations';
import { readReadiness } from '../../src/renderer/hooks/useReadiness';
import { StartupSplash } from '../../src/renderer/components/StartupSplash';

// KEY-150: the splash runs the app's real readiness probes and shows a failure instead of hiding it.
const healthy = { getFtsStats: async () => ({ databaseReady: true, indexReady: true, booksCount: 0, pagesCount: 0 }), pdfEditor: { engineStatus: async () => ({ ok: true, data: { configured: true, status: 'stopped' } }) } };
const noEngine = { ...healthy, pdfEditor: { engineStatus: async () => ({ ok: true, data: { configured: false, status: 'stopped' } }) } };
const noIndex = { ...healthy, getFtsStats: async () => ({ databaseReady: true, indexReady: false, booksCount: 0, pagesCount: 0 }) };

describe('Startup readiness (KEY-150)', () => {
  it('readReadiness reports each probe', async () => {
    assert.deepEqual(await readReadiness(healthy as never), { database: true, index: true, pdf: true });
    assert.deepEqual(await readReadiness(noEngine as never), { database: true, index: true, pdf: false });
    assert.deepEqual(await readReadiness({ getFtsStats: async () => { throw new Error('closed'); } } as never), { database: false, index: false, pdf: false });
  });

  for (const lang of ['ar', 'en'] as const) {
    for (const [name, api, expectIssue] of [['healthy', healthy, false], ['missing optional PDF engine', noEngine, false], ['broken search index', noIndex, true]] as const) {
      it(`splash in ${lang} with a ${name} app ${expectIssue ? 'shows the problem' : 'shows no problem'} and still completes`, async () => {
        const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
        const saved = new Map(['window', 'document', 'React', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
        for (const [key, value] of Object.entries({ window, document: window.document, React, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        Object.defineProperty(window, 'electronAPI', { configurable: true, value: api });
        let completed = 0;
        const root = createRoot(window.document.getElementById('root')!);
        try {
          await act(async () => root.render(createElement(StartupSplash, { onComplete: () => { completed++; }, minDurationMs: 0, initialLang: lang, initialTheme: 'light' })));
          await act(async () => new Promise(resolve => setTimeout(resolve, 900)));
          const issues = window.document.querySelector('[data-splash-issues]');
          if (expectIssue) {
            assert.ok(issues, 'issue list shown');
            assert.equal(issues.getAttribute('role'), 'alert');
            assert.ok(issues.textContent?.includes(translations[lang].feedbackIndexUnavailable));
            assert.ok(window.document.body.textContent?.includes(translations[lang].feedbackLimited));
          } else {
            assert.equal(issues, null);
          }
          await act(async () => new Promise(resolve => setTimeout(resolve, 2500)));
          assert.equal(completed, 1, 'the splash still hands over to the app exactly once');
        } finally {
          await act(async () => root.unmount());
          for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
        }
      });
    }
  }
});
