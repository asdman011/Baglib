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

    it('computes direct and total recursive work counts when includeCounts is true', async () => {
      const insertWork = db.prepare(`
        INSERT INTO work (id, work_type_id, title, primary_category_id)
        VALUES (?, 'wt-book', ?, ?)
      `);

      insertWork.run('w-root', 'Root Book', 'cat-islamic');
      insertWork.run('w-child', 'Child Book', 'cat-hadith');
      insertWork.run('w-grandchild', 'Grandchild Book', 'cat-sahihayn');

      const tree = await repo.getCategoryTree({ includeCounts: true });
      const islamic = tree.find((c) => c.id === 'cat-islamic');
      const hadith = islamic?.children.find((c) => c.id === 'cat-hadith');
      const sahihayn = hadith?.children.find((c) => c.id === 'cat-sahihayn');

      assert.strictEqual(sahihayn?.directWorkCount, 1);
      assert.strictEqual(sahihayn?.totalWorkCount, 1);

      assert.strictEqual(hadith?.directWorkCount, 1);
      assert.strictEqual(hadith?.totalWorkCount, 2); // 1 direct + 1 grandchild

      assert.strictEqual(islamic?.directWorkCount, 1);
      assert.strictEqual(islamic?.totalWorkCount, 3); // 1 direct + 1 hadith + 1 sahihayn
    });
  });

  describe('Category CRUD, Reordering, and Circular Hierarchy Safety', () => {
    it('creates a category with auto-incremented displayOrder', () => {
      const cat1 = repo.createCategory({ nameAr: 'الفقه', nameEn: 'Fiqh' });
      const cat2 = repo.createCategory({ nameAr: 'أصول الفقه', nameEn: 'Principles of Fiqh', parentId: cat1.id });

      assert.ok(cat1.id);
      assert.strictEqual(cat1.nameAr, 'الفقه');
      assert.strictEqual(cat1.displayOrder, 1);

      assert.strictEqual(cat2.parentId, cat1.id);
      assert.strictEqual(cat2.displayOrder, 1);
    });

    it('prevents circular references when moving a category to become child of its own descendant', () => {
      const parent = repo.createCategory({ nameAr: 'Parent' });
      const child = repo.createCategory({ nameAr: 'Child', parentId: parent.id });
      const grandChild = repo.createCategory({ nameAr: 'Grandchild', parentId: child.id });

      // Attempt to set parent's parent to grandChild
      assert.throws(() => {
        repo.updateCategory(parent.id, { parentId: grandChild.id });
      }, /circular reference/i);

      // Attempt to set parent's parent to itself
      assert.throws(() => {
        repo.updateCategory(parent.id, { parentId: parent.id });
      }, /cannot be its own parent/i);
    });

    it('reorders categories according to array of IDs', () => {
      const c1 = repo.createCategory({ nameAr: 'Cat 1' });
      const c2 = repo.createCategory({ nameAr: 'Cat 2' });
      const c3 = repo.createCategory({ nameAr: 'Cat 3' });

      repo.reorderCategories([c3.id, c1.id, c2.id]);

      const updatedC3 = repo.getCategoryById(c3.id);
      const updatedC1 = repo.getCategoryById(c1.id);
      const updatedC2 = repo.getCategoryById(c2.id);

      assert.strictEqual(updatedC3?.displayOrder, 1);
      assert.strictEqual(updatedC1?.displayOrder, 2);
      assert.strictEqual(updatedC2?.displayOrder, 3);
    });

    it('deletes category with "orphan" strategy, reparenting children and unlinking works', () => {
      const parent = repo.createCategory({ nameAr: 'Parent' });
      const child = repo.createCategory({ nameAr: 'Child', parentId: parent.id });

      db.prepare(`
        INSERT INTO work (id, title, primary_category_id) VALUES ('w1', 'Book 1', ?)
      `).run(parent.id);

      const deleted = repo.deleteCategory(parent.id, 'orphan');
      assert.strictEqual(deleted, true);

      // Parent is removed
      assert.strictEqual(repo.getCategoryById(parent.id), null);

      // Child is promoted to root (parentId = null)
      const updatedChild = repo.getCategoryById(child.id);
      assert.strictEqual(updatedChild?.parentId, null);

      // Work primary_category_id is unlinked (null)
      const work = db.prepare('SELECT primary_category_id FROM work WHERE id = ?').get('w1') as unknown;
      assert.strictEqual(work.primary_category_id, null);
    });

    it('deletes category with "reassign" strategy, moving works and children to target category', () => {
      const target = repo.createCategory({ nameAr: 'Target' });
      const doomed = repo.createCategory({ nameAr: 'Doomed' });
      const child = repo.createCategory({ nameAr: 'Child', parentId: doomed.id });

      db.prepare(`
        INSERT INTO work (id, title, primary_category_id) VALUES ('w1', 'Book 1', ?)
      `).run(doomed.id);

      const deleted = repo.deleteCategory(doomed.id, 'reassign', target.id);
      assert.strictEqual(deleted, true);

      // Child is reparented to target
      const updatedChild = repo.getCategoryById(child.id);
      assert.strictEqual(updatedChild?.parentId, target.id);

      // Work is reassigned to target
      const work = db.prepare('SELECT primary_category_id FROM work WHERE id = ?').get('w1') as unknown;
      assert.strictEqual(work.primary_category_id, target.id);
    });
  });
});

