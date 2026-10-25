import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

test('the installed Electron SQLite driver supports local Arabic and English FTS5', () => {
  const database = new Database(':memory:');
  try {
    database.exec("CREATE VIRTUAL TABLE search USING fts5(resource UNINDEXED, location UNINDEXED, terms, tokenize='unicode61 remove_diacritics 0')");
    const insert = database.prepare('INSERT INTO search VALUES (?, ?, ?)');
    insert.run('script', '1:2', 'الحمد لله');
    insert.run('translation', '1:2', 'All praise is for Allah');
    const query = database.prepare('SELECT resource, location FROM search WHERE search MATCH ?');
    assert.deepEqual(query.all('الحمد'), [{ resource: 'script', location: '1:2' }]);
    assert.deepEqual(query.all('praise'), [{ resource: 'translation', location: '1:2' }]);
  } finally { database.close(); }
});

test('the installed SQLite driver resolves grouped commentary and encoded translation cells', () => {
  const database = new Database(':memory:');
  try {
    database.exec('CREATE TABLE tafsir(ayah_key TEXT PRIMARY KEY, group_ayah_key TEXT, text TEXT)');
    const insert = database.prepare('INSERT INTO tafsir VALUES (?, ?, ?)');
    insert.run('2:3', '2:3', 'تفسير مشترك');
    insert.run('2:4', '2:3', '');
    const query = database.prepare('SELECT parent.text FROM tafsir child JOIN tafsir parent ON child.group_ayah_key = parent.ayah_key WHERE child.ayah_key = ?');
    assert.deepEqual(query.get('2:4'), { text: 'تفسير مشترك' });
    const encoded = JSON.stringify('Merciful — الرَّحِيمِ');
    assert.deepEqual(database.prepare("SELECT json_extract(?, '$') AS text").get(encoded), { text: 'Merciful — الرَّحِيمِ' });
  } finally { database.close(); }
});
