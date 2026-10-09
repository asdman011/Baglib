import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteCategoryRepository } from '../../src/main/database/repositories/category.repository';

describe('SqliteCategoryRepository', () => {
  let db: Database.Database;
  let repo: SqliteCategoryRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteCategoryRepository(db);
  });

  describe('Empty and Missing-data Cases', () => {
    it('returns empty array when category table has no rows', async () => {
      const tree = await repo.getCategoryTree();
      assert.deepStrictEqual(tree, []);
    });

    it('returns empty array for breadcrumbs of non-existent category', async () => {
      const breadcrumbs = await repo.getBreadcrumbs('missing-category-id');
      assert.deepStrictEqual(breadcrumbs, []);
    });

    it('returns empty array for subtree work IDs of non-existent category', async () => {
      const workIds = await repo.getSubtreeWorkIds('missing-category-id');
      assert.deepStrictEqual(workIds, []);
    });

    it('returns empty array when category exists but has no works associated', async () => {
      db.prepare(`
        INSERT INTO category (id, parent_id, name_ar, name_en, display_order)
        VALUES ('cat-empty', NULL, 'قسم فارغ', 'Empty Category', 1)
      `).run();

      const workIds = await repo.getSubtreeWorkIds('cat-empty');
      assert.deepStrictEqual(workIds, []);
    });
  });

  describe('Hierarchical Tree and Breadcrumbs', () => {
    beforeEach(() => {
      // Seed a 3-level category hierarchy:
      // Islamic Studies (Root)
      //   └── Hadith (Child)
      //         └── Sahihayn (Grandchild)
      // History (Root 2)
      const insert = db.prepare(`
        INSERT INTO category (id, parent_id, name_ar, name_en, display_order)
        VALUES (?, ?, ?, ?, ?)
      `);

      insert.run('cat-islamic', null, 'العلوم الشرعية', 'Islamic Studies', 1);
      insert.run('cat-hadith', 'cat-islamic', 'الحديث الشريف', 'Hadith', 1);
      insert.run('cat-sahihayn', 'cat-hadith', 'الصحيحان', 'Sahihayn', 1);
      insert.run('cat-history', null, 'التاريخ', 'History', 2);
    });

    it('constructs a nested category tree with correct parent-child relationships', async () => {
      const tree = await repo.getCategoryTree();

      assert.strictEqual(tree.length, 2); // 2 root categories

      const islamicRoot = tree.find((c) => c.id === 'cat-islamic');
      const historyRoot = tree.find((c) => c.id === 'cat-history');

      assert.ok(islamicRoot);
      assert.ok(historyRoot);
      assert.strictEqual(islamicRoot.nameAr, 'العلوم الشرعية');
      assert.strictEqual(historyRoot.nameAr, 'التاريخ');

      // Check nested children
      assert.strictEqual(islamicRoot.children.length, 1);
      const hadithNode = islamicRoot.children[0];
      assert.strictEqual(hadithNode.id, 'cat-hadith');
      assert.strictEqual(hadithNode.nameAr, 'الحديث الشريف');

      assert.strictEqual(hadithNode.children.length, 1);
      const sahihaynNode = hadithNode.children[0];
      assert.strictEqual(sahihaynNode.id, 'cat-sahihayn');
      assert.strictEqual(sahihaynNode.nameAr, 'الصحيحان');
      assert.strictEqual(sahihaynNode.children.length, 0);
    });

    it('generates breadcrumbs from root down to grandchild', async () => {
      const breadcrumbs = await repo.getBreadcrumbs('cat-sahihayn');

      assert.strictEqual(breadcrumbs.length, 3);
      // Breadcrumbs ordered by depth DESC (root -> child -> target)
      assert.strictEqual(breadcrumbs[0].id, 'cat-islamic');
      assert.strictEqual(breadcrumbs[1].id, 'cat-hadith');
      assert.strictEqual(breadcrumbs[2].id, 'cat-sahihayn');
    });

    it('returns subtree work IDs including descendants and excluding unrelated works', async () => {
      // Create works attached to various categories
      const insertWork = db.prepare(`
        INSERT INTO work (id, work_type_id, title, primary_category_id)
        VALUES (?, 'wt-book', ?, ?)
      `);

      insertWork.run('work-1', 'كتاب عام في الشريعة', 'cat-islamic');
      insertWork.run('work-2', 'رياض الصالحين', 'cat-hadith');
      insertWork.run('work-3', 'صحيح البخاري', 'cat-sahihayn');
      insertWork.run('work-4', 'البداية والنهاية', 'cat-history'); // Should not be in islamic subtree

      // Query root: should contain work-1, work-2, work-3
      const islamicWorkIds = await repo.getSubtreeWorkIds('cat-islamic');
      assert.strictEqual(islamicWorkIds.length, 3);
      assert.ok(islamicWorkIds.includes('work-1'));
      assert.ok(islamicWorkIds.includes('work-2'));
      assert.ok(islamicWorkIds.includes('work-3'));
      assert.ok(!islamicWorkIds.includes('work-4'));

      // Query subcategory hadith: should contain work-2 and work-3
      const hadithWorkIds = await repo.getSubtreeWorkIds('cat-hadith');
      assert.strictEqual(hadithWorkIds.length, 2);
      assert.ok(hadithWorkIds.includes('work-2'));
      assert.ok(hadithWorkIds.includes('work-3'));

      // Query leaf sahihayn: should contain only work-3
      const sahihaynWorkIds = await repo.getSubtreeWorkIds('cat-sahihayn');
      assert.deepStrictEqual(sahihaynWorkIds, ['work-3']);
    });
  });
});
