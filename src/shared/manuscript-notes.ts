/** KEY-372 (RE-11): quick notes and manuscripts. Pure link logic; reads come from manuscript_link (RE-3). */
import type { ManuscriptScheme } from './manuscripts';

export const NOTE_EMBED_FLAVOUR = 'baglib:note-embed';

export interface NoteEmbedProps { url: string; noteId: string; title: string }

/** One row of manuscript_link joined with its chapter and manuscript (deleted ones excluded by the query). */
export interface ManuscriptBacklinkRow {
  manuscript_id: string; manuscript_title: string; document_id: string; document_title: string; block_id: string;
  target_scheme: ManuscriptScheme; target_id: string;
}

export interface ManuscriptBacklink {
  manuscriptId: string; manuscriptTitle: string;
  chapters: { documentId: string; documentTitle: string; blockIds: string[] }[];
}

export function noteTarget(noteId: string): string {
  return 'note:' + noteId;
}

/** The note id inside a `note:` target, without an anchor (`note:id#heading`). */
export function noteIdFromTarget(target: string): string | null {
  const match = /^note:([^#\s]+)/u.exec(target.trim());
  return match ? match[1] : null;
}

export function noteEmbedProps(note: { id: string; title?: string; content?: string }): NoteEmbedProps {
  const firstLine = (note.content || '').split('\n').map(line => line.replace(/^#+\s*/u, '').trim()).find(Boolean) || '';
  return { url: noteTarget(note.id), noteId: note.id, title: (note.title || '').trim() || firstLine.slice(0, 80) };
}

/** "Used in manuscripts": group link rows by manuscript, then chapter, keeping first-seen order. */
export function groupBacklinks(rows: readonly ManuscriptBacklinkRow[]): ManuscriptBacklink[] {
  const manuscripts = new Map<string, ManuscriptBacklink>();
  for (const row of rows) {
    let entry = manuscripts.get(row.manuscript_id);
    if (!entry) { entry = { manuscriptId: row.manuscript_id, manuscriptTitle: row.manuscript_title, chapters: [] }; manuscripts.set(row.manuscript_id, entry); }
    let chapter = entry.chapters.find(item => item.documentId === row.document_id);
    if (!chapter) { chapter = { documentId: row.document_id, documentTitle: row.document_title, blockIds: [] }; entry.chapters.push(chapter); }
    if (!chapter.blockIds.includes(row.block_id)) chapter.blockIds.push(row.block_id);
  }
  return [...manuscripts.values()];
}

/** The notes a manuscript embeds or links to, unique, from its outgoing link rows. */
export function embeddedNoteIds(rows: readonly Pick<ManuscriptBacklinkRow, 'target_scheme' | 'target_id'>[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (row.target_scheme !== 'note') continue;
    const id = noteIdFromTarget('note:' + row.target_id);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
