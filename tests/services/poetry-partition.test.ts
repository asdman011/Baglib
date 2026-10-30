import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPoetryPartition, rebuildPoetrySearch } from '../../src/main/services/poetry/partition';
import { normalizeArabicForSearch } from '../../src/shared/poetry';
import { searchPoets, searchPoetry } from '../../src/main/services/poetry/queries';

test('poetry partition isolates corpus and rebuilds joined poet/title/verse FTS correctly', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-poetry-'));
  const database = openPoetryPartition(directory);
  try {
    assert.equal(database.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(database.pragma('cache_size', { simple: true }), -64000);
    assert.equal(database.pragma('synchronous', { simple: true }), 1);
    assert.equal(database.pragma('temp_store', { simple: true }), 2);
    assert.equal(database.pragma('mmap_size', { simple: true }), 268435456);
    database.prepare('INSERT INTO poets(id,name,name_normalized) VALUES(1,?,?)').run('المتنبي', 'المتنبي');
    const text = 'الخَيْلُ وَاللَّيْلُ وَالبَيْدَاءُ';
    database.prepare('INSERT INTO poems(id,poet_id,title,title_normalized,verses_json,search_text_normalized) VALUES(1,1,?,?,?,?)').run('عنوان', 'عنوان', JSON.stringify([text]), normalizeArabicForSearch(text));
    rebuildPoetrySearch(database);
    assert.equal((database.prepare('SELECT COUNT(*) AS n FROM poems_fts WHERE poems_fts MATCH ?').get('الخيل') as { n: number }).n, 1);
    assert.equal((database.prepare('SELECT COUNT(*) AS n FROM poems_fts WHERE poems_fts MATCH ?').get('المتنبي') as { n: number }).n, 1);
    assert.equal((database.prepare('SELECT poem_count FROM poets WHERE id=1').get() as { poem_count: number }).poem_count, 1);
    const poets = searchPoets(database, { language: 'ar', query: 'المُتَنَبِّي' });
    assert.equal(poets.total, 1);
    assert.equal((poets.items[0] as { id: number }).id, 1);
    assert.equal(searchPoets(database, { language: 'ar', offset: 40 }).items.length, 0);
    const matches = searchPoetry(database, { query: 'الخيل والليل والبيداء' });
    assert.equal(matches.items.length, 1);
    assert.deepEqual(matches.items[0].match, { from: 0, lines: [text] });
    assert.equal('versesJson' in matches.items[0], false);
    assert.equal(searchPoetry(database, {}).items[0].match, undefined);
    assert.equal(searchPoetry(database, { query: 'المتنبي' }).items[0].match, null);
    assert.equal(fs.existsSync(path.join(directory, 'baglib.db')), false);
    assert.equal((database.prepare('SELECT verses_json FROM poems WHERE id=1').get() as { verses_json: string }).verses_json, JSON.stringify([text]));
  } finally {
    database.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(directory).startsWith('baglib-poetry-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
