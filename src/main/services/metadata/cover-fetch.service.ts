import { errorMessage } from '../../../shared/errors';
/**
 * Baglib — High-Resolution Cover Fetcher & Local Cache Service (Story 12 / KEY-125)
 *
 * Automatically downloads and caches book cover artwork into the application's persistent
 * `userData/covers` directory, updating local database records for instant offline display.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import { HttpClient, BAGLIB_USER_AGENT } from './http-client';
import { CoverResolverService, coverResolverService as defaultCoverResolver } from './cover-resolver.service';
import { CoverFetchRequest, CoverFetchResult } from '../../../shared/types/enrichment';
import { BookItem } from '../../../shared/types/work';

export class CoverFetchService {
  private httpClient: HttpClient;
  private resolver: CoverResolverService;
  private customCoversDir?: string;
  private updateWorkCoverFn?: (workId: string, coverPath: string) => Promise<boolean> | boolean;

  constructor(options?: {
    coversDir?: string;
    resolver?: CoverResolverService;
    updateWorkCoverFn?: (workId: string, coverPath: string) => Promise<boolean> | boolean;
  }) {
    this.customCoversDir = options?.coversDir;
    this.resolver = options?.resolver || defaultCoverResolver;
    this.updateWorkCoverFn = options?.updateWorkCoverFn;
    this.httpClient = new HttpClient({
      defaultHeaders: {
        'User-Agent': BAGLIB_USER_AGENT,
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      timeoutMs: 12000,
      maxRetries: 2,
    });
  }

  /**
   * Configures the repository callback to update book records in SQLite.
   */
  public setWorkCoverUpdater(fn: (workId: string, coverPath: string) => Promise<boolean> | boolean): void {
    this.updateWorkCoverFn = fn;
  }

  /**
   * Resolves the persistent covers directory path.
   */
  public getCoversDirectory(): string {
    if (this.customCoversDir) {
      if (!fs.existsSync(this.customCoversDir)) {
        fs.mkdirSync(this.customCoversDir, { recursive: true });
      }
      return this.customCoversDir;
    }

    let baseDir: string;
    try {
      baseDir = app && typeof app.getPath === 'function'
        ? app.getPath('userData')
        : path.join(process.cwd(), '.covers_cache');
    } catch {
      baseDir = path.join(process.cwd(), '.covers_cache');
    }

    const coversDir = path.join(baseDir, 'covers');
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir, { recursive: true });
    }
    return coversDir;
  }

  /**
   * Downloads, validates, and persists cover artwork for a book.
   */
  public async fetchAndCacheCover(request: CoverFetchRequest): Promise<CoverFetchResult> {
    try {
      let targetUrl = request.coverUrl?.trim();
      let sourceName = 'direct-url';

      // 1. If no explicit URL, attempt multi-provider resolution via CoverResolverService
      if (!targetUrl) {
        const resolved = await this.resolver.resolveCover({
          isbn: request.isbn,
          title: request.title,
          author: request.author,
        });

        if (resolved.coverUrl) {
          targetUrl = resolved.coverUrl;
          sourceName = resolved.source;
        }
      }

      if (!targetUrl) {
        return {
          success: false,
          coverUrl: '',
          source: 'none',
          error: 'No cover art found across configured providers',
        };
      }

      const coversDir = this.getCoversDirectory();
      const sanitizedId = (request.workId || 'book')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 32);

      // 2. Handle embedded Data URLs directly without network fetch
      if (targetUrl.startsWith('data:image/')) {
        const match = targetUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (match) {
          const ext = match[1].replace('jpeg', 'jpg');
          const buffer = Buffer.from(match[2], 'base64');
          const minSize = request.minSizeBytes ?? 100;
          if (buffer.length < minSize) {
            return {
              success: false,
              coverUrl: '',
              source: sourceName,
              error: 'Embedded image payload is too small or corrupt',
            };
          }
          const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 8);
          const fileName = `${sanitizedId}-${hash}.${ext}`;
          const localPath = path.join(coversDir, fileName);
          fs.writeFileSync(localPath, buffer);

          await this.notifyDatabase(request.workId, localPath);

          return {
            success: true,
            coverUrl: localPath,
            localPath,
            source: 'embedded',
            resolution: `${buffer.length} bytes`,
          };
        }
      }

      // 3. Download from remote HTTP/HTTPS URL
      const response = await this.httpClient.fetch(targetUrl);
      if (!response.ok) {
        return {
          success: false,
          coverUrl: targetUrl,
          source: sourceName,
          error: `HTTP ${response.status} ${response.statusText}`,
        };
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('image') && !contentType.includes('octet-stream')) {
        return {
          success: false,
          coverUrl: targetUrl,
          source: sourceName,
          error: `Invalid content-type: ${contentType}`,
        };
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Verify minimum size to avoid 1x1 transparent tracking pixels and generic 43-byte spacers
      const minHttpSize = request.minSizeBytes ?? 250;
      if (buffer.length < minHttpSize) {
        return {
          success: false,
          coverUrl: targetUrl,
          source: sourceName,
          error: `Image content is empty or corrupt (${buffer.length} bytes)`,
        };
      }

      // Determine appropriate file extension
      let ext = 'jpg';
      if (contentType.includes('png')) ext = 'png';
      else if (contentType.includes('webp')) ext = 'webp';
      else if (contentType.includes('gif')) ext = 'gif';
      else if (targetUrl.toLowerCase().endsWith('.png')) ext = 'png';
      else if (targetUrl.toLowerCase().endsWith('.webp')) ext = 'webp';

      const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 8);
      const fileName = `${sanitizedId}-${hash}.${ext}`;
      const localPath = path.join(coversDir, fileName);

      fs.writeFileSync(localPath, buffer);

      // 4. Update SQLite database if workId is provided
      await this.notifyDatabase(request.workId, localPath);

      return {
        success: true,
        coverUrl: localPath,
        localPath,
        source: sourceName,
        resolution: `${buffer.length} bytes`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        coverUrl: request.coverUrl || '',
        source: 'error',
        error: errorMessage(err) || String(err),
      };
    }
  }

  private async notifyDatabase(workId: string | undefined, localPath: string): Promise<void> {
    if (workId && this.updateWorkCoverFn) {
      try {
        await this.updateWorkCoverFn(workId, localPath);
      } catch (dbErr) {
        console.warn(`[baglib:cover-fetch] Warning: Failed to persist cover in DB for ${workId}:`, dbErr);
      }
    }
  }
}

export const coverFetchService = new CoverFetchService();
