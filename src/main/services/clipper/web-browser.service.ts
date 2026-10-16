import { BrowserWindow, ipcMain, app } from 'electron';
import path from 'path';
import { WebClipperService } from './web-clipper.service';
import type { ClipResult } from '../../../shared/types/web-clipper';

export class WebBrowserService {
  private static instance: WebBrowserService;
  private browserWindow: BrowserWindow | null = null;
  private clipper: WebClipperService;

  constructor(clipper?: WebClipperService) {
    this.clipper = clipper || WebClipperService.getInstance();
  }

  public static getInstance(): WebBrowserService {
    if (!this.instance) {
      this.instance = new WebBrowserService();
    }
    return this.instance;
  }

  /**
   * Opens an interactive browser window for authenticated web browsing and 1-click clipping
   */
  public async openBrowserWindow(initialUrl: string = 'https://google.com'): Promise<void> {
    if (typeof BrowserWindow === 'undefined') {
      return;
    }

    if (this.browserWindow && !this.browserWindow.isDestroyed()) {
      this.browserWindow.focus();
      if (initialUrl) {
        this.browserWindow.loadURL(initialUrl);
      }
      return;
    }

    this.browserWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'Baglib Web Browser & Clipper',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
      autoHideMenuBar: true,
    });

    this.browserWindow.loadURL(initialUrl);

    this.browserWindow.on('closed', () => {
      this.browserWindow = null;
    });
  }

  /**
   * Captures the current DOM and URL from the active browser window and clips it into the library
   */
  public async clipCurrentPage(): Promise<ClipResult> {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) {
      throw new Error('No active browser window to clip from');
    }

    const currentUrl = this.browserWindow.webContents.getURL();
    const currentHtml = await this.browserWindow.webContents.executeJavaScript(
      'document.documentElement.outerHTML'
    );

    return this.clipper.clipArticle({
      url: currentUrl,
      html: currentHtml,
      targetFormat: 'epub',
      downloadImages: true,
      importToLibrary: true,
    });
  }

  public closeBrowser(): void {
    if (this.browserWindow && !this.browserWindow.isDestroyed()) {
      this.browserWindow.close();
      this.browserWindow = null;
    }
  }
}
