import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { copyFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ocrService } from '../services/ocr/ocr.service';
import { bibliographicMetadataService } from '../services/metadata/bibliographic-metadata.service';
import { proposeFromCover } from '../../shared/cover-text';

const LOOKUP_TIMEOUT_MS = 15000;
const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};

/** KEY-259: a cover photo proposes a physical book. Nothing is saved until the reader confirms the form. */
export function registerCoverPhotoIpc(): void {
  ipcMain.handle('cover-photo:propose', async event => {
    authorize(event);
    const options = { properties: ['openFile'] as 'openFile'[], filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] };
    const owner = BrowserWindow.fromWebContents(event.sender);
    const choice = await (owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options));
    if (choice.canceled || !choice.filePaths[0]) return null;
    const page = await ocrService.recognizeImage(choice.filePaths[0], 1, 'auto', 'ocrmypdf');
    const proposal = proposeFromCover(page.lines ?? []);
    // The photo becomes the cover, copied so the original stays where the reader left it.
    const covers = path.join(app.getPath('userData'), 'covers');
    await mkdir(covers, { recursive: true });
    const cover = path.join(covers, `photo-${randomUUID()}${path.extname(choice.filePaths[0]).toLowerCase()}`);
    await copyFile(choice.filePaths[0], cover);
    let match: { title?: string; authors?: string[]; publisher?: string; publishedYear?: number | string } | null = null;
    if (proposal.title) {
      try {
        const discovery = await Promise.race([
          bibliographicMetadataService.discoverBook({ title: proposal.title, author: proposal.author || undefined }),
          new Promise<null>(resolve => setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS)),
        ]);
        match = (discovery?.matchedWork || discovery?.candidates?.[0] || null) as typeof match;
      } catch { match = null; }
    }
    return { ...proposal, cover, engine: page.engine, match };
  });
}
