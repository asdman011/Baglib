import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { readCatalog, databaseHealth, rebuildCatalogSearch } from '../../src/main/services/catalog-maintenance';
import { CATALOG_TABLES, catalogToCsv } from '../../src/shared/catalog-export';

test('full catalog preserves all columns, links, exact Arabic and soft-deleted rows', () => {
  const db = createTestDatabase();
  try {
    db.prepare('INSERT INTO work(id,title,deleted_at) VALUES(?,?,?)').run('export-ar', 'عِلْمٌ, "Arabic"\nسطر', '2026-01-01');
    const catalog = readCatalog(db);
    assert.equal(catalog.format, 'baglib-catalog');
    assert.equal(catalog.version, 1);
    assert.deepEqual(Object.keys(catalog.tables), [...CATALOG_TABLES]);
    const row = catalog.tables.work.find(row => row.id === 'export-ar')!;
    assert.equal(row.title, 'عِلْمٌ, "Arabic"\nسطر');
    assert.equal(row.deleted_at, '2026-01-01');
    assert.deepEqual(JSON.parse(JSON.stringify(catalog)), catalog);
    const csv = catalogToCsv(catalog);
    assert.deepEqual([...Buffer.from(csv).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(csv.includes('"عِلْمٌ, ""Arabic""\nسطر"'));
    assert.ok(csv.startsWith('\uFEFF"table",'));
    assert.ok(csv.endsWith('\r\n'));
  } finally { db.close(); }
});

test('CSV supports empty catalogs and correctly quotes CRLF, zero, quotes and mixed script', () => {
  const db = createTestDatabase();
  try {
    const catalog = readCatalog(db);
    for (const table of CATALOG_TABLES) catalog.tables[table] = [];
    assert.equal(catalogToCsv(catalog), '\uFEFF"table"\r\n');
    catalog.tables.tag = [{ id: 't', name: 'علم English\r\n"x",y', count: 0, empty: null }];
    const csv = catalogToCsv(catalog);
    assert.ok(csv.includes('"علم English\r\n""x"",y"'));
    assert.ok(csv.includes('"0"'));
  } finally { db.close(); }
});

test('health is read-only and rebuild preserves stored text, row identities and search results', async () => {
  const db = createTestDatabase();
  try {
    db.prepare('INSERT INTO book_content_fts(book_id,page_number,content,normalized_content) VALUES(?,?,?,?)').run('w', 1, 'عِلْمٌ English', 'علم english');
    const before = db.prepare('SELECT rowid,* FROM book_content_fts').all();
    const changes = () => (db.prepare('SELECT total_changes() AS count').get() as { count: number }).count;
    const writes = changes();
    const health = databaseHealth(db);
    assert.deepEqual(health.integrity, ['ok']);
    assert.equal(health.sizeBytes, health.pageCount * health.pageSize);
    for (const table of CATALOG_TABLES) assert.ok(health.rows.some(row => row.table === table));
    assert.ok(health.rows.every(row => !row.table.startsWith('book_content_fts_')));
    assert.equal(changes(), writes);
    const progress: unknown[] = [];
    assert.deepEqual(await rebuildCatalogSearch(db, value => progress.push(value)), { completed: 1, total: 1 });
    assert.deepEqual(progress, [{ completed: 0, total: 1 }, { completed: 1, total: 1 }]);
    assert.deepEqual(db.prepare('SELECT rowid,* FROM book_content_fts').all(), before);
    for (const query of ['علم', 'english']) assert.equal((db.prepare('SELECT COUNT(*) AS count FROM book_content_fts WHERE book_content_fts MATCH ?').get(query) as { count: number }).count, 1);
  } finally { db.close(); }
});
