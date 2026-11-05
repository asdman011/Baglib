import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { withKnowledgeHistory, trashKnowledge } from '../../services/knowledge-history';
import type {
  AnnotationDTO,
  AnnotationPayload,
  AnnotationFilter,
  InkStroke,
} from '../../../shared/types/annotation';

interface AnnotationRow {
 id: string; book_id: string; type: AnnotationDTO['type']; location_cfi_or_page: string;
 selected_text: string | null; note_content: string | null; color: string | null;
 stroke_data: string | null; tags: string | null; created_at: string; updated_at: string;
}
export class SqliteAnnotationRepository {
  constructor(private db: Database) {}

  private mapRow(row: AnnotationRow): AnnotationDTO {
    let strokeData: InkStroke[] | null = null;
    let tags: string[] | null = null;

    if (row.stroke_data) {
      try {
        strokeData = JSON.parse(row.stroke_data);
      } catch {
        strokeData = null;
      }
    }

    if (row.tags) {
      try {
        tags = JSON.parse(row.tags);
      } catch {
        tags = null;
      }
    }

    return {
      id: row.id,
      bookId: row.book_id,
      type: row.type,
      locationCfiOrPage: row.location_cfi_or_page,
      selectedText: row.selected_text || null,
      noteContent: row.note_content || null,
      color: row.color || null,
      strokeData,
      tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getByBookId(bookId: string): AnnotationDTO[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM annotations WHERE book_id = ? ORDER BY CAST(location_cfi_or_page AS INTEGER) ASC, created_at ASC`
      )
      .all(bookId) as AnnotationRow[];

    return rows.map((r) => this.mapRow(r));
  }

  getAll(): AnnotationDTO[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM annotations WHERE book_id IS NOT NULL ORDER BY book_id ASC, CAST(location_cfi_or_page AS INTEGER) ASC, created_at ASC`
      )
      .all() as AnnotationRow[];

    return rows.map((r) => this.mapRow(r));
  }

  getByBookIdAndPage(bookId: string, page: string): AnnotationDTO[] {
    const rows = this.db
      .prepare(`SELECT * FROM annotations WHERE book_id = ? AND location_cfi_or_page = ? ORDER BY created_at ASC`)
      .all(bookId, page) as AnnotationRow[];

    return rows.map((r) => this.mapRow(r));
  }

  getFiltered(filter: AnnotationFilter): AnnotationDTO[] {
    let query = `SELECT * FROM annotations WHERE book_id = ?`;
    const params: unknown[] = [filter.bookId];

    if (filter.type) {
      query += ` AND type = ?`;
      params.push(filter.type);
    }
    if (filter.color) {
      query += ` AND color = ?`;
      params.push(filter.color);
    }
    if (filter.page) {
      query += ` AND location_cfi_or_page = ?`;
      params.push(filter.page);
    }
    if (filter.searchQuery && filter.searchQuery.trim()) {
      query += ` AND (selected_text LIKE ? OR note_content LIKE ?)`;
      const term = `%${filter.searchQuery.trim()}%`;
      params.push(term, term);
    }

    query += ` ORDER BY CAST(location_cfi_or_page AS INTEGER) ASC, created_at ASC`;
    const rows = this.db.prepare(query).all(...params) as AnnotationRow[];
    return rows.map((r) => this.mapRow(r));
  }

  save(payload: AnnotationPayload): AnnotationDTO {
    const id = payload.id || randomUUID();
    return withKnowledgeHistory(this.db,[id],'save',()=>{
      const existingKnowledge = this.db.prepare('SELECT knowledge_type,deleted_at FROM knowledge WHERE id=?').get(id) as {knowledge_type:string;deleted_at:string|null}|undefined;
      if(existingKnowledge?.deleted_at)throw new Error('history-conflict');
      const result = this.saveRaw({...payload,id});
      if (payload.type === 'note') {
        const old = existingKnowledge;
        if (!old) {
          this.db.prepare("INSERT INTO knowledge(id,work_id,knowledge_type,location,created_at,updated_at) VALUES(?,?,'note',?,?,?)").run(id,payload.bookId,payload.locationCfiOrPage,result.createdAt,result.updatedAt);
          this.db.prepare('INSERT INTO note_detail(knowledge_id,content) VALUES(?,?)').run(id,payload.noteContent || '');
        } else {
          this.db.prepare('UPDATE knowledge SET work_id=?,location=?,updated_at=? WHERE id=?').run(payload.bookId,payload.locationCfiOrPage,result.updatedAt,id);
          const target = old.knowledge_type === 'study_note' ? ['study_note_detail','content'] : old.knowledge_type === 'question' ? ['question_detail','question_text'] : old.knowledge_type === 'quote' ? ['quote_detail','context_note'] : ['note_detail','content'];
          this.db.prepare(`UPDATE ${target[0]} SET ${target[1]}=? WHERE knowledge_id=?`).run(payload.noteContent || '',id);
        }
      }
      return result;
    });
  }
  private saveRaw(payload: AnnotationPayload): AnnotationDTO {
    const now = new Date().toISOString();
    const id = payload.id || randomUUID();
    const strokeDataStr = payload.strokeData ? JSON.stringify(payload.strokeData) : null;
    const tagsStr = payload.tags ? JSON.stringify(payload.tags) : null;

    const existing = this.db.prepare(`SELECT id, created_at FROM annotations WHERE id = ?`).get(id) as
      | { id: string; created_at: string }
      | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE annotations SET
            type = ?,
            book_id = ?,
            location_cfi_or_page = ?,
            selected_text = ?,
            note_content = ?,
            color = ?,
            stroke_data = ?,
            tags = ?,
            updated_at = ?
           WHERE id = ?`
        )
        .run(
          payload.type,
          payload.bookId,
          payload.locationCfiOrPage,
          payload.selectedText || null,
          payload.noteContent || null,
          payload.color || null,
          strokeDataStr,
          tagsStr,
          now,
          id
        );

      return {
        id,
        bookId: payload.bookId,
        type: payload.type,
        locationCfiOrPage: payload.locationCfiOrPage,
        selectedText: payload.selectedText || null,
        noteContent: payload.noteContent || null,
        color: payload.color || null,
        strokeData: payload.strokeData || null,
        tags: payload.tags || null,
        createdAt: existing.created_at,
        updatedAt: now,
      };
    } else {
      const createdAt = payload.createdAt || now;
      this.db
        .prepare(
          `INSERT INTO annotations (
            id, book_id, type, location_cfi_or_page, selected_text,
            note_content, color, stroke_data, tags, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          payload.bookId,
          payload.type,
          payload.locationCfiOrPage,
          payload.selectedText || null,
          payload.noteContent || null,
          payload.color || null,
          strokeDataStr,
          tagsStr,
          createdAt,
          now
        );

      return {
        id,
        bookId: payload.bookId,
        type: payload.type,
        locationCfiOrPage: payload.locationCfiOrPage,
        selectedText: payload.selectedText || null,
        noteContent: payload.noteContent || null,
        color: payload.color || null,
        strokeData: payload.strokeData || null,
        tags: payload.tags || null,
        createdAt,
        updatedAt: now,
      };
    }
  }

  delete(id: string): boolean {
    if (this.db.prepare('SELECT 1 FROM knowledge WHERE id=?').get(id)) return trashKnowledge(this.db,id);
    const res = this.db.prepare(`DELETE FROM annotations WHERE id = ?`).run(id);
    return res.changes > 0;
  }

  deleteByBookId(bookId: string): number {
    const rows = this.db.prepare('SELECT id FROM annotations WHERE book_id=?').all(bookId) as {id:string}[];
    return this.db.transaction(()=>rows.filter(row=>this.delete(row.id)).length)();
  }
}

export { SqliteAnnotationRepository as AnnotationRepository };
