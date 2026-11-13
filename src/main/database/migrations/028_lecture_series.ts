import type { Migration } from '../migrator';
const migration: Migration = {
  id: 28, name: 'lecture_series',
  up(db) {
    db.exec(`CREATE TABLE lecture_series (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      autoplay_next INTEGER NOT NULL DEFAULT 0 CHECK(autoplay_next IN (0,1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE lecture_series_item (
      series_id TEXT NOT NULL REFERENCES lecture_series(id) ON DELETE CASCADE,
      work_id TEXT NOT NULL UNIQUE REFERENCES work(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      PRIMARY KEY(series_id, work_id)
    );`);
  },
  down(db) { db.exec('DROP TABLE lecture_series_item; DROP TABLE lecture_series;'); },
};
export default migration;
