import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelledImport, importResultCounts, summarizeImports } from '../../src/shared/import-batch';
import type { DigitalImportResult } from '../../src/shared/types/digital-file';
import { DigitalImportPipelineService } from '../../src/main/services/digital/digital-import-pipeline.service';

const result = (name: string, extra: Partial<DigitalImportResult> = {}): DigitalImportResult => ({ filePath: name, fileName: name, fileSizeBytes: 12, success: true, ...extra });

test('empty import summary has no completed or failed items', () => {
  assert.deepEqual(importResultCounts([]), { imported: 0, duplicates: 0, cancelled: 0, failures: 0 });
  assert.equal(summarizeImports([]).totalFiles, 0);
});

test('cancelled items are skipped, distinct from duplicates and failures', () => {
  const results = [result('one'), result('duplicate', { skipped: true }), cancelledImport('later', 'later'), result('broken', { success: false })];
  const before = structuredClone(results);
  assert.deepEqual(importResultCounts(results), { imported: 1, duplicates: 1, cancelled: 1, failures: 1 });
  const summary = summarizeImports(results, true);
  assert.equal(summary.successfulImports, 1);
  assert.equal(summary.skippedImports, 2);
  assert.equal(summary.failedImports, 1);
  assert.equal(summary.totalFiles, 4);
  assert.equal(summary.bulkAutoFillSuppressed, true);
  assert.deepEqual(results, before);
});

test('legacy results without cancellation flags keep their duplicate meaning', () => {
  assert.deepEqual(importResultCounts([result('legacy', { skipped: true })]), { imported: 0, duplicates: 1, cancelled: 0, failures: 0 });
});

test('a pre-cancelled batch never starts a file', async () => {
  const controller = new AbortController();
  controller.abort();
  const pipeline = new DigitalImportPipelineService();
  pipeline.importFile = async () => { throw new Error('Must not execute'); };
  const summary = await pipeline.importFiles([{ filePath: 'one.txt' }, { filePath: 'two.txt' }], undefined, controller.signal);
  assert.equal(summary.skippedImports, 2);
  assert.ok(summary.results.every(item => item.cancelled));
});

test('cancel during a file lets it finish and skips only later files', async () => {
  const controller = new AbortController();
  const pipeline = new DigitalImportPipelineService();
  const saved: string[] = [];
  pipeline.importFile = async options => {
    controller.abort();
    await Promise.resolve();
    saved.push(options.filePath);
    return result(options.filePath, { workId: 'persisted-one' });
  };
  const summary = await pipeline.importFiles([{ filePath: 'one.txt' }, { filePath: 'two.txt' }, { filePath: 'three.txt' }], undefined, controller.signal);
  assert.deepEqual(saved, ['one.txt']);
  assert.equal(summary.results[0].workId, 'persisted-one');
  assert.equal(summary.successfulImports, 1);
  assert.equal(summary.skippedImports, 2);
  assert.equal(summary.failedImports, 0);
});

test('one failure does not prevent later items and progress reflects completed items', async () => {
  const pipeline = new DigitalImportPipelineService();
  pipeline.importFile = async options => {
    if (options.filePath === 'broken') throw new Error('read failed');
    return result(options.filePath);
  };
  const percentages: number[] = [];
  const summary = await pipeline.importFiles([{ filePath: 'broken' }, { filePath: 'good' }], event => percentages.push(event.progressPercentage));
  assert.equal(summary.successfulImports, 1);
  assert.equal(summary.failedImports, 1);
  assert.deepEqual(percentages, [0, 0, 50, 50, 50, 100]);
});

test('cancellation controllers isolate independent jobs', async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  const pipeline = new DigitalImportPipelineService();
  pipeline.importFile = async options => result(options.filePath);
  assert.equal((await pipeline.importFiles([{ filePath: 'one' }], undefined, cancelled.signal)).successfulImports, 0);
  assert.equal((await pipeline.importFiles([{ filePath: 'two' }], undefined, new AbortController().signal)).successfulImports, 1);
});
