import { errorMessage } from '../../shared/errors';
/**
 * Baglib — Library Views & Bulk Operations IPC Handlers
 *
 * Implements IPC endpoints for paginated querying, multi-criteria sorting,
 * batch bulk updates, and view settings persistence.
 */

import { ipcMain } from 'electron';
import { getDatabase } from '../database/connection';
import { SqliteWorkRepository } from '../database/repositories/work.repository';
import { settingsRepository } from '../database/repositories/settings.repository';
import type {
  WorkQueryOptions,
  ViewPreferences,
  BulkUpdateCategoryInput,
  BulkUpdateStatusInput,
  BulkAddTagsInput,
  BulkDeleteInput,
  BulkRestoreInput,
} from '../../shared/types/library-views';

const DEFAULT_VIEW_PREFERENCES: ViewPreferences = {
  viewMode: 'grid',
  cardDensity: 'comfortable',
  listDensity: 'normal',
  visibleColumns: ['cover', 'title', 'author', 'category', 'format', 'location', 'status', 'actions'],
  sortBy: 'newest',
  sortDirection: 'desc',
  pageSize: 24,
};

export function setupLibraryViewsIPC() {
  /**
   * Retrieves paginated works using multi-criteria filtering and SQL sorting.
   */
  ipcMain.handle('library:get-paginated-works', (_, options: WorkQueryOptions) => {
    try {
      const db = getDatabase();
      const repo = new SqliteWorkRepository(db);
      return repo.getPaginatedWorks(options);
    } catch (err) {
      console.error('[baglib/library-views-ipc] Failed to get paginated works:', err);
      return {
        items: [],
        totalCount: 0,
        page: options?.page || 1,
        pageSize: options?.pageSize || 24,
        totalPages: 1,
      };
    }
  });

  /**
   * Bulk updates category assignment for multiple works.
   */
  ipcMain.handle('library:bulk-update-category', (_, input: BulkUpdateCategoryInput) => {
    try {
      const db = getDatabase();
      const repo = new SqliteWorkRepository(db);
      const affected = repo.bulkUpdateCategory(input.workIds, input.categoryId);
      return { success: true, affectedCount: affected };
    } catch (err: unknown) {
      console.error('[baglib/library-views-ipc] Failed to bulk update category:', err);
      return { success: false, affectedCount: 0, error: errorMessage(err) || String(err) };
    }
  });

  /**
   * KEY-44: bulk shelf assignment for the physical copies of the selected works.
   */
  ipcMain.handle('library:bulk-update-shelf', (_, input: { workIds: unknown; shelf: unknown }) => {
    try {
      if (!Array.isArray(input?.workIds) || input.workIds.length > 10000 || !input.workIds.every(id => typeof id === 'string' && id.length <= 200) || typeof input.shelf !== 'string' || input.shelf.length > 200) {
        return { success: false, updated: 0, skipped: 0, error: 'invalid-request' };
      }
      const result = new SqliteWorkRepository(getDatabase()).bulkUpdateShelf(input.workIds as string[], input.shelf);
      return { success: true, ...result };
    } catch (err: unknown) {
      console.error('[baglib/library-views-ipc] Failed to bulk update shelf:', err);
      return { success: false, updated: 0, skipped: 0, error: errorMessage(err) || String(err) };
    }
  });

  /**
   * Bulk updates reading status and progress for multiple works.
   */
  ipcMain.handle('library:bulk-update-reading-status', (_, input: BulkUpdateStatusInput) => {
    try {
      const db = getDatabase();
      const repo = new SqliteWorkRepository(db);
      const affected = repo.bulkUpdateReadingStatus(input.workIds, input.readingStatus, input.readingProgress);
      return { success: true, affectedCount: affected };
    } catch (err: unknown) {
      console.error('[baglib/library-views-ipc] Failed to bulk update reading status:', err);
      return { success: false, affectedCount: 0, error: errorMessage(err) || String(err) };
    }
  });

  /**
   * Bulk adds tags to multiple works.
   */
  ipcMain.handle('library:bulk-add-tags', (_, input: BulkAddTagsInput) => {
    try {
      const db = getDatabase();
      const repo = new SqliteWorkRepository(db);
      const affected = repo.bulkAddTags(input.workIds, input.tags);
      return { success: true, affectedCount: affected };
    } catch (err: unknown) {
      console.error('[baglib/library-views-ipc] Failed to bulk add tags:', err);
      return { success: false, affectedCount: 0, error: errorMessage(err) || String(err) };
    }
  });

  /**
   * Bulk deletes multiple works (soft-deletes by default, permanent if requested - KEY-45).
   */
  ipcMain.handle('library:bulk-delete', (_, input: BulkDeleteInput) => {
    try {
      const db = getDatabase();
      const repo = new SqliteWorkRepository(db);
      const affected = input.permanent
        ? repo.bulkPermanentDelete(input.workIds)
        : repo.bulkSoftDelete(input.workIds);
      return { success: true, affectedCount: affected };
    } catch (err: unknown) {
      console.error('[baglib/library-views-ipc] Failed to bulk delete works:', err);
      return { success: false, affectedCount: 0, error: errorMessage(err) || String(err) };
    }
  });

  /**
   * Bulk restores multiple works from the trash bin (KEY-45).
   */
  ipcMain.handle('library:bulk-restore', (_, input: BulkRestoreInput) => {
    try {
      const db = getDatabase();
      const repo = new SqliteWorkRepository(db);
      const affected = repo.bulkRestore(input.workIds);
      return { success: true, affectedCount: affected };
    } catch (err: unknown) {
      console.error('[baglib/library-views-ipc] Failed to bulk restore works:', err);
      return { success: false, affectedCount: 0, error: errorMessage(err) || String(err) };
    }
  });

  /**
   * Settings IPC Handlers
   */
  ipcMain.handle('settings:get', (_, key: string, defaultValue?: unknown) => {
    if (typeof key !== 'string' || key.startsWith('private.')) return defaultValue;
    try {
      return settingsRepository.get(key, defaultValue);
    } catch (err) {
      console.error('[baglib/settings-ipc] Failed to get setting:', key, err);
      return defaultValue;
    }
  });

  ipcMain.handle('settings:set', (_, key: string, value: unknown) => {
    if (typeof key !== 'string' || key.startsWith('private.')) return false;
    try {
      settingsRepository.set(key, value);
      return true;
    } catch (err) {
      console.error('[baglib/settings-ipc] Failed to set setting:', key, err);
      return false;
    }
  });

  ipcMain.handle('settings:get-all', () => {
    try {
      return Object.fromEntries(Object.entries(settingsRepository.getAll()).filter(([key]) => !key.startsWith('private.')));
    } catch (err) {
      console.error('[baglib/settings-ipc] Failed to get all settings:', err);
      return {};
    }
  });

  ipcMain.handle('settings:delete', (_, key: string) => {
    if (typeof key !== 'string' || key.startsWith('private.')) return false;
    try {
      return settingsRepository.delete(key);
    } catch (err) {
      console.error('[baglib/settings-ipc] Failed to delete setting:', key, err);
      return false;
    }
  });

  /**
   * View Preferences helper endpoints
   */
  ipcMain.handle('settings:get-view-preferences', () => {
    try {
      const saved = settingsRepository.get<Partial<ViewPreferences>>('library_view_preferences', {});
      return {
        ...DEFAULT_VIEW_PREFERENCES,
        ...saved,
      };
    } catch (err) {
      console.error('[baglib/settings-ipc] Failed to get view preferences:', err);
      return DEFAULT_VIEW_PREFERENCES;
    }
  });

  ipcMain.handle('settings:save-view-preferences', (_, prefs: Partial<ViewPreferences>) => {
    try {
      const current = settingsRepository.get<Partial<ViewPreferences>>('library_view_preferences', DEFAULT_VIEW_PREFERENCES);
      const updated: ViewPreferences = {
        ...DEFAULT_VIEW_PREFERENCES,
        ...current,
        ...prefs,
      };
      settingsRepository.set('library_view_preferences', updated);
      return updated;
    } catch (err) {
      console.error('[baglib/settings-ipc] Failed to save view preferences:', err);
      return DEFAULT_VIEW_PREFERENCES;
    }
  });
}
