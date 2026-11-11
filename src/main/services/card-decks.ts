import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { KnowledgeCardRepository } from '../database/repositories/knowledge-card.repository';
import type { CardDeck, DeckInput, DeckResult, SaveCardInput } from '../../shared/types/knowledge-cards';

const MAX_CARD_TEXT = 20_000;
const firstLine = (text: string) => text.trim().split('\n')[0].slice(0, 300);

interface NoteRow { id: string; workId: string | null; location: string | null; text: string | null; title: string | null; book: string | null }
interface PassageRow { id: string; workId: string | null; location: string | null; text: string | null; context: string | null; book: string | null }
interface ExportRow { id: string; front: string; back: string; sourceKind: string; sourceLabel: string | null }

/** Anki quotes a field that holds a tab, a newline or a quote, and doubles any quote inside it. */
const ankiField = (value: string) => /[\t\r\n"]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/** Text goes into the file unchanged, so diacritics stay exact. The id keeps re-imports from duplicating. */
export function ankiText(name: string, rows: ExportRow[]): string {
  const header = ['#separator:Tab', '#html:false', '#notetype:Basic', `#deck:${name.replace(/\s+/gu, ' ').trim()}`, '#guid column:1', '#tags column:4'];
  const lines = rows.map(row => [row.id, row.front, row.sourceLabel ? `${row.back}\n\n— ${row.sourceLabel}` : row.back, `baglib ${row.sourceKind}`].map(ankiField).join('\t'));
  return `${[...header, ...lines].join('\n')}\n`;
}

/** A deck is a `collection` of cards, so generated cards reuse the card and review tables. */
export class CardDeckService {
  private cards: KnowledgeCardRepository;
  constructor(private db: Database) { this.cards = new KnowledgeCardRepository(db); }

  list(): CardDeck[] {
    return this.db.prepare(`SELECT c.id, c.name, COUNT(k.id) AS cards FROM collection c
      LEFT JOIN knowledge_collection j ON j.collection_id = c.id
      LEFT JOIN knowledge k ON k.id = j.knowledge_id AND k.deleted_at IS NULL AND k.knowledge_type = 'card'
      WHERE c.collection_type = 'deck' GROUP BY c.id ORDER BY c.name`).all() as CardDeck[];
  }

  private fromNotes(): SaveCardInput[] {
    const rows = this.db.prepare(`SELECT k.id, k.work_id AS workId, k.location, COALESCE(s.content, n.content) AS text, s.title, COALESCE(w.title, k.former_work_title) AS book
      FROM knowledge k LEFT JOIN note_detail n ON n.knowledge_id = k.id LEFT JOIN study_note_detail s ON s.knowledge_id = k.id LEFT JOIN work w ON w.id = k.work_id
      WHERE k.knowledge_type IN ('note', 'study_note') AND k.deleted_at IS NULL ORDER BY k.created_at`).all() as NoteRow[];
    return rows.filter(row => row.text?.trim()).map(row => ({
      front: row.title?.trim() || (row.book ? `${row.book} · ${row.location}` : firstLine(row.text!)),
      back: row.text!, sourceKind: 'note', sourceRef: `note:${row.id}`, sourceLabel: row.book ?? undefined, workId: row.workId ?? undefined,
    }));
  }

  private fromPassages(): SaveCardInput[] {
    const rows = this.db.prepare(`SELECT k.id, k.work_id AS workId, k.location, COALESCE(h.quoted_text, q.quoted_text) AS text, q.context_note AS context, COALESCE(w.title, k.former_work_title) AS book
      FROM knowledge k LEFT JOIN highlight_detail h ON h.knowledge_id = k.id LEFT JOIN quote_detail q ON q.knowledge_id = k.id LEFT JOIN work w ON w.id = k.work_id
      WHERE k.knowledge_type IN ('highlight', 'quote') AND k.deleted_at IS NULL ORDER BY k.created_at`).all() as PassageRow[];
    return rows.filter(row => row.text?.trim()).map(row => ({
      front: row.book ? `${row.book} · ${row.location}` : firstLine(row.context || row.text!),
      back: row.text!, sourceKind: row.location?.startsWith('poetry:') ? 'poetry' : 'book', sourceRef: `knowledge:${row.id}`, sourceLabel: row.book ?? undefined, workId: row.workId ?? undefined,
    }));
  }

  /** KEY-318: cards built by the caller (for example one per ayah), saved and linked into the named deck. */
  generateFromDrafts(name: string, drafts: SaveCardInput[], memorize: boolean): DeckResult {
    return this.db.transaction(() => {
      const deckId = this.deckId(name);
      const fits = drafts.filter(draft => draft.front.length <= MAX_CARD_TEXT && draft.back.length <= MAX_CARD_TEXT);
      return this.link(deckId, fits.map(draft => this.cards.save(draft).id), memorize, drafts.length - fits.length);
    })();
  }

  private deckId(name: string): string {
    const existing = this.db.prepare(`SELECT id FROM collection WHERE collection_type = 'deck' AND name = ?`).get(name) as { id: string } | undefined;
    const deckId = existing?.id ?? randomUUID();
    if (!existing) this.db.prepare(`INSERT INTO collection (id, name, collection_type) VALUES (?, ?, 'deck')`).run(deckId, name);
    return deckId;
  }

  private link(deckId: string, cardIds: string[], memorize: boolean, skipped: number): DeckResult {
    const link = this.db.prepare(`INSERT OR IGNORE INTO knowledge_collection (knowledge_id, collection_id) VALUES (?, ?)`);
    let added = 0;
    for (const id of new Set(cardIds)) {
      added += link.run(id, deckId).changes;
      if (memorize) this.cards.setMemorizing(id, true);
    }
    return { deck: this.list().find(deck => deck.id === deckId)!, added, skipped };
  }

  generate(input: DeckInput): DeckResult {
    return this.db.transaction(() => {
      const deckId = this.deckId(input.name);
      const drafts = [...(input.sources.includes('notes') ? this.fromNotes() : []), ...(input.sources.includes('highlights') ? this.fromPassages() : [])];
      const saved = this.db.prepare(`SELECT c.knowledge_id AS id FROM card_detail c JOIN knowledge k ON k.id = c.knowledge_id
        WHERE k.deleted_at IS NULL AND c.source_kind IN (SELECT value FROM json_each(?))`).all(JSON.stringify(input.sources.filter(source => source !== 'notes' && source !== 'highlights'))) as { id: string }[];
      const fits = drafts.filter(draft => draft.front.length <= MAX_CARD_TEXT && draft.back.length <= MAX_CARD_TEXT);
      return this.link(deckId, [...saved.map(row => row.id), ...fits.map(draft => this.cards.save(draft).id)], input.memorize, drafts.length - fits.length);
    })();
  }

  exportText(deckId: string): { name: string; text: string } {
    const deck = this.list().find(item => item.id === deckId);
    if (!deck) throw new Error('invalid-request');
    const rows = this.db.prepare(`SELECT k.id, c.front, c.back, c.source_kind AS sourceKind, c.source_label AS sourceLabel FROM knowledge_collection j
      JOIN knowledge k ON k.id = j.knowledge_id JOIN card_detail c ON c.knowledge_id = k.id
      WHERE j.collection_id = ? AND k.deleted_at IS NULL ORDER BY k.created_at, k.id`).all(deckId) as ExportRow[];
    return { name: deck.name, text: ankiText(deck.name, rows) };
  }
}
