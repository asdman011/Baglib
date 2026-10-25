import { it } from 'node:test';
import assert from 'node:assert/strict';
import { installPdfDiagnosticFilter } from '../../src/main/services/digital/pdf-diagnostics';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { buildSync } from 'esbuild';

it('filters exact PDF notices on both logger channels but preserves contextual warnings and errors', () => {
  const messages: unknown[][] = [];
  const logger = { log: (...args: unknown[]) => { messages.push(args); }, warn: (...args: unknown[]) => { messages.push(args); }, error: (...args: unknown[]) => { messages.push(args); } };
  const originalError = logger.error;
  const originalLog = logger.log;
  const originalWarn = logger.warn;
  const restore = installPdfDiagnosticFilter(logger);
  logger.log('Warning: Ran out of space in font private use area.');
  logger.warn('Warning: Empty "FlateDecode" stream.');
  logger.warn('Indexing all PDF objects');
  assert.equal(messages.length, 0);
  logger.warn('Unexpected PDF failure');
  logger.log('Warning: Empty "FlateDecode" stream.', { file: 'كتاب.pdf' });
  logger.error('Warning: Empty "FlateDecode" stream.');
  logger.warn(new Error('Read failure'));
  assert.equal(messages.length, 4);
  assert.equal(logger.error, originalError);
  restore();
  assert.equal(logger.log, originalLog);
  assert.equal(logger.warn, originalWarn);
});

it('installs the filter in the real metadata-worker entry without hiding worker errors', async () => {
  const root = path.resolve('.baglib-data/pdf-diagnostics-tests');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, 'run-'));
  let worker: Worker | undefined;
  try {
    const entry = path.join(directory, 'worker.cjs');
    buildSync({ stdin: { contents: `require(${JSON.stringify(path.resolve('src/main/metadata-worker.ts'))}); console.log('Warning: Ran out of space in font private use area.'); console.warn('Warning: Empty "FlateDecode" stream.'); console.log('Visible diagnostic'); console.error('Visible parser error'); require('node:worker_threads').parentPort.close();`, resolveDir: process.cwd() }, outfile: entry, bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
    worker = new Worker(entry, { stdout: true, stderr: true });
    let stdout = '';
    let stderr = '';
    worker.stdout.on('data', data => { stdout += data.toString(); });
    worker.stderr.on('data', data => { stderr += data.toString(); });
    const [code] = await once(worker, 'exit');
    assert.equal(code, 0);
    assert.equal(stdout.trim(), 'Visible diagnostic');
    assert.equal(stderr.trim(), 'Visible parser error');
  } finally { await worker?.terminate(); await rm(directory, { recursive: true, force: true }); }
});
