import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { wheelDensity, CARD_DENSITIES, ROW_DENSITIES } from '../../src/shared/library-density';

test('Ctrl+wheel sizes clamp at both bounds and zero/nonfinite deltas leave density unchanged', () => {
  assert.equal(wheelDensity('comfortable', CARD_DENSITIES, -1), 'spacious');
  assert.equal(wheelDensity('comfortable', CARD_DENSITIES, 1), 'compact');
  assert.equal(wheelDensity('spacious', CARD_DENSITIES, -100), 'spacious');
  assert.equal(wheelDensity('compact', CARD_DENSITIES, 100), 'compact');
  assert.equal(wheelDensity('normal', ROW_DENSITIES, 1), 'compact');
  assert.equal(wheelDensity('normal', ROW_DENSITIES, -1), 'normal');
  assert.equal(wheelDensity('compact', ROW_DENSITIES, -1), 'normal');
  for (const delta of [0, Infinity, NaN]) assert.equal(wheelDensity('comfortable', CARD_DENSITIES, delta), 'comfortable');
});

test('grid/row sizes survive settings repository recreation in the existing preferences payload', () => {
  const db = new Database(':memory:'); runMigrations(db, migrations);
  try {
    const settings = new SqliteSettingsRepository(db);
    const original = { viewMode: 'grid', cardDensity: 'comfortable', listDensity: 'normal', pageSize: 48 };
    settings.set('library_view_preferences', original);
    settings.set('library_view_preferences', { ...original, cardDensity: wheelDensity('comfortable', CARD_DENSITIES, -1), listDensity: wheelDensity('normal', ROW_DENSITIES, 1) });
    assert.deepEqual(new SqliteSettingsRepository(db).get('library_view_preferences'), { viewMode: 'grid', cardDensity: 'spacious', listDensity: 'compact', pageSize: 48 });
  } finally { db.close(); }
});
