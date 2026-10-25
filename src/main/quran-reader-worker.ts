import { parentPort } from 'node:worker_threads';
import { QuranReader } from './services/quran/quran-reader';
import type { QuranReaderRequest } from './services/quran/quran-reader-process';

const port = parentPort || (process as unknown as { parentPort: { on: (name: string, listener: (event: { data: QuranReaderRequest }) => void) => void; postMessage: (value: unknown) => void } }).parentPort;
let reader: QuranReader | undefined;
let identity = '';
let pending = Promise.resolve();
const run = async (request: QuranReaderRequest) => {
  try {
    const next = JSON.stringify([request.root, request.packs.map(pack => pack.id)]);
    if (next !== identity) { reader?.close(); reader = new QuranReader(request.root, request.packs); identity = next; }
    const data = request.action === 'catalog' ? reader!.catalog() : request.action === 'read' ? await reader!.read(request.query) : request.action === 'search' ? await reader!.search(request.query.script, request.query.text) : await reader!.commentary(request.query);
    port.postMessage({ id: request.id, ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    port.postMessage({ id: request.id, ok: false, error: ['invalid-resource', 'invalid-package', 'unsupported-format'].includes(message) ? message : 'storage' });
  }
};
const enqueue = (request: QuranReaderRequest) => { pending = pending.then(() => run(request)); };
if (parentPort) parentPort.on('message', enqueue);
else port.on('message', event => enqueue(event.data));
