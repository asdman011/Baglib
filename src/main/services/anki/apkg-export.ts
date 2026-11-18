/**
 * Baglib — lossless Anki package export (KEY-392; ADR-017).
 *
 * Writes Anki's legacy package (Legacy2: `collection.anki21`, schema 11, JSON `col.models/decks/
 * dconf/conf`, a JSON media map and uncompressed media files). It needs no zstd and Anki 26.09
 * still imports it.
 *
 * Losslessness: everything imported from Anki keeps its Anki JSON in `anki_extra`, so export starts
 * from that JSON and overrides only what BagLib owns (names, fields, templates, CSS, limits).
 * A card whose BagLib schedule hasn't changed since import is written with Anki's original
 * type/queue/due/ivl/factor/left/data; a changed card is translated from BagLib's FSRS state.
 * History keeps its Anki ids, and the archived history of deleted cards is written back when the
 * whole collection is exported.
 *
 * Shared cards (ADR-017 3.8): Anki allows one deck per card, so a card in several exported decks is
 * written once per deck; the copies get a GUID derived from the note GUID and the deck, so
 * re-import maps them back to the same shared card.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { zipSync, type Zippable } from 'fflate';
import { CardMediaStore, CARD_MEDIA_NAME } from '../card-media';
import { SqliteSettingsRepository } from '../../database/repositories/settings.repository';
import { stripHtml } from '../../../shared/revision/template-engine';
import { parseAnkiJson, stringifyAnkiJson } from './protobuf';
import { ANKI_COLLECTION_SETTING, srsFingerprint, type AnkiCollectionSetting } from './apkg-import';
import type { JsonObject } from './apkg-reader';

export interface AnkiExportOptions {
  /** Decks to export, with their sub-decks. Omitted: the whole collection. */
  deckIds?: string[];
  includeScheduling?: boolean;
  includeMedia?: boolean;
  now?: Date;
}

export interface AnkiExportReport {
  notes: number;
  cards: number;
  revlog: number;
  orphanRevlog: number;
  decks: number;
  noteTypes: number;
  media: number;
  bytes: number;
}

const DAY_S = 86_400;

export const SCHEMA11 = `
CREATE TABLE col (id integer PRIMARY KEY, crt integer NOT NULL, mod integer NOT NULL, scm integer NOT NULL, ver integer NOT NULL, dty integer NOT NULL, usn integer NOT NULL, ls integer NOT NULL, conf text NOT NULL, models text NOT NULL, decks text NOT NULL, dconf text NOT NULL, tags text NOT NULL);
CREATE TABLE notes (id integer PRIMARY KEY, guid text NOT NULL, mid integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL, tags text NOT NULL, flds text NOT NULL, sfld integer NOT NULL, csum integer NOT NULL, flags integer NOT NULL, data text NOT NULL);
CREATE TABLE cards (id integer PRIMARY KEY, nid integer NOT NULL, did integer NOT NULL, ord integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL, type integer NOT NULL, queue integer NOT NULL, due integer NOT NULL, ivl integer NOT NULL, factor integer NOT NULL, reps integer NOT NULL, lapses integer NOT NULL, left integer NOT NULL, odue integer NOT NULL, odid integer NOT NULL, flags integer NOT NULL, data text NOT NULL);
CREATE TABLE revlog (id integer PRIMARY KEY, cid integer NOT NULL, usn integer NOT NULL, ease integer NOT NULL, ivl integer NOT NULL, lastIvl integer NOT NULL, factor integer NOT NULL, time integer NOT NULL, type integer NOT NULL);
CREATE TABLE graves (usn integer NOT NULL, oid integer NOT NULL, type integer NOT NULL);
CREATE INDEX ix_notes_usn ON notes (usn);
CREATE INDEX ix_cards_usn ON cards (usn);
CREATE INDEX ix_revlog_usn ON revlog (usn);
CREATE INDEX ix_cards_nid ON cards (nid);
CREATE INDEX ix_cards_sched ON cards (did, queue, due);
CREATE INDEX ix_revlog_cid ON revlog (cid);
CREATE INDEX ix_notes_csum ON notes (csum);
`;

const DEFAULT_DCONF: JsonObject = {
  maxTaken: 60,
  autoplay: true,
  timer: 0,
  replayq: true,
  new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 0], order: 1, perDay: 20 },
  rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
  lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
  dyn: false,
};

function json(text: string | null | undefined): JsonObject {
  if (!text) return {};
  try {
    const v = parseAnkiJson(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonObject) : {};
  } catch {
    return {};
  }
}

/** Anki's note checksum: the first 8 hex digits of SHA-1 of the stripped first field, as an integer. */
export function fieldChecksum(first: string): number {
  return Number.parseInt(crypto.createHash('sha1').update(stripHtml(first)).digest('hex').slice(0, 8), 16);
}

/** A GUID for a shared card's extra copy (ADR-017 3.8): stable for the note and the deck. */
export function derivedGuid(noteGuid: string, deckId: string): string {
  return `b${crypto.createHash('sha1').update(`${noteGuid}\x1f${deckId}`).digest('base64url').slice(0, 9)}`;
}

/** Restores Anki media names in a field from the note's `{stored: original}` map. */
export function restoreMediaRefs(field: string, map: Record<string, string> | undefined): string {
  if (!map) return field;
  let out = field;
  for (const [stored, original] of Object.entries(map)) out = out.split(stored).join(original);
  return out;
}

/** Media names a field refers to (`src="…"`, `[sound:…]`). */
function referencedMedia(field: string): string[] {
  const names: string[] = [];
  for (const m of field.matchAll(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>"']+))/giu)) names.push((m[1] ?? m[2] ?? m[3])!);
  for (const m of field.matchAll(/\[sound:([^\]]+)\]/gu)) names.push(m[1]!);
  return names;
}

/** Unique Anki-style ids (milliseconds) for things BagLib made itself. */
class IdAllocator {
  private next: number;
  /** Anki ids that exist in BagLib, kept free for their owners. */
  private readonly reserved = new Set<number>();
  private readonly taken = new Set<number>();
  constructor(start: number) {
    this.next = start;
  }
  reserve(id: number): void {
    this.reserved.add(id);
  }
  /** The owner's own Anki id when it has one (once); otherwise a fresh id no one else uses. */
  take(preferred?: number | null): number {
    if (preferred && !this.taken.has(preferred)) {
      this.taken.add(preferred);
      return preferred;
    }
    while (this.taken.has(this.next) || this.reserved.has(this.next)) this.next++;
    this.taken.add(this.next);
    return this.next++;
  }
}

interface CardRow {
  knowledge_id: string; note_id: string; ord: number; anki_id: number | null; anki_extra: string | null; created_at: string; updated_at: string;
  state: string | null; due_at: string | null; stability: number | null; difficulty: number | null; reps: number | null; lapses: number | null;
  last_review: string | null; learning_step: number | null; buried_until: string | null; new_position: number | null; desired_retention: number | null;
}

export class AnkiExportService {
  private readonly settings: SqliteSettingsRepository;

  constructor(private readonly db: Database.Database, private readonly media: CardMediaStore = new CardMediaStore()) {
    this.settings = new SqliteSettingsRepository(db);
  }

  exportToFile(outPath: string, options: AnkiExportOptions = {}): AnkiExportReport {
    const now = options.now ?? new Date();
    const includeScheduling = options.includeScheduling !== false;
    const includeMedia = options.includeMedia !== false;
    const nowMs = now.getTime();
    // Anki keeps one id space per table (a note may share its id with a card), so one allocator each.
    const ids = { deck: new IdAllocator(nowMs), note: new IdAllocator(nowMs), card: new IdAllocator(nowMs), model: new IdAllocator(nowMs), conf: new IdAllocator(nowMs) };
    const collection = this.settings.get<AnkiCollectionSetting | null>(ANKI_COLLECTION_SETTING, null);
    const rolloverHour = Number(this.settings.get<number>('srs.rolloverHour', 4) ?? 4) === 0 ? 0 : 4;
    // crt: the imported collection's own, else the rollover moment of today; due days are relative to it.
    const crt = collection?.crt ?? (() => {
      const d = new Date(now);
      d.setHours(rolloverHour, 0, 0, 0);
      return Math.floor(d.getTime() / 1000) - 365 * DAY_S;
    })();
    const dayOf = (isoTime: string) => Math.round((Date.parse(isoTime) / 1000 - crt) / DAY_S);
    const todayDay = Math.floor((nowMs / 1000 - crt) / DAY_S);

    // ---------- which decks ----------
    const allDecks = this.db.prepare(`SELECT id, name, parent_id, kind, preset_id, description, filter_reschedule, anki_id, anki_extra FROM deck`).all() as Array<{
      id: string; name: string; parent_id: string | null; kind: string; preset_id: string | null; description: string | null; filter_reschedule: number | null; anki_id: number | null; anki_extra: string | null;
    }>;
    const byId = new Map(allDecks.map(d => [d.id, d]));
    const children = new Map<string, string[]>();
    for (const d of allDecks) if (d.parent_id) children.set(d.parent_id, [...(children.get(d.parent_id) ?? []), d.id]);
    const selected = new Set<string>();
    const addTree = (id: string) => {
      if (selected.has(id) || !byId.has(id)) return;
      selected.add(id);
      for (const c of children.get(id) ?? []) addTree(c);
    };
    const wholeCollection = !options.deckIds || options.deckIds.length === 0;
    if (wholeCollection) allDecks.forEach(d => selected.add(d.id));
    else options.deckIds!.forEach(addTree);
    // Ancestors are written too, so the tree path stays intact.
    for (const id of [...selected]) for (let p = byId.get(id)?.parent_id; p; p = byId.get(p)?.parent_id) selected.add(p);
    const fullName = (id: string): string => {
      const d = byId.get(id)!;
      return d.parent_id ? `${fullName(d.parent_id)}::${d.name}` : d.name;
    };
    for (const d of allDecks) if (d.anki_id) ids.deck.reserve(d.anki_id);
    const deckAnki = new Map<string, number>();
    for (const id of selected) deckAnki.set(id, ids.deck.take(byId.get(id)!.anki_id));

    // ---------- cards and notes ----------
    const normalSelected = [...selected].filter(id => byId.get(id)!.kind === 'normal');
    const placeholders = normalSelected.map(() => '?').join(',') || 'NULL';
    const memberships = this.db
      .prepare(
        `SELECT dc.deck_id, dc.knowledge_id, dc.position FROM deck_card dc JOIN knowledge k ON k.id = dc.knowledge_id AND k.deleted_at IS NULL
         JOIN card_detail c ON c.knowledge_id = dc.knowledge_id AND c.note_id IS NOT NULL
         WHERE dc.deck_id IN (${placeholders}) ORDER BY dc.added_at, dc.knowledge_id`
      )
      .all(...normalSelected) as Array<{ deck_id: string; knowledge_id: string; position: number }>;
    const cardIds = [...new Set(memberships.map(m => m.knowledge_id))];
    const cardRows = new Map<string, CardRow>();
    const cardStmt = this.db.prepare(
      `SELECT c.knowledge_id, c.note_id, c.ord, c.anki_id, c.anki_extra, k.created_at, k.updated_at, s.state, s.due_at, s.stability, s.difficulty, s.reps, s.lapses,
              s.last_review, s.learning_step, s.buried_until, s.new_position, s.desired_retention
       FROM card_detail c JOIN knowledge k ON k.id = c.knowledge_id LEFT JOIN srs_state s ON s.knowledge_id = c.knowledge_id WHERE c.knowledge_id = ?`
    );
    for (const id of cardIds) cardRows.set(id, cardStmt.get(id) as CardRow);

    // Primary deck of each card: the deck it came from in Anki, else its first membership.
    const primaryDeck = new Map<string, string>();
    for (const m of memberships) {
      const extra = json(cardRows.get(m.knowledge_id)?.anki_extra);
      const fromDid = [...deckAnki.entries()].find(([, a]) => a === Number(extra.odid || extra.did))?.[0];
      if (!primaryDeck.has(m.knowledge_id) || fromDid === m.deck_id) primaryDeck.set(m.knowledge_id, fromDid === m.deck_id ? m.deck_id : primaryDeck.get(m.knowledge_id) ?? m.deck_id);
    }

    const noteIds = [...new Set([...cardRows.values()].map(c => c.note_id))];
    const noteStmt = this.db.prepare(`SELECT id, note_type_id, fields_json, guid, anki_id, anki_extra, created_at, updated_at FROM card_note WHERE id = ?`);
    const notes = new Map(noteIds.map(id => [id, noteStmt.get(id) as { id: string; note_type_id: string; fields_json: string; guid: string; anki_id: number | null; anki_extra: string | null; created_at: string; updated_at: string }]));
    for (const n of notes.values()) if (n.anki_id) ids.note.reserve(n.anki_id);
    for (const c of cardRows.values()) if (c.anki_id) ids.card.reserve(c.anki_id);

    // ---------- note types ----------
    const typeIds = [...new Set([...notes.values()].map(n => n.note_type_id))];
    const typeStmt = this.db.prepare(`SELECT id, name, kind, css, sort_field_ord, anki_id, anki_extra, updated_at FROM card_note_type WHERE id = ?`);
    const models: Record<string, JsonObject> = {};
    const modelOf = new Map<string, { mid: number; fields: string[]; sortf: number }>();
    for (const tid of typeIds) {
      const t = typeStmt.get(tid) as { id: string; name: string; kind: string; css: string; sort_field_ord: number; anki_id: number | null; anki_extra: string | null; updated_at: string };
      if (t.anki_id) ids.model.reserve(t.anki_id);
      const base = json(t.anki_extra);
      const mid = ids.model.take(t.anki_id);
      const baseFlds = ((base.flds ?? []) as JsonObject[]);
      const baseTmpls = ((base.tmpls ?? []) as JsonObject[]);
      const fields = (this.db.prepare(`SELECT ord, name, rtl, font, size_px, CAST(anki_id AS TEXT) AS anki_id FROM card_note_field WHERE note_type_id = ? ORDER BY ord`).all(tid) as Array<{ ord: number; name: string; rtl: number; font: string | null; size_px: number | null; anki_id: string | null }>);
      const tmpls = (this.db.prepare(`SELECT ord, name, front, back, CAST(anki_id AS TEXT) AS anki_id FROM card_note_template WHERE note_type_id = ? ORDER BY ord`).all(tid) as Array<{ ord: number; name: string; front: string; back: string; anki_id: string | null }>);
      const idJson = (text: string | null) => (text === null ? null : Number.isSafeInteger(Number(text)) ? Number(text) : `__i64:${text}`);
      models[String(mid)] = {
        ...base,
        id: mid,
        // Import adds " (Anki)" when the name was taken in BagLib; Anki gets its own name back.
        name: typeof base.name === 'string' && (t.name === base.name || t.name.startsWith(`${base.name} (Anki`)) ? base.name : t.name,
        type: t.kind === 'cloze' || t.kind === 'image_occlusion' ? 1 : 0,
        mod: Math.floor(Date.parse(t.updated_at) / 1000),
        usn: -1,
        sortf: t.sort_field_ord,
        did: base.did ?? null,
        css: t.css,
        latexPre: base.latexPre ?? '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
        latexPost: base.latexPost ?? '\\end{document}',
        latexsvg: base.latexsvg ?? false,
        req: base.req ?? tmpls.map(x => [x.ord, 'any', [0]]),
        flds: fields.map((f, i) => ({
          ...(baseFlds.find(b => String(b.name) === f.name) ?? {}),
          name: f.name,
          ord: i,
          sticky: Boolean(baseFlds.find(b => String(b.name) === f.name)?.sticky),
          rtl: Boolean(f.rtl),
          font: f.font ?? 'Arial',
          size: f.size_px ?? 20,
          id: idJson(f.anki_id),
        })),
        tmpls: tmpls.map((x, i) => ({
          ...(baseTmpls.find(b => String(b.name) === x.name) ?? {}),
          name: x.name,
          ord: i,
          qfmt: x.front,
          afmt: x.back,
          id: idJson(x.anki_id),
        })),
      };
      modelOf.set(tid, { mid, fields: fields.map(f => f.name), sortf: t.sort_field_ord });
    }

    // ---------- presets and decks ----------
    const presetStmt = this.db.prepare(`SELECT * FROM srs_preset WHERE id = ?`);
    const defaultPreset = (this.db.prepare(`SELECT id FROM srs_preset WHERE anki_id = 1 ORDER BY created_at LIMIT 1`).get() as { id: string } | undefined)?.id
      ?? (this.db.prepare(`SELECT id FROM srs_preset ORDER BY created_at LIMIT 1`).get() as { id: string } | undefined)?.id ?? null;
    const dconf: Record<string, JsonObject> = {};
    const confOf = new Map<string, number>();
    const effectivePreset = (deckId: string): string | null => {
      for (let d: string | null | undefined = deckId; d; d = byId.get(d)?.parent_id) if (byId.get(d)?.preset_id) return byId.get(d)!.preset_id;
      return defaultPreset;
    };
    const confFor = (presetId: string | null): number => {
      if (!presetId) return 1;
      const known = confOf.get(presetId);
      if (known) return known;
      const p = presetStmt.get(presetId) as Record<string, unknown> | undefined;
      if (!p) return 1;
      const base = { ...DEFAULT_DCONF, ...json(p.anki_extra as string | null) } as JsonObject;
      const confId = ids.conf.take(Number(p.anki_id) || null);
      const learn = JSON.parse(String(p.learn_steps)) as number[];
      const relearn = JSON.parse(String(p.relearn_steps)) as number[];
      dconf[String(confId)] = {
        ...base,
        id: confId,
        name: String(p.name),
        mod: Math.floor(Date.parse(String(p.updated_at)) / 1000),
        usn: -1,
        new: { ...(base.new as JsonObject), delays: learn, perDay: Number(p.new_per_day), bury: Boolean(p.bury_new), order: p.new_order === 'random' ? 0 : 1 },
        rev: { ...(base.rev as JsonObject), perDay: Number(p.reviews_per_day), maxIvl: Number(p.maximum_interval), bury: Boolean(p.bury_reviews) },
        lapse: { ...(base.lapse as JsonObject), delays: relearn, leechFails: Number(p.leech_threshold), leechAction: p.leech_action === 'suspend' ? 0 : 1 },
        buryInterdayLearning: Boolean(p.bury_interday),
        desiredRetention: Number(p.desired_retention),
        ...(p.fsrs_params ? { fsrsParams6: JSON.parse(String(p.fsrs_params)) as number[] } : {}),
      };
      confOf.set(presetId, confId);
      return confId;
    };
    const decks: Record<string, JsonObject> = {};
    for (const id of selected) {
      const d = byId.get(id)!;
      const base = json(d.anki_extra);
      const aid = deckAnki.get(id)!;
      const common = {
        lrnToday: [todayDay, 0], revToday: [todayDay, 0], newToday: [todayDay, 0], timeToday: [todayDay, 0],
        collapsed: false, browserCollapsed: false,
        ...base,
        id: aid,
        name: fullName(id),
        mod: Math.floor(nowMs / 1000),
        usn: -1,
        desc: d.description ?? (base.desc as string | undefined) ?? '',
      };
      decks[String(aid)] = d.kind === 'filtered'
        ? { resched: Boolean(d.filter_reschedule), terms: [['', 100, 0]], separate: true, delays: null, previewDelay: 0, ...common, dyn: 1 }
        : { extendNew: 0, extendRev: 0, ...common, dyn: 0, conf: confFor(effectivePreset(id)) };
    }
    if (!decks['1']) decks['1'] = { id: 1, name: 'Default', mod: Math.floor(nowMs / 1000), usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0], collapsed: false, browserCollapsed: false, desc: '', dyn: 0, conf: 1, extendNew: 0, extendRev: 0 };
    if (!dconf['1']) dconf['1'] = { ...DEFAULT_DCONF, id: 1, name: 'Default', mod: Math.floor(nowMs / 1000), usn: -1 };

    // ---------- write the collection ----------
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-apkg-'));
    const colPath = path.join(dir, 'collection.anki21');
    const out = new Database(colPath);
    const report: AnkiExportReport = { notes: 0, cards: 0, revlog: 0, orphanRevlog: 0, decks: Object.keys(decks).length, noteTypes: Object.keys(models).length, media: 0, bytes: 0 };
    const mediaNames = new Set<string>();
    try {
      // A private temp file: no journal, one transaction (tens of thousands of rows).
      out.pragma('journal_mode = OFF');
      out.pragma('synchronous = OFF');
      out.exec(SCHEMA11);
      out.exec('BEGIN');
      const conf = { ...(collection?.conf ?? {}), rollover: rolloverHour, schedVer: 2, sched2021: true, curDeck: Number([...deckAnki.values()][0] ?? 1), activeDecks: [1] };
      out.prepare(`INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '{}')`).run(crt, nowMs, nowMs, stringifyAnkiJson(conf), stringifyAnkiJson(models), stringifyAnkiJson(decks), stringifyAnkiJson(dconf));
      const insertNote = out.prepare(`INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, ?, ?)`);
      const insertCard = out.prepare(`INSERT INTO cards VALUES (?, ?, ?, ?, ?, -1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const insertRev = out.prepare(`INSERT OR IGNORE INTO revlog VALUES (?, ?, -1, ?, ?, ?, ?, ?, ?)`);
      const tagsOf = this.db.prepare(`SELECT t.name FROM knowledge_tag kt JOIN tag t ON t.id = kt.tag_id WHERE kt.knowledge_id = ?`);
      const logsOf = this.db.prepare(`SELECT reviewed_at, rating, duration_ms, state_before, entry_kind, interval, last_interval, factor, anki_id FROM srs_review_log WHERE knowledge_id = ? ORDER BY reviewed_at`);

      const cardsOfNote = new Map<string, string[]>();
      for (const c of cardRows.values()) cardsOfNote.set(c.note_id, [...(cardsOfNote.get(c.note_id) ?? []), c.knowledge_id]);

      // One Anki note per (note, deck copy): the primary keeps the GUID and ids; copies get derived ones.
      const written = new Map<string, number>();
      const writeNote = (noteId: string, copyDeck: string | null) => {
        const key = `${noteId}\x1f${copyDeck ?? ''}`;
        const known = written.get(key);
        if (known) return known;
        const n = notes.get(noteId)!;
        const m = modelOf.get(n.note_type_id)!;
        const extra = json(n.anki_extra);
        const fields = JSON.parse(n.fields_json) as Record<string, string>;
        const values = m.fields.map(name => restoreMediaRefs(fields[name] ?? '', extra.media as Record<string, string> | undefined));
        if (includeMedia) for (const v of values) for (const ref of referencedMedia(v)) mediaNames.add(ref);
        const nid = copyDeck ? ids.note.take() : ids.note.take(n.anki_id);
        const tagSet = new Set<string>();
        for (const cardId of cardsOfNote.get(noteId) ?? []) for (const t of tagsOf.all(cardId) as Array<{ name: string }>) tagSet.add(t.name.replace(/\s+/gu, '_'));
        const tags = tagSet.size ? ` ${[...tagSet].sort().join(' ')} ` : '';
        const sortText = stripHtml(values[m.sortf] ?? '');
        insertNote.run(
          nid,
          copyDeck ? derivedGuid(n.guid, copyDeck) : n.guid,
          m.mid,
          Number(extra.mod) && !copyDeck && Date.parse(n.updated_at) <= Number(extra.mod) * 1000 ? Number(extra.mod) : Math.floor(Date.parse(n.updated_at) / 1000),
          tags,
          values.join('\x1f'),
          /^\d+$/u.test(sortText) && sortText.length < 16 ? Number(sortText) : sortText,
          fieldChecksum(values[0] ?? ''),
          Number(extra.flags) || 0,
          typeof extra.data === 'string' ? extra.data : ''
        );
        written.set(key, nid);
        report.notes++;
        return nid;
      };

      for (const m of memberships) {
        const c = cardRows.get(m.knowledge_id)!;
        const isPrimary = primaryDeck.get(c.knowledge_id) === m.deck_id;
        const nid = writeNote(c.note_id, isPrimary ? null : m.deck_id);
        const cid = isPrimary ? ids.card.take(c.anki_id) : ids.card.take();
        const did = deckAnki.get(m.deck_id)!;
        const s = this.cardScheduling(c, { includeScheduling, dayOf, todayDay, nowMs, position: m.position });
        insertCard.run(cid, nid, did, c.ord, Math.floor(Date.parse(c.updated_at) / 1000), s.type, s.queue, s.due, s.ivl, s.factor, s.reps, s.lapses, s.left, 0, 0, s.flags, s.data);
        report.cards++;
        if (includeScheduling && isPrimary) {
          for (const r of logsOf.all(c.knowledge_id) as Array<{ reviewed_at: string; rating: number; duration_ms: number | null; state_before: string | null; entry_kind: string; interval: number | null; last_interval: number | null; factor: number | null; anki_id: number | null }>) {
            const before = json(r.state_before);
            const ankiType = typeof (before.anki as JsonObject | undefined)?.type === 'number' ? Number((before.anki as JsonObject).type) : { learn: 0, review: 1, relearn: 2, filtered: 3, reset: 4, rescheduled: 4 }[r.entry_kind] ?? 1;
            const rid = r.anki_id ?? Date.parse(r.reviewed_at);
            insertRev.run(rid, cid, r.rating, r.interval ?? 0, r.last_interval ?? 0, r.factor ?? 0, r.duration_ms ?? 0, ankiType);
            report.revlog++;
          }
        }
      }

      if (includeScheduling && wholeCollection) {
        const orphans = this.db.prepare(`SELECT id, cid, ease, ivl, last_ivl, factor, time, type FROM anki_orphan_revlog ORDER BY id`).all() as Array<{ id: number; cid: number; ease: number; ivl: number; last_ivl: number; factor: number; time: number; type: number }>;
        for (const o of orphans) {
          if (insertRev.run(o.id, o.cid, o.ease, o.ivl, o.last_ivl, o.factor, o.time, o.type).changes) report.orphanRevlog++;
        }
      }
      out.exec('COMMIT');
    } finally {
      out.close();
    }

    // ---------- package ----------
    const zip: Zippable = { 'collection.anki21': [new Uint8Array(fs.readFileSync(colPath)), { level: 6 }] };
    const mediaMap: Record<string, string> = {};
    if (includeMedia) {
      let i = 0;
      const storedByOriginal = new Map<string, string>();
      for (const n of notes.values()) for (const [stored, original] of Object.entries((json(n.anki_extra).media ?? {}) as Record<string, string>)) storedByOriginal.set(original, stored);
      for (const name of mediaNames) {
        const stored = storedByOriginal.get(name) ?? (CARD_MEDIA_NAME.test(name) ? name : null);
        const bytes = stored ? this.media.readBytes(stored) : null;
        if (!bytes) continue;
        zip[String(i)] = [bytes, { level: 0 }];
        mediaMap[String(i)] = name;
        i++;
      }
      report.media = i;
    }
    zip.media = [new TextEncoder().encode(JSON.stringify(mediaMap)), { level: 6 }];
    const bytes = zipSync(zip);
    fs.writeFileSync(outPath, bytes);
    report.bytes = bytes.length;
    fs.rmSync(dir, { recursive: true, force: true });
    return report;
  }

  /** BagLib schedule → Anki card fields; untouched imported cards keep Anki's exact values. */
  private cardScheduling(c: CardRow, ctx: { includeScheduling: boolean; dayOf: (iso: string) => number; todayDay: number; nowMs: number; position: number }) {
    const extra = json(c.anki_extra);
    const flags = Number(extra.flags) || 0;
    const newCard = { type: 0, queue: 0, due: c.new_position ?? ctx.position ?? 0, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, flags, data: '' };
    if (!ctx.includeScheduling || !c.state) return newCard;
    const unchanged = typeof extra.srs === 'string' && extra.srs === srsFingerprint({ state: c.state, due_at: c.due_at!, stability: c.stability, difficulty: c.difficulty, reps: c.reps ?? 0, lapses: c.lapses ?? 0, buried_until: c.buried_until });
    if (unchanged) {
      const odid = Number(extra.odid) || 0;
      return {
        type: Number(extra.type), queue: Number(extra.queue) === 4 ? 0 : Number(extra.queue),
        due: odid ? Number(extra.odue) : Number(extra.due),
        ivl: Number(extra.ivl), factor: Number(extra.factor), reps: c.reps ?? 0, lapses: c.lapses ?? 0, left: Number(extra.left), flags,
        data: typeof extra.data === 'string' ? extra.data : '',
      };
    }
    const lastReviewS = c.last_review ? Math.floor(Date.parse(c.last_review) / 1000) : undefined;
    const memory: JsonObject = { ...json(typeof extra.data === 'string' ? extra.data : null) };
    if (c.stability !== null) memory.s = Number(c.stability.toFixed(4));
    if (c.difficulty !== null) memory.d = Number(c.difficulty.toFixed(4));
    if (c.desired_retention !== null) memory.dr = c.desired_retention;
    if (lastReviewS) memory.lrt = lastReviewS;
    const data = Object.keys(memory).length ? JSON.stringify(memory) : '';
    const base = { reps: c.reps ?? 0, lapses: c.lapses ?? 0, flags, data, factor: Number(extra.factor) || 2500 };
    let row: { type: number; queue: number; due: number; ivl: number; left: number };
    if (c.state === 'new' || (c.state === 'suspended' && !c.reps)) {
      row = { type: 0, queue: 0, due: c.new_position ?? ctx.position ?? 0, ivl: 0, left: 0 };
      if (c.state === 'new') return { ...newCard, ...row, data };
    } else if (c.state === 'review' || c.state === 'suspended') {
      const due = ctx.dayOf(c.due_at!);
      const ivl = lastReviewS ? Math.max(1, Math.round((Date.parse(c.due_at!) / 1000 - lastReviewS) / DAY_S)) : Math.max(1, Number(extra.ivl) || 1);
      row = { type: 2, queue: 2, due, ivl, left: 0 };
    } else {
      const dueMs = Date.parse(c.due_at!);
      const interday = ctx.dayOf(c.due_at!) > ctx.todayDay;
      row = { type: c.state === 'relearning' ? 3 : 1, queue: interday ? 3 : 1, due: interday ? ctx.dayOf(c.due_at!) : Math.floor(dueMs / 1000), ivl: Number(extra.ivl) || 0, left: Math.max(1, Number(extra.left) % 1000 || 1) };
    }
    if (c.state === 'suspended') row.queue = -1;
    else if (c.buried_until && Date.parse(c.buried_until) > ctx.nowMs) row.queue = -3;
    return { ...base, ...row };
  }
}
