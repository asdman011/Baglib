import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SqliteSettingsRepository } from '../../database/repositories/settings.repository';
import { LECTURE_EXTENSIONS, lectureKind, type Lecture, type LectureProgress, type LectureSection } from '../../../shared/lectures';
import { readSections } from './media-sections';

const LIBRARY_KEY = 'media.lectures.v1';
const MAX_SHOT_BYTES = 12 * 1024 * 1024;

/**
 * Lectures sit outside the Work → Edition → Source library, so the list is a settings value.
 * Position reuses the audiobook progress table, keyed by the lecture id.
 */
export class LectureLibrary {
  private settings: SqliteSettingsRepository;
  constructor(private db: Database, private shots: string) { this.settings = new SqliteSettingsRepository(db); }

  list(): Lecture[] { return this.settings.get<Lecture[]>(LIBRARY_KEY) ?? []; }
  private store(lectures: Lecture[]): void { this.settings.set(LIBRARY_KEY, lectures); }
  private find(id: string): Lecture {
    const lecture = this.list().find(item => item.id === id);
    if (!lecture) throw new Error('invalid-request');
    return lecture;
  }

  async add(files: string[]): Promise<Lecture[]> {
    const current = this.list();
    const added: Lecture[] = [];
    for (const file of files) {
      const extension = path.extname(file).toLowerCase();
      if (!(LECTURE_EXTENSIONS as readonly string[]).includes(extension) || !(await stat(file)).isFile() || [...current, ...added].some(item => item.path === file)) continue;
      const sections = await readSections(file).catch(() => []);
      added.push({ id: randomUUID(), title: path.basename(file, path.extname(file)), path: file, kind: lectureKind(extension), sections, sectionSource: sections.length ? 'file' : 'none', addedAt: new Date().toISOString() });
    }
    this.store([...current, ...added]);
    return added;
  }

  /** The file and any notes stay; only the entry and its position go. */
  remove(id: string): void {
    this.find(id);
    this.store(this.list().filter(item => item.id !== id));
    this.db.prepare('DELETE FROM audiobook_playback_progress WHERE book_id = ?').run(id);
  }

  update(id: string, changes: { title?: string; sections?: LectureSection[] }): Lecture {
    const lecture = { ...this.find(id), ...(changes.title ? { title: changes.title } : {}), ...(changes.sections ? { sections: changes.sections, sectionSource: changes.sections.length ? 'user' as const : 'none' as const } : {}) };
    this.store(this.list().map(item => item.id === id ? lecture : item));
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
