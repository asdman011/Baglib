import { utilityProcess } from 'electron';
import path from 'node:path';
import type { PdfInspection } from '../../../shared/types/pdf-editor';
import type { PdfWorkerRunner } from './jobs';

export const runPdfWorker: PdfWorkerRunner = (input, signal, progress) => new Promise((resolve, reject) => {
  if (!['inspect', 'export-html'].includes(input.operation)) { reject(new Error('engine-missing')); return; }
  if (signal.aborted) { reject(new Error('cancelled')); return; }
  const child = utilityProcess.fork(path.join(__dirname, 'pdf-editor-worker.js'), [], { serviceName: 'Baglib PDF inspection', stdio: 'ignore', execArgv: ['--max-old-space-size=512'] });
  let settled = false;
  let outcome: { inspection?: PdfInspection; error?: string } = {};
  const abort = () => finish({ error: 'cancelled' });
  const timer = setTimeout(() => finish({ error: 'storage' }), 120_000);
  const finish = (result: typeof outcome) => {
    if (settled) return;
    settled = true; outcome = result;
    clearTimeout(timer); signal.removeEventListener('abort', abort);
    // Settle only after exit so cancelled jobs cannot recreate cleaned temporary files.
    child.kill();
  };
  signal.addEventListener('abort', abort, { once: true });
  child.once('spawn', () => { if (!settled) child.postMessage(input); });
  child.on('message', message => {
    if (settled || !message || typeof message !== 'object') return;
    if (message.type === 'progress') progress(message.current, message.total);
    else if (message.type === 'complete') finish({ inspection: message.inspection });
    else if (message.type === 'error') finish({ error: message.error });
  });
  child.once('exit', () => {
    clearTimeout(timer); signal.removeEventListener('abort', abort);
    if (outcome.inspection && !signal.aborted) resolve(input.operation === 'export-html' ? { inspection: outcome.inspection, outputs: [{ filename: 'document.html', format: 'html', bytes: 0, sha256: '' }] } : outcome.inspection);
    else reject(new Error(signal.aborted ? 'cancelled' : outcome.error || 'storage'));
  });
});
