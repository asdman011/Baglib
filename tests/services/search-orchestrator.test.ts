import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SearchOrchestratorService } from '../../src/main/services/search/search-orchestrator.service';
import { DuplicateDetector } from '../../src/main/services/search/duplicate-detector';
import {
  ISearchProvider,
  SearchProviderId,
  UnifiedSearchQuery,
  UnifiedSearchResult,
  SearchProgressUpdate,
} from '../../src/shared/types/search';
import { BookItem } from '../../src/shared/types/work';

// Mock Provider Factory
class MockSearchProvider implements ISearchProvider {
  private enabled = true;

  constructor(
    public readonly id: SearchProviderId,
    public readonly name: string,
    public readonly nameAr: string,
    public readonly description: string,
    public readonly descriptionAr: string,
    public readonly icon: string,
    public readonly supportsDownload: boolean,
    public readonly supportsFullText: boolean,
    private mockResults: UnifiedSearchResult[] = [],
    private delayMs = 10,
    private shouldFail = false
  ) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async search(query: UnifiedSearchQuery, signal?: AbortSignal): Promise<UnifiedSearchResult[]> {
    if (signal?.aborted) return [];
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (signal?.aborted) return [];
    if (this.shouldFail) {
      throw new Error(`Provider ${this.id} failed`);
    }
    return this.mockResults;
  }
}

describe('SearchOrchestratorService Unit & Integration Tests', () => {
  const sampleLocalBooks: BookItem[] = [
    {
      id: 'work-local-1',
      title: 'مقدمة ابن خلدون',
      author: 'ابن خلدون',
      isbn: '9789771423126',
      publisher: 'دار الفكر',
      publicationYear: 1377,
      language: 'العربية',
      categories: ['تاريخ'],
      tags: ['ابن خلدون'],
      lendingHistory: [],
      bookType: 'physical',
    },
    {
      id: 'work-local-2',
      title: 'Clean Architecture',
      author: 'Robert C. Martin',
      isbn: '9780134494166',
      publisher: 'Prentice Hall',
      publicationYear: 2017,
      language: 'English',
      categories: ['Software'],
      tags: ['architecture'],
      lendingHistory: [],
      bookType: 'physical',
    },
  ];

  let orchestrator: SearchOrchestratorService;

  beforeEach(() => {
    orchestrator = new SearchOrchestratorService(() => sampleLocalBooks);
  });

  describe('Provider Management & Registration', () => {
    it('registers and retrieves providers correctly', () => {
      const p1 = new MockSearchProvider(
        'local',
        'Local',
        'محلي',
        'Desc',
        'وصف',
        'library',
        false,
        true
      );
      const p2 = new MockSearchProvider(
        'openlibrary',
        'Open Library',
        'المكتبة المفتوحة',
        'Desc',
        'وصف',
        'globe',
        false,
        false
      );

      orchestrator.registerProvider(p1);
      orchestrator.registerProvider(p2);

      const providers = orchestrator.getProviders();
      assert.equal(providers.length, 2);
      assert.equal(providers[0].id, 'local');
      assert.equal(providers[1].id, 'openlibrary');
      assert.equal(providers[0].enabled, true);
    });

    it('enables and disables providers on demand', () => {
      const p1 = new MockSearchProvider('googlebooks', 'Google', 'جوجل', 'D', 'و', 'book', false, true);
      orchestrator.registerProvider(p1);

      assert.equal(orchestrator.getProviders()[0].enabled, true);
      orchestrator.setProviderEnabled('googlebooks', false);
      assert.equal(orchestrator.getProviders()[0].enabled, false);
      assert.equal(p1.isEnabled(), false);
    });
  });

  describe('Concurrent Execution & Isolation', () => {
    it('executes multiple providers concurrently and aggregates results', async () => {
      const p1 = new MockSearchProvider(
        'local',
        'Local',
        'محلي',
        'D',
        'و',
        'library',
        false,
        true,
        [
          {
            id: 'local:work-local-1',
            providerId: 'local',
            providerName: 'Local',
            title: 'مقدمة ابن خلدون',
            author: 'ابن خلدون',
          },
        ]
      );

      const p2 = new MockSearchProvider(
        'openlibrary',
        'Open Library',
        'المكتبة المفتوحة',
        'D',
        'و',
        'globe',
        false,
        false,
        [
          {
            id: 'openlibrary:OL999W',
            providerId: 'openlibrary',
            providerName: 'Open Library',
            title: 'General History',
            author: 'Historian',
          },
        ]
      );

      orchestrator.registerProvider(p1);
      orchestrator.registerProvider(p2);

      const res = await orchestrator.search({ query: 'History' });
      assert.equal(res.totalResults, 2);
      assert.equal(res.providerStatuses['local'].status, 'completed');
      assert.equal(res.providerStatuses['openlibrary'].status, 'completed');
    });

    it('isolates failures so one failing provider does not break the search', async () => {
      const pSuccess = new MockSearchProvider(
        'local',
        'Local',
        'محلي',
        'D',
        'و',
        'library',
        false,
        true,
        [
          {
            id: 'local:1',
            providerId: 'local',
            providerName: 'Local',
            title: 'Success Book',
            author: 'Author',
          },
        ]
      );

      const pFail = new MockSearchProvider(
        'googlebooks',
        'Google',
        'جوجل',
        'D',
        'و',
        'book',
        false,
        true,
        [],
        10,
        true // throws error
      );

      orchestrator.registerProvider(pSuccess);
      orchestrator.registerProvider(pFail);

      const res = await orchestrator.search({ query: 'Book' });
      assert.equal(res.totalResults, 1);
      assert.equal(res.providerStatuses['local'].status, 'completed');
      assert.equal(res.providerStatuses['googlebooks'].status, 'failed');
      assert.ok(res.providerStatuses['googlebooks'].error);
    });

    it('emits progressive updates via onProgress callback', async () => {
      const p1 = new MockSearchProvider(
        'internetarchive',
        'IA',
        'الأرشيف',
        'D',
        'و',
        'archive',
        true,
        true,
        [
          {
            id: 'ia:1',
            providerId: 'internetarchive',
            providerName: 'IA',
            title: 'Archive Book',
            author: 'Public Author',
          },
        ],
        15
      );

      orchestrator.registerProvider(p1);

      const updates: SearchProgressUpdate[] = [];
      await orchestrator.search(
        { query: 'Archive' },
        {
          onProgress: (up) => updates.push(up),
        }
      );

      assert.ok(updates.length >= 2);
      assert.equal(updates[0].status, 'running');
      assert.equal(updates[updates.length - 1].status, 'completed');
      assert.equal(updates[updates.length - 1].resultCount, 1);
    });
  });

  describe('Local Duplicate Detection & Cross-Provider Deduplication', () => {
    it('detects duplicate book by matching ISBN and flags inLibrary', async () => {
      const pOnline = new MockSearchProvider(
        'openlibrary',
        'Open Library',
        'المكتبة المفتوحة',
        'D',
        'و',
        'globe',
        false,
        false,
        [
          {
            id: 'openlibrary:OL111W',
            providerId: 'openlibrary',
            providerName: 'Open Library',
            title: 'Clean Architecture in Practice',
            author: 'Robert C. Martin',
            isbn: '9780134494166', // Same ISBN as sampleLocalBooks[1]
          },
        ]
      );

      orchestrator.registerProvider(pOnline);

      const res = await orchestrator.search({ query: 'Clean Architecture' });
      assert.equal(res.totalResults, 1);
      const item = res.results[0];
      assert.equal(item.inLibrary, true);
      assert.equal(item.localWorkId, 'work-local-2');
      assert.equal(res.hasLocalDuplicates, true);
    });

    it('detects duplicate book by fuzzy title and author similarity', async () => {
      const pOnline = new MockSearchProvider(
        'googlebooks',
        'Google',
        'جوجل',
        'D',
        'و',
        'book',
        false,
        true,
        [
          {
            id: 'googlebooks:vol-99',
            providerId: 'googlebooks',
            providerName: 'Google Books',
            title: 'مقدمة ابن خلدون (طبعة محققة)',
            author: 'عبد الرحمن بن خلدون',
          },
        ]
      );

      orchestrator.registerProvider(pOnline);

      const res = await orchestrator.search({ query: 'ابن خلدون' });
      assert.equal(res.totalResults, 1);
      const item = res.results[0];
      assert.equal(item.inLibrary, true);
      assert.equal(item.localWorkId, 'work-local-1');
      assert.equal(res.hasLocalDuplicates, true);
    });

    it('merges identical online search results from multiple providers', async () => {
      const pOpenLibrary = new MockSearchProvider(
        'openlibrary',
        'Open Library',
        'المكتبة المفتوحة',
        'D',
        'و',
        'globe',
        false,
        false,
        [
          {
            id: 'openlibrary:item1',
            providerId: 'openlibrary',
            providerName: 'Open Library',
            title: 'The Great Gatsby',
            author: 'F. Scott Fitzgerald',
            isbn: '9780743273565',
            coverUrl: 'https://covers.openlibrary.org/b/id/123-L.jpg',
          },
        ]
      );

      const pGutenberg = new MockSearchProvider(
        'gutenberg',
        'Gutenberg',
        'غوتنبرغ',
        'D',
        'و',
        'feather',
        true,
        true,
        [
          {
            id: 'gutenberg:64317',
            providerId: 'gutenberg',
            providerName: 'Gutenberg',
            title: 'The Great Gatsby',
            author: 'F. Scott Fitzgerald',
            isbn: '9780743273565',
            downloadUrl: 'https://www.gutenberg.org/ebooks/64317.epub.images',
            availableFormats: ['EPUB'],
          },
        ]
      );

      orchestrator.registerProvider(pOpenLibrary);
      orchestrator.registerProvider(pGutenberg);

      const res = await orchestrator.search({ query: 'Great Gatsby' });
      // Should be deduplicated to 1 merged result
      assert.equal(res.totalResults, 1);
      const merged = res.results[0];
      assert.equal(merged.title, 'The Great Gatsby');
      assert.equal(merged.coverUrl, 'https://covers.openlibrary.org/b/id/123-L.jpg');
      assert.equal(merged.downloadUrl, 'https://www.gutenberg.org/ebooks/64317.epub.images');
      assert.deepEqual(merged.availableFormats, ['EPUB']);
    });
  });

  describe('Scope Filtering', () => {
    it('restricts search strictly to local provider when scope is local', async () => {
      const pLocal = new MockSearchProvider('local', 'Local', 'محلي', 'D', 'و', 'library', false, true, [
        { id: 'local:1', providerId: 'local', providerName: 'Local', title: 'Local 1', author: 'A' },
      ]);
      const pOnline = new MockSearchProvider('openlibrary', 'OL', 'OL', 'D', 'و', 'globe', false, false, [
        { id: 'ol:1', providerId: 'openlibrary', providerName: 'OL', title: 'Online 1', author: 'B' },
      ]);

      orchestrator.registerProvider(pLocal);
      orchestrator.registerProvider(pOnline);

      const res = await orchestrator.search({ query: 'Book', scope: 'local' });
      assert.equal(res.totalResults, 1);
      assert.equal(res.results[0].providerId, 'local');
      assert.equal(res.providerStatuses['openlibrary'], undefined);
    });

    it('restricts search strictly to online providers when scope is online', async () => {
      const pLocal = new MockSearchProvider('local', 'Local', 'محلي', 'D', 'و', 'library', false, true, [
        { id: 'local:1', providerId: 'local', providerName: 'Local', title: 'Local 1', author: 'A' },
      ]);
      const pOnline = new MockSearchProvider('gutenberg', 'Gutenberg', 'غوتنبرغ', 'D', 'و', 'feather', true, true, [
        { id: 'gut:1', providerId: 'gutenberg', providerName: 'Gut', title: 'Online Gut', author: 'B' },
      ]);

      orchestrator.registerProvider(pLocal);
      orchestrator.registerProvider(pOnline);

      const res = await orchestrator.search({ query: 'Book', scope: 'online' });
      assert.equal(res.totalResults, 1);
      assert.equal(res.results[0].providerId, 'gutenberg');
      assert.equal(res.providerStatuses['local'], undefined);
    });
  });
});
