import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getDatabase } from '../database/connection';
import { KnowledgeCardRepository } from '../database/repositories/knowledge-card.repository';
import { validateAyahDeckInput, validateCardInput, validateDeckInput } from '../../shared/types/knowledge-cards';
import { HAFS_SURAH_AYAH_COUNTS, SURAH_NAMES_AR } from '../../shared/quran-wird';
import { readAyahTexts } from './quran';
import { readChapterHadiths } from './sunnah';
import { hadithRangeDrafts, validateHadithDeckInput } from '../../shared/hadith-deck';
import { collectionKeys } from '../../renderer/utils/sunnah-collections';
import { translations } from '../../renderer/translations';
import type { SunnahCollectionId } from '../../shared/types/sunnah';
import { CardDeckService } from '../services/card-decks';
import { PracticeService } from '../services/practice';
import type { PracticeInput, JudgeAttemptInput, AttemptQuery } from '../../shared/practice';
import { SrsService } from '../services/srs';
import { validateReview, type SaveDeckInput, type SaveFilteredDeckInput } from '../../shared/srs';
import { CardNoteRepository } from '../database/repositories/card-note.repository';
import { DeckRepository } from '../database/repositories/deck.repository';
import { CardMediaStore, MAX_CARD_MEDIA_BYTES } from '../services/card-media';
import { corpusReaders, createDeckSyncService } from '../services/deck-sync-readers';
import { NarratorDeckService, validateNarratorDeckInput } from '../services/narrator-decks';
import { deckSyncScheduler } from '../services/deck-sync-scheduler';
import {
  validateSafeId,
  validateSaveNoteInput,
  validateSaveNoteTypeInput,
} from '../../shared/types/card-notes';

const repository = () => new KnowledgeCardRepository(getDatabase());
const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};
const reviewService = (event: IpcMainInvokeEvent) => { authorize(event); return new SrsService(getDatabase()); };
const deckService = (event: IpcMainInvokeEvent) => { authorize(event); return new CardDeckService(getDatabase()); };
const deckRepo = (event: IpcMainInvokeEvent) => { authorize(event); return new DeckRepository(getDatabase()); };
const cardId = (id: unknown): string => {
  if (typeof id !== 'string' || !id) throw new Error('invalid-request');
  return id;
};
const optionalDeckId = (id: unknown): string | undefined => {
  if (id === undefined || id === null || id === '') return undefined;
  return cardId(id);
};

export function registerKnowledgeCardIpc(): void {
  ipcMain.handle('knowledge-cards:attempt', (event,input:PracticeInput)=>{authorize(event);return new PracticeService(getDatabase()).record(input);});
  ipcMain.handle('knowledge-cards:judge-attempt', (event,input:JudgeAttemptInput)=>{authorize(event);return new PracticeService(getDatabase()).judge(input);});
  ipcMain.handle('knowledge-cards:attempts', (event,query:AttemptQuery)=>{authorize(event);return new PracticeService(getDatabase()).list(query);});
  ipcMain.handle('knowledge-cards:clear-practice', (event,confirmed:boolean)=>{authorize(event);return new PracticeService(getDatabase()).clear(confirmed);});
  ipcMain.handle('knowledge-cards:update', (event,id:unknown,input:unknown,revision:number)=>{authorize(event);return repository().update(cardId(id),validateCardInput(input),revision);});
  ipcMain.handle('knowledge-cards:review-queue', (event, deckId?: unknown) => reviewService(event).queue(optionalDeckId(deckId)));
  ipcMain.handle('knowledge-cards:grade-review', (event, input: unknown) => reviewService(event).grade(validateReview(input)));
  ipcMain.handle('knowledge-cards:deck-tree', event => reviewService(event).deckTree());
  ipcMain.handle('knowledge-cards:create-deck', (event, input: unknown) => deckRepo(event).createDeck((input ?? {}) as SaveDeckInput));
  ipcMain.handle('knowledge-cards:create-filtered-deck', (event, input: unknown) => deckRepo(event).createFilteredDeck((input ?? {}) as SaveFilteredDeckInput));
  ipcMain.handle('knowledge-cards:rename-deck', (event, id: unknown, name: unknown) => deckRepo(event).renameDeck(cardId(id), typeof name === 'string' ? name : ''));
  ipcMain.handle('knowledge-cards:move-deck', (event, id: unknown, parentId: unknown) => deckRepo(event).moveDeck(cardId(id), parentId === null || parentId === undefined || parentId === '' ? null : cardId(parentId)));
  ipcMain.handle('knowledge-cards:delete-deck', (event, id: unknown, confirmWithCards?: unknown) => deckRepo(event).deleteDeck(cardId(id), confirmWithCards === true));
  ipcMain.handle('knowledge-cards:assign-preset', (event, deckId: unknown, presetId: unknown) => deckRepo(event).assignPreset(cardId(deckId), presetId === null || presetId === undefined || presetId === '' ? null : cardId(presetId)));
  ipcMain.handle('knowledge-cards:list-presets', event => deckRepo(event).listPresets());
  ipcMain.handle('knowledge-cards:save-preset', (event, input: unknown) => deckRepo(event).savePreset(input));
  ipcMain.handle('knowledge-cards:copy-preset', (event, id: unknown, newName?: unknown) => deckRepo(event).copyPreset(cardId(id), typeof newName === 'string' ? newName : undefined));
  ipcMain.handle('knowledge-cards:delete-preset', (event, id: unknown) => deckRepo(event).deletePreset(cardId(id)));
  ipcMain.handle('knowledge-cards:bury-card', (event, id: unknown, deckId?: unknown) => reviewService(event).buryCard(cardId(id), optionalDeckId(deckId)));
  ipcMain.handle('knowledge-cards:bury-siblings', (event, id: unknown, deckId?: unknown) => reviewService(event).buryNoteSiblings(cardId(id), optionalDeckId(deckId)));
  ipcMain.handle('knowledge-cards:unbury', (event, deckId?: unknown, id?: unknown) => reviewService(event).unbury(optionalDeckId(deckId), optionalDeckId(id)));
  ipcMain.handle('knowledge-cards:suspend-card', (event, id: unknown, suspended: unknown, deckId?: unknown) => reviewService(event).suspendCard(cardId(id), suspended === true, optionalDeckId(deckId)));
  ipcMain.handle('knowledge-cards:forget-card', (event, id: unknown, deckId?: unknown) => reviewService(event).forgetCard(cardId(id), optionalDeckId(deckId)));
  ipcMain.handle('knowledge-cards:set-due-date', (event, id: unknown, days: unknown, deckId?: unknown) => reviewService(event).setDueDate(cardId(id), Number(days), optionalDeckId(deckId)));
  ipcMain.handle('knowledge-cards:get-rollover-hour', event => reviewService(event).getRolloverHour());
  ipcMain.handle('knowledge-cards:set-rollover-hour', (event, hour: unknown) => reviewService(event).setRolloverHour(hour === 0 || hour === '0' ? 0 : 4));
  ipcMain.handle('knowledge-cards:decks', event => deckService(event).list());
  ipcMain.handle('knowledge-cards:generate-deck', (event, input: unknown) => deckService(event).generate(validateDeckInput(input)));
  // KEY-318: sacred text is copied from the installed pack, never reworded; a partial read is refused.
  ipcMain.handle('knowledge-cards:generate-ayah-deck', async (event, input: unknown) => {
    const service = deckService(event);
    const request = validateAyahDeckInput(input, HAFS_SURAH_AYAH_COUNTS);
    const ayahs = await readAyahTexts(request.surah, request.from, request.to, { profile: 'hafs' });
    if (ayahs.length !== request.to - request.from + 1 || ayahs.some(ayah => !ayah.text)) throw new Error('quran-not-installed');
    const surahName = SURAH_NAMES_AR[request.surah - 1];
    const range = request.from === request.to ? `${request.from}` : `${request.from}-${request.to}`;
    return service.generateFromDrafts(request.name, ayahs.map(ayah => ({
      front: `${surahName} ${request.surah}:${ayah.number}`,
      back: ayah.text,
      sourceKind: 'quran' as const,
      sourceRef: `quran:hafs:${request.surah}:${ayah.number}`,
      sourceLabel: `${surahName} ${request.surah}:${range}`,
      language: 'ar',
    })), request.memorize);
  });
  // KEY-319: one card per hadith in a numbered range of one chapter; the back is the installed text, unchanged.
  ipcMain.handle('knowledge-cards:generate-hadith-deck', async (event, input: unknown) => {
    const service = deckService(event);
    const request = validateHadithDeckInput(input);
    const key = collectionKeys[request.collection as SunnahCollectionId];
    if (!key) throw new Error('invalid-request');
    const hadiths = await readChapterHadiths(request.collection, request.chapter).catch(() => []);
    if (!hadiths.length) throw new Error('hadith-not-installed');
    const drafts = hadithRangeDrafts(hadiths, request, translations.ar[key]);
    if (!drafts.length) throw new Error('hadith-range-empty');
    return service.generateFromDrafts(request.name, drafts, request.memorize);
  });
  ipcMain.handle('knowledge-cards:export-deck', async (event, id: unknown) => {
    const { name, text, imageOcclusion } = deckService(event).exportText(cardId(id));
    const options = { defaultPath: `${name.replace(/[\\/:*?"<>|]/gu, ' ').trim() || 'deck'}.txt`, filters: [{ name: 'Anki', extensions: ['txt'] }] };
    const owner = BrowserWindow.fromWebContents(event.sender);
    const choice = await (owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options));
    if (choice.canceled || !choice.filePath) return false;
    await writeFile(choice.filePath, text, 'utf8');
    if (imageOcclusion) {
      // KEY-391: Anki's text import takes one note type per file and carries no media, so image
      // occlusion notes get their own file and their images a folder to copy into collection.media.
      const base = choice.filePath.replace(/\.txt$/iu, '');
      await writeFile(`${base} - Image Occlusion.txt`, imageOcclusion.text, 'utf8');
      const mediaDir = `${base} - media`;
      await mkdir(mediaDir, { recursive: true });
      const store = new CardMediaStore();
      for (const mediaName of imageOcclusion.media) {
        const bytes = store.readBytes(mediaName);
        if (bytes) await writeFile(path.join(mediaDir, mediaName), bytes);
      }
    }
    return true;
  });
  ipcMain.handle('knowledge-cards:list', (_, query?: { search?: unknown; offset?: unknown }) => repository().list({
    search: typeof query?.search === 'string' ? query.search.slice(0, 200) : '',
    offset: typeof query?.offset === 'number' ? query.offset : 0,
  }));
  ipcMain.handle('knowledge-cards:save', (_, input: unknown) => repository().save(validateCardInput(input)));
  ipcMain.handle('knowledge-cards:preserved', () => repository().listPreserved());
  ipcMain.handle('knowledge-cards:remove', (_, id: unknown) => repository().remove(cardId(id)));
  ipcMain.handle('knowledge-cards:set-memorizing', (_, id: unknown, memorizing: unknown) => repository().setMemorizing(cardId(id), memorizing === true));

  // Card Notes & Note Types (ADR-017 / KEY-390)
  const noteRepository = (event: IpcMainInvokeEvent) => {
    authorize(event);
    return new CardNoteRepository(getDatabase());
  };

  ipcMain.handle('card-notes:list-types', event => noteRepository(event).listNoteTypes());
  ipcMain.handle('card-notes:get-type', (event, id: unknown) =>
    noteRepository(event).getNoteType(validateSafeId(id, 'id'))
  );
  ipcMain.handle('card-notes:save-type', (event, input: unknown) =>
    noteRepository(event).saveNoteType(validateSaveNoteTypeInput(input))
  );
  ipcMain.handle('card-notes:delete-type', (event, id: unknown) =>
    noteRepository(event).deleteNoteType(validateSafeId(id, 'id'))
  );
  ipcMain.handle('card-notes:list-notes', (event, query: unknown) => {
    const q = (query ?? {}) as Record<string, unknown>;
    const sanitized = {
      deckId: q.deckId !== undefined && q.deckId !== null ? validateSafeId(q.deckId, 'deckId') : undefined,
      noteTypeId: q.noteTypeId !== undefined && q.noteTypeId !== null ? validateSafeId(q.noteTypeId, 'noteTypeId') : undefined,
      search: typeof q.search === 'string' ? q.search.slice(0, 200) : undefined,
      offset: typeof q.offset === 'number' && q.offset >= 0 ? q.offset : 0,
      limit: typeof q.limit === 'number' && q.limit > 0 && q.limit <= 500 ? q.limit : 50,
    };
    return noteRepository(event).listNotes(sanitized);
  });
  ipcMain.handle('card-notes:get-note', (event, id: unknown) =>
    noteRepository(event).getNote(validateSafeId(id, 'id'))
  );
  ipcMain.handle('card-notes:save-note', (event, input: unknown) =>
    noteRepository(event).saveNote(validateSaveNoteInput(input))
  );
  ipcMain.handle('card-notes:fork-note', (event, noteId: unknown, deckId: unknown) =>
    noteRepository(event).forkNoteForDeck(validateSafeId(noteId, 'noteId'), validateSafeId(deckId, 'deckId'))
  );
  ipcMain.handle('card-notes:restore-source-text', (event, noteId: unknown) =>
    noteRepository(event).restoreSourceText(validateSafeId(noteId, 'noteId'))
  );
  ipcMain.handle('card-notes:get-cards', (event, noteId: unknown) =>
    noteRepository(event).getCardsForNote(validateSafeId(noteId, 'noteId'))
  );
  ipcMain.handle('card-notes:get-decks', (event, noteId: unknown) =>
    noteRepository(event).getDecksForNote(validateSafeId(noteId, 'noteId'))
  );
  ipcMain.handle('card-notes:link-deck', (event, noteId: unknown, deckId: unknown) =>
    noteRepository(event).linkNoteToDeck(validateSafeId(noteId, 'noteId'), validateSafeId(deckId, 'deckId'))
  );

  // Card media (KEY-391): images live in card-media/, named by content hash. The renderer never
  // passes a file path: it either asks main to show the open dialog, or sends the bytes it got
  // from a drop or paste, which main checks by their magic bytes.
  const mediaStore = (event: IpcMainInvokeEvent) => {
    authorize(event);
    return new CardMediaStore();
  };
  ipcMain.handle('card-media:pick-image', async event => {
    const store = mediaStore(event);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    };
    const picked = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths[0]) return null;
    return store.importFile(picked.filePaths[0]);
  });
  ipcMain.handle('card-media:save-bytes', (event, bytes: unknown) => {
    const store = mediaStore(event);
    const view = bytes instanceof Uint8Array ? bytes : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null;
    if (!view || view.length === 0 || view.length > MAX_CARD_MEDIA_BYTES) throw new Error('invalid-request');
    return store.save(view);
  });
  // Live source-to-deck sync (KEY-393).
  const syncService = (event: IpcMainInvokeEvent) => {
    authorize(event);
    return createDeckSyncService(getDatabase());
  };
  const policy = (value: unknown) => (value === 'silent' ? 'silent' : 'toast') as 'silent' | 'toast';
  ipcMain.handle('deck-sync:list', (event, deckId: unknown) =>
    syncService(event).list(deckId === undefined || deckId === null ? undefined : validateSafeId(deckId, 'deckId'))
  );
  ipcMain.handle('deck-sync:subscribe', async (event, input: unknown) => {
    const service = syncService(event);
    const i = (input ?? {}) as Record<string, unknown>;
    const extra = Object.keys(i).filter(k => !['deckId', 'sourceKind', 'sourceRef', 'newItems', 'cards', 'noteTypeId', 'prompt', 'chunk', 'prefix', 'limit'].includes(k));
    if (extra.length || typeof i.sourceKind !== 'string') throw new Error('invalid-request');
    const sub = await service.subscribe({
      deckId: validateSafeId(i.deckId, 'deckId'),
      sourceKind: i.sourceKind,
      sourceRef: validateSafeId(i.sourceRef, 'sourceRef'),
      newItems: policy(i.newItems),
      cards: i.cards,
      ...(i.noteTypeId === undefined ? {} : { noteTypeId: validateSafeId(i.noteTypeId, 'noteTypeId') }),
      prompt: i.prompt,
      chunk: i.chunk,
      ...(i.prefix === undefined ? {} : { prefix: i.prefix }),
      ...(i.limit === undefined ? {} : { limit: i.limit }),
    });
    const result = await deckSyncScheduler.runNow(sub.id);
    return { subscription: service.get(sub.id), result };
  });
  ipcMain.handle('deck-sync:unsubscribe', (event, id: unknown) => syncService(event).unsubscribe(validateSafeId(id, 'id')));
  ipcMain.handle('deck-sync:set-policy', (event, id: unknown, newItems: unknown) => {
    if (newItems !== 'silent' && newItems !== 'toast') throw new Error('invalid-request');
    return syncService(event).setPolicy(validateSafeId(id, 'id'), newItems);
  });
  ipcMain.handle('deck-sync:sync-now', (event, id: unknown) => {
    authorize(event);
    return deckSyncScheduler.runNow(validateSafeId(id, 'id'));
  });
  ipcMain.handle('deck-sync:pending', event => syncService(event).pending());
  // KEY-396: a narrator (rijal) deck from mastered hadiths or a Sunnah book/bab, with the user's chosen fields.
  ipcMain.handle('knowledge-cards:generate-narrator-deck', (event, input: unknown) => {
    authorize(event);
    return new NarratorDeckService(getDatabase(), corpusReaders).generate(validateNarratorDeckInput(input));
  });
  ipcMain.handle('deck-sync:resolve-change', async (event, noteId: unknown, choice: unknown) => {
    if (choice !== 'update' && choice !== 'keep') throw new Error('invalid-request');
    await syncService(event).resolveChange(validateSafeId(noteId, 'noteId'), choice);
    return true;
  });
  ipcMain.handle('deck-sync:resolve-orphan', (event, noteId: unknown, choice: unknown) => {
    if (choice !== 'delete' && choice !== 'keep') throw new Error('invalid-request');
    syncService(event).resolveOrphan(validateSafeId(noteId, 'noteId'), choice);
    return true;
  });

  ipcMain.handle('card-media:read', (event, name: unknown) => {
    const store = mediaStore(event);
    return typeof name === 'string' ? store.read(name) : null;
  });
}
