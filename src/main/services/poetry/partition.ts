import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export function openPoetryPartition(userData: string): Database.Database {
  const directory = path.join(userData, 'partitions');
  fs.mkdirSync(directory, { recursive: true });
  const database = new Database(path.join(directory, 'bayan_poetry.sqlite'));
  try {
    database.pragma('journal_mode = WAL');
    database.pragma('synchronous = NORMAL');
    database.pragma('temp_store = MEMORY');
    database.pragma('mmap_size = 268435456');
    database.pragma('cache_size = -64000');
    database.pragma('foreign_keys = ON');
    database.exec(`
      CREATE TABLE IF NOT EXISTS poets (
        id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE,
        name TEXT NOT NULL, name_normalized TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'ar', era TEXT, location TEXT,
        bio TEXT, external_url TEXT, poem_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS poems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        poet_id INTEGER NOT NULL REFERENCES poets(id), title TEXT NOT NULL,
        title_normalized TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'ar',
        layout_type TEXT NOT NULL DEFAULT 'bayt', meter TEXT, theme TEXT,
        language_variant TEXT, verse_count INTEGER NOT NULL DEFAULT 0,
        verses_json TEXT NOT NULL, search_text_normalized TEXT NOT NULL, source_url TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_poets_lang_era ON poets(language, era);
      CREATE INDEX IF NOT EXISTS idx_poets_name_norm ON poets(name_normalized);
      CREATE INDEX IF NOT EXISTS idx_poems_poet_id ON poems(poet_id);
      CREATE INDEX IF NOT EXISTS idx_poems_lang_meter ON poems(language, meter);
      CREATE INDEX IF NOT EXISTS idx_poems_lang_theme ON poems(language, theme);
      CREATE VIRTUAL TABLE IF NOT EXISTS poems_fts USING fts5(
        title_normalized, poet_name_normalized, search_text_normalized,
        tokenize='unicode61'
      );
    `);
    if (!(database.pragma('table_info(poems)') as { name: string }[]).some(column => column.name === 'description_json')) database.exec('ALTER TABLE poems ADD COLUMN description_json TEXT');
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function rebuildPoetrySearch(database: Database.Database): void {
  database.transaction(() => {
    database.exec(`DELETE FROM poems_fts;
      INSERT INTO poems_fts(rowid, title_normalized, poet_name_normalized, search_text_normalized)
      SELECT poems.id, poems.title_normalized, poets.name_normalized, poems.search_text_normalized
      FROM poems JOIN poets ON poets.id = poems.poet_id;
      UPDATE poets SET poem_count = (SELECT COUNT(*) FROM poems WHERE poet_id = poets.id);
    `);
  })();
}
