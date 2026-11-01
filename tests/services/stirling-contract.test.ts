import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { classifyStirlingOutput, isEmptyZipBytes, resolveStirlingOperation } from '../../src/shared/stirling-contract';
import { STIRLING_REQUIRED_DEFAULTS } from '../../src/shared/stirling-required-defaults';
import { StirlingProcessorService, pipelineSegments, sanitizePipelineSteps, DEFAULT_PIPELINES } from '../../src/main/services/pdf-editor/processor';
import type { PdfEngineTools } from '../../src/main/services/pdf-editor/python';

const pdf = Buffer.from('%PDF-1.7\nbody');
const tools = { stirlingUrl: 'http://127.0.0.1:56789' } as PdfEngineTools;

test('old Hub endpoints resolve to the real v3.2.2 API with required parameters', () => {
  assert.equal(resolveStirlingOperation('/api/v1/misc/watermark', {}).operation, '/api/v1/security/add-watermark');
  assert.equal(resolveStirlingOperation('/api/v1/misc/watermark', {}).parameters.watermarkType, 'text');
  const rtf = resolveStirlingOperation('/api/v1/convert/pdf/rtf', {});
  assert.deepEqual([rtf.operation, rtf.parameters.outputFormat], ['/api/v1/convert/pdf/text', 'rtf']);
  assert.equal(resolveStirlingOperation('/api/v1/general/overlay-pdf', {}).parameters.overlayMode, 'SequentialOverlay');
});

test('parameter aliases match the request classes of each endpoint', () => {
  assert.equal(resolveStirlingOperation('/api/v1/convert/pdf/pdfa', { conformance: '2b' }).parameters.outputFormat, 'pdfa-2b');
  assert.equal(resolveStirlingOperation('/api/v1/convert/pdf/pdfa', { conformance: '2b' }).parameters.conformance, undefined);
  assert.equal(resolveStirlingOperation('/api/v1/security/auto-redact', { words: ['a', 'b'] }).parameters.listOfText, 'a\nb');
  assert.equal(resolveStirlingOperation('/api/v1/general/split-pages', { pages: '1,3' }).parameters.pageNumbers, '1,3');
});

test('fields the controllers dereference are always sent, and Arabic stamps select the Arabic alphabet', () => {
  assert.equal(resolveStirlingOperation('/api/v1/misc/watermark', { watermarkText: 'BAGLIB' }).parameters.alphabet, 'roman');
  assert.equal(resolveStirlingOperation('/api/v1/misc/watermark', { watermarkText: 'سري' }).parameters.alphabet, 'arabic');
  assert.equal(resolveStirlingOperation('/api/v1/misc/add-stamp', { stampText: 'Baglib' }).parameters.customColor, '#d3d3d3');
  assert.equal(resolveStirlingOperation('/api/v1/general/split-by-size-or-count', {}).parameters.splitValue, '10MB');
  assert.equal(resolveStirlingOperation('/api/v1/general/crop', {}).parameters.autoCrop, true);
  assert.equal(resolveStirlingOperation('/api/v1/general/crop', { x: 1, y: 1, width: 2, height: 2 }).parameters.autoCrop, undefined);
});

test('a disabled endpoint hidden behind an empty handleData body is reported as a missing component', async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-contract-'));
  try {
    const source = path.join(directory, 'source.pdf');
    await writeFile(source, pdf);
    context.mock.method(globalThis, 'fetch', async (url: string) => String(url).endsWith('/pipeline/handleData')
      ? new Response(new Uint8Array(0))
      : new Response(JSON.stringify({ message: 'This endpoint is disabled' }), { status: 403 }));
    const service = new StirlingProcessorService(directory);
    await assert.rejects(service.executePipeline(tools, [source], { name: 'Archive', pipeline: [{ operation: '/api/v1/convert/pdf/pdfa', parameters: {} }] }, new AbortController().signal), /^Error: engine-missing$/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('table conversions distinguish a table-free document from a broken result', async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-contract-'));
  try {
    const source = path.join(directory, 'source.pdf');
    await writeFile(source, pdf);
    context.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(0)));
    const service = new StirlingProcessorService(directory);
    await assert.rejects(service.executePipeline(tools, [source], { name: 'Tables', singleTool: true, pipeline: [{ operation: '/api/v1/convert/pdf/csv', parameters: {} }] }, new AbortController().signal), /^Error: no-tables$/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('every built-in pipeline step uses a known endpoint and a complete parameter set', () => {
  for (const pipeline of DEFAULT_PIPELINES) {
    for (const step of sanitizePipelineSteps(pipeline.steps)) {
      if (step.operation === '/api/v1/misc/remove-annotations') continue;
      assert.ok(STIRLING_REQUIRED_DEFAULTS[step.operation] !== undefined || step.operation === '/api/v1/security/sanitize-pdf', step.operation);
      for (const name of Object.keys(STIRLING_REQUIRED_DEFAULTS[step.operation] ?? {})) assert.ok(step.parameters[name] !== undefined, `${step.operation} ${name}`);
    }
  }
});

test('output classification trusts bytes over the generic handleData content type', () => {
  assert.equal(classifyStirlingOutput(pdf, 'application/octet-stream', null), 'pdf');
  assert.equal(classifyStirlingOutput(Buffer.concat([Buffer.from('\n\n'), pdf]), 'application/octet-stream', 'attachment; filename="x.out"'), 'pdf');
  assert.equal(classifyStirlingOutput(Buffer.from([0x50, 0x4b, 3, 4, 0]), 'application/octet-stream', 'attachment; filename="pages.zip"'), 'zip');
  assert.equal(classifyStirlingOutput(Buffer.from([0x50, 0x4b, 3, 4, 0]), 'application/octet-stream', 'attachment; filename="report.docx"'), 'docx');
  assert.equal(classifyStirlingOutput(Buffer.from('# Title'), 'application/octet-stream', 'attachment; filename="report.md"'), 'md');
  assert.equal(classifyStirlingOutput(Buffer.from('a,b'), 'text/csv', null), 'csv');
  assert.equal(classifyStirlingOutput(Buffer.from('<x/>'), 'application/xml', null), 'xml');
  assert.equal(classifyStirlingOutput(Buffer.from([0x89, 0x50, 0x4e, 0x47]), null, null), 'png');
  assert.equal(isEmptyZipBytes(Buffer.from([0x50, 0x4b, 5, 6])), true);
});

test('steps needing extra files or local tools split the pipeline around them', () => {
  const step = (operation: string, parameters: Record<string, unknown> = {}) => ({ operation, parameters });
  const segments = pipelineSegments([step('/a'), step('/b'), step('/api/v1/general/overlay-pdfs', { overlayFiles: ['x.pdf'] }), step('/c'), step('/api/v1/misc/remove-annotations')], false);
  assert.deepEqual(segments.map(segment => [segment.steps.length, segment.direct]), [[2, false], [1, true], [1, false], [1, true]]);
  assert.deepEqual(pipelineSegments([step('/a')], true).map(segment => segment.direct), [true]);
});

test('filtered-out files report no-output instead of a corrupt result', async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-contract-'));
  try {
    const source = path.join(directory, 'source.pdf');
    await writeFile(source, pdf);
    context.mock.method(globalThis, 'fetch', async () => new Response(Buffer.from([0x50, 0x4b, 5, 6, ...new Array(18).fill(0)])));
    const service = new StirlingProcessorService(directory);
    const steps = [{ operation: '/api/v1/filter/filter-contains-image', parameters: {} }];
    await assert.rejects(service.executePipeline(tools, [source], { name: 'Filter', pipeline: steps }, new AbortController().signal), /^Error: no-output$/u);
    context.mock.restoreAll();
    context.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(0)));
    await assert.rejects(service.executePipeline(tools, [source], { name: 'Plain', pipeline: [{ operation: '/api/v1/general/rotate-pdf', parameters: {} }] }, new AbortController().signal), /^Error: invalid-output$/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a single-file pipeline result keeps PDF format despite an octet-stream label', async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-contract-'));
  let outputPath: string | undefined;
  try {
    const source = path.join(directory, 'source.pdf');
    await writeFile(source, pdf);
    context.mock.method(globalThis, 'fetch', async () => new Response(pdf, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="source.pdf"' } }));
    const service = new StirlingProcessorService(directory);
    const result = await service.executePipeline(tools, [source], { name: 'Rotate', pipeline: [{ operation: '/api/v1/general/rotate-pdf', parameters: { angle: 90 } }] }, new AbortController().signal);
    outputPath = result.outputPath;
    assert.equal(result.format, 'pdf');
    assert.deepEqual(await readFile(outputPath), pdf);
  } finally {
    if (outputPath) await unlink(outputPath);
    await rm(directory, { recursive: true, force: true });
  }
});

test('office outputs keep their real format instead of unpacking as archives', () => {
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);
  assert.equal(classifyStirlingOutput(zip, 'application/octet-stream', 'attachment; filename="book.odt"'), 'odt');
  assert.equal(classifyStirlingOutput(zip, 'application/octet-stream', 'attachment; filename="book.odp"'), 'odp');
  assert.equal(classifyStirlingOutput(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), 'application/octet-stream', 'attachment; filename="book.ppt"'), 'ppt');
});
