import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { SqliteKnowledgeRepository } from '../../src/main/database/repositories/knowledge.repository';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { CardDeckService, ankiText } from '../../src/main/services/card-decks';
import { SrsService } from '../../src/main/services/srs';
import { validateDeckInput } from '../../src/shared/types/knowledge-cards';

const AYAH = 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ';

function fixture() {
  const db = new Database(':memory:'); db.pragma('foreign_keys=ON'); runMigrations(db, migrations);
  db.prepare("INSERT INTO work(id,title) VALUES('book','كتاب')").run();
  return { db, cards: new KnowledgeCardRepository(db), decks: new CardDeckService(db), notes: new SqliteKnowledgeRepository(db) };
}

test('a deck takes only the chosen sources and keeps sacred text exact', () => {
  const { db, cards, decks, notes } = fixture();
  try {
    cards.save({ front: AYAH, back: '', sourceKind: 'quran', sourceRef: 'quran:2:255', sourceLabel: 'البقرة ٢٥٥' });
    cards.save({ front: 'حديث', back: 'نص', sourceKind: 'hadith', sourceRef: 'hadith:1' });
    notes.addNote({ id: 'note', bookId: 'book', pageNumber: 3, content: 'ملاحظة' });
    const { deck, added, skipped } = decks.generate({ name: 'حفظ', sources: ['quran'], memorize: false });
    assert.deepEqual([deck.cards, added, skipped], [1, 1, 0]);
    assert.equal((db.prepare('SELECT front FROM card_detail c JOIN knowledge_collection j ON j.knowledge_id=c.knowledge_id').get() as { front: string }).front, AYAH);
    assert.equal(new SrsService(db).queue().due, 0);
  } finally { db.close(); }
});

test('generating twice adds nothing new and generated cards review in Baglib', () => {
  const { db, decks, notes } = fixture();
  try {
    notes.addNote({ id: 'note', bookId: 'book', pageNumber: 3, content: 'ملاحظة' });
    notes.saveKnowledge({ id: 'mark', workId: 'book', knowledgeType: 'highlight', location: '4', quotedText: 'نص مظلل' });
    const first = decks.generate({ name: 'كتاب', sources: ['notes', 'highlights'], memorize: true });
    assert.equal(first.added, 2);
    assert.equal(decks.generate({ name: 'كتاب', sources: ['notes', 'highlights'], memorize: true }).added, 0);
    assert.equal(decks.list().length, 1);
    assert.equal(new SrsService(db).queue().due, 2);
  } finally { db.close(); }
});

test('long text is left out, never shortened', () => {
  const { db, decks, notes } = fixture();
  try {
    notes.addNote({ id: 'long', bookId: 'book', pageNumber: 1, content: 'ن'.repeat(20_001) });
    assert.deepEqual([decks.generate({ name: 'طويل', sources: ['notes'], memorize: false }).added, decks.generate({ name: 'طويل', sources: ['notes'], memorize: false }).skipped], [0, 1]);
  } finally { db.close(); }
});

test('the Anki file keeps diacritics, ids and awkward characters, and skips trashed cards', () => {
  const { cards, decks } = fixture();
  const kept = cards.save({ front: AYAH, back: 'سطر\nقال "نعم"\tانتهى', sourceKind: 'quran', sourceRef: 'quran:2:255', sourceLabel: 'البقرة' });
  const gone = cards.save({ front: 'محذوف', back: '', sourceKind: 'hadith', sourceRef: 'hadith:2' });
  const { deck } = decks.generate({ name: 'حفظ\nالقرآن', sources: ['quran', 'hadith'], memorize: false });
  cards.remove(gone.id);
  const { text } = decks.exportText(deck.id);
  const lines = text.split('\n');
  assert.deepEqual(lines.slice(0, 6), ['#separator:Tab', '#html:false', '#notetype:Basic', '#deck:حفظ القرآن', '#guid column:1', '#tags column:4']);
  assert.ok(text.includes(`${kept.id}\t${AYAH}\t"سطر\nقال ""نعم""\tانتهى\n\n— البقرة"\tbaglib quran\n`));
  assert.ok(!text.includes('محذوف'));
  assert.throws(() => decks.exportText('missing'), /invalid-request/);
});

test('ankiText leaves a plain card unquoted', () => {
  assert.ok(ankiText('d', [{ id: 'a', front: 'b', back: 'c', sourceKind: 'note', sourceLabel: null }]).endsWith('\na\tb\tc\tbaglib note\n'));
});

test('deck input is validated', () => {
  assert.throws(() => validateDeckInput({ name: ' ', sources: ['notes'] }), /invalid-request/);
  assert.throws(() => validateDeckInput({ name: 'a', sources: [] }), /invalid-request/);
  assert.throws(() => validateDeckInput({ name: 'a', sources: ['other'] }), /invalid-request/);
  assert.deepEqual(validateDeckInput({ name: ' a ', sources: ['notes', 'notes'], memorize: true }), { name: 'a', sources: ['notes'], memorize: true });
});
