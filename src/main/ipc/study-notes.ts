import { BrowserWindow, ipcMain } from 'electron';
import { settingsRepository } from '../database/repositories/settings.repository';
import { StudyNotesService } from '../services/study-notes';
import type { StudyNoteInput } from '../../shared/study-notes';
import { getDatabase } from '../database/connection';

export function registerStudyNotesIpc(): void {
  const service = () => new StudyNotesService(settingsRepository,getDatabase());
  const changed = () => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('study-notes:changed');
  };
  ipcMain.handle('study-notes:list', () => service().list());
  ipcMain.handle('study-notes:save', (_, input: StudyNoteInput) => { const note = service().save(input); changed(); return note; });
  ipcMain.handle('study-notes:remove', (_, id: string) => { service().remove(id); changed(); });
}
