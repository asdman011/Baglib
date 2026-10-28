import { parentPort } from 'node:worker_threads';
import { installPackage } from './services/quran/install-package';
import type { QuranResource, QuranError } from '../shared/types/quran';

type Request = { root: string; id: string; archive: string; resource: QuranResource };
const port = parentPort || (process as { parentPort: { on: (event: string, listener: (event: { data: Request }) => void) => void; postMessage: (value: unknown) => void } }).parentPort;
const run = async (request: Request) => {
  try { port.postMessage({ ok: true, data: await installPackage(request.root, request.id, request.archive, request.resource) }); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code = (error as NodeJS.ErrnoException)?.code;
    port.postMessage({ ok: false, error: (['ENOSPC', 'EACCES', 'EPERM'].includes(code || '') ? 'storage' : ['storage', 'unsupported-format', 'invalid-package'].includes(message) ? message : 'invalid-package') as QuranError });
  }
};
if (parentPort) parentPort.on('message', request => { void run(request); });
else port.on('message', event => { void run((event as { data: Request }).data); });
