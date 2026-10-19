/**
 * Baglib — Knowledge & Reading Session Repository
 *
 * Persists polymorphic knowledge items (highlights, notes, quotes, bookmarks, questions)
 * into Baglib's core schema tables:
 * - knowledge
 * - highlight_detail
 * - note_detail
 * - quote_detail
 * - bookmark_detail
 * - question_detail
 * - knowledge_tag
 * - knowledge_collection
 * - reading_session
 */

import { randomUUID } from 'crypto';
import type { Database } from 'better-sqlite3';
import type {
  IKnowledgeRepository,
  KnowledgeItemDTO,
  KnowledgeType,
  PageNoteDTO,
  PageNotePayload,
  ReadingSessionRecord,
  RecordReadingSessionPayload,
  SaveKnowledgePayload,
} from '../../../shared/types/repository';

export class SqliteKnowledgeRepository implements IKnowledgeRepository {
  constructor(private db: Database) {}

  /**
   * Retrieves all notes across works (legacy contract).
   */
  getAllNotes(): PageNoteDTO[] {
    const rows = this.db
      .prepare(
        `
      SELECT k.id, k.work_id as bookId, k.location as pageNumber, k.created_at as createdAt, n.content
      FROM knowledge k
      JOIN note_detail n ON k.id = n.knowledge_id
      WHERE k.knowledge_type = 'note'
      ORDER BY k.created_at DESC
    `
      )
      .all() as any[];

    return rows.map((row) => ({
      id: row.id,
      bookId: row.bookId,
      pageNumber: Number(row.pageNumber) || 1,
      content: row.content || '',
      createdAt: row.createdAt,
    }));
  }

  /**
   * Adds a new note attached to a work (legacy contract).
   */
  addNote(note: PageNotePayload): PageNotePayload {
    const id = note.id || randomUUID();
    const now = new Date().toISOString();
    const createdAt = note.createdAt || now;

    this.saveKnowledge({
      id,
      workId: note.bookId,
      knowledgeType: 'note',
      location: String(note.pageNumber || 1),
      noteContent: note.content,
      createdAt,
    });

    return { ...note, id, createdAt };
  }

  /**
   * Deletes a note by its ID (legacy contract).
   */
  deleteNote(noteId: string): void {
    this.deleteKnowledge(noteId);
  }

  /**
   * Retrieves all knowledge items for a specific work, optionally filtered by knowledgeType.
   */
  getKnowledgeByWork(workId: string, type?: KnowledgeType): KnowledgeItemDTO[] {
    let query = `
      SELECT 
        k.id,
        k.work_id AS workId,
        k.edition_id AS editionId,
        k.source_id AS sourceId,
        k.knowledge_type AS knowledgeType,
        k.location,
        k.created_at AS createdAt,
        k.updated_at AS updatedAt,
        hd.quoted_text AS highlightText,
        hd.color AS highlightColor,
        nd.content AS noteContent,
        qd.quoted_text AS quoteText,
        qd.context_note AS contextNote,
        bd.label AS bookmarkLabel,
        qud.question_text AS questionText
      FROM knowledge k
      LEFT JOIN highlight_detail hd ON k.id = hd.knowledge_id
      LEFT JOIN note_detail nd      ON k.id = nd.knowledge_id
      LEFT JOIN quote_detail qd     ON k.id = qd.knowledge_id
      LEFT JOIN bookmark_detail bd  ON k.id = bd.knowledge_id
      LEFT JOIN question_detail qud ON k.id = qud.knowledge_id
      WHERE k.work_id = ?
    `;

    const params: any[] = [workId];
    if (type) {
      query += ` AND k.knowledge_type = ?`;
      params.push(type);
    }
    query += ` ORDER BY k.created_at ASC`;

    const rows = this.db.prepare(query).all(...params) as any[];
    return this.mapKnowledgeRows(rows);
  }

  /**
   * Retrieves all knowledge items across the entire library.
   */
  getAllKnowledge(): KnowledgeItemDTO[] {
    const query = `
      SELECT 
        k.id,
        k.work_id AS workId,
        k.edition_id AS editionId,
        k.source_id AS sourceId,
        k.knowledge_type AS knowledgeType,
        k.location,
        k.created_at AS createdAt,
        k.updated_at AS updatedAt,
        hd.quoted_text AS highlightText,
        hd.color AS highlightColor,
        nd.content AS noteContent,
        qd.quoted_text AS quoteText,
        qd.context_note AS contextNote,
        bd.label AS bookmarkLabel,
        qud.question_text AS questionText
      FROM knowledge k
      LEFT JOIN highlight_detail hd ON k.id = hd.knowledge_id
      LEFT JOIN note_detail nd      ON k.id = nd.knowledge_id
      LEFT JOIN quote_detail qd     ON k.id = qd.knowledge_id
      LEFT JOIN bookmark_detail bd  ON k.id = bd.knowledge_id
      LEFT JOIN question_detail qud ON k.id = qud.knowledge_id
      ORDER BY k.created_at ASC
    `;

    const rows = this.db.prepare(query).all() as any[];
    return this.mapKnowledgeRows(rows);
  }

  /**
   * Saves or updates a polymorphic knowledge record and its corresponding detail table.
   */
  saveKnowledge(payload: SaveKnowledgePayload): KnowledgeItemDTO {
    const id = payload.id || randomUUID();
    const now = new Date().toISOString();
    const createdAt = payload.createdAt || now;
    const updatedAt = now;
    const knowledgeType: KnowledgeType = payload.knowledgeType || payload.type || 'highlight';

    const upsertKnowledge = this.db.prepare(`
      INSERT INTO knowledge (id, work_id, edition_id, source_id, knowledge_type, location, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        edition_id = excluded.edition_id,
        source_id = excluded.source_id,
        knowledge_type = excluded.knowledge_type,
        location = excluded.location,
        updated_at = excluded.updated_at
    `);

    this.db.transaction(() => {
      upsertKnowledge.run(
        id,
        payload.workId,
        payload.editionId || null,
        payload.sourceId || null,
        knowledgeType,
        String(payload.location || '1'),
        createdAt,
        updatedAt
      );

      // Save to type-specific detail table
      switch (knowledgeType) {
        case 'highlight': {
          const stmt = this.db.prepare(`
            INSERT INTO highlight_detail (knowledge_id, quoted_text, color)
            VALUES (?, ?, ?)
            ON CONFLICT(knowledge_id) DO UPDATE SET
              quoted_text = excluded.quoted_text,
              color = excluded.color
          `);
          stmt.run(id, payload.quotedText || '', payload.color || 'amber');
          break;
        }
        case 'note': {
          const stmt = this.db.prepare(`
            INSERT INTO note_detail (knowledge_id, content)
            VALUES (?, ?)
            ON CONFLICT(knowledge_id) DO UPDATE SET
              content = excluded.content
          `);
          stmt.run(id, payload.noteContent || '');
          break;
        }
        case 'quote': {
          const stmt = this.db.prepare(`
            INSERT INTO quote_detail (knowledge_id, quoted_text, context_note)
            VALUES (?, ?, ?)
            ON CONFLICT(knowledge_id) DO UPDATE SET
              quoted_text = excluded.quoted_text,
              context_note = excluded.context_note
          `);
          stmt.run(id, payload.quotedText || '', payload.contextNote || null);
          break;
        }
        case 'bookmark': {
          const stmt = this.db.prepare(`
            INSERT INTO bookmark_detail (knowledge_id, label)
            VALUES (?, ?)
            ON CONFLICT(knowledge_id) DO UPDATE SET
              label = excluded.label
          `);
          stmt.run(id, payload.label || null);
          break;
        }
        case 'question': {
          const stmt = this.db.prepare(`
            INSERT INTO question_detail (knowledge_id, question_text)
            VALUES (?, ?)
            ON CONFLICT(knowledge_id) DO UPDATE SET
              question_text = excluded.question_text
          `);
          stmt.run(id, payload.questionText || '');
          break;
        }
      }

      // Sync tags if provided
      if (Array.isArray(payload.tagIds)) {
        this.db.prepare(`DELETE FROM knowledge_tag WHERE knowledge_id = ?`).run(id);
        const insertTag = this.db.prepare(
          `INSERT OR IGNORE INTO knowledge_tag (knowledge_id, tag_id) VALUES (?, ?)`
        );
        for (const tagId of payload.tagIds) {
          insertTag.run(id, tagId);
        }
      }

      // Sync collections if provided
      if (Array.isArray(payload.collectionIds)) {
        this.db.prepare(`DELETE FROM knowledge_collection WHERE knowledge_id = ?`).run(id);
        const insertCol = this.db.prepare(
          `INSERT OR IGNORE INTO knowledge_collection (knowledge_id, collection_id) VALUES (?, ?)`
        );
        for (const colId of payload.collectionIds) {
          insertCol.run(id, colId);
        }
      }

      // Sync to annotations table as well if table exists (for dual compatibility)
      try {
        const hasAnnotationsTable = this.db
          .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='annotations'`)
          .get();
        if (hasAnnotationsTable) {
          const annotType =
            knowledgeType === 'question' || knowledgeType === 'quote'
              ? 'note'
              : knowledgeType;
          const annotContent =
            payload.noteContent || payload.contextNote || payload.questionText || payload.label || null;
          const annotSelectedText = payload.quotedText || null;

          this.db
            .prepare(
              `
            INSERT INTO annotations (id, book_id, type, location_cfi_or_page, selected_text, note_content, color, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              location_cfi_or_page = excluded.location_cfi_or_page,
              selected_text = excluded.selected_text,
              note_content = excluded.note_content,
              color = excluded.color,
              updated_at = excluded.updated_at
          `
            )
            .run(
              id,
              payload.workId,
              annotType,
              String(payload.location || '1'),
              annotSelectedText,
              annotContent,
              payload.color || null,
              createdAt,
              updatedAt
            );
        }
      } catch (err) {
        // Non-blocking sync
      }
    })();

    const result = this.getKnowledgeByWork(payload.workId).find((k) => k.id === id);
    if (!result) {
      return {
        id,
        workId: payload.workId,
        editionId: payload.editionId,
        sourceId: payload.sourceId,
        knowledgeType: knowledgeType,
        location: payload.location,
        createdAt,
        updatedAt,
        quotedText: payload.quotedText,
        color: payload.color,
        noteContent: payload.noteContent,
        contextNote: payload.contextNote,
        label: payload.label,
        questionText: payload.questionText,
      };
    }
    return result;
  }

  /**
   * Deletes a knowledge record by ID. Foreign keys CASCADE to all detail and join tables.
   */
  deleteKnowledge(knowledgeId: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM knowledge WHERE id = ?`);
    const res = stmt.run(knowledgeId);

    // Also remove from annotations table if it exists
    try {
      this.db.prepare(`DELETE FROM annotations WHERE id = ?`).run(knowledgeId);
    } catch {}

    return res.changes > 0;
  }

  /**
   * Records a completed reading session in reading_session table.
   */
  recordReadingSession(session: RecordReadingSessionPayload): ReadingSessionRecord {
    const id = session.id || randomUUID();
    const endedAt = session.endedAt || new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO reading_session (id, work_id, edition_id, started_at, ended_at, pages_read, mood)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      session.workId,
      session.editionId || null,
      session.startedAt,
      endedAt,
      session.pagesRead || 0,
      session.mood || null
    );

    return {
      id,
      workId: session.workId,
      editionId: session.editionId,
      startedAt: session.startedAt,
      endedAt,
      pagesRead: session.pagesRead || 0,
      mood: session.mood,
    };
  }

  /**
   * Retrieves reading sessions for a work.
   */
  getReadingSessions(workId: string): ReadingSessionRecord[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, work_id AS workId, edition_id AS editionId, started_at AS startedAt, ended_at AS endedAt, pages_read AS pagesRead, mood
      FROM reading_session
      WHERE work_id = ?
      ORDER BY started_at DESC
    `
      )
      .all(workId) as any[];

    return rows.map((r) => ({
      id: r.id,
      workId: r.workId,
      editionId: r.editionId,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      pagesRead: Number(r.pagesRead) || 0,
      mood: r.mood,
    }));
  }

  /**
   * Updates last read location (page number or CFI) on the work table.
   */
  updateLastReadLocation(workId: string, location: string): boolean {
    try {
      const stmt = this.db.prepare(`UPDATE work SET last_read_location = ? WHERE id = ?`);
      const res = stmt.run(location, workId);
      return res.changes > 0;
    } catch (e) {
      console.warn('[SqliteKnowledgeRepository] updateLastReadLocation error:', e);
      return false;
    }
  }

  /**
   * Retrieves the last read location for a work.
   */
  getLastReadLocation(workId: string): string | null {
    try {
      const row = this.db.prepare(`SELECT last_read_location FROM work WHERE id = ?`).get(workId) as any;
      return row?.last_read_location || null;
    } catch {
      return null;
    }
  }

  /**
   * Helper to map joined knowledge rows into clean domain DTOs.
   */
  private mapKnowledgeRows(rows: any[]): KnowledgeItemDTO[] {
    if (!rows || rows.length === 0) return [];

    const knowledgeIds = rows.map((r) => r.id);
    const placeholders = knowledgeIds.map(() => '?').join(',');

    // Fetch tags
    const tagsMap = new Map<string, Array<{ id: string; name: string; color?: string }>>();
    try {
      const tagRows = this.db
        .prepare(
          `
        SELECT kt.knowledge_id, t.id, t.name, t.color
        FROM knowledge_tag kt
        JOIN tag t ON kt.tag_id = t.id
        WHERE kt.knowledge_id IN (${placeholders})
      `
        )
        .all(...knowledgeIds) as any[];

      for (const t of tagRows) {
        if (!tagsMap.has(t.knowledge_id)) tagsMap.set(t.knowledge_id, []);
        tagsMap.get(t.knowledge_id)!.push({ id: t.id, name: t.name, color: t.color });
      }
    } catch {}

    // Fetch collections
    const collectionsMap = new Map<string, Array<{ id: string; name: string }>>();
    try {
      const colRows = this.db
        .prepare(
          `
        SELECT kc.knowledge_id, c.id, c.name
        FROM knowledge_collection kc
        JOIN collection c ON kc.collection_id = c.id
        WHERE kc.knowledge_id IN (${placeholders})
      `
        )
        .all(...knowledgeIds) as any[];

      for (const c of colRows) {
        if (!collectionsMap.has(c.knowledge_id)) collectionsMap.set(c.knowledge_id, []);
        collectionsMap.get(c.knowledge_id)!.push({ id: c.id, name: c.name });
      }
    } catch {}

    return rows.map((r) => ({
      id: r.id,
      workId: r.workId,
      editionId: r.editionId,
      sourceId: r.sourceId,
      knowledgeType: r.knowledgeType as KnowledgeType,
      location: r.location,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      quotedText: r.highlightText || r.quoteText || undefined,
      color: r.highlightColor || undefined,
      noteContent: r.noteContent || undefined,
      contextNote: r.contextNote || undefined,
      label: r.bookmarkLabel || undefined,
      questionText: r.questionText || undefined,
      tags: tagsMap.get(r.id) || [],
      collections: collectionsMap.get(r.id) || [],
    }));
  }
}

export { SqliteKnowledgeRepository as KnowledgeRepository };
