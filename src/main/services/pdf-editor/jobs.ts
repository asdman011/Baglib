import path from 'node:path';
import { mkdir, mkdtemp, stat, lstat, realpath, readdir, unlink, rmdir, copyFile, chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import type { PdfEngineResult, PdfInspection, PdfJob, PdfJobRequest, PdfSession, PdfAsset, PdfOutput } from '../../../shared/types/pdf-editor';
import { validatePdfJob } from '../../../shared/types/pdf-editor';
import { fileSha256, resolvePdfSource, type PdfSource } from './source';
import { readerAssetUrl } from '../../../shared/utils/reader-asset-url';

export interface PdfWorkerInput { filename: string; output: string; operation: PdfJobRequest['operation']; password?: string; language: 'ar' | 'en'; expectedHash: string; payload?: Record<string, unknown>; sources?: Record<string, { filename: string; sha256: string }>; assets?: Record<string, string> }
export type PdfWorkerRunner = (input: PdfWorkerInput, signal: AbortSignal, progress: (current: number, total: number) => void) => Promise<PdfInspection | PdfEngineResult>;
interface SessionRecord { owner: number; source: PdfSource; session: PdfSession; working?: { path: string; sha256: string } }
interface JobRecord { owner: number; job: PdfJob; controller: AbortController; directory: string; settled: Promise<void> }
interface AssetRecord { owner: number; value: PdfAsset; filename: string }
const formats = new Set(['pdf', 'docx', 'xlsx', 'pptx', 'html', 'json', 'txt', 'md', 'csv', 'zip']);
const safeErrors = new Set(['source-changed', 'encrypted', 'permission-denied', 'unsupported', 'invalid-source', 'engine-missing', 'engine-failed', 'signed-document-locked', 'text-does-not-fit', 'owner-password-required', 'no-tables', 'no-redactions', 'certificate-invalid', 'invalid-output', 'document-too-large', 'invalid-request']);
export class PdfEditorJobs {
  private sessions = new Map<string, SessionRecord>();
  private jobs = new Map<string, JobRecord>();
  private assets = new Map<string, AssetRecord>();
  constructor(private db: Database, private root: string, private runner: PdfWorkerRunner) {}
  private storeSession(owner: number, source: PdfSource): PdfSession {
    const session: PdfSession = { id: randomUUID(), workId: source.workId, sourceId: source.sourceId, editionId: source.editionId, filename: source.path ? path.basename(source.path) : 'document.pdf', sha256: source.sha256 };
    if (source.path) session.previewUrl = `${readerAssetUrl(source.path)}?v=${source.sha256}`;
    this.sessions.set(session.id, { owner, source, session }); return structuredClone(session);
  }
  async open(owner: number, workId: string, sourceId?: string): Promise<PdfSession> {
    if (this.sessions.size >= 32) throw new Error('busy');
    return this.storeSession(owner, await resolvePdfSource(this.db, workId, sourceId));
  }
  async openPath(owner: number, filename: string): Promise<PdfSession> {
    if (this.sessions.size >= 32) throw new Error('busy');
    const canonical = await realpath(filename), info = await stat(canonical);
    if (!info.isFile() || info.size > 256 * 1024 * 1024 || path.extname(canonical).toLowerCase() !== '.pdf') throw new Error('invalid-source');
    return this.storeSession(owner, { workId: null, sourceId: null, editionId: null, path: canonical, sha256: await fileSha256(canonical) });
  }
  blank(owner: number): PdfSession {
    if (this.sessions.size >= 32) throw new Error('busy');
    return this.storeSession(owner, { workId: null, sourceId: null, editionId: null, path: '', sha256: '' });
  }
  async asset(owner: number, filename: string, kind: PdfAsset['kind']): Promise<PdfAsset> {
    if (!['image', 'certificate', 'trust-root'].includes(kind) || this.assets.size >= 100) throw new Error('invalid-request');
    const extension = path.extname(filename).toLowerCase();
    const allowed = kind === 'image' ? ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp'] : kind === 'certificate' ? ['.p12', '.pfx'] : ['.pem', '.crt', '.cer'];
    const source = await realpath(filename), info = await stat(source);
    if (!info.isFile() || info.size > 50 * 1024 * 1024 || !allowed.includes(extension)) throw new Error('invalid-source');
    await mkdir(path.join(this.root, 'assets'), { recursive: true, mode: 0o700 });
    const value: PdfAsset = { id: randomUUID(), filename: path.basename(source), kind };
    const target = path.join(this.root, 'assets', value.id + extension);
    await copyFile(source, target); await chmod(target, 0o600); this.assets.set(value.id, { owner, value, filename: target }); return value;
  }
  private session(owner: number, id: string): SessionRecord {
    const record = this.sessions.get(id); if (!record || record.owner !== owner) throw new Error('invalid-source'); return record;
  }
  source(owner: number, id: string): PdfSource { return structuredClone(this.session(owner, id).source); }
  rebase(owner: number, id: string, sha256: string, resetWorking = false): PdfSession {
    const record = this.session(owner, id);
    record.source.sha256 = sha256;
    record.session.sha256 = sha256;
    if (record.source.path) record.session.previewUrl = `${readerAssetUrl(record.source.path)}?v=${sha256}`;
    if (resetWorking) record.working = undefined;
    return structuredClone(record.session);
  }
  private ownedJob(owner: number, id: string): JobRecord {
    const record = this.jobs.get(id); if (!record || record.owner !== owner) throw new Error('invalid-request'); return record;
  }
  private async current(record: SessionRecord): Promise<PdfSource> {
    const current = record.source.workId && record.source.sourceId ? await resolvePdfSource(this.db, record.source.workId, record.source.sourceId) : record.source;
    if (current.path !== record.source.path || current.sha256 !== record.session.sha256 || current.path && await fileSha256(current.path) !== record.session.sha256) throw new Error('source-changed');
    return current;
  }
  async start(owner: number, unknownInput: unknown): Promise<PdfJob> {
    const input: PdfJobRequest = validatePdfJob(unknownInput), source = this.session(owner, input.sessionId);
    if ([...this.jobs.values()].filter(record => record.job.state === 'running').length >= 2 || [...this.jobs.values()].some(record => record.job.state === 'running' && record.job.sessionId === input.sessionId) || this.jobs.size >= 128) throw new Error('busy');
    const current = await this.current(source);
    const working = source.working || current;
    if (!working.path && input.operation !== 'create') throw new Error('invalid-source');
    if (working.path && await fileSha256(working.path) !== working.sha256) throw new Error('source-changed');
    const sources: NonNullable<PdfWorkerInput['sources']> = {};
    const plan = input.payload?.pages || input.payload?.items;
    if (Array.isArray(plan)) for (const item of plan) {
      const id = item?.sessionId;
      if (typeof id === 'string' && id !== 'current') { const record = this.session(owner, id); const value = record.working || await this.current(record); await this.current(record); sources[id] = { filename: value.path, sha256: value.sha256 }; }
    }
    const assets = Object.fromEntries([...this.assets].filter(([, asset]) => asset.owner === owner).map(([id, asset]) => [id, asset.filename]));
    await mkdir(this.root, { recursive: true });
    const directory = await mkdtemp(path.join(this.root, 'job-'));
    const job: PdfJob = { id: randomUUID(), sessionId: input.sessionId, operation: input.operation, state: 'running', current: 0, total: 0 };
    const controller = new AbortController();
    const record: JobRecord = { owner, job, controller, directory, settled: Promise.resolve() }; this.jobs.set(job.id, record);
    record.settled = this.runner({ filename: working.path, output: path.join(directory, 'document.html'), operation: input.operation, password: input.password, language: input.language, payload: input.payload, sources, assets, expectedHash: working.sha256 }, controller.signal, (current, total) => {
      if (job.state === 'running' && Number.isInteger(current) && Number.isInteger(total) && current >= 0 && total >= current && total <= 10000) { job.current = current; job.total = total; }
    }).then(async response => {
      if (controller.signal.aborted) return;
      await this.current(source);
      if ('totalPages' in response && 'pages' in response) job.inspection = response as PdfInspection;
      else {
        const result = response as PdfEngineResult; job.result = result;
        if (result.inspection) job.inspection = result.inspection;
        const manifest = result.outputs || (input.operation === 'export-html' ? [{ filename: 'document.html', format: 'html', bytes: 0, sha256: '' }] : []);
        if (manifest.length > 1000) throw new Error('invalid-output');
        const outputs: PdfOutput[] = [];
        for (const item of manifest) {
          if (typeof item.filename !== 'string' || path.basename(item.filename) !== item.filename || !formats.has(item.format) || path.extname(item.filename).slice(1) !== item.format) throw new Error('invalid-output');
          const filename = path.join(directory, item.filename), info = await lstat(filename);
          if (!info.isFile() || info.isSymbolicLink() || info.size > 512 * 1024 * 1024) throw new Error('invalid-output');
          const sha256 = await fileSha256(filename);
          if (item.sha256 && item.sha256 !== sha256) throw new Error('invalid-output');
          outputs.push({ filename: item.filename, format: item.format, bytes: info.size, sha256 });
        }
        if (outputs.length) {
          job.outputs = outputs; job.output = outputs[0];
          if (outputs.length === 1 && outputs[0].format === 'pdf') source.working = { path: path.join(directory, outputs[0].filename), sha256: outputs[0].sha256 };
        }
      }
      if (!controller.signal.aborted) job.state = 'completed';
    }).catch(error => {
      if (controller.signal.aborted) return;
      const code = (error as Error).message; job.error = safeErrors.has(code) ? code as NonNullable<PdfJob['error']> : 'storage'; job.state = 'failed';
    });
    return structuredClone(job);
  }
  status(owner: number, id: string): PdfJob { return structuredClone(this.ownedJob(owner, id).job); }
  cancel(owner: number, id: string): void { const record = this.ownedJob(owner, id); if (record.job.state !== 'running') return; record.controller.abort(); record.job.state = 'cancelled'; record.job.error = 'cancelled'; }
  async output(owner: number, id: string, index = 0): Promise<{ filename: string; sha256: string; format: PdfOutput['format']; job: PdfJob }> {
    const record = this.ownedJob(owner, id), output = record.job.outputs?.[index];
    if (record.job.state !== 'completed' || !output || !Number.isInteger(index)) throw new Error('invalid-request');
    const filename = path.join(record.directory, output.filename);
    if (await fileSha256(filename) !== output.sha256) throw new Error('source-changed');
    return { filename, sha256: output.sha256, format: output.format, job: structuredClone(record.job) };
  }
  async close(owner: number, id: string): Promise<void> {
    if (!this.sessions.has(id)) return;
    this.session(owner, id);
    for (const [jobId, record] of this.jobs) if (record.job.sessionId === id) {
      this.cancel(owner, jobId); await record.settled;
      for (const filename of await readdir(record.directory)) await unlink(path.join(record.directory, filename)).catch(() => {});
      await rmdir(record.directory).catch(() => {}); this.jobs.delete(jobId);
    }
    this.sessions.delete(id);
    if (![...this.sessions.values()].some(session => session.owner === owner)) await this.clearAssets(owner);
  }
  private async clearAssets(owner: number): Promise<void> {
    for (const [id, asset] of this.assets) if (asset.owner === owner) { await unlink(asset.filename).catch(() => {}); this.assets.delete(id); }
  }
  async closeOwner(owner: number): Promise<void> {
    for (const [id, record] of this.sessions) if (record.owner === owner) await this.close(owner, id).catch(() => {});
    await this.clearAssets(owner);
  }
}
