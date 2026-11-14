import { parentPort, workerData } from 'node:worker_threads';
import { SunnahResearchCorpus } from './services/sunnah/research-corpus';
import type { SunnahResearchQuery } from '../shared/types/sunnah';
const corpus = new SunnahResearchCorpus(workerData.filename);
// Fold the isnads while the user is still typing, so the first isnad search does not wait for it.
setImmediate(() => { try { corpus.prepareIsnadSearch(); } catch { /* searched again on demand */ } });
parentPort!.on('message', ({ id, query }: { id: number; query: SunnahResearchQuery }) => {
  try { parentPort!.postMessage({ id, ok: true, data: corpus.search(query) }); }
  catch { parentPort!.postMessage({ id, ok: false }); }
});
