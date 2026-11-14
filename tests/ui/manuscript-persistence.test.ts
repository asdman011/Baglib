import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createManuscriptPersistence } from '../../src/renderer/components/research/manuscript-persistence';
import type { ManuscriptDocument, ManuscriptSave } from '../../src/shared/manuscripts';
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture() {
  const saves: ManuscriptSave[] = [], events: string[] = [], errors: unknown[] = [];
  const api = {
    async save(input: ManuscriptSave) { saves.push(input); events.push(`save:${input.snapshot}`); return {} as ManuscriptDocument; },
    async checkpoint(id: string) { events.push(`checkpoint:${id}`); return true; },
  };
  return { api, saves, events, errors, controller: createManuscriptPersistence(api, 'doc', error => errors.push(error)) };
}
test('autosave debounces 1500ms after the latest edit and never checkpoints', async context => {
  context.mock.timers.enable({ apis: ['setTimeout','setInterval'] });
  const { controller, saves, events } = fixture();
  controller.change('first'); context.mock.timers.tick(1000); await settle(); assert.equal(saves.length, 0);
  controller.change('second'); context.mock.timers.tick(1499); await settle(); assert.equal(saves.length, 0);
  context.mock.timers.tick(1); await settle(); assert.equal(saves[0].snapshot, 'second'); assert.deepEqual(events, ['save:second']);
  await controller.close();
});
test('ten autosaves have zero checkpoint calls', async context => {
  context.mock.timers.enable({ apis: ['setTimeout','setInterval'] });
  const { controller, saves, events } = fixture();
  for (let i = 0; i < 10; i++) { controller.change(String(i)); context.mock.timers.tick(1500); await settle(); }
  assert.equal(saves.length, 10); assert.equal(events.filter(event => event.startsWith('checkpoint')).length, 0);
  await controller.close();
});
for (const action of ['explicitSave','documentSwitch','close'] as const) test(`${action} flushes before checkpoint`, async context => {
  context.mock.timers.enable({ apis: ['setTimeout','setInterval'] });
  const { controller, events } = fixture();
  controller.change('latest'); await controller[action](); assert.deepEqual(events, ['save:latest','checkpoint:doc']);
  if (action === 'explicitSave') await controller.close();
  else { context.mock.timers.tick(600000); await settle(); assert.equal(events.length, 2); assert.throws(() => controller.change('late')); }
});
test('ten-minute timer checkpoints after saving the current content', async context => {
  context.mock.timers.enable({ apis: ['setTimeout','setInterval'] });
  const { controller, events } = fixture();
  controller.change('timer'); context.mock.timers.tick(599999); await settle();
  assert.deepEqual(events, ['save:timer']); context.mock.timers.tick(1); await settle();
  assert.deepEqual(events, ['save:timer','checkpoint:doc']); await controller.close();
});
test('in-flight save preserves newer edits and checkpoints after their queued save', async context => {
  context.mock.timers.enable({ apis: ['setTimeout','setInterval'] });
  const { api, events, errors } = fixture();
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const originalSave = api.save;
  let calls = 0;
  api.save = async input => { calls++; if (calls === 1) await waiting; return originalSave(input); };
  const controller = createManuscriptPersistence(api, 'other', error => errors.push(error));
  controller.change('first'); context.mock.timers.tick(1500); await settle();
  controller.change('second'); const closing = controller.close(); release(); await closing;
  assert.deepEqual(events, ['save:first','save:second','checkpoint:other']); assert.deepEqual(errors, []);
});
test('failed autosave reports an error, retains the draft and can be retried on explicit save', async context => {
  context.mock.timers.enable({ apis: ['setTimeout','setInterval'] });
  const { api, events, errors } = fixture(); let fail = true; const original = api.save;
  api.save = async input => { if (fail) throw Error('disk-full'); return original(input); };
  const controller = createManuscriptPersistence(api, 'retry', error => errors.push(error));
  controller.change('retained'); context.mock.timers.tick(1500); await settle();
  assert.equal(errors.length, 1); assert.equal(events.length, 0);
  await assert.rejects(controller.close(), /disk-full/);
  fail = false; await controller.explicitSave(); assert.deepEqual(events, ['save:retained','checkpoint:retry']); await controller.close();
});
test('a failed checkpoint can be retried and never overlaps a save', async context => {
  context.mock.timers.enable({ apis: ['setTimeout','setInterval'] });
  const { api, events, errors } = fixture(); let fail = true; const original = api.checkpoint;
  api.checkpoint = async id => { if (fail) throw Error('busy'); return original(id); };
  const controller = createManuscriptPersistence(api, 'retry', error => errors.push(error));
  controller.change('content'); await assert.rejects(controller.explicitSave());
  fail = false; await controller.close(); assert.deepEqual(events, ['save:content','checkpoint:retry']);
});
