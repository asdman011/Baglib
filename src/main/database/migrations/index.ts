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
import migration002 from './002_add_categories';
import migration003 from './003_add_reading_status';
import migration004 from './004_extended_metadata';
import migration005 from './005_lending_records';

/** All migrations in chronological order. */
export const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
];



