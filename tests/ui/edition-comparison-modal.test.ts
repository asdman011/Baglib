import { describe, it } from 'node:test';
import assert from 'node:assert';
import { translations } from '../../src/renderer/translations';
import { EnrichmentComparison, EnrichmentFieldKey } from '../../src/shared/types/enrichment';

describe('Edition Comparison UI & Bilingual Localization Tests (Story 12)', () => {
  const story12Keys = [
    'findOnline',
    'findOnlineDesc',
    'editionComparisonTitle',
    'editionComparisonSubtitle',
    'candidateEditions',
    'comparingWithEdition',
    'currentValue',
    'incomingValue',
    'actionLabel',
    'statusNew',
    'statusOverwrite',
    'statusIdentical',
    'selectAllNewFields',
    'selectAllFields',
    'deselectAll',
    'overwriteProtectionToggle',
    'overwriteWarningText',
    'downloadCoverLocallyOption',
    'attachDigitalCopyOption',
    'applySelectedChanges',
    'noEditionsFound',
    'noEditionsHint',
    'searchingEditions',
    'fetchCover',
    'fetchingCover',
    'coverFetchedSuccess',
    'coverFetchFailed',
    'enrichmentAppliedSuccess',
    'digitalCopyAttachedSuccess',
    'openProviderLink',
    'matchConfidenceLabel',
    'selectEditionFirst',
    'coverImageLabel',
    'pagesLabel',
    'unknownAuthor',
    'applyingBulkChanges',
  ];

  it('contains all Story 12 translation keys in both Arabic and English with non-empty values', () => {
    for (const key of story12Keys) {
      const arVal = (translations.ar as unknown)[key];
      const enVal = (translations.en as unknown)[key];

      assert.ok(
        typeof arVal === 'string' && arVal.trim().length > 0,
        `Key "${key}" must exist and have non-empty Arabic translation`
      );
      assert.ok(
        typeof enVal === 'string' && enVal.trim().length > 0,
        `Key "${key}" must exist and have non-empty English translation`
      );
    }
  });

  it('simulates select all new fields logic accurately', () => {
    const mockComparison: EnrichmentComparison = {
      workId: 'work-1',
      currentBook: {
        id: 'work-1',
        title: 'Old Title',
        author: 'Old Author',
        categories: [],
        tags: [],
        lendingHistory: [],
        bookType: 'physical',
      },
      candidate: {
        id: 'cand-1',
        providerId: 'openlibrary',
        providerName: 'Open Library',
        title: 'New Title',
      },
      diffs: {
        title: {
          field: 'title',
          labelKey: 'diffFieldTitle',
          currentValue: 'Old Title',
          incomingValue: 'New Title',
          hasCurrent: true,
          hasIncoming: true,
          isDifferent: true,
          isOverwriting: true,
        },
        publisher: {
          field: 'publisher',
          labelKey: 'diffFieldPublisher',
          currentValue: '',
          incomingValue: 'New Publisher',
          hasCurrent: false,
          hasIncoming: true,
          isDifferent: true,
          isOverwriting: false,
        },
        description: {
          field: 'description',
          labelKey: 'diffFieldDescription',
          currentValue: '',
          incomingValue: 'New Description',
          hasCurrent: false,
          hasIncoming: true,
          isDifferent: true,
          isOverwriting: false,
        },
        isbn: {
          field: 'isbn',
          labelKey: 'diffFieldIsbn',
          currentValue: '1234567890',
          incomingValue: '1234567890',
          hasCurrent: true,
          hasIncoming: true,
          isDifferent: false,
          isOverwriting: false,
        },
      } as unknown,
      summary: {
        totalFields: 4,
        newFieldsCount: 2,
        overwritingCount: 1,
        identicalCount: 1,
      },
    };

    // "Select All New" checks fields where !hasCurrent && hasIncoming
    const newSelections: Record<EnrichmentFieldKey, boolean> = {
      title: false,
      author: false,
      publisher: false,
      publicationYear: false,
      isbn: false,
      language: false,
      description: false,
      coverImage: false,
      categories: false,
      pagesCount: false,
    };

    for (const [key, diff] of Object.entries(mockComparison.diffs)) {
      if (!diff.hasCurrent && diff.hasIncoming) {
        newSelections[key as EnrichmentFieldKey] = true;
      }
    }

    assert.strictEqual(newSelections.publisher, true);
    assert.strictEqual(newSelections.description, true);
    assert.strictEqual(newSelections.title, false);
    assert.strictEqual(newSelections.isbn, false);
  });

  it('simulates select all fields logic accurately', () => {
    const mockDiffs = {
      title: { hasIncoming: true, isDifferent: true },
      publisher: { hasIncoming: true, isDifferent: true },
      isbn: { hasIncoming: false, isDifferent: false },
    };

    const selections: Record<string, boolean> = {};
    for (const [key, diff] of Object.entries(mockDiffs)) {
      if (diff.hasIncoming) {
        selections[key] = true;
      }
    }

    assert.strictEqual(selections.title, true);
    assert.strictEqual(selections.publisher, true);
    assert.strictEqual(selections.isbn, undefined);
  });
});
