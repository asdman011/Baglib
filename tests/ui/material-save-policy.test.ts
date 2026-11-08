import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { useMaterialSave } from '../../src/renderer/hooks/useMaterialSave';
import { AFTER_CHANGE_QUIET_MS, type SavePolicy } from '../../src/shared/material-save';

test('automatic PDF writes wait for policy and respect mode/book changes', async () => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  const previous = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const oldAPI = Object.getOwnPropertyDescriptor(window, 'electronAPI');
  let loadPolicy!: (value: unknown) => void;
  const writes: string[] = [];
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { materialSave: {
    policy: () => new Promise(resolve => { loadPolicy = resolve; }),
    status: async () => ({ ok: true, data: { supported: true, writable: true, pending: true, incident: null, lastSavedAt: null, backup: null } }),
    save: async (work: string) => { writes.push(work); return { ok: true, data: { written: true } }; },
  } } });
  let current!: ReturnType<typeof useMaterialSave>;
  let workId = 'first';
  function Harness() { current = useMaterialSave(workId, true); return null; }
  const root = createRoot(window.document.getElementById('root')!);
  const settle = async () => act(async () => new Promise(resolve => setTimeout(resolve, AFTER_CHANGE_QUIET_MS + 80)));
  const mode = async (value: SavePolicy['mode']) => act(async () => {
    const event = new window.Event('baglib:save-policy');
    Object.defineProperty(event, 'detail', { value: { mode: value, intervalMinutes: 1 } });
    window.dispatchEvent(event);
  });
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => current.changed());
    await settle();
    assert.deepEqual(writes, []);
    await mode('manual');
    await act(async () => loadPolicy({ ok: true, data: { policy: { mode: 'after-change', intervalMinutes: 1 } } }));
    await act(async () => current.changed());
    await settle();
    assert.deepEqual(writes, [], 'late policy load must not override a newer manual choice');
    await mode('after-change');
    await act(async () => current.changed());
    await mode('manual');
    await settle();
    assert.deepEqual(writes, [], 'manual choice cancels the queued automatic write');
    await mode('after-change');
    await act(async () => current.changed());
    workId = 'second';
    await act(async () => root.render(createElement(Harness)));
    await settle();
    assert.deepEqual(writes, [], 'switching books clears an old queued write');
    await act(async () => current.changed());
    await settle();
    assert.deepEqual(writes, ['second']);
    await mode('manual');
    await act(async () => current.saveNow());
    assert.deepEqual(writes, ['second', 'second']);
  } finally {
    await act(async () => root.unmount());
    if (oldAPI) Object.defineProperty(window, 'electronAPI', oldAPI); else Reflect.deleteProperty(window, 'electronAPI');
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
