import { parentPort } from 'node:worker_threads';
import { writeFile } from 'node:fs/promises';
import { inspectPdfFile, inspectionHtml } from './services/pdf-editor/inspection';
import { fileSha256 } from './services/pdf-editor/source';

interface WorkerRequest { filename: string; output: string; operation: 'inspect' | 'export-html'; password?: string; language: 'ar' | 'en'; expectedHash: string }
const port = parentPort || (process as { parentPort: { on: (name: string, callback: (event: { data: WorkerRequest }) => void) => void; postMessage: (data: unknown) => void } }).parentPort;
const run = async (request: WorkerRequest) => {
  try {
    if (await fileSha256(request.filename) !== request.expectedHash) throw new Error('source-changed');
    const inspection = await inspectPdfFile(request.filename, request.password, (current, total) => port.postMessage({ type: 'progress', current, total }));
    if (await fileSha256(request.filename) !== request.expectedHash) throw new Error('source-changed');
    if (request.operation === 'export-html') {
      if (inspection.extraction !== 'complete' || !inspection.pages.some(page => page.text.trim())) throw new Error('unsupported');
      await writeFile(request.output, inspectionHtml(inspection, request.language), { flag: 'wx', mode: 0o600 });
    }
    port.postMessage({ type: 'complete', inspection });
  } catch (error) {
    const code = (error as Error).message;
    port.postMessage({ type: 'error', error: ['source-changed', 'encrypted', 'permission-denied', 'invalid-source', 'unsupported'].includes(code) ? code : 'storage' });
  }
};
if (parentPort) parentPort.once('message', request => void run(request));
else port.on('message', event => void run(event.data));
