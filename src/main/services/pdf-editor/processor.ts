import { app } from 'electron';
import fs from 'node:fs';
import { mkdir, readFile, rm, writeFile, unlink, readdir, stat, copyFile, rename, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { PdfEngineTools } from './python';
import { extractZipEntries, resolveStirlingEndpoint, validateStirlingLoopbackUrl } from './stirling';
import { fileSha256 } from './source';
import { runPdfHelper } from './view-cache-runtime';
import { renderUrlToPdf } from './weasyprint';
import { STIRLING_DISABLED_ENDPOINT, STIRLING_FILE_PARAMETERS, STIRLING_INTERACTIVE_ENDPOINTS, STIRLING_LOCAL_ENDPOINTS, classifyStirlingOutput, isEmptyZipBytes, resolveStirlingOperation, stirlingFilename } from '../../../shared/stirling-contract';

export interface StirlingPipelineStep {
  id: string;
  operation: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface StirlingPipeline {
  id: string;
  name: string;
  description?: string;
  trigger: 'editor' | 'folder' | 'manual';
  inputFolder?: string;
  outputFolder?: string;
  afterProcessing?: 'keep' | 'archive' | 'delete';
  steps: StirlingPipelineStep[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WatchedFolderSource {
  id: string;
  name: string;
  inputPath: string;
  outputPath: string;
  pipelineId: string;
  status: 'watching' | 'paused' | 'error';
  lastProcessedAt?: string;
  processedCount: number;
}

export interface StirlingProcessorTelemetry {
  activePipelines: number;
  totalPipelines: number;
  processedToday: number;
  watchedFolders: number;
}

export interface StirlingGovernancePolicies {
  ingestion: {
    folderWatchEnabled: boolean;
    autoOcrArabic: boolean;
    autoOcrEnglish: boolean;
    maxFileSizeMb: number;
  };
  security: {
    autoSanitize: boolean;
    removeMetadata: boolean;
    stripJavascript: boolean;
    defaultPasswordProtect: boolean;
  };
  compliance: {
    enforcePdfA: boolean;
    pdfAConformance: '2b' | '3b' | '1b';
    validateDigitalSignatures: boolean;
  };
  routing: {
    outputDirectory: string;
    namingPattern: string;
    separateOutputFolder: boolean;
  };
  retention: {
    backupOriginal: boolean;
    backupDir: string;
    retentionDays: number;
  };
}

const DEFAULT_POLICIES: StirlingGovernancePolicies = {
  ingestion: {
    folderWatchEnabled: true,
    autoOcrArabic: true,
    autoOcrEnglish: true,
    maxFileSizeMb: 200,
  },
  security: {
    autoSanitize: true,
    removeMetadata: false,
    stripJavascript: true,
    defaultPasswordProtect: false,
  },
  compliance: {
    enforcePdfA: true,
    pdfAConformance: '2b',
    validateDigitalSignatures: true,
  },
  routing: {
    outputDirectory: '',
    namingPattern: '{filename}_processed',
    separateOutputFolder: true,
  },
  retention: {
    backupOriginal: true,
    backupDir: '',
    retentionDays: 30,
  },
};

const URL_TO_PDF_ENDPOINT = '/api/v1/convert/url/pdf';
const INTERACTIVE_OPERATIONS = new Set([
  '/api/v1/edit/pdf-text-editor',
  '/api/v1/security/sign',
  '/api/v1/misc/annotate',
  '/api/v1/misc/compare',
  'edit-text',
  'sign',
  'annotate',
  'compare',
]);

export const DEFAULT_PIPELINES: StirlingPipeline[] = [
  {
    id: 'pipe-ocr-archive',
    name: 'OCR Pipeline',
    description: 'Auto-detect scanned pages and run Arabic/English OCR with text-skipping',
    trigger: 'folder',
    active: true,
    steps: [
      { id: 's1', operation: '/api/v1/filter/filter-contains-image', name: 'Contains Image Filter', parameters: { pageNumbers: 'all' } },
      { id: 's2', operation: '/api/v1/misc/ocr-pdf', name: 'OCR / Cleanup Scans', parameters: { languages: ['ara', 'eng'], ocrType: 'skip-text' } },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pipe-sanitize-compress',
    name: 'Sanitize & Optimize',
    description: 'Strip JavaScript and metadata, optimize images, and reduce PDF size',
    trigger: 'editor',
    active: true,
    steps: [
      { id: 's1', operation: '/api/v1/security/sanitize-pdf', name: 'Sanitize PDF', parameters: {} },
      { id: 's2', operation: '/api/v1/misc/compress-pdf', name: 'Compress & Optimize', parameters: { optimizeLevel: 2 } },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pipe-legal-redact',
    name: 'Confidential Redaction & Watermark',
    description: 'Auto-redact sensitive patterns and stamp with confidentiality watermark',
    trigger: 'manual',
    active: true,
    steps: [
      {
        id: 's1',
        operation: '/api/v1/security/auto-redact',
        name: 'Auto-Redact Sensitive Data',
        parameters: {
          words: [
            '[\\w.-]+@[\\w.-]+\\.\\w+',
            '\\d{3}-\\d{2}-\\d{4}',
            '\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{4}',
            '\\(\\d{3}\\)\\s*\\d{3}-\\d{4}',
          ],
          useRegex: true,
          wholeWordSearch: true,
        },
      },
      { id: 's2', operation: '/api/v1/security/add-watermark', name: 'Add Watermark', parameters: { watermarkText: 'CONFIDENTIAL', fontSize: 36, opacity: 0.25, rotation: 45 } },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pipe-scholarly-scan-ingestion',
    name: 'Scholarly Scan Ingestion',
    description: 'Filter PDFs with images, run Arabic/English OCR with text-skipping, and compress',
    trigger: 'folder',
    active: true,
    steps: [
      { id: 's1', operation: '/api/v1/filter/filter-contains-image', name: 'Contains Image Filter', parameters: { pageNumbers: 'all' } },
      { id: 's2', operation: '/api/v1/misc/ocr-pdf', name: 'OCR / Cleanup Scans', parameters: { languages: ['ara', 'eng'], ocrType: 'skip-text' } },
      { id: 's3', operation: '/api/v1/misc/compress-pdf', name: 'Compress & Optimize', parameters: { optimizeLevel: 3 } },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pipe-prepublish-sanitization',
    name: 'Pre-Publish Sanitization',
    description: 'Sanitize JS/metadata, strip annotations, and flatten form fields',
    trigger: 'manual',
    active: true,
    steps: [
      { id: 's1', operation: '/api/v1/security/sanitize-pdf', name: 'Sanitize PDF', parameters: {} },
      { id: 's2', operation: '/api/v1/misc/remove-annotations', name: 'Remove Annotations', parameters: {} },
      { id: 's3', operation: '/api/v1/misc/flatten', name: 'Flatten Forms', parameters: {} },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pipe-confidential-document-release',
    name: 'Confidential Document Release',
    description: 'Auto-redact emails, phone numbers, and IDs, sanitize scripts, and stamp with confidentiality watermark',
    trigger: 'folder',
    active: true,
    steps: [
      {
        id: 's1',
        operation: '/api/v1/security/auto-redact',
        name: 'Auto-Redact Sensitive Data',
        parameters: {
          words: [
            '[\\w.-]+@[\\w.-]+\\.\\w+',
            '\\d{3}-\\d{2}-\\d{4}',
            '\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{4}',
            '\\(\\d{3}\\)\\s*\\d{3}-\\d{4}',
          ],
          useRegex: true,
          wholeWordSearch: true,
        },
      },
      { id: 's2', operation: '/api/v1/security/sanitize-pdf', name: 'Sanitize PDF', parameters: {} },
      { id: 's3', operation: '/api/v1/security/add-watermark', name: 'Add Watermark', parameters: { watermarkText: 'CONFIDENTIAL', fontSize: 36, opacity: 0.25, rotation: 45 } },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function sanitizePipelineSteps(steps: StirlingPipelineStep[]): { operation: string; parameters: Record<string, unknown> }[] {
  const result: { operation: string; parameters: Record<string, unknown> }[] = [];
  for (const step of steps) {
    let op = (step.operation || '').trim();
    if (!op || INTERACTIVE_OPERATIONS.has(op) || STIRLING_INTERACTIVE_ENDPOINTS.has(op)) {
      continue;
    }
    if (!op.startsWith('/api/v1/')) {
      if (op.startsWith('api/v1/')) {
        op = `/${op}`;
      } else if (op.startsWith('/')) {
        op = `/api/v1${op}`;
      } else {
        op = `/api/v1/${op}`;
      }
    }
    if (!/^\/api\/v1\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/u.test(op)) throw new Error('invalid-request');
    const params: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(step.parameters || {})) {
      if (key === 'fileInput') continue;
      if (key === 'compressionLevel') {
        params['optimizeLevel'] = val;
      } else if (key === 'languages' || key === 'ocrLanguages') {
        params['languages'] = Array.isArray(val) ? val : [val];
      } else {
        params[key] = val;
      }
    }
    result.push(resolveStirlingOperation(op, params));
  }
  return result;
}

type PipelineStep = { operation: string; parameters: Record<string, unknown> };
interface PipelineFile { name: string; data: Buffer }
interface PipelineResponse { data: Buffer; contentType: string | null; disposition: string | null }

const INPUT_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.html': 'text/html', '.htm': 'text/html', '.md': 'text/markdown', '.txt': 'text/plain',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const stepRunsAlone = (step: PipelineStep) => STIRLING_LOCAL_ENDPOINTS.has(step.operation) || Object.keys(step.parameters).some(name => STIRLING_FILE_PARAMETERS.has(name));

/** Groups neighbouring JSON-only steps for handleData; steps needing extra files or local tools run on their own. */
export function pipelineSegments(steps: PipelineStep[], singleTool: boolean): { steps: PipelineStep[]; direct: boolean }[] {
  const segments: { steps: PipelineStep[]; direct: boolean }[] = [];
  for (const step of steps) {
    const direct = singleTool || stepRunsAlone(step), last = segments.at(-1);
    if (!direct && last && !last.direct) last.steps.push(step);
    else segments.push({ steps: [step], direct });
  }
  return segments;
}

function appendFiles(form: FormData, files: PipelineFile[]): void {
  for (const file of files) {
    const type = INPUT_MIME_TYPES[path.extname(file.name).toLowerCase()] ?? 'application/pdf';
    form.append('fileInput', new Blob([new Uint8Array(file.data)], { type }), file.name);
  }
}

async function readPipelineResponse(url: string, form: FormData, signal: AbortSignal): Promise<PipelineResponse> {
  const res = await fetch(url, { method: 'POST', body: form, signal, redirect: 'error' }).catch((error: Error) => {
    // The native redactor takes the whole engine down on some font types; no file comes back either way.
    if (!signal.aborted && url.endsWith('/security/auto-redact')) throw new Error('redaction-unverified');
    throw error;
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 400);
    console.warn('[pdf-processor] Step rejected:', new URL(url).pathname, res.status, detail);
    if (STIRLING_DISABLED_ENDPOINT.test(detail)) throw new Error('engine-missing');
    if (/No PDF bookmarks/iu.test(detail)) throw new Error('no-bookmarks');
    if (/requires the permissions password|separate permissions password|permissions password is incorrect/iu.test(detail)) throw new Error('owner-password-required');
    if (/password was not provided or was incorrect|with its opening password/iu.test(detail)) throw new Error('encrypted');
    if (/Redaction could not be verified/iu.test(detail)) throw new Error('redaction-unverified');
    if (/PEMKeyPair/u.test(detail)) throw new Error('certificate-invalid');
    throw new Error(res.status === 400 ? 'invalid-request' : 'engine-failed');
  }
  return { data: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type'), disposition: res.headers.get('content-disposition') };
}

async function postHandleData(origin: string, name: string, steps: PipelineStep[], files: PipelineFile[], signal: AbortSignal): Promise<PipelineResponse> {
  const form = new FormData();
  appendFiles(form, files);
  form.append('json', JSON.stringify({ name, pipeline: steps }));
  return readPipelineResponse(`${origin}/api/v1/pipeline/handleData`, form, signal);
}

async function postDirectStep(origin: string, step: PipelineStep, files: PipelineFile[], signal: AbortSignal): Promise<PipelineResponse> {
  const form = new FormData();
  appendFiles(form, files);
  for (const [name, value] of Object.entries(step.parameters)) {
    if (name === 'fileInput' || value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (STIRLING_FILE_PARAMETERS.has(name)) {
        const filename = String(item);
        if (!fs.existsSync(filename)) throw new Error('invalid-source');
        form.append(name, new Blob([new Uint8Array(await readFile(filename, { signal }))]), path.basename(filename));
      } else form.append(name, typeof item === 'object' ? JSON.stringify(item) : String(item));
    }
  }
  return readPipelineResponse(`${origin}${step.operation}`, form, signal);
}

async function assertStepsAvailable(origin: string, steps: PipelineStep[], files: PipelineFile[], signal: AbortSignal): Promise<void> {
  for (const step of steps) {
    await postDirectStep(origin, step, files, signal);
    files = files.slice();
  }
}

async function removeAnnotationsLocally(tools: PdfEngineTools, step: PipelineStep, files: PipelineFile[], signal: AbortSignal): Promise<PipelineResponse> {
  if (files.length !== 1) throw new Error('invalid-request');
  const directory = path.join(app?.isPackaged ? app.getPath('temp') : path.resolve('.baglib-data', 'pdf-engine', 'staged'), `annotations-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  try {
    const input = path.join(directory, 'input.pdf'), output = path.join(directory, 'output.pdf');
    await writeFile(input, files[0].data);
    const removed = [...(step.parameters.keepLinks === false ? ['--links'] : []), ...(step.parameters.keepFormFields === false ? ['--form-fields'] : [])];
    await runPdfHelper(tools, 'remove_annotations.py', [input, output, ...removed], signal);
    return { data: await readFile(output), contentType: 'application/pdf', disposition: null };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export function exportPipelineAutomateJson(pipeline: StirlingPipeline): string {
  return JSON.stringify({
    name: pipeline.name,
    pipeline: sanitizePipelineSteps(pipeline.steps),
  }, null, 2);
}

export function exportPipelineFolderScanJson(folder: WatchedFolderSource, pipeline: StirlingPipeline): string {
  return JSON.stringify({
    folderName: folder.name,
    inputPath: folder.inputPath,
    outputPath: folder.outputPath,
    pipeline: {
      name: pipeline.name,
      pipeline: sanitizePipelineSteps(pipeline.steps),
    },
  }, null, 2);
}

interface ImportedPipelineStep { operation?: string; endpoint?: string; name?: string; parameters?: Record<string, unknown>; params?: Record<string, unknown> }

export function importPipelineJson(jsonContent: string): StirlingPipeline {
  const parsed = JSON.parse(jsonContent);
  const name = parsed.name || parsed.folderName || 'Imported Pipeline';
  const rawSteps = Array.isArray(parsed.pipeline)
    ? parsed.pipeline
    : Array.isArray(parsed.steps)
    ? parsed.steps
    : Array.isArray(parsed.pipeline?.pipeline)
    ? parsed.pipeline.pipeline
    : [];

  const steps: StirlingPipelineStep[] = rawSteps.map((s: ImportedPipelineStep, idx: number) => ({
    id: `s-${idx + 1}-${randomUUID().slice(0, 4)}`,
    operation: s.operation || s.endpoint || '',
    name: s.name || s.operation || `Step ${idx + 1}`,
    parameters: s.parameters || s.params || {},
  }));

  return {
    id: `pipe-${randomUUID()}`,
    name,
    description: parsed.description || 'Imported from JSON',
    trigger: parsed.trigger || (parsed.inputPath ? 'folder' : 'manual'),
    inputFolder: parsed.inputPath || parsed.inputFolder,
    outputFolder: parsed.outputPath || parsed.outputFolder,
    afterProcessing: parsed.afterProcessing || 'keep',
    steps,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export class StirlingProcessorService {
  private static instance: StirlingProcessorService | null = null;
  private pipelinesDir: string;
  private policiesFile: string;
  private watchedFoldersFile: string;
  private telemetryFile: string;
  private watchReceiptsFile: string;
  private folderWatchTimer: NodeJS.Timeout | null = null;
  private folderScan: Promise<{ processed: number; errors: string[] }> | null = null;
  private folderScanController: AbortController | null = null;

  public static getInstance(): StirlingProcessorService {
    if (!StirlingProcessorService.instance) {
      StirlingProcessorService.instance = new StirlingProcessorService();
    }
    return StirlingProcessorService.instance;
  }

  constructor(dataDirectory?: string) {
    const baseDir = dataDirectory ?? (app?.isPackaged
      ? path.join(app.getPath('userData'), 'pdf-processor')
      : path.resolve('.baglib-data', 'pdf-engine', 'processor'));
    this.pipelinesDir = path.join(baseDir, 'pipelines');
    this.policiesFile = path.join(baseDir, 'policies.json');
    this.watchedFoldersFile = path.join(baseDir, 'watched-folders.json');
    this.telemetryFile = path.join(baseDir, 'telemetry.json');
    this.watchReceiptsFile = path.join(baseDir, 'watch-receipts.json');
    this.initDirectories();
  }

  private initDirectories(): void {
    try {
      if (!fs.existsSync(this.pipelinesDir)) {
        fs.mkdirSync(this.pipelinesDir, { recursive: true });
      }
    } catch {
      /* ignore */
    }
  }

  public async listPipelines(): Promise<StirlingPipeline[]> {
    await mkdir(this.pipelinesDir, { recursive: true });
    const userPipelines: StirlingPipeline[] = [];
    try {
      const files = await readdir(this.pipelinesDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await readFile(path.join(this.pipelinesDir, file), 'utf8');
            userPipelines.push(JSON.parse(content) as StirlingPipeline);
          } catch {
            /* ignore corrupted file */
          }
        }
      }
    } catch {
      /* ignore */
    }
    const combined = [...DEFAULT_PIPELINES];
    for (const userPipe of userPipelines) {
      const idx = combined.findIndex(p => p.id === userPipe.id);
      if (idx >= 0) {
        combined[idx] = userPipe;
      } else {
        combined.push(userPipe);
      }
    }
    return combined;
  }

  public async savePipeline(pipeline: StirlingPipeline): Promise<StirlingPipeline> {
    await mkdir(this.pipelinesDir, { recursive: true });
    const validated: StirlingPipeline = {
      ...pipeline,
      id: pipeline.id || `pipe-${randomUUID()}`,
      updatedAt: new Date().toISOString(),
      createdAt: pipeline.createdAt || new Date().toISOString(),
    };
    const target = path.join(this.pipelinesDir, `${validated.id}.json`);
    await writeFile(target, JSON.stringify(validated, null, 2), 'utf8');
    return validated;
  }

  public async deletePipeline(id: string): Promise<boolean> {
    const target = path.join(this.pipelinesDir, `${id}.json`);
    try {
      await unlink(target);
      return true;
    } catch {
      return false;
    }
  }

  public async getPolicies(): Promise<StirlingGovernancePolicies> {
    try {
      if (fs.existsSync(this.policiesFile)) {
        const text = await readFile(this.policiesFile, 'utf8');
        return { ...DEFAULT_POLICIES, ...JSON.parse(text) };
      }
    } catch {
      /* fallback */
    }
    return DEFAULT_POLICIES;
  }

  public async savePolicies(policies: Partial<StirlingGovernancePolicies>): Promise<StirlingGovernancePolicies> {
    const current = await this.getPolicies();
    const updated = {
      ...current,
      ...policies,
      ingestion: { ...current.ingestion, ...policies.ingestion },
      security: { ...current.security, ...policies.security },
      compliance: { ...current.compliance, ...policies.compliance },
      routing: { ...current.routing, ...policies.routing },
      retention: { ...current.retention, ...policies.retention },
    };
    await mkdir(path.dirname(this.policiesFile), { recursive: true });
    await writeFile(this.policiesFile, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  }

  public async getWatchedFolders(): Promise<WatchedFolderSource[]> {
    try {
      if (fs.existsSync(this.watchedFoldersFile)) {
        const text = await readFile(this.watchedFoldersFile, 'utf8');
        return JSON.parse(text) as WatchedFolderSource[];
      }
    } catch {
      /* ignore */
    }
    return [];
  }

  public async saveWatchedFolders(folders: WatchedFolderSource[]): Promise<WatchedFolderSource[]> {
    await mkdir(path.dirname(this.watchedFoldersFile), { recursive: true });
    await writeFile(this.watchedFoldersFile, JSON.stringify(folders, null, 2), 'utf8');
    return folders;
  }

  public async getTelemetry(): Promise<StirlingProcessorTelemetry> {
    const pipelines = await this.listPipelines();
    const watched = await this.getWatchedFolders();
    const activePipelines = pipelines.filter(p => p.active).length;
    let processedToday = 0;
    try {
      if (fs.existsSync(this.telemetryFile)) {
        const text = await readFile(this.telemetryFile, 'utf8');
        const data = JSON.parse(text);
        if (data.today === new Date().toISOString().slice(0, 10)) {
          processedToday = Number.isSafeInteger(data.count) && data.count >= 0 ? data.count : 0;
        }
      }
    } catch {
      /* ignore */
    }
    return {
      activePipelines,
      totalPipelines: pipelines.length,
      processedToday,
      watchedFolders: watched.filter(w => w.status === 'watching').length,
    };
  }

  public async incrementTelemetryCount(count = 1): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    let current = 0;
    try {
      if (fs.existsSync(this.telemetryFile)) {
        const text = await readFile(this.telemetryFile, 'utf8');
        const data = JSON.parse(text);
        if (data.today === today) current = (Number(data.count) || 0);
      }
    } catch {
      /* ignore */
    }
    current += count;
    await mkdir(path.dirname(this.telemetryFile), { recursive: true });
    await writeFile(this.telemetryFile, JSON.stringify({ today, count: current }), 'utf8');
  }

  /**
   * Executes a multi-step Stirling pipeline sequentially via loopback `/api/v1/pipeline/handleData`
   */
  public async executePipeline(
    tools: PdfEngineTools,
    filePaths: string[],
    pipelineConfig: { name: string; pipeline: { operation: string; parameters: Record<string, unknown> }[]; singleTool?: boolean },
    signal: AbortSignal,
    onProgress?: (progress: number) => void
  ): Promise<{ outputPath: string; format: string; bytes: number; sha256: string }> {
    if (signal.aborted) throw new Error('cancelled');
    const [urlStep] = pipelineConfig.pipeline;
    if (pipelineConfig.singleTool && pipelineConfig.pipeline.length === 1 && urlStep.operation === URL_TO_PDF_ENDPOINT) {
      onProgress?.(30);
      const rendered = await renderUrlToPdf(String(urlStep.parameters?.urlInput ?? ''), { signal });
      return this.stagePipelineOutput(rendered, 'pdf', 1, onProgress);
    }
    if (!filePaths.length) throw new Error('invalid-request');
    const sanitizedSteps = sanitizePipelineSteps(
      pipelineConfig.pipeline.map((step, index) => ({ id: `s${index}`, operation: step.operation, name: step.operation, parameters: step.parameters || {} }))
    );
    if (!sanitizedSteps.length) throw new Error('invalid-request');
    if (pipelineConfig.singleTool && sanitizedSteps.length !== 1) throw new Error('invalid-request');
    const baseUrl = await resolveStirlingEndpoint(tools);
    const origin = validateStirlingLoopbackUrl(baseUrl);

    let files: PipelineFile[] = [];
    for (const filePath of filePaths) {
      if (signal.aborted) throw new Error('cancelled');
      if (!fs.existsSync(filePath)) throw new Error('invalid-source');
      files.push({ name: path.basename(filePath), data: await readFile(filePath, { signal }) });
    }
    onProgress?.(30);

    const hasFilter = sanitizedSteps.some(step => step.operation.startsWith('/api/v1/filter/'));
    let response: PipelineResponse | undefined;
    for (const segment of pipelineSegments(sanitizedSteps, Boolean(pipelineConfig.singleTool))) {
      if (signal.aborted) throw new Error('cancelled');
      const [first] = segment.steps;
      if (STIRLING_LOCAL_ENDPOINTS.has(first.operation)) response = await removeAnnotationsLocally(tools, first, files, signal);
      else if (segment.direct) response = await postDirectStep(origin, first, files, signal);
      else response = await postHandleData(origin, pipelineConfig.name, segment.steps, files, signal);
      if (!response.data.length || isEmptyZipBytes(response.data)) {
        // handleData hides a failed step behind an empty body, so name the unavailable step instead of blaming the output.
        if (!segment.direct && !hasFilter) await assertStepsAvailable(origin, segment.steps, files, signal);
        if (segment.direct && /\/convert\/pdf\/(?:csv|xlsx)$/u.test(first.operation)) throw new Error('no-tables');
        throw new Error(hasFilter || segment.direct ? 'no-output' : 'invalid-output');
      }
      files = classifyStirlingOutput(response.data, response.contentType, response.disposition) === 'zip'
        ? extractZipEntries(response.data)
        : [{ name: stirlingFilename(response.disposition) || files[0].name, data: response.data }];
    }
    onProgress?.(80);

    const responseBytes = response!.data;
    const ext = classifyStirlingOutput(responseBytes, response!.contentType, response!.disposition);
    return this.stagePipelineOutput(responseBytes, ext, filePaths.length, onProgress);
  }

  private async stagePipelineOutput(
    responseBytes: Uint8Array,
    ext: string,
    fileCount: number,
    onProgress?: (progress: number) => void
  ): Promise<{ outputPath: string; format: string; bytes: number; sha256: string }> {
    const format = ext;

    const outDir = app?.isPackaged
      ? path.join(app.getPath('userData'), 'pdf-editor', 'staged')
      : path.resolve('.baglib-data', 'pdf-engine', 'staged');
    await mkdir(outDir, { recursive: true });

    const outputPath = path.join(outDir, `pipeline-${Date.now()}-${randomUUID()}.${ext}`);
    await writeFile(outputPath, responseBytes);

    const sha256 = await fileSha256(outputPath);
    await this.incrementTelemetryCount(fileCount);

    onProgress?.(100);

    return {
      outputPath,
      format,
      bytes: responseBytes.length,
      sha256,
    };
  }

  /**
   * Scans configured watched folders, processing eligible files through assigned pipelines
   */
  public checkWatchedFolders(tools: PdfEngineTools): Promise<{ processed: number; errors: string[] }> {
    if (this.folderScan) return this.folderScan;
    const controller = new AbortController();
    this.folderScanController = controller;
    this.folderScan = this.scanWatchedFolders(tools, controller.signal).finally(() => { this.folderScan = null; this.folderScanController = null; });
    return this.folderScan;
  }

  private async scanWatchedFolders(tools: PdfEngineTools, signal: AbortSignal): Promise<{ processed: number; errors: string[] }> {
    let receipts: Record<string, string> = {};
    try {
      const stored: unknown = JSON.parse(await readFile(this.watchReceiptsFile, 'utf8'));
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        receipts = Object.fromEntries(Object.entries(stored).filter(([key, value]) => /^[a-f0-9]{64}$/u.test(key) && typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)));
      }
    } catch {}
    const folders = await this.getWatchedFolders();
    const pipelines = await this.listPipelines();
    let processed = 0;
    const errors: string[] = [];

    for (const folder of folders) {
      if (signal.aborted) break;
      if (folder.status !== 'watching') continue;
      if (!fs.existsSync(folder.inputPath)) continue;

      try {
        const pipeline = pipelines.find(p => p.id === folder.pipelineId);
        if (!pipeline || !pipeline.active) continue;

        const entries = await readdir(folder.inputPath);
        const targetFiles = entries.filter(f => {
          const lower = f.toLowerCase();
          return !f.startsWith('.') && !f.startsWith('~') && (lower.endsWith('.pdf') || lower.endsWith('.docx') || lower.endsWith('.png') || lower.endsWith('.jpg'));
        });

        for (const file of targetFiles) {
          if (signal.aborted) break;
          const filePath = path.join(folder.inputPath, file);
          try {
            const fileStat = await stat(filePath);
            if (!fileStat.isFile()) continue;
            if (Date.now() - fileStat.mtimeMs < 2000) continue; // Skip files still being written
            const sourceHash = await fileSha256(filePath);
            const generatedKey = createHash('sha256').update(JSON.stringify(['generated', folder.id, path.resolve(filePath)])).digest('hex');
            if (receipts[generatedKey] === sourceHash) continue;
            const receiptKey = createHash('sha256').update(JSON.stringify([folder.id, path.resolve(filePath), path.resolve(folder.outputPath), pipeline.id])).digest('hex');
            const fingerprint = createHash('sha256').update(JSON.stringify([sourceHash, pipeline.steps, pipeline.afterProcessing])).digest('hex');
            if (receipts[receiptKey] === fingerprint) continue;

            const saveReceipts = async () => {
              const temporaryReceipts = `${this.watchReceiptsFile}.${randomUUID()}.tmp`;
              try {
                await writeFile(temporaryReceipts, JSON.stringify(receipts), 'utf8');
                await rename(temporaryReceipts, this.watchReceiptsFile);
              } finally { await unlink(temporaryReceipts).catch(() => {}); }
            };
            const res = await this.executePipeline(
              tools,
              [filePath],
              {
                name: pipeline.name,
                pipeline: sanitizePipelineSteps(pipeline.steps),
              },
              signal
            ).catch(async (error: Error) => {
              // A conditional gate rejecting a file is a decision, not a failure: remember it and leave the file alone.
              if (error.message !== 'no-output') throw error;
              receipts[receiptKey] = fingerprint;
              await saveReceipts();
              return null;
            });
            if (!res) continue;

            if (signal.aborted || await fileSha256(filePath) !== sourceHash) {
              await unlink(res.outputPath).catch(() => {});
              throw new Error(signal.aborted ? 'cancelled' : 'source-changed');
            }
            await mkdir(folder.outputPath, { recursive: true });
            const destPath = path.join(folder.outputPath, path.basename(res.outputPath));
            await copyFile(res.outputPath, destPath);
            await unlink(res.outputPath).catch(() => {});

            if (pipeline.afterProcessing === 'archive') {
              const archiveDir = path.join(folder.inputPath, '_archive');
              await mkdir(archiveDir, { recursive: true });
              try {
                await copyFile(filePath, path.join(archiveDir, file), fs.constants.COPYFILE_EXCL);
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
                const extension = path.extname(file);
                const uniqueName = `${path.basename(file, extension)}-${randomUUID()}${extension}`;
                await copyFile(filePath, path.join(archiveDir, uniqueName), fs.constants.COPYFILE_EXCL);
              }
              await unlink(filePath);
            } else if (pipeline.afterProcessing === 'delete') {
              await unlink(filePath);
            }

            receipts[receiptKey] = fingerprint;
            if (path.relative(await realpath(folder.inputPath), await realpath(folder.outputPath)) === '') {
              const generatedInputPath = path.join(folder.inputPath, path.basename(destPath));
              const outputKey = createHash('sha256').update(JSON.stringify(['generated', folder.id, path.resolve(generatedInputPath)])).digest('hex');
              receipts[outputKey] = await fileSha256(destPath);
            }
            await saveReceipts();

            folder.processedCount = (folder.processedCount || 0) + 1;
            folder.lastProcessedAt = new Date().toISOString();
            processed++;
          } catch (err) {
            if (signal.aborted) break;
            errors.push(`File ${file}: ${err instanceof Error ? err.message : err}`);
          }
        }
      } catch (err) {
        errors.push(`Folder ${folder.name}: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (processed > 0) {
      await this.saveWatchedFolders(folders);
    }

    return { processed, errors };
  }

  public startWatchedFoldersDaemon(tools: PdfEngineTools, intervalMs = 15000): void {
    if (this.folderWatchTimer) return;
    const timer = setInterval(() => {
      void this.getPolicies().then(policies => {
        if (this.folderWatchTimer === timer && policies.ingestion.folderWatchEnabled) return this.checkWatchedFolders(tools);
      }).catch(() => {});
    }, intervalMs);
    this.folderWatchTimer = timer;
    timer.unref();
  }

  public async stopWatchedFoldersDaemon(): Promise<void> {
    if (this.folderWatchTimer) {
      clearInterval(this.folderWatchTimer);
      this.folderWatchTimer = null;
    }
    this.folderScanController?.abort();
    await this.folderScan;
  }
}

export const stirlingProcessor = StirlingProcessorService.getInstance();
