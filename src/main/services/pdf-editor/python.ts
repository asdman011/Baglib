import { spawn, execFile } from 'node:child_process';
import path from 'node:path';
import type { PdfEngineResult, PdfInspection, PdfJobRequest } from '../../../shared/types/pdf-editor';
import type { PdfWorkerInput } from './jobs';
import { translations } from '../../../renderer/translations';

export interface PdfEngineTools { python: string; script: string; tessdata: string; java?: string; veraPdfJar?: string; stirlingJar?: string; stirlingUrl?: string; preferStirling?: boolean }
export interface PythonPdfInput extends Omit<PdfWorkerInput, 'operation'> {
  operation: PdfJobRequest['operation'] | 'capabilities'; payload?: Record<string, unknown>;
  sources?: Record<string, { filename: string; sha256: string; password?: string }>;
  assets?: Record<string, string>;
}

export function runPythonPdf(tools: PdfEngineTools, input: PythonPdfInput, signal: AbortSignal, progress: (current: number, total: number) => void): Promise<PdfEngineResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('cancelled')); return; }
    const child = spawn(tools.python, ['-I', '-u', tools.script], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, detached: process.platform !== 'win32', env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' } });
    let buffer = '', result: PdfEngineResult | undefined, error: string | undefined;
    const kill = () => {
      if (!child.pid) return;
      if (process.platform === 'win32') execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => child.kill());
      else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
    };
    const abort = () => { error = 'cancelled'; kill(); };
    const timer = setTimeout(() => { error = 'engine-failed'; kill(); }, 10 * 60_000);
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 40 * 1024 * 1024) { error = 'document-too-large'; kill(); return; }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (message.type === 'progress') progress(message.current, message.total);
          else if (message.type === 'complete') result = message.result;
          else if (message.type === 'error') error = message.error;
        } catch { /* Native libraries can write non-protocol diagnostics; never relay them. */ }
      }
    });
    child.once('error', () => { error = 'engine-missing'; });
    child.once('close', code => {
      clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(new Error('cancelled'));
      else if (!error && code === 0 && result) resolve(result);
      else reject(new Error(error || 'engine-failed'));
    });
    child.stdin.on('error', () => {});
    const labels = translations[input.language];
    child.stdin.end(JSON.stringify({ ...input, labels: { page: labels.page, image: labels.pdfExportImage, document: labels.pdfSuiteTitle }, outputDirectory: path.dirname(input.output), tessdata: tools.tessdata, java: tools.java, veraPdfJar: tools.veraPdfJar }));
  });
}

export function pythonInspection(result: PdfEngineResult): PdfInspection {
  const pages = result.pages as { page: number; width: number; height: number; rotation: number; text: string; blocks: { text: string; rect: number[]; direction: 'rtl' | 'ltr'; fontSize: number; font: string; color: string }[] }[];
  return {
    totalPages: Number(result.totalPages), signatureFields: (result.signedSource ? 1 : 0) + (Array.isArray(result.pendingFields) ? result.pendingFields.length : 0),
    signatureValidation: 'not-performed', signedSource: !!result.signedSource,
    permissions: null, extraction: result.extraction === 'limited' ? 'limited' : 'complete',
    outline: result.outline as PdfInspection['outline'], pendingFields: result.pendingFields as PdfInspection['pendingFields'],
    pages: pages.map(page => ({ ...page, blocks: page.blocks.map(block => ({ ...block, x: block.rect[0], y: block.rect[1], width: block.rect[2] - block.rect[0], height: block.rect[3] - block.rect[1] })) })),
  };
}
