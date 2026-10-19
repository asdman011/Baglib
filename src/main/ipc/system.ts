import { ipcMain, app, dialog } from 'electron';
import fs from 'fs';
import path from 'path';

const pdfParse = require('pdf-parse');

// Custom page renderer to accurately capture page boundaries
function renderPageText(pageData: any) {
  return pageData.getTextContent().then(function (textContent: any) {
    let lastY: number | undefined;
    let text = '';
    for (const item of textContent.items) {
      if (lastY === item.transform[5] || lastY === undefined) {
        text += item.str;
      } else {
        text += '\n' + item.str;
      }
      lastY = item.transform[5];
    }
    return '\n---PAGE_SPLIT_MARKER---\n' + text;
  });
}

export function setupSystemIPC() {
  ipcMain.handle('system:get-info', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
    };
  });

  // Native Electron OS File Picker Dialog
  ipcMain.handle('system:open-file-dialog', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: 'اختر كتاباً أو ملفاً رقمياً من حاسوبك',
        filters: [
          { name: 'جميع كتب وملفات المكتبة الرقمية', extensions: ['pdf', 'epub', 'mobi', 'azw3', 'txt', 'html', 'djvu', 'docx'] },
          { name: 'ملفات PDF', extensions: ['pdf'] },
          { name: 'كتب EPUB و MOBI', extensions: ['epub', 'mobi', 'azw3'] },
          { name: 'ملفات نصوص HTML / TXT', extensions: ['txt', 'html', 'docx'] },
          { name: 'جميع الملفات (*.*)', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    } catch (err) {
      console.error('Error in open-file-dialog:', err);
      return null;
    }
  });

  // Native Electron OS Multi-File Picker Dialog
  ipcMain.handle('system:open-files-dialog', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: 'اختر كتباً أو ملفات رقمية من حاسوبك',
        filters: [
          { name: 'جميع كتب وملفات المكتبة الرقمية', extensions: ['pdf', 'epub', 'mobi', 'azw3', 'txt', 'html', 'djvu', 'docx'] },
          { name: 'ملفات PDF', extensions: ['pdf'] },
          { name: 'كتب EPUB و MOBI', extensions: ['epub', 'mobi', 'azw3'] },
          { name: 'ملفات نصوص HTML / TXT', extensions: ['txt', 'html', 'docx'] },
          { name: 'جميع الملفات (*.*)', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths;
      }
      return [];
    } catch (err) {
      console.error('Error in open-files-dialog:', err);
      return [];
    }
  });

  // Native Electron OS Directory Picker Dialog
  ipcMain.handle('system:open-directory-dialog', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'اختر مجلداً للبحث عن الملفات المفقودة / Select Folder to Scan for Missing Files',
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    } catch (err) {
      console.error('Error in open-directory-dialog:', err);
      return null;
    }
  });

  // Save dropped in-memory file buffer to persistent local imports folder
  ipcMain.handle('system:save-file-buffer', async (_, { name, buffer }: { name: string; buffer: Uint8Array | number[] }) => {
    try {
      const importDir = path.join(app.getPath('userData'), 'imports');
      await fs.promises.mkdir(importDir, { recursive: true });
      const safeName = path.basename(name).replace(/[^a-zA-Z0-9.\-_ \u0600-\u06FF]/g, '_');
      const targetPath = path.join(importDir, `${Date.now()}-${safeName}`);
      await fs.promises.writeFile(targetPath, Buffer.from(buffer));
      return targetPath;
    } catch (err) {
      console.error('[baglib/system-ipc] save-file-buffer error:', err);
      return null;
    }
  });

  // Safe PDF Base64 Streamer
  ipcMain.handle('system:read-pdf-base64', async (_, filePath: string) => {
    try {
      let resolvedPath = filePath;

      if (!fs.existsSync(resolvedPath)) {
        const candidate1 = path.resolve(process.cwd(), '..', filePath);
        const candidate2 = path.resolve(process.cwd(), filePath);
        const candidate3 = path.join(app.getPath('userData'), 'imports', path.basename(filePath));
        if (fs.existsSync(candidate1)) resolvedPath = candidate1;
        else if (fs.existsSync(candidate2)) resolvedPath = candidate2;
        else if (fs.existsSync(candidate3)) resolvedPath = candidate3;
      }

      if (resolvedPath && fs.existsSync(resolvedPath)) {
        const buffer = fs.readFileSync(resolvedPath);
        return buffer.toString('base64');
      }
      return null;
    } catch (err) {
      console.error('Error reading file in IPC:', err);
      return null;
    }
  });

  // Smart PDF Text Extractor with Scanned / Watermark Detection
  ipcMain.handle('system:extract-pdf-text', async (_, filePath: string) => {
    try {
      let resolvedPath = filePath;

      if (!fs.existsSync(resolvedPath)) {
        const candidate1 = path.resolve(process.cwd(), '..', filePath);
        const candidate2 = path.resolve(process.cwd(), filePath);
        const candidate3 = path.join(app.getPath('userData'), 'imports', path.basename(filePath));
        if (fs.existsSync(candidate1)) resolvedPath = candidate1;
        else if (fs.existsSync(candidate2)) resolvedPath = candidate2;
        else if (fs.existsSync(candidate3)) resolvedPath = candidate3;
      }

      if (resolvedPath && fs.existsSync(resolvedPath)) {
        const dataBuffer = fs.readFileSync(resolvedPath);
        if (dataBuffer.length < 10 || !dataBuffer.slice(0, 1024).toString('latin1').includes('%PDF-')) {
          console.warn('[baglib:pdf-text] Skipped non-PDF or corrupt file:', path.basename(resolvedPath));
          return null;
        }

        const pdfFn = typeof pdfParse === 'function' ? pdfParse : pdfParse.default || pdfParse.PDF;
        
        if (typeof pdfFn === 'function') {
          // Suppress verbose internal pdf.js font warnings that flood dev terminal
          const origWarn = console.warn;
          console.warn = (...args: any[]) => {
            const first = args[0];
            if (typeof first === 'string' && first.includes('Ran out of space in font private use area')) {
              return;
            }
            origWarn.apply(console, args);
          };

          let pdfData: any;
          try {
            pdfData = await pdfFn(new Uint8Array(dataBuffer), { pagerender: renderPageText });
          } finally {
            console.warn = origWarn;
          }

          const rawText = pdfData.text || '';
          const cleanText = rawText.replace(/---PAGE_SPLIT_MARKER---/g, '').trim();
          const numPages = pdfData.numpages || 1;
          const avgCharsPerPage = cleanText.length / numPages;

          // Check if average text per page is less than 50 characters (Watermark/ID-only scanned PDF)
          const isScannedImagePdf = avgCharsPerPage < 50;

          return {
            text: isScannedImagePdf ? '' : rawText,
            numpages: numPages,
            info: pdfData.info || {},
            isScannedImagePdf,
            avgCharsPerPage,
            totalChars: cleanText.length,
          };
        }
      }
      return null;
    } catch (err: any) {
      console.warn('[baglib:pdf-text] Could not extract text from PDF:', err?.message || err);
      return null;
    }
  });

  /**
   * Safely opens an external URL in the OS default web browser
   */
  ipcMain.handle('system:open-external', async (_, url: string) => {
    try {
      if (!url || typeof url !== 'string') return false;
      const { shell } = require('electron');
      await shell.openExternal(url);
      return true;
    } catch (err) {
      console.error('[baglib:system] open-external error:', err);
      return false;
    }
  });

  /**
   * Returns active status of uBlock-inspired content shield
   */
  ipcMain.handle('system:get-shield-status', async () => {
    try {
      const { ContentShieldService } = require('../services/shield/content-shield.service');
      return ContentShieldService.getInstance().getActiveShieldStatus();
    } catch (err) {
      console.error('[baglib:system] get-shield-status error:', err);
      return null;
    }
  });
}

