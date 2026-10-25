import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { QuranJob, QuranLibrary, QuranPack, QuranResource, QuranCategory } from '../../../shared/types/quran';
import { normalizeQuranSearch } from './qul-catalog';

export class QuranStore {
  private readonly database: Database.Database;
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true });
    this.database = new Database(path.join(directory, 'catalog.sqlite'));
    const version = this.database.pragma('user_version', { simple: true });
    if (version !== 0 && version !== 1) { this.database.close(); throw new Error('unavailable'); }
    this.database.pragma('journal_mode = WAL');
    this.database.exec(`CREATE TABLE IF NOT EXISTS resources(id TEXT PRIMARY KEY, category TEXT NOT NULL, search TEXT NOT NULL, descriptor TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS resource_category ON resources(category);
      CREATE TABLE IF NOT EXISTS packs(id TEXT PRIMARY KEY, resource_id TEXT NOT NULL, descriptor TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS pack_resource ON packs(resource_id);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, descriptor TEXT NOT NULL);`);
    this.database.pragma('user_version = 1');
    for (const job of this.jobs()) if (['queued', 'awaiting-download', 'downloading', 'installing'].includes(job.state)) this.saveJob({ ...job, state: 'failed', error: 'interrupted', updatedAt: new Date().toISOString() });
  }
  resource(id: string): QuranResource | null {
    const row = this.database.prepare('SELECT descriptor FROM resources WHERE id = ?').get(id) as { descriptor: string } | undefined;
    return row ? JSON.parse(row.descriptor) : null;
  }
  saveResources(resources: QuranResource[]): void {
    const insert = this.database.prepare('INSERT INTO resources VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET category=excluded.category, search=excluded.search, descriptor=excluded.descriptor');
    this.database.transaction(() => { for (const resource of resources) insert.run(resource.id, resource.category, normalizeQuranSearch(resource.title), JSON.stringify(resource)); })();
  }
  saveJob(job: QuranJob): void { this.database.prepare('INSERT OR REPLACE INTO jobs VALUES (?, ?)').run(job.id, JSON.stringify(job)); }
  jobs(): QuranJob[] { return (this.database.prepare('SELECT descriptor FROM jobs ORDER BY rowid DESC LIMIT 1000').all() as { descriptor: string }[]).map(row => JSON.parse(row.descriptor)); }
  packs(): QuranPack[] { return (this.database.prepare('SELECT descriptor FROM packs').all() as { descriptor: string }[]).map(row => JSON.parse(row.descriptor)); }
  savePack(pack: QuranPack): void { this.database.prepare('INSERT INTO packs VALUES (?, ?, ?)').run(pack.id, pack.resource.id, JSON.stringify(pack)); }
  removePack(id: string): void { this.database.prepare('DELETE FROM packs WHERE id=?').run(id); }
  removeResource(id: string): void { this.database.prepare('DELETE FROM resources WHERE id=?').run(id); }
  library(query: { category?: QuranCategory; search?: string; offset?: number; view?: 'all' | 'installed' | 'downloads' } = {}): QuranLibrary {
    const search = normalizeQuranSearch(query.search || '').slice(0, 200);
    const rows = this.database.prepare('SELECT descriptor FROM resources WHERE (? IS NULL OR category=?) AND instr(search, ?) > 0 ORDER BY search LIMIT 61 OFFSET ?').all(query.category || null, query.category || null, search, query.offset || 0) as { descriptor: string }[];
    const resources = rows.slice(0, 60).map(row => JSON.parse(row.descriptor) as QuranResource);
    const packs = query.view === 'installed'
      ? this.database.prepare('SELECT descriptor FROM packs ORDER BY rowid DESC LIMIT 61 OFFSET ?').all(query.offset || 0) as { descriptor: string }[]
      : resources.length ? this.database.prepare(`SELECT descriptor FROM packs WHERE rowid IN (SELECT MAX(rowid) FROM packs WHERE resource_id IN (${resources.map(() => '?').join(',')}) GROUP BY resource_id)`).all(...resources.map(resource => resource.id)) as { descriptor: string }[] : [];
    return { resources, installed: packs.slice(0, 60).map(row => JSON.parse(row.descriptor)), jobs: this.jobs(), directory: this.directory, hasMore: query.view === 'installed' ? packs.length > 60 : rows.length > 60, catalogStatus: 'cached-partial' };
  }
  close(): void { this.database.close(); }
}
