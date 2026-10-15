/**
 * Baglib — Unified Search Orchestrator Service
 *
 * Coordinates concurrent multi-provider book discovery across local SQLite database
 * and online services (Open Library, Google Books, Internet Archive, Project Gutenberg).
 * Provides timeout isolation, cancellation support, progressive streaming,
 * cross-provider deduplication, and local library duplicate detection.
 */

import {
  ISearchProvider,
  SearchProviderId,
  SearchProviderInfo,
  UnifiedSearchQuery,
  UnifiedSearchResult,
  UnifiedSearchAggregateResult,
  SearchProgressUpdate,
  ProviderSearchStatus,
} from '../../../shared/types/search';
import { BookItem } from '../../../shared/types/work';
import { DuplicateDetector } from './duplicate-detector';
import { normalizeSearchString } from '../../../shared/utils/text-normalizer';

export interface SearchOrchestratorOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (update: SearchProgressUpdate) => void;
}

export class SearchOrchestratorService {
  private providers = new Map<SearchProviderId, ISearchProvider>();

  constructor(private getLocalBooksSupplier: () => BookItem[] | Promise<BookItem[]>) {}

  /**
   * Registers a search provider.
   */
  public registerProvider(provider: ISearchProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Unregisters a search provider by ID.
   */
  public unregisterProvider(id: SearchProviderId): void {
    this.providers.delete(id);
  }

  /**
   * Retrieves provider metadata and enabled status.
   */
  public getProviders(): SearchProviderInfo[] {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      nameAr: p.nameAr,
      description: p.description,
      descriptionAr: p.descriptionAr,
      icon: p.icon,
      enabled: p.isEnabled(),
      supportsDownload: p.supportsDownload,
      supportsFullText: p.supportsFullText,
    }));
  }

  /**
   * Enables or disables a specific search provider.
   */
  public setProviderEnabled(id: SearchProviderId, enabled: boolean): void {
    const provider = this.providers.get(id);
    if (provider) {
      provider.setEnabled(enabled);
    }
  }

  /**
   * Executes unified book search across all eligible providers concurrently.
   */
  public async search(
    query: UnifiedSearchQuery,
    options?: SearchOrchestratorOptions
  ): Promise<UnifiedSearchAggregateResult> {
    const searchId = `search-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timeoutMs = options?.timeoutMs ?? 9000;
    const parentSignal = options?.signal;

    // Filter providers according to scope, explicitly requested providers, and enabled state
    const eligibleProviders = Array.from(this.providers.values()).filter((provider) => {
      if (!provider.isEnabled()) return false;

      // Filter by explicit providers list if provided
      if (query.providers && query.providers.length > 0) {
        if (!query.providers.includes(provider.id)) return false;
      }

      // Filter by scope
      if (query.scope === 'local') {
        return provider.id === 'local';
      }
      if (query.scope === 'online') {
        return provider.id !== 'local';
      }

      return true; // 'all' or undefined
    });

    const providerStatuses: Record<SearchProviderId, {
      status: ProviderSearchStatus;
      count: number;
      elapsedMs: number;
      error?: string;
    }> = {} as any;

    // Initialize statuses
    for (const p of eligibleProviders) {
      providerStatuses[p.id] = {
        status: 'pending',
        count: 0,
        elapsedMs: 0,
      };
    }

    if (eligibleProviders.length === 0 || parentSignal?.aborted) {
      return {
        searchId,
        query,
        results: [],
        totalResults: 0,
        providerStatuses,
        hasLocalDuplicates: false,
      };
    }

    const providerPromises = eligibleProviders.map(async (provider) => {
      const startTime = Date.now();
      providerStatuses[provider.id].status = 'running';

      if (options?.onProgress) {
        options.onProgress({
          searchId,
          providerId: provider.id,
          status: 'running',
          resultCount: 0,
        });
      }

      // Create isolated timeout abort controller
      const timeoutController = new AbortController();
      let timeoutHandle: NodeJS.Timeout | undefined;

      const abortListener = () => timeoutController.abort();
      if (parentSignal) {
        parentSignal.addEventListener('abort', abortListener, { once: true });
      }

      timeoutHandle = setTimeout(() => {
        timeoutController.abort();
      }, timeoutMs);

      try {
        const rawResults = await provider.search(query, timeoutController.signal);
        const elapsedMs = Date.now() - startTime;

        providerStatuses[provider.id] = {
          status: 'completed',
          count: rawResults.length,
          elapsedMs,
        };

        if (options?.onProgress) {
          options.onProgress({
            searchId,
            providerId: provider.id,
            status: 'completed',
            resultCount: rawResults.length,
            results: rawResults,
            elapsedMs,
          });
        }

        return rawResults;
      } catch (err: any) {
        const elapsedMs = Date.now() - startTime;
        const isCancelled = timeoutController.signal.aborted || parentSignal?.aborted;
        const status: ProviderSearchStatus = isCancelled ? 'cancelled' : 'failed';
        const errorMsg = isCancelled ? 'Search timed out or was cancelled' : err?.message || String(err);

        providerStatuses[provider.id] = {
          status,
          count: 0,
          elapsedMs,
          error: errorMsg,
        };

        if (options?.onProgress) {
          options.onProgress({
            searchId,
            providerId: provider.id,
            status,
            resultCount: 0,
            error: errorMsg,
            elapsedMs,
          });
        }

        return [] as UnifiedSearchResult[];
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (parentSignal) parentSignal.removeEventListener('abort', abortListener);
      }
    });

    const settleResults = await Promise.allSettled(providerPromises);

    // Flatten all collected raw results
    const rawAllResults: UnifiedSearchResult[] = [];
    for (const res of settleResults) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        rawAllResults.push(...res.value);
      }
    }

    // Load local books for duplicate detection and cross-referencing
    let localBooks: BookItem[] = [];
    try {
      localBooks = await Promise.resolve(this.getLocalBooksSupplier());
    } catch (err) {
      console.warn('[baglib:search-orchestrator] Failed to fetch local books for duplicate checking:', err);
    }

    // Step 1: Duplicate Detection against local library
    let hasLocalDuplicates = false;
    for (const result of rawAllResults) {
      if (result.providerId === 'local') {
        result.inLibrary = true;
        result.localWorkId = result.id.replace('local:', '');
        hasLocalDuplicates = true;
      } else {
        const dupMatch = DuplicateDetector.findMatch(result, localBooks);
        if (dupMatch.inLibrary) {
          result.inLibrary = true;
          result.localWorkId = dupMatch.localWorkId;
          result.matchedEditionId = dupMatch.matchedEditionId;
          hasLocalDuplicates = true;
        }
      }
    }

    // Step 2: Cross-provider deduplication & enrichment
    const consolidatedResults = this.deduplicateAndMergeResults(rawAllResults);

    // Step 3: Sort results (Local first, then downloadable items, then by score)
    consolidatedResults.sort((a, b) => {
      // Local library results first
      if (a.providerId === 'local' && b.providerId !== 'local') return -1;
      if (b.providerId === 'local' && a.providerId !== 'local') return 1;

      // Available downloads next
      const aHasDl = Boolean(a.downloadUrl);
      const bHasDl = Boolean(b.downloadUrl);
      if (aHasDl && !bHasDl) return -1;
      if (!aHasDl && bHasDl) return 1;

      return (b.score || 0) - (a.score || 0);
    });

    return {
      searchId,
      query,
      results: consolidatedResults,
      totalResults: consolidatedResults.length,
      providerStatuses,
      hasLocalDuplicates,
    };
  }

  /**
   * Merges duplicate online search results coming from different providers for the exact same work.
   */
  private deduplicateAndMergeResults(results: UnifiedSearchResult[]): UnifiedSearchResult[] {
    const merged: UnifiedSearchResult[] = [];
    const seenMap = new Map<string, UnifiedSearchResult>();

    for (const item of results) {
      // Local items are preserved as unique distinct catalog items
      if (item.providerId === 'local') {
        merged.push(item);
        continue;
      }

      // Check key by normalized ISBN
      const normIsbn = DuplicateDetector.normalizeIsbn(item.isbn || item.isbn13 || item.isbn10);
      const normTitleAuthor = `${normalizeSearchString(item.title)}|${normalizeSearchString(item.author)}`;

      const dedupeKey = normIsbn ? `isbn:${normIsbn}` : `title:${normTitleAuthor}`;
      const existing = seenMap.get(dedupeKey);

      if (!existing) {
        seenMap.set(dedupeKey, item);
        merged.push(item);
      } else {
        // Merge enriched fields into existing item
        if (!existing.coverUrl && item.coverUrl) {
          existing.coverUrl = item.coverUrl;
          existing.thumbnailUrl = item.thumbnailUrl;
        }
        if (!existing.downloadUrl && item.downloadUrl) {
          existing.downloadUrl = item.downloadUrl;
        }
        if (item.availableFormats && item.availableFormats.length > 0) {
          const combined = Array.from(new Set([...(existing.availableFormats || []), ...item.availableFormats]));
          existing.availableFormats = combined;
        }
        if (!existing.description && item.description) {
          existing.description = item.description;
        }
        if (!existing.publishYear && item.publishYear) {
          existing.publishYear = item.publishYear;
        }
        if (item.inLibrary) {
          existing.inLibrary = true;
          existing.localWorkId = item.localWorkId;
        }
      }
    }

    return merged;
  }
}
