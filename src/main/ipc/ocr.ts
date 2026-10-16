import { ipcMain } from 'electron';
import { ocrService } from '../services/ocr/ocr.service';
import {
  OcrRecognizePageParams,
  OcrRecognizeDocumentParams,
  OcrLanguage,
} from '../../shared/types/ocr';

export function registerOcrIpc(): void {
  // Check if native OS OCR is supported
  ipcMain.handle('ocr:is-supported', async () => {
    try {
      return ocrService.isSupported();
    } catch {
      return false;
    }
  });

  // Get available OS OCR languages
  ipcMain.handle('ocr:get-available-languages', async () => {
    try {
      return await ocrService.getAvailableLanguages();
    } catch {
      return ['en-US', 'ar-SA'];
    }
  });

  // Recognize single page (from image dataURL, buffer, or PDF path)
  ipcMain.handle(
    'ocr:recognize-page',
    async (_, params: OcrRecognizePageParams) => {
      try {
        const { imageBufferOrBase64, filePath, pageNumber = 1, language = 'auto' } = params;

        if (imageBufferOrBase64) {
          return await ocrService.recognizeImage(imageBufferOrBase64, pageNumber, language);
        }

        if (filePath && filePath.toLowerCase().endsWith('.pdf')) {
          return await ocrService.recognizePdfPage(filePath, pageNumber, language);
        }

        if (filePath) {
          return await ocrService.recognizeImage(filePath, pageNumber, language);
        }

        throw new Error('Neither imageBufferOrBase64 nor filePath was provided');
      } catch (err: any) {
        console.warn('[IPC:ocr:recognize-page] Error:', err);
        return {
          pageNumber: params.pageNumber || 1,
          text: '',
          lines: [],
          words: [],
          width: 800,
          height: 1100,
          engine: 'fallback_ocr',
          durationMs: 0,
        };
      }
    }
  );

  // Recognize document with progressive progress events
  ipcMain.handle(
    'ocr:recognize-document',
    async (event, params: OcrRecognizeDocumentParams) => {
      try {
        return await ocrService.recognizeDocument(params, payload => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('ocr:progress', payload);
          }
        });
      } catch (err: any) {
        console.warn('[IPC:ocr:recognize-document] Error:', err);
        return {
          bookId: params.bookId,
          filePath: params.filePath,
          totalPages: 0,
          recognizedPages: 0,
          pages: [],
          fullText: '',
          durationMs: 0,
        };
      }
    }
  );
}
