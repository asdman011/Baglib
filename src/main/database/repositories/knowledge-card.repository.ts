/**
 * Baglib — Knowledge card repository (ADR-006)
 *
 * Saved cards only. A lookup stays transient until the user saves it, and saving
 * does not schedule a card: `srs_state` exists only for memorized cards.
 */

import { randomUUID } from 'crypto';
import type { Database } from 'better-sqlite3';
import type { CardSourceKind, KnowledgeCard, PreservedKnowledge, SaveCardInput } from '../../../shared/types/knowledge-cards';

const PAGE_SIZE = 50;

interface CardRow {
  id: string;
  front: string;
  back: string;
  sourceKind: CardSourceKind;
  sourceRef: string | null;
  sourceLabel: string | null;
  language: string | null;
  workId: string | null;
  srsState: string | null;
  createdAt: string;
}

const CARD_SELECT = `
  SELECT k.id, c.front, c.back, c.source_kind AS sourceKind, c.source_ref AS sourceRef,
    c.source_label AS sourceLabel, c.language, k.work_id AS workId, s.state AS srsState, k.created_at AS createdAt
  FROM knowledge k
  JOIN card_detail c ON c.knowledge_id = k.id
  LEFT JOIN srs_state s ON s.knowledge_id = k.id`;

const toCard = ({ srsState, ...row }: CardRow): KnowledgeCard => ({ ...row, memorizing: srsState !== null && srsState !== 'suspended' });

export class KnowledgeCardRepository {
  constructor(private db: Database) {}

  list({ search = '', offset = 0 }: { search?: string; offset?: number } = {}): KnowledgeCard[] {
    const term = `%${search.trim().replace(/[\\%_]/gu, '\\$&')}%`;
    const rows = this.db.prepare(`${CARD_SELECT}
      WHERE c.front LIKE @term ESCAPE '\\' OR c.back LIKE @term ESCAPE '\\' OR c.source_label LIKE @term ESCAPE '\\'
      ORDER BY k.created_at DESC LIMIT ${PAGE_SIZE} OFFSET @offset`).all({ term, offset: Math.max(0, Math.trunc(offset)) }) as CardRow[];
    return rows.map(toCard);
  }

  /** Saving the same text from the same source returns the existing card. */
  save(input: SaveCardInput): KnowledgeCard {
    return this.db.transaction(() => {
      const existing = this.db.prepare(`${CARD_SELECT}
        WHERE c.source_kind = ? AND c.source_ref IS ? AND c.front = ?`).get(input.sourceKind, input.sourceRef ?? null, input.front) as CardRow | undefined;
      if (existing) return toCard(existing);
      const id = randomUUID();
      const now = new Date().toISOString();
      const workExists = input.workId && this.db.prepare('SELECT 1 FROM work WHERE id = ?').get(input.workId);
      this.db.prepare(`INSERT INTO knowledge (id, work_id, knowledge_type, created_at, updated_at) VALUES (?, ?, 'card', ?, ?)`)
        .run(id, workExists ? input.workId : null, now, now);
      this.db.prepare(`INSERT INTO card_detail (knowledge_id, front, back, source_kind, source_ref, source_label, language) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.front, input.back, input.sourceKind, input.sourceRef ?? null, input.sourceLabel ?? null, input.language ?? null);
      return toCard(this.db.prepare(`${CARD_SELECT} WHERE k.id = ?`).get(id) as CardRow);
    })();
  }

  /** Notes and highlights whose book was deleted. Cards stay in the card list. */
  listPreserved(): PreservedKnowledge[] {
    return this.db.prepare(`
      SELECT id, former_work_title AS bookTitle, type, COALESCE(selected_text, note_content, '') AS text, created_at AS createdAt
      FROM annotations WHERE book_id IS NULL AND former_work_title IS NOT NULL
      UNION ALL
      SELECT k.id, k.former_work_title, k.knowledge_type, COALESCE(n.content, h.quoted_text, q.quoted_text, u.question_text, b.label, ''), k.created_at
      FROM knowledge k
      LEFT JOIN note_detail n ON n.knowledge_id = k.id
      LEFT JOIN highlight_detail h ON h.knowledge_id = k.id
      LEFT JOIN quote_detail q ON q.knowledge_id = k.id
      LEFT JOIN question_detail u ON u.knowledge_id = k.id
      LEFT JOIN bookmark_detail b ON b.knowledge_id = k.id
      WHERE k.work_id IS NULL AND k.former_work_title IS NOT NULL AND k.knowledge_type IS NOT 'card'
        -- Saving knowledge also writes an annotation with the same id.
        AND k.id NOT IN (SELECT id FROM annotations)
      ORDER BY 2, 5 DESC LIMIT 500`).all() as PreservedKnowledge[];
  }

  remove(id: string): boolean {
    return this.db.prepare(`DELETE FROM knowledge WHERE id = ? AND knowledge_type = 'card'`).run(id).changes > 0;
  }

  /** Taking a card out keeps its progress, so adding it back continues from there. */
  setMemorizing(id: string, memorizing: boolean): boolean {
    if (!this.db.prepare('SELECT 1 FROM card_detail WHERE knowledge_id = ?').get(id)) return false;
    if (!memorizing) {
      this.db.prepare(`UPDATE srs_state SET state = 'suspended' WHERE knowledge_id = ?`).run(id);
      return true;
    }
    const resumed = this.db.prepare(`UPDATE srs_state SET state = CASE WHEN reps = 0 THEN 'new' ELSE 'review' END WHERE knowledge_id = ? AND state = 'suspended'`).run(id);
    if (resumed.changes === 0) {
      this.db.prepare(`INSERT OR IGNORE INTO srs_state (knowledge_id, state, due_at) VALUES (?, 'new', ?)`).run(id, new Date().toISOString());
    }
    return true;
  }
}
