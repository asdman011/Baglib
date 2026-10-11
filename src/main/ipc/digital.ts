import { ipcMain } from 'electron';
import { DigitalFileValidatorService } from '../services/digital/digital-file-validator.service';
import { DigitalImportPipelineService } from '../services/digital/digital-import-pipeline.service';
import { EbookMetadataExtractorService } from '../services/digital/ebook-metadata-extractor.service';
import type { DigitalImportOptions } from '../../shared/types/digital-file';
import type { DigitalFormat } from '../../shared/types/work';

export function setupDigitalIPC(): void {
  const validator = DigitalFileValidatorService.getInstance();
  const pipeline = DigitalImportPipelineService.getInstance();
  const extractor = EbookMetadataExtractorService.getInstance();

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

  /**
   * Import a single digital e-book file into the library
   */
  ipcMain.handle('digital:import-file', async (_event, options: DigitalImportOptions) => {
    try {
      if (!options || !options.filePath) {
        return {
          success: false,
          filePath: '',
          fileName: '',
          fileSizeBytes: 0,
          errorCode: 'INVALID_INPUT',
          error: 'خيارات الاستيراد غير صالحة / Invalid import options provided',
        };
      }
      return await pipeline.importFile(options);
    } catch (err: any) {
      console.error('[DigitalIPC] Error importing digital file:', err);
      return {
        success: false,
        filePath: options?.filePath || '',
        fileName: '',
        fileSizeBytes: 0,
        errorCode: 'UNEXPECTED_ERROR',
        error: err?.message || 'خطأ غير متوقع أثناء استيراد الملف / Unexpected error importing file',
      };
    }
  });

  /**
   * Batch import multiple digital files
   */
  ipcMain.handle('digital:import-files', async (_event, optionsList: DigitalImportOptions[]) => {
    try {
      if (!Array.isArray(optionsList)) {
        return { totalFiles: 0, successfulImports: 0, failedImports: 0, results: [] };
      }
      return await pipeline.importFiles(optionsList);
    } catch (err: any) {
      console.error('[DigitalIPC] Error batch importing digital files:', err);
      return { totalFiles: 0, successfulImports: 0, failedImports: 0, results: [] };
    }
  });

  /**
   * Extract embedded metadata and cover without importing into database
   */
  ipcMain.handle('digital:extract-metadata', async (_event, filePath: string, formatHint?: DigitalFormat) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('المسار المحدد غير صالح / Invalid file path provided');
      }
      return await extractor.extract(filePath, formatHint);
    } catch (err: any) {
      console.error('[DigitalIPC] Error extracting digital metadata:', err);
      return null;
    }
  });
}
