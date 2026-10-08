/**
 * Baglib — Migration Registry
 *
 * Central list of all migrations, imported and re-exported
 * as an ordered array for the migrator to consume.
 *
 * To add a new migration:
 *   1. Create `src/main/database/migrations/NNN_description.ts`
 *   2. Import it here and append it to the `migrations` array.
 */

import type { Migration } from '../migrator';
import migration001 from './001_initial_schema';

/** All migrations in chronological order. */
export const migrations: Migration[] = [
  migration001,
];
