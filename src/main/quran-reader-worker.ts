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
    const data =
      request.action === 'mutashabihat'
        ? await reader!.mutashabihat(request.script, request.surah, request.ayah)
        : request.action === 'morphology'
        ? await reader!.morphology(request.script, request.surah, request.ayah)
        : request.action === 'inspect-ayah'
        ? await reader!.inspectAyah(request.query)
        : request.action === 'catalog'
        ? reader!.catalog()
        : request.action === 'read'
        ? await reader!.read(request.query)
        : request.action === 'search'
        ? await reader!.search(request.query.script, request.query.text)
        : request.action === 'commentary'
        ? await reader!.commentary(request.query)
        : request.action === 'mushaf-page'
        ? await reader!.mushafPage(request.pack, request.page, request.script)
        : request.action === 'mushaf-page-for-ayah'
        ? await reader!.mushafPageForAyah(request.pack, request.surah, request.ayah, request.script)
        : request.action === 'recitation-audio'
        ? await reader!.recitationAudio(request.pack, request.surah, request.ayah)
        : request.action === 'recitation-surah'
        ? await reader!.recitationSurah(request.pack, request.surah)
        : request.action === 'surah-intro'
        ? await reader!.surahIntro(request.pack, request.surah)
        : request.action === 'ayah-themes'
        ? await reader!.ayahThemes(request.pack, request.surah, request.ayah)
        : request.action === 'ayah-topics'
        ? await reader!.ayahTopics(request.pack, request.surah, request.ayah)
        : request.action === 'search-topics'
        ? await reader!.searchTopics(request.pack, request.text)
        : await reader!.similarAyahs(request.pack, request.surah, request.ayah);
    port.postMessage({ id: request.id, ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    port.postMessage({ id: request.id, ok: false, error: ['invalid-resource', 'invalid-package', 'unsupported-format'].includes(message) ? message : 'storage' });
  }
};
const enqueue = (request: QuranReaderRequest) => { pending = pending.then(() => run(request)); };
if (parentPort) parentPort.on('message', enqueue);
else port.on('message', event => enqueue(event.data));
