import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { settingsRepository } from '../database/repositories/settings.repository';
import { StudyNotesService } from '../services/study-notes';
import type { StudyNoteInput } from '../../shared/study-notes';
import { exportFolderName, exportNotesAsMarkdown } from '../../shared/markdown-export';
import { getDatabase } from '../database/connection';
import { notesToDocx } from '../services/notes-docx';
import { wordLayout } from '../../shared/word-export';
import { translations } from '../../renderer/translations';

/** Only the app's own top-level page may write files to disk. */
const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};

/** Library titles of the books the notes belong to. */
const workTitles = (notes: { workId?: string }[]) => {
  const db = getDatabase();
  const books = new Map<string, string>();
  for (const workId of new Set(notes.map(note => note.workId).filter((id): id is string => Boolean(id)))) {
    const row = db.prepare('SELECT title FROM work WHERE id=?').get(workId) as { title: string } | undefined;
    if (row) books.set(workId, row.title);
  }
  return books;
};

export function registerStudyNotesIpc(): void {
  const service = () => new StudyNotesService(settingsRepository,getDatabase());
  const changed = () => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('study-notes:changed');
  };
  ipcMain.handle('study-notes:list', () => service().list());
  ipcMain.handle('study-notes:save', (_, input: StudyNoteInput) => { const note = service().save(input); changed(); return note; });
  ipcMain.handle('study-notes:remove', (_, id: string) => { service().remove(id); changed(); });
  // One-way Markdown export (S7): the chosen notes go into a new folder inside the folder the user picks.
  ipcMain.handle('study-notes:export-markdown', async (event, ids: unknown) => {
    authorize(event);
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100_000 || ids.some(id => typeof id !== 'string'))) throw new Error('invalid-request');
    const wanted = ids ? new Set(ids as string[]) : null;
    const notes = service().list().filter(note => !wanted || wanted.has(note.id));
    if (!notes.length) return null;
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = { properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] };
    const choice = await (owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options));
    if (choice.canceled || !choice.filePaths[0]) return null;
    const parent = choice.filePaths[0];
    const folder = path.join(parent, exportFolderName(new Date(), name => existsSync(path.join(parent, name))));
    const books = workTitles(notes);
    await mkdir(folder, { recursive: false });
    for (const file of exportNotesAsMarkdown(notes, books)) await writeFile(path.join(folder, file.name), file.text, { encoding: 'utf8', flag: 'wx' });
    return { folder, count: notes.length };
  });
  // Word export (S8): the chosen notes as one .docx at a path the user picks; headings in the interface language.
  ipcMain.handle('study-notes:export-word', async (event, ids: unknown, language: unknown, layout: unknown) => {
    authorize(event);
    if (!Array.isArray(ids) || ids.length > 100_000 || ids.some(id => typeof id !== 'string')) throw new Error('invalid-request');
    const wanted = new Set(ids as string[]);
    const notes = service().list().filter(note => wanted.has(note.id));
    if (!notes.length) return null;
    const lang = language === 'ar' ? 'ar' : 'en';
    const text = translations[lang];
    const owner = BrowserWindow.fromWebContents(event.sender);
    const today = new Date();
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const options = { defaultPath: `${text.docxTitle} ${day}.docx`, filters: [{ name: 'Word', extensions: ['docx'] }] };
    const choice = await (owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options));
    if (choice.canceled || !choice.filePath) return null;
    const books = workTitles(notes);
    const buffer = await notesToDocx(notes, books, {
      title: text.docxTitle, contents: text.docxContents, exported: text.docxExported, book: text.docxBook, tags: text.docxTags, aliases: text.docxAliases, updated: text.docxUpdated,
      relations: { supports: text.relationSupports, refutes: text.relationRefutes, explains: text.relationExplains, answers: text.relationAnswers, example: text.relationExample, contrasts: text.relationContrasts, questions: text.relationQuestions },
    }, lang === 'ar', today, wordLayout(layout));
    const file = choice.filePath.toLowerCase().endsWith('.docx') ? choice.filePath : `${choice.filePath}.docx`;
    await writeFile(file, buffer);
    return { file, count: notes.length };
  });
}
