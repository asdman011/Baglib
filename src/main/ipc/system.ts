import { ipcMain, app } from 'electron';

export function setupSystemIPC() {
  ipcMain.handle('system:get-info', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
    };
  });
}
