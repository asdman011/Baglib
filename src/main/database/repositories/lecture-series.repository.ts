import path from 'node:path';
import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { LECTURE_EXTENSIONS } from '../../../shared/lectures';
import { validSeriesName, type LectureSeries } from '../../../shared/lecture-series';

const MEDIA_WORK = `EXISTS (SELECT 1 FROM edition e JOIN source s ON s.edition_id=e.id
  JOIN file_source_detail f ON f.source_id=s.id WHERE e.work_id=w.id AND f.file_path IS NOT NULL
  AND lower(f.file_format) IN (${LECTURE_EXTENSIONS.map(extension => "'" + extension.slice(1) + "'").join(',')}))`;

export class LectureSeriesRepository {
  constructor(private db: Database) {}
  list(): LectureSeries[] {
    const series = this.db.prepare('SELECT id,name,autoplay_next AS autoplayNext,created_at AS createdAt,updated_at AS updatedAt FROM lecture_series ORDER BY created_at,id').all() as Omit<LectureSeries, 'items'>[];
    const items = this.db.prepare(`SELECT i.series_id AS seriesId,i.work_id AS workId,w.title,COALESCE(p.is_completed,0) AS completed
      FROM lecture_series_item i JOIN work w ON w.id=i.work_id
      LEFT JOIN audiobook_playback_progress p ON p.book_id=w.id
      WHERE w.deleted_at IS NULL AND w.work_type_id='wt-lecture' AND ${MEDIA_WORK} ORDER BY i.position,i.work_id`).all() as { seriesId: string; workId: string; title: string; completed: number }[];
    return series.map(row => ({ ...row, autoplayNext: !!row.autoplayNext, items: items.filter(item => item.seriesId === row.id).map(item => ({ workId: item.workId, title: item.title, completed: !!item.completed })) }));
  }
  /** Each import owns its series. Existing names are never implicitly reused. */
  importFiles(selected: string[], imported: { path: string; workId: string }[], folders: string[] = []): void {
    const key = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
    const groups = new Map<string, string[]>();
    for (const file of new Set(selected.map(file => path.resolve(file)))) {
      if (!(LECTURE_EXTENSIONS as readonly string[]).includes(path.extname(file).toLowerCase())) continue;
      const folder = key(path.dirname(file));
      groups.set(folder, [...(groups.get(folder) ?? []), file]);
    }
    const total = [...groups.values()].reduce((count, files) => count + files.length, 0);
    const collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });
    this.db.transaction(() => {
      for (const [folder, files] of groups) {
        if (total < 2 && !folders.some(value => key(path.resolve(value)) === folder)) continue;
        const members = imported.filter(item => files.some(file => key(file) === key(path.resolve(item.path))))
          .sort((a, b) => collator.compare(path.basename(a.path), path.basename(b.path)) || a.path.localeCompare(b.path));
        if (!members.length) continue;
        const series = this.create(path.basename(path.dirname(files[0])).slice(0, 200));
        for (const item of members) this.assign(item.workId, series.id);
      }
    })();
  }
  private requireSeries(id: string): void {
    if (!this.db.prepare('SELECT id FROM lecture_series WHERE id=?').get(id)) throw new Error('invalid-request');
  }
  private touch(id: string): void { this.db.prepare('UPDATE lecture_series SET updated_at=? WHERE id=?').run(new Date().toISOString(), id); }
  create(name: string): LectureSeries {
    const id = randomUUID(), now = new Date().toISOString();
    this.db.prepare('INSERT INTO lecture_series(id,name,created_at,updated_at) VALUES (?,?,?,?)').run(id, validSeriesName(name), now, now);
    return this.list().find(item => item.id === id)!;
  }
  update(id: string, changes: { name?: unknown; autoplayNext?: unknown }): void {
    this.requireSeries(id);
    if (!changes || Array.isArray(changes) || typeof changes !== 'object' || (changes.autoplayNext !== undefined && typeof changes.autoplayNext !== 'boolean')) throw new Error('invalid-request');
    const name = changes.name === undefined ? null : validSeriesName(changes.name);
    this.db.prepare('UPDATE lecture_series SET name=COALESCE(?,name),autoplay_next=COALESCE(?,autoplay_next),updated_at=? WHERE id=?')
      .run(name, changes.autoplayNext === undefined ? null : Number(changes.autoplayNext), new Date().toISOString(), id);
  }
  remove(id: string): void { this.requireSeries(id); this.db.prepare('DELETE FROM lecture_series WHERE id=?').run(id); }
  assign(workId: string, seriesId: string | null): void {
    this.db.transaction(() => {
      if (!this.db.prepare(`SELECT w.id FROM work w WHERE w.id=? AND w.work_type_id='wt-lecture' AND w.deleted_at IS NULL AND ${MEDIA_WORK}`).get(workId)) throw new Error('invalid-request');
      if (seriesId !== null) this.requireSeries(seriesId);
      const old = this.db.prepare('SELECT series_id AS id FROM lecture_series_item WHERE work_id=?').get(workId) as { id: string } | undefined;
      if (old?.id === seriesId) return;
      this.db.prepare('DELETE FROM lecture_series_item WHERE work_id=?').run(workId);
      if (seriesId !== null) {
        const position = (this.db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS next FROM lecture_series_item WHERE series_id=?').get(seriesId) as { next: number }).next;
        this.db.prepare('INSERT INTO lecture_series_item(series_id,work_id,position) VALUES (?,?,?)').run(seriesId, workId, position);
        this.touch(seriesId);
      }
      if (old) this.touch(old.id);
    })();
  }
  reorder(id: string, workIds: unknown): void {
    this.db.transaction(() => {
      this.requireSeries(id);
      if (!Array.isArray(workIds) || workIds.length > 10_000 || workIds.some(value => typeof value !== 'string') || new Set(workIds).size !== workIds.length) throw new Error('invalid-request');
      const current = this.db.prepare(`SELECT i.work_id AS id,i.position FROM lecture_series_item i JOIN work w ON w.id=i.work_id WHERE i.series_id=? AND w.deleted_at IS NULL AND w.work_type_id='wt-lecture' AND ${MEDIA_WORK} ORDER BY i.position,i.work_id`).all(id) as { id: string; position: number }[];
      if (current.length !== workIds.length || current.some(row => !workIds.includes(row.id))) throw new Error('invalid-request');
      const update = this.db.prepare('UPDATE lecture_series_item SET position=? WHERE series_id=? AND work_id=?');
      workIds.forEach((workId, index) => update.run(current[index].position, id, workId));
      this.touch(id);
    })();
  }
}
