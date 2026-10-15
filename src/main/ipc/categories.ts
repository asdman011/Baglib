/**
 * Baglib — Categories & Tags IPC Handlers (Story 10 / KEY-10)
 *
 * Implements IPC endpoints for hierarchical category management,
 * tree retrieval with recursive work counts, safe deletion with
 * reassign/orphan strategies, and tag CRUD with metadata synchronization.
 */

import { ipcMain } from 'electron';
import { categoryRepository } from '../database/repositories/category.repository';
import { tagRepository } from '../database/repositories/tag.repository';
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  CategoryDeleteStrategy,
} from '../../shared/types/category';

export function setupCategoriesIPC() {
  // =========================================================================
  // CATEGORIES IPC
  // =========================================================================

  /**
   * Retrieves the full hierarchical category tree with optional work counts.
   */
  ipcMain.handle('categories:get-tree', async (_, options?: { includeCounts?: boolean }) => {
    try {
      return await categoryRepository.getCategoryTree(options);
    } catch (err) {
      console.error('[baglib/categories-ipc] Failed to fetch category tree:', err);
      return [];
    }
  });

  /**
   * Retrieves all flat categories.
   */
  ipcMain.handle('categories:get-all', async () => {
    try {
      return await categoryRepository.getAllCategories();
    } catch (err) {
      console.error('[baglib/categories-ipc] Failed to fetch all categories:', err);
      return [];
    }
  });

  /**
   * Retrieves breadcrumb path from root to the specified category.
   */
  ipcMain.handle('categories:get-breadcrumbs', async (_, categoryId: string) => {
    try {
      return await categoryRepository.getBreadcrumbs(categoryId);
    } catch (err) {
      console.error('[baglib/categories-ipc] Failed to fetch category breadcrumbs:', err);
      return [];
    }
  });

  /**
   * Creates a new category.
   */
  ipcMain.handle('categories:create', async (_, input: CategoryCreateInput) => {
    try {
      return await categoryRepository.createCategory(input);
    } catch (err) {
      console.error('[baglib/categories-ipc] Failed to create category:', err);
      throw err;
    }
  });

  /**
   * Updates an existing category (name, parentId, etc.).
   */
  ipcMain.handle('categories:update', async (_, id: string, input: CategoryUpdateInput) => {
    try {
      return await categoryRepository.updateCategory(id, input);
    } catch (err) {
      console.error('[baglib/categories-ipc] Failed to update category:', err);
      throw err;
    }
  });

  /**
   * Deletes a category with orphan or reassign strategy.
   */
  ipcMain.handle('categories:delete', async (_, id: string, strategy?: CategoryDeleteStrategy, reassignToId?: string) => {
    try {
      return await categoryRepository.deleteCategory(id, strategy, reassignToId);
    } catch (err) {
      console.error('[baglib/categories-ipc] Failed to delete category:', err);
      throw err;
    }
  });

  /**
   * Reorders categories according to array of IDs.
   */
  ipcMain.handle('categories:reorder', async (_, orderedIds: string[]) => {
    try {
      return await categoryRepository.reorderCategories(orderedIds);
    } catch (err) {
      console.error('[baglib/categories-ipc] Failed to reorder categories:', err);
      throw err;
    }
  });

  // =========================================================================
  // TAGS IPC
  // =========================================================================

  /**
   * Retrieves all tags with their associated work count.
   */
  ipcMain.handle('tags:get-all', async () => {
    try {
      return await tagRepository.getAllTags();
    } catch (err) {
      console.error('[baglib/categories-ipc] Failed to fetch tags:', err);
      return [];
    }
  });

  /**
   * Retrieves most popular tags sorted by work count descending.
   */
  ipcMain.handle('tags:get-popular', async (_, limit?: number) => {
    try {
      return await tagRepository.getPopularTags(limit);
    } catch (err) {
      console.error('[baglib/categories-ipc] Failed to fetch popular tags:', err);
      return [];
    }
  });

  /**
   * Creates a new tag or returns existing if name matches.
   */
  ipcMain.handle('tags:create', async (_, name: string, category?: string) => {
    try {
      return await tagRepository.createTag(name, category);
    } catch (err) {
      console.error('[baglib/categories-ipc] Failed to create tag:', err);
      throw err;
    }
  });

  /**
   * Renames a tag and syncs work metadata.
   */
  ipcMain.handle('tags:update', async (_, id: string, name: string) => {
    try {
      return await tagRepository.updateTag(id, name);
    } catch (err) {
      console.error('[baglib/categories-ipc] Failed to update tag:', err);
      throw err;
    }
  });

  /**
   * Deletes a tag and cleans up work references.
   */
  ipcMain.handle('tags:delete', async (_, id: string) => {
    try {
      return await tagRepository.deleteTag(id);
    } catch (err) {
      console.error('[baglib/categories-ipc] Failed to delete tag:', err);
      throw err;
    }
  });

  /**
   * Merges source tag into target tag.
   */
  ipcMain.handle('tags:merge', async (_, sourceTagId: string, targetTagId: string) => {
    try {
      return await tagRepository.mergeTags(sourceTagId, targetTagId);
    } catch (err) {
      console.error('[baglib/categories-ipc] Failed to merge tags:', err);
      throw err;
    }
  });
}
