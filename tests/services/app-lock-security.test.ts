import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { AppLockSecurityService } from '../../src/main/services/security/app-lock.service';

describe('App Lock Security & Master PIN (Task 5.3 / KEY-149)', () => {
  let db: ReturnType<typeof createTestDatabase>;
  let settingsRepo: SqliteSettingsRepository;
  let service: AppLockSecurityService;

  beforeEach(() => {
    db = createTestDatabase();
    settingsRepo = new SqliteSettingsRepository(db);
    service = new AppLockSecurityService(settingsRepo);
  });

  describe('Master PIN Management', () => {
    it('sets and verifies Master PIN with PBKDF2 verification', () => {
      service.setMasterPin('1234');
      const isValid = service.verifyMasterPin('1234');
      assert.equal(isValid, true);
    });

    it('rejects incorrect PIN input', () => {
      service.setMasterPin('5678');
      const isValid = service.verifyMasterPin('0000');
      assert.equal(isValid, false);
    });

    it('enforces minimum 4-digit PIN length requirement', () => {
      assert.throws(() => service.setMasterPin('12'), /at least 4 digits/);
    });

    it('clears configured Master PIN', () => {
      service.setMasterPin('9876');
      assert.equal(service.getLockConfig().hasPin, true);

      service.clearMasterPin();
      assert.equal(service.getLockConfig().hasPin, false);
      assert.equal(service.verifyMasterPin('9876'), false);
    });
  });

  describe('Lock Configuration & State', () => {
    it('persists lock settings updates', () => {
      service.setLockConfig({
        enabled: true,
        lockTimeoutMinutes: 30,
        lockPrivateShelvesOnly: true,
      });

      const config = service.getLockConfig();
      assert.equal(config.enabled, true);
      assert.equal(config.lockTimeoutMinutes, 30);
      assert.equal(config.lockPrivateShelvesOnly, true);
    });

    it('transitions between locked and unlocked states', () => {
      service.setLockConfig({ enabled: true });
      service.lock('manual');

      let state = service.getLockState();
      assert.equal(state.isLocked, true);
      assert.equal(state.reason, 'manual');

      service.unlock();
      state = service.getLockState();
      assert.equal(state.isLocked, false);
    });

    it('resolves OS biometric capabilities without throwing', async () => {
      const capability = await service.getBiometricCapability();
      assert.ok(capability);
      assert.ok(typeof capability.available === 'boolean');
      assert.ok(capability.platform);
    });
  });
});
