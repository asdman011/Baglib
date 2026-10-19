import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BibliographicMetadataService } from '../../../src/main/services/metadata/bibliographic-metadata.service';
import { MetadataProvider, SearchQuery } from '../../../src/main/services/metadata/providers/provider.interface';
import { BibliographicWork } from '../../../src/shared/types/bibliographic';

describe('BibliographicMetadataService (Waterfall Aggregator - Task 5.1, 5.2, 5.5)', () => {
  const dummyWork = (id: string, title: string, providerName: string): BibliographicWork => ({
    workId: id,
    title,
    authors: ['Test Author'],
    editions: [
      {
        editionId: `ed-${id}`,
        title,
        sources: [
          {
            provider: providerName,
            providerId: id,
            url: `https://example.com/${id}`
          }
        ]
      }
    ]
  });

  describe('Waterfall Search Fallback', () => {
    it('returns primary provider results when primary succeeds', async () => {
      let secondaryCalled = false;

      const mockPrimary: MetadataProvider = {
        name: 'PrimaryProvider',
        search: async () => [dummyWork('w1', 'Primary Title', 'PrimaryProvider')],
        getWorkDetails: async () => null,
        searchByIsbn: async () => null
      };

      const mockSecondary: MetadataProvider = {
        name: 'SecondaryProvider',
        search: async () => {
          secondaryCalled = true;
          return [dummyWork('w2', 'Secondary Title', 'SecondaryProvider')];
        },
        getWorkDetails: async () => null,
        searchByIsbn: async () => null
      };

      const service = new BibliographicMetadataService([mockPrimary, mockSecondary]);
      const results = await service.search('Test Query');

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Primary Title');
      assert.strictEqual(secondaryCalled, false, 'Secondary provider should not be called when primary succeeds');
    });

    it('falls back to secondary provider when primary returns empty array', async () => {
      const mockPrimary: MetadataProvider = {
        name: 'PrimaryProvider',
        search: async () => [], // empty results
        getWorkDetails: async () => null,
        searchByIsbn: async () => null
      };

      const mockSecondary: MetadataProvider = {
        name: 'SecondaryProvider',
        search: async () => [dummyWork('w2', 'Fallback Title', 'SecondaryProvider')],
        getWorkDetails: async () => null,
        searchByIsbn: async () => null
      };

      const service = new BibliographicMetadataService([mockPrimary, mockSecondary]);
      const results = await service.search('Test Query');

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Fallback Title');
    });

    it('falls back to secondary provider when primary throws an error', async () => {
      const mockPrimary: MetadataProvider = {
        name: 'PrimaryProvider',
        search: async () => {
          throw new Error('Primary network failure (HTTP 503)');
        },
        getWorkDetails: async () => null,
        searchByIsbn: async () => null
      };

      const mockSecondary: MetadataProvider = {
        name: 'SecondaryProvider',
        search: async () => [dummyWork('w2', 'Secondary Resilient Title', 'SecondaryProvider')],
        getWorkDetails: async () => null,
        searchByIsbn: async () => null
      };

      const service = new BibliographicMetadataService([mockPrimary, mockSecondary]);
      const results = await service.search('Test Query');

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Secondary Resilient Title');
    });

    it('returns empty array when all providers fail or return empty', async () => {
      const mockPrimary: MetadataProvider = {
        name: 'PrimaryProvider',
        search: async () => {
          throw new Error('Timeout');
        },
        getWorkDetails: async () => null,
        searchByIsbn: async () => null
      };

      const mockSecondary: MetadataProvider = {
        name: 'SecondaryProvider',
        search: async () => [],
        getWorkDetails: async () => null,
        searchByIsbn: async () => null
      };

      const service = new BibliographicMetadataService([mockPrimary, mockSecondary]);
      const results = await service.search('Unknown');
      assert.deepStrictEqual(results, []);
    });
  });

  describe('Waterfall ISBN Search Fallback', () => {
    it('returns primary ISBN result when primary finds the book', async () => {
      let secondaryCalled = false;

      const mockPrimary: MetadataProvider = {
        name: 'PrimaryProvider',
        search: async () => [],
        getWorkDetails: async () => null,
        searchByIsbn: async (isbn: string) => dummyWork('w-isbn-1', `ISBN ${isbn}`, 'PrimaryProvider')
      };

      const mockSecondary: MetadataProvider = {
        name: 'SecondaryProvider',
        search: async () => [],
        getWorkDetails: async () => null,
        searchByIsbn: async () => {
          secondaryCalled = true;
          return null;
        }
      };

      const service = new BibliographicMetadataService([mockPrimary, mockSecondary]);
      const result = await service.searchByIsbn('9780132350884');

      assert.ok(result);
      assert.strictEqual(result.title, 'ISBN 9780132350884');
      assert.strictEqual(secondaryCalled, false);
    });

    it('falls back to secondary provider when primary cannot find the ISBN', async () => {
      const mockPrimary: MetadataProvider = {
        name: 'PrimaryProvider',
        search: async () => [],
        getWorkDetails: async () => null,
        searchByIsbn: async () => null
      };

      const mockSecondary: MetadataProvider = {
        name: 'SecondaryProvider',
        search: async () => [],
        getWorkDetails: async () => null,
        searchByIsbn: async (isbn: string) => dummyWork('w-isbn-2', `Found by Secondary ${isbn}`, 'SecondaryProvider')
      };

      const service = new BibliographicMetadataService([mockPrimary, mockSecondary]);
      const result = await service.searchByIsbn('9780132350884');

      assert.ok(result);
      assert.strictEqual(result.title, 'Found by Secondary 9780132350884');
    });

    it('returns null when all providers return null or throw', async () => {
      const mockPrimary: MetadataProvider = {
        name: 'PrimaryProvider',
        search: async () => [],
        getWorkDetails: async () => null,
        searchByIsbn: async () => {
          throw new Error('Connection refused');
        }
      };

      const mockSecondary: MetadataProvider = {
        name: 'SecondaryProvider',
        search: async () => [],
        getWorkDetails: async () => null,
        searchByIsbn: async () => null
      };

      const service = new BibliographicMetadataService([mockPrimary, mockSecondary]);
      const result = await service.searchByIsbn('0000000000');
      assert.strictEqual(result, null);
    });
  });

  describe('Get Work Details Routing', () => {
    it('routes ia- prefixed IDs directly to Internet Archive provider', async () => {
      let iaCalled = false;
      let olCalled = false;

      const mockOL: MetadataProvider = {
        name: 'Open Library',
        search: async () => [],
        getWorkDetails: async () => {
          olCalled = true;
          return null;
        },
        searchByIsbn: async () => null
      };

      const mockIA: MetadataProvider = {
        name: 'Internet Archive',
        search: async () => [],
        getWorkDetails: async (id: string) => {
          iaCalled = true;
          return dummyWork(id, 'Clean Code Volume', 'Internet Archive');
        },
        searchByIsbn: async () => null
      };

      const service = new BibliographicMetadataService([mockOL, mockIA]);
      const result = await service.getWorkDetails('ia-clean-code-volume');

      assert.ok(result);
      assert.strictEqual(iaCalled, true);
      assert.strictEqual(olCalled, false, 'Open Library should not be called for ia- prefixed work IDs');
      assert.strictEqual(result.title, 'Clean Code Volume');
    });
  });

  describe('Google Books Disabling Enforcement', () => {
    it('guarantees Google Books is completely excluded from getOrderedActiveProviders', () => {
      const mockGB: MetadataProvider = {
        name: 'Google Books',
        search: async () => [],
        getWorkDetails: async () => null,
        searchByIsbn: async () => null,
      };
      const mockOL: MetadataProvider = {
        name: 'Open Library',
        search: async () => [],
        getWorkDetails: async () => null,
        searchByIsbn: async () => null,
      };
      const mockIA: MetadataProvider = {
        name: 'Internet Archive',
        search: async () => [],
        getWorkDetails: async () => null,
        searchByIsbn: async () => null,
      };

      // Even if Google Books is passed in constructor
      const service = new BibliographicMetadataService([mockGB, mockIA, mockOL]);
      const providers = service.getOrderedActiveProviders();

      assert.strictEqual(providers.length, 2);
      assert.strictEqual(providers.some((p) => p.name === 'Google Books'), false);
    });

    it('guarantees Google Books is never executed during ISBN search fallback', async () => {
      const callOrder: string[] = [];

      const mockOL: MetadataProvider = {
        name: 'Open Library',
        search: async () => [],
        getWorkDetails: async () => null,
        searchByIsbn: async () => {
          callOrder.push('Open Library');
          return null;
        },
      };

      const mockIA: MetadataProvider = {
        name: 'Internet Archive',
        search: async () => [],
        getWorkDetails: async () => null,
        searchByIsbn: async () => {
          callOrder.push('Internet Archive');
          return dummyWork('ia-1', 'Target Book', 'Internet Archive');
        },
      };

      const mockGB: MetadataProvider = {
        name: 'Google Books',
        search: async () => [],
        getWorkDetails: async () => null,
        searchByIsbn: async () => {
          callOrder.push('Google Books');
          return dummyWork('gb-1', 'Target Book', 'Google Books');
        },
      };

      // Even if Google Books is passed first
      const service = new BibliographicMetadataService([mockGB, mockOL, mockIA]);
      const res = await service.searchByIsbn('9780134494166');

      assert.ok(res);
      assert.strictEqual(res.title, 'Target Book');
      assert.strictEqual(callOrder.includes('Google Books'), false, 'Google Books must never be called');
      assert.ok(callOrder.includes('Open Library'));
      assert.ok(callOrder.includes('Internet Archive'));
    });
  });
});
