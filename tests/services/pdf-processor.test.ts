import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import type { PdfEngineTools } from '../../src/main/services/pdf-editor/python';
import { writeFile, mkdir, utimes, readFile, readdir, unlink } from 'node:fs/promises';
import {
  StirlingProcessorService,
  type StirlingPipeline,
  sanitizePipelineSteps,
  exportPipelineAutomateJson,
  exportPipelineFolderScanJson,
  importPipelineJson,
} from '../../src/main/services/pdf-editor/processor';

test('fresh processor never fabricates activity or watches personal folders', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-processor-empty-'));
  try {
    const service = new StirlingProcessorService(directory);
    assert.deepEqual(await service.getWatchedFolders(), []);
    assert.equal((await service.getTelemetry()).processedToday, 0);
    await service.incrementTelemetryCount(2);
    assert.equal((await service.getTelemetry()).processedToday, 2);
    await writeFile(path.join(directory, 'telemetry.json'), JSON.stringify({ today: '2000-01-01', count: 235 }));
    assert.equal((await service.getTelemetry()).processedToday, 0);
    await service.incrementTelemetryCount();
    assert.equal((await service.getTelemetry()).processedToday, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('cancelled pipeline never discovers the JVM or reads missing inputs', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(StirlingProcessorService.getInstance().executePipeline({} as PdfEngineTools, ['missing.pdf'], { name: 'Cancelled', pipeline: [] }, controller.signal), /^Error: cancelled$/u);
});

test('standalone tools call their endpoint directly and preserve non-PDF output', async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-processor-single-'));
  let outputPath: string | undefined;
  try {
    const source = path.join(directory, 'source.pdf');
    await writeFile(source, '%PDF-1.7\n');
    context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      assert.equal(url, 'http://127.0.0.1:56789/api/v1/convert/pdf/markdown');
      const form = init.body as FormData;
      assert.equal(form.has('json'), false);
      assert.equal(form.get('pageNumbers'), 'all');
      assert.equal((form.get('fileInput') as File).name, 'source.pdf');
      return new Response('# Converted\n', { headers: { 'content-type': 'text/markdown', 'content-disposition': 'attachment; filename="converted.md"' } });
    });
    const service = new StirlingProcessorService(directory);
    const result = await service.executePipeline({ stirlingUrl: 'http://127.0.0.1:56789' } as PdfEngineTools, [source], {
      name: 'Standalone markdown', singleTool: true, pipeline: [{ operation: '/api/v1/convert/pdf/markdown', parameters: { pageNumbers: 'all' } }],
    }, new AbortController().signal);
    outputPath = result.outputPath;
    assert.equal(await readFile(outputPath, 'utf8'), '# Converted\n');
    assert.ok(outputPath.endsWith('.md'));
    assert.equal((await service.getTelemetry()).processedToday, 1);
  } finally {
    if (outputPath) await unlink(outputPath);
    await rm(directory, { recursive: true, force: true });
  }
});

test('kept watch inputs skip unchanged content across restarts and retry changed content or steps', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-processor-receipts-'));
  try {
    const inbox = path.join(directory, 'inbox');
    await mkdir(inbox);
    const filename = path.join(inbox, 'source.pdf');
    const changeSource = async (content: string) => {
      await writeFile(filename, content);
      const past = new Date(Date.now() - 5000);
      await utimes(filename, past, past);
    };
    await changeSource('first');
    let calls = 0;
    const createService = () => {
      const service = new StirlingProcessorService(directory);
      service.executePipeline = async () => {
        calls++;
        const outputPath = path.join(directory, 'staged.pdf');
        await writeFile(outputPath, 'generated');
        return { outputPath, format: 'pdf', bytes: 9, sha256: '' };
      };
      return service;
    };
    const service = createService();
    const now = new Date().toISOString();
    const pipeline: StirlingPipeline = { id: 'keep', name: 'Keep', trigger: 'folder', active: true, afterProcessing: 'keep', createdAt: now, updatedAt: now, steps: [{ id: 'rotate', name: 'Rotate', operation: '/api/v1/general/rotate-pdf', parameters: { angle: 90 } }] };
    await service.savePipeline(pipeline);
    await service.saveWatchedFolders([{ id: 'inbox', name: 'Inbox', inputPath: inbox, outputPath: path.join(directory, 'outbox'), pipelineId: pipeline.id, status: 'watching', processedCount: 0 }]);
    assert.equal((await service.checkWatchedFolders({} as PdfEngineTools)).processed, 1);
    assert.equal((await service.checkWatchedFolders({} as PdfEngineTools)).processed, 0);
    const restarted = createService();
    assert.equal((await restarted.checkWatchedFolders({} as PdfEngineTools)).processed, 0);
    await changeSource('second');
    assert.equal((await restarted.checkWatchedFolders({} as PdfEngineTools)).processed, 1);
    pipeline.steps[0].parameters.angle = 180;
    await restarted.savePipeline(pipeline);
    assert.equal((await restarted.checkWatchedFolders({} as PdfEngineTools)).processed, 1);
    assert.equal(calls, 3);
    assert.equal(await readFile(filename, 'utf8'), 'second');
    assert.equal((await restarted.getWatchedFolders())[0].processedCount, 3);
    pipeline.active = false;
    await restarted.savePipeline(pipeline);
    await changeSource('third');
    assert.equal((await restarted.checkWatchedFolders({} as PdfEngineTools)).processed, 0);
    pipeline.active = true;
    pipeline.afterProcessing = 'archive';
    await restarted.savePipeline(pipeline);
    const execute = restarted.executePipeline.bind(restarted);
    restarted.executePipeline = async (...args) => {
      const result = await execute(...args);
      await changeSource('edited while processing');
      return result;
    };
    const changedDuringJob = await restarted.checkWatchedFolders({} as PdfEngineTools);
    assert.equal(changedDuringJob.processed, 0);
    assert.ok(changedDuringJob.errors.some(error => error.includes('source-changed')));
    assert.equal(await readFile(filename, 'utf8'), 'edited while processing');
    await assert.rejects(readFile(path.join(inbox, '_archive', 'source.pdf')), /ENOENT/u);
    let notifyStarted!: () => void;
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    let activeSignal: AbortSignal | undefined;
    const lateOutput = path.join(directory, 'late.pdf');
    restarted.executePipeline = async (_tools, _files, _config, signal) => {
      activeSignal = signal;
      await writeFile(lateOutput, 'late generated output');
      notifyStarted();
      await gate;
      return { outputPath: lateOutput, format: 'pdf', bytes: 21, sha256: '' };
    };
    const running = restarted.checkWatchedFolders({} as PdfEngineTools);
    await started;
    const stopping = restarted.stopWatchedFoldersDaemon();
    assert.equal(activeSignal?.aborted, true);
    finish();
    await stopping;
    assert.deepEqual(await running, { processed: 0, errors: [] });
    assert.equal(await readFile(filename, 'utf8'), 'edited while processing');
    await assert.rejects(readFile(lateOutput), /ENOENT/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('overlapping watcher ticks share a single scan until it finishes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-processor-scan-'));
  try {
    const service = new StirlingProcessorService(directory);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let notifyStarted!: () => void;
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    let scans = 0;
    service.getWatchedFolders = async () => { scans++; notifyStarted(); await gate; return []; };
    service.listPipelines = async () => [];
    const first = service.checkWatchedFolders({} as PdfEngineTools);
    const second = service.checkWatchedFolders({} as PdfEngineTools);
    assert.equal(first, second);
    await started;
    assert.equal(scans, 1);
    release();
    assert.deepEqual(await first, { processed: 0, errors: [] });
    await service.checkWatchedFolders({} as PdfEngineTools);
    assert.equal(scans, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('watch archival preserves older originals when filenames collide', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-processor-archive-'));
  try {
    const inbox = path.join(directory, 'inbox');
    const archive = path.join(inbox, '_archive');
    await mkdir(archive, { recursive: true });
    await writeFile(path.join(archive, 'source.pdf'), 'older original');
    const filename = path.join(inbox, 'source.pdf');
    await writeFile(filename, 'new original');
    const past = new Date(Date.now() - 5000);
    await utimes(filename, past, past);
    const service = new StirlingProcessorService(directory);
    const now = new Date().toISOString();
    await service.savePipeline({ id: 'archive', name: 'Archive', trigger: 'folder', active: true, afterProcessing: 'archive', createdAt: now, updatedAt: now, steps: [] });
    await service.saveWatchedFolders([{ id: 'archive-inbox', name: 'Inbox', inputPath: inbox, outputPath: inbox, pipelineId: 'archive', status: 'watching', processedCount: 0 }]);
    service.executePipeline = async () => {
      const outputPath = path.join(directory, 'generated.pdf');
      await writeFile(outputPath, 'generated');
      return { outputPath, format: 'pdf', bytes: 9, sha256: '' };
    };
    assert.deepEqual(await service.checkWatchedFolders({} as PdfEngineTools), { processed: 1, errors: [] });
    const entries = await readdir(archive);
    assert.equal(entries.length, 2);
    assert.equal(await readFile(path.join(archive, 'source.pdf'), 'utf8'), 'older original');
    assert.deepEqual((await Promise.all(entries.map(entry => readFile(path.join(archive, entry), 'utf8')))).sort(), ['new original', 'older original']);
    await assert.rejects(readFile(filename), /ENOENT/u);
    await utimes(path.join(inbox, 'generated.pdf'), past, past);
    const restarted = new StirlingProcessorService(directory);
    restarted.executePipeline = async () => { throw new Error('generated output must not feed itself back'); };
    assert.deepEqual(await restarted.checkWatchedFolders({} as PdfEngineTools), { processed: 0, errors: [] });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('watch daemon respects ingestion policy, stops ticking, and can restart', async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-processor-daemon-'));
  const service = new StirlingProcessorService(directory);
  context.mock.timers.enable({ apis: ['setInterval'] });
  try {
    const policies = await service.getPolicies();
    let enabled = false;
    let scans = 0;
    service.getPolicies = async () => ({ ...policies, ingestion: { ...policies.ingestion, folderWatchEnabled: enabled } });
    service.checkWatchedFolders = async () => { scans++; return { processed: 0, errors: [] }; };
    const flush = () => new Promise<void>(resolve => setImmediate(resolve));
    service.startWatchedFoldersDaemon({} as PdfEngineTools, 10);
    context.mock.timers.tick(10);
    await flush();
    assert.equal(scans, 0);
    enabled = true;
    context.mock.timers.tick(10);
    await flush();
    assert.equal(scans, 1);
    await service.stopWatchedFoldersDaemon();
    context.mock.timers.tick(100);
    await flush();
    assert.equal(scans, 1);
    service.startWatchedFoldersDaemon({} as PdfEngineTools, 10);
    context.mock.timers.tick(10);
    await flush();
    assert.equal(scans, 2);
  } finally {
    await service.stopWatchedFoldersDaemon();
    context.mock.timers.reset();
    await rm(directory, { recursive: true, force: true });
  }
});

test('StirlingProcessorService manages pipelines, policies, watched folders, and telemetry', async () => {
  const service = StirlingProcessorService.getInstance();

  // 1. Check default pipelines exist
  const pipelines = await service.listPipelines();
  assert.ok(pipelines.length >= 3, 'Should have at least 3 default pipelines');
  assert.ok(pipelines.some(p => p.id === 'pipe-ocr-archive'), 'OCR pipeline should be present');
  assert.ok(pipelines.some(p => p.id === 'pipe-sanitize-compress'), 'Sanitize pipeline should be present');
  assert.ok(pipelines.some(p => p.id === 'pipe-legal-redact'), 'Legal redact pipeline should be present');

  // 2. Save a custom pipeline
  const customPipe: StirlingPipeline = {
    id: `pipe-test-${Date.now()}`,
    name: 'Test Custom Pipeline',
    description: 'A test pipeline chaining rotate and compress',
    trigger: 'manual',
    active: true,
    steps: [
      { id: 's1', operation: '/api/v1/general/rotate-pdf', name: 'Rotate 90', parameters: { angle: 90 } },
      { id: 's2', operation: '/api/v1/misc/compress-pdf', name: 'Compress Level 2', parameters: { optimizeLevel: 2 } },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const saved = await service.savePipeline(customPipe);
  assert.equal(saved.id, customPipe.id);
  assert.equal(saved.name, customPipe.name);
  assert.equal(saved.steps.length, 2);

  // List should now include custom pipeline
  const updatedList = await service.listPipelines();
  assert.ok(updatedList.some(p => p.id === customPipe.id), 'Saved custom pipeline should be listed');

  // 3. Delete custom pipeline
  const deleted = await service.deletePipeline(customPipe.id);
  assert.equal(deleted, true);

  const afterDeleteList = await service.listPipelines();
  assert.ok(!afterDeleteList.some(p => p.id === customPipe.id), 'Deleted pipeline should not be listed');

  // 4. Governance Policies
  const policies = await service.getPolicies();
  assert.ok(policies.ingestion, 'Policies should have ingestion rules');
  assert.ok(policies.security, 'Policies should have security rules');
  assert.ok(policies.compliance, 'Policies should have compliance rules');
  assert.ok(policies.routing, 'Policies should have routing rules');
  assert.ok(policies.retention, 'Policies should have retention rules');
  assert.equal(policies.compliance.enforcePdfA, true);

  // Update policies
  const updatedPolicies = await service.savePolicies({
    compliance: {
      ...policies.compliance,
      pdfAConformance: '3b',
    },
  });
  assert.equal(updatedPolicies.compliance.pdfAConformance, '3b');

  // Restore policy to default
  await service.savePolicies({
    compliance: {
      ...policies.compliance,
      pdfAConformance: '2b',
    },
  });

  // 5. Watched Folders
  const folders = await service.getWatchedFolders();
  assert.ok(Array.isArray(folders));

  const testFolder = {
    id: `wf-test-${Date.now()}`,
    name: 'Test Inbox',
    inputPath: 'C:\\test\\inbox',
    outputPath: 'C:\\test\\output',
    pipelineId: 'pipe-ocr-archive',
    status: 'watching' as const,
    processedCount: 0,
  };

  const savedFolders = await service.saveWatchedFolders([...folders, testFolder]);
  assert.ok(savedFolders.some(f => f.id === testFolder.id));

  // Re-fetch
  const refetchedFolders = await service.getWatchedFolders();
  assert.ok(refetchedFolders.some(f => f.id === testFolder.id));

  // Clean test folder
  await service.saveWatchedFolders(folders.filter(f => f.id !== testFolder.id));

  // 6. Telemetry
  const telemetry = await service.getTelemetry();
  assert.ok(telemetry.totalPipelines >= 3);
  assert.ok(telemetry.processedToday >= 0);

  // Increment telemetry
  const initialToday = telemetry.processedToday;
  await service.incrementTelemetryCount(1);
  const incrementedTelemetry = await service.getTelemetry();
  assert.equal(incrementedTelemetry.processedToday, initialToday + 1);
});

test('sanitizePipelineSteps normalizes operations, strips fileInput, and maps parameter aliases', () => {
  const steps = [
    {
      id: 'step1',
      operation: 'misc/compress-pdf',
      name: 'Compress',
      parameters: { fileInput: 'ignored.pdf', compressionLevel: 3 },
    },
    {
      id: 'step2',
      operation: '/api/v1/edit/pdf-text-editor',
      name: 'Interactive Editor',
      parameters: {},
    },
    {
      id: 'step3',
      operation: 'ocr-pdf',
      name: 'OCR',
      parameters: { languages: 'ara' },
    },
  ];

  const sanitized = sanitizePipelineSteps(steps);
  assert.equal(sanitized.length, 2, 'Interactive operations should be excluded');
  assert.equal(sanitized[0].operation, '/api/v1/misc/compress-pdf', 'Operation should have /api/v1/ prefix');
  assert.equal(sanitized[0].parameters.fileInput, undefined, 'fileInput should be omitted');
  assert.equal(sanitized[0].parameters.optimizeLevel, 3, 'compressionLevel should be mapped to optimizeLevel');
  assert.deepEqual(sanitized[1].parameters.languages, ['ara'], 'languages should be an array');
});

test('pipeline sanitization retains conditional paths and rejects unsafe endpoint syntax', () => {
  const step = (operation: string) => ({ id: 's1', name: 'Step', operation, parameters: {} });
  assert.equal(sanitizePipelineSteps([step('/api/v1/filter/filter-contains-image')])[0].operation, '/api/v1/filter/filter-contains-image');
  for (const operation of ['https://example.com/upload', '/api/v1/../../admin', '/api/v1/filter/%2e%2e/admin', '/api/v1/general/rotate-pdf?url=remote', '/api/v1/general/rotate-pdf#fragment', '/api/v1/general\\rotate-pdf']) {
    assert.throws(() => sanitizePipelineSteps([step(operation)]), /^Error: invalid-request$/u);
  }
});

test('Pipeline JSON import and export functions roundtrip correctly', () => {
  const pipeline: StirlingPipeline = {
    id: 'pipe-export-test',
    name: 'Export Test Pipeline',
    description: 'Testing export and import',
    trigger: 'manual',
    active: true,
    steps: [
      { id: 's1', operation: '/api/v1/general/rotate-pdf', name: 'Rotate', parameters: { angle: 90 } },
      { id: 's2', operation: '/api/v1/misc/compress-pdf', name: 'Compress', parameters: { optimizeLevel: 2 } },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const automateJson = exportPipelineAutomateJson(pipeline);
  assert.ok(automateJson.includes('Export Test Pipeline'));
  assert.ok(automateJson.includes('/api/v1/general/rotate-pdf'));

  const imported = importPipelineJson(automateJson);
  assert.equal(imported.name, 'Export Test Pipeline');
  assert.equal(imported.steps.length, 2);
  assert.equal(imported.steps[0].operation, '/api/v1/general/rotate-pdf');

  const folderScanJson = exportPipelineFolderScanJson(
    {
      id: 'wf-1',
      name: 'Test Folder',
      inputPath: 'C:\\inbox',
      outputPath: 'C:\\outbox',
      pipelineId: pipeline.id,
      status: 'watching',
      processedCount: 5,
    },
    pipeline
  );
  assert.ok(folderScanJson.includes('Test Folder'));
  assert.ok(folderScanJson.includes('inbox'));
});
