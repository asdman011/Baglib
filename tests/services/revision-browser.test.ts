import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { RevisionBrowserService } from '../../src/main/services/revision-browser.service';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { PersonalListsService } from '../../src/main/services/personal-lists';
import {
  buildFilteredDeckSearch,
  computeRetrievability,
  parseSavedSearches,
} from '../../src/shared/revision-browser';

function setupDb() {
  const db = new Database(':memory:');
  runMigrations(db, migrations);
  return db;
}

test('KEY-395: computeRetrievability, parseSavedSearches, and buildFilteredDeckSearch', () => {
  const now = Date.UTC(2026, 10, 19);
  assert.equal(computeRetrievability(null, '2026-11-18T00:00:00Z', now), null);
  const r1 = computeRetrievability(10, '2026-11-18T00:00:00Z', now);
  const r5 = computeRetrievability(10, '2026-11-10T00:00:00Z', now);
  assert.ok(r1 !== null && r5 !== null && r1 > r5);

  const parsed = parseSavedSearches(JSON.stringify([{ id: 's1', name: 'Hadith Lapses', query: { sourceType: 'sunnah', sortBy: 'lapses' } }, { bad: true }]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, 'Hadith Lapses');

  assert.equal(buildFilteredDeckSearch({ sourceType: 'sunnah', state: 'suspended', search: 'النية' }), 'النية source:hadith is:suspended');
});

test('KEY-395: RevisionBrowserService filters by source, science, lists (any/all), Arabic-normalised search, sorts, and bulk-acts on 6,000 cards', () => {
  const db = setupDb();
  try {
    const browser = new RevisionBrowserService(db);
    const cardsRepo = new KnowledgeCardRepository(db);
    const listsService = new PersonalListsService(db);
    const now = '2026-11-19T10:00:00.000Z';

    // Create a work + category (science)
    db.prepare(`INSERT INTO category (id, name_ar, name_en) VALUES ('cat-fiqh', 'الفقه', 'Fiqh')`).run();
    db.prepare(`INSERT INTO work (id, title, primary_category_id) VALUES ('w1', 'Sahih', 'cat-fiqh')`).run();

    // Create a target deck for bulk move
    db.prepare(`INSERT INTO deck (id, name, kind, created_at, updated_at) VALUES ('deck-2', 'Target Deck', 'normal', ?, ?)`).run(now, now);

    // Seed specific cards for all filter dimensions
    const cHadith = cardsRepo.save({ front: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ', back: 'Bukhari 1', sourceKind: 'hadith', sourceRef: 'sunnah:Bukhari:1:1', sourceLabel: 'Bukhari 1' });
    const cNarrator = cardsRepo.save({ front: 'أبو هريرة', back: 'Sahabi', sourceKind: 'person', sourceRef: 'narrator:10', sourceLabel: 'Narrator' });
    const cTafsir = cardsRepo.save({ front: 'تفسير الفاتحة', back: 'Tabari', sourceKind: 'book', sourceRef: 'tafsir:1:1', sourceLabel: 'تفسير الطبري', workId: 'w1' });
    const cQuran = cardsRepo.save({ front: 'الحمد لله', back: '1:2', sourceKind: 'quran', sourceRef: 'quran:hafs:1:2', sourceLabel: 'Al-Fatihah 1:2' });

    // Tag cQuran with a science tag
    db.prepare(`INSERT INTO tag (id, name) VALUES ('tag-usool', 'Usool')`).run();
    db.prepare(`INSERT INTO knowledge_tag (knowledge_id, tag_id) VALUES (?, 'tag-usool')`).run(cQuran.id);

    // Lists (KEY-386)
    const l1 = listsService.create('List One');
    const l2 = listsService.create('List Two');
    listsService.add(l1.id, { itemKind: 'hadith', itemRef: 'sunnah:Bukhari:1:1', label: 'Bukhari 1' });
    listsService.add(l2.id, { itemKind: 'hadith', itemRef: 'sunnah:Bukhari:1:1', label: 'Bukhari 1' });
    listsService.add(l1.id, { itemKind: 'ayah', itemRef: 'quran:hafs:1:2', label: '1:2' });

    // SRS state for sorting
    db.prepare(`INSERT INTO srs_state (knowledge_id, state, due_at, stability, difficulty, reps, lapses, last_review) VALUES (?, 'review', '2026-11-20T00:00:00Z', 12, 5.5, 4, 3, '2026-11-15T00:00:00Z')`).run(cHadith.id);
    db.prepare(`INSERT INTO srs_state (knowledge_id, state, due_at, stability, difficulty, reps, lapses, last_review) VALUES (?, 'review', '2026-11-18T00:00:00Z', 4, 8.2, 2, 7, '2026-11-10T00:00:00Z')`).run(cTafsir.id);

    // Seed 6,000 bulk cards in a transaction to verify large-deck performance
    const insKnowledge = db.prepare(`INSERT INTO knowledge (id, knowledge_type, created_at, updated_at) VALUES (?, 'card', ?, ?)`);
    const insDetail = db.prepare(`INSERT INTO card_detail (knowledge_id, front, back, source_kind, source_ref, source_label, question_kind) VALUES (?, ?, ?, 'note', ?, 'Bulk Note', 'recall')`);
    const insSrs = db.prepare(`INSERT INTO srs_state (knowledge_id, state, due_at, stability, difficulty, reps, lapses, last_review) VALUES (?, 'review', '2026-11-25T00:00:00Z', 20, 4.0, 1, 0, '2026-11-18T00:00:00Z')`);
    db.transaction(() => {
      for (let i = 0; i < 6000; i++) {
        const id = `bulk-${i}`;
        insKnowledge.run(id, now, now);
        insDetail.run(id, `Bulk Front ${i}`, `Bulk Back ${i}`, `note:bulk-${i}`);
        insSrs.run(id);
      }
    })();

    const t0 = performance.now();
    const allRes = browser.browse({ limit: 50, offset: 0 });
    const elapsed = performance.now() - t0;
    assert.equal(allRes.total, 6004);
    assert.equal(allRes.items.length, 50);
    assert.ok(elapsed < 2000, `6,000-card browse took ${elapsed.toFixed(1)}ms`);

    // Filter by source type
    assert.equal(browser.browse({ sourceType: 'sunnah' }).total, 1);
    assert.equal(browser.browse({ sourceType: 'narrators' }).total, 1);
    assert.equal(browser.browse({ sourceType: 'tafsir' }).total, 1);
    assert.equal(browser.browse({ sourceType: 'quran' }).total, 1);

    // Filter by science (both category and tag)
    assert.equal(browser.browse({ science: 'cat:cat-fiqh' }).total, 1);
    assert.equal(browser.browse({ science: 'tag:tag-usool' }).total, 1);

    // Filter by lists: any vs all
    assert.equal(browser.browse({ listIds: [l1.id, l2.id], listMatch: 'any' }).total, 2);
    const listAll = browser.browse({ listIds: [l1.id, l2.id], listMatch: 'all' });
    assert.equal(listAll.total, 1);
    assert.equal(listAll.items[0].id, cHadith.id);

    // Arabic-normalised search (no tashkeel + bare alif)
    const arSearch = browser.browse({ search: 'انما الاعمال' });
    assert.equal(arSearch.total, 1);
    assert.equal(arSearch.items[0].id, cHadith.id);

    // Sort by lapses desc
    const sortedLapses = browser.browse({ sortBy: 'lapses', sortDir: 'desc', limit: 5 });
    assert.equal(sortedLapses.items[0].id, cTafsir.id);
    assert.equal(sortedLapses.items[0].lapses, 7);

    // Bulk actions: suspend, unsuspend, reschedule, moveDeck, tag, delete
    browser.bulkAction({ action: 'suspend', cardIds: [cHadith.id] });
    assert.equal(browser.browse({ state: 'suspended' }).total, 1);
    browser.bulkAction({ action: 'unsuspend', cardIds: [cHadith.id] });
    assert.equal(browser.browse({ state: 'suspended' }).total, 0);

    browser.bulkAction({ action: 'moveDeck', cardIds: [cHadith.id], deckId: 'deck-2' });
    assert.equal(browser.browse({ deckId: 'deck-2' }).total, 1);

    browser.bulkAction({ action: 'tag', cardIds: [cHadith.id], tag: 'HadithTag' });
    const tagged = browser.browse({ sourceType: 'sunnah' });
    assert.ok(tagged.items[0].tags.includes('HadithTag'));

    assert.throws(() => browser.bulkAction({ action: 'delete', cardIds: [cNarrator.id], confirmed: false }));
    browser.bulkAction({ action: 'delete', cardIds: [cNarrator.id], confirmed: true });
    assert.equal(browser.browse({ sourceType: 'narrators' }).total, 0);
  } finally {
    db.close();
  }
});
