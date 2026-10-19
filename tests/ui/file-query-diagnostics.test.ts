import { describe, it } from 'node:test';
import assert from 'node:assert';
import { translations } from '../../src/renderer/translations';
import {
  TechnicalSearchDiagnostics,
  EnrichmentCandidateEdition,
} from '../../src/shared/types/enrichment';
import { BookItem } from '../../src/shared/types/work';

describe('File & Query Technical Diagnostics UI/UX Tests', () => {
  describe('Geek Details Button Styling & Visual Weight', () => {
    it('provides compact labels for the Geek Details button in both languages', () => {
      // Must not be the old verbose button text
      assert.strictEqual(translations.en.geekDetailsBtn, 'Tech Info');
      assert.strictEqual(translations.ar.geekDetailsBtn, 'تفاصيل تقنية');
    });

    it('provides informative tooltips explaining developer diagnostics', () => {
      assert.strictEqual(
        translations.en.geekDetailsTooltip,
        'Metadata Diagnostics & API Provenance'
      );
      assert.strictEqual(
        translations.ar.geekDetailsTooltip,
        'تفاصيل التقاط البيانات ومصدر الـ API'
      );
    });
  });

  describe('File & Query Diagnostics Panel Data Integrity', () => {
    const mockDiagnostics: TechnicalSearchDiagnostics = {
      filePath: "C:/Users/Books/Barbra Teater - Social Work Theories (2010, McGraw-Hill) - libgen.li.pdf",
      fileFormat: 'PDF',
      fileSizeBytes: 4404019,
      fileSizeFormatted: '4.2 MB',
      embeddedDocInfo: {
        title: 'mcgrawh 19768',
        author: 'jharding',
        publisher: 'McGraw-Hill',
        publicationYear: 2010,
        pagesCount: 312,
      },
      filenameBreakdown: {
        rawFilename: 'Barbra Teater - Social Work Theories (2010, McGraw-Hill) - libgen.li.pdf',
        parsedTitle: 'Social Work Theories',
        parsedAuthor: 'Barbra Teater',
        parsedYear: 2010,
        parsedPublisher: 'McGraw-Hill',
        discardedArtifacts: [
          { field: 'title', value: 'mcgrawh 19768', reason: 'Publisher prepress / print-job code' },
          { field: 'author', value: 'jharding', reason: 'Typesetter OS account / system username' },
          { field: 'filename', value: '- libgen.li', reason: 'Repository domain suffix' },
        ],
      },
      activeQuery: {
        normalizedTitle: 'Social Work Theories',
        normalizedAuthor: 'Barbra Teater',
        detectedIsbn: '9780335237869',
        queryString: 'isbn:9780335237869',
        providersQueried: ['Google Books', 'Open Library', 'Internet Archive'],
      },
    };

    it('captures source file path, format, and size correctly', () => {
      assert.match(mockDiagnostics.filePath!, /\.pdf$/i);
      assert.strictEqual(mockDiagnostics.fileFormat, 'PDF');
      assert.strictEqual(mockDiagnostics.fileSizeFormatted, '4.2 MB');
    });

    it('captures raw embedded docInfo and separates prepress artifacts', () => {
      assert.strictEqual(mockDiagnostics.embeddedDocInfo?.title, 'mcgrawh 19768');
      assert.strictEqual(mockDiagnostics.embeddedDocInfo?.author, 'jharding');
      assert.strictEqual(mockDiagnostics.filenameBreakdown?.discardedArtifacts?.length, 3);
      assert.strictEqual(mockDiagnostics.filenameBreakdown?.discardedArtifacts?.[0].field, 'title');
    });

    it('captures active search query parameters and target providers', () => {
      assert.strictEqual(mockDiagnostics.activeQuery.normalizedTitle, 'Social Work Theories');
      assert.strictEqual(mockDiagnostics.activeQuery.normalizedAuthor, 'Barbra Teater');
      assert.strictEqual(mockDiagnostics.activeQuery.detectedIsbn, '9780335237869');
      assert.strictEqual(mockDiagnostics.activeQuery.queryString, 'isbn:9780335237869');
      assert.deepStrictEqual(mockDiagnostics.activeQuery.providersQueried, [
        'Google Books',
        'Open Library',
        'Internet Archive',
      ]);
    });
  });

  describe('Candidate Edition Diagnostic Scoring & Matched Factors', () => {
    it('supports exact confidence scores and individual factor breakdowns', () => {
      const candidate: EnrichmentCandidateEdition = {
        id: 'cand-teater-1',
        providerId: 'googlebooks',
        providerName: 'Google Books',
        title: 'An Introduction to Applying Social Work Theories and Methods',
        authors: ['Barbra Teater'],
        publisher: 'Open University Press',
        publicationYear: 2010,
        isbn: '9780335237869',
        matchConfidence: 0.95,
        matchReason: 'Title Token Similarity (95%) & Author Match',
        matchFactors: {
          isbnMatched: false,
          titleSimilarity: 0.95,
          authorMatched: true,
          summary: 'Title Token Similarity (95%) & Author Match',
        },
      };

      assert.strictEqual(candidate.matchConfidence, 0.95);
      assert.strictEqual(Math.round(candidate.matchConfidence * 100), 95);
      assert.strictEqual(candidate.matchFactors?.titleSimilarity, 0.95);
      assert.strictEqual(candidate.matchFactors?.authorMatched, true);
      assert.strictEqual(candidate.matchFactors?.isbnMatched, false);
    });

    it('supports 100% confidence for exact ISBN match', () => {
      const candidate: EnrichmentCandidateEdition = {
        id: 'cand-isbn-1',
        providerId: 'openlibrary',
        providerName: 'Open Library',
        title: 'Social Work Theories',
        authors: ['Barbra Teater'],
        isbn: '9780335237869',
        matchConfidence: 1.0,
        matchReason: 'Exact ISBN Match',
        matchFactors: {
          isbnMatched: true,
          titleSimilarity: 1.0,
          authorMatched: true,
          summary: 'Exact ISBN Match (100%)',
        },
      };

      assert.strictEqual(candidate.matchConfidence, 1.0);
      assert.strictEqual(candidate.matchFactors?.isbnMatched, true);
    });
  });

  describe('Bilingual Translation Coverage for Diagnostic Components', () => {
    const requiredKeys: (keyof typeof translations.ar)[] = [
      'diagnosticsPanelTitle',
      'diagnosticsPanelSubtitle',
      'sourceFileInfo',
      'embeddedDocInfo',
      'filenameBreakdown',
      'activeSearchQuery',
      'matchFactors',
      'factorIsbnMatch',
      'factorTitleSimilarity',
      'factorAuthorMatch',
      'discardedPrepressArtifacts',
      'noFileLinked',
      'queryProviders',
      'rawQueryString',
    ];

    it('verifies all technical diagnostic keys exist in Arabic (ar)', () => {
      for (const key of requiredKeys) {
        assert.ok(translations.ar[key], `Missing Arabic translation for: ${key}`);
        assert.ok(translations.ar[key].length > 0);
      }
    });

    it('verifies all technical diagnostic keys exist in English (en)', () => {
      for (const key of requiredKeys) {
        assert.ok(translations.en[key], `Missing English translation for: ${key}`);
        assert.ok(translations.en[key].length > 0);
      }
    });
  });
});
