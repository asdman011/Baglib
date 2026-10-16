/**
 * Baglib — Migration 014: Reading Statistics & Analytics Schema (KEY-149)
 *
 * Implements KOReader statistics.db data model and Readest statisticsDb pattern.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

const migration: Migration = {
  id: 14,
  name: 'reading_statistics_and_analytics',
  up: (db: Database) => {
    // 1. Reading Book Aggregate Statistics (KOReader book table compatible)
    db.exec(`
      CREATE TABLE IF NOT EXISTS reading_book_stat (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        authors TEXT,
        md5 TEXT,
        total_read_time INTEGER DEFAULT 0,
        total_read_pages INTEGER DEFAULT 0,
        last_open INTEGER DEFAULT 0,
        pages INTEGER DEFAULT 0,
        subject TEXT DEFAULT 'General',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_reading_book_stat_md5 ON reading_book_stat(md5);
      CREATE INDEX IF NOT EXISTS idx_reading_book_stat_subject ON reading_book_stat(subject);
    `);

    // 2. Reading Page Events (KOReader page_stat_data table compatible)
    db.exec(`
      CREATE TABLE IF NOT EXISTS reading_page_stat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_book TEXT NOT NULL,
        page INTEGER NOT NULL,
        start_time INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        total_pages INTEGER DEFAULT 0,
        FOREIGN KEY (id_book) REFERENCES reading_book_stat(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_page_stat_unique
        ON reading_page_stat(id_book, page, start_time);

      CREATE INDEX IF NOT EXISTS idx_reading_page_stat_book_time
        ON reading_page_stat(id_book, start_time);

      CREATE INDEX IF NOT EXISTS idx_reading_page_stat_time
        ON reading_page_stat(start_time);
    `);
  },
  down: (db: Database) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_reading_page_stat_time;
      DROP INDEX IF EXISTS idx_reading_page_stat_book_time;
      DROP INDEX IF EXISTS idx_reading_page_stat_unique;
      DROP TABLE IF EXISTS reading_page_stat;
      DROP INDEX IF EXISTS idx_reading_book_stat_subject;
      DROP INDEX IF EXISTS idx_reading_book_stat_md5;
      DROP TABLE IF EXISTS reading_book_stat;
    `);
  },
};

export default migration;
