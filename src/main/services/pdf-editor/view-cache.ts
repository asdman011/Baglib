import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdir, realpath, stat, lstat, readFile, writeFile, readdir, rename, unlink, open, utimes } from 'node:fs/promises';
import { readerAssetUrl } from '../../../shared/utils/reader-asset-url';
import type { PdfViewPreview, PdfViewSource } from '../../../shared/types/pdf-editor';

interface Fingerprint { path: string; mtimeMs: number; size: number }
interface Lease { owner: number; path: string; key: string; cached: boolean; watcher?: FSWatcher }
export type PdfViewOptimizer = (source: string, output: string, maxBytes: number, signal: AbortSignal) => Promise<void>;

export class PdfViewCache {
  private leases = new Map<string, Lease>();
  private pending = new Set<string>();
  private failed = new Set<string>();
  private queue = Promise.resolve();
  private lock = Promise.resolve();
  private controller = new AbortController();
  private initialized?: Promise<void>;
  private closed = false;

  constructor(private root: string, private optimizer: PdfViewOptimizer, private options: { maxBytes?: number; largeBytes?: number; previewBytes?: number; optimizeDelayMs?: number; onChanged?: (owner: number, id: string) => void } = {}) {}
  private get cap(): number { return this.options.maxBytes ?? 2 * 1024 * 1024 * 1024; }
  private get workRoot(): string { return this.root + '-work'; }
  private get previewRoot(): string { return this.root + '-preview'; }
  private previewFile(key: string, page: number): string { return path.join(this.previewRoot, `${key}-${page}.json`); }
  private key(source: Fingerprint): string { return createHash('sha256').update(JSON.stringify({ version: 2, ...source, path: process.platform === 'win32' ? source.path.toLowerCase() : source.path })).digest('hex'); }
  private filename(key: string, extension: string): string { return path.join(this.root, `${key}.${extension}`); }
  private async initialize(): Promise<void> {
    this.initialized ||= (async () => {
      for (const directory of [this.root, this.workRoot, this.previewRoot]) {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        if ((await lstat(directory)).isSymbolicLink()) throw new Error('invalid-source');
      }
      for (const name of await readdir(this.workRoot)) {
        const match = /^[a-f0-9]{64}-(\d+)-[a-f0-9-]+\.pdf$/u.exec(name);
        if (!match) continue;
        try { process.kill(Number(match[1]), 0); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') await unlink(path.join(this.workRoot, name)).catch(() => undefined); }
      }
      await this.prune(0);
    })();
    await this.initialized;
  }
  private async exclusive<Result>(work: () => Promise<Result>): Promise<Result> {
    const result = this.lock.then(work);
    this.lock = result.then(() => undefined, () => undefined);
    return result;
  }
  private async fingerprint(filename: string): Promise<Fingerprint> {
    const canonical = await realpath(filename), info = await stat(canonical);
    if (!info.isFile() || path.extname(filename).toLowerCase() !== '.pdf') throw new Error('invalid-source');
    return { path: canonical, mtimeMs: info.mtimeMs, size: info.size };
  }
  private async eligible(source: Fingerprint): Promise<boolean> {
    if (source.size < 8) return false;
    if (source.size >= (this.options.largeBytes ?? 16 * 1024 * 1024)) return true;
    const file = await open(source.path, 'r');
    try {
      const data = Buffer.alloc(Math.min(65536, source.size));
      await file.read(data, 0, data.length, source.size - data.length);
      return /\/Prev\s+\d+/u.test(data.toString('latin1'));
    } finally { await file.close(); }
  }
  private async valid(key: string, source: Fingerprint): Promise<boolean> {
    try {
      const pdf = await lstat(this.filename(key, 'pdf')), meta = await lstat(this.filename(key, 'json'));
      if (!pdf.isFile() || pdf.isSymbolicLink() || !meta.isFile() || meta.isSymbolicLink() || meta.size > 65536) return false;
      const value = JSON.parse(await readFile(this.filename(key, 'json'), 'utf8'));
      if (value.version !== 2 || value.key !== key || value.bytes !== pdf.size || this.key(value.source) !== key || this.key(source) !== key) return false;
      const file = await open(this.filename(key, 'pdf'), 'r');
      try { const header = Buffer.alloc(5); await file.read(header, 0, 5, 0); return header.toString() === '%PDF-'; }
      finally { await file.close(); }
    } catch { return false; }
  }
  private pinned(key: string): boolean { return [...this.leases.values()].some(lease => lease.key === key && lease.cached); }
  private async prune(reserve: number, keep?: string): Promise<boolean> {
    const files = await Promise.all((await readdir(this.root)).map(async name => {
      const info = await lstat(path.join(this.root, name));
      return { name, bytes: info.size, used: info.mtimeMs, regular: info.isFile(), key: /^([a-f0-9]{64})\.(pdf|json|json\.tmp)$/u.exec(name)?.[1] };
    }));
    let total = files.reduce((sum, file) => sum + (file.regular ? file.bytes : 0), 0);
    const groups = new Map<string, { used: number; files: typeof files }>();
    for (const file of files) {
      if (!file.regular || !file.key) continue;
      const group = groups.get(file.key) || { used: file.used, files: [] };
      group.files.push(file);
      if (file.name.endsWith('.pdf')) group.used = file.used;
      groups.set(file.key, group);
    }
    for (const [key, group] of [...groups].sort((first, second) => first[1].used - second[1].used)) {
      if (total + reserve <= this.cap) break;
      if (key === keep || this.pinned(key)) continue;
      for (const file of group.files) {
        try { await unlink(path.join(this.root, file.name)); total -= file.bytes; }
        catch { }
      }
    }
    return total + reserve <= this.cap;
  }
  private enqueue(source: Fingerprint, key: string): void {
    if (this.pending.has(key) || this.failed.has(key) || this.closed) return;
    this.pending.add(key);
    this.queue = this.queue.then(async () => {
      const output = path.join(this.workRoot, `${key}-${process.pid}-${randomUUID()}.pdf`);
      try {
        if (this.closed) return;
        if (this.options.optimizeDelayMs) {
          await sleep(this.options.optimizeDelayMs, undefined, { signal: this.controller.signal });
          if (![...this.leases.values()].some(lease => lease.key === key)) return;
        }
        if (this.key(await this.fingerprint(source.path)) !== key) return;
        await this.optimizer(source.path, output, this.cap, this.controller.signal);
        if (this.closed || this.key(await this.fingerprint(source.path)) !== key) return;
        const info = await lstat(output);
        if (!info.isFile() || info.isSymbolicLink() || info.size > this.cap) throw new Error('invalid-output');
        const file = await open(output, 'r');
        try {
          const header = Buffer.alloc(5);
          await file.read(header, 0, header.length, 0);
          if (header.toString() !== '%PDF-') throw new Error('invalid-output');
        } finally { await file.close(); }
        const metadata = JSON.stringify({ version: 2, key, source, bytes: info.size });
        await this.exclusive(async () => {
          if (this.closed || this.key(await this.fingerprint(source.path)) !== key) return;
          if (await this.valid(key, source)) return;
          if (!await this.prune(info.size + Buffer.byteLength(metadata) * 2, key)) return;
          await writeFile(this.filename(key, 'json.tmp'), metadata, { mode: 0o600 });
          await rename(output, this.filename(key, 'pdf'));
          await rename(this.filename(key, 'json.tmp'), this.filename(key, 'json'));
        });
        for (const [id, lease] of this.leases) if (lease.key === key) this.options.onChanged?.(lease.owner, id);
      } catch (error) {
        if (!this.closed) {
          this.failed.add(key);
          if (this.failed.size > 128) this.failed.delete(this.failed.values().next().value!);
          console.warn('[pdf-view-cache] Optimization unavailable; retaining original:', (error as Error).message);
        }
      } finally {
        this.pending.delete(key);
        await unlink(output).catch(() => undefined);
        await unlink(this.filename(key, 'json.tmp')).catch(() => undefined);
      }
    });
  }
  async acquire(owner: number, filename: string, id?: string, previewPage?: number): Promise<PdfViewSource> {
    if (this.closed) throw new Error('cancelled');
    const source = await this.fingerprint(filename), key = this.key(source);
    await this.initialize();
    const eligible = await this.eligible(source);
    return this.exclusive(async () => {
      if (this.closed) throw new Error('cancelled');
      let lease = id ? this.leases.get(id) : undefined;
      const firstAcquire = !lease;
      if (id && (!lease || lease.owner !== owner || path.resolve(lease.path) !== path.resolve(filename))) throw new Error('invalid-request');
      const cached = await this.valid(key, source);
      if (!lease) {
        id = randomUUID();
        lease = { owner, path: filename, key, cached };
        this.leases.set(id, lease);
        try {
          const leaseId = id;
          lease.watcher = watch(path.dirname(filename), { persistent: false }, (_, changed) => {
            if (!changed || changed.toString().toLowerCase() === path.basename(filename).toLowerCase()) this.options.onChanged?.(owner, leaseId);
          });
          lease.watcher.on('error', () => lease?.watcher?.close());
        } catch { }
      }
      if (cached && (firstAcquire || !lease.cached || lease.key !== key)) await utimes(this.filename(key, 'pdf'), new Date(), new Date());
      lease.key = key; lease.cached = cached;
      if (!cached && eligible) this.enqueue(source, key);
      const preview = previewPage ? await this.readPreview(key, previewPage) : null;
      return { id: id!, key, url: `${readerAssetUrl(cached ? this.filename(key, 'pdf') : source.path)}?view=${key}`, cached, pending: this.pending.has(key), ...(preview ? { preview } : {}) };
    });
  }
  private async readPreview(key: string, page: number): Promise<PdfViewPreview | null> {
    if (!Number.isInteger(page) || page < 1) return null;
    try {
      const value = JSON.parse(await readFile(this.previewFile(key, page), 'utf8')) as PdfViewPreview;
      return typeof value.image === 'string' && value.image.startsWith('data:image/') && value.width > 0 && value.height > 0 && value.pages >= page ? value : null;
    } catch { return null; }
  }
  /** Stores a small first-paint image for a page, keyed like the view cache by path, mtime and size. */
  async savePreview(owner: number, id: string, page: number, preview: PdfViewPreview): Promise<void> {
    const lease = this.leases.get(id);
    if (!lease || lease.owner !== owner || !Number.isInteger(page) || page < 1) throw new Error('invalid-request');
    if (typeof preview.image !== 'string' || !/^data:image\/(?:webp|jpeg);base64,/u.test(preview.image) || preview.image.length > 2 * 1024 * 1024) throw new Error('invalid-request');
    if (![preview.width, preview.height, preview.pages].every(value => Number.isFinite(value) && value > 0)) throw new Error('invalid-request');
    await this.initialize();
    await this.exclusive(async () => {
      const target = this.previewFile(lease.key, page), temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(preview), { mode: 0o600 });
        await rename(temporary, target);
      } finally { await unlink(temporary).catch(() => undefined); }
      const files = await Promise.all((await readdir(this.previewRoot)).map(async name => ({ name, info: await lstat(path.join(this.previewRoot, name)) })));
      let total = files.reduce((sum, file) => sum + file.info.size, 0);
      for (const file of files.sort((first, second) => first.info.mtimeMs - second.info.mtimeMs)) {
        if (total <= (this.options.previewBytes ?? 64 * 1024 * 1024)) break;
        if (path.join(this.previewRoot, file.name) === target) continue;
        await unlink(path.join(this.previewRoot, file.name)).catch(() => undefined);
        total -= file.info.size;
      }
    });
  }
  /** Drops a derivative that failed while reading. The metadata goes first so it stays invalid even if Windows keeps the PDF open. */
  async evict(owner: number, id: string): Promise<void> {
    const lease = this.leases.get(id);
    if (!lease || lease.owner !== owner) return;
    await this.exclusive(async () => {
      this.failed.add(lease.key);
      lease.cached = false;
      await unlink(this.filename(lease.key, 'json')).catch(() => undefined);
      await unlink(this.filename(lease.key, 'pdf')).catch(() => undefined);
    });
  }
  release(owner: number, id: string): void {
    const lease = this.leases.get(id);
    if (!lease || lease.owner !== owner) return;
    lease.watcher?.close();
    this.leases.delete(id);
  }
  closeOwner(owner: number): void { for (const [id, lease] of this.leases) if (lease.owner === owner) this.release(owner, id); }
  async settled(): Promise<void> { await this.queue; }
  async dispose(): Promise<void> {
    this.closed = true;
    this.controller.abort();
    for (const [id, lease] of this.leases) this.release(lease.owner, id);
    await this.queue;
  }
}
