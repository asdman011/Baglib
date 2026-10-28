import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translations } from '../../src/renderer/translations';
import { getTagColorClass } from '../../src/renderer/components/tags/TagEditor';
import type { CategoryNode } from '../../src/shared/types/category';

describe('Categories & Tags UI & Integration Tests (Story 10 / KEY-117)', () => {
  describe('Bilingual Localization & Translations Integrity', () => {
    const requiredKeys = [
      'addCategory',
      'editCategory',
      'deleteCategory',
      'categoryNameAr',
      'categoryNameEn',
      'parentCategory',
      'noParentCategory',
      'saveCategory',
      'categoryDirectCount',
      'categoryTotalCount',
      'categoryReorder',
      'categoryMoveUp',
      'categoryMoveDown',
      'deleteCategoryModalTitle',
      'deleteCategoryWarning',
      'deleteStrategyOrphan',
      'deleteStrategyOrphanDesc',
      'deleteStrategyReassign',
      'deleteStrategyReassignDesc',
      'reassignTargetCategory',
      'confirmDeleteCategory',
      'selectCategory',
      'searchCategory',
      'noCategoryFound',
      'clearCategory',
      'rootCategory',
      'browseCategories',
      'tagsTab',
      'categoriesTab',
      'manageTagsDesc',
      'noTags',
      'searchTags',
      'tagEditorLabel',
      'addTagPlaceholder',
      'popularTags',
      'existingTags',
      'renameTag',
      'renameTagTitle',
      'tagNameLabel',
      'deleteTag',
      'confirmDeleteTagTitle',
      'confirmDeleteTagDesc',
      'mergeTags',
      'mergeTagsTitle',
      'mergeTargetTag',
      'mergeConfirm',
      'tagSaved',
      'tagDeleted',
      'tagsMerged',
      'colorPalette',
    ] as const;

    it('contains all Story 10 translation keys in both Arabic and English', () => {
      for (const key of requiredKeys) {
        assert.ok(
          translations.ar[key],
          `Missing Arabic translation for key: ${key}`
        );
        assert.ok(
          translations.en[key],
          `Missing English translation for key: ${key}`
        );
        assert.notStrictEqual(
          translations.ar[key].trim(),
          '',
          `Arabic translation for key "${key}" should not be empty`
        );
        assert.notStrictEqual(
          translations.en[key].trim(),
          '',
          `English translation for key "${key}" should not be empty`
        );
      }
    });

    it('has proper RTL and LTR directionality strings for categories and tags tabs', () => {
      assert.strictEqual(translations.ar.categoriesTab, 'شجرة التصنيفات');
      assert.strictEqual(translations.en.categoriesTab, 'Categories Tree');

      assert.strictEqual(translations.ar.tagsTab, 'الوسوم والكلمات المفتاحية');
      assert.strictEqual(translations.en.tagsTab, 'Tags & Keywords');
    });
  });

  describe('Tag Color Palette Consistency', () => {
    it('generates deterministic color classes for identical tag names', () => {
      const col1 = getTagColorClass('Philosophy');
      const col2 = getTagColorClass('Philosophy');
      assert.deepStrictEqual(col1, col2);
    });

    it('returns valid Tailwind color classes with bg, text, and border', () => {
      const palette = getTagColorClass('Fiqh');
      assert.ok(palette.bg.startsWith('bg-'));
      assert.ok(palette.text.startsWith('text-'));
      assert.ok(palette.border.startsWith('border-'));
    });
  });

  describe('Category Tree Search & Filter Pruning Logic', () => {
    const mockTree: CategoryNode[] = [
      {
        id: 'c1',
        nameAr: 'العلوم الشرعية',
        nameEn: 'Islamic Studies',
        parentId: null,
        displayOrder: 1,
        createdAt: '2026-01-01',
        children: [
          {
            id: 'c1-1',
            nameAr: 'الحديث الشريف',
            nameEn: 'Hadith',
            parentId: 'c1',
            displayOrder: 1,
            createdAt: '2026-01-01',
            children: [
              {
                id: 'c1-1-1',
                nameAr: 'الصحيحان',
                nameEn: 'Sahihayn',
                parentId: 'c1-1',
                displayOrder: 1,
                createdAt: '2026-01-01',
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: 'c2',
        nameAr: 'التاريخ',
        nameEn: 'History',
        parentId: null,
        displayOrder: 2,
        createdAt: '2026-01-01',
        children: [],
      },
    ];

    function filterTree(nodes: CategoryNode[], query: string): CategoryNode[] {
      if (!query) return nodes;
      const q = query.toLowerCase();

      function cloneAndPrune(node: CategoryNode): CategoryNode | null {
        const arMatch = node.nameAr.toLowerCase().includes(q);
        const enMatch = node.nameEn ? node.nameEn.toLowerCase().includes(q) : false;
        const filteredChildren = (node.children || [])
          .map(cloneAndPrune)
          .filter((c): c is CategoryNode => c !== null);

        if (arMatch || enMatch || filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren,
          };
        }
        return null;
      }

      return nodes.map(cloneAndPrune).filter((n): n is CategoryNode => n !== null);
    }

    it('matches leaf node and preserves parent ancestor path while pruning unrelated trees', () => {
      const filtered = filterTree(mockTree, 'صحيح');
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].id, 'c1');
      assert.strictEqual(filtered[0].children.length, 1);
      assert.strictEqual(filtered[0].children[0].id, 'c1-1');
      assert.strictEqual(filtered[0].children[0].children[0].id, 'c1-1-1');
    });

    it('matches English query seamlessly across hierarchy', () => {
      const filtered = filterTree(mockTree, 'hadith');
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].id, 'c1');
      assert.strictEqual(filtered[0].children[0].id, 'c1-1');
    });

    it('returns empty array when query does not match any node in tree', () => {
      const filtered = filterTree(mockTree, 'Astronomy');
      assert.strictEqual(filtered.length, 0);
    });
  });

  describe('Preload API Definition Integrity', () => {
    it('verifies categories and tags namespaces are exposed in API structure', async () => {
      const { API } = await import('../../src/preload/index');
      assert.ok(API.categories, 'API.categories namespace should exist');
      assert.strictEqual(typeof API.categories.getTree, 'function');
      assert.strictEqual(typeof API.categories.getAll, 'function');
      assert.strictEqual(typeof API.categories.getBreadcrumbs, 'function');
      assert.strictEqual(typeof API.categories.create, 'function');
      assert.strictEqual(typeof API.categories.update, 'function');
      assert.strictEqual(typeof API.categories.delete, 'function');
      assert.strictEqual(typeof API.categories.reorder, 'function');

      assert.ok(API.tags, 'API.tags namespace should exist');
      assert.strictEqual(typeof API.tags.getAll, 'function');
      assert.strictEqual(typeof API.tags.getPopular, 'function');
      assert.strictEqual(typeof API.tags.create, 'function');
      assert.strictEqual(typeof API.tags.update, 'function');
      assert.strictEqual(typeof API.tags.delete, 'function');
      assert.strictEqual(typeof API.tags.merge, 'function');
    });
  });
});
