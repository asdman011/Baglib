/**
 * Baglib — Card Note Repository (ADR-017 / KEY-390)
 *
 * Implements repositories for note types, fields, templates and notes,
 * card generation, fork-on-edit for shared cards, and source text restoration.
 */

import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { generateCards } from '../../../shared/revision/template-engine';
import type {
  CardNote,
  CardNoteType,
  NoteTypeKind,
  SaveNoteInput,
} from '../../../shared/types/card-notes';
import type { KnowledgeCard } from '../../../shared/types/knowledge-cards';
import { withKnowledgeHistory, headRevision } from '../../services/knowledge-history';
import { SqliteSettingsRepository } from './settings.repository';

const MAX_FIELD_LENGTH = 20_000;

interface NoteTypeRow {
  id: string;
  name: string;
  kind: NoteTypeKind;
  stock_kind: string | null;
  css: string;
  sort_field_ord: number;
  anki_id: number | null;
  anki_extra: string | null;
  created_at: string;
  updated_at: string;
}

interface NoteFieldRow {
  note_type_id: string;
  ord: number;
  name: string;
  rtl: number;
  font: string | null;
  size_px: number | null;
  source_text: number;
  anki_id: number | null;
}

interface NoteTemplateRow {
  note_type_id: string;
  ord: number;
  name: string;
  front: string;
  back: string;
  anki_id: number | null;
}

interface NoteRow {
  id: string;
  note_type_id: string;
  fields_json: string;
  guid: string;
  copied_from_note_id: string | null;
  source_ref: string | null;
  source_snapshot_json: string | null;
  source_hash: string | null;
  source_changed_at: string | null;
  orphaned_at: string | null;
  anki_id: number | null;
  anki_extra: string | null;
  created_at: string;
  updated_at: string;
}

interface CardDetailRow {
  knowledge_id: string;
  note_id: string | null;
  ord: number | null;
  front: string;
  back: string;
  source_kind: string;
  source_ref: string | null;
  source_label: string | null;
  language: string | null;
  question_kind: string;
  payload_json: string | null;
  srsState: string | null;
  created_at: string;
  work_id: string | null;
}

export class CardNoteRepository {
  private settings: SqliteSettingsRepository;

  constructor(private db: Database) {
    this.settings = new SqliteSettingsRepository(db);
  }

  /* -------------------------------------------------------------------------- */
  /*                             NOTE TYPES API                                 */
  /* -------------------------------------------------------------------------- */

  listNoteTypes(): CardNoteType[] {
    const rows = this.db.prepare(`SELECT * FROM card_note_type ORDER BY name ASC`).all() as NoteTypeRow[];
    return rows.map(r => this.hydrateNoteType(r));
  }

  getNoteType(id: string): CardNoteType | null {
    const row = this.db.prepare(`SELECT * FROM card_note_type WHERE id = ?`).get(id) as NoteTypeRow | undefined;
    return row ? this.hydrateNoteType(row) : null;
  }

  private hydrateNoteType(row: NoteTypeRow): CardNoteType {
    const fields = this.db
      .prepare(`SELECT * FROM card_note_field WHERE note_type_id = ? ORDER BY ord ASC`)
      .all(row.id) as NoteFieldRow[];
    const templates = this.db
      .prepare(`SELECT * FROM card_note_template WHERE note_type_id = ? ORDER BY ord ASC`)
      .all(row.id) as NoteTemplateRow[];

    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      stockKind: row.stock_kind,
      css: row.css,
      sortFieldOrd: row.sort_field_ord,
      ankiId: row.anki_id,
      ankiExtra: row.anki_extra,
      fields: fields.map(f => ({
        noteTypeId: f.note_type_id,
        ord: f.ord,
        name: f.name,
        rtl: Boolean(f.rtl),
        font: f.font,
        sizePx: f.size_px,
        sourceText: Boolean(f.source_text),
        ankiId: f.anki_id,
      })),
      templates: templates.map(t => ({
        noteTypeId: t.note_type_id,
        ord: t.ord,
        name: t.name,
        front: t.front,
        back: t.back,
        ankiId: t.anki_id,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  saveNoteType(input: {
    id?: string;
    name: string;
    kind?: NoteTypeKind;
    stockKind?: string | null;
    css?: string;
    sortFieldOrd?: number;
    fields: Array<{
      ord?: number;
      name: string;
      rtl?: boolean;
      font?: string | null;
      sizePx?: number | null;
      sourceText?: boolean;
    }>;
    templates: Array<{
      ord?: number;
      name: string;
      front: string;
      back: string;
    }>;
  }): CardNoteType {
    const now = new Date().toISOString();
    return this.db.transaction(() => {
      let id = input.id;
      if (!id) {
        id = randomUUID();
        this.db
          .prepare(
            `INSERT INTO card_note_type (id, name, kind, stock_kind, css, sort_field_ord, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            id,
            input.name.trim(),
            input.kind ?? 'normal',
            input.stockKind ?? null,
            input.css ?? '',
            input.sortFieldOrd ?? 0,
            now,
            now
          );
      } else {
        // Prevent editing built-ins kind/stockKind
        this.db
          .prepare(
            `UPDATE card_note_type SET name = ?, css = ?, sort_field_ord = ?, updated_at = ? WHERE id = ?`
          )
          .run(input.name.trim(), input.css ?? '', input.sortFieldOrd ?? 0, now, id);

        // Delete existing fields and templates for replacement
        this.db.prepare(`DELETE FROM card_note_field WHERE note_type_id = ?`).run(id);
        this.db.prepare(`DELETE FROM card_note_template WHERE note_type_id = ?`).run(id);
      }

      const insertField = this.db.prepare(`
        INSERT INTO card_note_field (note_type_id, ord, name, rtl, font, size_px, source_text)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      input.fields.forEach((f, idx) => {
        insertField.run(id, f.ord ?? idx, f.name.trim(), f.rtl ? 1 : 0, f.font ?? null, f.sizePx ?? null, f.sourceText ? 1 : 0);
      });

      const insertTemplate = this.db.prepare(`
        INSERT INTO card_note_template (note_type_id, ord, name, front, back)
        VALUES (?, ?, ?, ?, ?)
      `);
      input.templates.forEach((t, idx) => {
        insertTemplate.run(id, t.ord ?? idx, t.name.trim(), t.front, t.back);
      });

      return this.getNoteType(id)!;
    })();
  }

  deleteNoteType(id: string): boolean {
    const nt = this.getNoteType(id);
    if (!nt) return false;
    if (nt.stockKind) {
      throw new Error('Cannot delete built-in note type');
    }
    const noteCount = (this.db.prepare(`SELECT COUNT(*) as count FROM card_note WHERE note_type_id = ?`).get(id) as { count: number }).count;
    if (noteCount > 0) {
      throw new Error('Cannot delete note type that still has notes');
    }
    this.db.prepare(`DELETE FROM card_note_type WHERE id = ?`).run(id);
    return true;
  }

  /* -------------------------------------------------------------------------- */
  /*                               NOTES API                                    */
  /* -------------------------------------------------------------------------- */

  getNote(id: string): CardNote | null {
    const row = this.db.prepare(`SELECT * FROM card_note WHERE id = ?`).get(id) as NoteRow | undefined;
    return row ? this.hydrateNote(row) : null;
  }

  getNoteByGuid(guid: string): CardNote | null {
    const row = this.db.prepare(`SELECT * FROM card_note WHERE guid = ?`).get(guid) as NoteRow | undefined;
    return row ? this.hydrateNote(row) : null;
  }

  listNotes({
    deckId,
    noteTypeId,
    search,
    offset = 0,
    limit = 50,
  }: {
    deckId?: string;
    noteTypeId?: string;
    search?: string;
    offset?: number;
    limit?: number;
  } = {}): CardNote[] {
    let sql = `SELECT * FROM card_note WHERE 1=1`;
    const params: unknown[] = [];
    if (deckId) {
      sql += ` AND EXISTS (
        SELECT 1 FROM card_detail c
        JOIN deck_card dc ON dc.knowledge_id = c.knowledge_id
        WHERE c.note_id = card_note.id AND dc.deck_id = ?
      )`;
      params.push(deckId);
    }
    if (noteTypeId) {
      sql += ` AND note_type_id = ?`;
      params.push(noteTypeId);
    }
    if (search) {
      sql += ` AND fields_json LIKE ?`;
      params.push(`%${search.trim()}%`);
    }
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const rows = this.db.prepare(sql).all(...params) as NoteRow[];
    return rows.map(r => this.hydrateNote(r));
  }

  private hydrateNote(row: NoteRow): CardNote {
    return {
      id: row.id,
      noteTypeId: row.note_type_id,
      fields: JSON.parse(row.fields_json),
      guid: row.guid,
      copiedFromNoteId: row.copied_from_note_id,
      sourceRef: row.source_ref,
      sourceSnapshot: row.source_snapshot_json ? JSON.parse(row.source_snapshot_json) : null,
      sourceHash: row.source_hash,
      sourceChangedAt: row.source_changed_at,
      orphanedAt: row.orphaned_at,
      ankiId: row.anki_id,
      ankiExtra: row.anki_extra,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Save or update a note and refresh all generated cards.
   */
  saveNote(input: SaveNoteInput): {
    note: CardNote;
    cards: KnowledgeCard[];
    emptyCards: Array<{ id: string; ord: number }>;
  } {
    const noteType = this.getNoteType(input.noteTypeId);
    if (!noteType) throw new Error(`Unknown note type: ${input.noteTypeId}`);

    // Validate fields length
    for (const [key, val] of Object.entries(input.fields)) {
      if (typeof val === 'string' && val.length > MAX_FIELD_LENGTH) {
        throw new Error(`Field '${key}' exceeds ${MAX_FIELD_LENGTH} characters`);
      }
    }

    // Check source text protection if updating
    const protectSourceText = this.settings.get<boolean>('revision.protectSourceText', false) ?? false;

    return this.db.transaction(() => {
      const now = new Date().toISOString();
      let noteId = input.id;
      let existingNote: CardNote | null = null;

      if (noteId) {
        existingNote = this.getNote(noteId);
      }

      if (existingNote && protectSourceText) {
        // Ensure source_text fields have not been modified
        for (const f of noteType.fields) {
          if (f.sourceText) {
            const oldVal = existingNote.fields[f.name] ?? '';
            const newVal = input.fields[f.name] ?? '';
            if (oldVal !== newVal) {
              throw new Error('source-text-protected');
            }
          }
        }
      }

      const fieldsJson = JSON.stringify(input.fields);

      if (!existingNote) {
        noteId = noteId ?? randomUUID();
        const guid = input.guid ?? randomUUID();
        // Check if any source_text fields exist to populate source_snapshot_json
        const hasSourceTextFields = noteType.fields.some(f => f.sourceText);
        let snapshotJson: string | null = null;
        if (input.sourceSnapshot) {
          snapshotJson = JSON.stringify(input.sourceSnapshot);
        } else if (hasSourceTextFields) {
          const snap: Record<string, string> = {};
          for (const f of noteType.fields) {
            if (f.sourceText && input.fields[f.name]) {
              snap[f.name] = input.fields[f.name];
            }
          }
          snapshotJson = Object.keys(snap).length > 0 ? JSON.stringify(snap) : null;
        }

        this.db
          .prepare(
            `INSERT INTO card_note (id, note_type_id, fields_json, guid, copied_from_note_id, source_ref, source_snapshot_json, source_hash, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            noteId,
            input.noteTypeId,
            fieldsJson,
            guid,
            input.copiedFromNoteId ?? null,
            input.sourceRef ?? null,
            snapshotJson,
            input.sourceHash ?? null,
            now,
            now
          );
      } else {
        // Updating existing note
        this.db
          .prepare(
            `UPDATE card_note SET fields_json = ?, source_ref = COALESCE(?, source_ref), updated_at = ? WHERE id = ?`
          )
          .run(fieldsJson, input.sourceRef ?? null, now, noteId!);
      }

      // Fetch existing cards for this note
      const existingCardRows = this.db
        .prepare(`SELECT knowledge_id, ord FROM card_detail WHERE note_id = ?`)
        .all(noteId) as Array<{ knowledge_id: string; ord: number }>;

      const generated = generateCards(
        noteType,
        input.fields,
        existingCardRows.map(c => ({ ord: c.ord }))
      );

      const emptyCards: Array<{ id: string; ord: number }> = [];
      const updatedCardIds: string[] = [];

      for (const gen of generated) {
        const existingCard = existingCardRows.find(c => c.ord === gen.ord);
        if (gen.empty) {
          if (existingCard) {
            emptyCards.push({ id: existingCard.knowledge_id, ord: gen.ord });
          }
          continue;
        }

        if (existingCard) {
          // Update existing card's rendered front & back cache
          withKnowledgeHistory(this.db, [existingCard.knowledge_id], 'edit', () => {
            this.db
              .prepare(`UPDATE card_detail SET front = ?, back = ? WHERE knowledge_id = ?`)
              .run(gen.front, gen.back, existingCard.knowledge_id);
            return existingCard.knowledge_id;
          }, { id: existingCard.knowledge_id, revision: headRevision(this.db, existingCard.knowledge_id) });
          updatedCardIds.push(existingCard.knowledge_id);
        } else {
          // Create new sibling card
          const cardId = randomUUID();
          withKnowledgeHistory(this.db, [cardId], 'create', () => {
            this.db
              .prepare(
                `INSERT INTO knowledge (id, knowledge_type, created_at, updated_at)
                 VALUES (?, 'card', ?, ?)`
              )
              .run(cardId, now, now);

            // Infer sourceKind from noteType or input
            const sourceKind = noteType.stockKind === 'quran'
              ? 'quran'
              : noteType.stockKind === 'hadith'
              ? 'hadith'
              : noteType.stockKind === 'poetry'
              ? 'poetry'
              : 'note';

            const questionKind = noteType.kind === 'choice' ? 'choice' : 'recall';

            this.db
              .prepare(
                `INSERT INTO card_detail (knowledge_id, note_id, ord, front, back, source_kind, source_ref, question_kind)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .run(cardId, noteId, gen.ord, gen.front, gen.back, sourceKind, input.sourceRef ?? null, questionKind);
          });

          // Link to deck if provided
          if (input.deckId) {
            this.ensureDeckAndLinkCard(input.deckId, cardId, now);
          } else {
            // If note's existing cards are already in decks, link the new sibling card to those decks too
            const existingDecks = existingCardRows.length > 0 ? this.getDecksForNote(noteId!) : [];
            for (const dId of existingDecks) {
              this.ensureDeckAndLinkCard(dId, cardId, now);
            }
          }
          updatedCardIds.push(cardId);
        }
      }

      // If input.deckId was provided, also ensure existing cards of this note are linked to input.deckId
      if (input.deckId) {
        for (const cardId of updatedCardIds) {
          this.ensureDeckAndLinkCard(input.deckId, cardId, now);
        }
      }

      // Add tags if provided
      if (input.tags && input.tags.length > 0) {
        const insertTag = this.db.prepare(
          `INSERT OR IGNORE INTO tag (id, name, origin) VALUES (?, ?, 'manual')`
        );
        const selectTag = this.db.prepare(`SELECT id FROM tag WHERE name = ?`);
        const linkTag = this.db.prepare(
          `INSERT OR IGNORE INTO knowledge_tag (knowledge_id, tag_id) VALUES (?, ?)`
        );
        for (const rawTag of input.tags) {
          const cleanTag = rawTag.trim();
          if (!cleanTag) continue;
          insertTag.run(randomUUID(), cleanTag);
          const tagRow = selectTag.get(cleanTag) as { id: string } | undefined;
          if (tagRow) {
            for (const cardId of updatedCardIds) {
              linkTag.run(cardId, tagRow.id);
            }
          }
        }
      }

      const note = this.getNote(noteId!)!;
      const cards = this.getCardsForNote(noteId!);

      return { note, cards, emptyCards };
    })();
  }

  getCardsForNote(noteId: string): KnowledgeCard[] {
    const rows = this.db
      .prepare(
        `SELECT k.id AS id, c.knowledge_id, c.question_kind AS question_kind, c.payload_json,
         (SELECT COALESCE(MAX(revision),0) FROM entity_version WHERE entity_type='knowledge' AND entity_id=k.id) AS cardRevision,
         c.front, c.back, c.source_kind, c.source_ref, c.source_label, c.language, k.work_id,
         s.state AS srsState, k.created_at, c.note_id, c.ord
         FROM knowledge k
         JOIN card_detail c ON c.knowledge_id = k.id
         LEFT JOIN srs_state s ON s.knowledge_id = k.id
         WHERE c.note_id = ? AND k.deleted_at IS NULL
         ORDER BY c.ord ASC`
      )
      .all(noteId) as Array<CardDetailRow & { id: string }>;

    return rows.map(r => ({
      id: r.id || r.knowledge_id,
      questionKind: r.question_kind as KnowledgeCard['questionKind'],
      payload: r.payload_json ? JSON.parse(r.payload_json) : null,
      cardRevision: (r as { cardRevision?: number }).cardRevision ?? 0,
      front: r.front,
      back: r.back,
      sourceKind: r.source_kind as KnowledgeCard['sourceKind'],
      sourceRef: r.source_ref,
      sourceLabel: r.source_label,
      language: r.language,
      workId: r.work_id,
      memorizing: r.srsState !== null && r.srsState !== 'suspended',
      createdAt: r.created_at,
      noteId: r.note_id,
      ord: r.ord,
    }));
  }

  /**
   * Shared cards (ADR 3.8):
   * When a card is in more than one deck and user chooses "Change in this deck only",
   * copies the note and its cards, sets copied_from_note_id, copies srs_state,
   * and moves only that deck's links to the copies.
   */
  forkNoteForDeck(noteId: string, deckId: string): { newNote: CardNote; newCards: KnowledgeCard[] } {
    return this.db.transaction(() => {
      const originalNote = this.getNote(noteId);
      if (!originalNote) throw new Error('Original note not found');

      const now = new Date().toISOString();
      const newNoteId = randomUUID();
      const newGuid = randomUUID();

      // Copy the note
      this.db
        .prepare(
          `INSERT INTO card_note (id, note_type_id, fields_json, guid, copied_from_note_id, source_ref, source_snapshot_json, source_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          newNoteId,
          originalNote.noteTypeId,
          JSON.stringify(originalNote.fields),
          newGuid,
          originalNote.id,
          originalNote.sourceRef,
          originalNote.sourceSnapshot ? JSON.stringify(originalNote.sourceSnapshot) : null,
          originalNote.sourceHash,
          now,
          now
        );

      const originalCards = this.getCardsForNote(noteId);

      for (const origCard of originalCards) {
        const newCardId = randomUUID();
        withKnowledgeHistory(this.db, [newCardId], 'create', () => {
          this.db
            .prepare(
              `INSERT INTO knowledge (id, work_id, knowledge_type, created_at, updated_at)
               VALUES (?, ?, 'card', ?, ?)`
            )
            .run(newCardId, origCard.workId, now, now);

          this.db
            .prepare(
              `INSERT INTO card_detail (knowledge_id, note_id, ord, front, back, source_kind, source_ref, source_label, language, question_kind, payload_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              newCardId,
              newNoteId,
              origCard.ord ?? 0,
              origCard.front,
              origCard.back,
              origCard.sourceKind,
              origCard.sourceRef,
              origCard.sourceLabel,
              origCard.language,
              origCard.questionKind ?? 'recall',
              origCard.payload ? JSON.stringify(origCard.payload) : null
            );
        });

        // Copy srs_state if present
        const srsRow = this.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(origCard.id) as {
          state: string;
          due_at: string;
          stability: number | null;
          difficulty: number | null;
          reps: number;
          lapses: number;
          last_review: string | null;
          learning_step?: number;
          buried_until?: string | null;
          new_position?: number | null;
          desired_retention?: number | null;
        } | undefined;
        if (srsRow) {
          const hasExtendedCols = Boolean(
            this.db.prepare("SELECT 1 FROM pragma_table_info('srs_state') WHERE name='learning_step'").get()
          );
          if (hasExtendedCols) {
            this.db
              .prepare(
                `INSERT INTO srs_state (
                  knowledge_id, state, due_at, stability, difficulty, reps, lapses, last_review,
                  learning_step, buried_until, new_position, desired_retention
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .run(
                newCardId,
                srsRow.state,
                srsRow.due_at,
                srsRow.stability,
                srsRow.difficulty,
                srsRow.reps,
                srsRow.lapses,
                srsRow.last_review,
                srsRow.learning_step ?? 0,
                srsRow.buried_until ?? null,
                srsRow.new_position ?? null,
                srsRow.desired_retention ?? null
              );
          } else {
            this.db
              .prepare(
                `INSERT INTO srs_state (knowledge_id, state, due_at, stability, difficulty, reps, lapses, last_review)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .run(
                newCardId,
                srsRow.state,
                srsRow.due_at,
                srsRow.stability,
                srsRow.difficulty,
                srsRow.reps,
                srsRow.lapses,
                srsRow.last_review
              );
          }
        }

        // Move the deck link from original card to new card
        const oldLink = this.db
          .prepare(`SELECT position, added_at FROM deck_card WHERE knowledge_id = ? AND deck_id = ?`)
          .get(origCard.id, deckId) as { position: number; added_at: string } | undefined;
        this.db
          .prepare(`DELETE FROM deck_card WHERE knowledge_id = ? AND deck_id = ?`)
          .run(origCard.id, deckId);
        this.ensureDeckAndLinkCard(deckId, newCardId, oldLink?.added_at ?? now, oldLink?.position);
      }

      return {
        newNote: this.getNote(newNoteId)!,
        newCards: this.getCardsForNote(newNoteId),
      };
    })();
  }

  private ensureDeckAndLinkCard(deckId: string, cardId: string, now: string, explicitPos?: number): void {
    const existingById = this.db.prepare(`SELECT id FROM deck WHERE id = ?`).get(deckId) as { id: string } | undefined;
    if (!existingById) {
      const existingByName = this.db
        .prepare(`SELECT id FROM deck WHERE parent_id IS NULL AND name = ?`)
        .get(deckId) as { id: string } | undefined;
      if (!existingByName) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO deck (id, name, parent_id, kind, preset_id, created_at, updated_at)
             VALUES (?, ?, NULL, 'normal', NULL, ?, ?)`
          )
          .run(deckId, deckId, now, now);
      }
    }
    const maxPos = (
      this.db.prepare(`SELECT COALESCE(MAX(position), 0) AS maxPos FROM deck_card WHERE deck_id = ?`).get(deckId) as {
        maxPos: number;
      }
    ).maxPos;
    const pos = explicitPos ?? maxPos + 1;
    this.db
      .prepare(`INSERT OR IGNORE INTO deck_card (deck_id, knowledge_id, position, added_at) VALUES (?, ?, ?, ?)`)
      .run(deckId, cardId, pos, now);

    const hasSrs = this.db.prepare(`SELECT 1 FROM srs_state WHERE knowledge_id = ?`).get(cardId);
    if (!hasSrs) {
      const hasNewPos = Boolean(
        this.db.prepare("SELECT 1 FROM pragma_table_info('srs_state') WHERE name='new_position'").get()
      );
      if (hasNewPos) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO srs_state (knowledge_id, state, due_at, learning_step, new_position)
             VALUES (?, 'new', ?, 0, ?)`
          )
          .run(cardId, now, pos);
      } else {
        this.db
          .prepare(`INSERT OR IGNORE INTO srs_state (knowledge_id, state, due_at) VALUES (?, 'new', ?)`)
          .run(cardId, now);
      }
    }
  }

  /**
   * Restore source text fields from source_snapshot_json (ADR 3.11).
   */
  restoreSourceText(noteId: string): CardNote {
    return this.db.transaction(() => {
      const note = this.getNote(noteId);
      if (!note) throw new Error('Note not found');
      if (!note.sourceSnapshot) throw new Error('No source snapshot to restore');

      const updatedFields = { ...note.fields };
      for (const [key, val] of Object.entries(note.sourceSnapshot)) {
        updatedFields[key] = val;
      }

      const saveRes = this.saveNote({
        id: note.id,
        noteTypeId: note.noteTypeId,
        fields: updatedFields,
      });

      return saveRes.note;
    })();
  }

  /**
   * Returns list of deck ids this note's cards belong to.
   */
  getDecksForNote(noteId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT j.deck_id
         FROM deck_card j
         JOIN card_detail c ON c.knowledge_id = j.knowledge_id
         WHERE c.note_id = ?`
      )
      .all(noteId) as Array<{ deck_id: string }>;
    return rows.map(r => r.deck_id);
  }

  /**
   * Links all cards of a note to an additional deck.
   */
  linkNoteToDeck(noteId: string, deckId: string): void {
    const cards = this.getCardsForNote(noteId);
    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (const card of cards) {
        this.ensureDeckAndLinkCard(deckId, card.id, now);
      }
    })();
  }
}
