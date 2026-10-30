import { spawn } from 'node:child_process';
import { setPriority, constants } from 'node:os';
import type { PdfViewOptimizer } from './view-cache';

export function pdfViewOptimizer(python: string, script: string): PdfViewOptimizer {
  return (source, output, maxBytes, signal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('cancelled')); return; }
    const child = spawn(python, [script, source, output, String(maxBytes)], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let errorText = '', failure: Error | undefined;
    const stop = () => { failure = new Error('cancelled'); child.kill(); };
    const timeout = setTimeout(() => { failure = new Error('engine-failed'); child.kill(); }, 120_000);
    signal.addEventListener('abort', stop, { once: true });
    child.once('spawn', () => { if (child.pid) { try { setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL); } catch { } } });
    child.stderr.on('data', data => { if (errorText.length < 8192) errorText += data.toString().slice(0, 8192 - errorText.length); });
    child.once('error', error => { failure = error; });
    child.once('close', code => {
      clearTimeout(timeout); signal.removeEventListener('abort', stop);
      if (failure || code !== 0) reject(failure || new Error(errorText.includes('encrypted') ? 'encrypted' : 'engine-failed'));
      else resolve();
    });
  });
}
