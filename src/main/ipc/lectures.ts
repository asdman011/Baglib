import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { getDatabase } from '../database/connection';
import { LectureLibrary } from '../services/lectures/lecture-library';
import { LECTURE_EXTENSIONS, validProgress, validSections } from '../../shared/lectures';
import { LectureSubtitles } from '../services/lectures/subtitles';

const shots = () => path.join(app.getPath('userData'), 'lecture-shots');
const library = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
  return new LectureLibrary(getDatabase(), shots());
};
const lectureId = (id: unknown) => {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/u.test(id)) throw new Error('invalid-request');
  return id;
};

export function registerLectureIpc(): void {
  ipcMain.handle('lectures:subtitles', async (event, id: unknown, choose: unknown) => {
    const service = library(event);
    const lecture = service.list().find(item => item.id === lectureId(id));
    if (!lecture || (choose !== undefined && typeof choose !== 'boolean')) throw new Error('invalid-request');
    let selected: string | undefined;
    if (choose) {
      const options = { properties: ['openFile'] as 'openFile'[], filters: [{ name: 'SRT / WebVTT', extensions: ['srt', 'vtt'] }] };
      const owner = BrowserWindow.fromWebContents(event.sender);
      const choice = await (owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options));
      if (choice.canceled) return null;
      selected = choice.filePaths[0];
      if (!selected) throw new Error('invalid-request');
    }
    return new LectureSubtitles(getDatabase()).load(lecture.id, lecture.path, selected);
  });
  ipcMain.handle('lectures:add-paths', async (event, paths: unknown) => {
    const service = library(event);
    if (!Array.isArray(paths) || paths.length > 500) throw new Error('invalid-request');
    for (const file of paths) {
      if (typeof file !== 'string' || !path.isAbsolute(file) || !(LECTURE_EXTENSIONS as readonly string[]).includes(path.extname(file).toLowerCase()) || !(await stat(file)).isFile()) throw new Error('unsupported-media');
    }
    return service.add(paths);
  });
  ipcMain.handle('lectures:list', event => library(event).list());
  ipcMain.handle('lectures:add', async event => {
    const service = library(event);
    const options = { properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[], filters: [{ name: 'Media', extensions: LECTURE_EXTENSIONS.map(extension => extension.slice(1)) }] };
    const owner = BrowserWindow.fromWebContents(event.sender);
    const choice = await (owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options));
    if (choice.canceled) return [];
    if (choice.filePaths.some(file => !(LECTURE_EXTENSIONS as readonly string[]).includes(path.extname(file).toLowerCase()))) throw new Error('unsupported-media');
    return service.add(choice.filePaths);
  });
  ipcMain.handle('lectures:remove', (event, id: unknown) => library(event).remove(lectureId(id)));
  ipcMain.handle('lectures:update', (event, id: unknown, changes: { title?: unknown; sections?: unknown }) => {
    const title = typeof changes?.title === 'string' && changes.title.trim() && changes.title.length <= 300 ? changes.title.trim() : undefined;
    return library(event).update(lectureId(id), { title, sections: changes?.sections === undefined ? undefined : validSections(changes.sections) });
  });
  ipcMain.handle('lectures:progress', (event, id: unknown) => library(event).progress(lectureId(id)));
  ipcMain.handle('lectures:save-progress', (event, id: unknown, progress: unknown) => library(event).saveProgress(lectureId(id), validProgress(progress)));
  ipcMain.handle('lectures:save-shot', (event, id: unknown, png: unknown) => library(event).saveShot(lectureId(id), typeof png === 'string' ? png : ''));
  ipcMain.handle('lectures:shots-directory', event => { library(event); return shots(); });
}
