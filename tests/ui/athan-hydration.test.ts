import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { useAthan } from '../../src/renderer/hooks/useAthan';
import { buildPrayerStatusSnapshot, DEFAULT_ATHAN_SETTINGS } from '../../src/shared/athan-calculator';
import type { AthanAlertPayload } from '../../src/shared/types/athan';

test('clock hydrates consistently and only one audio owner plays a broadcast/test alert', async () => {
  let owner: ReturnType<typeof useAthan>;
  function Probe() {
    owner = useAthan(true);
    useAthan(false);
    return React.createElement('span', null, owner.snapshot.nextPrayer.countdownFormatted);
  }
  const html = renderToString(React.createElement(Probe));
  const { window } = parseHTML(`<html><body><div id="root">${html}</div></body></html>`);
  const previous = new Map(['window', 'document', 'Audio', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const listeners = new Set<(alert: AthanAlertPayload) => void>();
  const snapshot = buildPrayerStatusSnapshot(DEFAULT_ATHAN_SETTINGS, new Date('2026-10-26T16:00:00Z'));
  const alert: AthanAlertPayload = { id: 'same-event', type: 'athan', prayer: 'asr', scheduledTime: '15:00', timestamp: '2026-10-26T16:00:00Z' };
  let plays = 0;
  Object.defineProperty(window, 'electronAPI', { value: { athan: { getState: async () => snapshot, onStateChanged: () => () => {}, onAlert: (callback: (alert: AthanAlertPayload) => void) => { listeners.add(callback); return () => listeners.delete(callback); }, triggerTestAlert: async () => { for (const listener of listeners) listener(alert); return alert; } } } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: window.document });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: class { volume = 1; currentTime = 0; onended = null; onerror = null; play() { plays++; return Promise.resolve(); } pause() {} } });
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => { root = hydrateRoot(window.document.getElementById('root')!, React.createElement(Probe), { onRecoverableError: error => errors.push(error) }); });
    assert.deepEqual(errors, []);
    assert.equal(window.document.querySelector('span')?.textContent, snapshot.nextPrayer.countdownFormatted);
    await act(async () => { await owner!.triggerTestAlert('asr'); });
    assert.equal(plays, 1);
    await act(async () => { for (const listener of listeners) listener(alert); });
    assert.equal(plays, 1, 'repeated event ID is deduplicated');
  } finally {
    await act(async () => root?.unmount());
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
});
