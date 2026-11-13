import { exportableStudyNotes } from '../../shared/study-note-export';
import { SqliteKnowledgeRepository } from '../database/repositories/knowledge.repository';
import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { settingsRepository } from '../database/repositories/settings.repository';
import { StudyNotesService } from '../services/study-notes';
import type { StudyNoteInput } from '../../shared/study-notes';
import { exportFolderName, exportNotesAsMarkdown } from '../../shared/markdown-export';
import { getDatabase } from '../database/connection';
import { notesToDocx } from '../services/notes-docx';
import { wordLayout } from '../../shared/word-export';
import { translations } from '../../renderer/translations';
import { exportNotesAsCsv, exportNotesAsLatex } from '../../shared/note-open-formats';
import { importDocxXml, importNotesCsv, importPlainMarkdown, safeFolderName, type ImportedNote } from '../../shared/note-import';
import { studyLinkText, validStudyTarget } from '../../shared/study-notes';
import { readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';

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
  const exportNotes = () => exportableStudyNotes(service().list(), new SqliteKnowledgeRepository(getDatabase()).getAllKnowledge());
  const changed = () => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('study-notes:changed');
  };
  ipcMain.handle('study-notes:list', () => service().list());
  ipcMain.handle('study-notes:save', (_, input: StudyNoteInput) => { const note = service().save(input); changed(); return note; });
  ipcMain.handle('study-notes:remove', (_, id: string) => { service().remove(id); changed(); });
  // Every export uses a fresh folder, preserving the user's existing files.
  const exportOpenFormat = async (event: IpcMainInvokeEvent, ids: unknown, format: unknown = 'markdown', folders?: unknown) => {
    authorize(event);
    if (!['markdown', 'csv', 'latex'].includes(format as string)) throw new Error('invalid-request');
    // KEY-345: Markdown can be written as a folder tree mirroring the Notes tab: { noteId: [folder names] }.
    if (folders !== undefined && (format !== 'markdown' || !folders || typeof folders !== 'object' || Array.isArray(folders)
      || Object.values(folders as Record<string, unknown>).some(value => !Array.isArray(value) || value.length > 6 || value.some(part => typeof part !== 'string' || part.length > 200)))) throw new Error('invalid-request');
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100_000 || ids.some(id => typeof id !== 'string'))) throw new Error('invalid-request');
    const wanted = ids ? new Set(ids as string[]) : null;
    const notes = exportNotes().filter(note => !wanted || wanted.has(note.id));
    if (!notes.length) return null;
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = { properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] };
    const choice = await (owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options));
    if (choice.canceled || !choice.filePaths[0]) return null;
    const parent = choice.filePaths[0];
    const folder = path.join(parent, exportFolderName(new Date(), name => existsSync(path.join(parent, name))));
    const books = workTitles(notes);
    await mkdir(folder, { recursive: false });
    const files = format === 'markdown' ? exportNotesAsMarkdown(notes, books)
      : [{ name: format === 'csv' ? 'notes.csv' : 'notes.tex', text: format === 'csv' ? exportNotesAsCsv(notes) : exportNotesAsLatex(notes) }];
    const tree = folders as Record<string, string[]> | undefined;
    for (const [index, file] of files.entries()) {
      const parts = tree?.[notes[index]?.id]?.map(safeFolderName) ?? [];
      const target = path.join(folder, ...parts);
      if (path.relative(folder, target).startsWith('..')) throw new Error('invalid-request');
      if (parts.length) await mkdir(target, { recursive: true });
      await writeFile(path.join(target, file.name), file.text, { encoding: 'utf8', flag: 'wx' });
    }
    return { folder, count: notes.length };
  };
  ipcMain.handle('study-notes:export-markdown', (event, ids: unknown) => exportOpenFormat(event, ids));
  ipcMain.handle('study-notes:export-open-format', exportOpenFormat);
  ipcMain.handle('study-notes:import-markdown', async event => {
    authorize(event);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = { properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[], filters: [{ name: 'Markdown', extensions: ['md'] }] };
    const choice = await (owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options));
    if (choice.canceled || !choice.filePaths.length) return null;
    if (choice.filePaths.length > 1000) throw new Error('invalid-request');
    const files = [];
    let bytes = 0;
    for (const file of choice.filePaths) {
      const info = await stat(file);
      bytes += info.size;
      if (!info.isFile() || info.size > 2_000_000 || bytes > 20_000_000) throw new Error('invalid-request');
      files.push({ name: path.basename(file), text: await readFile(file, 'utf8') });
    }
    const result = service().importMarkdown(files);
    changed();
    return result;
  });
  // KEY-345: import notes from any Markdown file, an Obsidian vault (a folder), a Word document or BagLib's CSV.
  // Step 1 parses and returns a count to confirm; step 2 saves, attaching each note to the open Notes folder.
  const pending = new Map<string, ImportedNote[]>();
  ipcMain.handle('study-notes:import-prepare', async (event, kind: unknown) => {
    authorize(event);
    if (!['markdown', 'folder', 'docx', 'csv'].includes(kind as string)) throw new Error('invalid-request');
    const owner = BrowserWindow.fromWebContents(event.sender);
    const filters = kind === 'docx' ? [{ name: 'Word', extensions: ['docx'] }] : kind === 'csv' ? [{ name: 'CSV', extensions: ['csv'] }] : [{ name: 'Markdown', extensions: ['md', 'markdown'] }];
    const options = kind === 'folder' ? { properties: ['openDirectory'] as ('openDirectory')[] } : { properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[], filters };
    const choice = await (owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options));
    if (choice.canceled || !choice.filePaths.length) return null;
    let paths = choice.filePaths;
    if (kind === 'folder') {
      const root = paths[0];
      const found: string[] = [];
      const walk = async (directory: string, depth: number) => {
        if (depth > 8 || found.length > 5000) return;
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (entry.name.startsWith('.')) continue; // .obsidian, .trash, hidden files
          const full = path.join(directory, entry.name);
          if (path.relative(root, full).startsWith('..')) continue;
          if (entry.isDirectory()) await walk(full, depth + 1);
          else if (entry.isFile() && /\.(md|markdown)$/iu.test(entry.name)) found.push(full);
        }
      };
      await walk(root, 0);
      paths = found;
    }
    if (paths.length > 5000) throw new Error('invalid-request');
    let bytes = 0;
    const read = async (file: string, limit: number) => {
      const info = await stat(file);
      bytes += info.size;
      if (!info.isFile() || info.size > limit || bytes > 60_000_000) throw new Error('invalid-request');
      return readFile(file);
    };
    let notes: ImportedNote[] = [];
    if (kind === 'docx') {
      for (const file of paths) {
        // Only the document body is unpacked, with a size cap (zip-bomb guard).
        const entries = unzipSync(await read(file, 30_000_000), { filter: entry => entry.name === 'word/document.xml' && entry.originalSize <= 40_000_000 });
        const xml = entries['word/document.xml'];
        if (!xml) throw new Error('invalid-docx');
        notes.push(...importDocxXml(strFromU8(xml), path.basename(file).replace(/\.docx$/iu, ''), randomUUID));
      }
    } else if (kind === 'csv') {
      for (const file of paths) notes.push(...importNotesCsv((await read(file, 20_000_000)).toString('utf8'), randomUUID));
    } else {
      const files = [];
      for (const file of paths) files.push({ path: path.relative(kind === 'folder' ? choice.filePaths[0] : path.dirname(file), file), text: (await read(file, 2_000_000)).toString('utf8') });
      notes = importPlainMarkdown(files, randomUUID);
    }
    if (notes.length > 5000) throw new Error('invalid-request');
    const token = randomUUID();
    pending.clear();
    pending.set(token, notes);
    return { token, count: notes.length, titles: notes.slice(0, 5).map(note => note.title) };
  });
  ipcMain.handle('study-notes:import-commit', (event, token: unknown, attach: unknown) => {
    authorize(event);
    const notes = typeof token === 'string' ? pending.get(token) : undefined;
    if (!notes) throw new Error('invalid-request');
    const target = attach && typeof attach === 'object' ? String((attach as { target?: unknown }).target ?? '') : '';
    const label = attach && typeof attach === 'object' ? String((attach as { label?: unknown }).label ?? '').slice(0, 200) : '';
    const link = target && validStudyTarget(target) ? studyLinkText(target, label || target) : '';
    const notesService = service();
    for (const note of notes) notesService.save({ id: note.id, title: note.title, content: link ? `${link}\n\n${note.content}` : note.content, tags: note.tags, aliases: note.aliases });
    pending.delete(token as string);
    changed();
    return { count: notes.length };
  });
  // Word export (S8): the chosen notes as one .docx at a path the user picks; headings in the interface language.
  ipcMain.handle('study-notes:export-word', async (event, ids: unknown, language: unknown, layout: unknown) => {
    authorize(event);
    if (!Array.isArray(ids) || ids.length > 100_000 || ids.some(id => typeof id !== 'string')) throw new Error('invalid-request');
    const wanted = new Set(ids as string[]);
    const notes = exportNotes().filter(note => wanted.has(note.id));
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
