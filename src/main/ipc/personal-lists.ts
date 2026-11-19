/**
 * Baglib — IPC for personal lists (KEY-386). Every input is validated in PersonalListsService.
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getDatabase } from '../database/connection';
import { PersonalListsService } from '../services/personal-lists';
import { deckSyncScheduler } from '../services/deck-sync-scheduler';
import { STARRED_LIST_ID } from '../../shared/personal-lists';

const KNOWN = ['invalid-request', 'not-found'];

const authorize = (event: IpcMainInvokeEvent) => {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !((url.protocol === 'app:' && url.hostname === '-') || (url.protocol === 'file:' && !url.hostname) || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
};

type Handler = (service: PersonalListsService, ...args: unknown[]) => unknown;

const HANDLERS: Record<string, Handler> = {
  all: s => s.all(),
  create: (s, name) => s.create(name),
  rename: (s, id, name) => s.rename(id, name),
  remove: (s, id) => s.remove(id),
  reorder: (s, ids) => s.reorder(ids),
  items: (s, listId, kind) => s.items(listId, kind),
  add: (s, listId, item) => s.add(listId, item as Parameters<PersonalListsService['add']>[1]),
  'remove-item': (s, listId, kind, ref) => s.removeItem(listId, kind, ref),
  'reorder-items': (s, listId, ids) => s.reorderItems(listId, ids),
  'toggle-star': (s, item) => s.toggleStar(item as Parameters<PersonalListsService['toggleStar']>[0]),
  membership: (s, kind, refs) => s.membership(kind, refs),
  filter: (s, kind, ids, mode) => s.filter(kind, ids, mode),
};

/** KEY-399: item changes that a "Revise this list" deck follows. */
const LIST_ITEM_CHANGES: Record<string, (args: unknown[]) => unknown> = {
  add: args => args[0],
  remove: args => args[0],
  'remove-item': args => args[0],
  'reorder-items': args => args[0],
  'toggle-star': () => STARRED_LIST_ID,
};

export function registerPersonalListsIpc(): void {
  for (const [name, handler] of Object.entries(HANDLERS)) {
    ipcMain.handle(`personal-lists:${name}`, (event, ...args: unknown[]) => {
      try {
        authorize(event);
        const data = handler(new PersonalListsService(getDatabase()), ...args) ?? null;
        const changed = LIST_ITEM_CHANGES[name]?.(args);
        if (typeof changed === 'string') deckSyncScheduler.requestForList(changed);
        return { ok: true as const, data };
      } catch (error) {
        const message = (error as Error)?.message ?? '';
        if (!KNOWN.includes(message)) console.warn('[IPC:personal-lists]', error);
        return { ok: false as const, error: KNOWN.includes(message) ? message : 'failed' };
      }
    });
  }
}
