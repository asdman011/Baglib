import type { PdfEngineResult, PdfInspection, PdfJobRequest } from '../../../shared/types/pdf-editor';
import type { PdfWorkerInput } from './jobs';
import { runStirlingPdf } from './stirling';

export interface PdfEngineTools {
  python: string;
  script: string;
  tessdata: string;
  java?: string;
  veraPdfJar?: string;
  stirlingJar?: string;
  stirlingUrl?: string;
  stirlingWorkDir?: string;
  preferStirling?: boolean;
}

export interface PythonPdfInput extends Omit<PdfWorkerInput, 'operation'> {
  operation: PdfJobRequest['operation'] | 'capabilities';
  payload?: Record<string, unknown>;
  sources?: Record<string, { filename: string; sha256: string; password?: string }>;
  assets?: Record<string, string>;
}

/**
 * Stirling-PDF adapter delegating PDF operations to Stirling-PDF v3.2.2.
 */
export async function runPythonPdf(
  tools: PdfEngineTools,
  input: PythonPdfInput,
  signal: AbortSignal,
  progress: (current: number, total: number) => void,
): Promise<PdfEngineResult> {
  return runStirlingPdf(tools, input, signal, progress);
}

export function stirlingInspection(result: PdfEngineResult): PdfInspection {
  const pages = (result.pages as { page: number; width: number; height: number; rotation: number; text: string; blocks: { text: string; rect: number[]; direction: 'rtl' | 'ltr'; fontSize: number; font: string; color: string }[] }[]) || [];
  return {
    totalPages: Number(result.totalPages || pages.length),
    signatureFields: (result.signedSource ? 1 : 0) + (Array.isArray(result.pendingFields) ? result.pendingFields.length : 0),
    signatureValidation: 'not-performed',
    signedSource: !!result.signedSource,
    permissions: null,
    extraction: result.extraction === 'limited' ? 'limited' : 'complete',
    outline: result.outline as PdfInspection['outline'],
    pendingFields: result.pendingFields as PdfInspection['pendingFields'],
    pages: pages.map(page => ({
      ...page,
      blocks: (page.blocks || []).map(block => ({
        ...block,
        x: block.rect ? block.rect[0] : 0,
        y: block.rect ? block.rect[1] : 0,
        width: block.rect ? block.rect[2] - block.rect[0] : 0,
        height: block.rect ? block.rect[3] - block.rect[1] : 0,
      })),
    })),
  };
}

export const pythonInspection = stirlingInspection;
