/**
 * KEY-401 biography decks from the library's authors, and Wikipedia quick-cards (fake fetch).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { SrsService } from '../../src/main/services/srs';
import { PersonDeckService, validateAuthorDeckInput, validateWikipediaCardInput } from '../../src/main/services/person-decks';
import type { WikipediaSummaryCard } from '../../src/shared/types/dictionary';

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  db.prepare(`INSERT INTO category (id, name_ar, name_en) VALUES ('hist', 'التاريخ', 'History'), ('fiqh', 'الفقه', 'Fiqh')`).run();
  db.prepare(`INSERT INTO work (id, title, primary_category_id) VALUES ('w1', 'المقدمة', 'hist'), ('w2', 'العبر', 'hist'), ('w3', 'الأم', 'fiqh')`).run();
  db.prepare(`INSERT INTO author (id, name, birth_year, death_year, bio) VALUES ('a1', 'ابن خلدون', '732', '808', 'مؤرخ وعالم اجتماع <تونسي>'), ('a2', 'الشافعي', NULL, '204', NULL), ('a3', 'No books', NULL, NULL, NULL), ('a4', 'غير معروف', NULL, NULL, NULL)`).run();
  db.prepare(`INSERT INTO work_author (work_id, author_id, role) VALUES ('w1', 'a1', 'author'), ('w2', 'a1', 'author'), ('w3', 'a2', 'author'), ('w3', 'a4', 'author')`).run();
  return { db, service: new PersonDeckService(db), srs: new SrsService(db, () => new Date('2026-11-18T09:00:00.000Z')) };
}
const fieldsOf = (db: Database.Database, ref: string) => JSON.parse((db.prepare(`SELECT fields_json FROM card_note WHERE source_ref = ?`).get(ref) as { fields_json: string }).fields_json) as Record<string, string>;

test('biography deck: one card per author with era, works, field and bio; made again keeps the schedule', () => {
  const f = fixture();
  try {
    const r = f.service.authorDeck({ deckName: 'تراجم', categoryId: null, language: 'ar' });
    assert.equal(r.people, 2, 'authors with books in the library (not the one with none, nor the unknown-author placeholder)');
    assert.equal(r.added, 2);
    const a1 = fieldsOf(f.db, 'author:a1');
    assert.equal(a1.Name, 'ابن خلدون');
    assert.equal(a1.Era, 'وُلد 732 · تُوفي 808');
    assert.equal(a1.Works, 'من مؤلفاته: العبر، المقدمة');
    assert.equal(a1.Field, 'المجال: التاريخ');
    assert.equal(a1.Bio, 'مؤرخ وعالم اجتماع &lt;تونسي&gt;', 'escaped');
    assert.equal(fieldsOf(f.db, 'author:a2').Era, 'تُوفي 204');

    // Study a card, then make the deck again after the bio changed: updated in place, schedule kept.
    const card = f.srs.queue(r.deckId).cards[0];
    f.srs.grade({ id: card.id, revision: card.revision, rating: 3, durationMs: 300, deckId: r.deckId });
    const state = f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(card.id);
    f.db.prepare(`UPDATE author SET bio = 'مؤسس علم العمران' WHERE id = 'a1'`).run();
    const again = f.service.authorDeck({ deckName: 'تراجم', categoryId: null, language: 'ar' });
    assert.equal(again.deckId, r.deckId);
    assert.equal(again.updated, 1);
    assert.equal(again.linked, 1);
    assert.deepEqual(f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(card.id), state);
    assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM card_note WHERE source_ref LIKE 'author:%'`).get().n, 2, 'no duplicate notes');
  } finally {
    f.db.close();
  }
});

test('biography deck: a category scope and English labels', () => {
  const f = fixture();
  try {
    const r = f.service.authorDeck({ deckName: 'Fiqh people', categoryId: 'fiqh', language: 'en' });
    assert.equal(r.people, 1);
    const a2 = fieldsOf(f.db, 'author:a2');
    assert.equal(a2.Era, 'died 204');
    assert.equal(a2.Works, 'Works: الأم');
    assert.equal(a2.Field, 'Field: Fiqh');
    f.db.prepare(`INSERT INTO category (id, name_ar, name_en) VALUES ('empty', 'فارغ', 'Empty')`).run();
    assert.throws(() => f.service.authorDeck({ deckName: 'x', categoryId: 'empty', language: 'en' }), /no-people/u);
    assert.throws(() => validateAuthorDeckInput({ deckName: '', language: 'en' }), /invalid-request/u);
    assert.throws(() => validateAuthorDeckInput({ deckName: 'x', extra: 1 }), /invalid-request/u);
  } finally {
    f.db.close();
  }
});

test('Wikipedia quick-card: title as written, summary verbatim, link and edition; again updates the same card', async () => {
  const f = fixture();
  try {
    let extract = 'ابن خلدون مؤرخ عربي، يعد مؤسس علم الاجتماع الحديث.';
    const fetch = async (title: string, lang: string): Promise<WikipediaSummaryCard | null> =>
      title === 'ابن خلدون' && lang === 'ar'
        ? { title: 'ابن خلدون', displayTitle: '<span>ابن خلدون</span>', extract, description: 'مؤرخ', articleUrl: 'https://ar.wikipedia.org/wiki/%D8%A7%D8%A8%D9%86_%D8%AE%D9%84%D8%AF%D9%88%D9%86', lang: 'ar', dir: 'rtl' }
        : title === 'Ibn Khaldun'
          ? { title: 'Ibn Khaldun', displayTitle: 'Ibn Khaldun', extract: 'Ibn Khaldun was an Arab sociologist.', articleUrl: 'https://en.wikipedia.org/wiki/Ibn_Khaldun', lang: 'en', dir: 'ltr' }
          : title === 'Evil'
            ? { title: 'Evil', displayTitle: 'Evil', extract: 'x', articleUrl: 'https://evil.example/wiki/Evil', lang: 'en', dir: 'ltr' }
            : null;

    const ar = await f.service.wikipediaCard({ title: 'ابن خلدون', lang: 'ar', language: 'ar', deckId: null }, fetch);
    assert.equal(ar.created, true);
    const fields = fieldsOf(f.db, 'wikipedia:ar:ابن خلدون');
    assert.equal(fields.Name, 'ابن خلدون', 'the plain title, not the display HTML');
    assert.equal(fields.Bio, extract);
    assert.ok(fields.Source.startsWith('ويكيبيديا العربية — <a href="https://ar.wikipedia.org/wiki/'), 'edition and link');
    assert.ok(fields.Source.includes('>https://ar.wikipedia.org/wiki/ابن_خلدون</a>'), 'the link is shown readable');
    const deck = f.db.prepare(`SELECT name FROM deck WHERE id = ?`).get(ar.deckId) as { name: string };
    assert.equal(deck.name, 'ويكيبيديا');

    extract = 'نص الملخص بعد تحديثه.';
    const again = await f.service.wikipediaCard({ title: 'ابن خلدون', lang: 'ar', language: 'ar', deckId: null }, fetch);
    assert.equal(again.created, false);
    assert.equal(again.noteId, ar.noteId);
    assert.equal(fieldsOf(f.db, 'wikipedia:ar:ابن خلدون').Bio, extract);

    const en = await f.service.wikipediaCard({ title: 'Ibn Khaldun', lang: 'en', language: 'en', deckId: null }, fetch);
    assert.ok(fieldsOf(f.db, 'wikipedia:en:Ibn Khaldun').Source.startsWith('English Wikipedia — '));
    assert.equal((f.db.prepare(`SELECT name FROM deck WHERE id = ?`).get(en.deckId) as { name: string }).name, 'Wikipedia');

    await assert.rejects(f.service.wikipediaCard({ title: 'Nothing', lang: 'en', language: 'en', deckId: null }, fetch), /not-found/u);
    await assert.rejects(f.service.wikipediaCard({ title: 'Evil', lang: 'en', language: 'en', deckId: null }, fetch), /not-found/u, 'only a wikipedia.org link of that edition');
    assert.throws(() => validateWikipediaCardInput({ title: 'x', lang: 'EN!' }), /invalid-request/u);
    assert.throws(() => validateWikipediaCardInput({ title: '', lang: 'en' }), /invalid-request/u);
  } finally {
    f.db.close();
  }
});
