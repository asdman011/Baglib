/**
 * Baglib — the real corpus readers for live deck sync (KEY-409): the installed Sunnah corpus and
 * the poetry partition, through the readers their IPC modules expose.
 */

import type { Database } from 'better-sqlite3';
import { DeckSyncService } from './deck-sync';
import type { NarratorReaders } from './narrator-decks';
import { readNarrator, readNarratorIdsForHadiths, readSunnahChapterForSync, readSunnahChapterNumbers } from '../ipc/sunnah';
import { readPoemForSync, readPoetPoemIds } from '../ipc/poetry';
import { readAyahTexts, readQuranSources } from '../ipc/quran';
import { getDictionaryService } from '../ipc/dictionary';
import { stripDictionaryHtml } from './lexicon-decks';
import { collectionKeys } from '../../renderer/utils/sunnah-collections';
import { translations } from '../../renderer/translations';
import type { SunnahCollectionId } from '../../shared/types/sunnah';

export const corpusReaders: NarratorReaders = {
  // Card text is Arabic hadith text, so the collection name on the card is Arabic too.
  collectionName: collection => {
    const key = collectionKeys[collection as SunnahCollectionId];
    return key ? translations.ar[key] : collection;
  },
  sunnahChapter: readSunnahChapterForSync,
  sunnahChapterNumbers: readSunnahChapterNumbers,
  poem: readPoemForSync,
  poetPoemIds: readPoetPoemIds,
  // KEY-399: ayah meaning cards: the installed text, Saheeh International and Ibn Kathir when installed.
  ayahMeaning: async (profile, surah, from, to) => {
    const ayahs = await readAyahTexts(surah, from, to, { profile }).catch(() => []);
    if (!ayahs.length) return null;
    const sources = profile === 'hafs' ? await readQuranSources({ profile, surah, from, to, translation: 'translation/193', tafsir: 'tafsir/22' }).catch(() => []) : [];
    const translation = sources.filter(s => s.kind === 'translation').map(s => s.text).join(' ');
    const tafsir = sources.find(s => s.kind === 'tafsir' && s.text.trim());
    return { text: ayahs.map(a => a.text).join(' '), translation, tafsir: tafsir?.text ?? '', tafsirTitle: tafsir?.title ?? '' };
  },
  // KEY-410: a followed dictionary's entries, read the way KEY-400's dictionary import reads them.
  lexiconEntry: async (dictId, headword) => {
    const service = getDictionaryService();
    const dict = service.listDictionaries().find(d => d.id === dictId);
    if (!dict) return null;
    const raw = await service.readEntry(dict, headword).catch(() => null);
    const text = raw ? stripDictionaryHtml(raw) : '';
    return text || null;
  },
  narratorIdsForHadiths: readNarratorIdsForHadiths,
  narrator: readNarrator,
};

export const createDeckSyncService = (db: Database) => new DeckSyncService(db, () => new Date(), corpusReaders);
