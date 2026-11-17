import type { Database } from 'better-sqlite3';
import { KnowledgeCardRepository } from '../database/repositories/knowledge-card.repository';
import { DeckRepository } from '../database/repositories/deck.repository';
import { MEMORIZATION_DECK_ID } from '../database/migrations/031_decks_and_scheduler';
import type { CardDeck, DeckInput, DeckResult, SaveCardInput } from '../../shared/types/knowledge-cards';
import { mediaNameFromImageField } from '../../shared/revision/image-occlusion';

const MAX_CARD_TEXT = 20_000;
const firstLine = (text: string) => text.trim().split('\n')[0].slice(0, 300);

interface NoteRow {
  id: string;
  workId: string | null;
  location: string | null;
  text: string | null;
  title: string | null;
  book: string | null;
}
interface PassageRow {
  id: string;
  workId: string | null;
  location: string | null;
  text: string | null;
  context: string | null;
  book: string | null;
}
interface ExportRow {
  id: string;
  front: string;
  back: string;
  sourceKind: string;
  sourceLabel: string | null;
}

/** Anki quotes a field that holds a tab, a newline or a quote, and doubles any quote inside it. */
const ankiField = (value: string) =>
  /[\t\r\n"]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export interface ImageOcclusionExportNote {
  guid: string;
  fields: Record<string, string>;
}

/**
 * Image occlusion notes in Anki's text-import format (KEY-391): Anki's own "Image Occlusion" note
 * type, with its fields in Anki's order and HTML kept, so the masks Anki draws are the ones BagLib
 * draws. Anki's text import doesn't carry media, so the images are written next to the file.
 */
export function ankiImageOcclusionText(name: string, notes: ImageOcclusionExportNote[]): string {
  const header = [
    '#separator:Tab',
    '#html:true',
    '#notetype:Image Occlusion',
    `#deck:${name.replace(/\s+/gu, ' ').trim()}`,
    '#guid column:1',
    '#tags column:7',
  ];
  const lines = notes.map(note =>
    [note.guid, note.fields.Occlusion ?? '', note.fields.Image ?? '', note.fields.Header ?? '', note.fields['Back Extra'] ?? '', note.fields.Comments ?? '', 'baglib image-occlusion']
      .map(ankiField)
      .join('\t')
  );
  return `${[...header, ...lines].join('\n')}\n`;
}

/** Text goes into the file unchanged, so diacritics stay exact. The id keeps re-imports from duplicating. */
export function ankiText(name: string, rows: ExportRow[]): string {
  const header = [
    '#separator:Tab',
    '#html:false',
    '#notetype:Basic',
    `#deck:${name.replace(/\s+/gu, ' ').trim()}`,
    '#guid column:1',
    '#tags column:4',
  ];
  const lines = rows.map(row =>
    [
      row.id,
      row.front,
      row.sourceLabel ? `${row.back}\n\n— ${row.sourceLabel}` : row.back,
      `baglib ${row.sourceKind}`,
    ]
      .map(ankiField)
      .join('\t')
  );
  return `${[...header, ...lines].join('\n')}\n`;
}

/** Decks live in the dedicated `deck` and `deck_card` tables (ADR-017 / migration 031). */
export class CardDeckService {
  private cards: KnowledgeCardRepository;
  private deckRepo: DeckRepository;

  constructor(private db: Database) {
    this.cards = new KnowledgeCardRepository(db);
    this.deckRepo = new DeckRepository(db);
  }

  list(): CardDeck[] {
    const allDecks = this.deckRepo.listDecks();
    const counts = new Map<string, number>();
    const countRows = this.db
      .prepare(
        `SELECT dc.deck_id AS deckId, COUNT(k.id) AS cards
         FROM deck_card dc
         JOIN knowledge k ON k.id = dc.knowledge_id AND k.deleted_at IS NULL AND k.knowledge_type = 'card'
         GROUP BY dc.deck_id`
      )
      .all() as Array<{ deckId: string; cards: number }>;

    for (const row of countRows) {
      counts.set(row.deckId, row.cards);
    }

    return allDecks
      .filter(d => d.kind === 'normal' && (d.id !== MEMORIZATION_DECK_ID || (counts.get(d.id) ?? 0) > 0))
      .map(d => ({
        id: d.id,
        name: d.fullName,
        cards: counts.get(d.id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private fromNotes(): SaveCardInput[] {
    const rows = this.db
      .prepare(
        `SELECT k.id, k.work_id AS workId, k.location, COALESCE(s.content, n.content) AS text, s.title, COALESCE(w.title, k.former_work_title) AS book
         FROM knowledge k
         LEFT JOIN note_detail n ON n.knowledge_id = k.id
         LEFT JOIN study_note_detail s ON s.knowledge_id = k.id
         LEFT JOIN work w ON w.id = k.work_id
         WHERE k.knowledge_type IN ('note', 'study_note') AND k.deleted_at IS NULL
         ORDER BY k.created_at`
      )
      .all() as NoteRow[];
    return rows
      .filter(row => row.text?.trim())
      .map(row => ({
        front: row.title?.trim() || (row.book ? `${row.book} · ${row.location}` : firstLine(row.text!)),
        back: row.text!,
        sourceKind: 'note',
        sourceRef: `note:${row.id}`,
        sourceLabel: row.book ?? undefined,
        workId: row.workId ?? undefined,
      }));
  }

  private fromPassages(): SaveCardInput[] {
    const rows = this.db
      .prepare(
        `SELECT k.id, k.work_id AS workId, k.location, COALESCE(h.quoted_text, q.quoted_text) AS text, q.context_note AS context, COALESCE(w.title, k.former_work_title) AS book
         FROM knowledge k
         LEFT JOIN highlight_detail h ON h.knowledge_id = k.id
         LEFT JOIN quote_detail q ON q.knowledge_id = k.id
         LEFT JOIN work w ON w.id = k.work_id
         WHERE k.knowledge_type IN ('highlight', 'quote') AND k.deleted_at IS NULL
         ORDER BY k.created_at`
      )
      .all() as PassageRow[];
    return rows
      .filter(row => row.text?.trim())
      .map(row => ({
        front: row.book ? `${row.book} · ${row.location}` : firstLine(row.context || row.text!),
        back: row.text!,
        sourceKind: row.location?.startsWith('poetry:') ? 'poetry' : 'book',
        sourceRef: `knowledge:${row.id}`,
        sourceLabel: row.book ?? undefined,
        workId: row.workId ?? undefined,
      }));
  }

  /** KEY-318: cards built by the caller (for example one per ayah), saved and linked into the named deck. */
  generateFromDrafts(name: string, drafts: SaveCardInput[], memorize: boolean): DeckResult {
    return this.db.transaction(() => {
      const deckId = this.deckId(name);
      const fits = drafts.filter(
        draft => draft.front.length <= MAX_CARD_TEXT && draft.back.length <= MAX_CARD_TEXT
      );
      return this.link(
        deckId,
        fits.map(draft => this.cards.save(draft).id),
        memorize,
        drafts.length - fits.length
      );
    })();
  }

  private deckId(name: string): string {
    const existingById = this.deckRepo.getDeck(name);
    if (existingById && existingById.kind === 'normal') return existingById.id;
    return this.deckRepo.findOrCreateByPath(name).id;
  }

  private link(deckId: string, cardIds: string[], memorize: boolean, skipped: number): DeckResult {
    const added = this.deckRepo.addCardsToDeck(deckId, cardIds, memorize);
    const deckItem = this.deckRepo.getDeck(deckId)!;
    const count = (
      this.db
        .prepare(
          `SELECT COUNT(k.id) AS count
           FROM deck_card dc
           JOIN knowledge k ON k.id = dc.knowledge_id AND k.deleted_at IS NULL AND k.knowledge_type = 'card'
           WHERE dc.deck_id = ?`
        )
        .get(deckId) as { count: number }
    ).count;

    return {
      deck: { id: deckItem.id, name: deckItem.fullName, cards: count },
      added,
      skipped,
    };
  }

  generate(input: DeckInput): DeckResult {
    return this.db.transaction(() => {
      const deckId = this.deckId(input.name);
      const drafts = [
        ...(input.sources.includes('notes') ? this.fromNotes() : []),
        ...(input.sources.includes('highlights') ? this.fromPassages() : []),
      ];
      const saved = this.db
        .prepare(
          `SELECT c.knowledge_id AS id
           FROM card_detail c
           JOIN knowledge k ON k.id = c.knowledge_id
           WHERE k.deleted_at IS NULL
             AND c.source_kind IN (SELECT value FROM json_each(?))`
        )
        .all(
          JSON.stringify(
            input.sources.filter(source => source !== 'notes' && source !== 'highlights')
          )
        ) as { id: string }[];
      const fits = drafts.filter(
        draft => draft.front.length <= MAX_CARD_TEXT && draft.back.length <= MAX_CARD_TEXT
      );
      return this.link(
        deckId,
        [...saved.map(row => row.id), ...fits.map(draft => this.cards.save(draft).id)],
        input.memorize,
        drafts.length - fits.length
      );
    })();
  }

  exportText(deckId: string): {
    name: string;
    text: string;
    imageOcclusion: { text: string; media: string[] } | null;
  } {
    const deck = this.deckRepo.getDeck(deckId);
    if (!deck || deck.kind !== 'normal') throw new Error('invalid-request');

    const rows = this.db
      .prepare(
        `SELECT k.id, c.front, c.back, c.source_kind AS sourceKind, c.source_label AS sourceLabel,
                n.guid AS noteGuid, n.fields_json AS noteFields, t.kind AS noteKind
         FROM deck_card j
         JOIN knowledge k ON k.id = j.knowledge_id
         JOIN card_detail c ON c.knowledge_id = k.id
         LEFT JOIN card_note n ON n.id = c.note_id
         LEFT JOIN card_note_type t ON t.id = n.note_type_id
         WHERE j.deck_id = ? AND k.deleted_at IS NULL
         ORDER BY j.position ASC, k.created_at ASC, k.id ASC`
      )
      .all(deckId) as Array<ExportRow & { noteGuid: string | null; noteFields: string | null; noteKind: string | null }>;

    // Image occlusion notes go to their own file, once per note (one note makes several cards).
    const occlusion = new Map<string, ImageOcclusionExportNote>();
    const basic: ExportRow[] = [];
    for (const row of rows) {
      if (row.noteKind === 'image_occlusion' && row.noteGuid && row.noteFields) {
        if (!occlusion.has(row.noteGuid)) {
          occlusion.set(row.noteGuid, { guid: row.noteGuid, fields: JSON.parse(row.noteFields) as Record<string, string> });
        }
      } else {
        basic.push({ id: row.id, front: row.front, back: row.back, sourceKind: row.sourceKind, sourceLabel: row.sourceLabel });
      }
    }
    const notes = [...occlusion.values()];
    const media = [...new Set(notes.map(n => mediaNameFromImageField(n.fields.Image ?? '')).filter((m): m is string => !!m))];
    return {
      name: deck.fullName,
      text: ankiText(deck.fullName, basic),
      imageOcclusion: notes.length ? { text: ankiImageOcclusionText(deck.fullName, notes), media } : null,
    };
  }
}
