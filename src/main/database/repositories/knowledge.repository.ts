import type { Database } from 'better-sqlite3';
import type { IKnowledgeRepository, PageNotePayload, PageNoteDTO } from '../../../shared/types/repository';

export class SqliteKnowledgeRepository implements IKnowledgeRepository {
  constructor(private db: Database) {}

  getAllNotes(): PageNoteDTO[] {
    const rows = this.db.prepare(`
      SELECT k.id, k.work_id as bookId, k.location as pageNumber, k.created_at as createdAt, n.content
      FROM knowledge k
      JOIN note_detail n ON k.id = n.knowledge_id
      WHERE k.knowledge_type = 'note'
      ORDER BY k.created_at DESC
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      bookId: row.bookId,
      pageNumber: Number(row.pageNumber),
      content: row.content,
      createdAt: row.createdAt,
    }));
  }

  addNote(note: PageNotePayload): PageNotePayload {
    const insertKnowledge = this.db.prepare(`
      INSERT INTO knowledge (id, work_id, knowledge_type, location, created_at, updated_at)
      VALUES (?, ?, 'note', ?, ?, ?)
    `);

    const insertNoteDetail = this.db.prepare(`
      INSERT INTO note_detail (knowledge_id, content)
      VALUES (?, ?)
    `);

    const now = new Date().toISOString();
    const createdAt = note.createdAt || now;

    this.db.transaction(() => {
      insertKnowledge.run(note.id, note.bookId, String(note.pageNumber), createdAt, now);
      insertNoteDetail.run(note.id, note.content);
    })();

    return note;
  }

  deleteNote(noteId: string): void {
    const stmt = this.db.prepare(`DELETE FROM knowledge WHERE id = ? AND knowledge_type = 'note'`);
    stmt.run(noteId);
  }
}

export { SqliteKnowledgeRepository as KnowledgeRepository };
export type { PageNotePayload, PageNoteDTO };
