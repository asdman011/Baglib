/**
 * Baglib — Database Module Entry Point
 *
 * Initializes the SQLite database and runs pending migrations.
 * Import and call `initializeDatabase()` once during app startup
 * (before registering IPC handlers that depend on the database).
 *
 * Re-exports `getDatabase` and `closeDatabase` for use by
 * repository implementations and the shutdown hook.
 */

import { getDatabase, closeDatabase } from './connection';
import { runMigrations } from './migrator';
import { migrations } from './migrations';

import { SeedService } from './seed.service';

/**
 * Opens the database, runs any pending migrations, and returns the instance.
 * Safe to call multiple times — connection is a singleton, migrations are idempotent.
 */
export async function initializeDatabase() {
  const db = getDatabase();
  runMigrations(db, migrations);
  
  // Seed the database if it's empty
  const seeder = new SeedService(db);
  await seeder.seedIfEmpty();

  return db;
}

export { getDatabase, closeDatabase };
