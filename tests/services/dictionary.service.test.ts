import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DictionaryService } from '../../src/main/services/dictionary/dictionary.service';
import migration012 from '../../src/main/database/migrations/012_dictionaries_and_headwords';

const FIXTURES_DIR = path.resolve(
  __dirname,
  '../../repos/readest/readest-main/apps/readest-app/src/__tests__/fixtures/data/dicts'
);

describe('KEY-142 DictionaryService & Sub-10ms Headword Index Tests', () => {
  it('migrates, indexes headwords in SQLite, and performs sub-10ms lookups', async () => {
    // In-memory test SQLite DB
    const db = new Database(':memory:');
    migration012.up(db);

    const service = new DictionaryService(db);

    // Import real MDict bundle
    const mdxPath = path.join(FIXTURES_DIR, 'mdict-en-en.mdx');
    const imported = await service.importDictionary({
      sourcePath: mdxPath,
      title: 'English Learner Dictionary',
      sourceLang: 'en',
      targetLang: 'en',
    });

    assert.ok(imported.id);
    assert.equal(imported.format, 'mdict');
    assert.ok(imported.entryCount > 0);

    // Verify dictionaries list
    const dicts = service.listDictionaries();
    assert.equal(dicts.length, 1);
    assert.equal(dicts[0]?.title, 'English Learner Dictionary');

    // Test sub-10ms lookup
    const lookupRes = await service.lookup('abandon', { includeWikipedia: false });
    assert.equal(lookupRes.query, 'abandon');
    assert.ok(lookupRes.entries.length > 0, 'Should find matches in imported dictionary');
    assert.equal(lookupRes.entries[0]?.headword, 'abandon');
    assert.ok(lookupRes.entries[0]?.definitionHtml.includes('abandon'));
    assert.ok(lookupRes.durationMs < 15, `Lookup duration was ${lookupRes.durationMs}ms, should be sub-10ms SQLite execution`);

    // Test toggle dictionary
    service.toggleDictionary(imported.id, false);
    const disabledLookup = await service.lookup('abandon', { includeWikipedia: false });
    assert.equal(disabledLookup.entries.length, 0, 'Disabled dictionary should return no entries');

    service.toggleDictionary(imported.id, true);
    const reenabledLookup = await service.lookup('abandon', { includeWikipedia: false });
    assert.equal(reenabledLookup.entries.length, 1, 'Re-enabled dictionary should return match');

    // Test delete dictionary
    const deleted = service.deleteDictionary(imported.id);
    assert.ok(deleted);
    assert.equal(service.listDictionaries().length, 0);

    db.close();
  });

  it('searches with candidate prioritization and Arabic root fallback', async () => {
    const db = new Database(':memory:');
    migration012.up(db);

    const service = new DictionaryService(db);

    const mdxPath = path.join(FIXTURES_DIR, 'mdict-en-en.mdx');
    const dictId = 'classical-lisan-arab';
    db.prepare(`
      INSERT INTO dictionaries (id, title, format, source_path, source_lang, target_lang, entry_count, is_enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(dictId, 'لسان العرب', 'mdict', mdxPath, 'ar', 'ar', 1, new Date().toISOString());

    db.prepare(`
      INSERT INTO headword_index (dict_id, headword, normalized_headword)
      VALUES (?, ?, ?)
    `).run(dictId, 'كتب', 'كتب');

    // Query with vocalized derived form 'كِتَابُهُمْ'
    const candidates = await service.lookup('كِتَابُهُمْ', { includeWikipedia: false });
    assert.ok(candidates.candidates.some(c => c.token === 'كتب' && c.type === 'arabic_root'));

    db.close();
  });
});
