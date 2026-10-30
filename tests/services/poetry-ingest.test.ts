import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPoetryPartition } from '../../src/main/services/poetry/partition';
import { ingestPoetryRows } from '../../src/main/services/poetry/ingest';
import { poetryDetail } from '../../src/main/services/poetry/queries';

test('Ashaar importer preserves empty titles and original verses, deduplicates poets and indexes only derived text', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-poetry-ingest-'));
  const database: Database.Database = openPoetryPartition(directory);
  try {
    const row = { 'poet name': 'شاعر', 'poem title': 'قصيدة أصلية', 'poem verses': ['صَدْرٌ', 'عَجُزٌ'], 'poem meter': 'بحر الطويل', 'poet url': 'https://example.com/poet', 'poet description': 'سيرة الشاعر', 'poet era': 'العصر العباسي', 'poet location': 'بغداد', 'poem theme': 'الحكمة', 'poem language type': 'فصحى', 'poem url': 'https://example.com/poem', 'poem description': [{ text: 'وصف أصلي', children: [{ text: 'تفصيل' }], attributes: { dir: 'rtl' } }] };
    assert.equal(ingestPoetryRows(database, [row, { ...row, 'poem title': null }]), 2);
    assert.equal((database.prepare('SELECT COUNT(*) n FROM poets').get() as { n: number }).n, 1);
    assert.equal((database.prepare('SELECT verses_json FROM poems WHERE id=1').get() as { verses_json: string }).verses_json, JSON.stringify(row['poem verses']));
    assert.equal((database.prepare('SELECT description_json FROM poems WHERE id=1').get() as { description_json: string }).description_json, JSON.stringify(row['poem description']));
    const detail = poetryDetail(database, 1) as Record<string, unknown>;
    const mappings = { 'poem title': 'title', 'poem meter': 'meter', 'poem theme': 'theme', 'poem url': 'source_url', 'poet name': 'poet_name', 'poet description': 'poet_bio', 'poet url': 'poet_url', 'poet era': 'poet_era', 'poet location': 'poet_location', 'poem language type': 'language_variant' } as const;
    for (const [source, field] of Object.entries(mappings)) assert.equal(detail[field], row[source as keyof typeof row], source);
    assert.deepEqual(JSON.parse(detail.verses_json as string), row['poem verses']);
    assert.deepEqual(JSON.parse(detail.description_json as string), row['poem description']);
    assert.equal((poetryDetail(database, 2) as Record<string, unknown>).title, '');
    assert.equal((database.prepare("SELECT COUNT(*) n FROM poems_fts WHERE poems_fts MATCH 'صدر'").get() as { n: number }).n, 2);
    assert.throws(() => ingestPoetryRows(database, [row]), /not-empty/u);
  } finally {
    database.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(directory).startsWith('baglib-poetry-ingest-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
