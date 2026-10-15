import { ipcMain } from 'electron';
import { DigitalFileValidatorService } from '../services/digital/digital-file-validator.service';
import { DigitalImportPipelineService } from '../services/digital/digital-import-pipeline.service';
import { EbookMetadataExtractorService } from '../services/digital/ebook-metadata-extractor.service';
import { DuplicateDetectorService } from '../services/digital/duplicate-detector.service';
import { StorageManagerService } from '../services/storage/storage-manager.service';
import { WorkRepository } from '../database/repositories/work.repository';
import { getDatabase } from '../database/connection';
import type { DigitalImportOptions } from '../../shared/types/digital-file';
import type { DigitalFormat } from '../../shared/types/work';

export function setupDigitalIPC(): void {
  const validator = DigitalFileValidatorService.getInstance();
  const pipeline = DigitalImportPipelineService.getInstance();
  const extractor = EbookMetadataExtractorService.getInstance();
  const duplicateDetector = DuplicateDetectorService.getInstance();

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
   * Batch import multiple digital files with streaming progress reporting
   */
  ipcMain.handle('digital:import-files', async (event, optionsList: DigitalImportOptions[]) => {
    try {
      if (!Array.isArray(optionsList)) {
        return { totalFiles: 0, successfulImports: 0, failedImports: 0, skippedImports: 0, results: [] };
      }
      return await pipeline.importFiles(optionsList, (progress) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('digital:import-progress', progress);
          }
        } catch {
          // ignore if sender window closed
        }
      });
    } catch (err: any) {
      console.error('[DigitalIPC] Error batch importing digital files:', err);
      return { totalFiles: 0, successfulImports: 0, failedImports: 0, skippedImports: 0, results: [] };
    }
  });

  /**
   * Check files or candidate metadata for potential duplicates in library
   */
  ipcMain.handle('digital:check-duplicates', async (_event, inputs: any[]) => {
    try {
      if (!Array.isArray(inputs)) return [];
      return await duplicateDetector.batchCheckDuplicates(inputs);
    } catch (err: any) {
      console.error('[DigitalIPC] Error checking duplicates:', err);
      return [];
    }
  });

  /**
   * Verify digital file accessibility and storage health on disk for a work
   */
  ipcMain.handle('digital:verify-file', async (_event, workId: string) => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.verifyWorkStorage(workId, true);
    } catch (err: any) {
      console.error('[DigitalIPC] Error verifying file health:', err);
      return null;
    }
  });

  /**
   * Verify all digital library files across disk
   */
  ipcMain.handle('digital:verify-files', async () => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.verifyAllStorage(false);
    } catch (err: any) {
      console.error('[DigitalIPC] Error verifying all files:', err);
      return { totalDigitalWorks: 0, totalFiles: 0, availableFiles: 0, missingFiles: 0, unmountedFiles: 0, corruptedFiles: 0, duplicateFiles: 0, totalSizeBytes: 0, reclaimableSizeBytes: 0, formatBreakdown: {}, items: [] };
    }
  });

  /**
   * Storage Management IPC Channels (Story 7 / KEY-7)
   */
  ipcMain.handle('storage:get-health-summary', async () => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.verifyAllStorage(false);
    } catch (err: any) {
      console.error('[StorageIPC] Error getting health summary:', err);
      return { totalDigitalWorks: 0, totalFiles: 0, availableFiles: 0, missingFiles: 0, unmountedFiles: 0, corruptedFiles: 0, duplicateFiles: 0, totalSizeBytes: 0, reclaimableSizeBytes: 0, formatBreakdown: {}, items: [] };
    }
  });

  ipcMain.handle('storage:verify-all', async () => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.verifyAllStorage(true);
    } catch (err: any) {
      console.error('[StorageIPC] Error in verify-all:', err);
      return { totalDigitalWorks: 0, totalFiles: 0, availableFiles: 0, missingFiles: 0, unmountedFiles: 0, corruptedFiles: 0, duplicateFiles: 0, totalSizeBytes: 0, reclaimableSizeBytes: 0, formatBreakdown: {}, items: [] };
    }
  });

  ipcMain.handle('storage:verify-file', async (_event, workId: string) => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.verifyWorkStorage(workId, true);
    } catch (err: any) {
      console.error('[StorageIPC] Error in verify-file:', err);
      return null;
    }
  });

  ipcMain.handle('storage:relink-file', async (_event, workId: string, newFilePath: string) => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.relinkFile(workId, newFilePath);
    } catch (err: any) {
      console.error('[StorageIPC] Error in relink-file:', err);
      return { success: false, workId, newFilePath, error: err?.message || 'Error relinking file' };
    }
  });

  ipcMain.handle('storage:batch-auto-rebind', async (_event, searchDirectory: string) => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.batchAutoRebind(searchDirectory);
    } catch (err: any) {
      console.error('[StorageIPC] Error in batch-auto-rebind:', err);
      return { scannedFilesCount: 0, resolvedCount: 0, unresolvedCount: 0, matches: [], errors: [err?.message || 'Error during batch scan'] };
    }
  });

  ipcMain.handle('storage:get-analytics', async () => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.getStorageAnalytics();
    } catch (err: any) {
      console.error('[StorageIPC] Error in get-analytics:', err);
      return {
        totalDigitalWorks: 0,
        totalFiles: 0,
        totalSizeBytes: 0,
        reclaimableBytes: 0,
        healthCounts: { available: 0, missing: 0, unmounted: 0, corrupted: 0, duplicate: 0 },
        formatDistribution: {},
        duplicateGroups: [],
      };
    }
  });

  ipcMain.handle('storage:prune-duplicate', async (_event, options: any) => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.pruneDuplicate(options);
    } catch (err: any) {
      console.error('[StorageIPC] Error in prune-duplicate:', err);
      return { success: false, freedBytes: 0, fileDeletedFromDisk: false, error: err?.message || 'Error pruning duplicate' };
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
