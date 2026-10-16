import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { ReaderPluginManager } from '../../src/main/services/plugins/plugin-manager.service';
import type { BaglibReaderPlugin } from '../../src/shared/types/reader-plugin';

describe('Reader Plugins & Extensibility Engine (Task 5.3 / KEY-149)', () => {
  let db: ReturnType<typeof createTestDatabase>;
  let settingsRepo: SqliteSettingsRepository;
  let manager: ReaderPluginManager;

  beforeEach(() => {
    db = createTestDatabase();
    settingsRepo = new SqliteSettingsRepository(db);
    manager = new ReaderPluginManager(settingsRepo);
  });

  it('loads built-in default reader plugins', () => {
    const list = manager.listPlugins();
    assert.ok(list.length >= 3);

    const ids = list.map((p) => p.id);
    assert.ok(ids.includes('classic-turath-typography'));
    assert.ok(ids.includes('warm-parchment-theme'));
    assert.ok(ids.includes('arabic-morphology-lookup'));
  });

  it('toggles plugin enabled state and persists across reloads', () => {
    manager.enablePlugin('warm-parchment-theme', true);

    let plugin = manager.listPlugins().find((p) => p.id === 'warm-parchment-theme');
    assert.equal(plugin?.enabled, true);

    // Re-initialize manager with same repository
    const freshManager = new ReaderPluginManager(settingsRepo);
    plugin = freshManager.listPlugins().find((p) => p.id === 'warm-parchment-theme');
    assert.equal(plugin?.enabled, true);
  });

  it('aggregates custom CSS only from enabled plugins', () => {
    manager.enablePlugin('classic-turath-typography', true);
    manager.enablePlugin('warm-parchment-theme', false);

    let styles = manager.getAggregatedCss();
    assert.ok(styles.includes('font-feature-settings'));
    assert.ok(!styles.includes('baglib-parchment-mode'));

    // Enable parchment mode
    manager.enablePlugin('warm-parchment-theme', true);
    styles = manager.getAggregatedCss();
    assert.ok(styles.includes('baglib-parchment-mode'));
  });

  it('executes word lookup hook with Arabic Tashkeel normalization', async () => {
    const res = await manager.lookupWord('الكِتَابُ', 'ar');
    assert.ok(res);
    assert.equal(res.headword, 'الكتاب');
    assert.ok(res.definition.includes('الكتاب'));
  });

  it('allows registering custom 3rd-party reader plugins dynamically', async () => {
    const customPlugin: BaglibReaderPlugin = {
      id: 'custom-tts-provider',
      name: 'Custom Cloud Voice Provider',
      version: '1.0.0',
      type: 'tts_voice',
      enabled: true,
      onProvideTtsVoices: async () => [
        { id: 'custom-ar-1', name: 'Al-Bayan Narrator', lang: 'ar', service: 'CustomProvider' },
      ],
    };

    manager.registerPlugin(customPlugin);
    const voices = await manager.getTtsVoices();
    assert.ok(voices.some((v) => v.id === 'custom-ar-1'));
  });
});
