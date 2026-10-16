/**
 * Baglib — Migration 013: Audiobook Pairing & Playback Progress Schema (KEY-145)
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

const migration: Migration = {
  id: 13,
  name: 'audiobook_pairing_and_playback_progress',
  up: (db: Database) => {
    // 1. Audiobook Pairing Registry
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_pairing (
        book_id TEXT PRIMARY KEY,
        title TEXT,
        narrator TEXT,
        source_type TEXT NOT NULL DEFAULT 'local',
        server_url TEXT,
        audio_files TEXT NOT NULL DEFAULT '[]',
        chapter_mappings TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // 2. Playback Progress & Session State
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_playback_progress (
        book_id TEXT PRIMARY KEY,
        current_file_id TEXT,
        current_time_seconds REAL NOT NULL DEFAULT 0,
        playback_rate REAL NOT NULL DEFAULT 1.0,
        is_completed INTEGER NOT NULL DEFAULT 0,
        last_played_at TEXT NOT NULL
      );
    `);
  },
  down: (db: Database) => {
    db.exec(`
      DROP TABLE IF EXISTS audiobook_playback_progress;
      DROP TABLE IF EXISTS audiobook_pairing;
    `);
  },
};

export default migration;
