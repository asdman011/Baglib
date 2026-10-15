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
import migration006 from './006_api_quota_logs';
import migration007 from './007_app_settings';
import migration008 from './008_file_path_index_and_storage';
import migration009 from './009_storage_management';

/** All migrations in chronological order. */
export const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
];



