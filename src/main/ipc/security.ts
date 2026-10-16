/**
 * Baglib — App Lock Security IPC Handlers (KEY-149)
 */

import { ipcMain, BrowserWindow } from 'electron';
import { appLockSecurityService } from '../services/security/app-lock.service';
import type { AppLockConfig } from '../../shared/types/app-lock';

export function registerSecurityIpc(): void {
  ipcMain.handle('security:get-biometric-capability', async () => {
    return appLockSecurityService.getBiometricCapability();
  });

  ipcMain.handle('security:prompt-biometric-auth', async (event, promptMessage?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return appLockSecurityService.promptBiometricAuth(promptMessage, win);
  });

  ipcMain.handle('security:verify-master-pin', (_event, pin: string) => {
    return appLockSecurityService.verifyMasterPin(pin);
  });

  ipcMain.handle('security:set-master-pin', (_event, pin: string) => {
    return appLockSecurityService.setMasterPin(pin);
  });

  ipcMain.handle('security:clear-master-pin', () => {
    return appLockSecurityService.clearMasterPin();
  });

  ipcMain.handle('security:get-lock-config', () => {
    return appLockSecurityService.getLockConfig();
  });

  ipcMain.handle('security:set-lock-config', (_event, partialConfig: Partial<AppLockConfig>) => {
    return appLockSecurityService.setLockConfig(partialConfig);
  });

  ipcMain.handle('security:get-lock-state', () => {
    return appLockSecurityService.getLockState();
  });

  ipcMain.handle('security:lock', (_event, reason?: 'app_launch' | 'idle_timeout' | 'private_shelf' | 'manual') => {
    return appLockSecurityService.lock(reason);
  });

  ipcMain.handle('security:unlock', () => {
    return appLockSecurityService.unlock();
  });

  ipcMain.handle('security:check-idle-timeout', () => {
    return appLockSecurityService.checkIdleTimeout();
  });
}
