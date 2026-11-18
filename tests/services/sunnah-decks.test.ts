/**
 * KEY-396 Sunnah decks: the three hadith card templates (siblings of one note, so sibling burying
 * keeps one from giving away another) and narrator (rijal) decks with the user's chosen fields.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { DeckRepository } from '../../src/main/database/repositories/deck.repository';
import { SrsService } from '../../src/main/services/srs';
import { DeckSyncService } from '../../src/main/services/deck-sync';
import { NarratorDeckService, narratorFields, validateNarratorDeckInput, type NarratorReaders } from '../../src/main/services/narrator-decks';
import type { SunnahNarrator } from '../../src/shared/types/sunnah';

const narrators: Record<string, SunnahNarrator> = {
  '1': { id: '1', name: 'عبد الرحمن بن صخر', variants: [], kunya: 'أبو هريرة', nasab: 'الدوسي', laqab: 'الدوسي اليماني', tabaqah: 'صحابي', deathYear: 57, deathText: '', grade: 'صحابي جليل', tier: 'sahabi', sources: [], teachers: [{ id: '9', name: 'النبي ﷺ', tier: '' }], students: [{ id: '2', name: 'سعيد بن المسيب', tier: '' }, { id: '3', name: 'الأعرج', tier: '' }], teacherCount: 1, studentCount: 800, hadithCount: 5000 },
  '2': { id: '2', name: 'سعيد بن المسيب', variants: [], kunya: 'أبو محمد', nasab: 'المخزومي', laqab: '', tabaqah: 'كبار التابعين', deathYear: 94, deathText: '', grade: 'ثقة ثبت', tier: 'thiqa', sources: [], teachers: [], students: [], teacherCount: 0, studentCount: 0, hadithCount: 300 },
};

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  const clock = () => new Date('2026-11-18T09:00:00.000Z');
  const chapter = {
    title: 'كتاب العلم',
    hadiths: [
      { id: 'Bukhari:3:1', researchId: 101, number: '59', sectionNumber: '1', sectionTitle: 'باب فضل العلم', text: 'من يرد الله به خيرا يفقهه في الدين', isnad: 'حدثنا سعيد بن عفير قال حدثنا ابن وهب', matn: 'من يرد الله به خيرا يفقهه في الدين', full: 'حدثنا سعيد بن عفير قال حدثنا ابن وهب ... من يرد الله به خيرا يفقهه في الدين' },
      { id: 'Bukhari:3:2', researchId: 102, number: '60', sectionNumber: '2', sectionTitle: 'باب آخر', text: 'العلماء ورثة الأنبياء', isnad: '', matn: 'العلماء ورثة الأنبياء', full: 'العلماء ورثة الأنبياء' },
    ],
  };
  const chains: Record<number, string[]> = { 101: ['1', '2'], 102: ['2'] };
  const readers: NarratorReaders = {
    collectionName: () => 'صحيح البخاري',
    sunnahChapter: async (c, n) => (c === 'Bukhari' && n === 3 ? chapter : null),
    sunnahChapterNumbers: async () => [3],
    poem: async () => null,
    poetPoemIds: async () => [],
    narratorIdsForHadiths: async ids => [...new Set(ids.flatMap(id => chains[id] ?? []))],
    narrator: async id => narrators[id] ?? null,
  };
  return { db, decks: new DeckRepository(db), sync: new DeckSyncService(db, clock, readers), srs: new SrsService(db, clock), narrator: new NarratorDeckService(db, readers) };
}
const noYield = () => Promise.resolve();
const cardsOfRef = (db: Database.Database, ref: string) =>
  db.prepare(`SELECT c.knowledge_id AS id, c.ord, c.front, c.back FROM card_detail c JOIN card_note n ON n.id = c.note_id WHERE n.source_ref = ? ORDER BY c.ord`).all(ref) as Array<{ id: string; ord: number; front: string; back: string }>;

test('hadith variants: default card is bab → full isnad + matn, verbatim', async () => {
  const f = fixture();
  try {
    const deck = f.decks.createDeck({ name: 'العلم' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'sunnah_book', sourceRef: 'Bukhari:3' });
    assert.deepEqual(sub.cards, ['full']);
    await f.sync.sync(sub.id, noYield);
    const [card] = cardsOfRef(f.db, 'sunnah-hadith:Bukhari:3:Bukhari:3:1');
    assert.equal(card.ord, 0);
    assert.match(card.front, /صحيح البخاري 59<br>باب فضل العلم/u);
    assert.match(card.back, /حدثنا سعيد بن عفير قال حدثنا ابن وهب \.\.\. من يرد الله به خيرا يفقهه في الدين/u);
  } finally {
    f.db.close();
  }
});

test('hadith variants: all three cards are siblings of one note; an isnad card needs an isnad; burying keeps them apart', async () => {
  const f = fixture();
  try {
    const preset = f.decks.savePreset({ name: 'Bury', buryNew: true, buryReviews: true, buryInterday: true });
    const deck = f.decks.createDeck({ name: 'المتغيرات', presetId: preset.id });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'sunnah_book', sourceRef: 'Bukhari:3', cards: ['full', 'matn', 'isnad'] });
    await f.sync.sync(sub.id, noYield);
    const withIsnad = cardsOfRef(f.db, 'sunnah-hadith:Bukhari:3:Bukhari:3:1');
    assert.deepEqual(withIsnad.map(c => c.ord), [0, 1, 2], 'full, matn and isnad cards');
    assert.match(withIsnad[2].front, /حدثنا سعيد بن عفير/u, 'isnad → matn shows the isnad on the front');
    assert.ok(!/حدثنا/u.test(withIsnad[1].back.split('<hr id=answer>')[1]), 'matn card answer has no isnad');
    const noIsnad = cardsOfRef(f.db, 'sunnah-hadith:Bukhari:3:Bukhari:3:2');
    assert.deepEqual(noIsnad.map(c => c.ord), [0, 1], 'no isnad, no isnad card');

    // Answer one card: its siblings are buried, so the matn card can't give the full card away.
    const q = f.srs.queue(deck.id);
    const first = q.cards.find(c => c.id === withIsnad[0].id)!;
    f.srs.grade({ id: first.id, revision: first.revision, rating: 3, durationMs: 300, deckId: deck.id });
    const buried = (id: string) => (f.db.prepare(`SELECT buried_until FROM srs_state WHERE knowledge_id = ?`).get(id) as { buried_until: string | null } | undefined)?.buried_until;
    assert.ok(buried(withIsnad[1].id) && buried(withIsnad[2].id), 'variants of the same hadith are buried until tomorrow');
    assert.equal(buried(noIsnad[0].id) ?? null, null, 'another hadith is not buried');

    await assert.rejects(f.sync.subscribe({ deckId: deck.id, sourceKind: 'sunnah_bab', sourceRef: 'Bukhari:3:1', cards: ['tafsir'] }), /invalid-request/u);
  } finally {
    f.db.close();
  }
});

test('narrator fields: only the chosen details are filled; the name is always there', () => {
  const minimal = narratorFields(narrators['1'], []);
  assert.equal(minimal.Name, 'عبد الرحمن بن صخر');
  assert.ok(Object.entries(minimal).every(([k, v]) => k === 'Name' || v === ''));
  const chosen = narratorFields(narrators['1'], ['kunya', 'tabaqah', 'death', 'grade', 'students']);
  assert.equal(chosen.Kunya, 'أبو هريرة');
  assert.equal(chosen.Death, '57 هـ');
  assert.equal(chosen.Grade, 'صحابي جليل');
  assert.equal(chosen.Students, 'سعيد بن المسيب، الأعرج (+798)');
  assert.equal(chosen.Teachers, '', 'teachers not chosen');
});

test('narrator deck from a bab and from mastered hadith; generating again keeps the same card', async () => {
  const f = fixture();
  try {
    const r = await f.narrator.generate(validateNarratorDeckInput({ deckName: 'رجال باب العلم', source: { kind: 'sunnah_bab', ref: 'Bukhari:3:1' }, fields: ['kunya', 'grade'] }));
    assert.equal(r.narrators, 2);
    assert.equal(r.added, 2);
    const abuHurayra = f.db.prepare(`SELECT id, fields_json FROM card_note WHERE source_ref = 'narrator:1'`).get() as { id: string; fields_json: string };
    assert.equal(JSON.parse(abuHurayra.fields_json).Kunya, 'أبو هريرة');
    const [card] = f.db.prepare(`SELECT c.knowledge_id AS id, c.back FROM card_detail c WHERE c.note_id = ?`).all(abuHurayra.id) as Array<{ id: string; back: string }>;
    assert.match(card.back, /الكنية:<\/span> أبو هريرة/u);
    assert.ok(!/الطبقة/u.test(card.back), 'unchosen details are not on the card');

    // Review it, then regenerate with more fields: same note, schedule kept.
    const q = f.srs.queue(r.deckId);
    const target = q.cards.find(c => c.id === card.id)!;
    f.srs.grade({ id: target.id, revision: target.revision, rating: 3, durationMs: 300, deckId: r.deckId });
    const state = f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(card.id);
    const again = await f.narrator.generate(validateNarratorDeckInput({ deckName: 'رجال باب العلم', source: { kind: 'sunnah_bab', ref: 'Bukhari:3:1' }, fields: ['kunya', 'grade', 'tabaqah'] }));
    assert.equal(again.added, 0);
    assert.equal(again.updated, 2);
    assert.equal(JSON.parse((f.db.prepare(`SELECT fields_json FROM card_note WHERE id = ?`).get(abuHurayra.id) as { fields_json: string }).fields_json).Tabaqah, 'صحابي');
    assert.deepEqual(f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(card.id), state, 'schedule kept');

    // Mastered: none yet → a clear error; then master a hadith card (review, stability >= 21).
    await assert.rejects(f.narrator.generate({ deckName: 'رجالي', source: { kind: 'mastered' }, fields: [] }), /no-mastered-hadith/u);
    const deck = f.decks.createDeck({ name: 'أحاديث' });
    const sub = await f.sync.subscribe({ deckId: deck.id, sourceKind: 'sunnah_bab', sourceRef: 'Bukhari:3:2' });
    await f.sync.sync(sub.id, noYield);
    const [hadithCard] = cardsOfRef(f.db, 'sunnah-hadith:Bukhari:3:Bukhari:3:2');
    f.db.prepare(`UPDATE srs_state SET state = 'review', stability = 30 WHERE knowledge_id = ?`).run(hadithCard.id);
    const mastered = await f.narrator.generate({ deckName: 'رجالي', source: { kind: 'mastered' }, fields: ['grade'] });
    assert.equal(mastered.narrators, 1, 'only the narrators of the mastered hadith');
    assert.equal(mastered.linked + mastered.updated, 1, 'the existing narrator card is reused, not duplicated');
  } finally {
    f.db.close();
  }
});

test('narrator deck input validation', () => {
  assert.throws(() => validateNarratorDeckInput({ deckName: '', source: { kind: 'mastered' }, fields: [] }), /invalid-request/u);
  assert.throws(() => validateNarratorDeckInput({ deckName: 'x', source: { kind: 'sunnah_bab', ref: 'Bukhari;3' }, fields: [] }), /invalid-request/u);
  assert.throws(() => validateNarratorDeckInput({ deckName: 'x', source: { kind: 'mastered' }, fields: ['password'] }), /invalid-request/u);
  assert.throws(() => validateNarratorDeckInput({ deckName: 'x', source: { kind: 'mastered' }, fields: [], extra: 1 }), /invalid-request/u);
  assert.deepEqual(validateNarratorDeckInput({ deckName: ' x ', source: { kind: 'sunnah_book', ref: 'Bukhari:3' }, fields: ['kunya', 'kunya'] }), { deckName: 'x', source: { kind: 'sunnah_book', ref: 'Bukhari:3' }, fields: ['kunya'] });
});
