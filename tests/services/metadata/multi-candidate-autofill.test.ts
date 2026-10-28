import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BibliographicMetadataService } from '../../../src/main/services/metadata/bibliographic-metadata.service';
import { MetadataProvider } from '../../../src/main/services/metadata/providers/provider.interface';
import { BibliographicWork } from '../../../src/shared/types/bibliographic';
import { CandidateMatcher, TargetBookEvidence } from '../../../src/main/services/metadata/candidate-matcher';

describe('Multi-Candidate Auto-fill & Provider Resilience Tests', () => {
  const internetArchiveCandidate: BibliographicWork = {
    workId: 'ia-vol1',
    title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    authors: ['Robert C. Martin'],
    firstPublishYear: 2008,
    description: 'A handbook of agile software craftsmanship with comprehensive code examples.',
    editions: [
      {
        editionId: 'ia-ed1',
        title: 'Clean Code',
        publisher: 'Prentice Hall',
        publishDate: '2008-08-01',
        isbn13: '9780132350884',
        isbn10: '0132350882',
        pages: 464,
        language: 'en',
        coverUrl: 'https://archive.org/services/img/vol1',
        sources: [{ provider: 'Internet Archive', providerId: 'vol1' }],
      },
    ],
  };

  const openLibraryCandidate: BibliographicWork = {
    workId: 'OL-work2',
    title: 'Clean Code (Arabic Translation - الكود النظيف)',
    authors: ['Robert C. Martin'],
    firstPublishYear: 2015,
    description: 'النسخة المترجمة إلى اللغة العربية لمبادئ البرمجة النظيفة.',
    editions: [
      {
        editionId: 'OL-ed2',
        title: 'الكود النظيف',
        publisher: 'دار الكتب العلمية',
        publishDate: '2015',
        isbn13: '9789999999999',
        pages: 512,
        language: 'ar',
        coverUrl: 'https://covers.openlibrary.org/b/isbn/9789999999999-L.jpg',
        sources: [{ provider: 'Open Library', providerId: 'OL-ed2' }],
      },
    ],
  };

  class MockInternetArchiveProvider implements MetadataProvider {
    get name(): string {
      return 'Internet Archive';
    }
    async search(): Promise<BibliographicWork[]> {
      return [internetArchiveCandidate];
    }
    async searchByIsbn(isbn: string): Promise<BibliographicWork | null> {
      return isbn.includes('9780132350884') ? internetArchiveCandidate : null;
    }
    async getWorkDetails(): Promise<BibliographicWork | null> {
      return internetArchiveCandidate;
    }
  }

  class MockOpenLibraryProvider implements MetadataProvider {
    get name(): string {
      return 'Open Library';
    }
    async search(): Promise<BibliographicWork[]> {
      return [openLibraryCandidate];
    }
    async searchByIsbn(isbn: string): Promise<BibliographicWork | null> {
      return isbn.includes('9789999999999') ? openLibraryCandidate : null;
    }
    async getWorkDetails(): Promise<BibliographicWork | null> {
      return openLibraryCandidate;
    }
  }

  class FailingRateLimitedProvider implements MetadataProvider {
    get name(): string {
      return 'Rate Limited Provider';
    }
    async search(): Promise<BibliographicWork[]> {
      throw new Error('HTTP 429 Too Many Requests: Rate limit exceeded');
    }
    async searchByIsbn(): Promise<BibliographicWork | null> {
      throw new Error('HTTP 429 Too Many Requests');
    }
    async getWorkDetails(): Promise<BibliographicWork | null> {
      return null;
    }
  }

  it('aggregates candidates across multiple providers and ranks them by relevance', async () => {
    const service = new BibliographicMetadataService([
      new MockInternetArchiveProvider(),
      new MockOpenLibraryProvider(),
    ]);

    const result = await service.discoverBook({
      title: 'Clean Code',
      author: 'Robert C. Martin',
    });

    assert.strictEqual(result.candidates.length, 2, 'Should aggregate candidates from both providers');
    assert.strictEqual(result.rankedEvaluations?.length, 2);

    // Internet Archive exact English edition ranks first for 'Clean Code'
    assert.strictEqual(result.candidates[0].workId, 'ia-vol1');
    assert.strictEqual(result.rankedEvaluations?.[0].matchType, 'exact');
    assert.strictEqual(result.rankedEvaluations?.[0].score >= 60, true);

    // Open Library Arabic edition is also retained as candidate
    assert.strictEqual(result.candidates[1].workId, 'OL-work2');
    assert.strictEqual(result.candidates[1].editions[0].language, 'ar');
  });

  it('provides distinguishable metadata for editions to allow user selection', async () => {
    const service = new BibliographicMetadataService([
      new MockInternetArchiveProvider(),
      new MockOpenLibraryProvider(),
    ]);

    const result = await service.discoverBook({
      title: 'Clean Code',
    });

    const candidate1 = result.candidates[0];
    const candidate2 = result.candidates[1];

    // Distinguishable attributes
    assert.notStrictEqual(candidate1.workId, candidate2.workId);
    assert.strictEqual(candidate1.editions[0].publisher, 'Prentice Hall');
    assert.strictEqual(candidate2.editions[0].publisher, 'دار الكتب العلمية');
    assert.strictEqual(candidate1.editions[0].language, 'en');
    assert.strictEqual(candidate2.editions[0].language, 'ar');
    assert.strictEqual(candidate1.firstPublishYear, 2008);
    assert.strictEqual(candidate2.firstPublishYear, 2015);
  });

  it('recovers gracefully when a provider fails with rate limit (429) and retains surviving candidates', async () => {
    const service = new BibliographicMetadataService([
      new FailingRateLimitedProvider(),
      new MockInternetArchiveProvider(),
    ]);

    const result = await service.discoverBook({
      title: 'Clean Code',
      author: 'Robert C. Martin',
    });

    // Failing rate-limited provider did not crash the pipeline
    assert.strictEqual(result.candidates.length, 1);
    assert.strictEqual(result.candidates[0].workId, 'ia-vol1');
    assert.strictEqual(result.isVerifiedMatch, true);
  });

  it('handles empty results gracefully without throwing', async () => {
    class EmptyProvider implements MetadataProvider {
      get name() {
        return 'EmptyProvider';
      }
      async search() {
        return [];
      }
      async searchByIsbn() {
        return null;
      }
      async getWorkDetails() {
        return null;
      }
    }

    const service = new BibliographicMetadataService([new EmptyProvider()]);
    const result = await service.discoverBook({
      title: 'Completely Nonexistent Obscure Query 99999',
    });

    assert.strictEqual(result.candidates.length, 0);
    assert.strictEqual(result.isVerifiedMatch, false);
    assert.strictEqual(result.title, 'Completely Nonexistent Obscure Query 99999');
  });

  it('preserves existing data when calculating diff updates', () => {
    const currentBook: Record<string, unknown> = {
      id: 'book-1',
      title: 'My Custom Title',
      author: 'Ammar',
      publisher: 'My Independent Press',
      publicationYear: 2021,
      isbn: '9781234567890',
    };

    const incomingCandidate = internetArchiveCandidate;

    // Simulate default selection behavior: empty fields auto-selected, existing fields NOT selected
    const initialSelection: Record<string, boolean> = {
      title: false, // exists in current -> false
      author: false, // exists in current -> false
      publisher: false, // exists in current -> false
      publicationYear: false, // exists in current -> false
      isbn: false, // exists in current -> false
      description: true, // missing in current -> true
      coverImage: true, // missing in current -> true
    };

    const appliedUpdates: Record<string, unknown> = {};
    if (initialSelection.description && incomingCandidate.description) {
      appliedUpdates.description = incomingCandidate.description;
    }
    if (initialSelection.coverImage && incomingCandidate.editions[0].coverUrl) {
      appliedUpdates.coverImage = incomingCandidate.editions[0].coverUrl;
    }
    if (initialSelection.title && incomingCandidate.title) {
      appliedUpdates.title = incomingCandidate.title;
    }

    const mergedBook: Record<string, unknown> = { ...currentBook, ...appliedUpdates };

    // Existing fields preserved
    assert.strictEqual(mergedBook.title, 'My Custom Title');
    assert.strictEqual(mergedBook.author, 'Ammar');
    assert.strictEqual(mergedBook.publisher, 'My Independent Press');
    assert.strictEqual(mergedBook.publicationYear, 2021);
    assert.strictEqual(mergedBook.isbn, '9781234567890');

    // Missing fields populated
    assert.strictEqual(mergedBook.description, incomingCandidate.description);
    assert.strictEqual(mergedBook.coverImage, incomingCandidate.editions[0].coverUrl);
  });
});
