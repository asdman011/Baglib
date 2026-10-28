import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navigateStudyReference, consumeSunnahReference } from '../../src/renderer/utils/study-navigation';
import { consumeQuranAyah } from '../../src/renderer/utils/quran-navigation';

test('study references preserve source hadith IDs and Hafs/Warsh navigation boundaries', async () => {
  const beforeWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const beforeEvent = Object.getOwnPropertyDescriptor(globalThis, 'CustomEvent');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => true, electronAPI: { sunnah: { chapter: async () => ({ ok: true, data: { hadiths: [{ id: 'Bukhari:1:1' }] } }) }, quran: { readerCatalog: async () => ({ ok: true, data: { sources: [{ id: 'hafs-source', kind: 'script', profile: 'hafs' }, { id: 'warsh-source', kind: 'script', profile: 'warsh' }] } }) } } } });
  Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: class { constructor(public type: string, public options?: unknown) {} } });
  try {
    await navigateStudyReference('sunnah:Bukhari:1:Bukhari:1:1', [], () => {}, () => {});
    assert.deepEqual(consumeSunnahReference(), { collection: 'Bukhari', chapter: 1, hadith: 'Bukhari:1:1' });
    await navigateStudyReference('quran:warsh:2:255', [], () => {}, () => {});
    assert.deepEqual(consumeQuranAyah(), { script: 'warsh-source', surah: 2, ayah: 255 });
    await assert.rejects(() => navigateStudyReference('book:missing', [], () => {}, () => {}));
    await assert.rejects(() => navigateStudyReference('quran:hafs:115:1', [], () => {}, () => {}));
    await assert.rejects(() => navigateStudyReference('sunnah:Bukhari:1:missing-id', [], () => {}, () => {}));
  } finally {
    if (beforeWindow) Object.defineProperty(globalThis, 'window', beforeWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (beforeEvent) Object.defineProperty(globalThis, 'CustomEvent', beforeEvent); else Reflect.deleteProperty(globalThis, 'CustomEvent');
  }
});
