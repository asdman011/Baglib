// Live parity check: runs every Hub tool and built-in pipeline against the real Stirling JVM and reports what came back.
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPdfDocument, defaultStirlingSidecar, selectNewestStirlingJar } from '../../src/main/services/pdf-editor/stirling';
import { DEFAULT_PIPELINES, StirlingProcessorService, sanitizePipelineSteps } from '../../src/main/services/pdf-editor/processor';
import { STIRLING_INTERACTIVE_ENDPOINTS } from '../../src/shared/stirling-contract';

const root = path.resolve('.baglib-data/pdf-engine');
const tools = {
  python: path.join(root, 'venv', 'Scripts', 'python.exe'), script: path.resolve('assets/pdf-editor/engine.py'), tessdata: path.join(root, 'tessdata'),
  java: path.join(root, 'java', 'jdk-25.0.5+8-jre', 'bin', 'java.exe'), stirlingJar: selectNewestStirlingJar(path.join(root, 'stirling'))!, preferStirling: true,
};
const directory = mkdtempSync(path.join(os.tmpdir(), 'baglib-tools-live-'));
const source = path.join(directory, 'سند source.pdf');
writeFileSync(source, createPdfDocument(['Page one sample@example.com', 'Page two']));
const service = new StirlingProcessorService(directory);

const hub = readFileSync('src/renderer/components/pdf-workstation/StirlingToolsHub.tsx', 'utf8');
const endpoints = [...new Set([...hub.matchAll(/endpoint: '(\/api\/v1\/[^']+)'/gu)].map(match => match[1]))].filter(endpoint => !STIRLING_INTERACTIVE_ENDPOINTS.has(endpoint));
// Tools whose required input cannot be defaulted, such as a URL, a certificate or a second document.
const needsInput: Record<string, Record<string, unknown>> = {
  '/api/v1/security/add-password': { password: 'user-pass', ownerPassword: 'owner-pass-1' },
  '/api/v1/security/remove-password': { password: '' },
  '/api/v1/general/overlay-pdf': { overlayFiles: [source] },
  '/api/v1/general/merge-pdfs': { fileInput: [source] },
  '/api/v1/security/auto-redact': { listOfText: 'sample' },
  '/api/v1/misc/watermark': { watermarkText: 'BAGLIB', fontSize: 30, rotation: 30, opacity: 0.3, widthSpacer: 50, heightSpacer: 50 },
  '/api/v1/misc/add-stamp': { stampText: 'BAGLIB' },
};

const inputs: Record<string, string> = {};
for (const [endpoint, name, content] of [['/api/v1/convert/markdown/pdf', 'note.md', '# عنوان\n\nبحث'], ['/api/v1/convert/html/pdf', 'page.html', '<h1>Title</h1>'], ['/api/v1/convert/img/pdf', 'scan.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')], ['/api/v1/convert/file/pdf', 'scan-2.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')]] as const) {
  inputs[endpoint] = path.join(directory, name);
  writeFileSync(inputs[endpoint], content);
}

const run = async (label: string, pipeline: { operation: string; parameters: Record<string, unknown> }[], singleTool: boolean) => {
  const signal = AbortSignal.timeout(90_000);
  const started = Date.now();
  try {
    const result = await service.executePipeline(tools as never, [inputs[pipeline[0].operation] ?? source], { name: label, singleTool, pipeline }, signal);
    unlinkSync(result.outputPath);
    return `ok   ${label} -> ${result.format} ${result.bytes}B ${Date.now() - started}ms`;
  } catch (error) { return `FAIL ${label} -> ${(error as Error).message} ${Date.now() - started}ms`; }
};

const lines: string[] = [];
for (const pipeline of DEFAULT_PIPELINES) {
  lines.push(await run(`pipeline: ${pipeline.name}`, sanitizePipelineSteps(pipeline.steps), false));
  console.log(lines.at(-1));
  if (lines.at(-1)!.startsWith('FAIL')) for (const step of sanitizePipelineSteps(pipeline.steps)) console.log(`   ${await run(`step ${step.operation}`, [step], true)}`);
}
const only = process.argv[3]?.split(',');
for (const endpoint of endpoints.filter(item => !only || only.some(part => item.includes(part)))) {
  lines.push(await run(endpoint, [{ operation: endpoint, parameters: needsInput[endpoint] ?? {} }], true));
  console.log(lines.at(-1));
}
writeFileSync(process.argv[2], lines.join('\n'));
console.log({ passed: lines.filter(line => line.startsWith('ok')).length, failed: lines.filter(line => line.startsWith('FAIL')).length });
await defaultStirlingSidecar.stop();
rmSync(directory, { recursive: true, force: true });
process.exit(0);
