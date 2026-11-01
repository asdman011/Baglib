/**
 * Baglib — App Lock Security IPC Handlers (KEY-149)
 */

import { ipcMain, BrowserWindow } from 'electron';
import { getAppLockSecurityService } from '../services/security/app-lock.service';
import type { AppLockConfig } from '../../shared/types/app-lock';

export function registerSecurityIpc(): void {
  ipcMain.handle('security:get-biometric-capability', async () => {
    return getAppLockSecurityService().getBiometricCapability();
  });

  ipcMain.handle('security:prompt-biometric-auth', async (event, promptMessage?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return getAppLockSecurityService().promptBiometricAuth(promptMessage, win);
  });

  ipcMain.handle('security:verify-master-pin', (_event, pin: string) => {
    return getAppLockSecurityService().verifyMasterPin(pin);
  });

  ipcMain.handle('security:set-master-pin', (_event, pin: string) => {
    return getAppLockSecurityService().setMasterPin(pin);
  });

  ipcMain.handle('security:clear-master-pin', () => {
    return getAppLockSecurityService().clearMasterPin();
  });

  ipcMain.handle('security:get-lock-config', () => {
    return getAppLockSecurityService().getLockConfig();
  });

  ipcMain.handle('security:set-lock-config', (_event, partialConfig: Partial<AppLockConfig>) => {
    return getAppLockSecurityService().setLockConfig(partialConfig);
  });

  ipcMain.handle('security:get-lock-state', () => {
    return getAppLockSecurityService().getLockState();
  });

  ipcMain.handle('security:lock', (_event, reason?: 'app_launch' | 'idle_timeout' | 'private_shelf' | 'manual') => {
    return getAppLockSecurityService().lock(reason);
  });

  ipcMain.handle('security:unlock', () => {
    return getAppLockSecurityService().unlock();
  });

  ipcMain.handle('security:check-idle-timeout', () => {
    return getAppLockSecurityService().checkIdleTimeout();
  });
}
