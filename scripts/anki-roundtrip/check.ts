/**
 * KEY-392 losslessness check: import an Anki package into a throwaway BagLib database, export it
 * again, and compare the two collections item by item.
 *
 *   ELECTRON_RUN_AS_NODE=1 electron node_modules/tsx/dist/cli.mjs scripts/anki-roundtrip/check.ts <package> [outDir]
 *
 * The package is only read. Everything is written under outDir (default .baglib-data/key392-roundtrip).
 * Compared: notes (GUID, note type and field names, fields, tags), cards (note, ordinal, deck path,
 * type, queue, due, interval, ease, reps, lapses, left, flags, FSRS memory), every revlog row
 * including history of deleted cards, the deck tree, deck options and media names.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { CardMediaStore } from '../../src/main/services/card-media';
import { AnkiImportService } from '../../src/main/services/anki/apkg-import';
import { AnkiExportService } from '../../src/main/services/anki/apkg-export';
import { readAnkiPackage, type AnkiCollectionModel, type JsonObject } from '../../src/main/services/anki/apkg-reader';

// Optional third argument: an Anki collection.media folder. Backups (.colpkg) carry no media, so the
// files the notes refer to are read from it (read only) and added before the round-trip.
const [input, outArg, mediaDirArg] = process.argv.slice(2);
if (!input || !fs.existsSync(input)) {
  console.error('usage: check.ts <package> [outDir]');
  process.exit(2);
}
const outDir = path.resolve(outArg ?? '.baglib-data/key392-roundtrip');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const db = new Database(path.join(outDir, 'baglib.db'));
db.pragma('foreign_keys = ON');
runMigrations(db, migrations);
const media = new CardMediaStore(path.join(outDir, 'card-media'));

const original = readAnkiPackage(input);
if (mediaDirArg && fs.existsSync(mediaDirArg) && original.media.length === 0) {
  const wanted = new Set<string>();
  for (const n of original.notes) {
    for (const m of n.flds.matchAll(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>"']+))/giu)) wanted.add((m[1] ?? m[2] ?? m[3])!);
    for (const m of n.flds.matchAll(/\[sound:([^\]]+)\]/gu)) wanted.add(m[1]!);
  }
  for (const name of wanted) {
    const file = path.join(mediaDirArg, name);
    if (!name.includes('/') && !name.includes('\\') && fs.existsSync(file) && fs.statSync(file).isFile()) original.media.push({ name, data: new Uint8Array(fs.readFileSync(file)) });
  }
  console.error(`[roundtrip] added ${original.media.length} of ${wanted.size} referenced media files from ${mediaDirArg}`);
}
let t = Date.now();
const imported = new AnkiImportService(db, media).importModel(original);
const importMs = Date.now() - t;
const outFile = path.join(outDir, 'roundtrip.apkg');
t = Date.now();
const exported = new AnkiExportService(db, media).exportToFile(outFile);
const exportMs = Date.now() - t;
const back = readAnkiPackage(outFile);
t = Date.now();
const reimport = new AnkiImportService(db, media).importModel(back);
const reimportMs = Date.now() - t;

const problems: string[] = [];
const note = (msg: string) => {
  if (problems.length < 60) problems.push(msg);
};

const deckPath = (m: AnkiCollectionModel, did: number) => String(m.decks.get(did)?.name ?? `?${did}`);
const fieldNames = (m: AnkiCollectionModel, mid: number) => ((m.models.get(mid)?.flds ?? []) as JsonObject[]).sort((a, b) => Number(a.ord) - Number(b.ord)).map(f => String(f.name)).join('|');
const tagSet = (tags: string) => tags.trim().split(/\s+/u).filter(Boolean).sort().join(' ');
const mem = (data: string) => {
  try {
    const d = JSON.parse(data || '{}') as JsonObject;
    return `${d.s ?? ''}/${d.d ?? ''}/${d.dr ?? ''}/${d.lrt ?? ''}`;
  } catch {
    return '';
  }
};

// Notes, by GUID.
const backNotes = new Map(back.notes.map(n => [n.guid, n]));
for (const n of original.notes) {
  const b = backNotes.get(n.guid);
  if (!b) {
    note(`note ${n.guid} missing`);
    continue;
  }
  if (n.flds !== b.flds) note(`note ${n.guid} fields differ`);
  if (tagSet(n.tags) !== tagSet(b.tags)) note(`note ${n.guid} tags differ: "${n.tags}" vs "${b.tags}"`);
  if (String(original.models.get(n.mid)?.name) !== String(back.models.get(b.mid)?.name)) note(`note ${n.guid} note type differs`);
  if (fieldNames(original, n.mid) !== fieldNames(back, b.mid)) note(`note ${n.guid} field names differ`);
  if (n.id !== b.id) note(`note ${n.guid} id ${n.id} -> ${b.id}`);
}

// Cards, by Anki id.
const backCards = new Map(back.cards.map(c => [c.id, c]));
const guidOf = (m: AnkiCollectionModel) => new Map(m.notes.map(n => [n.id, n.guid]));
const og = guidOf(original);
const bg = guidOf(back);
const keys = ['ord', 'type', 'queue', 'due', 'ivl', 'factor', 'reps', 'lapses', 'left', 'flags'] as const;
for (const c of original.cards) {
  const b = backCards.get(c.id);
  if (!b) {
    note(`card ${c.id} missing`);
    continue;
  }
  if (og.get(c.nid) !== bg.get(b.nid)) note(`card ${c.id} note differs`);
  const home = c.odid || c.did;
  if (deckPath(original, home) !== deckPath(back, b.did)) note(`card ${c.id} deck ${deckPath(original, home)} -> ${deckPath(back, b.did)}`);
  for (const k of keys) {
    const want = k === 'due' && c.odid ? c.odue : c[k];
    if (want !== b[k]) note(`card ${c.id} ${k} ${want} -> ${b[k]}`);
  }
  if (mem(c.data) !== mem(b.data)) note(`card ${c.id} memory ${mem(c.data)} -> ${mem(b.data)}`);
}

// Every revlog row, including history of deleted cards.
const backRev = new Map(back.revlog.map(r => [r.id, r]));
let revSame = 0;
for (const r of original.revlog) {
  const b = backRev.get(r.id);
  if (!b) {
    note(`revlog ${r.id} missing`);
    continue;
  }
  const a = [r.cid, r.ease, r.ivl, r.lastIvl, r.factor, r.time, r.type].join(',');
  const z = [b.cid, b.ease, b.ivl, b.lastIvl, b.factor, b.time, b.type].join(',');
  if (a !== z) note(`revlog ${r.id} ${a} -> ${z}`);
  else revSame++;
}

const usedDecks = new Set(original.cards.map(c => deckPath(original, c.odid || c.did)));
for (const d of usedDecks) if (![...back.decks.values()].some(x => String(x.name) === d)) note(`deck ${d} missing`);
const optionNames = (m: AnkiCollectionModel) => [...m.dconf.values()].map(x => String(x.name)).sort().join('|');
const usedConf = new Set([...original.decks.values()].filter(d => usedDecks.has(String(d.name))).map(d => Number(d.conf)));
for (const id of usedConf) {
  const name = String(original.dconf.get(id)?.name);
  if (!optionNames(back).split('|').includes(name)) note(`deck options ${name} missing`);
}
const mediaNames = (m: AnkiCollectionModel) => m.media.filter(x => x.data).map(x => x.name).sort().join('|');
if (mediaNames(original) !== mediaNames(back)) note('media names differ');

const result = {
  input: path.basename(input),
  original: { version: original.version, notes: original.notes.length, cards: original.cards.length, revlog: original.revlog.length, decks: original.decks.size, models: original.models.size, media: original.media.length },
  imported,
  exported,
  back: { version: back.version, notes: back.notes.length, cards: back.cards.length, revlog: back.revlog.length, decks: back.decks.size, models: back.models.size, media: back.media.length },
  reimport: { notes: reimport.notes, cards: reimport.cards, revlog: reimport.revlog, orphanRevlog: reimport.orphanRevlog },
  timings: { importMs, exportMs, reimportMs },
  revlogIdentical: revSame,
  problems,
  lossless: problems.length === 0,
};
db.close();
fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(problems.length === 0 ? 0 : 1);
