import { ipcMain } from 'electron';
import { DigitalFileValidatorService } from '../services/digital/digital-file-validator.service';

export function setupDigitalIPC(): void {
  const validator = DigitalFileValidatorService.getInstance();

  /**
   * Validate a single digital file on disk by path
   */
  ipcMain.handle('digital:validate-file', async (_event, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return {
          isValid: false,
          fileName: '',
          extension: '',
          fileSizeBytes: 0,
          errorCode: 'FILE_NOT_FOUND',
          error: 'المسار المحدد غير صالح / Invalid file path provided',
        };
      }
      return await validator.validateFile(filePath);
    } catch (err: any) {
      return {
        isValid: false,
        fileName: '',
        extension: '',
        fileSizeBytes: 0,
        errorCode: 'READ_ERROR',
        error: err?.message || 'خطأ غير متوقع أثناء فحص الملف / Unexpected error validating file',
      };
    }
  });

  /**
   * Batch validate multiple digital files on disk
   */
  ipcMain.handle('digital:validate-files', async (_event, filePaths: string[]) => {
    try {
      if (!Array.isArray(filePaths)) {
        return { totalFiles: 0, validFiles: 0, invalidFiles: 0, results: [] };
      }
      return await validator.validateFiles(filePaths);
    } catch (err: any) {
      console.error('[DigitalIPC] Error batch validating files:', err);
      return { totalFiles: 0, validFiles: 0, invalidFiles: 0, results: [] };
    }
  });

  /**
   * Return list of supported digital formats
   */
  ipcMain.handle('digital:get-supported-formats', async () => {
    return validator.getSupportedFormats();
  });
}
