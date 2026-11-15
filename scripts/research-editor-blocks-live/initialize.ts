import { getDatabase, closeDatabase } from '../../src/main/database/connection';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
export { translations } from '../../src/renderer/translations';
export function initializeProfile() { runMigrations(getDatabase(), migrations); closeDatabase(); }
