/**
 * Baglib — reads an Anki package (.apkg / .colpkg) into one plain model (KEY-392).
 *
 * Formats (verified in Anki 26.09.4, rslib/src/import_export/package/):
 * - `meta` (protobuf PackageMetadata) says which collection file is inside; without it the package
 *   is legacy: `collection.anki21` (Legacy2) or `collection.anki2` (Legacy1).
 * - Latest: `collection.anki21b` is a zstd-compressed schema-18 SQLite file; `media` is a
 *   zstd-compressed protobuf MediaEntries list; media files are stored as "0", "1", … each
 *   zstd-compressed.
 * - Legacy: schema-11 SQLite with JSON in `col.models/decks/dconf/conf`; `media` is a JSON map
 *   {"0": "name.mp3"}; media files are stored uncompressed.
 *
 * Whatever the source, note types, decks and deck options come out in Anki's own schema-11 JSON
 * shape. The importer keeps that JSON in `anki_extra`, so export can write back every Anki setting
 * BagLib doesn't use, exactly as it was.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { unzipSync } from 'fflate';
import { decompress as zstdDecompress } from 'fzstd';
import {
  parseProto,
  protoBool,
  protoBytes,
  protoFloat,
  protoFloats,
  protoHas,
  protoInt,
  protoInt64,
  parseAnkiJson,
  protoMessage,
  protoMessages,
  protoSint,
  protoString,
  protoUint,
  protoUints,
  tidyFloat,
  type ProtoMessage,
} from './protobuf';

export const MAX_APKG_BYTES = 2 * 1024 * 1024 * 1024;

export type JsonObject = Record<string, unknown>;

export interface AnkiNoteRow { id: number; guid: string; mid: number; mod: number; usn: number; tags: string; flds: string; sfld: string; csum: number; flags: number; data: string }
export interface AnkiCardRow { id: number; nid: number; did: number; ord: number; mod: number; usn: number; type: number; queue: number; due: number; ivl: number; factor: number; reps: number; lapses: number; left: number; odue: number; odid: number; flags: number; data: string }
export interface AnkiRevlogRow { id: number; cid: number; usn: number; ease: number; ivl: number; lastIvl: number; factor: number; time: number; type: number }

export interface AnkiCollectionModel {
  /** Package layout the data came from. */
  version: 'legacy1' | 'legacy2' | 'latest';
  schema: 11 | 18;
  crt: number;
  /** Collection config (`col.conf` in schema 11, the `config` table in schema 18). */
  conf: JsonObject;
  models: Map<number, JsonObject>;
  decks: Map<number, JsonObject>;
  dconf: Map<number, JsonObject>;
  notes: AnkiNoteRow[];
  cards: AnkiCardRow[];
  revlog: AnkiRevlogRow[];
  /** Media in package order; `data` is null when the package lists a file it doesn't carry. */
  media: Array<{ name: string; data: Uint8Array | null }>;
}

const utf8 = new TextDecoder('utf-8');

function zipEntry(zip: Record<string, Uint8Array>, name: string): Uint8Array | undefined {
  return zip[name];
}

/** Opens a SQLite image read-only from a private temp file, and always removes it. */
function withSqlite<T>(bytes: Uint8Array, fn: (db: Database.Database) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-anki-'));
  const file = path.join(dir, 'collection.sqlite');
  fs.writeFileSync(file, bytes);
  let db: Database.Database | null = null;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    return fn(db);
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function parseJson(text: unknown, fallback: JsonObject = {}): JsonObject {
  if (typeof text !== 'string' || !text) return fallback;
  try {
    const v = parseAnkiJson(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonObject) : fallback;
  } catch {
    return fallback;
  }
}

/** The `other` bytes field (255) of Anki's protobuf configs holds extra JSON keys. */
function otherJson(msg: ProtoMessage): JsonObject {
  const raw = protoBytes(msg, 255);
  return raw && raw.length ? parseJson(utf8.decode(raw)) : {};
}

const optionalInt = (msg: ProtoMessage, field: number): number | string | null => protoInt64(msg, field);
const optionalUint = (msg: ProtoMessage, field: number): number | null => (protoHas(msg, field) ? protoUint(msg, field) : null);

// ---------------------------------------------------------------------------
// Schema 18 → schema-11 JSON (mirrors rslib's From impls)
// ---------------------------------------------------------------------------

const REQ_KIND = ['none', 'any', 'all'];

function notetypeFrom18(db: Database.Database, row: { id: number; name: string; mtime_secs: number; usn: number; config: Uint8Array }): JsonObject {
  const cfg = parseProto(row.config);
  const fields = (db.prepare(`SELECT ord, name, config FROM fields NOT INDEXED WHERE ntid = ? ORDER BY ord`).all(row.id) as Array<{ ord: number; name: string; config: Uint8Array }>).map(f => {
    const c = parseProto(f.config);
    return {
      ...otherJson(c),
      name: f.name,
      ord: f.ord,
      sticky: protoBool(c, 1),
      rtl: protoBool(c, 2),
      font: protoString(c, 3),
      size: protoUint(c, 4),
      description: protoString(c, 5),
      plainText: protoBool(c, 6),
      collapsed: protoBool(c, 7),
      excludeFromSearch: protoBool(c, 8),
      id: optionalInt(c, 9),
      tag: optionalUint(c, 10),
      preventDeletion: protoBool(c, 11),
    };
  });
  const tmpls = (db.prepare(`SELECT ord, name, mtime_secs, usn, config FROM templates NOT INDEXED WHERE ntid = ? ORDER BY ord`).all(row.id) as Array<{ ord: number; name: string; mtime_secs: number; usn: number; config: Uint8Array }>).map(t => {
    const c = parseProto(t.config);
    const did = protoInt(c, 5);
    return {
      ...otherJson(c),
      name: t.name,
      ord: t.ord,
      qfmt: protoString(c, 1),
      afmt: protoString(c, 2),
      bqfmt: protoString(c, 3),
      bafmt: protoString(c, 4),
      did: did > 0 ? did : null,
      bfont: protoString(c, 6),
      bsize: protoUint(c, 7),
      id: optionalInt(c, 8),
    };
  });
  const req = protoMessages(cfg, 8).map(r => [protoUint(r, 1), REQ_KIND[protoUint(r, 2)] ?? 'none', protoUints(r, 3)]);
  const json: JsonObject = {
    ...otherJson(cfg),
    id: row.id,
    name: row.name,
    type: protoUint(cfg, 1),
    mod: row.mtime_secs,
    usn: row.usn,
    sortf: protoUint(cfg, 2),
    did: null,
    tmpls,
    flds: fields,
    css: protoString(cfg, 3),
    latexPre: protoString(cfg, 5),
    latexPost: protoString(cfg, 6),
    latexsvg: protoBool(cfg, 7),
    req,
  };
  const stock = protoUint(cfg, 9);
  if (stock) json.originalStockKind = stock;
  const originalId = optionalInt(cfg, 10);
  if (originalId !== null) json.originalId = originalId;
  return json;
}

const FILTER_ORDER_COUNT = 11;

function deckFrom18(row: { id: number; name: string; mtime_secs: number; usn: number; common: Uint8Array; kind: Uint8Array }): JsonObject {
  const common = parseProto(row.common);
  const kind = parseProto(row.kind);
  const today = (count: number) => [protoUint(common, 3), count];
  const base: JsonObject = {
    ...otherJson(common),
    id: row.id,
    mod: row.mtime_secs,
    name: row.name.split('\x1f').join('::'),
    usn: row.usn,
    lrnToday: today(protoInt(common, 6)),
    revToday: today(protoInt(common, 5)),
    newToday: today(protoInt(common, 4)),
    timeToday: today(protoInt(common, 7)),
    collapsed: protoBool(common, 1),
    browserCollapsed: protoBool(common, 2),
  };
  if (protoHas(kind, 2)) {
    const f = protoMessage(kind, 2);
    return {
      ...base,
      desc: '',
      dyn: 1,
      resched: protoBool(f, 1),
      terms: protoMessages(f, 2).map(t => [protoString(t, 1), protoUint(t, 2), Math.min(protoUint(t, 3), FILTER_ORDER_COUNT - 1)]),
      separate: true,
      delays: protoFloats(f, 3).length ? protoFloats(f, 3).map(tidyFloat) : null,
      previewDelay: protoUint(f, 4),
      previewAgainSecs: protoUint(f, 7),
      previewHardSecs: protoUint(f, 5),
      previewGoodSecs: protoUint(f, 6),
    };
  }
  const n = protoMessage(kind, 1);
  const dayLimit = (field: number) => {
    if (!protoHas(n, field)) return null;
    const m = protoMessage(n, field);
    return { limit: protoUint(m, 1), today: protoUint(m, 2) };
  };
  const json: JsonObject = {
    ...base,
    desc: protoString(n, 4),
    dyn: 0,
    conf: protoInt(n, 1) || 1,
    extendNew: protoUint(n, 2),
    extendRev: protoUint(n, 3),
    reviewLimit: optionalUint(n, 6),
    newLimit: optionalUint(n, 7),
    reviewLimitToday: dayLimit(8),
    newLimitToday: dayLimit(9),
    desiredRetention: protoHas(n, 10) ? Math.round(protoFloat(n, 10) * 100) : null,
  };
  if (protoBool(n, 5)) json.md = true;
  return json;
}

function dconfFrom18(row: { id: number; name: string; mtime_secs: number; usn: number; config: Uint8Array }): JsonObject {
  const c = parseProto(row.config);
  const floats = (f: number) => protoFloats(c, f).map(tidyFloat);
  const learn = floats(1);
  return {
    ...otherJson(c),
    id: row.id,
    mod: row.mtime_secs,
    name: row.name,
    usn: row.usn,
    maxTaken: protoUint(c, 24),
    autoplay: !protoBool(c, 23),
    timer: protoBool(c, 25) ? 1 : 0,
    replayq: !protoBool(c, 26),
    new: {
      bury: protoBool(c, 27),
      delays: learn,
      initialFactor: Math.round(tidyFloat(protoFloat(c, 11)) * 1000),
      ints: [protoUint(c, 18), protoUint(c, 19), 0],
      order: protoUint(c, 20) === 1 ? 0 : 1,
      perDay: protoUint(c, 9),
    },
    rev: {
      bury: protoBool(c, 28),
      ease4: tidyFloat(protoFloat(c, 12)),
      ivlFct: tidyFloat(protoFloat(c, 15)),
      maxIvl: protoUint(c, 16),
      perDay: protoUint(c, 10),
      hardFactor: tidyFloat(protoFloat(c, 13)),
    },
    lapse: {
      delays: floats(2),
      leechAction: protoUint(c, 21),
      leechFails: protoUint(c, 22),
      minInt: protoUint(c, 17),
      mult: tidyFloat(protoFloat(c, 14)),
    },
    dyn: false,
    newMix: protoUint(c, 30),
    newPerDayMinimum: protoUint(c, 35),
    interdayLearningMix: protoUint(c, 31),
    reviewOrder: protoUint(c, 33),
    newSortOrder: protoUint(c, 32),
    newGatherPriority: protoUint(c, 34),
    buryInterdayLearning: protoBool(c, 29),
    fsrsWeights: floats(3),
    fsrsParams5: floats(5),
    fsrsParams6: floats(6),
    desiredRetention: tidyFloat(protoFloat(c, 37)),
    ignoreRevlogsBeforeDate: protoString(c, 46),
    easyDaysPercentages: floats(4),
    stopTimerOnAnswer: protoBool(c, 38),
    secondsToShowQuestion: tidyFloat(protoFloat(c, 41)),
    secondsToShowAnswer: tidyFloat(protoFloat(c, 42)),
    questionAction: protoUint(c, 36),
    answerAction: protoUint(c, 43),
    waitForAudio: protoBool(c, 44, true),
    sm2Retention: tidyFloat(protoFloat(c, 40)),
    weightSearch: protoString(c, 45),
  };
}

// ---------------------------------------------------------------------------
// Reading the collection
// ---------------------------------------------------------------------------

function readCollection(db: Database.Database): Omit<AnkiCollectionModel, 'version' | 'media'> {
  const col = db.prepare(`SELECT crt, ver, conf, models, decks, dconf FROM col LIMIT 1`).get() as { crt: number; ver: number; conf: string; models: string; decks: string; dconf: string } | undefined;
  if (!col) throw new Error('anki-invalid-collection');
  const schema: 11 | 18 = col.ver >= 15 ? 18 : 11;
  const models = new Map<number, JsonObject>();
  const decks = new Map<number, JsonObject>();
  const dconf = new Map<number, JsonObject>();
  let conf: JsonObject;

  if (schema === 18) {
    for (const row of db.prepare(`SELECT id, name, mtime_secs, usn, config FROM notetypes NOT INDEXED`).all() as Array<{ id: number; name: string; mtime_secs: number; usn: number; config: Uint8Array }>) {
      models.set(row.id, notetypeFrom18(db, row));
    }
    for (const row of db.prepare(`SELECT id, name, mtime_secs, usn, common, kind FROM decks NOT INDEXED`).all() as Array<{ id: number; name: string; mtime_secs: number; usn: number; common: Uint8Array; kind: Uint8Array }>) {
      decks.set(row.id, deckFrom18(row));
    }
    for (const row of db.prepare(`SELECT id, name, mtime_secs, usn, config FROM deck_config NOT INDEXED`).all() as Array<{ id: number; name: string; mtime_secs: number; usn: number; config: Uint8Array }>) {
      dconf.set(row.id, dconfFrom18(row));
    }
    conf = {};
    for (const row of db.prepare(`SELECT KEY AS k, val FROM config`).all() as Array<{ k: string; val: Uint8Array | string }>) {
      const text = typeof row.val === 'string' ? row.val : utf8.decode(row.val);
      try {
        conf[row.k] = parseAnkiJson(text);
      } catch {
        conf[row.k] = text;
      }
    }
  } else {
    for (const [k, v] of Object.entries(parseJson(col.models))) models.set(Number(k), v as JsonObject);
    for (const [k, v] of Object.entries(parseJson(col.decks))) decks.set(Number(k), v as JsonObject);
    for (const [k, v] of Object.entries(parseJson(col.dconf))) dconf.set(Number(k), v as JsonObject);
    conf = parseJson(col.conf);
  }

  const notes = db.prepare(`SELECT id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data FROM notes ORDER BY id`).all() as AnkiNoteRow[];
  const cards = db.prepare(`SELECT id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data FROM cards ORDER BY id`).all() as AnkiCardRow[];
  const revlog = db.prepare(`SELECT id, cid, usn, ease, ivl, lastIvl, factor, time, type FROM revlog ORDER BY id`).all() as AnkiRevlogRow[];
  for (const n of notes) n.sfld = String(n.sfld ?? '');
  return { schema, crt: col.crt, conf, models, decks, dconf, notes, cards, revlog };
}

/** Media name → bytes, from either media-list format. */
function readMedia(zip: Record<string, Uint8Array>, latest: boolean): Array<{ name: string; data: Uint8Array | null }> {
  const list = zipEntry(zip, 'media');
  if (!list || list.length === 0) return [];
  const out: Array<{ name: string; data: Uint8Array | null }> = [];
  const take = (zipName: string) => {
    const raw = zipEntry(zip, zipName);
    if (!raw) return null;
    return latest ? zstdDecompress(raw) : raw;
  };
  if (latest) {
    const entries = protoMessages(parseProto(zstdDecompress(list)), 1);
    entries.forEach((e, i) => {
      const name = protoString(e, 1);
      const zipName = protoHas(e, 255) ? String(protoUint(e, 255)) : String(i);
      if (name) out.push({ name, data: take(zipName) });
    });
  } else {
    const map = parseJson(utf8.decode(list));
    for (const [zipName, name] of Object.entries(map)) {
      if (typeof name === 'string' && name) out.push({ name, data: take(zipName) });
    }
  }
  return out;
}

/** A media file name that is safe as a plain file name (no folders, no control characters). */
export function isSafeMediaName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && !/[\\/\0\x01-\x1f]/u.test(name) && name !== '.' && name !== '..';
}

/** Reads an .apkg or .colpkg file. Throws `anki-invalid-package` for anything else. */
export function readAnkiPackage(filePath: string): AnkiCollectionModel {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size < 22) throw new Error('anki-invalid-package');
  if (stat.size > MAX_APKG_BYTES) throw new Error('anki-package-too-large');
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(new Uint8Array(fs.readFileSync(filePath)));
  } catch {
    throw new Error('anki-invalid-package');
  }
  let version: AnkiCollectionModel['version'];
  const meta = zipEntry(zip, 'meta');
  if (meta && meta.length) {
    const v = protoUint(parseProto(meta), 1);
    if (v === 3) version = 'latest';
    else if (v === 2) version = 'legacy2';
    else if (v === 1) version = 'legacy1';
    else throw new Error('anki-package-too-new');
  } else {
    version = zipEntry(zip, 'collection.anki21') ? 'legacy2' : 'legacy1';
  }
  const fileName = version === 'latest' ? 'collection.anki21b' : version === 'legacy2' ? 'collection.anki21' : 'collection.anki2';
  const raw = zipEntry(zip, fileName);
  if (!raw) throw new Error('anki-invalid-package');
  const sqlite = version === 'latest' ? zstdDecompress(raw) : raw;
  const collection = withSqlite(sqlite, readCollection);
  const media = readMedia(zip, version === 'latest').filter(m => isSafeMediaName(m.name));
  return { version, media, ...collection };
}

/** SHA-1 hex of bytes (Anki's media checksum, and BagLib's card-media name). */
export function sha1Hex(bytes: Uint8Array): string {
  return crypto.createHash('sha1').update(bytes).digest('hex');
}

/** Exposed for tests and the export side. */
export const __internal = { notetypeFrom18, deckFrom18, dconfFrom18, protoSint };
