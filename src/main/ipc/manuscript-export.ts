import fs from 'node:fs/promises';
import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabase, getDatabasePath } from '../database/connection';
import { researchEditorAssets } from '../services/research-editor-assets';
import { ManuscriptExportService } from '../services/manuscript-export.service';
import { ManuscriptImportService } from '../services/manuscript-import.service';
import type {
  ManuscriptExportOptions,
  ManuscriptExportResult,
  ManuscriptImportMarkdownInput,
  ManuscriptImportQuickNoteInput,
  QuickNoteItem
} from '../../shared/manuscript-export';
import type { ManuscriptDocument } from '../../shared/manuscripts';

function authorize(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000' || url.origin === 'http://127.0.0.1:3000')) throw new Error('invalid-request');
}

export function registerManuscriptExportIpc(): void {
  ipcMain.handle(
    'manuscripts:export',
    async (
      event,
      options: ManuscriptExportOptions & { saveDialog?: boolean }
    ): Promise<ManuscriptExportResult & { savedPath?: string }> => {
      authorize(event);
      const db = getDatabase();
      const assets = researchEditorAssets(getDatabasePath());
      const service = new ManuscriptExportService(db, assets);
      const result = await service.export(options);

      if (options.saveDialog) {
        const owner = BrowserWindow.fromWebContents(event.sender);
        const ext = options.format === 'markdown' ? 'md' : options.format;
        const filterNames: Record<string, string> = {
          markdown: 'Markdown Document',
          html: 'Web Page (HTML)',
          pdf: 'PDF Document',
          docx: 'Word Document'
        };

        const choice = await (owner
          ? dialog.showSaveDialog(owner, {
              defaultPath: result.filename,
              filters: [{ name: filterNames[options.format] || options.format.toUpperCase(), extensions: [ext] }]
            })
          : dialog.showSaveDialog({
              defaultPath: result.filename,
              filters: [{ name: filterNames[options.format] || options.format.toUpperCase(), extensions: [ext] }]
            }));

        if (!choice.canceled && choice.filePath) {
          if (result.base64) {
            await fs.writeFile(choice.filePath, Buffer.from(result.base64, 'base64'));
          } else if (result.content !== undefined) {
            await fs.writeFile(choice.filePath, result.content, 'utf8');
          }
          return { ...result, savedPath: choice.filePath };
        }
      }

      return result;
    }
  );

  ipcMain.handle(
    'manuscripts:importNote',
    async (event, input: ManuscriptImportQuickNoteInput): Promise<ManuscriptDocument> => {
      authorize(event);
      const db = getDatabase();
      const service = new ManuscriptImportService(db);
      return service.importQuickNote(input);
    }
  );

  ipcMain.handle(
    'manuscripts:importMarkdown',
    async (event, input: ManuscriptImportMarkdownInput): Promise<ManuscriptDocument> => {
      authorize(event);
      const db = getDatabase();
      const service = new ManuscriptImportService(db);
      return service.importMarkdown(input);
    }
  );

  ipcMain.handle(
    'manuscripts:quickNotesList',
    async (event): Promise<QuickNoteItem[]> => {
      authorize(event);
      const db = getDatabase();
      const service = new ManuscriptImportService(db);
      return service.listQuickNotes();
    }
  );
}
