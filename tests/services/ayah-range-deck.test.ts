import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { CardDeckService, ankiText } from '../../src/main/services/card-decks';
import { validateAyahDeckInput } from '../../src/shared/types/knowledge-cards';
import { HAFS_SURAH_AYAH_COUNTS } from '../../src/shared/quran-wird';

// KEY-318: a memorization deck from a range of ayahs. The back of each card is the pack text, exact.
const AYAHS = [
  { number: 255, text: 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ' },
  { number: 256, text: 'لَآ إِكْرَاهَ فِى ٱلدِّينِ' },
  { number: 257, text: 'ٱللَّهُ وَلِىُّ ٱلَّذِينَ ءَامَنُوا۟' },
];
const drafts = AYAHS.map(ayah => ({ front: `البقرة 2:${ayah.number}`, back: ayah.text, sourceKind: 'quran' as const, sourceRef: `quran:hafs:2:${ayah.number}`, sourceLabel: 'البقرة 2:255-257', language: 'ar' }));

test('validation follows the Hafs ayah counts', () => {
  assert.deepEqual(validateAyahDeckInput({ name: ' آية الكرسي ', surah: 2, from: 255, to: 257, memorize: true }, HAFS_SURAH_AYAH_COUNTS), { name: 'آية الكرسي', surah: 2, from: 255, to: 257, memorize: true });
  for (const bad of [{ surah: 0, from: 1, to: 1 }, { surah: 115, from: 1, to: 1 }, { surah: 2, from: 10, to: 9 }, { surah: 1, from: 1, to: 8 }, { surah: 2, from: 1.5, to: 3 }]) {
    assert.throws(() => validateAyahDeckInput({ name: 'x', memorize: false, ...bad }, HAFS_SURAH_AYAH_COUNTS), /invalid-request/, JSON.stringify(bad));
  }
  assert.throws(() => validateAyahDeckInput({ name: '  ', surah: 1, from: 1, to: 7 }, HAFS_SURAH_AYAH_COUNTS), /invalid-request/);
});

test('a range of three ayahs becomes a deck of three exact cards, without duplicates on a second run', () => {
  const db = createTestDatabase();
  const service = new CardDeckService(db);
  const first = service.generateFromDrafts('آية الكرسي', drafts, true);
  assert.equal(first.added, 3);
  assert.equal(first.deck.cards, 3);
  assert.equal(first.skipped, 0);
  const rows = db.prepare(`SELECT c.back, c.source_ref AS ref, s.state FROM card_detail c LEFT JOIN srs_state s ON s.knowledge_id = c.knowledge_id ORDER BY c.source_ref`).all() as { back: string; ref: string; state: string | null }[];
  assert.deepEqual(rows.map(row => row.back), AYAHS.map(ayah => ayah.text), 'byte-for-byte pack text');
  assert.deepEqual(rows.map(row => row.ref), ['quran:hafs:2:255', 'quran:hafs:2:256', 'quran:hafs:2:257']);
  assert.ok(rows.every(row => row.state !== null), 'memorize schedules every card');
  const again = service.generateFromDrafts('آية الكرسي', drafts, true);
  assert.equal(again.added, 0);
  assert.equal(again.deck.cards, 3);
  const text = service.exportText(first.deck.id).text;
  for (const ayah of AYAHS) assert.ok(text.includes(ayah.text), 'Anki export keeps the diacritics');
  assert.ok(ankiText('d', []).startsWith('#separator:Tab'));
});
