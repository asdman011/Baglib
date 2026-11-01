/**
 * Baglib — Startup order regression tests
 *
 * On a brand-new profile the database has no tables until `initializeDatabase()` runs,
 * which happens after every IPC module has been imported. Importing those modules must
 * not read settings, and services created too early must recover once migrations ran.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

describe('Startup before migrations', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-startup-test-'));
  const originalDataDir = process.env.BAGLIB_DATA_DIR;
  let connection: typeof import('../../src/main/database/connection');

  const hasSettingsTable = () => Boolean(
    connection.getDatabase().prepare("SELECT 1 FROM sqlite_master WHERE name = 'app_settings'").get(),
  );

  before(async () => {
    process.env.BAGLIB_DATA_DIR = dataDir;
    connection = await import('../../src/main/database/connection');
  });

  after(() => {
    connection.closeDatabase();
    if (originalDataDir === undefined) delete process.env.BAGLIB_DATA_DIR;
    else process.env.BAGLIB_DATA_DIR = originalDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('imports every IPC module on an empty database', async () => {
    assert.equal(hasSettingsTable(), false);

    const ipcDir = path.resolve(__dirname, '../../src/main/ipc');
    for (const file of fs.readdirSync(ipcDir).filter(name => name.endsWith('.ts'))) {
      await assert.doesNotReject(import(pathToFileURL(path.join(ipcDir, file)).href), `importing ipc/${file}`);
    }

    assert.equal(hasSettingsTable(), false);
  });

  it('does not keep a service that failed to read settings before migrations', async () => {
    const { getKOSyncService } = await import('../../src/main/services/sync/ko-sync.service');
    const { getAppLockSecurityService } = await import('../../src/main/services/security/app-lock.service');
    const { getReaderPluginManager } = await import('../../src/main/services/plugins/plugin-manager.service');

    assert.throws(() => getKOSyncService(), /no such table: app_settings/);
    assert.throws(() => getAppLockSecurityService(), /no such table: app_settings/);
    assert.throws(() => getReaderPluginManager(), /no such table: app_settings/);
  });

  it('loads settings saved in an existing profile once migrations have run', async () => {
    const { runMigrations } = await import('../../src/main/database/migrator');
    const { migrations } = await import('../../src/main/database/migrations');
    const { settingsRepository } = await import('../../src/main/database/repositories/settings.repository');
    const { getKOSyncService } = await import('../../src/main/services/sync/ko-sync.service');
    const { getAppLockSecurityService } = await import('../../src/main/services/security/app-lock.service');
    const { getReaderPluginManager } = await import('../../src/main/services/plugins/plugin-manager.service');

    runMigrations(connection.getDatabase(), migrations);
    settingsRepository.set('koreader_sync_config', {
      serverUrl: 'https://sync.example.test',
      username: 'reader',
      password: 'secret',
    });
    settingsRepository.set('app_lock:config', { enabled: true });
    settingsRepository.set('reader_plugins:state', { 'warm-parchment-theme': true });

    const config = getKOSyncService().getConfig();
    assert.equal(config.serverUrl, 'https://sync.example.test');
    assert.equal(config.username, 'reader');
    assert.equal(config.deviceName, 'Baglib Desktop');
    assert.equal(getKOSyncService(), getKOSyncService());

    assert.equal(getAppLockSecurityService().getLockState().isLocked, true);

    const parchment = getReaderPluginManager().listPlugins().find(plugin => plugin.id === 'warm-parchment-theme');
    assert.equal(parchment?.enabled, true);
  });
});
