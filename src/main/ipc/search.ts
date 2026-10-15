/**
 * Baglib — Unified Search & Online Book Discovery IPC Handlers
 *
 * Implements IPC channels for:
 * - Streaming multi-provider book search with progressive IPC events.
 * - Provider management (enable/disable, metadata).
 * - One-click book import (with optional automatic file downloading and cover caching).
 */

import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDatabase } from '../database/connection';
import { WorkRepository } from '../database/repositories/work.repository';
import { SqliteSettingsRepository } from '../database/repositories/settings.repository';
import { SearchOrchestratorService } from '../services/search/search-orchestrator.service';
import { LocalSearchProvider } from '../services/search/providers/local-search.provider';
import { OpenLibrarySearchProvider } from '../services/search/providers/open-library-search.provider';
import { GoogleBooksSearchProvider } from '../services/search/providers/google-books-search.provider';
import { InternetArchiveSearchProvider } from '../services/search/providers/internet-archive-search.provider';
import { GutenbergSearchProvider } from '../services/search/providers/gutenberg-search.provider';
import { DuplicateDetector } from '../services/search/duplicate-detector';
import { ContentShieldService } from '../services/shield/content-shield.service';
import {
  UnifiedSearchQuery,
  UnifiedSearchResult,
  SearchProviderId,
  ImportSearchResultInput,
  ImportSearchResultOutput,
  SearchProgressUpdate,
} from '../../shared/types/search';
import { BookItemInput } from '../../shared/types/work';

// Maintain active search abort controllers by searchId
const activeSearchControllers = new Map<string, AbortController>();

export function setupSearchIPC(): { orchestrator: SearchOrchestratorService } {
  const getLocalBooks = () => {
    try {
      const db = getDatabase();
      const repo = new WorkRepository(db);
      return repo.getAllWorks();
    } catch {
      return [];
    }
  };

  const orchestrator = new SearchOrchestratorService(getLocalBooks);

  // Initialize and register core discovery providers
  const localProvider = new LocalSearchProvider(getLocalBooks);
  const openLibraryProvider = new OpenLibrarySearchProvider();
  const googleBooksProvider = new GoogleBooksSearchProvider();
  const internetArchiveProvider = new InternetArchiveSearchProvider();
  const gutenbergProvider = new GutenbergSearchProvider();

  orchestrator.registerProvider(localProvider);
  orchestrator.registerProvider(openLibraryProvider);
  orchestrator.registerProvider(googleBooksProvider);
  orchestrator.registerProvider(internetArchiveProvider);
  orchestrator.registerProvider(gutenbergProvider);

  // Restore saved provider enablement settings
  try {
    const db = getDatabase();
    const settingsRepo = new SqliteSettingsRepository(db);
    const providers = orchestrator.getProviders();
    for (const p of providers) {
      const savedEnabled = settingsRepo.get<boolean>(`search.providers.${p.id}.enabled`);
      if (savedEnabled !== undefined) {
        orchestrator.setProviderEnabled(p.id, Boolean(savedEnabled));
      }
    }
  } catch (err) {
    console.warn('[baglib/search-ipc] Could not restore provider settings:', err);
  }

  /**
   * Search Query Handler:
   * Executes multi-provider book search, streams progress updates to renderer,
   * and returns aggregated, ranked results.
   */
  ipcMain.handle(
    'search:query',
    async (event, query: UnifiedSearchQuery, options?: { timeoutMs?: number; searchId?: string }) => {
      try {
        const controller = new AbortController();
        const searchKey = options?.searchId || `search-${Date.now()}`;
        activeSearchControllers.set(searchKey, controller);

        const onProgress = (update: SearchProgressUpdate) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('search:progress', update);
          }
        };

        const result = await orchestrator.search(query, {
          timeoutMs: options?.timeoutMs || 9000,
          signal: controller.signal,
          onProgress,
        });

        activeSearchControllers.delete(searchKey);
        return result;
      } catch (err: any) {
        console.error('[baglib/search-ipc] search:query failed:', err);
        return {
          searchId: options?.searchId || '',
          query,
          results: [],
          totalResults: 0,
          providerStatuses: {},
          hasLocalDuplicates: false,
          error: err?.message || String(err),
        };
      }
    }
  );

  /**
   * Cancel ongoing search by searchId, or all ongoing searches if no id provided.
   */
  ipcMain.handle('search:cancel', (_, searchId?: string) => {
    try {
      if (searchId) {
        const controller = activeSearchControllers.get(searchId);
        if (controller) {
          controller.abort();
          activeSearchControllers.delete(searchId);
          return true;
        }
        return false;
      } else {
        for (const [id, controller] of activeSearchControllers.entries()) {
          controller.abort();
          activeSearchControllers.delete(id);
        }
        return true;
      }
    } catch (err) {
      console.warn('[baglib/search-ipc] search:cancel error:', err);
      return false;
    }
  });

  /**
   * Returns metadata and active state of all registered discovery providers.
   */
  ipcMain.handle('search:get-providers', () => {
    return orchestrator.getProviders();
  });

  /**
   * Updates provider enabled preference and persists to database settings.
   */
  ipcMain.handle('search:set-provider-enabled', (_, id: SearchProviderId, enabled: boolean) => {
    try {
      orchestrator.setProviderEnabled(id, enabled);
      const db = getDatabase();
      const settingsRepo = new SqliteSettingsRepository(db);
      settingsRepo.set(`search.providers.${id}.enabled`, enabled);
      return true;
    } catch (err) {
      console.error('[baglib/search-ipc] set-provider-enabled failed:', err);
      return false;
    }
  });

  /**
   * One-Click Import Handler:
   * Imports an online discovery result into the local library:
   * - Performs duplicate check first.
   * - If downloadUrl is present and requested, downloads digital file into library storage.
   * - Creates Work, Edition, Author, and Source in SQLite.
   */
  ipcMain.handle('search:import-result', async (_, input: ImportSearchResultInput): Promise<ImportSearchResultOutput> => {
    try {
      if (!input?.result) {
        return { success: false, error: 'NO_RESULT_PROVIDED' };
      }

      const result = input.result;
      const db = getDatabase();
      const repo = new WorkRepository(db);

      // Check for local duplicate
      const localBooks = repo.getAllWorks();
      const match = DuplicateDetector.findMatch(result, localBooks);
      if (match.inLibrary && match.localWorkId) {
        return {
          success: true,
          workId: match.localWorkId,
          alreadyInLibrary: true,
        };
      }

      let downloadedFilePath: string | undefined;
      let fileHash: string | undefined;
      let fileSizeStr: string | undefined;
      let digitalFormat: any = undefined;

      // Handle file download if requested and download link is available
      if (result.downloadUrl && input.downloadDigitalCopy !== false) {
        try {
          const userDataPath = app.getPath('userData');
          const storageDir = path.join(userDataPath, 'managed_books');
          if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
          }

          // Determine file extension
          let ext = '.epub';
          if (result.availableFormats?.includes('PDF') && result.downloadUrl.toLowerCase().includes('.pdf')) {
            ext = '.pdf';
            digitalFormat = 'PDF';
          } else if (result.availableFormats?.includes('EPUB') || result.downloadUrl.toLowerCase().includes('.epub')) {
            ext = '.epub';
            digitalFormat = 'EPUB';
          } else if (result.availableFormats?.includes('TXT')) {
            ext = '.txt';
            digitalFormat = 'TXT';
          }

          const sanitizedTitle = (result.title || 'book')
            .replace(/[/\\?%*:|"<>]/g, '_')
            .substring(0, 60)
            .trim();
          const targetFilename = `${sanitizedTitle}-${Date.now()}${ext}`;

          const shield = ContentShieldService.getInstance();
          downloadedFilePath = await shield.downloadFileDirectly(
            result.downloadUrl,
            storageDir,
            targetFilename
          );

          if (fs.existsSync(downloadedFilePath)) {
            const fileBuf = fs.readFileSync(downloadedFilePath);
            fileHash = crypto.createHash('sha256').update(fileBuf).digest('hex');
            const bytes = fileBuf.length;
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            fileSizeStr = `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
          }
        } catch (downloadErr) {
          console.warn('[baglib/search-ipc] Digital download failed, proceeding with metadata-only import:', downloadErr);
        }
      }

      // Prepare Work & Edition payload
      const bookInput: BookItemInput = {
        title: result.title || 'Untitled Book',
        author: result.author || (result.authors ? result.authors.join(', ') : 'Unknown Author'),
        publisher: result.publisher,
        publicationYear: result.publishYear,
        isbn: result.isbn || result.isbn13 || result.isbn10,
        language: result.language || 'العربية',
        description: result.description,
        coverImage: result.coverUrl,
        categories: input.targetCategoryId ? [input.targetCategoryId] : (result.subjects?.slice(0, 3) || []),
        tags: input.targetTags || [],
        bookType: downloadedFilePath ? 'digital' : 'physical',
        filePath: downloadedFilePath,
        fileHash,
        fileSize: fileSizeStr,
        digitalFormat,
        onlineSource: result.providerName,
        sourceUrl: result.sourceUrl,
      };

      const addedBook = repo.addBook(bookInput);

      return {
        success: true,
        workId: addedBook.id,
        alreadyInLibrary: false,
        downloadedFilePath,
      };
    } catch (err: any) {
      console.error('[baglib/search-ipc] search:import-result error:', err);
      return {
        success: false,
        error: err?.message || String(err),
      };
    }
  });

  return { orchestrator };
}
