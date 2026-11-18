/**
 * Baglib — IPC for lexicon vocabulary decks, translation cards, quick-add lookups,
 * Quranic root cards & decks, and tafsir cards (KEY-400).
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database/connection';
import {
  LexiconDeckService,
  type LexiconReaders,
  validateLexiconImportInput,
  validateQuickAddLookupInput,
  validateRootCardInput,
  validateRootDeckInput,
  validateTafsirDeckInput,
} from '../services/lexicon-decks';
import { getDictionaryService } from './dictionary';
import { readQuranFrequency, readQuranRootWords, readQuranSources } from './quran';

const KNOWN = [
  'invalid-request',
  'dictionary-not-found',
  'no-entries',
  'no-roots',
  'no-tafsir-highlights',
  'hifz-guardrail',
  'missing-resource',
];

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (
    url.username ||
    url.password ||
    !(
      (url.protocol === 'app:' && url.hostname === '-') ||
      (url.protocol === 'file:' && !url.hostname) ||
      url.origin === 'http://localhost:3000'
    )
  ) {
    throw new Error('invalid-request');
  }
};

const failure = (error: unknown) => {
  const message = (error as Error)?.message ?? '';
  return { ok: false as const, error: KNOWN.includes(message) ? message : 'failed' };
};

function createRealReaders(): LexiconReaders {
  return {
    listDictionaries: () => getDictionaryService().listDictionaries(),
    readEntry: (dict, headword) => getDictionaryService().readEntry(dict, headword),
    lookupDictionary: async (word, options) => {
      const res = await getDictionaryService().lookup(word, { ...options, includeWikipedia: false });
      return res.entries;
    },
    quranFrequency: query => readQuranFrequency(query),
    quranRootWords: (root, limit) => readQuranRootWords(root, limit),
    quranAyahTafsir: async (surah, ayah) => {
      const sources = await readQuranSources({
        profile: 'hafs',
        surah,
        from: ayah,
        to: ayah,
        tafsir: 'tafsir/22',
      }).catch(() => []);
      const first = sources.find(s => s.kind === 'tafsir' && s.text.trim());
      return first ? { text: first.text, title: first.title } : null;
    },
  };
}

export function registerLexiconDeckIpc(): void {
  const service = () => new LexiconDeckService(getDatabase(), createRealReaders());

  ipcMain.handle('lexicon-decks:import-dictionary', async (event, input: unknown) => {
    try {
      authorize(event);
      return { ok: true, data: await service().importDictionaryDeck(validateLexiconImportInput(input)) };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('lexicon-decks:quick-add', (event, input: unknown) => {
    try {
      authorize(event);
      return { ok: true, data: service().quickAddLookup(validateQuickAddLookupInput(input)) };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('lexicon-decks:last-deck', event => {
    try {
      authorize(event);
      return { ok: true, data: service().getLastQuickAddDeckId() };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('lexicon-decks:root-card', async (event, input: unknown) => {
    try {
      authorize(event);
      return { ok: true, data: await service().makeRootCard(validateRootCardInput(input)) };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('lexicon-decks:root-deck', async (event, input: unknown) => {
    try {
      authorize(event);
      return { ok: true, data: await service().makeRootDeck(validateRootDeckInput(input)) };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('lexicon-decks:tafsir-works', event => {
    try {
      authorize(event);
      return { ok: true, data: service().listTafsirWorks() };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('lexicon-decks:tafsir-deck', async (event, input: unknown) => {
    try {
      authorize(event);
      return { ok: true, data: await service().makeTafsirDeck(validateTafsirDeckInput(input)) };
    } catch (error) {
      return failure(error);
    }
  });
}
