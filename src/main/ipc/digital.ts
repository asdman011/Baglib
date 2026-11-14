import path from 'node:path';
import { stat } from 'node:fs/promises';
import { errorMessage } from '../../shared/errors';
import { ipcMain } from 'electron';
import { confirmedQuitCleanup } from '../services/quit-cleanup';
import { DigitalFileValidatorService } from '../services/digital/digital-file-validator.service';
import { DigitalImportPipelineService } from '../services/digital/digital-import-pipeline.service';
import { DuplicateDetectorService } from '../services/digital/duplicate-detector.service';
import { StorageManagerService } from '../services/storage/storage-manager.service';
import type { DigitalImportOptions } from '../../shared/types/digital-file';
import type { DigitalFormat } from '../../shared/types/work';
import { BackgroundMetadataService } from '../services/digital/background-metadata.service';
import { discoverImportFiles } from '../services/digital/import-files';
import { ImportQueue } from '../services/digital/import-queue';

export function setupDigitalIPC(): void {
  const validator = DigitalFileValidatorService.getInstance();
  const extractor = new BackgroundMetadataService();
  const duplicateDetector = new DuplicateDetectorService(undefined, extractor);
  const pipeline = new DigitalImportPipelineService(undefined, validator, extractor, undefined, duplicateDetector);
  const queue = new ImportQueue(() => extractor.dispose());
  confirmedQuitCleanup.registerDrain(() => queue.close());
  const batches = new Map<string, AbortController>();
  const folderSelections = new Map<number, Set<string>>();
  ipcMain.handle('digital:cancel-import', (event, jobId: string) => {
    if (typeof jobId !== 'string') return false;
    const controller = batches.get(event.sender.id + ':' + jobId);
    controller?.abort();
    return Boolean(controller);
  });
  const enqueue = <Value>(action: () => Promise<Value>): Promise<Value> => queue.enqueue(action);
  ipcMain.handle('digital:discover-files', async (event, paths: string[]) => {
    if (!Array.isArray(paths) || paths.some(value => typeof value !== 'string')) throw new Error('Invalid import paths');
    const discovery = await discoverImportFiles(paths);
    if (!folderSelections.has(event.sender.id)) {
      folderSelections.set(event.sender.id, new Set());
      event.sender.once('destroyed', () => folderSelections.delete(event.sender.id));
    }
    const folders = folderSelections.get(event.sender.id)!;
    // A fresh direct-file discovery supersedes stale folder provenance from a dismissed wizard.
    for (const file of discovery.files) folders.delete(path.dirname(file.path));
    for (const input of paths) {
      if (!(await stat(input).catch(() => null))?.isDirectory()) continue;
      for (const file of discovery.files) {
        const relative = path.relative(input, file.path);
        if (relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) folders.add(path.dirname(file.path));
      }
    }
    return discovery;
  });

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
          error: 'FILE_NOT_FOUND',
        };
      }
      return await validator.validateFile(filePath);
    } catch {
      return {
        isValid: false,
        fileName: '',
        extension: '',
        fileSizeBytes: 0,
        errorCode: 'READ_ERROR',
        error: 'READ_ERROR',
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
    } catch (err: unknown) {
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
          errorCode: 'IMPORT_ERROR',
          error: 'IMPORT_ERROR',
        };
      }
      return await enqueue(() => pipeline.importFile(options));
    } catch (err: unknown) {
      console.error('[DigitalIPC] Error importing digital file:', err);
      return {
        success: false,
        filePath: options?.filePath || '',
        fileName: '',
        fileSizeBytes: 0,
        errorCode: 'IMPORT_ERROR',
        error: 'IMPORT_ERROR',
      };
    }
  });

  /**
   * Batch import multiple digital files with streaming progress reporting
   */
  ipcMain.handle('digital:import-files', async (event, optionsList: DigitalImportOptions[], jobId?: string) => {
    if (jobId !== undefined && (typeof jobId !== 'string' || !jobId || jobId.length > 128)) throw new Error('Invalid import job');
    const key = jobId ? event.sender.id + ':' + jobId : undefined;
    if (key && batches.has(key)) throw new Error('Import job already active');
    const controller = new AbortController();
    if (key) batches.set(key, controller);
    try {
      if (!Array.isArray(optionsList)) {
        return { totalFiles: 0, successfulImports: 0, failedImports: 0, skippedImports: 0, results: [] };
      }
      const folders = [...(folderSelections.get(event.sender.id) ?? [])];
      folderSelections.get(event.sender.id)?.clear();
      return await enqueue(() => pipeline.importFiles(optionsList, (progress) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('digital:import-progress', { ...progress, jobId });
          }
        } catch {
          // ignore if sender window closed
        }
      }, controller.signal, folders));
    } catch (err: unknown) {
      console.error('[DigitalIPC] Error batch importing digital files:', err);
      throw err;
    } finally {
      if (key) batches.delete(key);
    }
  });

  /**
   * Check files or candidate metadata for potential duplicates in library
   */
  ipcMain.handle('digital:check-duplicates', async (_event, inputs: Parameters<DuplicateDetectorService['batchCheckDuplicates']>[0]) => {
    try {
      if (!Array.isArray(inputs)) return [];
      return await enqueue(() => duplicateDetector.batchCheckDuplicates(inputs));
    } catch (err: unknown) {
      console.error('[DigitalIPC] Error checking duplicates:', err);
      throw err;
    }
  });

  /**
   * Verify digital file accessibility and storage health on disk for a work
   */
  ipcMain.handle('digital:verify-file', async (_event, workId: string) => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.verifyWorkStorage(workId, true);
    } catch (err: unknown) {
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
    } catch (err: unknown) {
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
    } catch (err: unknown) {
      console.error('[StorageIPC] Error getting health summary:', err);
      return { totalDigitalWorks: 0, totalFiles: 0, availableFiles: 0, missingFiles: 0, unmountedFiles: 0, corruptedFiles: 0, duplicateFiles: 0, totalSizeBytes: 0, reclaimableSizeBytes: 0, formatBreakdown: {}, items: [] };
    }
  });

  ipcMain.handle('storage:verify-all', async () => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.verifyAllStorage(true);
    } catch (err: unknown) {
      console.error('[StorageIPC] Error in verify-all:', err);
      return { totalDigitalWorks: 0, totalFiles: 0, availableFiles: 0, missingFiles: 0, unmountedFiles: 0, corruptedFiles: 0, duplicateFiles: 0, totalSizeBytes: 0, reclaimableSizeBytes: 0, formatBreakdown: {}, items: [] };
    }
  });

  ipcMain.handle('storage:verify-file', async (_event, workId: string) => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.verifyWorkStorage(workId, true);
    } catch (err: unknown) {
      console.error('[StorageIPC] Error in verify-file:', err);
      return null;
    }
  });

  ipcMain.handle('storage:relink-file', async (_event, workId: string, newFilePath: string) => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.relinkFile(workId, newFilePath);
    } catch (err: unknown) {
      console.error('[StorageIPC] Error in relink-file:', err);
      return { success: false, workId, newFilePath, error: errorMessage(err) || 'Error relinking file' };
    }
  });

  ipcMain.handle('storage:batch-auto-rebind', async (_event, searchDirectory: string) => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.batchAutoRebind(searchDirectory);
    } catch (err: unknown) {
      console.error('[StorageIPC] Error in batch-auto-rebind:', err);
      return { scannedFilesCount: 0, resolvedCount: 0, unresolvedCount: 0, matches: [], errors: [errorMessage(err) || 'Error during batch scan'] };
    }
  });

  ipcMain.handle('storage:get-analytics', async () => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.getStorageAnalytics();
    } catch (err: unknown) {
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

  ipcMain.handle('storage:prune-duplicate', async (_event, options) => {
    try {
      const storageManager = StorageManagerService.getInstance();
      return await storageManager.pruneDuplicate(options);
    } catch (err: unknown) {
      console.error('[StorageIPC] Error in prune-duplicate:', err);
      return { success: false, freedBytes: 0, fileDeletedFromDisk: false, error: errorMessage(err) || 'Error pruning duplicate' };
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
    } catch (err: unknown) {
      console.error('[DigitalIPC] Error extracting digital metadata:', err);
      return null;
    }
  });
}
