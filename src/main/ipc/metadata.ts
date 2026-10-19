/**
 * Baglib — Metadata & Online Provider IPC Handlers
 */

import { ipcMain, app, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { libgenProvider } from '../services/metadata/libgen.provider';
import { libgenDownloadService } from '../services/digital/libgen-download.service';
import { annasProvider } from '../services/metadata/annas.provider';
import { ContentShieldService } from '../services/shield/content-shield.service';
import { bibliographicMetadataService } from '../services/metadata/bibliographic-metadata.service';
import { FilenameParser } from '../services/metadata/filename-parser';
import { coverResolverService } from '../services/metadata/cover-resolver.service';
import { quotaTracker } from '../services/metadata/quotaTracker';
import { providerConfigService } from '../services/metadata/provider-config.service';

function resolveCandidatePath(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  if (fs.existsSync(filePath)) return filePath;
  const inImports = path.join(app.getPath('userData'), 'imports', path.basename(filePath));
  if (fs.existsSync(inImports)) return inImports;
  const inCwd = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(inCwd)) return inCwd;
  return filePath;
}

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
   * Path A: Direct Hash Lookup on LibGen
   */
  ipcMain.handle('library:lookup-libgen-hash', async (_, hash: string, hashType?: 'md5' | 'sha1' | 'sha256') => {
    try {
      if (!hash || typeof hash !== 'string') return [];
      return await libgenProvider.lookupByHash(hash, hashType || 'md5');
    } catch (err) {
      console.error('[baglib/metadata-ipc] Failed to lookup LibGen by hash:', err);
      return [];
    }
  });

  /**
   * Path B: Direct Identifier Lookup on LibGen (ISBN, DOI)
   */
  ipcMain.handle('library:lookup-libgen-identifier', async (_, identifier: string, type?: 'isbn' | 'doi') => {
    try {
      if (!identifier || typeof identifier !== 'string') return [];
      return await libgenProvider.lookupByIdentifier(identifier, type || 'isbn');
    } catch (err) {
      console.error('[baglib/metadata-ipc] Failed to lookup LibGen by identifier:', err);
      return [];
    }
  });

  /**
   * Download a book file from LibGen with progress events and checksum verification
   */
  ipcMain.handle('library:download-libgen', async (event, options: {
    md5: string;
    ipfsCid?: string;
    filename: string;
    expectedFormat?: string;
    expectedFilesize?: number;
  }) => {
    try {
      return await libgenDownloadService.downloadBookFile({
        ...options,
        onProgress: (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('libgen:download-progress', {
              md5: options.md5,
              ...progress,
            });
          }
        },
      });
    } catch (err: any) {
      console.error('[baglib/metadata-ipc] Failed to download from LibGen:', err);
      return { success: false, error: err?.message || 'Download failed' };
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

        if (discovery.description && !match.description) {
          match.description = discovery.description;
        }
        if (discovery.authorBio && !match.authorBio) {
          match.authorBio = discovery.authorBio;
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
        evaluations: discovery.rankedEvaluations || [],
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
   * Phase 1: Strictly offline local metadata extraction from file (EPUB/PDF embedded or filename)
   * Guaranteed not to contact external providers (Google Books, Open Library, Internet Archive).
   */
  ipcMain.handle('library:extract-offline-metadata', async (_, params: { filePath?: string; filename?: string }) => {
    try {
      if (!params) return null;
      const resolvedFilePath = resolveCandidatePath(params.filePath);
      return await bibliographicMetadataService.extractOfflineMetadata({
        ...params,
        filePath: resolvedFilePath,
      });
    } catch (err) {
      console.error('[baglib/metadata-ipc] extract-offline-metadata error:', err);
      return null;
    }
  });

  /**
   * Full progressive book metadata discovery pipeline
   */
  ipcMain.handle('library:discover-metadata', async (_, params: { filePath?: string; filename?: string; title?: string; author?: string; isbn?: string; page?: number; deeper?: boolean; offlineOnly?: boolean }) => {
    try {
      if (!params) return null;
      const resolvedFilePath = resolveCandidatePath(params.filePath);
      return await bibliographicMetadataService.discoverBook({
        ...params,
        filePath: resolvedFilePath,
      });
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
      const resolved = resolveCandidatePath(filePath) || filePath;
      const res = await bibliographicMetadataService.extractPdfCoverDetails(resolved, pageIndex || 1);
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
   * Extract cover image from a local EPUB file using the 5-Tier Cover Extraction Engine.
   */
  ipcMain.handle('library:extract-epub-cover', async (_, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'NO_FILE_PATH' };
      }
      const resolved = resolveCandidatePath(filePath) || filePath;
      const res = await bibliographicMetadataService.extractEpubCoverDetails(resolved);
      if (res && res.coverUrl) {
        return {
          success: true,
          coverUrl: res.coverUrl,
          savedFilePath: res.savedFilePath,
          tierUsed: res.tierUsed,
          byteSize: res.byteSize,
        };
      }
      return { success: false, error: 'NO_IMAGE_FOUND' };
    } catch (err: any) {
      console.error('[baglib/metadata-ipc] extract-epub-cover error:', err);
      return { success: false, error: err?.message || 'EXTRACTION_FAILED' };
    }
  });


  /**
   * Safe download through content shield with LibGen resilient pipeline routing
   */
  ipcMain.handle('library:safe-download', async (_, url: string, filename: string) => {
    try {
      if (!url) throw new Error('Missing download URL');
      const downloadsPath = app.getPath('downloads');

      // If URL is a LibGen download URL or contains an MD5, route through resilient libgenDownloadService
      const md5Match = url.match(/([a-fA-F0-9]{32})/);
      if (md5Match && (url.includes('libgen') || url.includes('booksdl') || url.includes('get.php') || url.includes('ads.php'))) {
        const ext = path.extname(filename).replace('.', '').toLowerCase();
        const res = await libgenDownloadService.downloadBookFile({
          md5: md5Match[1],
          filename,
          expectedFormat: ext,
          targetDirectory: downloadsPath,
        });
        if (res.success && res.filePath) {
          return { success: true, path: res.filePath, filename: res.filename || filename };
        }
      }

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

  /**
   * Quota Tracker Endpoints
   */
  ipcMain.handle('metadata:get-quota-status', async () => {
    try {
      return quotaTracker.getQuotaStatus();
    } catch (err) {
      console.error('[baglib/metadata-ipc] getQuotaStatus error:', err);
      return null;
    }
  });

  ipcMain.handle('metadata:set-quota-count-test', async (_, count: number, date?: string) => {
    try {
      quotaTracker.setCountForTesting(count, date);
      return quotaTracker.getQuotaStatus();
    } catch (err) {
      console.error('[baglib/metadata-ipc] setQuotaCountTest error:', err);
      return null;
    }
  });

  /**
   * Provider Configuration & Priority Endpoints
   */
  ipcMain.handle('metadata:get-provider-config', async () => {
    try {
      return providerConfigService.getProviderConfigs();
    } catch (err) {
      console.error('[baglib/metadata-ipc] getProviderConfig error:', err);
      return [];
    }
  });

  ipcMain.handle('metadata:update-provider-config', async (_, configs: any) => {
    try {
      return providerConfigService.updateProviderConfigs(configs);
    } catch (err) {
      console.error('[baglib/metadata-ipc] updateProviderConfig error:', err);
      return [];
    }
  });
}
