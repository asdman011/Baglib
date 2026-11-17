/**
 * Baglib — live source-to-deck sync (KEY-393; ADR-017 3.4 `deck_subscription`, 3.8, 3.11).
 *
 * A deck subscribes to a source (today: a book's highlights or its comments). Every source item
 * becomes one note whose `source_ref` names the item. On each sync:
 * - **New item:** a note and its cards are created in the deck (or, if an original note for the
 *   item already exists for another deck, the same card is linked here: one card, one schedule).
 * - **Edited item:** shared originals update in place; `srs_state` and the review log are never
 *   touched (the note repository only rewrites fields and the card caches, with history). Fields
 *   the user edited are never overwritten: the note is flagged with `source_changed_at` and the
 *   user chooses. Deck-only copies (`copied_from_note_id`) are never overwritten; they are flagged.
 * - **Deleted item:** the note is marked `orphaned_at` and its cards are suspended; history is
 *   kept. "Orphaned cards" lets the user delete or keep them. If the item comes back, the cards
 *   are restored to their previous state.
 *
 * `source_snapshot_json` holds the fields exactly as last generated from the source, so an edit is
 * "the current field differs from the snapshot". `source_hash` is the hash of those fields.
 * Work is done in batches, each in its own transaction, so quitting mid-sync loses nothing and the
 * next sync (which is idempotent) finishes the job.
 */

import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { CardNoteRepository } from '../database/repositories/card-note.repository';
import { trashKnowledge } from './knowledge-history';

export const SUPPORTED_SUBSCRIPTION_KINDS = ['book_highlights', 'book_comments'] as const;
export type SupportedSubscriptionKind = (typeof SUPPORTED_SUBSCRIPTION_KINDS)[number];
export type NewItemsPolicy = 'silent' | 'toast';

export interface DeckSubscription {
  id: string;
  deckId: string;
  sourceKind: string;
  sourceRef: string;
  noteTypeId: string;
  newItems: NewItemsPolicy;
  lastSyncedAt: string | null;
  label: string;
}

export interface SourceItem {
  ref: string;
  /** Values for the note type's fields, in field order (first field, second field, ...). */
  values: string[];
}

export interface SyncResult {
  subscriptionId: string;
  deckId: string;
  added: number;
  linked: number;
  updated: number;
  flagged: number;
  orphaned: number;
  restored: number;
  unchanged: number;
}

const BATCH = 100;

const escapeHtml = (text: string) =>
  text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/\r?\n/gu, '<br>');

interface AnnotationRow {
  id: string;
  selected_text: string | null;
  note_content: string | null;
}

/** Source adapters: how a subscription's items are read. */
const ADAPTERS: Record<SupportedSubscriptionKind, { namespace: (ref: string) => string; list: (db: Database, ref: string) => SourceItem[] }> = {
  book_highlights: {
    namespace: ref => `book-highlight:${ref}/`,
    list: (db, ref) => {
      const title = workTitle(db, ref);
      const rows = db
        .prepare(
          `SELECT id, selected_text, note_content FROM annotations
           WHERE book_id = ? AND type IN ('highlight', 'underline') AND TRIM(COALESCE(selected_text, '')) <> ''
           ORDER BY CAST(location_cfi_or_page AS INTEGER), location_cfi_or_page, created_at, id`
        )
        .all(ref) as AnnotationRow[];
      return rows.map(row => {
        const note = (row.note_content ?? '').trim();
        const back = note ? `${escapeHtml(note)}<br><br>— ${escapeHtml(title)}` : `— ${escapeHtml(title)}`;
        return { ref: `book-highlight:${ref}/${row.id}`, values: [escapeHtml(row.selected_text!.trim()), back] };
      });
    },
  },
  book_comments: {
    namespace: ref => `book-comment:${ref}/`,
    list: (db, ref) => {
      const title = workTitle(db, ref);
      const rows = db
        .prepare(
          `SELECT id, selected_text, note_content FROM annotations
           WHERE book_id = ? AND TRIM(COALESCE(note_content, '')) <> ''
           ORDER BY CAST(location_cfi_or_page AS INTEGER), location_cfi_or_page, created_at, id`
        )
        .all(ref) as AnnotationRow[];
      return rows.map(row => {
        const passage = (row.selected_text ?? '').trim();
        const front = passage ? escapeHtml(passage) : `— ${escapeHtml(title)}`;
        const back = passage ? `${escapeHtml(row.note_content!.trim())}<br><br>— ${escapeHtml(title)}` : escapeHtml(row.note_content!.trim());
        return { ref: `book-comment:${ref}/${row.id}`, values: [front, back] };
      });
    },
  },
};

function workTitle(db: Database, workId: string): string {
  const row = db.prepare(`SELECT title FROM work WHERE id = ?`).get(workId) as { title: string } | undefined;
  return row?.title ?? '';
}

export function isSupportedKind(kind: unknown): kind is SupportedSubscriptionKind {
  return typeof kind === 'string' && (SUPPORTED_SUBSCRIPTION_KINDS as readonly string[]).includes(kind);
}

export function hashFields(fields: Record<string, string>): string {
  const ordered = Object.keys(fields)
    .sort()
    .map(key => [key, fields[key]]);
  return crypto.createHash('sha1').update(JSON.stringify(ordered)).digest('hex');
}

interface NoteRow {
  id: string;
  note_type_id: string;
  fields_json: string;
  copied_from_note_id: string | null;
  source_ref: string;
  source_snapshot_json: string | null;
  source_hash: string | null;
  source_changed_at: string | null;
  orphaned_at: string | null;
}

/** ts-fsrs State numbers, as stored in the review log's JSON. */
const STATE_NAMES = ['new', 'learning', 'review', 'relearning'] as const;

export class DeckSyncService {
  private notes: CardNoteRepository;

  constructor(private db: Database, private clock: () => Date = () => new Date()) {
    this.notes = new CardNoteRepository(db);
  }

  // ---------- subscriptions ----------

  list(deckId?: string): DeckSubscription[] {
    const rows = this.db
      .prepare(
        `SELECT id, deck_id, source_kind, source_ref, note_type_id, new_items, last_synced_at
         FROM deck_subscription ${deckId ? 'WHERE deck_id = ?' : ''} ORDER BY rowid`
      )
      .all(...(deckId ? [deckId] : [])) as Array<{
      id: string;
      deck_id: string;
      source_kind: string;
      source_ref: string;
      note_type_id: string;
      new_items: NewItemsPolicy;
      last_synced_at: string | null;
    }>;
    return rows.map(r => ({
      id: r.id,
      deckId: r.deck_id,
      sourceKind: r.source_kind,
      sourceRef: r.source_ref,
      noteTypeId: r.note_type_id,
      newItems: r.new_items,
      lastSyncedAt: r.last_synced_at,
      label: workTitle(this.db, r.source_ref),
    }));
  }

  get(id: string): DeckSubscription | null {
    return this.list().find(s => s.id === id) ?? null;
  }

  subscribe(input: { deckId: string; sourceKind: string; sourceRef: string; noteTypeId?: string; newItems?: NewItemsPolicy }): DeckSubscription {
    if (!isSupportedKind(input.sourceKind)) throw new Error('unsupported-source');
    const deck = this.db.prepare(`SELECT kind FROM deck WHERE id = ?`).get(input.deckId) as { kind: string } | undefined;
    if (!deck || deck.kind !== 'normal') throw new Error('invalid-request');
    if (!this.db.prepare(`SELECT 1 FROM work WHERE id = ?`).get(input.sourceRef)) throw new Error('source-not-found');
    const noteTypeId = input.noteTypeId ?? 'stock-basic';
    const type = this.notes.getNoteType(noteTypeId);
    if (!type || type.fields.length < 2 || type.kind !== 'normal') throw new Error('invalid-note-type');
    const existing = this.db
      .prepare(`SELECT id FROM deck_subscription WHERE deck_id = ? AND source_kind = ? AND source_ref = ?`)
      .get(input.deckId, input.sourceKind, input.sourceRef) as { id: string } | undefined;
    if (existing) return this.get(existing.id)!;
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO deck_subscription (id, deck_id, source_kind, source_ref, note_type_id, new_items, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(id, input.deckId, input.sourceKind, input.sourceRef, noteTypeId, input.newItems === 'silent' ? 'silent' : 'toast');
    return this.get(id)!;
  }

  /** Stops following the source. The deck's cards stay as they are. */
  unsubscribe(id: string): boolean {
    return this.db.prepare(`DELETE FROM deck_subscription WHERE id = ?`).run(id).changes > 0;
  }

  setPolicy(id: string, newItems: NewItemsPolicy): DeckSubscription {
    if (newItems !== 'silent' && newItems !== 'toast') throw new Error('invalid-request');
    this.db.prepare(`UPDATE deck_subscription SET new_items = ? WHERE id = ?`).run(newItems, id);
    const sub = this.get(id);
    if (!sub) throw new Error('invalid-request');
    return sub;
  }

  /** Subscriptions that follow a given book (for the annotation hooks). */
  forWork(workId: string): DeckSubscription[] {
    return this.list().filter(s => isSupportedKind(s.sourceKind) && s.sourceRef === workId);
  }

  // ---------- sync ----------

  /** Runs one subscription's sync. Async only so batches can yield to the event loop. */
  async sync(subscriptionId: string, yieldBetweenBatches: () => Promise<void> = () => new Promise(r => setImmediate(r))): Promise<SyncResult> {
    const sub = this.get(subscriptionId);
    if (!sub || !isSupportedKind(sub.sourceKind)) throw new Error('invalid-request');
    const adapter = ADAPTERS[sub.sourceKind];
    const type = this.notes.getNoteType(sub.noteTypeId);
    if (!type) throw new Error('invalid-note-type');
    const fieldNames = type.fields.map(f => f.name);
    const items = adapter.list(this.db, sub.sourceRef);
    const result: SyncResult = { subscriptionId: sub.id, deckId: sub.deckId, added: 0, linked: 0, updated: 0, flagged: 0, orphaned: 0, restored: 0, unchanged: 0 };

    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      this.db.transaction(() => {
        for (const item of batch) this.applyItem(sub, fieldNames, item, result);
      })();
      if (i + BATCH < items.length) await yieldBetweenBatches();
    }

    // Items that are gone: orphan this deck's notes for them.
    const present = new Set(items.map(item => item.ref));
    const namespace = adapter.namespace(sub.sourceRef);
    const deckNotes = this.db
      .prepare(
        `SELECT DISTINCT n.id, n.source_ref, n.orphaned_at
         FROM card_note n
         JOIN card_detail c ON c.note_id = n.id
         JOIN deck_card dc ON dc.knowledge_id = c.knowledge_id AND dc.deck_id = ?
         JOIN knowledge k ON k.id = c.knowledge_id AND k.deleted_at IS NULL
         WHERE substr(n.source_ref, 1, ?) = ?`
      )
      .all(sub.deckId, namespace.length, namespace) as Array<{ id: string; source_ref: string; orphaned_at: string | null }>;
    const gone = deckNotes.filter(n => !present.has(n.source_ref) && !n.orphaned_at);
    for (let i = 0; i < gone.length; i += BATCH) {
      this.db.transaction(() => {
        for (const note of gone.slice(i, i + BATCH)) {
          this.orphan(note.id);
          result.orphaned += 1;
        }
      })();
    }

    this.db.prepare(`UPDATE deck_subscription SET last_synced_at = ? WHERE id = ?`).run(this.clock().toISOString(), sub.id);
    return result;
  }

  private fieldsFor(fieldNames: string[], values: string[]): Record<string, string> {
    const fields: Record<string, string> = {};
    fieldNames.forEach((name, index) => {
      fields[name] = values[index] ?? '';
    });
    return fields;
  }

  private applyItem(sub: DeckSubscription, fieldNames: string[], item: SourceItem, result: SyncResult): void {
    const generated = this.fieldsFor(fieldNames, item.values);
    const hash = hashFields(generated);
    const notes = this.db
      .prepare(
        `SELECT id, note_type_id, fields_json, copied_from_note_id, source_ref, source_snapshot_json, source_hash, source_changed_at, orphaned_at
         FROM card_note WHERE source_ref = ? AND note_type_id = ?`
      )
      .all(item.ref, sub.noteTypeId) as NoteRow[];
    const live = notes.filter(n => this.hasLiveCards(n.id));
    const original = live.find(n => !n.copied_from_note_id);

    if (!original) {
      // Not in any deck yet, or every earlier note was deleted: make a new note in this deck.
      this.notes.saveNote({ noteTypeId: sub.noteTypeId, fields: generated, sourceRef: item.ref, deckId: sub.deckId, sourceSnapshot: generated, sourceHash: hash });
      result.added += 1;
      return;
    }

    const inDeck = live.filter(n => this.noteInDeck(n.id, sub.deckId));
    if (!inDeck.length) {
      // The same item already has a card elsewhere: this deck gets the same card (ADR-017 3.8).
      this.notes.linkNoteToDeck(original.id, sub.deckId);
      result.linked += 1;
    }

    for (const note of live) {
      if (note.orphaned_at) {
        this.restore(note.id);
        result.restored += 1;
      }
      if (note.source_hash === hash) {
        if (!note.orphaned_at) result.unchanged += 1;
        continue;
      }
      if (note.copied_from_note_id) {
        // Copies are never overwritten; the user is asked.
        if (!note.source_changed_at) {
          this.db.prepare(`UPDATE card_note SET source_changed_at = ? WHERE id = ?`).run(this.clock().toISOString(), note.id);
          result.flagged += 1;
        }
        continue;
      }
      const current = JSON.parse(note.fields_json) as Record<string, string>;
      const snapshot = note.source_snapshot_json ? (JSON.parse(note.source_snapshot_json) as Record<string, string>) : current;
      const next: Record<string, string> = { ...current };
      let keptEdit = false;
      for (const name of fieldNames) {
        const userEdited = (current[name] ?? '') !== (snapshot[name] ?? '');
        if (!userEdited) next[name] = generated[name];
        else if ((current[name] ?? '') !== generated[name]) keptEdit = true;
      }
      const changed = fieldNames.some(name => (next[name] ?? '') !== (current[name] ?? ''));
      if (changed) this.notes.saveNote({ id: note.id, noteTypeId: note.note_type_id, fields: next });
      if (keptEdit) {
        // Keep the old snapshot and hash so the user can compare; the next sync re-flags until resolved.
        this.db.prepare(`UPDATE card_note SET source_changed_at = COALESCE(source_changed_at, ?) WHERE id = ?`).run(this.clock().toISOString(), note.id);
        result.flagged += 1;
      } else {
        this.db
          .prepare(`UPDATE card_note SET source_snapshot_json = ?, source_hash = ?, source_changed_at = NULL WHERE id = ?`)
          .run(JSON.stringify(generated), hash, note.id);
      }
      if (changed) result.updated += 1;
    }
  }

  private hasLiveCards(noteId: string): boolean {
    return !!this.db
      .prepare(`SELECT 1 FROM card_detail c JOIN knowledge k ON k.id = c.knowledge_id WHERE c.note_id = ? AND k.deleted_at IS NULL LIMIT 1`)
      .get(noteId);
  }

  private noteInDeck(noteId: string, deckId: string): boolean {
    return !!this.db
      .prepare(`SELECT 1 FROM card_detail c JOIN deck_card dc ON dc.knowledge_id = c.knowledge_id WHERE c.note_id = ? AND dc.deck_id = ? LIMIT 1`)
      .get(noteId, deckId);
  }

  private cardIds(noteId: string): string[] {
    return (
      this.db
        .prepare(`SELECT c.knowledge_id AS id FROM card_detail c JOIN knowledge k ON k.id = c.knowledge_id WHERE c.note_id = ? AND k.deleted_at IS NULL`)
        .all(noteId) as Array<{ id: string }>
    ).map(r => r.id);
  }

  /** Suspends the note's cards and marks it orphaned. Scheduling data and history stay. */
  private orphan(noteId: string): void {
    const now = this.clock().toISOString();
    this.db.prepare(`UPDATE card_note SET orphaned_at = ? WHERE id = ?`).run(now, noteId);
    for (const id of this.cardIds(noteId)) {
      const exists = this.db.prepare(`SELECT 1 FROM srs_state WHERE knowledge_id = ?`).get(id);
      if (exists) this.db.prepare(`UPDATE srs_state SET state = 'suspended', buried_until = NULL WHERE knowledge_id = ?`).run(id);
      else
        this.db
          .prepare(`INSERT INTO srs_state (knowledge_id, state, due_at, reps, lapses) VALUES (?, 'suspended', ?, 0, 0)`)
          .run(id, now);
    }
  }

  /** The state a suspended card goes back to: from its last review, else new. */
  private stateBeforeSuspend(cardId: string): (typeof STATE_NAMES)[number] {
    const row = this.db
      .prepare(`SELECT state_before FROM srs_review_log WHERE knowledge_id = ? AND rating >= 1 ORDER BY reviewed_at DESC, rowid DESC LIMIT 1`)
      .get(cardId) as { state_before: string | null } | undefined;
    if (!row?.state_before) return 'new';
    try {
      const parsed = JSON.parse(row.state_before) as { after?: { state?: number } };
      const state = parsed.after?.state;
      return typeof state === 'number' && STATE_NAMES[state] ? STATE_NAMES[state] : 'new';
    } catch {
      return 'new';
    }
  }

  private restore(noteId: string): void {
    this.db.prepare(`UPDATE card_note SET orphaned_at = NULL WHERE id = ?`).run(noteId);
    for (const id of this.cardIds(noteId)) {
      this.db.prepare(`UPDATE srs_state SET state = ? WHERE knowledge_id = ? AND state = 'suspended'`).run(this.stateBeforeSuspend(id), id);
    }
  }

  // ---------- review of sync results ----------

  pending(): {
    orphaned: Array<{ noteId: string; front: string; sourceRef: string; orphanedAt: string }>;
    changed: Array<{ noteId: string; isCopy: boolean; fields: string[]; current: Record<string, string>; oldSource: Record<string, string>; newSource: Record<string, string> | null }>;
  } {
    const orphanRows = this.db
      .prepare(`SELECT id, fields_json, note_type_id, source_ref, orphaned_at FROM card_note WHERE orphaned_at IS NOT NULL ORDER BY orphaned_at DESC`)
      .all() as Array<{ id: string; fields_json: string; note_type_id: string; source_ref: string; orphaned_at: string }>;
    const orphaned = orphanRows
      .filter(r => this.hasLiveCards(r.id))
      .map(r => {
        const fields = JSON.parse(r.fields_json) as Record<string, string>;
        const first = this.notes.getNoteType(r.note_type_id)?.fields[0]?.name;
        return { noteId: r.id, front: first ? fields[first] ?? '' : '', sourceRef: r.source_ref, orphanedAt: r.orphaned_at };
      });
    const changedRows = this.db
      .prepare(
        `SELECT id, note_type_id, fields_json, copied_from_note_id, source_ref, source_snapshot_json FROM card_note
         WHERE source_changed_at IS NOT NULL AND orphaned_at IS NULL ORDER BY source_changed_at DESC`
      )
      .all() as Array<{ id: string; note_type_id: string; fields_json: string; copied_from_note_id: string | null; source_ref: string; source_snapshot_json: string | null }>;
    const changed = changedRows
      .filter(r => this.hasLiveCards(r.id))
      .map(r => {
        const fieldNames = this.notes.getNoteType(r.note_type_id)?.fields.map(f => f.name) ?? [];
        return {
          noteId: r.id,
          isCopy: !!r.copied_from_note_id,
          fields: fieldNames,
          current: JSON.parse(r.fields_json) as Record<string, string>,
          oldSource: r.source_snapshot_json ? (JSON.parse(r.source_snapshot_json) as Record<string, string>) : {},
          newSource: this.currentSource(r.source_ref, fieldNames),
        };
      });
    return { orphaned, changed };
  }

  /** The item's fields as the source has them now, or null when it's gone. */
  private currentSource(sourceRef: string, fieldNames: string[]): Record<string, string> | null {
    for (const kind of SUPPORTED_SUBSCRIPTION_KINDS) {
      const prefix = kind === 'book_highlights' ? 'book-highlight:' : 'book-comment:';
      if (!sourceRef.startsWith(prefix)) continue;
      const workId = sourceRef.slice(prefix.length, sourceRef.lastIndexOf('/'));
      const item = ADAPTERS[kind].list(this.db, workId).find(i => i.ref === sourceRef);
      return item ? this.fieldsFor(fieldNames, item.values) : null;
    }
    return null;
  }

  /** "Update": take the new source for every field. "Keep": keep the user's text, stop asking. */
  resolveChange(noteId: string, choice: 'update' | 'keep'): void {
    const row = this.db.prepare(`SELECT note_type_id, fields_json, source_ref FROM card_note WHERE id = ?`).get(noteId) as
      | { note_type_id: string; fields_json: string; source_ref: string }
      | undefined;
    if (!row) throw new Error('invalid-request');
    const fieldNames = this.notes.getNoteType(row.note_type_id)?.fields.map(f => f.name) ?? [];
    const source = this.currentSource(row.source_ref, fieldNames);
    this.db.transaction(() => {
      if (source) {
        if (choice === 'update') this.notes.saveNote({ id: noteId, noteTypeId: row.note_type_id, fields: { ...(JSON.parse(row.fields_json) as Record<string, string>), ...source } });
        this.db.prepare(`UPDATE card_note SET source_snapshot_json = ?, source_hash = ?, source_changed_at = NULL WHERE id = ?`).run(JSON.stringify(source), hashFields(source), noteId);
      } else {
        this.db.prepare(`UPDATE card_note SET source_changed_at = NULL WHERE id = ?`).run(noteId);
      }
    })();
  }

  /** "Delete": move the cards to the trash (history kept, restorable). "Keep": detach and unsuspend. */
  resolveOrphan(noteId: string, choice: 'delete' | 'keep'): void {
    const row = this.db.prepare(`SELECT 1 FROM card_note WHERE id = ? AND orphaned_at IS NOT NULL`).get(noteId);
    if (!row) throw new Error('invalid-request');
    if (choice === 'delete') {
      for (const id of this.cardIds(noteId)) trashKnowledge(this.db, id);
      this.db.prepare(`UPDATE card_note SET orphaned_at = NULL, source_ref = NULL WHERE id = ?`).run(noteId);
      return;
    }
    this.db.transaction(() => {
      this.restore(noteId);
      this.db.prepare(`UPDATE card_note SET source_ref = NULL, source_hash = NULL, source_changed_at = NULL WHERE id = ?`).run(noteId);
    })();
  }
}
