import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'fs/promises';
import { PdfPackagerService } from '../services/clipper/pdf-packager.service';
import { renderHtmlToPdf } from '../services/pdf-editor/weasyprint';
import type { PdfExportBookInput, PdfExportHtmlInput, PdfExportResult } from '../../shared/types/web-clipper';

async function saveRenderedPdf(event: IpcMainInvokeEvent, suggestedName: string, render: () => Promise<Buffer>): Promise<PdfExportResult> {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const defaultPath = `${suggestedName.replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 120) || 'document'}.pdf`;
  const options = { defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] };
  const choice = await (owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options));
  if (choice.canceled || !choice.filePath) return { ok: false, error: 'cancelled' };
  try {
    const data = await render();
    await writeFile(choice.filePath, data);
    return { ok: true, filePath: choice.filePath };
  } catch (error) {
    return { ok: false, error: (error as Error).message === 'engine-missing' ? 'engine-missing' : 'engine-failed' };
  }
}

export function registerPdfExportIpcHandlers(): void {
  ipcMain.handle('pdf-export:book', (event, input: PdfExportBookInput) => {
    if (typeof input?.title !== 'string' || !Array.isArray(input.chapters) || input.chapters.length === 0) return { ok: false, error: 'engine-failed' };
    return saveRenderedPdf(event, input.title, () => PdfPackagerService.getInstance().packageChapters(input.chapters, input));
  });

  ipcMain.handle('pdf-export:html', (event, input: PdfExportHtmlInput) => {
    if (typeof input?.html !== 'string') return { ok: false, error: 'engine-failed' };
    return saveRenderedPdf(event, input.fileName, () => renderHtmlToPdf(input.html));
  });
}
