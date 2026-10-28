import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteTagRepository } from '../../src/main/database/repositories/tag.repository';

describe('SqliteTagRepository Unit Tests (Task 10.1)', () => {
  let db: Database.Database;
  let repo: SqliteTagRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteTagRepository(db);
  });

  describe('Tag Creation and Retrieval', () => {
    it('creates a new tag with normalized name', () => {
      const tag = repo.createTag('  تاريخ إسلامي  ', 'history');
      assert.ok(tag.id);
      assert.strictEqual(tag.name, 'تاريخ إسلامي');
      assert.strictEqual(tag.category, 'history');
      assert.strictEqual(tag.origin, 'manual');
    });

    it('returns existing tag when creating a tag with existing name (case-insensitive)', () => {
      const tag1 = repo.createTag('Philosophy');
      const tag2 = repo.createTag('philosophy');
      assert.strictEqual(tag1.id, tag2.id);
      assert.strictEqual(tag2.name, 'Philosophy');
    });

    it('throws error when trying to create a tag with empty name', () => {
      assert.throws(() => {
        repo.createTag('   ');
      }, /Tag name cannot be empty/);
    });

    it('retrieves all tags with accurate work counts', () => {
      const t1 = repo.createTag('Tag1');
      const t2 = repo.createTag('Tag2');
      const t3 = repo.createTag('Tag3');

      // Link works to tags
      db.prepare(`
        INSERT INTO work (id, title) VALUES ('w1', 'Book 1'), ('w2', 'Book 2'), ('w3', 'Book 3')
      `).run();

      db.prepare(`
        INSERT INTO work_tag (work_id, tag_id) VALUES 
        ('w1', ?), ('w2', ?), ('w3', ?),
        ('w1', ?)
      `).run(t1.id, t1.id, t1.id, t2.id);

      const allTags = repo.getAllTags();
      assert.strictEqual(allTags.length, 3);

      const tag1WithCount = allTags.find((t) => t.id === t1.id);
      const tag2WithCount = allTags.find((t) => t.id === t2.id);
      const tag3WithCount = allTags.find((t) => t.id === t3.id);

      assert.strictEqual(tag1WithCount?.workCount, 3);
      assert.strictEqual(tag2WithCount?.workCount, 1);
      assert.strictEqual(tag3WithCount?.workCount, 0);
    });

    it('retrieves popular tags sorted by workCount descending', () => {
      const t1 = repo.createTag('PopularTag');
      const t2 = repo.createTag('MediumTag');
      const t3 = repo.createTag('UnusedTag');

      db.prepare(`
        INSERT INTO work (id, title) VALUES ('w1', 'Book 1'), ('w2', 'Book 2')
      `).run();

      db.prepare(`
        INSERT INTO work_tag (work_id, tag_id) VALUES 
        ('w1', ?), ('w2', ?),
        ('w1', ?)
      `).run(t1.id, t1.id, t2.id);

      const popular = repo.getPopularTags(2);
      assert.strictEqual(popular.length, 2);
      assert.strictEqual(popular[0].id, t1.id);
      assert.strictEqual(popular[0].workCount, 2);
      assert.strictEqual(popular[1].id, t2.id);
      assert.strictEqual(popular[1].workCount, 1);
    });
  });

  describe('Tag Renaming and Synchronization', () => {
    it('renames a tag and synchronizes work metadata_json', () => {
      const tag = repo.createTag('OldTag');
      
      // Setup work with relational work_tag AND metadata_json tags array
      const initialMeta = JSON.stringify({ tags: ['OldTag', 'OtherTag'] });
      db.prepare(`INSERT INTO work (id, title, metadata_json) VALUES ('w1', 'Book 1', ?)`).run(initialMeta);
      db.prepare(`INSERT INTO work_tag (work_id, tag_id) VALUES ('w1', ?)`).run(tag.id);

      const updated = repo.updateTag(tag.id, 'RenamedTag');
      assert.strictEqual(updated.name, 'RenamedTag');

      // Verify db tag row
      const tagRow = db.prepare('SELECT name FROM tag WHERE id = ?').get(tag.id) as { name: string };
      assert.strictEqual(tagRow.name, 'RenamedTag');

      // Verify work metadata_json synchronized
      const workRow = db.prepare('SELECT metadata_json FROM work WHERE id = ?').get('w1') as { metadata_json: string };
      const parsedMeta = JSON.parse(workRow.metadata_json);
      assert.deepStrictEqual(parsedMeta.tags, ['RenamedTag', 'OtherTag']);
    });

    it('prevents renaming if colliding with an existing tag name', () => {
      repo.createTag('ExistingTag');
      const tagToRename = repo.createTag('TargetTag');

      assert.throws(() => {
        repo.updateTag(tagToRename.id, 'ExistingTag');
      }, /already exists/);
    });
  });

  describe('Tag Deletion and Synchronization', () => {
    it('deletes tag, removes work_tag associations, and updates work metadata_json', () => {
      const tag = repo.createTag('TagToDelete');
      const initialMeta = JSON.stringify({ tags: ['TagToDelete', 'KeepTag'] });
      db.prepare(`INSERT INTO work (id, title, metadata_json) VALUES ('w1', 'Book 1', ?)`).run(initialMeta);
      db.prepare(`INSERT INTO work_tag (work_id, tag_id) VALUES ('w1', ?)`).run(tag.id);

      const deleted = repo.deleteTag(tag.id);
      assert.strictEqual(deleted, true);

      // Verify tag is deleted from tag table
      const tagRow = db.prepare('SELECT id FROM tag WHERE id = ?').get(tag.id);
      assert.strictEqual(tagRow, undefined);

      // Verify work_tag row is deleted
      const workTagRow = db.prepare('SELECT * FROM work_tag WHERE tag_id = ?').get(tag.id);
      assert.strictEqual(workTagRow, undefined);

      // Verify work metadata_json no longer contains the deleted tag
      const workRow = db.prepare('SELECT metadata_json FROM work WHERE id = ?').get('w1') as { metadata_json: string };
      const parsedMeta = JSON.parse(workRow.metadata_json);
      assert.deepStrictEqual(parsedMeta.tags, ['KeepTag']);
    });

    it('returns false when attempting to delete a non-existent tag', () => {
      assert.strictEqual(repo.deleteTag('non-existent-id'), false);
    });
  });

  describe('Tag Merging', () => {
    it('merges source tag into target tag, re-pointing associations and updating metadata', () => {
      const sourceTag = repo.createTag('Synonym1');
      const targetTag = repo.createTag('CanonicalTag');

      // Work 1 has only source tag
      const meta1 = JSON.stringify({ tags: ['Synonym1'] });
      db.prepare(`INSERT INTO work (id, title, metadata_json) VALUES ('w1', 'Book 1', ?)`).run(meta1);
      db.prepare(`INSERT INTO work_tag (work_id, tag_id) VALUES ('w1', ?)`).run(sourceTag.id);

      // Work 2 has both source and target tag
      const meta2 = JSON.stringify({ tags: ['Synonym1', 'CanonicalTag'] });
      db.prepare(`INSERT INTO work (id, title, metadata_json) VALUES ('w2', 'Book 2', ?)`).run(meta2);
      db.prepare(`INSERT INTO work_tag (work_id, tag_id) VALUES ('w2', ?)`).run(sourceTag.id);
      db.prepare(`INSERT INTO work_tag (work_id, tag_id) VALUES ('w2', ?)`).run(targetTag.id);

      const mergedCount = repo.mergeTags(sourceTag.id, targetTag.id);
      assert.strictEqual(mergedCount, 2);

      // Source tag should no longer exist
      const sourceRow = db.prepare('SELECT id FROM tag WHERE id = ?').get(sourceTag.id);
      assert.strictEqual(sourceRow, undefined);

      // w1 should now be linked to targetTag
      const w1Tags = db.prepare('SELECT tag_id FROM work_tag WHERE work_id = ?').all('w1') as { tag_id: string }[];
      assert.strictEqual(w1Tags.length, 1);
      assert.strictEqual(w1Tags[0].tag_id, targetTag.id);

      // w1 metadata should have CanonicalTag
      const w1Meta = JSON.parse((db.prepare('SELECT metadata_json FROM work WHERE id = ?').get('w1') as unknown).metadata_json);
      assert.deepStrictEqual(w1Meta.tags, ['CanonicalTag']);

      // w2 metadata should not have duplicates
      const w2Meta = JSON.parse((db.prepare('SELECT metadata_json FROM work WHERE id = ?').get('w2') as unknown).metadata_json);
      assert.deepStrictEqual(w2Meta.tags, ['CanonicalTag']);
    });
  });
});
