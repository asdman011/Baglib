/**
 * KEY-415: personal lists hold lecture moments, whole notes and exact book pages. Migration 039
 * widens personal_list_item's kinds by rebuilding the table, keeping every existing row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import migration039 from '../../src/main/database/migrations/039_personal_list_kinds';
import { PersonalListsService } from '../../src/main/services/personal-lists';
import { canonicalItemRef, lectureListRef, noteListRef } from '../../src/shared/personal-lists';
import { bookCfiTarget, bookStudyTarget, validStudyTarget } from '../../src/shared/study-notes';

const LECTURE = '0f8fad5b-d9cb-469f-a165-70867728950e';
const SHOT = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

test('migration 039 keeps existing list items and indexes, and accepts the new kinds', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations.filter(m => m.id <= 38));
  const before = new PersonalListsService(db);
  const list = before.create('قائمتي');
  before.add(list.id, { itemKind: 'book', itemRef: 'book:w1', label: 'كتاب' });
  before.add(list.id, { itemKind: 'ayah', itemRef: 'quran:hafs:2:153', label: 'آية' });
  before.toggleStar({ itemKind: 'hadith', itemRef: 'sunnah:Bukhari:1:1', label: 'حديث' });
  assert.throws(() => db.prepare("INSERT INTO personal_list_item (id, list_id, item_kind, item_ref) VALUES ('x', ?, 'note', 'note:n1')").run(list.id), /CHECK/);
  const rows = db.prepare('SELECT * FROM personal_list_item ORDER BY id').all();

  runMigrations(db, migrations);
  assert.deepEqual(db.prepare('SELECT * FROM personal_list_item ORDER BY id').all(), rows, 'every row survives unchanged');
  const indexes = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'personal_list_item' AND name LIKE 'idx_%'").all() as { name: string }[]).map(r => r.name).sort();
  assert.deepEqual(indexes, ['idx_personal_list_item_item', 'idx_personal_list_item_list']);
  assert.equal(db.pragma('foreign_key_check').length, 0);

  const lists = new PersonalListsService(db);
  lists.add(list.id, { itemKind: 'lecture', itemRef: lectureListRef(LECTURE, 754.6), label: 'محاضرة · 12:34' });
  lists.add(list.id, { itemKind: 'note', itemRef: noteListRef('n1'), label: 'ملاحظة' });
  lists.add(list.id, { itemKind: 'page', itemRef: 'book:w1#p=57', label: 'صفحة 57' });
  const items = lists.items(list.id);
  assert.deepEqual(items.map(i => [i.itemKind, i.itemRef]), [
    ['book', 'book:w1'],
    ['ayah', 'quran:hafs:2:153'],
    ['lecture', `media:${LECTURE}:754`],
    ['note', 'note:n1'],
    ['page', 'book:w1#p=57'],
  ]);
  const counts = lists.all().find(l => l.id === list.id)!.counts;
  assert.deepEqual(counts, { book: 1, ayah: 1, hadith: 0, poem: 0, lecture: 1, note: 1, page: 1 });
  // The book filter only sees whole books, not pages of them.
  assert.deepEqual(lists.filter('book', [list.id], 'any'), ['book:w1']);
  assert.deepEqual(lists.filter('page', [list.id], 'any'), ['book:w1#p=57']);
  // Deleting the list still cascades to its items in the rebuilt table.
  lists.remove(list.id);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM personal_list_item WHERE list_id = ?').get(list.id) as { n: number }).n, 0);
});

test('migration 039 down drops only the new kinds', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  const lists = new PersonalListsService(db);
  lists.toggleStar({ itemKind: 'book', itemRef: 'book:w1', label: 'b' });
  lists.toggleStar({ itemKind: 'note', itemRef: 'note:n1', label: 'n' });
  migration039.down!(db);
  assert.deepEqual((db.prepare('SELECT item_kind FROM personal_list_item').all() as { item_kind: string }[]).map(r => r.item_kind), ['book']);
});

test('canonical references for lecture moments, notes and pages', () => {
  assert.equal(canonicalItemRef('lecture', `media:${LECTURE}:754`), `media:${LECTURE}:754`);
  assert.equal(canonicalItemRef('lecture', `media:${LECTURE}:754:${SHOT}`), `media:${LECTURE}:754`, 'the screenshot is dropped');
  assert.equal(canonicalItemRef('lecture', 'media:not-a-uuid:5'), null);
  assert.equal(lectureListRef(LECTURE, -3), `media:${LECTURE}:0`);

  assert.equal(canonicalItemRef('note', 'note:n1'), 'note:n1');
  assert.equal(canonicalItemRef('note', 'note:n1#^para-2'), 'note:n1', 'a paragraph anchor becomes the whole note');
  assert.equal(canonicalItemRef('note', 'book:w1'), null);

  assert.equal(canonicalItemRef('page', 'book:w1#p=57'), 'book:w1#p=57');
  assert.equal(canonicalItemRef('page', bookStudyTarget({ id: 'w1', sourceId: 's2' }, 9)), 'book:w1@s2#p=9');
  assert.equal(canonicalItemRef('page', 'book:w1'), null, 'a page needs a page or an EPUB location');
  const cfi = bookCfiTarget({ id: 'w1' }, 'epubcfi(/6/4!/4/2/1:10)');
  assert.equal(canonicalItemRef('page', cfi), cfi);
  assert.equal(canonicalItemRef('book', 'book:w1#p=57'), 'book:w1', 'whole books still drop the page');
  for (const ref of [`media:${LECTURE}:754`, 'note:n1', 'book:w1#p=57', cfi]) assert.ok(validStudyTarget(ref), ref);
});
