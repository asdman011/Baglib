/**
 * Baglib — live source-to-deck sync (KEY-393, KEY-409; ADR-017 3.4 `deck_subscription`, 3.8, 3.11).
 *
 * A deck subscribes to a source: a book's highlights or comments, a Sunnah book (kitab), bab or
 * whole collection, a poem, or every poem of a poet. Every source item becomes one note whose
 * `source_ref` names the item. On each sync:
 * - **New item:** a note and its cards are created in the deck (or, if an original note for the
 *   item already exists for another deck, the same card is linked here: one card, one schedule).
 * - **Edited item:** shared originals update in place; `srs_state` and the review log are never
 *   touched (the note repository only rewrites fields and the card caches, with history). Fields
 *   the user edited are never overwritten: the note is flagged with `source_changed_at` and the
 *   user chooses. Deck-only copies (`copied_from_note_id`) are never overwritten; they are flagged.
 * - **Deleted item:** the note is marked `orphaned_at` and its cards are suspended; history is
 *   kept. "Orphaned cards" lets the user delete or keep them. If the item comes back, the cards
 *   are restored to their previous state. An item another subscription of the same deck still
 *   covers is never orphaned.
 *
 * Hadith and poetry text is copied verbatim from the corpus (ADR-006): only `&`, `<` and `>` are
 * escaped so the text displays as written.
 *
 * `source_snapshot_json` holds the fields exactly as last generated from the source, so an edit is
 * "the current field differs from the snapshot". `source_hash` is the hash of those fields.
 * Work is done in batches, each in its own transaction, so quitting mid-sync loses nothing and the
 * next sync (which is idempotent) finishes the job.
 */

import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { DeckRepository } from '../database/repositories/deck.repository';
import { CardNoteRepository } from '../database/repositories/card-note.repository';
import { trashKnowledge } from './knowledge-history';

export const SUPPORTED_SUBSCRIPTION_KINDS = ['book_highlights', 'book_comments', 'sunnah_book', 'sunnah_bab', 'hadith_collection', 'poem', 'poet'] as const;
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
  /** Hadith sources: which cards each hadith gets (KEY-396). */
  cards?: HadithCard[];
  /** Poem sources, verse by verse: what is hidden and the daily chunk (KEY-397). */
  poem?: PoemOptions;
}

/** KEY-397: a poem verse by verse hides the ajuz or the whole bayt; chunk is the daily quota (0 = none). */
export type PoemPrompt = 'ajuz' | 'verse';
export interface PoemOptions {
  prompt: PoemPrompt;
  chunk: number;
}
export const DEFAULT_POEM_OPTIONS: PoemOptions = { prompt: 'ajuz', chunk: 0 };
/** The note types a poem source may use: verse by verse (progressive context cloze) or the whole poem. */
export const POEM_NOTE_TYPES = ['stock-context-cloze', 'stock-poem-whole'] as const;
export const MAX_DAILY_VERSES = 50;

/** The three hadith card templates of the "Hadith (variants)" type. */
export type HadithCard = 'full' | 'matn' | 'isnad';
export const HADITH_CARDS: readonly HadithCard[] = ['full', 'matn', 'isnad'];

interface ListOptions {
  noteTypeId: string;
  cards: HadithCard[];
  poem?: PoemOptions;
}

export interface SourceItem {
  ref: string;
  /** Values for the note type's fields, in field order (book sources, any normal note type). */
  values?: string[];
  /** Values by field name (sources with a fixed note type). */
  fields?: Record<string, string>;
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

/** How the corpora are read; main wires these to the Sunnah and poetry services, tests to fixtures. */
export interface SourceReaders {
  collectionName(collection: string): string;
  sunnahChapter(collection: string, chapter: number): Promise<{ title: string; hadiths: Array<{ id: string; researchId?: number; number: string; sectionNumber: string; sectionTitle: string; text: string; isnad?: string; matn?: string; full?: string }> } | null>;
  sunnahChapterNumbers(collection: string): Promise<number[]>;
  /** `paired`: Arabic bayt layout, where verses alternate sadr and ajuz. */
  poem(id: number): Promise<{ id: number; title: string; poetName: string; verses: string[]; paired?: boolean } | null>;
  poetPoemIds(poetId: number): Promise<number[]>;
}

const NO_READERS: SourceReaders = {
  collectionName: c => c,
  sunnahChapter: async () => null,
  sunnahChapterNumbers: async () => [],
  poem: async () => null,
  poetPoemIds: async () => [],
};

const BATCH = 100;

const escapeHtml = (text: string) =>
  text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/\r?\n/gu, '<br>');
/** Escapes markup but keeps line breaks as newlines (the context-cloze type splits on them). */
const escapeLines = (text: string) => text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

interface AnnotationRow {
  id: string;
  selected_text: string | null;
  note_content: string | null;
}

interface Adapter {
  /** A fixed note type, or null when the subscription's own note type is used (book sources). */
  noteTypeId: string | null;
  /** Other note types the source may be subscribed with (poems: the whole-poem type). */
  noteTypes?: readonly string[];
  /** Checks the source reference's shape. */
  validRef(ref: string): boolean;
  /** Item refs of this source start with this, used to find the deck's notes for it. */
  namespace(ref: string): string;
  list(db: Database, ref: string, readers: SourceReaders, options: ListOptions): Promise<SourceItem[]>;
}

const parseSunnah = (ref: string) => {
  const [collection, chapter, section] = ref.split(':');
  return { collection, chapter: Number(chapter), section };
};

async function hadithItems(readers: SourceReaders, collection: string, chapter: number, section: string | undefined, options: ListOptions): Promise<SourceItem[]> {
  const found = await readers.sunnahChapter(collection, chapter);
  if (!found) return [];
  const name = readers.collectionName(collection);
  const variants = options.noteTypeId === 'stock-hadith-variants';
  return found.hadiths
    .filter(h => h.text.trim() && (section === undefined || h.sectionNumber === section))
    .map((h): SourceItem => {
      const bab = `${escapeHtml(name)} ${escapeHtml(h.number)}${h.sectionTitle ? `<br>${escapeHtml(h.sectionTitle)}` : ''}`;
      if (!variants) return { ref: `sunnah-hadith:${collection}:${chapter}:${h.id}`, fields: { Bab: bab, Hadith: escapeHtml(h.text), Sharh: '' } };
      // KEY-396: "Hadith (variants)": the full text (isnad + matn), the isnad and the matn, verbatim.
      const isnad = (h.isnad ?? '').trim();
      const want = (card: HadithCard) => (options.cards.includes(card) ? 'y' : '');
      return {
        ref: `sunnah-hadith:${collection}:${chapter}:${h.id}`,
        fields: {
          Bab: bab,
          Hadith: escapeHtml((h.full ?? h.text).trim()),
          Isnad: escapeHtml(isnad),
          Matn: escapeHtml((h.matn ?? h.text).trim()),
          Sharh: '',
          'Full card': want('full'),
          'Matn card': want('matn'),
          // A hadith with no separate isnad can't make an isnad card.
          'Isnad card': isnad ? want('isnad') : '',
        },
      };
    });
}

async function poemItem(readers: SourceReaders, id: number, options: ListOptions): Promise<SourceItem | null> {
  const poem = await readers.poem(id);
  if (!poem || !poem.verses.some(v => v.trim())) return null;
  if (options.noteTypeId === 'stock-poem-whole') {
    // KEY-397: the whole poem on one card, each bayt as two hemistichs (verbatim, only & < > escaped).
    const lines: string[] = [];
    if (poem.paired) {
      for (let i = 0; i < poem.verses.length; i += 2) {
        const sadr = (poem.verses[i] ?? '').trim();
        const ajuz = (poem.verses[i + 1] ?? '').trim();
        if (!sadr && !ajuz) continue;
        lines.push(`<div class="bayt" dir="auto"><span class="sadr">${escapeHtml(sadr)}</span>${ajuz ? ` <span class="ajuz">${escapeHtml(ajuz)}</span>` : ''}</div>`);
      }
    } else {
      for (const verse of poem.verses) if (verse.trim()) lines.push(`<div class="verse" dir="auto">${escapeHtml(verse.trim())}</div>`);
    }
    return { ref: `poem:${id}`, fields: { Title: escapeHtml(poem.title.trim() || poem.poetName.trim()), Poet: escapeHtml(poem.poetName.trim()), Poem: lines.join(''), Notes: '' } };
  }
  const opts = options.poem ?? DEFAULT_POEM_OPTIONS;
  return {
    ref: `poem:${id}`,
    fields: {
      'Context Before': '',
      Target: poem.verses.map(v => escapeLines(v.trim())).filter(Boolean).join('\n'),
      'Context After': '',
      Notes: `${escapeHtml(poem.poetName)} — ${escapeHtml(poem.title)}`,
      'Whole verse': opts.prompt === 'verse' ? 'y' : '',
      Chunk: opts.chunk > 0 ? String(opts.chunk) : '',
    },
  };
}

const SUNNAH_ID = /^[A-Za-z0-9]{1,40}$/u;
const NUMBER = /^[1-9]\d{0,11}$/u;

/** Source adapters: how a subscription's items are read. */
const ADAPTERS: Record<SupportedSubscriptionKind, Adapter> = {
  book_highlights: {
    noteTypeId: null,
    validRef: ref => /^[A-Za-z0-9_-]{1,128}$/u.test(ref),
    namespace: ref => `book-highlight:${ref}/`,
    list: async (db, ref) => {
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
    noteTypeId: null,
    validRef: ref => /^[A-Za-z0-9_-]{1,128}$/u.test(ref),
    namespace: ref => `book-comment:${ref}/`,
    list: async (db, ref) => {
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
  sunnah_book: {
    noteTypeId: 'stock-hadith-variants',
    validRef: ref => {
      const p = ref.split(':');
      return p.length === 2 && SUNNAH_ID.test(p[0]) && NUMBER.test(p[1]);
    },
    namespace: ref => `sunnah-hadith:${ref}:`,
    list: async (_db, ref, readers, options) => {
      const { collection, chapter } = parseSunnah(ref);
      return hadithItems(readers, collection, chapter, undefined, options);
    },
  },
  sunnah_bab: {
    noteTypeId: 'stock-hadith-variants',
    validRef: ref => {
      const p = ref.split(':');
      return p.length === 3 && SUNNAH_ID.test(p[0]) && NUMBER.test(p[1]) && /^[A-Za-z0-9_-]{1,40}$/u.test(p[2]);
    },
    namespace: ref => `sunnah-hadith:${ref.split(':').slice(0, 2).join(':')}:`,
    list: async (_db, ref, readers, options) => {
      const { collection, chapter, section } = parseSunnah(ref);
      return hadithItems(readers, collection, chapter, section, options);
    },
  },
  hadith_collection: {
    noteTypeId: 'stock-hadith-variants',
    validRef: ref => SUNNAH_ID.test(ref),
    namespace: ref => `sunnah-hadith:${ref}:`,
    list: async (_db, ref, readers, options) => {
      const items: SourceItem[] = [];
      for (const chapter of await readers.sunnahChapterNumbers(ref)) items.push(...(await hadithItems(readers, ref, chapter, undefined, options)));
      return items;
    },
  },
  poem: {
    noteTypeId: 'stock-context-cloze',
    noteTypes: POEM_NOTE_TYPES,
    validRef: ref => NUMBER.test(ref),
    namespace: ref => `poem:${ref}`,
    list: async (_db, ref, readers, options) => {
      const item = await poemItem(readers, Number(ref), options);
      return item ? [item] : [];
    },
  },
  poet: {
    noteTypeId: 'stock-context-cloze',
    noteTypes: POEM_NOTE_TYPES,
    validRef: ref => NUMBER.test(ref),
    namespace: () => 'poem:',
    list: async (_db, ref, readers, options) => {
      const items: SourceItem[] = [];
      for (const id of await readers.poetPoemIds(Number(ref))) {
        const item = await poemItem(readers, id, options);
        if (item) items.push(item);
      }
      return items;
    },
  },
};

function labelOf(templateOptions: string | null): string | null {
  if (!templateOptions) return null;
  try {
    const parsed = JSON.parse(templateOptions) as { label?: unknown };
    return typeof parsed.label === 'string' ? parsed.label : null;
  } catch {
    return null;
  }
}

function cardsOf(templateOptions: string | null): HadithCard[] {
  try {
    const parsed = JSON.parse(templateOptions ?? '{}') as { cards?: unknown };
    const cards = Array.isArray(parsed.cards) ? parsed.cards.filter((c): c is HadithCard => (HADITH_CARDS as readonly string[]).includes(c as string)) : [];
    return cards.length ? cards : ['full'];
  } catch {
    return ['full'];
  }
}

function poemOptionsOf(templateOptions: string | null): PoemOptions {
  try {
    const parsed = JSON.parse(templateOptions ?? '{}') as { prompt?: unknown; chunk?: unknown };
    return {
      prompt: parsed.prompt === 'verse' ? 'verse' : 'ajuz',
      chunk: Number.isSafeInteger(parsed.chunk) && (parsed.chunk as number) > 0 && (parsed.chunk as number) <= MAX_DAILY_VERSES ? (parsed.chunk as number) : 0,
    };
  } catch {
    return { ...DEFAULT_POEM_OPTIONS };
  }
}

/** Checks a poem subscription's options (KEY-397). */
export function validatePoemOptions(prompt: unknown, chunk: unknown): PoemOptions {
  if (prompt !== undefined && prompt !== 'ajuz' && prompt !== 'verse') throw new Error('invalid-request');
  if (chunk !== undefined && (!Number.isSafeInteger(chunk) || (chunk as number) < 0 || (chunk as number) > MAX_DAILY_VERSES)) throw new Error('invalid-request');
  return { prompt: (prompt as PoemPrompt | undefined) ?? 'ajuz', chunk: (chunk as number | undefined) ?? 0 };
}

export function validateHadithCards(value: unknown): HadithCard[] {
  if (value === undefined) return ['full'];
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) throw new Error('invalid-request');
  const cards = [...new Set(value)];
  if (!cards.every(c => (HADITH_CARDS as readonly string[]).includes(c as string))) throw new Error('invalid-request');
  return cards as HadithCard[];
}

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

/** Which adapter produced an item ref, and the source to re-read it from. */
function sourceOfItemRef(ref: string): { kind: SupportedSubscriptionKind; sourceRef: string } | null {
  if (ref.startsWith('book-highlight:')) return { kind: 'book_highlights', sourceRef: ref.slice(15, ref.lastIndexOf('/')) };
  if (ref.startsWith('book-comment:')) return { kind: 'book_comments', sourceRef: ref.slice(13, ref.lastIndexOf('/')) };
  if (ref.startsWith('sunnah-hadith:')) {
    const [collection, chapter] = ref.slice(14).split(':');
    return { kind: 'sunnah_book', sourceRef: `${collection}:${chapter}` };
  }
  if (ref.startsWith('poem:')) return { kind: 'poem', sourceRef: ref.slice(5) };
  return null;
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

  constructor(private db: Database, private clock: () => Date = () => new Date(), private readers: SourceReaders = NO_READERS) {
    this.notes = new CardNoteRepository(db);
  }

  // ---------- subscriptions ----------

  list(deckId?: string): DeckSubscription[] {
    const rows = this.db
      .prepare(
        `SELECT id, deck_id, source_kind, source_ref, note_type_id, new_items, last_synced_at, template_options
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
      template_options: string | null;
    }>;
    return rows.map(r => ({
      id: r.id,
      deckId: r.deck_id,
      sourceKind: r.source_kind,
      sourceRef: r.source_ref,
      noteTypeId: r.note_type_id,
      newItems: r.new_items,
      lastSyncedAt: r.last_synced_at,
      label: labelOf(r.template_options) ?? workTitle(this.db, r.source_ref),
      cards: cardsOf(r.template_options),
      ...(r.source_kind === 'poem' || r.source_kind === 'poet' ? { poem: poemOptionsOf(r.template_options) } : {}),
    }));
  }

  get(id: string): DeckSubscription | null {
    return this.list().find(s => s.id === id) ?? null;
  }

  async subscribe(input: { deckId: string; sourceKind: string; sourceRef: string; noteTypeId?: string; newItems?: NewItemsPolicy; cards?: unknown; prompt?: unknown; chunk?: unknown }): Promise<DeckSubscription> {
    if (!isSupportedKind(input.sourceKind)) throw new Error('unsupported-source');
    const adapter = ADAPTERS[input.sourceKind];
    if (typeof input.sourceRef !== 'string' || !adapter.validRef(input.sourceRef)) throw new Error('invalid-request');
    const deck = this.db.prepare(`SELECT kind FROM deck WHERE id = ?`).get(input.deckId) as { kind: string } | undefined;
    if (!deck || deck.kind !== 'normal') throw new Error('invalid-request');
    if (adapter.noteTypeId && input.noteTypeId !== undefined && input.noteTypeId !== adapter.noteTypeId && !adapter.noteTypes?.includes(input.noteTypeId)) throw new Error('invalid-note-type');
    const noteTypeId = (adapter.noteTypeId ? (input.noteTypeId ?? adapter.noteTypeId) : input.noteTypeId) ?? 'stock-basic';
    const type = this.notes.getNoteType(noteTypeId);
    if (!type) throw new Error('invalid-note-type');
    if (!adapter.noteTypeId && (type.fields.length < 2 || type.kind !== 'normal')) throw new Error('invalid-note-type');
    const label = await this.describeSource(input.sourceKind, input.sourceRef);
    if (label === null) throw new Error('source-not-found');
    const cards = validateHadithCards(input.cards);
    const isPoem = input.sourceKind === 'poem' || input.sourceKind === 'poet';
    if (!isPoem && (input.prompt !== undefined || input.chunk !== undefined)) throw new Error('invalid-request');
    const poem = isPoem ? validatePoemOptions(input.prompt, input.chunk) : null;
    const existing = this.db
      .prepare(`SELECT id FROM deck_subscription WHERE deck_id = ? AND source_kind = ? AND source_ref = ?`)
      .get(input.deckId, input.sourceKind, input.sourceRef) as { id: string } | undefined;
    if (existing) return this.get(existing.id)!;
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO deck_subscription (id, deck_id, source_kind, source_ref, note_type_id, template_options, new_items, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(id, input.deckId, input.sourceKind, input.sourceRef, noteTypeId, JSON.stringify(poem ? { label, cards, ...poem } : { label, cards }), input.newItems === 'silent' ? 'silent' : 'toast');
    if (poem && poem.chunk > 0) this.applyDailyQuota(input.deckId, poem.chunk);
    return this.get(id)!;
  }

  /**
   * KEY-397: daily chunking. New verses come in order (deck position), so a long poem is learned
   * in order at `perDay` new verses a day. A deck with no preset of its own gets one (a copy of the
   * default with this new-card limit, new siblings not buried); a deck that already has its own
   * preset keeps it untouched, so the user's settings are never changed silently.
   */
  applyDailyQuota(deckId: string, perDay: number): string | null {
    const deck = this.db.prepare(`SELECT name, preset_id FROM deck WHERE id = ?`).get(deckId) as { name: string; preset_id: string | null } | undefined;
    if (!deck || deck.preset_id) return null;
    const decks = new DeckRepository(this.db);
    const base = decks.getDefaultPreset();
    const preset = decks.savePreset({
      name: `${deck.name} — ${perDay}`.slice(0, 200),
      learnSteps: base.learnSteps,
      relearnSteps: base.relearnSteps,
      newPerDay: perDay,
      reviewsPerDay: base.reviewsPerDay,
      desiredRetention: base.desiredRetention,
      maximumInterval: base.maximumInterval,
      buryNew: false,
      buryReviews: base.buryReviews,
      buryInterday: base.buryInterday,
      leechThreshold: base.leechThreshold,
      leechAction: base.leechAction,
      newOrder: 'position',
      fsrsParams: base.fsrsParams,
    });
    decks.assignPreset(deckId, preset.id);
    return preset.id;
  }

  /** A readable name for the source, or null when it does not exist. */
  private async describeSource(kind: SupportedSubscriptionKind, ref: string): Promise<string | null> {
    if (kind === 'book_highlights' || kind === 'book_comments') {
      return this.db.prepare(`SELECT 1 FROM work WHERE id = ?`).get(ref) ? workTitle(this.db, ref) : null;
    }
    if (kind === 'poem') {
      const poem = await this.readers.poem(Number(ref));
      return poem ? `${poem.title} — ${poem.poetName}` : null;
    }
    if (kind === 'poet') {
      const [first] = await this.readers.poetPoemIds(Number(ref));
      const poem = first ? await this.readers.poem(first) : null;
      return poem ? poem.poetName : null;
    }
    if (kind === 'hadith_collection') {
      return (await this.readers.sunnahChapterNumbers(ref)).length ? this.readers.collectionName(ref) : null;
    }
    const { collection, chapter, section } = parseSunnah(ref);
    const found = await this.readers.sunnahChapter(collection, chapter);
    if (!found) return null;
    const name = `${this.readers.collectionName(collection)} — ${found.title}`;
    if (kind === 'sunnah_book') return name;
    const bab = found.hadiths.find(h => h.sectionNumber === section);
    return bab ? `${name} — ${bab.sectionTitle || section}` : null;
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
    return this.list().filter(s => (s.sourceKind === 'book_highlights' || s.sourceKind === 'book_comments') && s.sourceRef === workId);
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
    const items = await adapter.list(this.db, sub.sourceRef, this.readers, { noteTypeId: sub.noteTypeId, cards: sub.cards ?? ['full'], poem: sub.poem });
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
    let gone = deckNotes.filter(n => !present.has(n.source_ref) && !n.orphaned_at);
    if (gone.length) {
      // Never orphan an item another subscription of this deck still covers (a bab and its book).
      const others = this.list(sub.deckId).filter(o => o.id !== sub.id && isSupportedKind(o.sourceKind));
      if (others.length) {
        const claimed = new Set<string>();
        for (const other of others) {
          for (const item of await ADAPTERS[other.sourceKind as SupportedSubscriptionKind].list(this.db, other.sourceRef, this.readers, { noteTypeId: other.noteTypeId, cards: other.cards ?? ['full'], poem: other.poem })) claimed.add(item.ref);
        }
        gone = gone.filter(n => !claimed.has(n.source_ref));
      }
    }
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

  private fieldsFor(fieldNames: string[], item: SourceItem): Record<string, string> {
    const fields: Record<string, string> = {};
    fieldNames.forEach((name, index) => {
      fields[name] = (item.fields ? item.fields[name] : item.values?.[index]) ?? '';
    });
    return fields;
  }

  private applyItem(sub: DeckSubscription, fieldNames: string[], item: SourceItem, result: SyncResult): void {
    const generated = this.fieldsFor(fieldNames, item);
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
      this.notes.saveNote({ noteTypeId: sub.noteTypeId, fields: generated, sourceRef: item.ref, deckId: sub.deckId, sourceSnapshot: generated, sourceHash: hash, fromSourceSync: true });
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
      if (changed) this.notes.saveNote({ id: note.id, noteTypeId: note.note_type_id, fields: next, fromSourceSync: true });
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

  async pending(): Promise<{
    orphaned: Array<{ noteId: string; front: string; sourceRef: string; orphanedAt: string }>;
    changed: Array<{ noteId: string; isCopy: boolean; fields: string[]; current: Record<string, string>; oldSource: Record<string, string>; newSource: Record<string, string> | null }>;
  }> {
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
    const changed = [];
    for (const r of changedRows.filter(row => this.hasLiveCards(row.id))) {
      const fieldNames = this.notes.getNoteType(r.note_type_id)?.fields.map(f => f.name) ?? [];
      changed.push({
        noteId: r.id,
        isCopy: !!r.copied_from_note_id,
        fields: fieldNames,
        current: JSON.parse(r.fields_json) as Record<string, string>,
        oldSource: r.source_snapshot_json ? (JSON.parse(r.source_snapshot_json) as Record<string, string>) : {},
        newSource: await this.currentSource(r.source_ref, fieldNames, r.note_type_id, JSON.parse(r.fields_json) as Record<string, string>),
      });
    }
    return { orphaned, changed };
  }

  /** The item's fields as the source has them now, or null when it's gone. */
  private async currentSource(sourceRef: string, fieldNames: string[], noteTypeId: string, current: Record<string, string> = {}): Promise<Record<string, string> | null> {
    const origin = sourceOfItemRef(sourceRef);
    if (!origin) return null;
    const cards = HADITH_CARDS.filter(card => (current[card === 'full' ? 'Full card' : card === 'matn' ? 'Matn card' : 'Isnad card'] ?? '').trim());
    const chunk = Number.parseInt(current['Chunk'] ?? '', 10);
    const poem: PoemOptions = { prompt: (current['Whole verse'] ?? '').trim() ? 'verse' : 'ajuz', chunk: Number.isSafeInteger(chunk) && chunk > 0 ? chunk : 0 };
    const item = (await ADAPTERS[origin.kind].list(this.db, origin.sourceRef, this.readers, { noteTypeId, cards: cards.length ? cards : ['full'], poem })).find(i => i.ref === sourceRef);
    return item ? this.fieldsFor(fieldNames, item) : null;
  }

  /** "Update": take the new source for every field. "Keep": keep the user's text, stop asking. */
  async resolveChange(noteId: string, choice: 'update' | 'keep'): Promise<void> {
    const row = this.db.prepare(`SELECT note_type_id, fields_json, source_ref FROM card_note WHERE id = ?`).get(noteId) as
      | { note_type_id: string; fields_json: string; source_ref: string }
      | undefined;
    if (!row) throw new Error('invalid-request');
    const fieldNames = this.notes.getNoteType(row.note_type_id)?.fields.map(f => f.name) ?? [];
    const source = await this.currentSource(row.source_ref, fieldNames, row.note_type_id, JSON.parse(row.fields_json) as Record<string, string>);
    this.db.transaction(() => {
      if (source) {
        if (choice === 'update') this.notes.saveNote({ id: noteId, noteTypeId: row.note_type_id, fields: { ...(JSON.parse(row.fields_json) as Record<string, string>), ...source }, fromSourceSync: true });
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
