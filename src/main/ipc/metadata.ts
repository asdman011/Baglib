/**
 * Baglib — Metadata & Online Provider IPC Handlers
 */

import { ipcMain, app, shell } from 'electron';
import path from 'path';
import { libgenProvider } from '../services/metadata/libgen.provider';
import { annasProvider } from '../services/metadata/annas.provider';
import { ContentShieldService } from '../services/shield/content-shield.service';
import { bibliographicMetadataService } from '../services/metadata/bibliographic-metadata.service';
import { FilenameParser } from '../services/metadata/filename-parser';
import { coverResolverService } from '../services/metadata/cover-resolver.service';

export function setupMetadataIPC() {
  /**
   * Search Library Genesis for books and academic papers
   */
  ipcMain.handle('library:search-libgen', async (_, query: string, maxResults?: number) => {
    try {
      if (!query || typeof query !== 'string') return [];
      return await libgenProvider.search(query, maxResults || 25);
    } catch (err) {
      console.error('[baglib/metadata-ipc] Failed to search LibGen:', err);
      return [];
    }
  });

  /**
   * Search Anna's Archive for books and papers
   */
  ipcMain.handle('library:search-annas', async (_, query: string, maxResults?: number) => {
    try {
      if (!query || typeof query !== 'string') return [];
      return await annasProvider.search(query, maxResults || 25);
    } catch (err) {
      console.error('[baglib/metadata-ipc] Failed to search Anna\'s Archive:', err);
      return [];
    }
  });

  /**
   * Bibliographic Metadata Endpoints
   */
  ipcMain.handle('library:search-bibliographic', async (_, query: any, maxResults?: number) => {
    try {
      if (!query) return [];
      return await bibliographicMetadataService.search(query, maxResults || 10);
    } catch (err) {
      console.error('[baglib/metadata-ipc] Failed to search bibliographic metadata:', err);
      return [];
    }
  });

  ipcMain.handle('library:get-bibliographic-details', async (_, workId: string) => {
    try {
      if (!workId) return null;
      return await bibliographicMetadataService.getWorkDetails(workId);
    } catch (err) {
      console.error('[baglib/metadata-ipc] Failed to get bibliographic details:', err);
      return null;
    }
  });

  ipcMain.handle('library:search-bibliographic-isbn', async (_, isbn: string) => {
    try {
      if (!isbn) return null;
      const cleanIsbn = isbn.replace(/[-\s]/g, '');
      return await bibliographicMetadataService.searchByIsbn(cleanIsbn);
    } catch (err) {
      console.error('[baglib/metadata-ipc] Failed to search bibliographic metadata by ISBN:', err);
      return null;
    }
  });

  /**
   * Universal Metadata Lookup Handler (ISBN with Title/Author Fallback)
   */
  ipcMain.handle('library:lookup-metadata', async (_, params: { isbn?: string; title?: string; author?: string; query?: string; filePath?: string; filename?: string }) => {
    try {
      if (!params) return { success: false, error: 'NO_PARAMS' };

      // Use progressive discovery service
      const discovery = await bibliographicMetadataService.discoverBook({
        isbn: params.isbn,
        title: params.title,
        author: params.author,
        filePath: params.filePath,
        filename: params.filename || params.query,
      });

      const match = discovery.matchedWork || discovery.candidates[0] || null;

      if (match && discovery.coverUrl) {
        if (!match.editions || match.editions.length === 0) {
          match.editions = [
            {
              editionId: `ed-${match.workId}`,
              coverUrl: discovery.coverUrl,
              isbn: discovery.isbn,
              isbn10: discovery.isbn10,
              isbn13: discovery.isbn13,
              publisher: discovery.publisher,
              sources: [],
            },
          ];
        } else if (!match.editions[0].coverUrl) {
          match.editions[0].coverUrl = discovery.coverUrl;
        }
      }

      if (!match) {
        return {
          success: true,
          discovery,
          match: null,
          candidates: [],
          coverUrl: discovery.coverUrl,
          error: 'NO_RESULTS',
          details: 'No matching book found in bibliographic catalogs',
        };
      }

      return {
        success: true,
        discovery,
        match,
        candidates: discovery.candidates && discovery.candidates.length > 0 ? discovery.candidates : [match],
        coverUrl: discovery.coverUrl,
        source: discovery.provenance.providerUsed || (discovery.provenance.embeddedFound ? 'embedded' : 'local'),
      };
    } catch (err: any) {
      console.error('[baglib/metadata-ipc] lookup-metadata error:', err);
      return { success: false, error: 'NETWORK_ERROR', details: err?.message || 'Network request failed' };
    }
  });

  /**
   * Parse book filename into candidate fields with confidence scoring
   */
  ipcMain.handle('library:parse-filename', async (_, filename: string) => {
    try {
      if (!filename || typeof filename !== 'string') return null;
      return FilenameParser.parse(filename);
    } catch (err) {
      console.error('[baglib/metadata-ipc] parse-filename error:', err);
      return null;
    }
  });

  /**
   * Dedicated Cover Discovery & Validation
   */
  ipcMain.handle('library:resolve-cover', async (_, options: any) => {
    try {
      if (!options) return { coverUrl: undefined, source: 'none', verified: false };
      return await coverResolverService.resolveCover(options);
    } catch (err) {
      console.error('[baglib/metadata-ipc] resolve-cover error:', err);
      return { coverUrl: undefined, source: 'none', verified: false };
    }
  });

  /**
   * Full progressive book metadata discovery pipeline
   */
  ipcMain.handle('library:discover-metadata', async (_, params: { filePath?: string; filename?: string; title?: string; author?: string; isbn?: string }) => {
    try {
      if (!params) return null;
      return await bibliographicMetadataService.discoverBook(params);
    } catch (err) {
      console.error('[baglib/metadata-ipc] discover-metadata error:', err);
      return null;
    }
  });

  /**
   * Extract image from a local PDF to make it the book's cover image.
   * Supports pageIndex (1-based) to cycle between pages and candidate images.
   */
  ipcMain.handle('library:extract-pdf-cover', async (_, filePath: string, pageIndex?: number) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'NO_FILE_PATH' };
      }
      const res = await bibliographicMetadataService.extractPdfCoverDetails(filePath, pageIndex || 1);
      if (res && res.coverUrl) {
        return {
          success: true,
          coverUrl: res.coverUrl,
          currentPage: res.currentPage,
          totalPages: res.totalPages,
          pageNumber: res.pageNumber,
        };
      }
      return { success: false, error: 'NO_IMAGE_FOUND' };
    } catch (err: any) {
      console.error('[baglib/metadata-ipc] extract-pdf-cover error:', err);
      return { success: false, error: err?.message || 'EXTRACTION_FAILED' };
    }
  });


  /**
   * Safe download through content shield
   */
  ipcMain.handle('library:safe-download', async (_, url: string, filename: string) => {
    try {
      if (!url) throw new Error('Missing download URL');
      const downloadsPath = app.getPath('downloads');
      const shield = ContentShieldService.getInstance();
      const savedPath = await shield.downloadFileDirectly(url, downloadsPath, filename);
      return { success: true, path: savedPath, filename };
    } catch (err: any) {
      console.error('[baglib/metadata-ipc] Safe download failed:', err);
      return { success: false, error: err?.message || 'Download failed' };
    }
  });

  /**
   * Reveal downloaded file in OS file explorer / finder
   */
  ipcMain.handle('library:show-item-in-folder', async (_, filePath: string) => {
    try {
      if (!filePath) return false;
      shell.showItemInFolder(filePath);
      return true;
    } catch (err) {
      console.error('[baglib/metadata-ipc] showItemInFolder error:', err);
      return false;
    }
  });

  /**
   * Open file with default OS application
   */
  ipcMain.handle('library:open-file', async (_, filePath: string) => {
    try {
      if (!filePath) return false;
      await shell.openPath(filePath);
      return true;
    } catch (err) {
      console.error('[baglib/metadata-ipc] openFile error:', err);
      return false;
    }
  });
}
