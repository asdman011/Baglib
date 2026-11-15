import type { BlockModel, Store } from '@blocksuite/affine/store';
import { Text } from '@blocksuite/affine/store';
import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import {
  DatabaseBlockDataSource,
  databaseViewInitTemplate,
} from '@blocksuite/affine/blocks/database';

export interface KanbanOptions {
  title?: string;
  lang?: 'ar' | 'en';
  tasks?: string[];
  xywh?: string;
}
export * from './kanban-constants';
import { DEFAULT_KANBAN_TASKS, DEFAULT_KANBAN_TITLES } from './kanban-constants';

export function insertResearchKanban(
  doc: Store,
  parentNoteId?: string,
  options: KanbanOptions = {}
): string {
  const lang = options.lang ?? 'ar';
  const title = options.title ?? DEFAULT_KANBAN_TITLES[lang];
  const tasks = options.tasks ?? DEFAULT_KANBAN_TASKS[lang];

  // If no parentNoteId is provided, find the first note or create one on the root
  let noteId = parentNoteId;
  if (!noteId) {
    const existing = doc.getModelsByFlavour('affine:note')[0];
    if (existing) {
      noteId = existing.id;
    } else {
      noteId = doc.addBlock('affine:note', { xywh: options.xywh ?? '[0,0,800,600]' }, doc.root!.id);
    }
  }

  doc.captureSync();

  // Add the database block
  const dbId = doc.addBlock(
    'affine:database',
    {
      title: new Text(title),
      columns: [],
      titleColumn: 'Title',
    },
    noteId
  );

  const dbModel = doc.getBlock(dbId)?.model as DatabaseBlockModel | undefined;
  if (!dbModel) throw new Error('database-model-not-found');

  // Initialize datasource and add kanban view
  const datasource = new DatabaseBlockDataSource(dbModel);
  databaseViewInitTemplate(datasource, 'kanban');

  // If initial rows were added by template, set their text or add our task rows
  const existingRows = dbModel.children;
  for (let i = 0; i < tasks.length; i++) {
    if (existingRows[i]) {
      const row = existingRows[i];
      if (row.text instanceof Text) {
        row.text.delete(0, row.text.length);
        row.text.insert(tasks[i], 0);
      }
    } else {
      doc.addBlock('affine:paragraph', { text: new Text(tasks[i]) }, dbId);
    }
  }

  doc.captureSync();
  return dbId;
}
