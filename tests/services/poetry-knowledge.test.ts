import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { PoetryKnowledgeService, validatePoetrySave } from '../../src/main/services/poetry/knowledge';
import type { PoetryDetail } from '../../src/shared/types/poetry';

test('Poetry persists native notes, quotes and bookmarks in existing Knowledge tables without fake works', () => {
  const database = createTestDatabase();
  try {
    const service = new PoetryKnowledgeService(database);
    const poem: PoetryDetail = { id: 42, title: 'قَصِيدَةٌ', language: 'ar', layout_type: 'bayt', meter: 'بحر الطويل', verses_json: JSON.stringify(['صَدْرٌ ', 'عَجُزٌ', 'آخر', 'بيت']), poet_name: 'شاعر', poet_bio: null, poet_id: 2, poet_era: null, poet_location: null, theme: null, language_variant: null, source_url: null, poet_url: null, description_json: null, verse_count: 4 };
    const before = database.prepare('SELECT COUNT(*) AS n FROM work').get();
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    for (const type of ['note', 'quote', 'bookmark'] as const) {
      const saved = service.save({ poemId: 42, from: 0, to: 1, type, note: 'تأمل شخصي' }, poem);
      assert.equal(saved.reference, 'poetry:ashaar:42:0:1');
      assert.equal(saved.type, type);
      const row = database.prepare('SELECT work_id,edition_id,source_id FROM knowledge WHERE id=?').get(saved.id);
      assert.deepEqual(row, { work_id: null, edition_id: null, source_id: null });
    }
    assert.equal(service.list().items.length, 3);
    assert.equal(service.list().items.find(item => item.type === 'quote')?.text, 'صَدْرٌ  *** عَجُزٌ');
    assert.ok(service.list().items.find(item => item.type === 'note')?.note?.includes('تأمل شخصي'));
    assert.equal(service.list().items.find(item => item.type === 'bookmark')?.label, poem.title);
    for (let index = 0; index < 40; index++) service.save({ poemId: 42, from: 2, to: 3, type: 'bookmark' }, poem);
    assert.equal(service.list().items.length, 40);
    assert.equal(service.list().next, 40);
    assert.equal(service.list(40).items.length, 3);
    assert.deepEqual(database.prepare('SELECT COUNT(*) AS n FROM work').get(), before);
    assert.deepEqual(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(), tables);
    assert.deepEqual(database.pragma('foreign_key_check'), []);
    assert.throws(() => service.save({ poemId: 42, from: 0, to: 4, type: 'quote' }, poem), /invalid-poetry-range/u);
    assert.throws(() => service.list(-1), /invalid-poetry-query/u);
    assert.throws(() => validatePoetrySave({ poemId: 42, from: 3, to: 1, type: 'quote' }), /invalid-poetry-knowledge/u);
    assert.throws(() => validatePoetrySave({ poemId: 42, from: 0, to: 1, type: 'book' }), /invalid-poetry-knowledge/u);
    assert.equal((database.prepare('SELECT COUNT(*) AS n FROM knowledge').get() as { n: number }).n, 43);
  } finally { database.close(); }
});
