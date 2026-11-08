import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { inspectPdfFile } from '../services/pdf-editor/inspection';
import { bookPdfFile } from '../services/book-files';
import { compareEditions, type CompareResult } from '../../shared/text-compare';

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};
const ID = /^[\w-]{1,180}$/u;
/** The PDF reader reads at most this many pages at once: longer books are compared on their first pages, and the result says so. */
const MAX_PAGES = 200;

/** Compare two editions (Wave 13.1): the text of two library PDFs, word by word. Read-only; neither file is changed. */
export function registerPdfCompareIpc(): void {
  let running = false;
  ipcMain.handle('pdf-compare:run', async (event, workA: unknown, workB: unknown, options: unknown): Promise<{ ok: true; data: CompareResult & { limited: boolean } } | { ok: false; error: string }> => {
    try {
      authorize(event);
      if (typeof workA !== 'string' || typeof workB !== 'string' || !ID.test(workA) || !ID.test(workB) || workA === workB) throw new Error('invalid-request');
      const ignoreDiacritics = Boolean(options && typeof options === 'object' && (options as { ignoreDiacritics?: unknown }).ignoreDiacritics === true);
      const a = bookPdfFile(workA), b = bookPdfFile(workB);
      if (!a || !b) throw new Error('no-file');
      if (running) throw new Error('busy');
      running = true;
      try {
        const [left, right] = [await inspectPdfFile(a.path, undefined, () => {}), await inspectPdfFile(b.path, undefined, () => {})];
        const result = compareEditions(left.pages.map(({ page, text }) => ({ page, text })), right.pages.map(({ page, text }) => ({ page, text })), { ignoreDiacritics });
        return { ok: true, data: { ...result, hunks: result.hunks.slice(0, 2000), limited: left.pages.length >= MAX_PAGES || right.pages.length >= MAX_PAGES || result.hunks.length > 2000 } };
      } finally { running = false; }
    } catch (error) {
      const code = (error as Error).message;
      return { ok: false, error: ['invalid-request', 'no-file', 'busy'].includes(code) ? code : 'engine-failed' };
    }
  });
}
