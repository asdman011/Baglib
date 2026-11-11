import type { BatchImportSummary, DigitalImportResult } from './types/digital-file';

/** Cancelled items are skipped without being passed to the file pipeline. */
export function cancelledImport(filePath: string, fileName: string): DigitalImportResult {
  return { filePath, fileName, fileSizeBytes: 0, success: true, skipped: true, cancelled: true };
}

export function summarizeImports(results: DigitalImportResult[], bulkAutoFillSuppressed = false): BatchImportSummary {
  const counts = importResultCounts(results);
  return {
    totalFiles: results.length,
    successfulImports: counts.imported,
    failedImports: counts.failures,
    skippedImports: counts.duplicates + counts.cancelled,
    results,
    bulkAutoFillSuppressed,
  };
}

export function importResultCounts(results: DigitalImportResult[]) {
  return {
    imported: results.filter(result => result.success && !result.skipped).length,
    duplicates: results.filter(result => result.skipped && !result.cancelled).length,
    cancelled: results.filter(result => result.cancelled).length,
    failures: results.filter(result => !result.success).length,
  };
}
