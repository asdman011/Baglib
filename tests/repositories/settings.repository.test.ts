import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import type { ViewPreferences } from '../../src/shared/types/library-views';

describe('SqliteSettingsRepository — App Settings & View Preferences (Story 9 / KEY-111)', () => {
  let db: Database.Database;
  let repo: SqliteSettingsRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteSettingsRepository(db);
  });

  it('Settings CRUD operations', () => {
    // Initial check: key doesn't exist
    assert.equal(repo.get('nonexistent'), undefined);
    assert.equal(repo.get('nonexistent', 'fallback_val'), 'fallback_val');

    // Set and get simple string
    repo.set('app_language', 'ar');
    assert.equal(repo.get('app_language'), 'ar');

    // Set and get number
    repo.set('items_per_page', 48);
    assert.equal(repo.get('items_per_page'), 48);

    // Update existing key
    repo.set('items_per_page', 96);
    assert.equal(repo.get('items_per_page'), 96);

    // Set and get object
    const prefs: ViewPreferences = {
      viewMode: 'list',
      cardDensity: 'spacious',
      listDensity: 'compact',
      visibleColumns: ['cover', 'title', 'category', 'status', 'actions'],
      sortBy: 'year',
      sortDirection: 'desc',
      pageSize: 50,
    };
    repo.set('view_preferences', prefs);

    const savedPrefs = repo.get<ViewPreferences>('view_preferences');
    assert.deepEqual(savedPrefs, prefs);

    // getAll returns all keys
    const all = repo.getAll();
    assert.equal(all['app_language'], 'ar');
    assert.equal(all['items_per_page'], 96);
    assert.deepEqual(all['view_preferences'], prefs);

    // Delete
    const deleted = repo.delete('items_per_page');
    assert.equal(deleted, true);
    assert.equal(repo.get('items_per_page'), undefined);

    const deleteAgain = repo.delete('items_per_page');
    assert.equal(deleteAgain, false);
  });

  it('View preferences partial updates and merge semantics', () => {
    const initialPrefs: ViewPreferences = {
      viewMode: 'grid',
      cardDensity: 'comfortable',
      listDensity: 'normal',
      visibleColumns: ['cover', 'title', 'category', 'format', 'location', 'status', 'actions'],
      sortBy: 'title',
      sortDirection: 'asc',
      pageSize: 25,
    };

    repo.set('view_preferences', initialPrefs);

    // Update only cardDensity and pageSize
    const current = repo.get<ViewPreferences>('view_preferences') || {};
    const updated = {
      ...current,
      cardDensity: 'compact' as const,
      pageSize: 100,
    };
    repo.set('view_preferences', updated);

    const result = repo.get<ViewPreferences>('view_preferences');
    assert.equal(result?.cardDensity, 'compact');
    assert.equal(result?.pageSize, 100);
    assert.equal(result?.viewMode, 'grid');
    assert.equal(result?.sortBy, 'title');
    assert.equal(result?.sortDirection, 'asc');
    assert.equal(result?.visibleColumns?.length, 7);
  });
});
