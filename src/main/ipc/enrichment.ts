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
import { ApplyEnrichmentRequest, CoverFetchRequest, EnrichmentCandidateEdition, EnrichmentFieldKey } from '../../shared/types/enrichment';
import { BookItem, DigitalFormat } from '../../shared/types/work';
import { ContentShieldService } from '../services/shield/content-shield.service';
import { HttpClient, BAGLIB_USER_AGENT } from '../services/metadata/http-client';

function isPlaceholderTitle(val?: string): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  return (
    trimmed === 'مادة جديدة في المكتبة' ||
    trimmed === 'New Library Material' ||
    trimmed === 'New Material' ||
    trimmed === ''
  );
}

function isPlaceholderAuthor(val?: string): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  return (
    trimmed === 'مؤلف جديد' ||
    trimmed === 'New Author' ||
    trimmed === 'مؤلف مجهول' ||
    trimmed === 'Unknown Author' ||
    trimmed === 'غير معروف' ||
    trimmed === ''
  );
}

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
    } catch (err: unknown) {
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
      } catch (err: unknown) {
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
    } catch (err: unknown) {
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
    } catch (err: unknown) {
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
      } catch (err: unknown) {
        console.error('[baglib/enrichment-ipc] Failed to attach digital copy:', err);
        throw err;
      }
    }
  );

  /**
   * Bulk download online metadata for multiple selected books respecting provider rate limits
   */
  ipcMain.handle('enrichment:bulk-enrich-works', async (event, input: { workIds: string[] }) => {
    const repo = getRepo();
    const workIds = input?.workIds || [];
    let updatedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < workIds.length; i++) {
      const workId = workIds[i];
      const targetBook: BookItem | undefined = repo.getById
        ? (await repo.getById(workId)) || undefined
        : (await repo.getAllWorks()).find((b) => b.id === workId);

      if (!targetBook) {
        skippedCount++;
        continue;
      }

      event.sender.send('enrichment:bulk-progress', {
        current: i + 1,
        total: workIds.length,
        bookTitle: targetBook.title,
        status: 'searching',
      });

      try {
        const res = await metadataEnrichmentService.findCandidateEditions(targetBook);
        if (res && res.candidates && res.candidates.length > 0) {
          const topCandidate = res.candidates[0];
          const diffs = metadataEnrichmentService.computeFieldDiffs(targetBook, topCandidate);

          // Safe non-destructive update: populate fields that are currently empty or generic
          const approvedFields: EnrichmentFieldKey[] = [];
          for (const [key, diff] of Object.entries(diffs.diffs)) {
            const fieldKey = key as EnrichmentFieldKey;
            if (!diff.hasCurrent && diff.hasIncoming) {
              approvedFields.push(fieldKey);
            } else if (fieldKey === 'title' && (targetBook.title.includes('---') || isPlaceholderTitle(targetBook.title))) {
              approvedFields.push('title');
            } else if (fieldKey === 'author' && (targetBook.author === 'غير معروف' || targetBook.author === 'Unknown Author' || isPlaceholderAuthor(targetBook.author))) {
              approvedFields.push('author');
            }
          }

          if (approvedFields.length > 0) {
            const incomingValues: Partial<BookItem> = {};
            for (const f of approvedFields) {
              const diff = diffs.diffs[f];
              if (diff) {
                Object.assign(incomingValues, { [f]: diff.incomingValue });
              }
            }

            await metadataEnrichmentService.applyEnrichment(
              {
                workId,
                candidateId: topCandidate.id,
                selectedFields: approvedFields,
                incomingValues,
                overwritePopulatedFields: true,
              },
              repo
            );
            updatedCount++;
          } else {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      } catch (err) {
        console.warn(`[baglib/enrichment-ipc] Bulk enrichment error for ${workId}:`, err);
        failedCount++;
      }
    }

    event.sender.send('enrichment:bulk-progress', {
      current: workIds.length,
      total: workIds.length,
      status: 'completed',
    });

    return {
      total: workIds.length,
      updated: updatedCount,
      failed: failedCount,
      skipped: skippedCount,
    };
  });

  /**
   * Reverse-Engineered Readest Refresh Metadata function
   * Fetches latest online candidate editions respecting rate limits,
   * with optional direct auto-apply or diff computation.
   */
  ipcMain.handle('enrichment:refresh-work', async (_, input: { workId: string; autoApply?: boolean }) => {
    const repo = getRepo();
    const targetBook = repo.getById
      ? (await repo.getById(input.workId)) || undefined
      : (await repo.getAllWorks()).find((b) => b.id === input.workId);

    if (!targetBook) {
      throw new Error(`Book "${input.workId}" not found for refresh.`);
    }

    const res = await metadataEnrichmentService.findCandidateEditions(targetBook);
    if (!res || !res.candidates || res.candidates.length === 0) {
      return {
        success: false,
        message: 'No online matches found',
        candidates: [],
      };
    }

    const topCandidate = res.candidates[0];
    const diffs = metadataEnrichmentService.computeFieldDiffs(targetBook, topCandidate);

    if (input.autoApply) {
      const approvedFields = (Object.keys(diffs.diffs) as EnrichmentFieldKey[]).filter((k) => {
        const d = diffs.diffs[k];
        return (
          (!d.hasCurrent && d.hasIncoming) ||
          (k === 'author' && (targetBook.author === 'Unknown Author' || targetBook.author === 'غير معروف' || isPlaceholderAuthor(targetBook.author))) ||
          (k === 'title' && isPlaceholderTitle(targetBook.title))
        );
      });

      const incomingValues: Partial<BookItem> = {};
      for (const f of approvedFields) {
        const diff = diffs.diffs[f];
        if (diff) {
          Object.assign(incomingValues, { [f]: diff.incomingValue });
        }
      }

      const applied = await metadataEnrichmentService.applyEnrichment(
        {
          workId: input.workId,
          candidateId: topCandidate.id,
          selectedFields: approvedFields,
          incomingValues,
          overwritePopulatedFields: true,
        },
        repo
      );

      return {
        success: true,
        updatedBook: applied.updatedBook,
        candidate: topCandidate,
        diffs,
      };
    }

    return {
      success: true,
      candidates: res.candidates,
      topCandidate,
      diffs,
    };
  });
}
