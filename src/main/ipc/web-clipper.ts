import { ipcMain } from 'electron';
import { WebClipperService } from '../services/clipper/web-clipper.service';
import { WebBrowserService } from '../services/clipper/web-browser.service';
import type { ClipOptions, SerializedNovelOptions } from '../../shared/types/web-clipper';

export function registerWebClipperIpcHandlers(): void {
  const clipper = WebClipperService.getInstance();
  const browser = WebBrowserService.getInstance();

  ipcMain.handle('clipper:clip-url', async (_event, options: ClipOptions) => {
    return clipper.clipArticle(options);
  });

  ipcMain.handle('clipper:clip-html', async (_event, options: ClipOptions) => {
    return clipper.clipArticle(options);
  });

  ipcMain.handle('clipper:scrape-novel', async (_event, options: SerializedNovelOptions) => {
    return clipper.scrapeSerializedNovel(options);
  });

  ipcMain.handle('clipper:open-browser', async (_event, initialUrl?: string) => {
    return browser.openBrowserWindow(initialUrl);
  });

  ipcMain.handle('clipper:clip-browser', async () => {
    return browser.clipCurrentPage();
  });
}
