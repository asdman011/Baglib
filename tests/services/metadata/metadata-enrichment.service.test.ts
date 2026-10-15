import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MetadataEnrichmentService } from '../../../src/main/services/metadata/metadata-enrichment.service';
import { ISearchProvider, UnifiedSearchResult, UnifiedSearchQuery } from '../../../src/shared/types/search';
import { BookItem } from '../../../src/shared/types/work';
import { EnrichmentCandidateEdition, ApplyEnrichmentRequest } from '../../../src/shared/types/enrichment';

class MockSearchProvider implements ISearchProvider {
  constructor(
    public readonly id: any,
    public readonly name: string,
    public readonly nameAr: string,
    public readonly description: string = '',
    public readonly descriptionAr: string = '',
    public readonly icon: string = 'globe',
    public readonly supportsDownload: boolean = true,
    public readonly supportsFullText: boolean = false,
    private mockResults: UnifiedSearchResult[] = []
  ) {}

  private enabled = true;
  isEnabled(): boolean {
    return this.enabled;
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async search(_query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]> {
    return this.mockResults;
  }
}

describe('MetadataEnrichmentService Unit Tests (Story 12)', () => {
  const sampleBook: BookItem = {
    id: 'work-101',
    title: 'Clean Architecture',
    author: 'Robert C. Martin',
    publisher: '',
    publicationYear: undefined,
    isbn: '9780134494166',
    language: '',
    description: '',
    categories: [],
    tags: [],
    lendingHistory: [],
    bookType: 'physical',
  };

  it('calculates match confidence correctly for exact ISBN match', () => {
    const service = new MetadataEnrichmentService([]);
    const candidateResult: UnifiedSearchResult = {
      id: 'ol-1',
      providerId: 'openlibrary',
      providerName: 'Open Library',
      title: 'Clean Architecture: A Craftsman\'s Guide to Software Structure',
      author: 'Robert C. Martin',
      isbn: '9780134494166',
    };

    const { confidence, reason } = (service as any).calculateMatchConfidence(sampleBook, candidateResult);
    assert.strictEqual(confidence, 1.0);
    assert.match(reason, /ISBN match/i);
  });

  it('calculates match confidence correctly for title and author similarity when ISBN is missing', () => {
    const service = new MetadataEnrichmentService([]);
    const bookWithoutIsbn: BookItem = {
      ...sampleBook,
      isbn: undefined,
    };

    const candidateResult: UnifiedSearchResult = {
      id: 'gb-1',
      providerId: 'googlebooks',
      providerName: 'Google Books',
      title: 'Clean Architecture',
      author: 'Robert C. Martin',
    };

    const { confidence, reason } = (service as any).calculateMatchConfidence(bookWithoutIsbn, candidateResult);
    assert.ok(confidence >= 0.85, `Confidence ${confidence} should be >= 0.85`);
    assert.match(reason, /Title & Author match/i);
  });

  it('finds candidate editions across multiple providers and deduplicates by ISBN', async () => {
    const provider1 = new MockSearchProvider('openlibrary', 'Open Library', 'أوبن لايبراري', '', '', 'globe', true, false, [
      {
        id: 'ol-clean',
        providerId: 'openlibrary',
        providerName: 'Open Library',
        title: 'Clean Architecture',
        author: 'Robert C. Martin',
        isbn: '9780134494166',
        publishYear: 2017,
        publisher: 'Prentice Hall',
        availableFormats: ['EPUB'],
        downloadUrl: 'https://archive.org/download/clean-arch.epub',
      },
    ]);

    const provider2 = new MockSearchProvider('googlebooks', 'Google Books', 'جوجل بوكس', '', '', 'globe', false, false, [
      {
        id: 'gb-clean',
        providerId: 'googlebooks',
        providerName: 'Google Books',
        title: 'Clean Architecture',
        author: 'Robert C. Martin',
        isbn: '9780134494166', // Same normalized ISBN -> should be deduplicated
        publishYear: 2017,
        publisher: 'Prentice Hall',
      },
      {
        id: 'gb-alt',
        providerId: 'googlebooks',
        providerName: 'Google Books',
        title: 'Clean Architecture in C#',
        author: 'Jason Taylor',
        isbn: '9781800560710',
        publishYear: 2021,
      },
    ]);

    const service = new MetadataEnrichmentService([provider1, provider2]);
    const response = await service.findCandidateEditions(sampleBook);

    assert.strictEqual(response.workId, 'work-101');
    assert.strictEqual(response.candidates.length, 2, 'Should deduplicate the exact ISBN across providers');
    assert.strictEqual(response.candidates[0].isbn, '9780134494166');
    assert.strictEqual(response.candidates[0].downloadFormat, 'EPUB');
    assert.strictEqual(response.candidates[0].downloadUrl, 'https://archive.org/download/clean-arch.epub');
  });

  it('computes field diffs accurately: detects new, overwrite, and identical fields', () => {
    const service = new MetadataEnrichmentService([]);

    const candidate: EnrichmentCandidateEdition = {
      id: 'cand-1',
      providerId: 'openlibrary',
      providerName: 'Open Library',
      title: 'Clean Architecture: A Craftsman\'s Guide',
      authors: ['Robert C. Martin'],
      publisher: 'Prentice Hall',
      publicationYear: 2017,
      isbn: '9780134494166',
      language: 'English',
      description: 'Practical software architecture principles.',
      subjects: ['Software engineering', 'Computer programming'],
      pageCount: 432,
    };

    const comparison = service.computeFieldDiffs(sampleBook, candidate);

    // Title: current is 'Clean Architecture', candidate is 'Clean Architecture: A Craftsman\'s Guide' -> overwrite
    assert.strictEqual(comparison.diffs.title.isOverwriting, true);
    assert.strictEqual(comparison.diffs.title.isDifferent, true);

    // Publisher: current is empty, candidate has value -> new
    assert.strictEqual(comparison.diffs.publisher.hasCurrent, false);
    assert.strictEqual(comparison.diffs.publisher.hasIncoming, true);
    assert.strictEqual(comparison.diffs.publisher.incomingValue, 'Prentice Hall');

    // Publication Year: current is undefined, candidate is 2017 -> new
    assert.strictEqual(comparison.diffs.publicationYear.hasCurrent, false);
    assert.strictEqual(comparison.diffs.publicationYear.hasIncoming, true);
    assert.strictEqual(comparison.diffs.publicationYear.incomingValue, 2017);

    // ISBN: current and incoming are identical -> identical (isDifferent === false)
    assert.strictEqual(comparison.diffs.isbn.isDifferent, false);

    // Verify summary counts
    assert.ok(comparison.summary.newFieldsCount >= 2);
    assert.ok(comparison.summary.overwritingCount >= 1);
    assert.ok(comparison.summary.identicalCount >= 1);
  });

  it('applies enrichment non-destructively: respects overwrite protection guards', async () => {
    const service = new MetadataEnrichmentService([]);

    let savedBook: any = null;
    const mockRepo: any = {
      getById: async () => ({ ...sampleBook }),
      updateBook: async (b: any) => {
        savedBook = b;
        return b;
      },
    };

    const candidate: EnrichmentCandidateEdition = {
      id: 'cand-2',
      providerId: 'openlibrary',
      providerName: 'Open Library',
      title: 'Completely Different Title',
      authors: ['Different Author'],
      publisher: 'Prentice Hall International',
      publicationYear: 2018,
      isbn: '9780134494166',
      language: 'en',
      description: 'In-depth architecture patterns.',
      subjects: ['Architecture'],
      coverUrl: 'https://covers.openlibrary.org/b/id/123-L.jpg',
      downloadUrl: 'https://archive.org/download/book.epub',
      downloadFormat: 'EPUB',
    };

    // Test 1: overwritePopulatedFields is FALSE -> Title should be protected, Publisher and Year should be applied
    const requestProtected: ApplyEnrichmentRequest = {
      workId: sampleBook.id,
      candidateId: candidate.id,
      selectedFields: ['title', 'publisher', 'publicationYear', 'description'],
      incomingValues: {
        title: candidate.title,
        publisher: candidate.publisher,
        publicationYear: candidate.publicationYear,
        description: candidate.description,
      },
      overwritePopulatedFields: false,
    };

    const resProtected = await service.applyEnrichment(requestProtected, mockRepo);

    assert.strictEqual(resProtected.success, true);
    assert.strictEqual(savedBook.title, 'Clean Architecture', 'Title must remain unchanged due to overwrite protection');
    assert.strictEqual(savedBook.publisher, 'Prentice Hall International', 'Empty publisher must be filled');
    assert.strictEqual(savedBook.publicationYear, 2018, 'Empty publication year must be filled');
    assert.strictEqual(savedBook.description, 'In-depth architecture patterns.');
    assert.ok(resProtected.skippedFields.includes('title'), 'Protected title must be in skippedFields');
    assert.ok(resProtected.appliedFields.includes('publisher'));

    // Test 2: overwritePopulatedFields is TRUE -> Title should now be updated
    const requestOverwrite: ApplyEnrichmentRequest = {
      ...requestProtected,
      overwritePopulatedFields: true,
    };

    const resOverwrite = await service.applyEnrichment(requestOverwrite, mockRepo);
    assert.strictEqual(resOverwrite.success, true);
    assert.strictEqual(savedBook.title, 'Completely Different Title', 'Title should now overwrite');
    assert.ok(resOverwrite.appliedFields.includes('title'));
  });
});
