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

  // Safe PDF Base64 Streamer
  ipcMain.handle('system:read-pdf-base64', async (_, filePath: string) => {
    try {
      let resolvedPath = filePath;

      if (!fs.existsSync(resolvedPath)) {
        const candidate1 = path.resolve(process.cwd(), '..', filePath);
        const candidate2 = path.resolve(process.cwd(), filePath);
        if (fs.existsSync(candidate1)) resolvedPath = candidate1;
        else if (fs.existsSync(candidate2)) resolvedPath = candidate2;
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
        if (fs.existsSync(candidate1)) resolvedPath = candidate1;
        else if (fs.existsSync(candidate2)) resolvedPath = candidate2;
      }

      if (resolvedPath && fs.existsSync(resolvedPath)) {
        const dataBuffer = fs.readFileSync(resolvedPath);
        const pdfFn = typeof pdfParse === 'function' ? pdfParse : pdfParse.default || pdfParse.PDF;
        
        if (typeof pdfFn === 'function') {
          const pdfData = await pdfFn(dataBuffer, { pagerender: renderPageText });
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
    } catch (err) {
      console.error('Error extracting PDF text:', err);
      return null;
    }
  });
}
