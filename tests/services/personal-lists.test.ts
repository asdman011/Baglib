/**
 * KEY-386 personal lists: Starred, custom lists of mixed material, order, chips (membership) and
 * the any/all filter each section uses.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { PersonalListsService } from '../../src/main/services/personal-lists';
import {
  STARRED_LIST_ID,
  ayahListRef,
  bookListRef,
  canonicalItemRef,
  cleanListName,
  hadithListRef,
  matchListName,
  passesListFilter,
  poemListRef,
} from '../../src/shared/personal-lists';

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  return { db, lists: new PersonalListsService(db) };
}

const AYAH = ayahListRef(2, 153);
const HADITH = hadithListRef('Bukhari', 1, '1');
const POEM = poemListRef(42);
const BOOK = bookListRef('w1');

test('migration seeds Starred, which cannot be renamed or deleted', () => {
  const { lists } = fixture();
  const all = lists.all();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, STARRED_LIST_ID);
  assert.equal(all[0].kind, 'starred');
  assert.throws(() => lists.rename(STARRED_LIST_ID, 'x'), /invalid-request/);
  assert.throws(() => lists.remove(STARRED_LIST_ID), /invalid-request/);
});

test('a custom list holds a mix of material in order, and keeps its name as typed', () => {
  const { lists } = fixture();
  const list = lists.create('  أحاديثُ الصبر  ');
  assert.equal(list.name, 'أحاديثُ الصبر');
  lists.add(list.id, { itemKind: 'ayah', itemRef: AYAH, label: 'يا أيها الذين آمنوا استعينوا بالصبر' });
  lists.add(list.id, { itemKind: 'hadith', itemRef: HADITH, label: 'إنما الأعمال بالنيات' });
  lists.add(list.id, { itemKind: 'poem', itemRef: 'poetry:ashaar:42:3:5', label: 'قصيدة' });
  lists.add(list.id, { itemKind: 'book', itemRef: 'book:w1#p=12', label: 'Riyad' });
  // Adding again keeps one row and its place.
  lists.add(list.id, { itemKind: 'ayah', itemRef: AYAH, label: '' });
  const items = lists.items(list.id);
  assert.deepEqual(items.map(i => i.itemRef), [AYAH, HADITH, POEM, BOOK]);
  assert.equal(items[0].label, 'يا أيها الذين آمنوا استعينوا بالصبر');
  assert.deepEqual(lists.items(list.id, 'hadith').map(i => i.itemRef), [HADITH]);
  assert.deepEqual(lists.all().find(l => l.id === list.id)!.counts, { book: 1, ayah: 1, hadith: 1, poem: 1 });

  lists.reorderItems(list.id, [items[3].id, items[0].id]);
  assert.deepEqual(lists.items(list.id).map(i => i.itemRef), [BOOK, AYAH, HADITH, POEM]);
  lists.removeItem(list.id, 'hadith', HADITH);
  assert.deepEqual(lists.items(list.id).map(i => i.itemRef), [BOOK, AYAH, POEM]);
});

test('lists can be renamed, reordered and deleted; deleting removes their items', () => {
  const { db, lists } = fixture();
  const a = lists.create('A');
  const b = lists.create('B');
  lists.add(a.id, { itemKind: 'book', itemRef: BOOK, label: '' });
  lists.rename(a.id, 'Reading order');
  lists.reorder([b.id, a.id]);
  assert.deepEqual(lists.all().map(l => l.name), ['Starred', 'B', 'Reading order']);
  lists.remove(a.id);
  assert.deepEqual(lists.all().map(l => l.name), ['Starred', 'B']);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM personal_list_item').get() as { n: number }).n, 0);
});

test('the star toggles an item in and out of Starred', () => {
  const { lists } = fixture();
  assert.equal(lists.toggleStar({ itemKind: 'hadith', itemRef: HADITH, label: 'h' }), true);
  assert.deepEqual(lists.items(STARRED_LIST_ID).map(i => i.itemRef), [HADITH]);
  assert.equal(lists.toggleStar({ itemKind: 'hadith', itemRef: HADITH, label: 'h' }), false);
  assert.deepEqual(lists.items(STARRED_LIST_ID), []);
});

test('membership gives each item the lists it belongs to (chips)', () => {
  const { lists } = fixture();
  const a = lists.create('A');
  lists.toggleStar({ itemKind: 'ayah', itemRef: AYAH, label: '' });
  lists.add(a.id, { itemKind: 'ayah', itemRef: AYAH, label: '' });
  lists.add(a.id, { itemKind: 'ayah', itemRef: ayahListRef(2, 154), label: '' });
  const m = lists.membership('ayah', [AYAH, ayahListRef(2, 154), ayahListRef(3, 1), 'bogus']);
  assert.deepEqual(m, { [AYAH]: [STARRED_LIST_ID, a.id], [ayahListRef(2, 154)]: [a.id] });
});

test('the any/all filter returns only the section\'s own kind', () => {
  const { lists } = fixture();
  const a = lists.create('A');
  const b = lists.create('B');
  const h2 = hadithListRef('Muslim', 2, '7');
  const h3 = hadithListRef('Bukhari', 3, '9');
  lists.add(a.id, { itemKind: 'hadith', itemRef: HADITH, label: '' });
  lists.add(a.id, { itemKind: 'hadith', itemRef: h2, label: '' });
  lists.add(a.id, { itemKind: 'ayah', itemRef: AYAH, label: '' });
  lists.add(b.id, { itemKind: 'hadith', itemRef: h2, label: '' });
  lists.add(b.id, { itemKind: 'hadith', itemRef: h3, label: '' });
  assert.deepEqual(lists.filter('hadith', [a.id, b.id], 'any').sort(), [HADITH, h2, h3].sort());
  assert.deepEqual(lists.filter('hadith', [a.id, b.id], 'all'), [h2]);
  assert.deepEqual(lists.filter('hadith', [a.id], 'any'), [HADITH, h2]);
  assert.deepEqual(lists.filter('ayah', [b.id], 'any'), []);
  assert.deepEqual(lists.filter('hadith', [], 'any'), []);

  // The renderer uses the same rule on membership.
  assert.equal(passesListFilter([a.id], [a.id, b.id], 'any'), true);
  assert.equal(passesListFilter([a.id], [a.id, b.id], 'all'), false);
  assert.equal(passesListFilter(undefined, [], 'all'), true);
});

test('references are validated and made canonical', () => {
  assert.equal(canonicalItemRef('book', 'book:w1@s2#p=4'), 'book:w1');
  assert.equal(canonicalItemRef('ayah', 'quran:hafs:2:255-255'), 'quran:hafs:2:255');
  assert.equal(canonicalItemRef('ayah', 'quran:hafs:2:255-257'), 'quran:hafs:2:255-257');
  assert.equal(canonicalItemRef('poem', 'poetry:ashaar:7'), 'poetry:ashaar:7:0:0');
  assert.equal(canonicalItemRef('hadith', 'sunnah:nope:1:1'), null);
  assert.equal(canonicalItemRef('ayah', HADITH), null);
  const { lists } = fixture();
  assert.throws(() => lists.add(STARRED_LIST_ID, { itemKind: 'ayah', itemRef: HADITH, label: '' }), /invalid-request/);
  assert.throws(() => lists.add('missing', { itemKind: 'book', itemRef: BOOK, label: '' }), /not-found/);
  assert.throws(() => lists.create('   '), /invalid-request/);
  assert.equal(cleanListName('x'.repeat(121)), null);
});

test('list search uses Arabic normalisation', () => {
  assert.equal(matchListName({ name: 'أحاديثُ الصَّبر' }, 'احاديث الصبر'), true);
  assert.equal(matchListName({ name: 'Reading order' }, 'reading'), true);
  assert.equal(matchListName({ name: 'Reading order' }, 'khutbah'), false);
});
