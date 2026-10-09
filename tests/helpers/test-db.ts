import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';

/**
 * Creates an isolated in-memory SQLite database instance
 * with all current schema migrations applied.
 */
export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, migrations);
  return db;
}
