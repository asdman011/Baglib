import { app, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron';
import { settingsRepository } from '../database/repositories/settings.repository';
import { COURSERA_API, CourseraClient } from '../services/courses/coursera';
import { validAccount, type CourseraAccount, type CourseSnapshot } from '../../shared/courses';

const ACCOUNT_KEY = 'courses.coursera.account.v1';
const SNAPSHOT_KEY = 'courses.coursera.v1';
const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};
// Basic text encryption would leave the secret readable, so only a real OS keystore counts.
const secure = () => safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
const readAccount = (): CourseraAccount | null => {
  const stored = settingsRepository.get<string>(ACCOUNT_KEY);
  if (!stored) return null;
  if (!secure()) throw new Error('secure-storage-unavailable');
  return JSON.parse(safeStorage.decryptString(Buffer.from(stored, 'base64'))) as CourseraAccount;
};
// A local stand-in server is used for development checks; installed builds always talk to Coursera.
const client = () => new CourseraClient(!app.isPackaged && process.env.BAGLIB_COURSERA_API ? process.env.BAGLIB_COURSERA_API : COURSERA_API);

export function registerCourseIpc(): void {
  ipcMain.handle('courses:account', event => {
    authorize(event);
    const account = secure() ? readAccount() : null;
    return { saved: !!settingsRepository.get(ACCOUNT_KEY), organizationId: account?.organizationId ?? '', learner: account?.learner ?? '', secureStorage: secure() };
  });
  ipcMain.handle('courses:save-account', (event, input: unknown) => {
    authorize(event);
    if (!secure()) throw new Error('secure-storage-unavailable');
    settingsRepository.set(ACCOUNT_KEY, safeStorage.encryptString(JSON.stringify(validAccount(input))).toString('base64'));
  });
  ipcMain.handle('courses:forget', event => { authorize(event); settingsRepository.delete(ACCOUNT_KEY); });
  ipcMain.handle('courses:import', async event => {
    authorize(event);
    const account = readAccount();
    if (!account) throw new Error('invalid-request');
    const snapshot = await client().progress(account);
    settingsRepository.set(SNAPSHOT_KEY, snapshot);
    return snapshot;
  });
  ipcMain.handle('courses:snapshot', event => { authorize(event); return settingsRepository.get<CourseSnapshot>(SNAPSHOT_KEY) ?? null; });
}
