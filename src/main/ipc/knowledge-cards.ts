import { ipcMain } from 'electron';
import { getDatabase } from '../database/connection';
import { KnowledgeCardRepository } from '../database/repositories/knowledge-card.repository';
import { validateCardInput } from '../../shared/types/knowledge-cards';

const repository = () => new KnowledgeCardRepository(getDatabase());
const cardId = (id: unknown): string => {
  if (typeof id !== 'string' || !id) throw new Error('invalid-request');
  return id;
};

export function registerKnowledgeCardIpc(): void {
  ipcMain.handle('knowledge-cards:list', (_, query?: { search?: unknown; offset?: unknown }) => repository().list({
    search: typeof query?.search === 'string' ? query.search.slice(0, 200) : '',
    offset: typeof query?.offset === 'number' ? query.offset : 0,
  }));
  ipcMain.handle('knowledge-cards:save', (_, input: unknown) => repository().save(validateCardInput(input)));
  ipcMain.handle('knowledge-cards:preserved', () => repository().listPreserved());
  ipcMain.handle('knowledge-cards:remove', (_, id: unknown) => repository().remove(cardId(id)));
  ipcMain.handle('knowledge-cards:set-memorizing', (_, id: unknown, memorizing: unknown) => repository().setMemorizing(cardId(id), memorizing === true));
}
