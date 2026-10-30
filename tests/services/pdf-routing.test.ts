import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPrimaryPdfEngine } from '../../src/main/services/pdf-editor/routing';

test('PDF primary routing routes strictly through Stirling-PDF as sole primary engine', async () => {
  const calls: string[] = [];
  const options = {
    stirlingSupported: true,
    stirling: async () => { calls.push('stirling'); return 'stirling'; },
  };
  assert.equal(await runPrimaryPdfEngine(options), 'stirling');
  assert.deepEqual(calls, ['stirling']);

  for (const message of ['cancelled', 'invalid-output', 'engine-failed', 'permission-denied']) {
    calls.length = 0;
    await assert.rejects(runPrimaryPdfEngine({ ...options, stirling: async () => { throw new Error(message); } }), { message });
  }
});
