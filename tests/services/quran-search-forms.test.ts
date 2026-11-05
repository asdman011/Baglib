import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { normalizeQuranSearch, quranSearchForms, quranSearchText } from '../../src/main/services/quran/qul-catalog';

const matches = (uthmani: string, typed: string) => quranSearchForms(uthmani).includes(normalizeQuranSearch(typed));

describe('Quran search forms for the small alif and small letters', () => {
  it('matches words that ordinary spelling writes with an alif', () => {
    assert.ok(matches('ٱلۡعَٰلَمِينَ', 'العالمين'));
    assert.ok(matches('ٱلۡكِتَٰبُ', 'الكتاب'));
    assert.ok(matches('ٱلسَّمَٰوَٰتِ', 'السماوات'));
  });

  it('still matches words that ordinary spelling writes without it', () => {
    assert.ok(matches('ٱلرَّحۡمَٰنِ', 'الرحمن'));
    assert.ok(matches('هَٰذَا', 'هذا'));
    assert.ok(matches('ذَٰلِكَ', 'ذلك'));
    assert.ok(matches('إِلَٰهَ', 'إله'));
    assert.ok(matches('عَلَىٰ', 'على'));
  });

  it('reads waw with a small alif as alif, and small yeh and waw as letters', () => {
    assert.ok(matches('ٱلصَّلَوٰةَ', 'الصلاة'.replace('ة', 'ة')));
    assert.ok(matches('ٱلزَّكَوٰةَ', 'الزكاة'));
    assert.ok(matches('ٱلۡحَيَوٰةِ', 'الحياة'));
    assert.ok(matches('إِبۡرَٰهِـۧمَ', 'إبراهيم'));
    assert.ok(matches('لَهُۥ', 'له'));
  });

  it('keeps words without small letters to their single form, and typed diacritics do not matter', () => {
    assert.deepEqual(quranSearchForms('ٱلۡحَمۡدُ'), ['الحمد']);
    assert.ok(matches('رَبِّ', 'رَبِّ'));
    assert.equal(matches('ٱلرَّحۡمَٰنِ', 'الرحيم'), false);
  });

  it('works through SQLite FTS5 the way the reader queries it', () => {
    const db = new Database(':memory:');
    db.exec('CREATE VIRTUAL TABLE baglib_search USING fts5(surah UNINDEXED, ayah UNINDEXED, original UNINDEXED, normalized)');
    const insert = db.prepare('INSERT INTO baglib_search VALUES (?, ?, ?, ?)');
    insert.run(1, 2, 'ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ ٢', quranSearchText('ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ ٢'));
    insert.run(1, 3, 'ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ ٣', quranSearchText('ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ ٣'));
    const find = (text: string) => (db.prepare('SELECT ayah FROM baglib_search WHERE baglib_search MATCH ? ORDER BY ayah').all(normalizeQuranSearch(text).split(/\s+/u).map(term => `"${term}"`).join(' AND ')) as { ayah: number }[]).map(row => row.ayah);
    assert.deepEqual(find('الحمد لله رب العالمين'), [2]);
    assert.deepEqual(find('العالمين'), [2]);
    assert.deepEqual(find('الرحمن الرحيم'), [3]);
    assert.deepEqual(find('الرحمان'), [3]);
    db.close();
  });
});
