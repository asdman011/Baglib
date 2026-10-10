import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BibliographicMetadataService } from '../../../src/main/services/metadata/bibliographic-metadata.service';
import { MetadataProvider } from '../../../src/main/services/metadata/providers/provider.interface';
import { BibliographicWork } from '../../../src/shared/types/bibliographic';

describe('Progressive Metadata Discovery & Offline Import Tests', () => {
  const mockWork: BibliographicWork = {
    workId: 'OL12345W',
    title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    authors: ['Robert C. Martin'],
    firstPublishYear: 2008,
    editions: [
      {
        editionId: 'OL67890M',
        title: 'Clean Code',
        publisher: 'Prentice Hall',
        publishDate: '2008',
        isbn13: '9780132350884',
        isbn10: '0132350882',
        coverUrl: 'https://example.com/cover.jpg',
        sources: [],
      },
    ],
  };

  class MockOnlineProvider implements MetadataProvider {
    get name(): string {
      return 'Mock Primary Provider';
    }
    async search(): Promise<BibliographicWork[]> {
      return [mockWork];
    }
    async searchByIsbn(isbn: string): Promise<BibliographicWork | null> {
      return isbn.includes('9780132350884') ? mockWork : null;
    }
    async getWorkDetails(): Promise<BibliographicWork | null> {
      return mockWork;
    }
  }

  class FailingOfflineProvider implements MetadataProvider {
    get name(): string {
      return 'Failing Provider';
    }
    async search(): Promise<BibliographicWork[]> {
      throw new Error('ENOTFOUND: No internet connection');
    }
    async searchByIsbn(): Promise<BibliographicWork | null> {
      throw new Error('ENOTFOUND: No internet connection');
    }
    async getWorkDetails(): Promise<BibliographicWork | null> {
      throw new Error('ENOTFOUND: No internet connection');
    }
  }

  it('progressively discovers title, author, discovered ISBN, and cover from filename', async () => {
    const service = new BibliographicMetadataService([new MockOnlineProvider()]);

    const result = await service.discoverBook({
      filename: 'Clean Code - Robert C. Martin.epub',
    });

    assert.strictEqual(result.title.includes('Clean Code'), true);
    assert.deepStrictEqual(result.authors, ['Robert C. Martin']);
    assert.strictEqual(result.isbn, '9780132350884');
    assert.strictEqual(result.provenance.isbnDiscovered, true);
    assert.strictEqual(result.isVerifiedMatch, true);
    assert.strictEqual(result.candidates.length, 1);
  });

  it('remains completely resilient and importable when network is offline', async () => {
    const service = new BibliographicMetadataService([new FailingOfflineProvider()]);

    const result = await service.discoverBook({
      filename: 'The Pragmatic Programmer (Andrew Hunt, David Thomas).pdf',
    });

    // Successfully extracts fields locally despite offline network failure
    assert.strictEqual(result.title, 'The Pragmatic Programmer');
    assert.deepStrictEqual(result.authors, ['Andrew Hunt', 'David Thomas']);
    assert.strictEqual(result.isVerifiedMatch, false);
    assert.strictEqual(result.candidates.length, 0);
  });
});
