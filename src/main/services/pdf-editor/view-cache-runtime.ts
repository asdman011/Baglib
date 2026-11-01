import { spawn } from 'node:child_process';
import { setPriority, constants } from 'node:os';
import path from 'node:path';
import type { PdfViewOptimizer } from './view-cache';

export function pdfViewOptimizer(python: string, script: string): PdfViewOptimizer {
  return (source, output, maxBytes, signal) => runPython(python, [script, source, output, String(maxBytes)], signal);
}

/** Runs a helper that ships beside engine.py. */
export function runPdfHelper(tools: { python: string; script: string }, helper: string, args: string[], signal: AbortSignal, env?: Record<string, string>): Promise<void> {
  return runPython(tools.python, [path.join(path.dirname(tools.script), helper), ...args], signal, env);
}

function runPython(python: string, args: string[], signal: AbortSignal, env?: Record<string, string>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('cancelled')); return; }
    const child = spawn(python, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: env ? { ...process.env, ...env } : process.env });
    let errorText = '', failure: Error | undefined;
    const stop = () => { failure = new Error('cancelled'); child.kill(); };
    const timeout = setTimeout(() => { failure = new Error('engine-failed'); child.kill(); }, 120_000);
    signal.addEventListener('abort', stop, { once: true });
    child.once('spawn', () => { if (child.pid) { try { setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL); } catch { } } });
    child.stderr.on('data', data => { if (errorText.length < 8192) errorText += data.toString().slice(0, 8192 - errorText.length); });
    child.once('error', error => { failure = error; });
    child.once('close', code => {
      clearTimeout(timeout); signal.removeEventListener('abort', stop);
      const reported = /^BAGLIB_ERROR:([a-z-]+)/mu.exec(errorText)?.[1];
      if (reported) console.warn('[pdf-helper]', errorText.trim());
      if (failure || code !== 0) reject(failure || new Error(reported ?? (errorText.includes('encrypted') ? 'encrypted' : 'engine-failed')));
      else resolve();
    });
  });
}
