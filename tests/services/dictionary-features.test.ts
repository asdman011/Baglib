/**
 * KEY-414 dictionary lookup features: multi-word splitting, suggestions (ة/ه kept apart, tashkeel
 * ignored), the user's dictionary order, lookup history, the Reading pad and hemistich splitting,
 * and the validation the IPC relies on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { DictionaryService } from '../../src/main/services/dictionary/dictionary.service';
import { DictionaryPrefsService } from '../../src/main/services/dictionary/dictionary-prefs';
import { normalizeArabicLetters, stripArabicDiacritics } from '../../src/shared/utils/lookup-candidates';
import {
  MAX_HISTORY,
  MAX_PAD_TEXT,
  addToHistory,
  applyDictionaryOrder,
  cleanPad,
  layoutPad,
  padTokens,
  removeFromHistory,
  splitHemistichs,
  splitLookupWords,
  suggestionKey,
  toggleHighlight,
} from '../../src/shared/dictionary-features';

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  const now = '2026-11-18T10:00:00.000Z';
  const addDict = (id: string, title: string, created: string, words: string[]) => {
    db.prepare(`INSERT INTO dictionaries (id, title, format, source_path, entry_count, is_enabled, created_at) VALUES (?, ?, 'stardict', '/x', ?, 1, ?)`).run(id, title, words.length, created);
    const insert = db.prepare(`INSERT INTO headword_index (dict_id, headword, normalized_headword, offset, size) VALUES (?, ?, ?, 0, 0)`);
    for (const word of words) insert.run(id, word, normalizeArabicLetters(stripArabicDiacritics(word.toLowerCase())));
  };
  addDict('d-a', 'Alpha', '2026-01-01', ['اسْتَغْفَرَ', 'استغفار', 'استغاثة', 'رحمة', 'رحمه', 'كتب']);
  addDict('d-b', 'Beta', '2026-02-01', ['استغنى', 'إستغراق', 'رحمة', 'Rahma']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'key414-'));
  const service = new DictionaryService(db, dir);
  let clock = new Date(now);
  const prefs = new DictionaryPrefsService(db, () => clock);
  return { db, service, prefs, tick: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}

test('multi-word search splits on spaces, commas and new lines, unique, at most 12', () => {
  assert.deepEqual(splitLookupWords('كتب  رحمة،استغفر\nكتب'), ['كتب', 'رحمة', 'استغفر']);
  assert.deepEqual(splitLookupWords('«رحمة»; (book)'), ['رحمة', 'book']);
  assert.deepEqual(splitLookupWords('كَتَبَ كتب'), ['كَتَبَ'], 'a vocalised and bare form count once');
  assert.equal(splitLookupWords(Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ')).length, 12);
  assert.deepEqual(splitLookupWords(42), []);
});

test('suggestion form ignores tashkeel and alef forms but keeps ة and ه apart', () => {
  assert.equal(suggestionKey('اسْتَغْفَرَ'), 'استغفر');
  assert.equal(suggestionKey('إستغراق'), 'استغراق');
  assert.equal(suggestionKey('مستشفى'), 'مستشفي');
  assert.notEqual(suggestionKey('رحمة'), suggestionKey('رحمه'));
});

test('suggestions come from enabled dictionaries by normalised prefix', () => {
  const { service, db } = fixture();
  const found = service.suggest('اسْتغ');
  assert.ok(found.length >= 4 && found.length <= 10);
  assert.ok(found.includes('اسْتَغْفَرَ') && found.includes('إستغراق') && found.includes('استغنى'));
  // ة and ه stay apart: typing رحمة never offers رحمه.
  assert.deepEqual(service.suggest('رحمة'), ['رحمة']);
  assert.deepEqual(service.suggest('رحمه'), ['رحمه']);
  assert.deepEqual(service.suggest('rah'), ['Rahma']);
  // Disabled dictionaries are left out.
  db.prepare(`UPDATE dictionaries SET is_enabled = 0 WHERE id = 'd-b'`).run();
  assert.ok(!service.suggest('استغ').includes('استغنى'));
  assert.deepEqual(service.suggest('   '), []);
  assert.throws(() => service.suggest(5), /invalid-request/);
  assert.throws(() => service.suggest('x'.repeat(300)), /invalid-request/);
});

test('suggestions stay fast on a large index', () => {
  const { service, db } = fixture();
  const insert = db.prepare(`INSERT INTO headword_index (dict_id, headword, normalized_headword, offset, size) VALUES ('d-a', ?, ?, 0, 0)`);
  db.transaction(() => {
    for (let i = 0; i < 60000; i++) {
      const word = `است${String.fromCharCode(0x0628 + (i % 20))}${i}`;
      insert.run(word, normalizeArabicLetters(word));
    }
  })();
  const start = performance.now();
  for (let i = 0; i < 20; i++) service.suggest('استب');
  const each = (performance.now() - start) / 20;
  assert.ok(each < 30, `suggest took ${each.toFixed(1)} ms`);
});

test('the dictionary order is applied to the list and to lookups', () => {
  const { service } = fixture();
  assert.deepEqual(service.listDictionaries().map(d => d.id), ['d-b', 'd-a'], 'default: newest first');
  service.setDictionaryOrder(['d-a', 'd-b', 'unknown']);
  assert.deepEqual(service.dictionaryOrder(), ['d-a', 'd-b'], 'unknown ids are dropped');
  assert.deepEqual(service.listDictionaries().map(d => d.id), ['d-a', 'd-b']);
  assert.throws(() => service.setDictionaryOrder('d-a'), /invalid-request/);
  assert.throws(() => service.setDictionaryOrder([1]), /invalid-request/);
  assert.deepEqual(applyDictionaryOrder([{ id: 'x' }, { id: 'y' }, { id: 'z' }], ['z']).map(i => i.id), ['z', 'x', 'y']);
});

test('history keeps the newest 100, moves repeats up, removes and clears', () => {
  const { prefs, tick } = fixture();
  prefs.addHistory({ word: 'كتب', dictionary: 'Alpha' });
  tick(1000);
  prefs.addHistory({ word: 'رحمة' });
  tick(1000);
  const again = prefs.addHistory({ word: 'كَتَب', dictionary: 'Beta' });
  assert.deepEqual(again.map(h => h.word), ['كَتَب', 'رحمة']);
  assert.equal(again[0].dictionary, 'Beta');
  for (let i = 0; i < 150; i++) prefs.addHistory({ word: `w${i}` });
  assert.equal(prefs.history().length, MAX_HISTORY);
  assert.equal(prefs.history()[0].word, 'w149');
  assert.deepEqual(prefs.removeHistory('w149').map(h => h.word).slice(0, 1), ['w148']);
  assert.deepEqual(prefs.clearHistory(), []);
  assert.throws(() => prefs.addHistory({ word: '' }), /invalid-request/);
  assert.throws(() => prefs.addHistory({ word: 'x', dictionary: 3 }), /invalid-request/);
  assert.throws(() => prefs.removeHistory(null), /invalid-request/);
  assert.deepEqual(removeFromHistory(addToHistory([], { word: 'أب', at: '2026-01-01T00:00:00Z' }), 'اب'), []);
});

test('the Reading pad keeps text up to 50,000 characters and its highlighted words', () => {
  const { prefs } = fixture();
  const saved = prefs.savePad({ text: 'قفا نبك', highlights: ['نَبْكِ', 'نبك', 7] });
  assert.deepEqual(saved, { text: 'قفا نبك', highlights: ['نبك'] });
  assert.deepEqual(prefs.pad(), saved);
  assert.throws(() => prefs.savePad({ text: 'x'.repeat(MAX_PAD_TEXT + 1) }), /invalid-request/);
  assert.throws(() => prefs.savePad({ text: 5 }), /invalid-request/);
  assert.equal(cleanPad({ text: 'y'.repeat(MAX_PAD_TEXT + 10) }).text.length, MAX_PAD_TEXT);
  const toggled = toggleHighlight(saved, 'قِفا');
  assert.deepEqual(toggled.highlights, ['نبك', 'قفا']);
  assert.deepEqual(toggleHighlight(toggled, 'نبك').highlights, ['قفا']);
});

test('verses split into two hemistichs by tab, wide spaces, asterisk or ellipsis', () => {
  assert.deepEqual(splitHemistichs('قفا نبك من ذكرى حبيب ومنزل\tبسقط اللوى بين الدخول فحومل'), ['قفا نبك من ذكرى حبيب ومنزل', 'بسقط اللوى بين الدخول فحومل']);
  assert.deepEqual(splitHemistichs('أ ب ج     د ه و'), ['أ ب ج', 'د ه و']);
  assert.deepEqual(splitHemistichs('أ ب * ج د'), ['أ ب', 'ج د']);
  assert.deepEqual(splitHemistichs('أ ب … ج د'), ['أ ب', 'ج د']);
  assert.deepEqual(splitHemistichs('أ ب... ج د'), ['أ ب', 'ج د']);
  assert.equal(splitHemistichs('one line of prose'), null);
  assert.equal(splitHemistichs('* starts with a star'), null);
  const pad = layoutPad('قفا نبك\tبسقط اللوى\n\nفتوضح فالمقراة * لم يعف رسمها');
  assert.equal(pad.qasidah, true);
  assert.deepEqual(pad.lines.map(l => l.kind), ['verse', 'blank', 'verse']);
  assert.equal(layoutPad('A paragraph.\nAnother one.').qasidah, false);
  assert.deepEqual(padTokens('قِفا، نبك!').filter(t => t.word).map(t => t.text), ['قِفا', 'نبك']);
});

test('long lexicon meanings are cut to fit a revision card', async () => {
  const { revisionMeaning, MAX_REVISION_MEANING } = await import('../../src/shared/dictionary-features');
  const long = Array.from({ length: 3000 }, (_, i) => `كلمة${i}`).join(' ');
  const cut = revisionMeaning(long);
  assert.ok(cut.length <= MAX_REVISION_MEANING + 2 && cut.endsWith('…'));
  assert.equal(revisionMeaning('  قصير \n جدا '), 'قصير جدا');
});
