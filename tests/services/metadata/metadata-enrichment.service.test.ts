import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MetadataEnrichmentService } from '../../../src/main/services/metadata/metadata-enrichment.service';
import { ISearchProvider, UnifiedSearchResult, UnifiedSearchQuery } from '../../../src/shared/types/search';
import { BookItem } from '../../../src/shared/types/work';
import { EnrichmentCandidateEdition, ApplyEnrichmentRequest } from '../../../src/shared/types/enrichment';

class MockSearchProvider implements ISearchProvider {
  constructor(
    public readonly id: unknown,
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

    const { confidence, reason } = (service as unknown).calculateMatchConfidence(sampleBook, candidateResult);
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

    const { confidence, reason } = (service as unknown).calculateMatchConfidence(bookWithoutIsbn, candidateResult);
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

    const provider2 = new MockSearchProvider('internetarchive', 'Internet Archive', 'أرشيف الإنترنت', '', '', 'globe', false, false, [
      {
        id: 'ia-clean',
        providerId: 'internetarchive',
        providerName: 'Internet Archive',
        title: 'Clean Architecture',
        author: 'Robert C. Martin',
        isbn: '9780134494166', // Same normalized ISBN -> should be deduplicated
        publishYear: 2017,
        publisher: 'Prentice Hall',
      },
      {
        id: 'ia-alt',
        providerId: 'internetarchive',
        providerName: 'Internet Archive',
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

    // Verify technical diagnostics and candidate factor breakdown (Story refinement)
    assert.ok(response.technicalDiagnostics, 'Response must include technical diagnostics');
    assert.strictEqual(response.technicalDiagnostics.activeQuery.normalizedTitle, 'Clean Architecture');
    assert.strictEqual(response.technicalDiagnostics.activeQuery.detectedIsbn, '9780134494166');
    assert.ok(response.candidates[0].matchFactors, 'Candidate edition must include matchFactors breakdown');
    assert.strictEqual(response.candidates[0].matchFactors?.isbnMatched, true);
    assert.strictEqual(response.candidates[0].matchConfidence, 1.0);
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

    let savedBook: unknown = null;
    const mockRepo: unknown = {
      getById: async () => ({ ...sampleBook }),
      updateBook: async (b: unknown) => {
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

  it('completely excludes Google Books provider from active search and discovery', async () => {
    const events: string[] = [];

    const nonGoogle1 = new MockSearchProvider('openlibrary', 'Open Library', 'أوبن لايبراري', '', '', 'globe', true, false, []);
    nonGoogle1.search = async () => {
      events.push('start:openlibrary');
      await new Promise((r) => setTimeout(r, 10));
      events.push('end:openlibrary');
      return [];
    };

    const googleProvider = new MockSearchProvider('googlebooks', 'Google Books', 'جوجل بوكس', '', '', 'globe', false, false, []);
    googleProvider.search = async () => {
      events.push('start:googlebooks');
      return [];
    };

    // Even if googleProvider is passed in options, MetadataEnrichmentService must completely filter it out
    const service = new MetadataEnrichmentService([googleProvider, nonGoogle1]);
    await service.findCandidateEditions(sampleBook);

    assert.ok(events.includes('start:openlibrary'));
    assert.strictEqual(events.includes('start:googlebooks'), false, 'Google Books must never be executed');
  });

  it('updates title when existing title is a placeholder / prepress artifact / filename even when overwritePopulatedFields is false', async () => {
    const service = new MetadataEnrichmentService([]);

    const placeholderBook: BookItem = {
      id: 'book-placeholder-1',
      title: 'mcgrawh 19768',
      author: 'Unknown Author',
      categories: [],
      tags: [],
      lendingHistory: [],
      readingStatus: 'unread',
      readingProgress: 0,
      bookType: 'digital',
    };

    let savedBook: BookItem = { ...placeholderBook };
    const mockRepo: unknown = {
      updateBook: async (b: unknown) => {
        savedBook = { ...savedBook, ...b };
      },
      getById: async () => savedBook,
      getAllWorks: async () => [savedBook],
    };

    const candidate: EnrichmentCandidateEdition = {
      id: 'cand-placeholder-match',
      providerId: 'openlibrary',
      providerName: 'Open Library',
      title: 'An Introduction to Applying Social Work Theories and Methods 3e',
      authors: ['Barbra Teater'],
      publisher: 'Open University Press',
      publicationYear: 2010,
      isbn: '9780335237784',
    };

    // Verify computeFieldDiffs recognizes title and author as empty/placeholder (not overwriting legitimate data)
    const diffs = service.computeFieldDiffs(placeholderBook, candidate);
    assert.strictEqual(diffs.diffs.title.hasCurrent, false, 'Prepress title "mcgrawh 19768" must be treated as hasCurrent: false');
    assert.strictEqual(diffs.diffs.title.hasIncoming, true);
    assert.strictEqual(diffs.diffs.title.isOverwriting, false);
    assert.strictEqual(diffs.diffs.author.hasCurrent, false, 'Unknown Author must be treated as hasCurrent: false');

    // Verify applyEnrichment applies the incoming title even with overwritePopulatedFields: false
    const req: ApplyEnrichmentRequest = {
      workId: placeholderBook.id,
      candidateId: candidate.id,
      selectedFields: ['title', 'author', 'publisher', 'publicationYear', 'isbn'],
      incomingValues: {
        title: candidate.title,
        author: candidate.authors![0],
        publisher: candidate.publisher,
        publicationYear: candidate.publicationYear,
        isbn: candidate.isbn,
      },
      overwritePopulatedFields: false,
    };

    const res = await service.applyEnrichment(req, mockRepo);
    assert.strictEqual(res.success, true);
    assert.strictEqual(
      savedBook.title,
      'An Introduction to Applying Social Work Theories and Methods 3e',
      'Placeholder title must be updated with online canonical title'
    );
    assert.strictEqual(savedBook.author, 'Barbra Teater');
    assert.ok(res.appliedFields.includes('title'));
    assert.ok(res.appliedFields.includes('author'));
  });
});

