import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { CardDeckService } from '../../src/main/services/card-decks';
import { hadithRangeDrafts, validateHadithDeckInput, MAX_HADITH_DECK_RANGE } from '../../src/shared/hadith-deck';

// KEY-319: a memorization deck from a numbered range of hadiths; the back is the stored text, exact.
const HADITHS = [
  { id: 'h1', number: '1', text: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ' },
  { id: 'h2', number: '2', text: 'أَحْيَانًا يَأْتِينِي مِثْلَ صَلْصَلَةِ الْجَرَسِ' },
  { id: 'h3', number: '3', text: 'أَوَّلُ مَا بُدِئَ بِهِ رَسُولُ اللَّهِ ﷺ' },
  { id: 'h4', number: '4a', text: 'نص بعلامة فرعية' },
  { id: 'h5', number: '5', text: '   ' },
];

test('validation keeps a sane, bounded request', () => {
  assert.deepEqual(validateHadithDeckInput({ name: ' بدء الوحي ', collection: 'Bukhari', chapter: 1, from: 1, to: 3, memorize: true }), { name: 'بدء الوحي', collection: 'Bukhari', chapter: 1, from: 1, to: 3, memorize: true });
  for (const bad of [
    { collection: '', chapter: 1, from: 1, to: 1 },
    { collection: 'Bukhari;drop', chapter: 1, from: 1, to: 1 },
    { collection: 'Bukhari', chapter: 0, from: 1, to: 1 },
    { collection: 'Bukhari', chapter: 1, from: 3, to: 2 },
    { collection: 'Bukhari', chapter: 1, from: 1.5, to: 2 },
    { collection: 'Bukhari', chapter: 1, from: 1, to: MAX_HADITH_DECK_RANGE + 1 },
  ]) assert.throws(() => validateHadithDeckInput({ name: 'x', memorize: false, ...bad }), /invalid-request/, JSON.stringify(bad));
  assert.throws(() => validateHadithDeckInput({ name: ' ', collection: 'Bukhari', chapter: 1, from: 1, to: 1 }), /invalid-request/);
});

test('drafts cover the numbers in range, keep the text exactly and skip empty text', () => {
  const request = validateHadithDeckInput({ name: 'd', collection: 'Bukhari', chapter: 1, from: 2, to: 5, memorize: false });
  const drafts = hadithRangeDrafts(HADITHS, request, 'صحيح البخاري');
  assert.deepEqual(drafts.map(draft => draft.sourceRef), ['sunnah:Bukhari:1:h2', 'sunnah:Bukhari:1:h3', 'sunnah:Bukhari:1:h4']);
  assert.deepEqual(drafts.map(draft => draft.back), [HADITHS[1].text, HADITHS[2].text, HADITHS[3].text]);
  assert.equal(drafts[0].front, 'صحيح البخاري 2');
  assert.ok(drafts.every(draft => draft.sourceKind === 'hadith' && draft.language === 'ar' && draft.sourceLabel === 'صحيح البخاري 2-5'));
});

test('a range of three hadiths becomes three exact cards, without duplicates on a second run', () => {
  const db = createTestDatabase();
  const service = new CardDeckService(db);
  const request = validateHadithDeckInput({ name: 'بدء الوحي', collection: 'Bukhari', chapter: 1, from: 1, to: 3, memorize: true });
  const drafts = hadithRangeDrafts(HADITHS, request, 'صحيح البخاري');
  const first = service.generateFromDrafts(request.name, drafts, true);
  assert.equal(first.added, 3);
  const rows = db.prepare('SELECT back FROM card_detail ORDER BY source_ref').all() as { back: string }[];
  assert.deepEqual(rows.map(row => row.back), HADITHS.slice(0, 3).map(hadith => hadith.text), 'byte-for-byte stored text');
  assert.equal(service.generateFromDrafts(request.name, drafts, true).added, 0);
  assert.ok(service.exportText(first.deck.id).text.includes('صَلْصَلَةِ'), 'Anki export keeps the diacritics');
});
