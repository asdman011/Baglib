import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePdfAction } from '../../src/shared/pdf-actions';

test('saved actions reject unknown tools, paths, nested actions and malformed options', () => {
  const valid = { id: 'action-1', name: 'دراسة — Study', steps: [{ tool: 'compress', options: { optimizeLevel: 2 } }, { tool: 'page-numbers', options: {} }] };
  assert.deepEqual(validatePdfAction(valid), valid);
  for (const step of [{ tool: 'saved-action', options: {} }, { tool: 'export-text', options: {} }, { tool: 'compress', options: { filename: 'secret' } }, { tool: 'compress', options: { optimizeLevel: 100 } }, { tool: 'watermark', options: { text: { nested: true } } }, { tool: 'ocr', options: { languages: 'fra' } }]) {
    assert.throws(() => validatePdfAction({ ...valid, steps: [step, valid.steps[1]] }), /invalid-request/u);
  }
  assert.throws(() => validatePdfAction({ ...valid, steps: [] }));
  assert.throws(() => validatePdfAction({ ...valid, name: '' }));
});

import path from 'node:path';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { PdfEditorJobs } from '../../src/main/services/pdf-editor/jobs';
import { fileSha256 } from '../../src/main/services/pdf-editor/source';
import { createTestDatabase } from '../helpers/test-db';
import { makePagePdf } from '../helpers/pdf-pages';

test('one action job consumes preceding staged output in order and failed runs keep the previous working PDF', async () => {
  const directory = await mkdtemp(path.resolve('.baglib-data/key271-actions-test-'));
  const db = createTestDatabase();
  try {
    const filename = path.join(directory, 'source.pdf');
    const original = makePagePdf(1, Buffer.alloc(0));
    await writeFile(filename, original);
    const seen: string[] = [];
    let fail = false;
    const controller = new PdfEditorJobs(db, path.join(directory, 'jobs'), async input => {
      seen.push(input.operation);
      const bytes = await readFile(input.filename);
      assert.equal(await fileSha256(input.filename), input.expectedHash);
      if (seen.length === 2) assert.match(bytes.toString(), /first-step/u);
      if (seen.length === 5) assert.match(bytes.toString(), /second-step$/u, 'failed partial output must not replace the working PDF');
      if (fail && input.operation === 'page-numbers') throw new Error('engine-failed');
      const output = path.join(path.dirname(input.output), 'document.pdf');
      await writeFile(output, Buffer.concat([bytes, Buffer.from(input.operation === 'compress' ? '\n%first-step' : '\n%second-step')]));
      return { outputs: [{ filename: 'document.pdf', format: 'pdf', bytes: (await readFile(output)).length, sha256: await fileSha256(output) }] };
    });
    const session = await controller.openPath(1, filename);
    const action = { id: 'test', name: 'دراسة Study', steps: [{ tool: 'compress', options: {} }, { tool: 'page-numbers', options: {} }] };
    const wait = async (id: string) => {
      for (let i = 0; i < 200 && controller.status(1, id).state === 'running'; i++) await new Promise(resolve => setTimeout(resolve, 10));
      return controller.status(1, id);
    };
    const job = await controller.start(1, { sessionId: session.id, operation: 'saved-action', payload: { action }, language: 'ar' });
    const done = await wait(job.id);
    assert.equal(done.state, 'completed');
    assert.deepEqual(seen, ['compress', 'page-numbers']);
    assert.equal(done.outputs?.length, 1);
    const staged = await controller.output(1, done.id);
    const previous = await readFile(staged.filename);
    assert.match(previous.toString(), /first-step[\s\S]*second-step/u);
    assert.deepEqual(await readFile(filename), original);
    fail = true;
    const failed = await controller.start(1, { sessionId: session.id, operation: 'saved-action', payload: { action: { ...action, steps: [...action.steps, action.steps[0]] } }, language: 'en' });
    const stopped = await wait(failed.id);
    assert.equal(stopped.state, 'failed');
    assert.equal(stopped.actionStep, 2);
    assert.deepEqual(seen, ['compress', 'page-numbers', 'compress', 'page-numbers']);
    assert.deepEqual(await readFile(filename), original);
    assert.deepEqual(await readFile(staged.filename), previous);
    const inspect = await controller.start(1, { sessionId: session.id, operation: 'compress', language: 'en' });
    assert.equal((await wait(inspect.id)).state, 'completed');
    await controller.close(1, session.id);
  } finally {
    db.close();
    assert.ok(directory.startsWith(path.resolve('.baglib-data') + path.sep));
    await rm(directory, { recursive: true, force: true });
  }
});
