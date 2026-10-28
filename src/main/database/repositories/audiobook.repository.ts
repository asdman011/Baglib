interface AudiobookRow { book_id: string; title: string; narrator?: string; source_type: 'local' | 'audiobookshelf' | 'epub_smil'; server_url?: string; audio_files: string; chapter_mappings: string; created_at: string; updated_at: string; }
interface AudioProgressRow { book_id: string; current_file_id: string; current_time_seconds: number; playback_rate: number; is_completed: number; last_played_at: string; }
/**
 * Baglib — SQLite Audiobook Pairing & Playback Progress Repository (KEY-145)
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../connection';
import type {
  AudiobookPairingData,
  AudiobookPlaybackProgress,
  SaveAudiobookPairingPayload,
} from '../../../shared/types/audio';

export class SqliteAudiobookRepository {
  constructor(private db?: Database.Database) {}

  private getDb(): Database.Database {
    return this.db ?? getDatabase();
  }

  /**
   * Retrieves active audiobook pairing for a specific book.
   */
  public getPairing(bookId: string): AudiobookPairingData | null {
    if (!bookId) return null;
    const db = this.getDb();

    const row = db
      .prepare('SELECT * FROM audiobook_pairing WHERE book_id = ?')
      .get(bookId) as AudiobookRow | undefined;

    if (!row) return null;

    let audioFiles = [];
    let chapterMappings = [];

    try {
      audioFiles = JSON.parse(row.audio_files || '[]');
    } catch {
      audioFiles = [];
    }

    try {
      chapterMappings = JSON.parse(row.chapter_mappings || '[]');
    } catch {
      chapterMappings = [];
    }

    return {
      bookId: row.book_id,
      title: row.title || undefined,
      narrator: row.narrator || undefined,
      sourceType: row.source_type || 'local',
      serverUrl: row.server_url || undefined,
      audioFiles,
      chapterMappings,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Saves or updates an audiobook pairing.
   */
  public savePairing(payload: SaveAudiobookPairingPayload): AudiobookPairingData {
    const db = this.getDb();
    const now = new Date().toISOString();

    const existing = db
      .prepare('SELECT created_at FROM audiobook_pairing WHERE book_id = ?')
      .get(payload.bookId) as { created_at: string } | undefined;

    const createdAt = existing?.created_at || now;
    const audioFilesStr = JSON.stringify(payload.audioFiles || []);
    const chapterMappingsStr = JSON.stringify(payload.chapterMappings || []);

    db.prepare(`
      INSERT INTO audiobook_pairing (
        book_id, title, narrator, source_type, server_url,
        audio_files, chapter_mappings, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(book_id) DO UPDATE SET
        title = excluded.title,
        narrator = excluded.narrator,
        source_type = excluded.source_type,
        server_url = excluded.server_url,
        audio_files = excluded.audio_files,
        chapter_mappings = excluded.chapter_mappings,
        updated_at = excluded.updated_at
    `).run(
      payload.bookId,
      payload.title || null,
      payload.narrator || null,
      payload.sourceType || 'local',
      payload.serverUrl || null,
      audioFilesStr,
      chapterMappingsStr,
      createdAt,
      now
    );

    return {
      bookId: payload.bookId,
      title: payload.title,
      narrator: payload.narrator,
      sourceType: payload.sourceType,
      serverUrl: payload.serverUrl,
      audioFiles: payload.audioFiles,
      chapterMappings: payload.chapterMappings,
      createdAt,
      updatedAt: now,
    };
  }

  /**
   * Deletes audiobook pairing and removes saved progress.
   */
  public deletePairing(bookId: string): boolean {
    if (!bookId) return false;
    const db = this.getDb();

    db.prepare('DELETE FROM audiobook_playback_progress WHERE book_id = ?').run(bookId);
    const res = db.prepare('DELETE FROM audiobook_pairing WHERE book_id = ?').run(bookId);
    return res.changes > 0;
  }

  /**
   * Retrieves last saved audiobook playback progress.
   */
  public getProgress(bookId: string): AudiobookPlaybackProgress | null {
    if (!bookId) return null;
    const db = this.getDb();

    const row = db
      .prepare('SELECT * FROM audiobook_playback_progress WHERE book_id = ?')
      .get(bookId) as AudioProgressRow | undefined;

    if (!row) return null;

    return {
      bookId: row.book_id,
      currentFileId: row.current_file_id || undefined,
      currentTimeSeconds: Number(row.current_time_seconds) || 0,
      playbackRate: Number(row.playback_rate) || 1.0,
      isCompleted: Boolean(row.is_completed),
      lastPlayedAt: row.last_played_at,
    };
  }

  /**
   * Persists audiobook playback position and speed.
   */
  public saveProgress(progress: AudiobookPlaybackProgress): void {
    const db = this.getDb();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO audiobook_playback_progress (
        book_id, current_file_id, current_time_seconds, playback_rate, is_completed, last_played_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(book_id) DO UPDATE SET
        current_file_id = excluded.current_file_id,
        current_time_seconds = excluded.current_time_seconds,
        playback_rate = excluded.playback_rate,
        is_completed = excluded.is_completed,
        last_played_at = excluded.last_played_at
    `).run(
      progress.bookId,
      progress.currentFileId || null,
      progress.currentTimeSeconds || 0,
      progress.playbackRate || 1.0,
      progress.isCompleted ? 1 : 0,
      now
    );
  }
}
