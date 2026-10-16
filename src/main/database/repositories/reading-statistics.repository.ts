/**
 * Baglib — Reading Statistics Repository (KEY-149)
 *
 * Implements KOReader statistics.db data model and Readest statisticsDb pattern:
 * - Idle / dwell caps (MAX_PAGE_SECONDS = 180s)
 * - Median page pace calculation
 * - Reading velocity (pages/hour, words/min)
 * - Daily activity heatmaps & streak metrics
 * - Subject distribution across Islamic and academic domains
 */

import type { Database } from 'better-sqlite3';
import { getDatabase } from '../connection';
import type {
  ReadingBookStat,
  DailyReadingHeatmapEntry,
  ReadingStreakStats,
  RecordReadingProgressPayload,
  SubjectReadingStat,
} from '../../../shared/types/reading-statistics';

export const MAX_PAGE_SECONDS = 180; // 3 minutes dwell cap per page (Readest pattern)

export interface IReadingStatisticsRepository {
  initBook(payload: {
    bookId: string;
    title: string;
    authors?: string;
    md5?: string;
    subject?: string;
    totalPages?: number;
  }): void;
  recordPageReading(payload: RecordReadingProgressPayload): void;
  getBookStats(bookId: string): ReadingBookStat | null;
  getAllBookStats(): ReadingBookStat[];
  getMedianPageDurationSecs(bookId: string): number | null;
  getDailyHeatmap(days?: number): DailyReadingHeatmapEntry[];
  getReadingStreakStats(): ReadingStreakStats;
}

export class SqliteReadingStatisticsRepository implements IReadingStatisticsRepository {
  constructor(private db?: Database) {}

  private getDb(): Database {
    return this.db ?? getDatabase();
  }

  initBook(payload: {
    bookId: string;
    title: string;
    authors?: string;
    md5?: string;
    subject?: string;
    totalPages?: number;
  }): void {
    const db = this.getDb();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO reading_book_stat (
        id, title, authors, md5, subject, last_open, pages, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        authors = COALESCE(excluded.authors, reading_book_stat.authors),
        md5 = COALESCE(excluded.md5, reading_book_stat.md5),
        subject = COALESCE(excluded.subject, reading_book_stat.subject),
        last_open = excluded.last_open,
        pages = max(reading_book_stat.pages, excluded.pages),
        updated_at = datetime('now')
    `).run(
      payload.bookId,
      payload.title || 'Untitled Book',
      payload.authors || '',
      payload.md5 || '',
      payload.subject || 'General',
      now,
      payload.totalPages || 0
    );
  }

  recordPageReading(payload: RecordReadingProgressPayload): void {
    const db = this.getDb();
    const now = Math.floor(Date.now() / 1000);
    const clampedDuration = Math.min(
      Math.max(1, Math.round(payload.durationSeconds)),
      MAX_PAGE_SECONDS
    );

    const runTransaction = db.transaction(() => {
      // 1. Ensure book aggregate record exists
      db.prepare(`
        INSERT INTO reading_book_stat (
          id, title, authors, md5, subject, last_open, pages, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          authors = COALESCE(excluded.authors, reading_book_stat.authors),
          md5 = COALESCE(excluded.md5, reading_book_stat.md5),
          subject = COALESCE(excluded.subject, reading_book_stat.subject),
          last_open = excluded.last_open,
          pages = max(reading_book_stat.pages, excluded.pages),
          updated_at = datetime('now')
      `).run(
        payload.bookId,
        payload.title || 'Untitled Book',
        payload.authors || '',
        payload.md5 || '',
        payload.subject || 'General',
        now,
        payload.totalPages || 0
      );

      // 2. Insert or update page event
      db.prepare(`
        INSERT INTO reading_page_stat (id_book, page, start_time, duration, total_pages)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id_book, page, start_time) DO UPDATE SET
          duration = max(reading_page_stat.duration, excluded.duration),
          total_pages = max(reading_page_stat.total_pages, excluded.total_pages)
      `).run(
        payload.bookId,
        payload.page,
        now,
        clampedDuration,
        payload.totalPages || 0
      );

      // 3. Recompute book aggregate totals
      db.prepare(`
        UPDATE reading_book_stat SET
          total_read_time = COALESCE((SELECT SUM(duration) FROM reading_page_stat WHERE id_book = ?), 0),
          total_read_pages = COALESCE((SELECT COUNT(DISTINCT page) FROM reading_page_stat WHERE id_book = ?), 0),
          last_open = COALESCE((SELECT MAX(start_time + duration) FROM reading_page_stat WHERE id_book = ?), last_open),
          pages = max(pages, COALESCE((SELECT total_pages FROM reading_page_stat WHERE id_book = ? ORDER BY start_time DESC LIMIT 1), 0)),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(payload.bookId, payload.bookId, payload.bookId, payload.bookId, payload.bookId);
    });

    runTransaction();
  }

  getBookStats(bookId: string): ReadingBookStat | null {
    const db = this.getDb();
    const row = db.prepare(`
      SELECT id, title, authors, md5, total_read_time, total_read_pages, last_open, pages, subject
      FROM reading_book_stat
      WHERE id = ?
    `).get(bookId) as any;

    if (!row) return null;

    const median = this.getMedianPageDurationSecs(bookId);

    return {
      bookId: row.id,
      title: row.title,
      authors: row.authors || undefined,
      md5: row.md5 || undefined,
      totalReadTime: Number(row.total_read_time || 0),
      totalReadPages: Number(row.total_read_pages || 0),
      lastOpen: Number(row.last_open || 0),
      pages: Number(row.pages || 0),
      medianPageDurationSecs: median ?? undefined,
      subject: row.subject || 'General',
    };
  }

  getAllBookStats(): ReadingBookStat[] {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT id, title, authors, md5, total_read_time, total_read_pages, last_open, pages, subject
      FROM reading_book_stat
      ORDER BY last_open DESC
    `).all() as any[];

    return rows.map((row) => ({
      bookId: row.id,
      title: row.title,
      authors: row.authors || undefined,
      md5: row.md5 || undefined,
      totalReadTime: Number(row.total_read_time || 0),
      totalReadPages: Number(row.total_read_pages || 0),
      lastOpen: Number(row.last_open || 0),
      pages: Number(row.pages || 0),
      subject: row.subject || 'General',
    }));
  }

  getMedianPageDurationSecs(bookId: string): number | null {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT duration
      FROM reading_page_stat
      WHERE id_book = ? AND duration <= ?
      ORDER BY start_time DESC
      LIMIT 50
    `).all(bookId, MAX_PAGE_SECONDS) as { duration: number }[];

    if (!rows || rows.length < 3) return null;

    const durations = rows.map((r) => r.duration).sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    if (durations.length % 2 !== 0) {
      return durations[mid];
    }
    return Math.round((durations[mid - 1] + durations[mid]) / 2);
  }

  getDailyHeatmap(days: number = 365): DailyReadingHeatmapEntry[] {
    const db = this.getDb();
    const startTimeThreshold = Math.floor(Date.now() / 1000) - days * 86400;

    const rows = db.prepare(`
      SELECT
        date(start_time, 'unixepoch', 'localtime') AS day,
        SUM(duration) AS total_duration,
        COUNT(DISTINCT id_book || '-' || page) AS pages_read,
        COUNT(DISTINCT id_book) AS book_count
      FROM reading_page_stat
      WHERE start_time >= ?
      GROUP BY day
      ORDER BY day ASC
    `).all(startTimeThreshold) as any[];

    return rows.map((r) => ({
      date: r.day,
      totalDurationSeconds: Number(r.total_duration || 0),
      pagesRead: Number(r.pages_read || 0),
      bookCount: Number(r.book_count || 0),
    }));
  }

  getReadingStreakStats(): ReadingStreakStats {
    const db = this.getDb();

    // 1. Query distinct reading days ordered ascending in local time
    const dayRows = db.prepare(`
      SELECT DISTINCT date(start_time, 'unixepoch', 'localtime') AS read_date
      FROM reading_page_stat
      ORDER BY read_date ASC
    `).all() as { read_date: string }[];

    const readDates = dayRows.map((d) => d.read_date);
    const totalDaysRead = readDates.length;

    let currentStreakDays = 0;
    let longestStreakDays = 0;
    let lastReadDate: string | undefined = readDates[readDates.length - 1];

    if (readDates.length > 0) {
      const dateSet = new Set(readDates);
      const formatLocalDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const today = new Date();
      const todayStr = formatLocalDate(today);
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      const yesterdayStr = formatLocalDate(yesterday);

      // Check if user read today or yesterday for active streak
      let checkDate = dateSet.has(todayStr)
        ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
        : (dateSet.has(yesterdayStr) ? new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()) : null);

      if (checkDate) {
        while (dateSet.has(formatLocalDate(checkDate))) {
          currentStreakDays++;
          checkDate.setDate(checkDate.getDate() - 1);
        }
      }

      // Calculate longest streak across entire history
      let currentRun = 0;
      let prevDate: Date | null = null;

      for (const dStr of readDates) {
        const currentDate = new Date(dStr + 'T00:00:00');
        if (!prevDate) {
          currentRun = 1;
        } else {
          const diffDays = Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 3600 * 24));
          if (diffDays === 1) {
            currentRun++;
          } else if (diffDays > 1) {
            currentRun = 1;
          }
        }
        if (currentRun > longestStreakDays) {
          longestStreakDays = currentRun;
        }
        prevDate = currentDate;
      }
    }

    // 2. Aggregate totals
    const totalsRow = db.prepare(`
      SELECT
        COALESCE(SUM(duration), 0) AS total_time,
        COUNT(DISTINCT id_book || '-' || page) AS total_pages
      FROM reading_page_stat
    `).get() as any;

    const totalReadTimeSeconds = Number(totalsRow?.total_time || 0);
    const totalReadPages = Number(totalsRow?.total_pages || 0);

    // Velocity calculations
    const hours = totalReadTimeSeconds / 3600;
    const averagePagesPerHour = hours > 0 ? Math.round((totalReadPages / hours) * 10) / 10 : 0;
    // Estimated words per minute (~250 words per page average in scholarly literature)
    const averageWordsPerMinute = totalReadTimeSeconds > 0 ? Math.round((totalReadPages * 250) / (totalReadTimeSeconds / 60)) : 0;

    // 3. Subject Breakdown
    const subjectRows = db.prepare(`
      SELECT
        COALESCE(b.subject, 'General') AS subject,
        SUM(p.duration) AS time_seconds,
        COUNT(DISTINCT p.id_book || '-' || p.page) AS pages_read,
        COUNT(DISTINCT p.id_book) AS book_count
      FROM reading_page_stat p
      LEFT JOIN reading_book_stat b ON b.id = p.id_book
      GROUP BY subject
      ORDER BY time_seconds DESC
    `).all() as any[];

    const subjectBreakdown: SubjectReadingStat[] = subjectRows.map((s) => ({
      subject: s.subject,
      timeSeconds: Number(s.time_seconds || 0),
      pagesRead: Number(s.pages_read || 0),
      bookCount: Number(s.book_count || 0),
    }));

    return {
      currentStreakDays,
      longestStreakDays,
      totalDaysRead,
      totalReadTimeSeconds,
      totalReadPages,
      averagePagesPerHour,
      averageWordsPerMinute,
      subjectBreakdown,
      lastReadDate,
    };
  }
}

export const readingStatisticsRepository = new SqliteReadingStatisticsRepository();
