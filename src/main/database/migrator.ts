/**
 * Baglib — Migration Runner
 *
 * A lightweight, forward-only migration system for SQLite.
 *
 * How it works:
 *   1. On first run, creates a `_migrations` bookkeeping table.
 *   2. Scans the registered migration list for any that haven't been applied.
 *   3. Runs unapplied migrations in order, inside a transaction.
 *   4. Records each applied migration in `_migrations` so it won't re-run.
 *
 * Migrations are defined as plain objects with an `id` (monotonically increasing),
 * a human-readable `name`, and an `up()` function that receives the Database instance.
 * Down/rollback is intentionally omitted — for a local-first desktop app,
 * "roll forward with a fix" is safer and simpler than undo logic.
 */

import Database from 'better-sqlite3';

export interface Migration {
  /** Monotonically increasing integer, e.g. 1, 2, 3. Must be unique. */
  id: number;
  /** Human-readable label, e.g. "initial_schema". Logged and stored for debugging. */
  name: string;
  /** Runs the migration SQL against the database instance. */
  up: (db: Database.Database) => void;
}

/**
 * Ensures the bookkeeping table `_migrations` exists.
 */
function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          INTEGER PRIMARY KEY,
      name        TEXT    NOT NULL,
      applied_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Returns the set of migration IDs that have already been applied.
 */
function getAppliedMigrationIds(db: Database.Database): Set<number> {
  const rows = db.prepare('SELECT id FROM _migrations ORDER BY id').all() as { id: number }[];
  return new Set(rows.map((r) => r.id));
}

/**
 * Runs all unapplied migrations in order, inside a single transaction per migration.
 *
 * @param db         The open Database instance.
 * @param migrations The full ordered list of migrations.
 * @returns          The number of migrations that were newly applied.
 */
export function runMigrations(db: Database.Database, migrations: Migration[]): number {
  ensureMigrationsTable(db);

  const applied = getAppliedMigrationIds(db);
  const pending = migrations
    .filter((m) => !applied.has(m.id))
    .sort((a, b) => a.id - b.id);

  if (pending.length === 0) {
    console.log('[baglib/migrator] All migrations already applied.');
    return 0;
  }

  const insertRecord = db.prepare(
    'INSERT INTO _migrations (id, name) VALUES (@id, @name)'
  );

  let appliedCount = 0;

  for (const migration of pending) {
    const runOne = db.transaction(() => {
      console.log(`[baglib/migrator] Applying migration ${migration.id}: ${migration.name} ...`);
      migration.up(db);
      insertRecord.run({ id: migration.id, name: migration.name });
    });

    runOne();
    appliedCount++;
    console.log(`[baglib/migrator] ✓ Migration ${migration.id} applied.`);
  }

  console.log(`[baglib/migrator] ${appliedCount} migration(s) applied successfully.`);
  return appliedCount;
}
