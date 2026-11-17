import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'node:fs/promises';
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
import { validateReview } from '../../shared/srs';
import { CardNoteRepository } from '../database/repositories/card-note.repository';
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
const cardId = (id: unknown): string => {
  if (typeof id !== 'string' || !id) throw new Error('invalid-request');
  return id;
};

export function registerKnowledgeCardIpc(): void {
  ipcMain.handle('knowledge-cards:attempt', (event,input:PracticeInput)=>{authorize(event);return new PracticeService(getDatabase()).record(input);});
  ipcMain.handle('knowledge-cards:judge-attempt', (event,input:JudgeAttemptInput)=>{authorize(event);return new PracticeService(getDatabase()).judge(input);});
  ipcMain.handle('knowledge-cards:attempts', (event,query:AttemptQuery)=>{authorize(event);return new PracticeService(getDatabase()).list(query);});
  ipcMain.handle('knowledge-cards:clear-practice', (event,confirmed:boolean)=>{authorize(event);return new PracticeService(getDatabase()).clear(confirmed);});
  ipcMain.handle('knowledge-cards:update', (event,id:unknown,input:unknown,revision:number)=>{authorize(event);return repository().update(cardId(id),validateCardInput(input),revision);});
  ipcMain.handle('knowledge-cards:review-queue', event => reviewService(event).queue());
  ipcMain.handle('knowledge-cards:grade-review', (event, input: unknown) => reviewService(event).grade(validateReview(input)));
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
    const { name, text } = deckService(event).exportText(cardId(id));
    const options = { defaultPath: `${name.replace(/[\\/:*?"<>|]/gu, ' ').trim() || 'deck'}.txt`, filters: [{ name: 'Anki', extensions: ['txt'] }] };
    const owner = BrowserWindow.fromWebContents(event.sender);
    const choice = await (owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options));
    if (choice.canceled || !choice.filePath) return false;
    await writeFile(choice.filePath, text, 'utf8');
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
}
