import type { PdfJob } from '../../../shared/types/pdf-editor';

/** A failed export must stop offering the previous file; a staged PDF is unsaved work and stays. */
export function outputAfterFailedJob(current: PdfJob | null, failed: PdfJob): PdfJob | null {
  if (!failed.operation.startsWith('export-')) return current;
  return current?.outputs?.some(item => item.format === 'pdf') ? current : null;
}
