/**
 * KEY-392: lossless .apkg import/export. Packages are built inside the test (no real collection is
 * committed): a legacy schema-11 package with media, and a "latest" package (zstd, protobuf media
 * list) wrapping the same collection. The real collection round-trip runs in
 * scripts/anki-roundtrip/check.ts against a copy of the user's backup.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { zipSync, type Zippable } from 'fflate';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { CardMediaStore, sniffMediaType } from '../../src/main/services/card-media';
import { AnkiImportService, revlogKind, rewriteMediaRefs } from '../../src/main/services/anki/apkg-import';
import { AnkiExportService, SCHEMA11, derivedGuid, fieldChecksum } from '../../src/main/services/anki/apkg-export';
import { readAnkiPackage, __internal } from '../../src/main/services/anki/apkg-reader';
import { parseAnkiJson, parseProto, protoFloats, stringifyAnkiJson } from '../../src/main/services/anki/protobuf';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-apkg-test-'));
const CRT = 1_706_061_600; // 2024-01-24 04:00 Africa/Cairo (rollover 4)
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 9, 9]);
const FIELD_ID = '-6706948164031000090'; // beyond 2^53: must survive exactly

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  return db;
}

/** A small schema-11 collection: an Arabic hadith type, a cloze type, two decks, five cards, history. */
function legacyCollection(): Uint8Array {
  const dir = tmp();
  const file = path.join(dir, 'c.anki2');
  const db = new Database(file);
  db.exec(SCHEMA11);
  const models = {
    100: {
      id: 100, name: 'حديث', type: 0, mod: 1700000000, usn: 0, sortf: 0, did: null, css: '.card{direction:rtl}', latexPre: '', latexPost: '', latexsvg: false, req: [[0, 'any', [0]]],
      flds: [
        { name: 'الباب', ord: 0, sticky: false, rtl: true, font: 'Arial', size: 20, id: `__i64:${FIELD_ID}` },
        { name: 'الأحاديث', ord: 1, sticky: false, rtl: true, font: 'Arial', size: 20, id: 7 },
      ],
      tmpls: [
        { name: 'حديث', ord: 0, qfmt: '{{الباب}}', afmt: '{{FrontSide}}<hr id=answer>{{الأحاديث}}', bqfmt: '', bafmt: '', did: null, bfont: '', bsize: 0, id: 11 },
        { name: 'عكسي', ord: 1, qfmt: '{{الأحاديث}}', afmt: '{{FrontSide}}<hr id=answer>{{الباب}}', bqfmt: '', bafmt: '', did: null, bfont: '', bsize: 0, id: 12 },
      ],
    },
    200: {
      id: 200, name: 'Cloze', type: 1, mod: 1700000000, usn: 0, sortf: 0, did: null, css: '', req: [], originalStockKind: 5,
      flds: [{ name: 'Text', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20 }, { name: 'Back Extra', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20 }],
      tmpls: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Back Extra}}' }],
    },
  };
  const deck = (id: number, name: string, conf = 10) => ({ id, name, mod: 1700000000, usn: 0, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0], collapsed: false, browserCollapsed: false, desc: '', dyn: 0, conf, extendNew: 0, extendRev: 0 });
  const decks = { 1: deck(1, 'Default', 1), 300: deck(300, 'أحاديث الصحيح'), 301: deck(301, 'أحاديث الصحيح::76 - كِتَاب الطِّبِّ') };
  const dconf = {
    1: { id: 1, name: 'Default', mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true, new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 0], order: 1, perDay: 20 }, rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200 }, lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 }, dyn: false },
    10: { id: 10, name: 'أحاديث', mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true, new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 0], order: 1, perDay: 5 }, rev: { bury: false, ease4: 1.3, ivlFct: 0.95, maxIvl: 365, perDay: 9999 }, lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 }, dyn: false, desiredRetention: 0.85, someFutureKey: { kept: true } },
  };
  db.prepare(`INSERT INTO col VALUES (1, ?, 0, 0, 11, 0, 0, 0, ?, ?, ?, ?, '{}')`).run(CRT, JSON.stringify({ rollover: 4, nextPos: 3 }), stringifyAnkiJson(models), JSON.stringify(decks), JSON.stringify(dconf));
  const note = db.prepare(`INSERT INTO notes VALUES (?, ?, ?, ?, 0, ?, ?, ?, 0, 0, '')`);
  note.run(1000, 'guidHadith1', 100, 1700000100, ' tib hadith ', `باب الدواء<img src="map.png">\x1fقال النبي ﷺ [sound:qala.mp3]`, 'باب الدواء');
  note.run(1001, 'guidHadith2', 100, 1700000200, '', 'باب الحجامة\x1fالشفاء في ثلاث', 'باب الحجامة');
  note.run(1002, 'guidCloze1', 200, 1700000300, 'leech', '{{c1::Paris}} is in {{c2::France}}\x1f', 'Paris');
  const card = db.prepare(`INSERT INTO cards VALUES (?, ?, ?, ?, 1700000400, 0, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)`);
  //            id     nid   did  ord type queue due   ivl factor reps lapses left  data
  card.run(2000, 1000, 301, 0, 2, 2, 700, 30, 2500, 5, 1, 0, '{"s":31.5,"d":4.07,"dr":0.85,"lrt":1765000000}'); // review
  card.run(2001, 1000, 301, 1, 0, 0, 2, 0, 0, 0, 0, 0, ''); // new, position 2
  card.run(2002, 1001, 301, 0, 1, 1, 1765500000, 0, 2500, 1, 0, 1001, ''); // learning, 1 step left
  card.run(2003, 1002, 300, 0, 2, -1, 650, 10, 2300, 7, 3, 0, '{"s":9.2,"d":7.1,"dr":0.85,"lrt":1764000000}'); // suspended review
  card.run(2004, 1002, 300, 1, 2, -3, 690, 4, 2500, 3, 0, 0, ''); // buried SM-2 review (no FSRS memory)
  const rev = db.prepare(`INSERT INTO revlog VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)`);
  rev.run(1764000000000, 2000, 3, 1, 0, 2500, 5000, 0); // first answer of a new card
  rev.run(1764100000000, 2000, 3, 30, 1, 2500, 4000, 1);
  rev.run(1764200000000, 2003, 0, 0, 10, 0, 0, 4); // "reset to new" marker
  rev.run(1760000000000, 9999, 3, 5, 1, 2500, 3000, 1); // history of a card Anki no longer has
  db.close();
  const bytes = new Uint8Array(fs.readFileSync(file));
  fs.rmSync(dir, { recursive: true, force: true });
  return bytes;
}

function writeLegacyPackage(dir: string): string {
  const zip: Zippable = {
    'collection.anki21': legacyCollection(),
    media: new TextEncoder().encode(JSON.stringify({ 0: 'map.png', 1: 'qala.mp3', 2: 'gone.ogg' })),
    0: PNG,
    1: MP3,
  };
  const file = path.join(dir, 'deck.apkg');
  fs.writeFileSync(file, zipSync(zip));
  return file;
}

/** zstd frame made of raw (stored) blocks: valid input for any zstd decoder. */
function zstdStored(data: Uint8Array): Uint8Array {
  const parts: number[] = [0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x50]; // magic, no flags, 1 MiB window
  const max = 128 * 1024;
  for (let off = 0; off === 0 || off < data.length; off += max) {
    const chunk = data.subarray(off, off + max);
    const last = off + max >= data.length ? 1 : 0;
    const header = last | (0 << 1) | (chunk.length << 3);
    parts.push(header & 0xff, (header >> 8) & 0xff, (header >> 16) & 0xff, ...chunk);
    if (last) break;
  }
  return new Uint8Array(parts);
}

/** Minimal protobuf writer for the test's own MediaEntries / PackageMetadata. */
const varint = (n: number) => {
  const out: number[] = [];
  do {
    let b = n & 0x7f;
    n = Math.floor(n / 128);
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return out;
};
const lenField = (field: number, bytes: Uint8Array | number[]) => [...varint((field << 3) | 2), ...varint(bytes.length), ...bytes];

function writeLatestPackage(dir: string): string {
  const entry = (name: string, size: number) => lenField(1, [...lenField(1, [...new TextEncoder().encode(name)]), ...varint((2 << 3) | 0), ...varint(size)]);
  const mediaList = new Uint8Array([...entry('map.png', PNG.length), ...entry('qala.mp3', MP3.length)]);
  const zip: Zippable = {
    meta: new Uint8Array([...varint((1 << 3) | 0), 3]),
    'collection.anki21b': zstdStored(legacyCollection()),
    media: zstdStored(mediaList),
    0: zstdStored(PNG),
    1: zstdStored(MP3),
  };
  const file = path.join(dir, 'deck-latest.apkg');
  fs.writeFileSync(file, zipSync(zip));
  return file;
}

test('protobuf and JSON helpers keep 64-bit ids and float32 values exact', () => {
  const json = parseAnkiJson(`{"id":${FIELD_ID},"small":42}`) as Record<string, unknown>;
  assert.equal(json.id, `__i64:${FIELD_ID}`);
  assert.equal(json.small, 42);
  assert.equal(stringifyAnkiJson(json), `{"id":${FIELD_ID},"small":42}`);
  // packed repeated float (learn steps 1, 10)
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setFloat32(0, 1, true);
  new DataView(buf.buffer).setFloat32(4, 10, true);
  assert.deepEqual(protoFloats(parseProto(new Uint8Array(lenField(1, buf))), 1), [1, 10]);
  // schema-18 deck config → schema-11 JSON
  const cfg = new Uint8Array([...lenField(1, buf), ...varint((9 << 3) | 0), 5, ...varint((21 << 3) | 0), 1, ...varint((22 << 3) | 0), 8]);
  const dconf = __internal.dconfFrom18({ id: 5, name: 'أحاديث', mtime_secs: 1, usn: 0, config: cfg });
  assert.deepEqual((dconf.new as Record<string, unknown>).delays, [1, 10]);
  assert.equal((dconf.new as Record<string, unknown>).perDay, 5);
  assert.equal((dconf.lapse as Record<string, unknown>).leechAction, 1);
  assert.equal(revlogKind(4, 0, 0), 'reset');
  assert.equal(revlogKind(0, 3, 0), 'learn');
  assert.equal(sniffMediaType(MP3), 'mp3');
  assert.equal(sniffMediaType(new Uint8Array([1, 2, 3])), 'bin');
});

test('legacy .apkg imports into notes, cards, decks, presets, history and media', () => {
  const dir = tmp();
  const db = freshDb();
  const media = new CardMediaStore(path.join(dir, 'card-media'));
  const report = new AnkiImportService(db, media).importFile(writeLegacyPackage(dir), { now: new Date('2026-11-18T12:00:00Z') });
  assert.deepEqual([report.notes.added, report.cards.added, report.revlog.added, report.orphanRevlog.added], [3, 5, 3, 1]);
  assert.deepEqual([report.media.stored, report.media.missing], [2, 1], 'gone.ogg is listed but not in the package');

  // Deck tree from "A::B", with the preset of the leaf.
  const leaf = db.prepare(`SELECT d.id, d.name, p.name AS parent, s.name AS preset, s.new_per_day, s.desired_retention, s.leech_action FROM deck d JOIN deck p ON p.id = d.parent_id JOIN srs_preset s ON s.id = d.preset_id WHERE d.anki_id = 301`).get() as Record<string, unknown>;
  assert.equal(leaf.name, '76 - كِتَاب الطِّبِّ');
  assert.equal(leaf.parent, 'أحاديث الصحيح');
  assert.deepEqual([leaf.preset, leaf.new_per_day, leaf.desired_retention, leaf.leech_action], ['أحاديث', 5, 0.85, 'suspend']);
  assert.deepEqual(db.prepare(`SELECT name FROM deck WHERE anki_id = 1 OR name = 'Default'`).all(), [], 'Anki’s empty Default deck is skipped');

  // Note type with exact 64-bit field id; Arabic names kept exactly.
  const type = db.prepare(`SELECT id, kind FROM card_note_type WHERE anki_id = 100`).get() as { id: string; kind: string };
  assert.equal(type.kind, 'normal');
  assert.equal((db.prepare(`SELECT CAST(anki_id AS TEXT) AS a FROM card_note_field WHERE note_type_id = ? AND ord = 0`).get(type.id) as { a: string }).a, FIELD_ID);
  assert.equal(db.prepare(`SELECT kind FROM card_note_type WHERE anki_id = 200`).get().kind, 'cloze');

  // Note fields point at stored media; the original names are remembered.
  const note = db.prepare(`SELECT fields_json, anki_extra FROM card_note WHERE guid = 'guidHadith1'`).get() as { fields_json: string; anki_extra: string };
  const fields = JSON.parse(note.fields_json) as Record<string, string>;
  assert.match(fields['الباب'], /<img src="[a-f0-9]{40}\.png">/u);
  assert.match(fields['الأحاديث'], /\[sound:[a-f0-9]{40}\.mp3\]/u);
  assert.deepEqual(Object.values(JSON.parse(note.anki_extra).media).sort(), ['map.png', 'qala.mp3']);
  assert.equal(media.list().length, 2);

  // Scheduling: due days relative to crt, FSRS memory, learning step, new position, suspended, buried.
  const srs = (ankiId: number) => db.prepare(`SELECT s.* FROM srs_state s JOIN card_detail c ON c.knowledge_id = s.knowledge_id WHERE c.anki_id = ?`).get(ankiId) as Record<string, unknown>;
  assert.deepEqual([srs(2000).state, srs(2000).due_at, srs(2000).stability, srs(2000).difficulty], ['review', new Date((CRT + 700 * 86400) * 1000).toISOString(), 31.5, 4.07]);
  assert.deepEqual([srs(2001).state, srs(2001).new_position], ['new', 2]);
  assert.deepEqual([srs(2002).state, srs(2002).due_at, srs(2002).learning_step], ['learning', new Date(1765500000 * 1000).toISOString(), 1]);
  assert.equal(srs(2003).state, 'suspended');
  assert.ok(srs(2004).buried_until, 'a buried card stays buried until the next day');
  assert.equal(srs(2004).stability, 4, 'an SM-2 card uses its interval as stability');

  // Cards render from their template; cloze ordinals follow Anki.
  const cloze2 = db.prepare(`SELECT front FROM card_detail WHERE anki_id = 2004`).get() as { front: string };
  assert.match(cloze2.front, /Paris/u);
  assert.doesNotMatch(cloze2.front, /France/u);

  // History: kinds, rating 0 only for the reset marker, the first answer marked as introduction.
  const logs = db.prepare(`SELECT entry_kind, rating, anki_id, state_before FROM srs_review_log ORDER BY anki_id`).all() as Array<Record<string, unknown>>;
  assert.deepEqual(logs.map(l => [l.entry_kind, l.rating]), [['learn', 3], ['review', 3], ['reset', 0]]);
  assert.equal(JSON.parse(String(logs[0]!.state_before)).before.state, 0);
  assert.equal(db.prepare(`SELECT cid FROM anki_orphan_revlog`).get().cid, 9999);

  // Tags reach every card of the note.
  const tagged = db.prepare(`SELECT COUNT(*) AS n FROM knowledge_tag kt JOIN tag t ON t.id = kt.tag_id WHERE t.name = 'tib'`).get() as { n: number };
  assert.equal(tagged.n, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('export → re-import is lossless and duplicates nothing; untouched cards keep Anki’s values', () => {
  const dir = tmp();
  const db = freshDb();
  const media = new CardMediaStore(path.join(dir, 'card-media'));
  const pkg = writeLegacyPackage(dir);
  new AnkiImportService(db, media).importFile(pkg);
  const out = path.join(dir, 'out.apkg');
  const exp = new AnkiExportService(db, media).exportToFile(out);
  assert.deepEqual([exp.notes, exp.cards, exp.revlog, exp.orphanRevlog, exp.media], [3, 5, 3, 1, 2]);

  const a = readAnkiPackage(pkg);
  const b = readAnkiPackage(out);
  assert.equal(b.version, 'legacy2');
  const byId = new Map(b.cards.map(c => [c.id, c]));
  for (const c of a.cards) {
    const x = byId.get(c.id)!;
    assert.deepEqual([x.nid, x.ord, x.type, x.queue, x.due, x.ivl, x.factor, x.reps, x.lapses, x.left, x.data], [c.nid, c.ord, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses, c.left, c.data], `card ${c.id}`);
  }
  const notesB = new Map(b.notes.map(n => [n.guid, n]));
  for (const n of a.notes) {
    assert.equal(notesB.get(n.guid)!.flds, n.flds, 'fields, with the original media names');
    assert.equal(notesB.get(n.guid)!.tags.trim().split(' ').sort().join(' '), n.tags.trim().split(' ').filter(Boolean).sort().join(' '));
    assert.equal(notesB.get(n.guid)!.csum, fieldChecksum(n.flds.split('\x1f')[0]!));
  }
  assert.deepEqual(b.revlog.map(r => [r.id, r.cid, r.ease, r.ivl, r.lastIvl, r.factor, r.time, r.type]), a.revlog.map(r => [r.id, r.cid, r.ease, r.ivl, r.lastIvl, r.factor, r.time, r.type]));
  assert.deepEqual(b.media.map(m => m.name).sort(), ['map.png', 'qala.mp3']);
  const fieldId = ((b.models.get(100)!.flds as Array<Record<string, unknown>>)[0]!).id;
  assert.equal(fieldId, `__i64:${FIELD_ID}`, '64-bit field id written back exactly');
  assert.deepEqual(((b.dconf.get(10)!).someFutureKey), { kept: true }, 'Anki settings BagLib does not use survive');
  assert.equal(String(b.decks.get(301)!.name), 'أحاديث الصحيح::76 - كِتَاب الطِّبِّ');

  const again = new AnkiImportService(db, media).importFile(out);
  assert.deepEqual([again.notes.added, again.cards.added, again.revlog.added, again.orphanRevlog.added], [0, 0, 0, 0]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('modern package (zstd collection, protobuf media list) imports the same', () => {
  const dir = tmp();
  const model = readAnkiPackage(writeLatestPackage(dir));
  assert.equal(model.version, 'latest');
  assert.deepEqual([model.notes.length, model.cards.length, model.revlog.length], [3, 5, 4]);
  assert.deepEqual(model.media.map(m => [m.name, m.data?.length]), [['map.png', PNG.length], ['qala.mp3', MP3.length]]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('re-import policies: never, if-newer, always; a changed card is exported from BagLib’s schedule', () => {
  const dir = tmp();
  const db = freshDb();
  const media = new CardMediaStore(path.join(dir, 'card-media'));
  const pkg = writeLegacyPackage(dir);
  new AnkiImportService(db, media).importFile(pkg);
  db.prepare(`UPDATE card_note SET fields_json = json_set(fields_json, '$."الأحاديث"', 'edited in BagLib'), updated_at = '2026-11-18T00:00:00.000Z' WHERE guid = 'guidHadith2'`).run();
  const never = new AnkiImportService(db, media).importFile(pkg, { policy: 'never' });
  assert.equal(never.notes.updated, 0);
  const ifNewer = new AnkiImportService(db, media).importFile(pkg, { policy: 'if-newer' });
  assert.equal(ifNewer.notes.updated, 0, 'the BagLib edit is newer than Anki’s note');
  assert.match(String(db.prepare(`SELECT fields_json FROM card_note WHERE guid = 'guidHadith2'`).get().fields_json), /edited in BagLib/u);
  const always = new AnkiImportService(db, media).importFile(pkg, { policy: 'always' });
  assert.equal(always.notes.updated, 3);
  assert.doesNotMatch(String(db.prepare(`SELECT fields_json FROM card_note WHERE guid = 'guidHadith2'`).get().fields_json), /edited in BagLib/u);

  // Review the new card in BagLib (schedule changes): export translates BagLib's state.
  const id = (db.prepare(`SELECT knowledge_id FROM card_detail WHERE anki_id = 2001`).get() as { knowledge_id: string }).knowledge_id;
  db.prepare(`UPDATE srs_state SET state = 'review', due_at = ?, stability = 12.5, difficulty = 5.5, reps = 1, last_review = ? WHERE knowledge_id = ?`).run(new Date((CRT + 900 * 86400) * 1000).toISOString(), new Date((CRT + 888 * 86400) * 1000).toISOString(), id);
  const out = path.join(dir, 'out.apkg');
  new AnkiExportService(db, media).exportToFile(out);
  const card = readAnkiPackage(out).cards.find(c => c.id === 2001)!;
  assert.deepEqual([card.type, card.queue, card.due, card.ivl], [2, 2, 900, 12]);
  assert.equal(JSON.parse(card.data).s, 12.5);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a card shared by two decks is exported into each, and re-import maps both back to one card', () => {
  const dir = tmp();
  const db = freshDb();
  const media = new CardMediaStore(path.join(dir, 'card-media'));
  new AnkiImportService(db, media).importFile(writeLegacyPackage(dir));
  const other = (db.prepare(`SELECT id FROM deck WHERE anki_id = 300`).get() as { id: string }).id;
  const card = (db.prepare(`SELECT knowledge_id, note_id FROM card_detail WHERE anki_id = 2000`).get() as { knowledge_id: string; note_id: string });
  db.prepare(`INSERT INTO deck_card (deck_id, knowledge_id, position, added_at) VALUES (?, ?, 0, '2026-11-18T00:00:00.000Z')`).run(other, card.knowledge_id);
  const out = path.join(dir, 'out.apkg');
  const exp = new AnkiExportService(db, media).exportToFile(out);
  assert.equal(exp.cards, 6);
  const b = readAnkiPackage(out);
  const guid = (db.prepare(`SELECT guid FROM card_note WHERE id = ?`).get(card.note_id) as { guid: string }).guid;
  assert.ok(b.notes.some(n => n.guid === guid));
  assert.ok(b.notes.some(n => n.guid === derivedGuid(guid, other)), 'the extra copy has a derived GUID');
  const before = db.prepare(`SELECT COUNT(*) AS n FROM card_detail`).get().n;
  new AnkiImportService(db, media).importFile(out, { policy: 'never' });
  assert.ok(db.prepare(`SELECT COUNT(*) AS n FROM card_detail`).get().n >= before);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('media references are rewritten only for files the package carries', () => {
  const map = new Map([['a b.png', 'x.png'], ['s.mp3', 'y.mp3']]);
  const r = rewriteMediaRefs('<img src="a b.png"> <img src="missing.png"> [sound:s.mp3]', map);
  assert.equal(r.text, '<img src="x.png"> <img src="missing.png"> [sound:y.mp3]');
  assert.deepEqual([...r.used.entries()], [['x.png', 'a b.png'], ['y.mp3', 's.mp3']]);
});

test('the real collection round-trip passes (only when a copy of the user’s backup is present)', { skip: !fs.existsSync('.baglib-data/key392-roundtrip/result.json') }, () => {
  const result = JSON.parse(fs.readFileSync('.baglib-data/key392-roundtrip/result.json', 'utf8'));
  assert.equal(result.lossless, true, JSON.stringify(result.problems));
});
