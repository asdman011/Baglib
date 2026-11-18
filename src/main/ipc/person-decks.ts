/**
 * Baglib — IPC for biography decks and Wikipedia quick-cards (KEY-401).
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database/connection';
import { PersonDeckService, validateAuthorDeckInput, validateWikipediaCardInput } from '../services/person-decks';
import { WikipediaService } from '../services/dictionary/wikipedia.service';

const KNOWN = ['invalid-request', 'no-people', 'not-found'];

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !((url.protocol === 'app:' && url.hostname === '-') || (url.protocol === 'file:' && !url.hostname) || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};

const failure = (error: unknown) => {
  const message = (error as Error)?.message ?? '';
  return { ok: false as const, error: KNOWN.includes(message) ? message : 'failed' };
};

export function registerPersonDeckIpc(): void {
  const wikipedia = new WikipediaService();
  ipcMain.handle('person-decks:author-deck', (event, input: unknown) => {
    try {
      authorize(event);
      return { ok: true, data: new PersonDeckService(getDatabase()).authorDeck(validateAuthorDeckInput(input)) };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle('person-decks:wikipedia-card', async (event, input: unknown) => {
    try {
      authorize(event);
      const request = validateWikipediaCardInput(input);
      return { ok: true, data: await new PersonDeckService(getDatabase()).wikipediaCard(request, (title, lang) => wikipedia.fetchSummary(title, lang)) };
    } catch (error) {
      return failure(error);
    }
  });
}
