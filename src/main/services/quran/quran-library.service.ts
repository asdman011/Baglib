import { randomUUID } from 'node:crypto';
import { mkdir, rm, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { QuranCategory, QuranJob, QuranError, QuranPack, QuranResource } from '../../../shared/types/quran';
import { QuranStore } from './quran-store';
import { parseResourceListing, parseResourceDetails } from './qul-catalog';
import { canonicalResourceId } from './reader-resources';

export type QuranInstaller = (request: { root: string; id: string; archive: string; resource: QuranResource }, signal: AbortSignal) => Promise<QuranPack>;

export class QuranLibraryService {
  readonly store: QuranStore;
  private pending = Promise.resolve();
  private transfers = Promise.resolve();
  private controllers = new Map<string, AbortController>();
  private disposed = false;
  constructor(readonly root: string, private readonly fetchHtml: (path: string) => Promise<string>, private readonly install: QuranInstaller, private readonly changed: () => void = () => {}) {
    this.store = new QuranStore(root);
  }
  async initialize(): Promise<void> {
    await mkdir(path.join(this.root, 'downloads'), { recursive: true });
    await mkdir(path.join(this.root, 'staging'), { recursive: true });
    await mkdir(path.join(this.root, 'packs'), { recursive: true });
    for (const folder of ['downloads', 'staging']) for (const entry of await readdir(path.join(this.root, folder))) {
      if (/^[a-f0-9-]{36}(?:\.download)?$/.test(entry)) await rm(path.join(this.root, folder, entry), { recursive: true, force: true });
    }
    for (const pack of this.store.packs()) {
      try { await readFile(path.join(this.root, 'packs', pack.id, 'manifest.json')); }
      catch { this.store.removePack(pack.id); }
    }
    const installed = new Set(this.store.packs().map(pack => pack.id));
    for (const id of await readdir(path.join(this.root, 'packs'))) if (/^[a-f0-9-]{36}$/.test(id) && !installed.has(id)) await rm(path.join(this.root, 'packs', id), { recursive: true, force: true });
  }
  async refresh(kind: QuranCategory): Promise<void> {
    const listing = parseResourceListing(await this.fetchHtml(`/resources/${kind}`), kind);
    if (!listing.length) throw new Error('network');
    if (this.disposed) return;
    this.store.saveResources(listing);
    this.changed();
  }
  async details(id: string): Promise<{ resource: QuranResource; downloads: string[] }> {
    const resource = this.store.resource(id);
    if (!resource) throw new Error('invalid-resource');
    const result = parseResourceDetails(await this.fetchHtml(resource.sourcePath), resource);
    if (this.disposed) throw new Error('unavailable');
    this.store.saveResources([result.resource]);
    return result;
  }
  createJob(id: string, queued = false): QuranJob {
    if (this.disposed) throw new Error('unavailable');
    const resource = this.store.resource(id);
    if (!resource) throw new Error('invalid-resource');
    if (resource.restricted) throw new Error('restricted');
    if ((!queued && this.store.jobs().filter(job => ['awaiting-download', 'downloading', 'installing'].includes(job.state)).length >= 3) || this.controllers.size >= 500) throw new Error('busy');
    const job: QuranJob = { id: randomUUID(), resourceId: id, title: resource.title, state: queued ? 'queued' : 'awaiting-download', received: 0, total: 0, error: null, updatedAt: new Date().toISOString() };
    this.controllers.set(job.id, new AbortController());
    this.update(job);
    return job;
  }
  enqueue(ids: string[], transfer: (job: QuranJob, signal: AbortSignal) => Promise<string | null>, keepInstalled = true): string[] {
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => typeof id !== 'string' || !this.store.resource(id))) throw new Error('invalid-resource');
    const selected = [...new Set(ids)].filter(id => !keepInstalled || !this.store.packs().some(pack => canonicalResourceId(pack.resource.id) === id));
    const active = this.store.jobs().filter(job => ['queued', 'awaiting-download', 'downloading', 'installing'].includes(job.state));
    const pending = selected.filter(id => !active.some(job => job.resourceId === id));
    if (this.controllers.size + pending.length > 500) throw new Error('busy');
    if (pending.some(id => this.store.resource(id)?.restricted)) throw new Error('restricted');
    const jobs = pending.map(id => this.createJob(id, true));
    for (const job of jobs) {
      const controller = this.controllers.get(job.id)!;
      this.transfers = this.transfers.then(async () => {
        if (this.disposed || controller.signal.aborted) return;
        try {
          this.update({ ...job, state: 'downloading' });
          const filename = await transfer(job, controller.signal);
          if (controller.signal.aborted || this.disposed) return;
          if (filename) await this.installFile(job, filename);
          else this.update({ ...(this.store.jobs().find(value => value.id === job.id) || job), state: 'complete' });
        } catch (cause) {
          if (!this.disposed && !controller.signal.aborted) {
            const message = cause instanceof Error ? cause.message : '';
            this.fail(job, ['restricted', 'unsupported-format', 'invalid-package', 'invalid-resource'].includes(message) ? message as QuranError : 'network');
          }
        } finally {
          this.controllers.delete(job.id);
          await rm(path.join(this.root, 'downloads', `${job.id}.download`), { force: true });
        }
      }).catch(() => {});
    }
    return [...active.filter(job => selected.includes(job.resourceId)).map(job => job.id), ...jobs.map(job => job.id)];
  }
  update(job: QuranJob): void {
    if (this.disposed) return;
    const previous = this.store.jobs().find(value => value.id === job.id);
    if (previous && ['complete', 'failed', 'cancelled'].includes(previous.state)) return;
    this.store.saveJob({ ...previous, ...job, updatedAt: new Date().toISOString() });
    this.changed();
  }
  async installFile(job: QuranJob, filename: string): Promise<void> {
    const controller = this.controllers.get(job.id);
    if (!controller || controller.signal.aborted) return;
    this.update({ ...job, state: 'installing' });
    const action = this.pending.then(async () => {
      if (controller.signal.aborted || this.disposed) return;
      try {
        const resource = this.store.resource(job.resourceId);
        if (!resource) throw new Error('invalid-resource');
        const pack = await this.install({ root: this.root, id: job.id, archive: filename, resource }, controller.signal);
        if (controller.signal.aborted || this.disposed) return;
        this.store.savePack(pack);
        this.update({ ...job, state: 'complete' });
      } catch (cause) {
        if (this.disposed) return;
        const message = cause instanceof Error ? cause.message : '';
        const error: QuranError = ['invalid-package', 'unsupported-format', 'storage', 'cancelled'].includes(message) ? message as QuranError : 'invalid-package';
        this.update({ ...job, state: controller.signal.aborted ? 'cancelled' : 'failed', error });
      } finally {
        this.controllers.delete(job.id);
        const download = path.join(this.root, 'downloads', `${job.id}.download`);
        await rm(download, { force: true });
        if (!this.store.packs().some(pack => pack.id === job.id)) {
          for (const folder of ['staging', 'packs']) await rm(path.join(this.root, folder, job.id), { recursive: true, force: true });
        }
      }
    });
    this.pending = action.catch(() => {});
    await action;
  }
  fail(job: QuranJob, error: QuranError): void {
    this.controllers.get(job.id)?.abort();
    this.controllers.delete(job.id);
    this.update({ ...(this.store.jobs().find(value => value.id === job.id) || job), state: error === 'cancelled' ? 'cancelled' : 'failed', error });
  }
  cancel(id: string): void {
    const job = this.store.jobs().find(item => item.id === id);
    if (!job || ['complete', 'cancelled', 'failed'].includes(job.state)) return;
    this.fail(job, 'cancelled');
  }
  async remove(id: string): Promise<void> {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('invalid-resource');
    if (!this.store.packs().some(pack => pack.id === id)) throw new Error('invalid-resource');
    await rm(path.join(this.root, 'packs', id), { recursive: true, force: true });
    this.store.removePack(id);
    this.changed();
  }
  get busy(): boolean { return this.controllers.size > 0; }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    await this.transfers;
    await this.pending;
    this.store.close();
  }
}
