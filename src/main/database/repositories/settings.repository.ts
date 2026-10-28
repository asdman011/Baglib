import type { Database } from 'better-sqlite3';
import { getDatabase } from '../connection';

export interface ISettingsRepository {
  get<T = unknown>(key: string, defaultValue?: T): T | undefined;
  set<T = unknown>(key: string, value: T): void;
  getAll(): Record<string, unknown>;
  delete(key: string): boolean;
}

export class SqliteSettingsRepository implements ISettingsRepository {
  constructor(private db?: Database) {}

  private getDb(): Database {
    return this.db ?? getDatabase();
  }

  get<T = unknown>(key: string, defaultValue?: T): T | undefined {
    const db = this.getDb();
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) {
      return defaultValue;
    }
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return (row.value) as T;
    }
  }

  set<T = unknown>(key: string, value: T): void {
    const db = this.getDb();
    const valStr = typeof value === 'string' ? value : JSON.stringify(value);
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(key, valStr);
  }

  getAll(): Record<string, unknown> {
    const db = this.getDb();
    const rows = db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[];
    const result: Record<string, unknown> = {};
    for (const r of rows) {
      try {
        result[r.key] = JSON.parse(r.value);
      } catch {
        result[r.key] = r.value;
      }
    }
    return result;
  }

  delete(key: string): boolean {
    const db = this.getDb();
    const res = db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
    return res.changes > 0;
  }
}

export const settingsRepository = new SqliteSettingsRepository();
