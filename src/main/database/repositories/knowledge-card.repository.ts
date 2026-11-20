/**
 * Baglib — Knowledge card repository (ADR-006)
 *
 * Saved cards only. A lookup stays transient until the user saves it, and saving
 * does not schedule a card: `srs_state` exists only for memorized cards.
 */

import { randomUUID } from 'crypto';
import { validateCardInput } from '../../../shared/types/knowledge-cards';
import { headRevision, withKnowledgeHistory, trashKnowledge } from '../../services/knowledge-history';
import type { Database } from 'better-sqlite3';
import type { CardSourceKind, KnowledgeCard, PreservedKnowledge, SaveCardInput } from '../../../shared/types/knowledge-cards';
import { SqliteSettingsRepository } from './settings.repository';

const PAGE_SIZE = 50;

interface CardRow {
  id: string;
  questionKind: KnowledgeCard["questionKind"];
  payloadJson: string | null;
  cardRevision: number;
  front: string;
  back: string;
  sourceKind: CardSourceKind;
  sourceRef: string | null;
  sourceLabel: string | null;
  language: string | null;
  workId: string | null;
  srsState: string | null;
  aiGenerated?: number;
  createdAt: string;
  noteId?: string | null;
  ord?: number | null;
}

const getCardSelect = (db: Database): string => {
  let hasNoteCols = false;
  let hasTagTables = false;
  try {
    hasNoteCols = Boolean(db.prepare("SELECT 1 FROM pragma_table_info('card_detail') WHERE name='note_id'").get());
    hasTagTables = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='knowledge_tag'").get());
  } catch {}
  const noteCols = hasNoteCols ? 'c.note_id AS noteId, c.ord AS ord' : 'NULL AS noteId, NULL AS ord';
  const aiGenCol = hasTagTables
    ? "EXISTS (SELECT 1 FROM knowledge_tag kt JOIN tag tg ON tg.id = kt.tag_id WHERE kt.knowledge_id = k.id AND tg.name = 'ai-generated') AS aiGenerated"
    : '0 AS aiGenerated';
  return `
  SELECT k.id, c.question_kind AS questionKind, c.payload_json AS payloadJson,
    (SELECT COALESCE(MAX(revision),0) FROM entity_version WHERE entity_type='knowledge' AND entity_id=k.id) AS cardRevision,
    c.front, c.back, c.source_kind AS sourceKind, c.source_ref AS sourceRef,
    c.source_label AS sourceLabel, c.language, k.work_id AS workId, s.state AS srsState, ${aiGenCol}, k.created_at AS createdAt,
    ${noteCols}
  FROM knowledge k
  JOIN card_detail c ON c.knowledge_id = k.id
  LEFT JOIN srs_state s ON s.knowledge_id = k.id`;
};

const toCard = ({ srsState, payloadJson, aiGenerated, ...row }: CardRow): KnowledgeCard => ({ ...row, payload: payloadJson ? JSON.parse(payloadJson) : null, memorizing: srsState !== null && srsState !== 'suspended', ...(aiGenerated ? { aiGenerated: true } : {}) });

export class KnowledgeCardRepository {
  private settings: SqliteSettingsRepository;
  constructor(private db: Database) {
    this.settings = new SqliteSettingsRepository(db);
  }

  list({ search = '', offset = 0 }: { search?: string; offset?: number } = {}): KnowledgeCard[] {
    const term = `%${search.trim().replace(/[\\%_]/gu, '\\$&')}%`;
    const rows = this.db.prepare(`${getCardSelect(this.db)}
      WHERE k.deleted_at IS NULL AND (c.front LIKE @term ESCAPE '\\' OR c.back LIKE @term ESCAPE '\\' OR c.source_label LIKE @term ESCAPE '\\')
      ORDER BY k.created_at DESC LIMIT ${PAGE_SIZE} OFFSET @offset`).all({ term, offset: Math.max(0, Math.trunc(offset)) }) as CardRow[];
    return rows.map(toCard);
  }

  /** Saving the same text from the same source returns the existing card. */
  save(input: SaveCardInput): KnowledgeCard {
    input=validateCardInput(input);
    return this.db.transaction(() => {
      const existing = this.db.prepare(`${getCardSelect(this.db)}
        WHERE k.deleted_at IS NULL AND c.source_kind = ? AND c.source_ref IS ? AND c.front = ? AND c.question_kind=? AND c.payload_json IS ?`).get(input.sourceKind, input.sourceRef ?? null, input.front,input.questionKind??'recall',input.payload?JSON.stringify(input.payload):null) as CardRow | undefined;
      if (existing) return toCard(existing);
      const id = randomUUID();
      const now = new Date().toISOString();
      const workExists = input.workId && this.db.prepare('SELECT 1 FROM work WHERE id = ?').get(input.workId);

      // Check if card_note table exists (migration 030)
      const hasCardNote = Boolean(this.db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='card_note'`).get());
      let noteId: string | null = null;
      if (hasCardNote) {
        noteId = randomUUID();
        const noteTypeId = input.questionKind === 'choice' ? 'stock-multiple-choice' : 'stock-basic';
        const fields = JSON.stringify({ Front: input.front, Back: input.back });
        const isSourceText = ['quran', 'hadith', 'poetry'].includes(input.sourceKind);
        const snapshot = isSourceText ? fields : null;
        this.db.prepare(`INSERT INTO card_note (id, note_type_id, fields_json, guid, source_ref, source_snapshot_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(noteId, noteTypeId, fields, id, input.sourceRef ?? null, snapshot, now, now);
      }

      withKnowledgeHistory(this.db,[id],'create',()=>{
      this.db.prepare(`INSERT INTO knowledge (id, work_id, knowledge_type, created_at, updated_at) VALUES (?, ?, 'card', ?, ?)`)
        .run(id, workExists ? input.workId : null, now, now);
      if (hasCardNote) {
        this.db.prepare(`INSERT INTO card_detail (knowledge_id, front, back, source_kind, source_ref, source_label, language, question_kind, payload_json, note_id, ord) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, input.front, input.back, input.sourceKind, input.sourceRef ?? null, input.sourceLabel ?? null, input.language ?? null, input.questionKind ?? 'recall', input.payload ? JSON.stringify(input.payload) : null, noteId, noteId ? 0 : null);
      } else {
        this.db.prepare(`INSERT INTO card_detail (knowledge_id, front, back, source_kind, source_ref, source_label, language, question_kind, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, input.front, input.back, input.sourceKind, input.sourceRef ?? null, input.sourceLabel ?? null, input.language ?? null, input.questionKind ?? 'recall', input.payload ? JSON.stringify(input.payload) : null);
      }
      });
      if (input.tags?.length) {
        const hasTagTables = Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='knowledge_tag'").get());
        if (hasTagTables) {
          const findTag = this.db.prepare('SELECT id FROM tag WHERE name = ?');
          const insertTag = this.db.prepare("INSERT OR IGNORE INTO tag (id, name, origin) VALUES (?, ?, 'manual')");
          const linkTag = this.db.prepare('INSERT OR IGNORE INTO knowledge_tag (knowledge_id, tag_id) VALUES (?, ?)');
          for (const rawTag of input.tags) {
            const name = rawTag.trim();
            if (!name) continue;
            const existingTag = findTag.get(name) as { id: string } | undefined;
            const tagId = existingTag?.id ?? randomUUID();
            if (!existingTag) insertTag.run(tagId, name);
            linkTag.run(id, tagId);
          }
        }
      }
      return toCard(this.db.prepare(`${getCardSelect(this.db)} WHERE k.id = ?`).get(id) as CardRow);
    })();
  }

  update(id: string, input: SaveCardInput, expectedRevision: number): KnowledgeCard {
    input=validateCardInput(input);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision<0) throw new Error('invalid-request');
    const protectSourceText = this.settings.get<boolean>('revision.protectSourceText', false) ?? false;
    withKnowledgeHistory(this.db,[id],'edit',()=>{
      const row=this.db.prepare(`${getCardSelect(this.db)} WHERE k.id=? AND k.deleted_at IS NULL`).get(id) as CardRow|undefined;
      if(!row || headRevision(this.db,id)!==expectedRevision) throw new Error('history-conflict');
      if(protectSourceText && ['quran','hadith','poetry'].includes(row.sourceKind)) throw new Error('invalid-request');
      this.db.prepare('UPDATE card_detail SET front=?,back=?,question_kind=?,payload_json=? WHERE knowledge_id=?').run(input.front,input.back,input.questionKind??'recall',input.payload?JSON.stringify(input.payload):null,id);

      // If card has a note attached, update note fields
      if (row.noteId) {
        const hasCardNote = Boolean(this.db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='card_note'`).get());
        if (hasCardNote) {
          const noteRow = this.db.prepare('SELECT fields_json FROM card_note WHERE id=?').get(row.noteId) as { fields_json: string } | undefined;
          if (noteRow) {
            try {
              const f = JSON.parse(noteRow.fields_json);
              f.Front = input.front;
              f.Back = input.back;
              this.db.prepare('UPDATE card_note SET fields_json=?, updated_at=? WHERE id=?').run(JSON.stringify(f), new Date().toISOString(), row.noteId);
            } catch {}
          }
        }
      }

      return id;
    },{id,revision:expectedRevision});
    return this.get(id);
  }
  private get(id:string):KnowledgeCard { return toCard(this.db.prepare(`${getCardSelect(this.db)} WHERE k.id=?`).get(id) as CardRow); }

  /** Notes and highlights whose book was deleted. Cards stay in the card list. */
  listPreserved(): PreservedKnowledge[] {
    return this.db.prepare(`
      SELECT id, former_work_title AS bookTitle, type, COALESCE(selected_text, note_content, '') AS text, created_at AS createdAt
      FROM annotations WHERE book_id IS NULL AND former_work_title IS NOT NULL
      UNION ALL
      SELECT k.id, k.former_work_title, k.knowledge_type, COALESCE(s.content,r.review,n.content, h.quoted_text, q.quoted_text, u.question_text, b.label, ''), k.created_at
      FROM knowledge k
      LEFT JOIN note_detail n ON n.knowledge_id = k.id
      LEFT JOIN study_note_detail s ON s.knowledge_id=k.id
      LEFT JOIN reading_reflection_detail r ON r.knowledge_id=k.id
      LEFT JOIN highlight_detail h ON h.knowledge_id = k.id
      LEFT JOIN quote_detail q ON q.knowledge_id = k.id
      LEFT JOIN question_detail u ON u.knowledge_id = k.id
      LEFT JOIN bookmark_detail b ON b.knowledge_id = k.id
      WHERE k.work_id IS NULL AND k.deleted_at IS NULL AND k.former_work_title IS NOT NULL AND k.knowledge_type IS NOT 'card'
        -- Saving knowledge also writes an annotation with the same id.
        AND k.id NOT IN (SELECT id FROM annotations)
      ORDER BY 2, 5 DESC LIMIT 500`).all() as PreservedKnowledge[];
  }

  remove(id: string): boolean {
    if (!this.db.prepare('SELECT 1 FROM card_detail WHERE knowledge_id=?').get(id)) return false;
    return trashKnowledge(this.db,id);
  }

  /** Taking a card out keeps its progress, so adding it back continues from there. */
  setMemorizing(id: string, memorizing: boolean): boolean {
    if (!this.db.prepare('SELECT 1 FROM card_detail c JOIN knowledge k ON k.id=c.knowledge_id WHERE c.knowledge_id = ? AND k.deleted_at IS NULL').get(id)) return false;
    const hasDeckTable = Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='deck'").get());
    const now = new Date().toISOString();

    return this.db.transaction(() => {
      if (!memorizing) {
        if (hasDeckTable) {
          this.db.prepare(`DELETE FROM deck_card WHERE deck_id = 'memorization' AND knowledge_id = ?`).run(id);
        }
        this.db.prepare(`UPDATE srs_state SET state = 'suspended' WHERE knowledge_id = ?`).run(id);
        return true;
      }

      let nextPos = 1;
      if (hasDeckTable) {
        this.db.prepare(`INSERT OR IGNORE INTO srs_preset (id, name, created_at, updated_at) VALUES ('default', 'Default', ?, ?)`).run(now, now);
        this.db.prepare(`INSERT OR IGNORE INTO deck (id, name, parent_id, kind, preset_id, created_at, updated_at) VALUES ('memorization', 'Memorization', NULL, 'normal', 'default', ?, ?)`).run(now, now);
        const maxPos = (this.db.prepare(`SELECT COALESCE(MAX(position), 0) AS maxPos FROM deck_card WHERE deck_id = 'memorization'`).get() as { maxPos: number }).maxPos;
        nextPos = maxPos + 1;
        this.db.prepare(`INSERT OR IGNORE INTO deck_card (deck_id, knowledge_id, position, added_at) VALUES ('memorization', ?, ?, ?)`).run(id, nextPos, now);
      }

      let resumeState = 'review';
      const previous = this.db.prepare('SELECT state_before FROM srs_review_log WHERE knowledge_id=? ORDER BY reviewed_at DESC,rowid DESC LIMIT 1').get(id) as { state_before: string | null } | undefined;
      if (previous?.state_before) {
        try {
          const state = JSON.parse(previous.state_before).after?.state;
          if (state === 1) resumeState = 'learning';
          if (state === 3) resumeState = 'relearning';
        } catch {}
      }
      const resumed = this.db.prepare(`UPDATE srs_state SET state = CASE WHEN reps = 0 THEN 'new' ELSE ? END WHERE knowledge_id = ? AND state = 'suspended'`).run(resumeState, id);
      if (resumed.changes === 0) {
        const hasNewPos = Boolean(this.db.prepare("SELECT 1 FROM pragma_table_info('srs_state') WHERE name='new_position'").get());
        if (hasNewPos) {
          this.db.prepare(`INSERT OR IGNORE INTO srs_state (knowledge_id, state, due_at, learning_step, new_position) VALUES (?, 'new', ?, 0, ?)`).run(id, now, nextPos);
        } else {
          this.db.prepare(`INSERT OR IGNORE INTO srs_state (knowledge_id, state, due_at) VALUES (?, 'new', ?)`).run(id, now);
        }
      }
      return true;
    })();
  }
}
