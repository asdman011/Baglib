import { getDatabase, closeDatabase } from '../../src/main/database/connection';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';

/** Only called after main.cjs sets and verifies the throwaway userData path. */
export function initializeProfile(): void {
  runMigrations(getDatabase(), migrations);
  closeDatabase();
}
