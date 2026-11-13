import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SqliteSettingsRepository } from '../../database/repositories/settings.repository';
import { LECTURE_EXTENSIONS, lectureKind, type Lecture, type LectureProgress, type LectureSection } from '../../../shared/lectures';
import { SqliteWorkRepository } from '../../database/repositories/work.repository';
import { readLectureMetadata } from './media-metadata';
import type { DigitalFormat } from '../../../shared/types/work';
import { readSections } from './media-sections';

const LIBRARY_KEY = 'media.lectures.v1';
const MAX_SHOT_BYTES = 12 * 1024 * 1024;

/** Lecture Works use the approved Work → Edition → Source model. Existing settings retain user sections. */
export class LectureLibrary {
  private settings: SqliteSettingsRepository;
  constructor(private db: Database, private shots: string) { this.settings = new SqliteSettingsRepository(db); }

  list(): Lecture[] {
    const legacy = this.settings.get<Lecture[]>(LIBRARY_KEY) ?? [];
    this.db.transaction(() => {
      if (this.settings.get('media.lectures-works.v1')) return;
      const repository = new SqliteWorkRepository(this.db);
      for (const lecture of legacy) {
        if (typeof lecture.title !== 'string' || typeof lecture.path !== 'string' || this.db.prepare('SELECT id FROM work WHERE id=?').get(lecture.id)) continue;
        repository.addBook({ id: lecture.id, title: lecture.title, workType: 'lecture', bookType: 'digital', filePath: lecture.path, digitalFormat: path.extname(lecture.path).slice(1).toLowerCase() as DigitalFormat });
      }
      this.settings.set('media.lectures-works.v1', true);
      this.store(legacy);
    })();
    const rows = this.db.prepare(`SELECT w.id, w.title, f.file_path AS path, w.created_at AS addedAt
      FROM work w JOIN edition e ON e.work_id=w.id JOIN source s ON s.edition_id=e.id
      JOIN file_source_detail f ON f.source_id=s.id
      WHERE w.work_type_id='wt-lecture' AND w.deleted_at IS NULL AND f.file_path IS NOT NULL
        AND lower(f.file_format) IN (${LECTURE_EXTENSIONS.map(() => '?').join(',')})
      ORDER BY w.created_at, e.rowid, s.rowid`).all(...LECTURE_EXTENSIONS.map(extension => extension.slice(1))) as { id: string; title: string; path: string; addedAt: string }[];
    const seen = new Set<string>();
    return rows.filter(row => { if (seen.has(row.id)) return false; seen.add(row.id); return true; }).map(row => {
      const saved = legacy.find(item => item.id === row.id);
      return { ...row, kind: lectureKind(path.extname(row.path)), sections: saved?.sections ?? [], sectionSource: saved?.sectionSource ?? 'none' };
    });
  }
  private store(lectures: Lecture[]): void {
    this.settings.set(LIBRARY_KEY, lectures.map(({ id, sections, sectionSource }) => ({ id, sections, sectionSource })));
  }
  private find(id: string): Lecture {
    const lecture = this.list().find(item => item.id === id);
    if (!lecture) throw new Error('invalid-request');
    return lecture;
  }

  async add(files: string[]): Promise<Lecture[]> {
    this.list();
    const added: Lecture[] = [];
    for (const file of files) {
      const extension = path.extname(file).toLowerCase();
      if (!(LECTURE_EXTENSIONS as readonly string[]).includes(extension) || !(await stat(file)).isFile()) continue;
      const canonical = path.resolve(file);
      const samePath = (value: string) => process.platform === 'win32' ? value.toLowerCase() === canonical.toLowerCase() : value === canonical;
      const metadata = await readLectureMetadata(canonical);
      const sections = await readSections(canonical).catch(() => []);
      this.db.transaction(() => {
        if (this.list().some(item => samePath(item.path))) return;
        const id = randomUUID();
        new SqliteWorkRepository(this.db).addBook({ id, title: metadata.title!, author: metadata.speaker, speaker: metadata.speaker,
          recordingDate: metadata.recordingDate, workType: 'lecture', bookType: 'digital', filePath: canonical, digitalFormat: metadata.format, language: metadata.language });
        const lecture: Lecture = { id, title: metadata.title!, path: canonical, kind: lectureKind(extension), sections, sectionSource: sections.length ? 'file' : 'none', addedAt: new Date().toISOString() };
        this.store([...(this.settings.get<Lecture[]>(LIBRARY_KEY) ?? []), lecture]);
        added.push(lecture);
      })();
    }
    return added;
  }

  /** The file and any notes stay; only the entry and its position go. */
  remove(id: string): void {
    this.find(id);
    new SqliteWorkRepository(this.db).softDeleteBook(id);
    this.store((this.settings.get<Lecture[]>(LIBRARY_KEY) ?? []).filter(item => item.id !== id));
    this.db.prepare('DELETE FROM audiobook_playback_progress WHERE book_id = ?').run(id);
  }

  update(id: string, changes: { title?: string; sections?: LectureSection[] }): Lecture {
    const lecture = { ...this.find(id), ...(changes.title ? { title: changes.title } : {}), ...(changes.sections ? { sections: changes.sections, sectionSource: changes.sections.length ? 'user' as const : 'none' as const } : {}) };
    this.db.transaction(() => {
      this.db.prepare('UPDATE work SET title=? WHERE id=?').run(lecture.title, id);
      const saved = this.settings.get<Lecture[]>(LIBRARY_KEY) ?? [];
      this.store([...saved.filter(item => item.id !== id), lecture]);
    })();
    return lecture;
  }

  progress(id: string): LectureProgress | null {
    const row = this.db.prepare('SELECT current_time_seconds AS position, playback_rate AS rate, is_completed AS completed FROM audiobook_playback_progress WHERE book_id = ?').get(id) as { position: number; rate: number; completed: number } | undefined;
    return row ? { position: row.position, rate: row.rate, completed: row.completed === 1 } : null;
  }

  saveProgress(id: string, progress: LectureProgress): void {
    this.find(id);
    this.db.prepare(`INSERT INTO audiobook_playback_progress (book_id, current_file_id, current_time_seconds, playback_rate, is_completed, last_played_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(book_id) DO UPDATE SET current_time_seconds=excluded.current_time_seconds, playback_rate=excluded.playback_rate,
      is_completed=excluded.is_completed, last_played_at=excluded.last_played_at`).run(id, id, progress.position, progress.rate, progress.completed ? 1 : 0, new Date().toISOString());
  }

  /** A video frame from the renderer, kept beside the profile and referenced by id from notes. */
  async saveShot(id: string, png: string): Promise<string> {
    this.find(id);
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/u.exec(png);
    const bytes = match ? Buffer.from(match[1], 'base64') : null;
    if (!bytes || bytes.length < 8 || bytes.length > MAX_SHOT_BYTES || bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('invalid-request');
    const shot = randomUUID();
    await mkdir(this.shots, { recursive: true });
    await writeFile(path.join(this.shots, `${shot}.png`), bytes);
    return shot;
  }
}
