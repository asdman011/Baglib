/**
 * Baglib — lossless Anki package import (KEY-392; ADR-017).
 *
 * Every Anki item has a home in BagLib's model:
 * - note types → card_note_type / card_note_field / card_note_template (Anki JSON kept in anki_extra)
 * - deck options → srs_preset; decks (`A::B`) → the deck tree; notes → card_note (Anki GUID kept)
 * - cards → knowledge + card_detail (note_id, ord) + deck_card + srs_state, with FSRS memory from
 *   `cards.data` and Anki's raw scheduling fields in anki_extra
 * - revlog → srs_review_log (anki_id unique, so history is never doubled); history of cards Anki
 *   no longer has → anki_orphan_revlog
 * - media → card-media/<sha1>.<type>; note fields point at those names and remember the originals
 *
 * Re-import matches notes by GUID with Anki's policies: update when newer, always, or never.
 * Note types match by Anki id; when the fields differ, they are merged (new fields appended) or,
 * without merging, imported as a separate type, as Anki does.
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { CardMediaStore } from '../card-media';
import { SqliteSettingsRepository } from '../../database/repositories/settings.repository';
import { renderTemplate } from '../../../shared/revision/template-engine';
import { I64_MARKER, stringifyAnkiJson } from './protobuf';
import { readAnkiPackage, type AnkiCardRow, type AnkiCollectionModel, type AnkiNoteRow, type JsonObject } from './apkg-reader';

export type ReimportPolicy = 'if-newer' | 'always' | 'never';

export interface AnkiImportOptions {
  policy?: ReimportPolicy;
  mergeNoteTypes?: boolean;
  now?: Date;
}

export interface AnkiImportReport {
  version: AnkiCollectionModel['version'];
  noteTypes: { added: number; merged: number; reused: number };
  presets: { added: number; reused: number };
  decks: { added: number; reused: number };
  notes: { added: number; updated: number; skipped: number };
  cards: { added: number; updated: number; skipped: number };
  revlog: { added: number; duplicate: number };
  orphanRevlog: { added: number; duplicate: number };
  media: { stored: number; missing: number };
  ms: number;
}

/** Collection-level values kept for export (crt, rollover and Anki's own config). */
export const ANKI_COLLECTION_SETTING = 'anki.collection.v1';

export interface AnkiCollectionSetting {
  crt: number;
  conf: JsonObject;
  importedAt: string;
}

const DAY_S = 86_400;
const STOCK_KIND: Record<number, string> = { 1: 'basic', 2: 'basic_reversed', 3: 'basic_optional_reversed', 4: 'basic_typing', 5: 'cloze', 6: 'image_occlusion' };

/** SQLite INTEGER binding for an Anki id that may be an I64_MARKER string. */
export function ankiIdParam(value: unknown): number | bigint | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.startsWith(I64_MARKER)) return BigInt(value.slice(I64_MARKER.length));
  return null;
}

const iso = (ms: number) => new Date(ms).toISOString();
const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
};
const steps = (v: unknown): number[] =>
  (Array.isArray(v) ? v : []).map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 10);

function htmlAttr(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

/** Replaces Anki media references (`src="x"`, `[sound:x]`) by stored names; returns the names used. */
export function rewriteMediaRefs(field: string, map: Map<string, string>): { text: string; used: Map<string, string> } {
  const used = new Map<string, string>();
  if (!map.size || (!field.includes('src') && !field.includes('[sound:'))) return { text: field, used };
  const lookup = (raw: string) => map.get(raw) ?? map.get(raw.replace(/&amp;/gu, '&')) ?? (() => {
    try {
      return map.get(decodeURIComponent(raw));
    } catch {
      return undefined;
    }
  })();
  // Quoted names may contain spaces (common in Anki); unquoted ones end at a space.
  let text = field.replace(/(<img\b[^>]*?\bsrc\s*=\s*)(?:"([^"]+)"|'([^']+)'|([^\s>"']+))/giu, (whole, pre: string, dq?: string, sq?: string, bare?: string) => {
    const name = dq ?? sq ?? bare ?? '';
    const stored = lookup(name);
    if (!stored) return whole;
    used.set(stored, name);
    // Only the name changes; the quoting stays as Anki had it, so export restores the field exactly.
    return `${pre}${whole.slice(pre.length).replace(name, stored)}`;
  });
  text = text.replace(/\[sound:([^\]]+)\]/gu, (whole, name: string) => {
    const stored = lookup(name);
    if (!stored) return whole;
    used.set(stored, name);
    return `[sound:${stored}]`;
  });
  return { text, used };
}

function parseData(data: string): JsonObject {
  if (!data) return {};
  try {
    const v = JSON.parse(data) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonObject) : {};
  } catch {
    return {};
  }
}

/** A fingerprint of a card's BagLib schedule, to tell on export whether it changed since import. */
export function srsFingerprint(s: { state: string; due_at: string; stability: number | null; difficulty: number | null; reps: number; lapses: number; buried_until?: string | null }): string {
  return [s.state, s.due_at, s.stability ?? '', s.difficulty ?? '', s.reps, s.lapses, s.buried_until ?? ''].join('|');
}

export class AnkiImportService {
  private readonly settings: SqliteSettingsRepository;

  constructor(private readonly db: Database.Database, private readonly media: CardMediaStore = new CardMediaStore()) {
    this.settings = new SqliteSettingsRepository(db);
  }

  importFile(filePath: string, options: AnkiImportOptions = {}): AnkiImportReport {
    return this.importModel(readAnkiPackage(filePath), options);
  }

  importModel(model: AnkiCollectionModel, options: AnkiImportOptions = {}): AnkiImportReport {
    const started = Date.now();
    const policy: ReimportPolicy = options.policy ?? 'if-newer';
    const now = options.now ?? new Date();
    const nowIso = now.toISOString();
    const report: AnkiImportReport = {
      version: model.version,
      noteTypes: { added: 0, merged: 0, reused: 0 },
      presets: { added: 0, reused: 0 },
      decks: { added: 0, reused: 0 },
      notes: { added: 0, updated: 0, skipped: 0 },
      cards: { added: 0, updated: 0, skipped: 0 },
      revlog: { added: 0, duplicate: 0 },
      orphanRevlog: { added: 0, duplicate: 0 },
      media: { stored: 0, missing: 0 },
      ms: 0,
    };

    // Media first (files, outside the transaction): Anki name → stored card-media name.
    const mediaMap = new Map<string, string>();
    for (const m of model.media) {
      if (!m.data) {
        report.media.missing++;
        continue;
      }
      try {
        mediaMap.set(m.name, this.media.saveAny(m.data));
        report.media.stored++;
      } catch {
        report.media.missing++;
      }
    }

    // Anki's crt is the rollover moment of the collection's first day, so day N starts at crt + N days.
    const crt = model.crt;
    const dayToIso = (day: number) => iso((crt + day * DAY_S) * 1000);
    // The next rollover after now, for buried cards (Anki unburies them at the next day).
    const nextDayStart = (() => {
      const elapsedDays = Math.floor((now.getTime() / 1000 - crt) / DAY_S);
      return dayToIso(elapsedDays + 1);
    })();

    this.db.transaction(() => {
      const previous = this.settings.get<AnkiCollectionSetting | null>(ANKI_COLLECTION_SETTING, null);
      if (!previous) this.settings.set(ANKI_COLLECTION_SETTING, { crt, conf: model.conf, importedAt: nowIso } satisfies AnkiCollectionSetting);

      // ---------- deck options → presets ----------
      const presetByConf = new Map<number, string>();
      const findPreset = this.db.prepare(`SELECT id FROM srs_preset WHERE anki_id = ? ORDER BY created_at LIMIT 1`);
      const insertPreset = this.db.prepare(
        `INSERT INTO srs_preset (id, name, learn_steps, relearn_steps, new_per_day, reviews_per_day, desired_retention, maximum_interval,
           bury_new, bury_reviews, bury_interday, leech_threshold, leech_action, new_order, fsrs_params, anki_id, anki_extra, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const [confId, c] of model.dconf) {
        const existing = findPreset.get(confId) as { id: string } | undefined;
        if (existing) {
          presetByConf.set(confId, existing.id);
          report.presets.reused++;
          continue;
        }
        const n = (c.new ?? {}) as JsonObject;
        const r = (c.rev ?? {}) as JsonObject;
        const l = (c.lapse ?? {}) as JsonObject;
        const p6 = Array.isArray(c.fsrsParams6) ? (c.fsrsParams6 as number[]) : [];
        const id = randomUUID();
        insertPreset.run(
          id,
          String(c.name ?? 'Anki').slice(0, 200),
          JSON.stringify(steps(n.delays).length ? steps(n.delays) : [1, 10]),
          JSON.stringify(steps(l.delays).length ? steps(l.delays) : [10]),
          clamp(n.perDay, 0, 9999, 20),
          clamp(r.perDay, 0, 9999, 200),
          clamp(c.desiredRetention || 0.9, 0.7, 0.99, 0.9),
          clamp(r.maxIvl, 1, 36500, 36500),
          n.bury ? 1 : 0,
          r.bury ? 1 : 0,
          c.buryInterdayLearning ? 1 : 0,
          clamp(l.leechFails, 1, 99, 8),
          Number(l.leechAction) === 0 ? 'suspend' : 'tag',
          Number(n.order) === 0 ? 'random' : 'position',
          p6.length === 21 ? JSON.stringify(p6) : null,
          confId,
          stringifyAnkiJson(c),
          nowIso,
          nowIso
        );
        presetByConf.set(confId, id);
        report.presets.added++;
      }

      // ---------- decks ----------
      const deckByAnki = new Map<number, string>();
      const findDeckByAnki = this.db.prepare(`SELECT id FROM deck WHERE anki_id = ? LIMIT 1`);
      const findDeckByName = this.db.prepare(`SELECT id FROM deck WHERE name = ? AND ((? IS NULL AND parent_id IS NULL) OR parent_id = ?) LIMIT 1`);
      const insertDeck = this.db.prepare(
        `INSERT INTO deck (id, name, parent_id, kind, preset_id, filter_search, filter_limit, filter_order, filter_reschedule, description, anki_id, anki_extra, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)`
      );
      const setDeckAnki = this.db.prepare(`UPDATE deck SET anki_id = ?, anki_extra = ?, updated_at = ? WHERE id = ? AND anki_id IS NULL`);
      const usedDeckIds = new Set<number>(model.cards.map(c => (c.odid ? c.odid : c.did)));
      const decks = [...model.decks.values()].sort((a, b) => String(a.name).split('::').length - String(b.name).split('::').length);
      for (const d of decks) {
        const ankiId = Number(d.id);
        const parts = String(d.name ?? '').split('::').map(s => s.trim()).filter(Boolean);
        if (!parts.length) continue;
        // Anki's built-in empty "Default" deck is not worth a BagLib deck.
        if (ankiId === 1 && !usedDeckIds.has(1) && !decks.some(o => String(o.name).startsWith(`${String(d.name)}::`))) continue;
        const byAnki = findDeckByAnki.get(ankiId) as { id: string } | undefined;
        if (byAnki) {
          deckByAnki.set(ankiId, byAnki.id);
          report.decks.reused++;
          continue;
        }
        let parent: string | null = null;
        for (let i = 0; i < parts.length; i++) {
          const name = parts[i]!.slice(0, 200);
          const isLeaf = i === parts.length - 1;
          const found = findDeckByName.get(name, parent, parent) as { id: string } | undefined;
          if (found) {
            if (isLeaf) {
              setDeckAnki.run(ankiId, stringifyAnkiJson(d), nowIso, found.id);
              report.decks.reused++;
            }
            parent = found.id;
            continue;
          }
          const id = randomUUID();
          const filtered = isLeaf && Number(d.dyn) === 1;
          insertDeck.run(
            id,
            name,
            parent,
            filtered ? 'filtered' : 'normal',
            isLeaf && !filtered ? presetByConf.get(Number(d.conf)) ?? null : null,
            filtered ? (d.resched ? 1 : 0) : null,
            isLeaf && typeof d.desc === 'string' && d.desc ? d.desc : null,
            isLeaf ? ankiId : null,
            isLeaf ? stringifyAnkiJson(d) : null,
            nowIso,
            nowIso
          );
          report.decks.added++;
          parent = id;
        }
        if (parent) deckByAnki.set(ankiId, parent);
      }

      // ---------- note types ----------
      const typeByModel = new Map<number, { id: string; fields: string[] }>();
      const findTypes = this.db.prepare(`SELECT id FROM card_note_type WHERE anki_id = ? ORDER BY updated_at DESC`);
      const typeFields = this.db.prepare(`SELECT name FROM card_note_field WHERE note_type_id = ? ORDER BY ord`);
      const insertType = this.db.prepare(
        `INSERT INTO card_note_type (id, name, kind, stock_kind, css, sort_field_ord, anki_id, anki_extra, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insertField = this.db.prepare(`INSERT INTO card_note_field (note_type_id, ord, name, rtl, font, size_px, source_text, anki_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`);
      const insertTemplate = this.db.prepare(`INSERT INTO card_note_template (note_type_id, ord, name, front, back, anki_id) VALUES (?, ?, ?, ?, ?, ?)`);
      const maxTemplateOrd = this.db.prepare(`SELECT COALESCE(MAX(ord), -1) AS m FROM card_note_template WHERE note_type_id = ?`);
      const nameTaken = this.db.prepare(`SELECT 1 FROM card_note_type WHERE name = ?`);
      for (const [mid, m] of model.models) {
        const flds = ((m.flds ?? []) as JsonObject[]).slice().sort((a, b) => Number(a.ord) - Number(b.ord));
        const tmpls = ((m.tmpls ?? []) as JsonObject[]).slice().sort((a, b) => Number(a.ord) - Number(b.ord));
        const fieldNames = flds.map(f => String(f.name));
        let chosen: { id: string; fields: string[] } | null = null;
        for (const row of findTypes.all(mid) as Array<{ id: string }>) {
          const names = (typeFields.all(row.id) as Array<{ name: string }>).map(f => f.name);
          if (names.join('\x1f') === fieldNames.join('\x1f')) {
            chosen = { id: row.id, fields: names };
            report.noteTypes.reused++;
            break;
          }
          if (options.mergeNoteTypes) {
            const missing = fieldNames.filter(n => !names.includes(n));
            missing.forEach((name, i) => {
              const f = flds.find(x => String(x.name) === name)!;
              insertField.run(row.id, names.length + i, name, f.rtl ? 1 : 0, f.font ? String(f.font) : null, Number(f.size) || null, ankiIdParam(f.id));
            });
            let nextOrd = (maxTemplateOrd.get(row.id) as { m: number }).m;
            const haveTemplates = new Set((this.db.prepare(`SELECT name FROM card_note_template WHERE note_type_id = ?`).all(row.id) as Array<{ name: string }>).map(t => t.name));
            for (const t of tmpls) if (!haveTemplates.has(String(t.name))) insertTemplate.run(row.id, ++nextOrd, String(t.name), String(t.qfmt ?? ''), String(t.afmt ?? ''), ankiIdParam(t.id));
            chosen = { id: row.id, fields: [...names, ...missing] };
            report.noteTypes.merged++;
            break;
          }
        }
        if (!chosen) {
          const id = randomUUID();
          const isCloze = Number(m.type) === 1;
          const stock = Number(m.originalStockKind) || 0;
          let name = String(m.name ?? 'Anki').slice(0, 200);
          if (nameTaken.get(name)) name = `${name} (Anki)`;
          for (let i = 2; nameTaken.get(name); i++) name = `${String(m.name).slice(0, 190)} (Anki ${i})`;
          insertType.run(
            id,
            name,
            isCloze ? (stock === 6 ? 'image_occlusion' : 'cloze') : 'normal',
            STOCK_KIND[stock] ?? null,
            String(m.css ?? ''),
            clamp(m.sortf, 0, Math.max(0, flds.length - 1), 0),
            mid,
            stringifyAnkiJson(m),
            nowIso,
            nowIso
          );
          flds.forEach((f, i) => insertField.run(id, i, String(f.name), f.rtl ? 1 : 0, f.font ? String(f.font) : null, Number(f.size) || null, ankiIdParam(f.id)));
          tmpls.forEach((t, i) => insertTemplate.run(id, i, String(t.name), String(t.qfmt ?? ''), String(t.afmt ?? ''), ankiIdParam(t.id)));
          chosen = { id, fields: fieldNames };
          report.noteTypes.added++;
        }
        typeByModel.set(mid, chosen);
      }

      // ---------- tags ----------
      const tagIds = new Map<string, string>();
      const insertTag = this.db.prepare(`INSERT OR IGNORE INTO tag (id, name, origin) VALUES (?, ?, 'anki')`);
      const selectTag = this.db.prepare(`SELECT id FROM tag WHERE name = ?`);
      const tagId = (name: string) => {
        let id = tagIds.get(name);
        if (!id) {
          insertTag.run(randomUUID(), name);
          id = (selectTag.get(name) as { id: string }).id;
          tagIds.set(name, id);
        }
        return id;
      };
      const linkTag = this.db.prepare(`INSERT OR IGNORE INTO knowledge_tag (knowledge_id, tag_id) VALUES (?, ?)`);

      // ---------- notes ----------
      const noteMap = new Map<number, { id: string; type: { id: string; fields: string[] }; fields: Record<string, string>; write: boolean; tags: string[] }>();
      const findNote = this.db.prepare(`SELECT id, note_type_id, updated_at FROM card_note WHERE guid = ?`);
      const insertNote = this.db.prepare(
        `INSERT INTO card_note (id, note_type_id, fields_json, guid, anki_id, anki_extra, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const updateNote = this.db.prepare(`UPDATE card_note SET fields_json = ?, anki_id = ?, anki_extra = ?, updated_at = ? WHERE id = ?`);
      const noteExtra = (n: AnkiNoteRow, used: Map<string, string>) =>
        JSON.stringify({ mod: n.mod, usn: n.usn, flags: n.flags, data: n.data, media: used.size ? Object.fromEntries(used) : undefined });
      for (const n of model.notes) {
        const type = typeByModel.get(n.mid);
        if (!type) {
          report.notes.skipped++;
          continue;
        }
        const values = n.flds.split('\x1f');
        const used = new Map<string, string>();
        const fields: Record<string, string> = {};
        const model18 = model.models.get(n.mid);
        const modelFields = ((model18?.flds ?? []) as JsonObject[]).slice().sort((a, b) => Number(a.ord) - Number(b.ord)).map(f => String(f.name));
        modelFields.forEach((name, i) => {
          const r = rewriteMediaRefs(values[i] ?? '', mediaMap);
          r.used.forEach((v, k) => used.set(k, v));
          fields[name] = r.text;
        });
        for (const name of type.fields) if (!(name in fields)) fields[name] = '';
        const tags = n.tags.trim().split(/\s+/u).filter(Boolean);
        const existing = findNote.get(n.guid) as { id: string; note_type_id: string; updated_at: string } | undefined;
        if (!existing) {
          const id = randomUUID();
          insertNote.run(id, type.id, JSON.stringify(fields), n.guid, n.id, noteExtra(n, used), iso(n.id), iso(n.mod * 1000));
          noteMap.set(n.id, { id, type, fields, write: true, tags });
          report.notes.added++;
          continue;
        }
        const newer = n.mod * 1000 > Date.parse(existing.updated_at);
        const write = existing.note_type_id === type.id && (policy === 'always' || (policy === 'if-newer' && newer));
        if (write) {
          updateNote.run(JSON.stringify(fields), n.id, noteExtra(n, used), iso(n.mod * 1000), existing.id);
          report.notes.updated++;
        } else {
          report.notes.skipped++;
        }
        noteMap.set(n.id, { id: existing.id, type: { id: existing.note_type_id, fields: type.fields }, fields, write, tags });
      }

      // ---------- cards ----------
      const templatesFor = this.db.prepare(`SELECT ord, front, back FROM card_note_template WHERE note_type_id = ? ORDER BY ord`);
      const typeKind = this.db.prepare(`SELECT kind FROM card_note_type WHERE id = ?`);
      const templateCache = new Map<string, { kind: string; templates: Array<{ ord: number; front: string; back: string }> }>();
      const typeInfo = (id: string) => {
        let info = templateCache.get(id);
        if (!info) {
          info = { kind: (typeKind.get(id) as { kind: string }).kind, templates: templatesFor.all(id) as Array<{ ord: number; front: string; back: string }> };
          templateCache.set(id, info);
        }
        return info;
      };
      const render = (typeId: string, fields: Record<string, string>, ord: number) => {
        const info = typeInfo(typeId);
        const cloze = info.kind === 'cloze' || info.kind === 'image_occlusion';
        const t = cloze ? info.templates[0] : info.templates.find(x => x.ord === ord) ?? info.templates[0];
        if (!t) return { front: '', back: '' };
        const ctx = { fields, cardOrd: ord, clozeNum: cloze ? ord + 1 : undefined };
        const front = renderTemplate(t.front, ctx, 'front');
        return { front, back: renderTemplate(t.back, { ...ctx, frontRendered: front }, 'back') };
      };
      const findCard = this.db.prepare(`SELECT knowledge_id FROM card_detail WHERE note_id = ? AND ord = ?`);
      const insertKnowledge = this.db.prepare(`INSERT INTO knowledge (id, knowledge_type, created_at, updated_at) VALUES (?, 'card', ?, ?)`);
      const insertDetail = this.db.prepare(
        `INSERT INTO card_detail (knowledge_id, note_id, ord, front, back, source_kind, source_ref, question_kind, anki_id, anki_extra) VALUES (?, ?, ?, ?, ?, 'note', NULL, 'recall', ?, ?)`
      );
      const updateDetail = this.db.prepare(`UPDATE card_detail SET front = ?, back = ?, anki_id = ?, anki_extra = ? WHERE knowledge_id = ?`);
      const linkDeck = this.db.prepare(`INSERT OR IGNORE INTO deck_card (deck_id, knowledge_id, position, added_at) VALUES (?, ?, ?, ?)`);
      const upsertSrs = this.db.prepare(
        `INSERT INTO srs_state (knowledge_id, state, due_at, stability, difficulty, reps, lapses, last_review, learning_step, buried_until, new_position, desired_retention)
         VALUES (@id, @state, @due_at, @stability, @difficulty, @reps, @lapses, @last_review, @learning_step, @buried_until, @new_position, @desired_retention)
         ON CONFLICT(knowledge_id) DO UPDATE SET state = excluded.state, due_at = excluded.due_at, stability = excluded.stability, difficulty = excluded.difficulty,
           reps = excluded.reps, lapses = excluded.lapses, last_review = excluded.last_review, learning_step = excluded.learning_step,
           buried_until = excluded.buried_until, new_position = excluded.new_position, desired_retention = excluded.desired_retention`
      );
      const lastAnswer = new Map<number, number>();
      for (const r of model.revlog) if (r.ease > 0) lastAnswer.set(r.cid, Math.max(lastAnswer.get(r.cid) ?? 0, r.id));
      const presetSteps = (deckAnki: number, relearn: boolean) => {
        const conf = model.dconf.get(Number(model.decks.get(deckAnki)?.conf ?? 1));
        return steps(((relearn ? conf?.lapse : conf?.new) as JsonObject | undefined)?.delays).length || (relearn ? 1 : 2);
      };

      const cardMap = new Map<number, string>();
      for (const c of model.cards) {
        const note = noteMap.get(c.nid);
        if (!note) {
          report.cards.skipped++;
          continue;
        }
        const homeDeck = c.odid ? c.odid : c.did;
        const deckId = deckByAnki.get(homeDeck) ?? null;
        const due = c.odid && c.odue ? c.odue : c.due;
        const data = parseData(c.data);
        const { front, back } = render(note.type.id, note.fields, c.ord);
        const srs = this.srsFromAnki(c, due, data, {
          dayToIso,
          nextDayStart,
          lastAnswerMs: lastAnswer.get(c.id),
          totalSteps: presetSteps(homeDeck, c.type === 3),
          nowIso,
        });
        const extra = JSON.stringify({ type: c.type, queue: c.queue, due: c.due, ivl: c.ivl, factor: c.factor, left: c.left, odue: c.odue, odid: c.odid, did: c.did, flags: c.flags, data: c.data, mod: c.mod, usn: c.usn, srs: srsFingerprint(srs) });
        const existing = findCard.get(note.id, c.ord) as { knowledge_id: string } | undefined;
        let knowledgeId: string;
        if (existing) {
          knowledgeId = existing.knowledge_id;
          if (note.write) {
            updateDetail.run(front, back, c.id, extra, knowledgeId);
            upsertSrs.run({ id: knowledgeId, ...srs });
            report.cards.updated++;
          } else {
            report.cards.skipped++;
          }
        } else {
          knowledgeId = randomUUID();
          insertKnowledge.run(knowledgeId, iso(c.id), iso(c.mod * 1000));
          insertDetail.run(knowledgeId, note.id, c.ord, front, back, c.id, extra);
          upsertSrs.run({ id: knowledgeId, ...srs });
          report.cards.added++;
        }
        if (deckId) linkDeck.run(deckId, knowledgeId, c.type === 0 ? due : 0, iso(c.id));
        for (const t of note.tags) linkTag.run(knowledgeId, tagId(t));
        cardMap.set(c.id, knowledgeId);
      }

      // ---------- review history ----------
      const insertLog = this.db.prepare(
        `INSERT OR IGNORE INTO srs_review_log (id, knowledge_id, reviewed_at, rating, duration_ms, state_before, entry_kind, interval, last_interval, factor, anki_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insertOrphan = this.db.prepare(
        `INSERT OR IGNORE INTO anki_orphan_revlog (id, cid, ease, ivl, last_ivl, factor, time, type, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const r of model.revlog) {
        const knowledgeId = cardMap.get(r.cid);
        if (!knowledgeId) {
          const res = insertOrphan.run(r.id, r.cid, r.ease, r.ivl, r.lastIvl, r.factor, r.time, r.type, nowIso);
          if (res.changes) report.orphanRevlog.added++;
          else report.orphanRevlog.duplicate++;
          continue;
        }
        const kind = revlogKind(r.type, r.ease, r.ivl);
        const rating = kind === 'reset' || kind === 'rescheduled' ? 0 : Math.min(4, Math.max(1, r.ease));
        const stateBefore = JSON.stringify({ version: 1, anki: { type: r.type, ease: r.ease }, ...(r.type === 0 && r.lastIvl === 0 ? { before: { state: 0 } } : {}) });
        const res = insertLog.run(randomUUID(), knowledgeId, iso(r.id), rating, Math.max(0, r.time), stateBefore, kind, r.ivl, r.lastIvl, r.factor, r.id);
        if (res.changes) report.revlog.added++;
        else report.revlog.duplicate++;
      }
    })();

    report.ms = Date.now() - started;
    return report;
  }

  /** Anki card scheduling → BagLib srs_state (ADR-017 3.6). */
  private srsFromAnki(
    c: AnkiCardRow,
    due: number,
    data: JsonObject,
    ctx: { dayToIso: (day: number) => string; nextDayStart: string; lastAnswerMs?: number; totalSteps: number; nowIso: string }
  ) {
    const s = typeof data.s === 'number' ? data.s : null;
    const d = typeof data.d === 'number' ? data.d : null;
    const lrt = typeof data.lrt === 'number' ? data.lrt * 1000 : ctx.lastAnswerMs ?? null;
    const remaining = c.left % 1000;
    let state: 'new' | 'learning' | 'review' | 'relearning' | 'suspended';
    let dueAt: string;
    if (c.type === 0) {
      state = 'new';
      dueAt = iso(c.id);
    } else if (c.type === 1 || c.type === 3) {
      state = c.type === 1 ? 'learning' : 'relearning';
      // Queue 1 holds an epoch time; queue 3 (and a suspended/buried card) holds a day number.
      dueAt = due > 1_000_000_000 ? iso(due * 1000) : ctx.dayToIso(due);
    } else {
      state = 'review';
      dueAt = ctx.dayToIso(due);
    }
    if (c.queue === -1) state = 'suspended';
    const memoryKnown = s !== null && d !== null;
    return {
      state,
      due_at: dueAt,
      // Cards scheduled by SM-2 carry no FSRS memory; the interval is the closest stand-in.
      stability: memoryKnown ? s : c.type === 2 ? Math.max(0.1, c.ivl) : null,
      difficulty: memoryKnown ? d : c.type === 2 ? 5 : null,
      reps: c.reps,
      lapses: c.lapses,
      last_review: lrt ? iso(lrt) : null,
      learning_step: c.type === 1 || c.type === 3 ? Math.max(0, ctx.totalSteps - remaining) : 0,
      buried_until: c.queue === -2 || c.queue === -3 ? ctx.nextDayStart : null,
      new_position: c.type === 0 ? due : typeof data.pos === 'number' ? data.pos : null,
      desired_retention: typeof data.dr === 'number' ? data.dr : null,
    };
  }
}

/** Anki revlog.type → srs_review_log.entry_kind (ADR-017 3.6). */
export function revlogKind(type: number, ease: number, ivl: number): 'learn' | 'review' | 'relearn' | 'filtered' | 'reset' | 'rescheduled' {
  if (type === 0) return ease === 0 ? 'reset' : 'learn';
  if (type === 1) return ease === 0 ? 'rescheduled' : 'review';
  if (type === 2) return ease === 0 ? 'rescheduled' : 'relearn';
  if (type === 3) return ease === 0 ? 'rescheduled' : 'filtered';
  if (type === 4) return ivl === 0 ? 'reset' : 'rescheduled';
  return 'rescheduled';
}

export const __test = { htmlAttr };
