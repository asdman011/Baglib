/**
 * Baglib — Metadata Enrichment & Safe Merge IPC Handlers (Story 12 / KEY-126)
 */

import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { getDatabase } from '../database';
import { SqliteWorkRepository } from '../database/repositories/work.repository';
import { metadataEnrichmentService } from '../services/metadata/metadata-enrichment.service';
import { coverFetchService } from '../services/metadata/cover-fetch.service';
import { ApplyEnrichmentRequest, CoverFetchRequest, EnrichmentCandidateEdition } from '../../shared/types/enrichment';
import { BookItem, DigitalFormat } from '../../shared/types/work';
import { ContentShieldService } from '../services/shield/content-shield.service';
import { HttpClient, BAGLIB_USER_AGENT } from '../services/metadata/http-client';

export function setupEnrichmentIPC(): void {
  const getRepo = () => new SqliteWorkRepository(getDatabase());

  // Configure cover fetcher updater callback
  coverFetchService.setWorkCoverUpdater(async (workId, coverPath) => {
    try {
      const repo = getRepo();
      const existing = repo.getById
        ? await repo.getById(workId)
        : (await repo.getAllWorks()).find((b) => b.id === workId);
      if (existing) {
        await repo.updateBook({
          ...existing,
          coverImage: coverPath,
        });
        return true;
      }
    } catch (e) {
      console.warn(`[baglib/enrichment-ipc] Could not update cover for ${workId}:`, e);
    }
    return false;
  });

  /**
   * Search online providers for candidate editions matching an existing local book.
   */
  ipcMain.handle('enrichment:find-online-editions', async (_, input: { workId?: string; book?: BookItem }) => {
    try {
      const repo = getRepo();
      let targetBook = input.book;

      if (!targetBook && input.workId) {
        targetBook = repo.getById
          ? (await repo.getById(input.workId)) || undefined
          : (await repo.getAllWorks()).find((b) => b.id === input.workId);
      }

      if (!targetBook) {
        throw new Error(`Book "${input.workId}" not found for online enrichment.`);
      }

      return await metadataEnrichmentService.findCandidateEditions(targetBook);
    } catch (err: any) {
      console.error('[baglib/enrichment-ipc] Failed to find online editions:', err);
      throw err;
    }
  });

  /**
   * Calculate non-destructive field diffs between a local book and an online candidate.
   */
  ipcMain.handle(
    'enrichment:compute-diffs',
    async (_, input: { workId?: string; book?: BookItem; candidate: EnrichmentCandidateEdition }) => {
      try {
        const repo = getRepo();
        let targetBook = input.book;

        if (!targetBook && input.workId) {
          targetBook = repo.getById
            ? (await repo.getById(input.workId)) || undefined
            : (await repo.getAllWorks()).find((b) => b.id === input.workId);
        }

        if (!targetBook) {
          throw new Error(`Target book not found for computing diffs.`);
        }

        return metadataEnrichmentService.computeFieldDiffs(targetBook, input.candidate);
      } catch (err: any) {
        console.error('[baglib/enrichment-ipc] Failed to compute diffs:', err);
        throw err;
      }
    }
  );

  /**
   * Atomically apply selected enrichment fields to an existing book.
   */
  ipcMain.handle('enrichment:apply-merge', async (_, request: ApplyEnrichmentRequest) => {
    try {
      const repo = getRepo();
      return await metadataEnrichmentService.applyEnrichment(request, repo);
    } catch (err: any) {
      console.error('[baglib/enrichment-ipc] Failed to apply enrichment:', err);
      throw err;
    }
  });

  /**
   * Fetch, validate, and locally cache high-resolution cover artwork.
   */
  ipcMain.handle('enrichment:fetch-and-cache-cover', async (_, request: CoverFetchRequest) => {
    try {
      return await coverFetchService.fetchAndCacheCover(request);
    } catch (err: any) {
      console.error('[baglib/enrichment-ipc] Failed to fetch and cache cover:', err);
      throw err;
    }
  });

  /**
   * Download and attach a legal digital copy (EPUB/PDF) to an existing book.
   */
  ipcMain.handle(
    'enrichment:attach-digital-copy',
    async (_, input: { workId: string; downloadUrl: string; format: DigitalFormat; title?: string }) => {
      try {
        const repo = getRepo();
        const existing = repo.getById
          ? await repo.getById(input.workId)
          : (await repo.getAllWorks()).find((b) => b.id === input.workId);

        if (!existing) {
          throw new Error(`Book with ID "${input.workId}" not found.`);
        }

        let userDataPath = process.cwd();
        try {
          if (app && typeof app.getPath === 'function') {
            userDataPath = app.getPath('userData');
          }
        } catch {
          userDataPath = process.cwd();
        }

        const storageDir = path.join(userDataPath, 'managed_books');
        if (!fs.existsSync(storageDir)) {
          fs.mkdirSync(storageDir, { recursive: true });
        }

        const cleanTitle = (input.title || existing.title || 'book')
          .replace(/[^a-zA-Z0-9_\u0600-\u06FF\s-]/g, '')
          .slice(0, 50)
          .trim();

        const ext = input.format.toLowerCase();
        const fileName = `${cleanTitle}_${existing.id.slice(0, 8)}.${ext}`;

        // Verify URL safety and safely download via ContentShield
        const shield = ContentShieldService.getInstance();
        const targetPath = await shield.downloadFileDirectly(
          input.downloadUrl,
          storageDir,
          fileName
        );

        // Update book with digital attributes
        await repo.updateBook({
          ...existing,
          filePath: targetPath,
          digitalFormat: input.format,
          bookType: existing.bookType === 'physical' ? 'hybrid' : 'digital',
        });

        const refreshed = repo.getById
          ? (await repo.getById(input.workId)) || existing
          : (await repo.getAllWorks()).find((b) => b.id === input.workId) || existing;

        return {
          success: true,
          workId: input.workId,
          filePath: targetPath,
          updatedBook: refreshed,
        };
      } catch (err: any) {
        console.error('[baglib/enrichment-ipc] Failed to attach digital copy:', err);
        throw err;
      }
    }
  );
}
