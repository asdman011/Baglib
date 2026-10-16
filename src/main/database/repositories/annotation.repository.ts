import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  AnnotationDTO,
  AnnotationPayload,
  AnnotationFilter,
  InkStroke,
} from '../../../shared/types/annotation';

export class SqliteAnnotationRepository {
  constructor(private db: Database) {}

  private mapRow(row: any): AnnotationDTO {
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
      .all(bookId) as any[];

    return rows.map((r) => this.mapRow(r));
  }

  getAll(): AnnotationDTO[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM annotations ORDER BY book_id ASC, CAST(location_cfi_or_page AS INTEGER) ASC, created_at ASC`
      )
      .all() as any[];

    return rows.map((r) => this.mapRow(r));
  }

  getByBookIdAndPage(bookId: string, page: string): AnnotationDTO[] {
    const rows = this.db
      .prepare(`SELECT * FROM annotations WHERE book_id = ? AND location_cfi_or_page = ? ORDER BY created_at ASC`)
      .all(bookId, page) as any[];

    return rows.map((r) => this.mapRow(r));
  }

  getFiltered(filter: AnnotationFilter): AnnotationDTO[] {
    let query = `SELECT * FROM annotations WHERE book_id = ?`;
    const params: any[] = [filter.bookId];

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
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  save(payload: AnnotationPayload): AnnotationDTO {
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
    const res = this.db.prepare(`DELETE FROM annotations WHERE id = ?`).run(id);
    return res.changes > 0;
  }

  deleteByBookId(bookId: string): number {
    const res = this.db.prepare(`DELETE FROM annotations WHERE book_id = ?`).run(bookId);
    return res.changes;
  }
}

export { SqliteAnnotationRepository as AnnotationRepository };
