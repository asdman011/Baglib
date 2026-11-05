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
import { withKnowledgeHistory, trashKnowledge, headRevision } from '../../services/knowledge-history';
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

type KnowledgeRow = KnowledgeItemDTO & { highlightText?: string; quoteText?: string; highlightColor?: string; bookmarkLabel?: string };
export class SqliteKnowledgeRepository implements IKnowledgeRepository {
  constructor(private db: Database) {}

  /**
   * Retrieves all notes across works (legacy contract).
   */
  getAllNotes(): PageNoteDTO[] {
    const rows = this.db
      .prepare(
        `
      SELECT k.id, k.work_id as bookId, k.location as pageNumber, k.created_at as createdAt, COALESCE(s.content,n.content) AS content
      FROM knowledge k
      LEFT JOIN note_detail n ON k.id = n.knowledge_id
      LEFT JOIN study_note_detail s ON k.id = s.knowledge_id
      WHERE k.knowledge_type IN ('note','study_note') AND k.deleted_at IS NULL AND k.work_id IS NOT NULL
      ORDER BY k.created_at DESC
    `
      )
      .all() as PageNoteDTO[];

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
        COALESCE(sd.content,rd.review,nd.content) AS noteContent,
        sd.title AS title,
        qd.quoted_text AS quoteText,
        qd.context_note AS contextNote,
        bd.label AS bookmarkLabel,
        qud.question_text AS questionText
      FROM knowledge k
      LEFT JOIN highlight_detail hd ON k.id = hd.knowledge_id
      LEFT JOIN note_detail nd      ON k.id = nd.knowledge_id
      LEFT JOIN study_note_detail sd ON k.id = sd.knowledge_id
      LEFT JOIN reading_reflection_detail rd ON k.id = rd.knowledge_id
      LEFT JOIN quote_detail qd     ON k.id = qd.knowledge_id
      LEFT JOIN bookmark_detail bd  ON k.id = bd.knowledge_id
      LEFT JOIN question_detail qud ON k.id = qud.knowledge_id
      WHERE k.work_id = ? AND k.deleted_at IS NULL
    `;

    const params: unknown[] = [workId];
    if (type) {
      query += ` AND k.knowledge_type = ?`;
      params.push(type);
    }
    query += ` ORDER BY k.created_at ASC`;

    const rows = this.db.prepare(query).all(...params) as KnowledgeRow[];
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
        COALESCE(sd.content,rd.review,nd.content) AS noteContent,
        sd.title AS title,
        qd.quoted_text AS quoteText,
        qd.context_note AS contextNote,
        bd.label AS bookmarkLabel,
        qud.question_text AS questionText
      FROM knowledge k
      LEFT JOIN highlight_detail hd ON k.id = hd.knowledge_id
      LEFT JOIN note_detail nd      ON k.id = nd.knowledge_id
      LEFT JOIN study_note_detail sd ON k.id = sd.knowledge_id
      LEFT JOIN reading_reflection_detail rd ON k.id = rd.knowledge_id
      LEFT JOIN quote_detail qd     ON k.id = qd.knowledge_id
      LEFT JOIN bookmark_detail bd  ON k.id = bd.knowledge_id
      LEFT JOIN question_detail qud ON k.id = qud.knowledge_id
      WHERE k.knowledge_type IS NOT 'card' AND (k.former_work_title IS NULL OR k.knowledge_type IN('study_note','reading_reflection')) AND k.deleted_at IS NULL
      ORDER BY k.created_at ASC
    `;

    const rows = this.db.prepare(query).all() as KnowledgeRow[];
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
    const previous = this.db.prepare('SELECT knowledge_type,deleted_at FROM knowledge WHERE id=?').get(id) as {knowledge_type:KnowledgeType;deleted_at:string|null}|undefined;
    if (previous?.deleted_at) throw new Error('history-conflict');
    const knowledgeType: KnowledgeType = previous?.knowledge_type === 'study_note' && (payload.knowledgeType === 'note' || payload.type === 'note') ? 'study_note' : payload.knowledgeType || payload.type || 'highlight';

    const upsertKnowledge = this.db.prepare(`
      INSERT INTO knowledge (id, work_id, edition_id, source_id, knowledge_type, location, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        work_id = excluded.work_id,
        former_work_title = CASE WHEN excluded.work_id IS NOT NULL THEN NULL ELSE knowledge.former_work_title END,
        edition_id = excluded.edition_id,
        source_id = excluded.source_id,
        knowledge_type = excluded.knowledge_type,
        location = excluded.location,
        updated_at = excluded.updated_at
    `);

    withKnowledgeHistory(this.db,[id],'save',() => {
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
        case 'study_note': {
          const old = this.db.prepare('SELECT title,aliases_json FROM study_note_detail WHERE knowledge_id=?').get(id) as {title:string;aliases_json:string}|undefined;
          this.db.prepare('INSERT INTO study_note_detail(knowledge_id,title,content,aliases_json) VALUES(?,?,?,?) ON CONFLICT(knowledge_id) DO UPDATE SET title=excluded.title,content=excluded.content,aliases_json=excluded.aliases_json').run(id,payload.title ?? old?.title ?? '',payload.noteContent || '',payload.aliases ? JSON.stringify(payload.aliases) : old?.aliases_json || '[]');
          break;
        }
        case 'reading_reflection': {
          this.db.prepare('INSERT INTO reading_reflection_detail(knowledge_id,entry_date,mood,difficulty,rating,review,recommendations,lessons) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(knowledge_id) DO UPDATE SET entry_date=excluded.entry_date,mood=excluded.mood,difficulty=excluded.difficulty,rating=excluded.rating,review=excluded.review,recommendations=excluded.recommendations,lessons=excluded.lessons').run(id,payload.entryDate || now.slice(0,10),payload.mood ?? null,payload.difficulty ?? null,payload.rating ?? null,payload.noteContent || '',payload.recommendations || '',payload.lessons || '');
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
      {
        const hasAnnotationsTable = this.db
          .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='annotations'`)
          .get();
        const projection = hasAnnotationsTable ? this.db.prepare('SELECT former_work_title FROM annotations WHERE id=?').get(id) as {former_work_title:string|null}|undefined : undefined;
        // With no book the reader cannot show it; only a deleted book's kept row stays.
        const unlinked = !payload.workId && !projection?.former_work_title;
        if (unlinked && projection) this.db.prepare('DELETE FROM annotations WHERE id=?').run(id);
        const readerCompatible = !unlinked && (payload.projectToReader !== false && !['reading_reflection','study_note'].includes(knowledgeType) || payload.projectToReader || Boolean(projection));
        if (hasAnnotationsTable && readerCompatible) {
          const annotType =
            knowledgeType === 'question' || knowledgeType === 'quote' || knowledgeType === 'study_note'
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
              book_id = excluded.book_id,
              type = excluded.type,
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
      }
    },payload.expectedRevision === undefined ? undefined : {id,revision:payload.expectedRevision});

    const result = (payload.workId?this.getKnowledgeByWork(payload.workId):this.getAllKnowledge()).find((k) => k.id === id);
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
    return trashKnowledge(this.db,knowledgeId);
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
      .all(workId) as ReadingSessionRecord[];

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
      const row = this.db.prepare(`SELECT last_read_location FROM work WHERE id = ?`).get(workId) as { last_read_location?: string } | undefined;
      return row?.last_read_location || null;
    } catch {
      return null;
    }
  }

  /**
   * Helper to map joined knowledge rows into clean domain DTOs.
   */
  private mapKnowledgeRows(rows: KnowledgeRow[]): KnowledgeItemDTO[] {
    if (!rows || rows.length === 0) return [];

    const knowledgeIds = rows.map((r) => r.id);
    const placeholders = knowledgeIds.map(() => '?').join(',');

    // Fetch tags
    const tagsMap = new Map<string, Array<{ id: string; name: string; color?: string }>>();
    try {
      const tagRows = this.db
        .prepare(
          `
        SELECT kt.knowledge_id, t.id, t.name
        FROM knowledge_tag kt
        JOIN tag t ON kt.tag_id = t.id
        WHERE kt.knowledge_id IN (${placeholders})
      `
        )
        .all(...knowledgeIds) as { knowledge_id: string; id: string; name: string; color?: string }[];

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
        .all(...knowledgeIds) as { knowledge_id: string; id: string; name: string; color?: string }[];

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
      title: r.title,
      revision: headRevision(this.db,r.id),
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
