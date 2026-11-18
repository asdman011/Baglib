/**
 * Baglib — the real corpus readers for live deck sync (KEY-409): the installed Sunnah corpus and
 * the poetry partition, through the readers their IPC modules expose.
 */

import type { Database } from 'better-sqlite3';
import { DeckSyncService } from './deck-sync';
import type { NarratorReaders } from './narrator-decks';
import { readNarrator, readNarratorIdsForHadiths, readSunnahChapterForSync, readSunnahChapterNumbers } from '../ipc/sunnah';
import { readPoemForSync, readPoetPoemIds } from '../ipc/poetry';
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
  narratorIdsForHadiths: readNarratorIdsForHadiths,
  narrator: readNarrator,
};

export const createDeckSyncService = (db: Database) => new DeckSyncService(db, () => new Date(), corpusReaders);
