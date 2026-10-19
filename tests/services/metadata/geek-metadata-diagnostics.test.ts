import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleBooksQuerySanitizer } from '../../../src/main/services/metadata/providers/google-books-query-sanitizer';
import { translations } from '../../../src/renderer/translations';
import { MetadataProvenance, BookItem } from '../../../src/shared/types/work';

describe('Geek Metadata Diagnostics & Provenance Engine', () => {
  describe('GoogleBooksQuerySanitizer Protection Rules', () => {
    it('sanitizes titles with colons and special characters to prevent HTTP 503 backendFailed', () => {
      const rawTitle = 'Barbra Teater: An introduction to applying social work theories and methods [2010]';
      const cleaned = GoogleBooksQuerySanitizer.cleanTextToken(rawTitle);

      assert.ok(!cleaned.includes(':'), 'Should not contain colons');
      assert.ok(!cleaned.includes('['), 'Should not contain brackets');
      assert.ok(!cleaned.includes(']'), 'Should not contain brackets');
      assert.ok(cleaned.length > 0);
    });

    it('extracts salient words from multi-word titles, removing noise and stop-words', () => {
      const title = 'An introduction to applying social work theories and methods';
      const salient = GoogleBooksQuerySanitizer.extractSalientWords(title, 4);

      assert.ok(Array.isArray(salient));
      assert.ok(!salient.includes('An'));
      assert.ok(!salient.includes('to'));
      assert.ok(!salient.includes('and'));
      assert.ok(salient.length <= 4);
    });

    it('formats ISBN queries safely with isbn: prefix for 10 and 13 digit numbers', () => {
      const query10 = GoogleBooksQuerySanitizer.buildQuery({ isbn: '0-306-40615-2' });
      assert.ok(query10);
      assert.strictEqual(query10?.isIsbnQuery, true);
      assert.strictEqual(query10?.queryString, 'isbn:0306406152');

      const query13 = GoogleBooksQuerySanitizer.buildQuery({ isbn: '978-0-335-23786-9' });
      assert.ok(query13);
      assert.strictEqual(query13?.isIsbnQuery, true);
      assert.strictEqual(query13?.queryString, 'isbn:9780335237869');
    });

    it('rejects invalid ISBNs and prevents sending malformed isbn: queries (HTTP 400)', () => {
      const invalidIsbn = GoogleBooksQuerySanitizer.cleanIsbn('12345');
      assert.strictEqual(invalidIsbn, null);

      const invalidQuery = GoogleBooksQuerySanitizer.buildQuery({ isbn: 'invalid-isbn' });
      assert.strictEqual(invalidQuery, null);
    });

    it('filters out placeholder authors so bogus inauthor queries are never sent', () => {
      const qUnknown = GoogleBooksQuerySanitizer.buildQuery({
        title: 'Social Work Theories',
        author: 'Unknown Author',
      });
      assert.ok(qUnknown);
      assert.ok(!qUnknown?.queryString.includes('Unknown Author'));

      const qArabicUnknown = GoogleBooksQuerySanitizer.buildQuery({
        title: 'مقدمة في الخدمة الاجتماعية',
        author: 'غير معروف',
      });
      assert.ok(qArabicUnknown);
      assert.ok(!qArabicUnknown?.queryString.includes('غير معروف'));
    });
  });

  describe('Metadata Provenance Data Model & Schema', () => {
    it('supports rich Geek diagnostics fields on BookItem', () => {
      const provenance: MetadataProvenance = {
        primaryProvider: 'Google Books API v1',
        providerId: 'gb-qsgvEAAAQBAJ',
        sourceUrl: 'https://books.google.com/books?id=qsgvEAAAQBAJ',
        discoveredAt: new Date().toISOString(),
        method: 'online_api',
        confidence: 0.98,
        fieldSources: {
          title: { source: 'Google Books API v1', status: 'verified', value: 'Social Work Theories', confidence: 0.98 },
          author: { source: 'Google Books API v1', status: 'verified', value: 'Barbra Teater', confidence: 0.98 },
          isbn: { source: 'Google Books API v1', status: 'verified', value: '9780335237869', confidence: 1.0 },
          pagesCount: { source: 'Embedded PDF Stream', status: 'calculated', value: 312, confidence: 1.0 },
        },
        auditTrace: [
          '[Digital Ingestion] Processed local file: teater.pdf (4.2 MB)',
          '[Provider Match] Query returned gb-qsgvEAAAQBAJ with 98% confidence',
        ],
        rawBibliographic: { volumeInfo: { title: 'Social Work Theories' } },
      };

      const book: BookItem = {
        id: 'book-geek-test',
        title: 'Social Work Theories',
        author: 'Barbra Teater',
        metadataProvenance: provenance,
      };

      assert.strictEqual(book.metadataProvenance?.primaryProvider, 'Google Books API v1');
      assert.strictEqual(book.metadataProvenance?.method, 'online_api');
      assert.strictEqual(book.metadataProvenance?.fieldSources?.title.status, 'verified');
      assert.strictEqual(book.metadataProvenance?.fieldSources?.pagesCount.source, 'Embedded PDF Stream');
      assert.strictEqual(book.metadataProvenance?.auditTrace?.length, 2);
    });
  });

  describe('Bilingual UI Translations for Geek Details', () => {
    const requiredGeekKeys: (keyof typeof translations.ar)[] = [
      'geekDetailsBtn',
      'geekDetailsTitle',
      'geekDetailsSubtitle',
      'geekPrimaryProvider',
      'geekMethod',
      'geekConfidence',
      'geekTimestamp',
      'geekFieldAttribution',
      'geekAuditTrace',
      'geekRawJson',
      'geekCopyJson',
      'geekJsonCopied',
      'geekCopyTrace',
      'geekTraceCopied',
      'geekFieldCol',
      'geekValueCol',
      'geekSourceCol',
      'geekStatusCol',
      'geekTabAttribution',
      'geekTabAuditTrace',
      'geekTabRawJson',
      'geekVerificationVerified',
      'geekVerificationExtracted',
      'geekVerificationCalculated',
      'geekVerificationFallback',
      'geekVerificationUserOverride',
      'geekMethodOnlineApi',
      'geekMethodOfflineEmbedded',
      'geekMethodOfflineFilename',
      'geekMethodManual',
      'geekMethodHybrid',
      'geekProviderGoogleBooks',
      'geekProviderOpenLibrary',
      'geekProviderInternetArchive',
      'geekProviderEmbedded',
      'geekProviderManual',
      'geekClose',
      'geekDetailsTooltip',
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

    it('verifies all Geek Details translation keys exist in Arabic (ar)', () => {
      assert.strictEqual(translations.ar.geekDetailsBtn, 'تفاصيل تقنية');
      for (const key of requiredGeekKeys) {
        assert.ok(translations.ar[key], `Missing Arabic translation for key: ${key}`);
        assert.strictEqual(typeof translations.ar[key], 'string');
        assert.ok(translations.ar[key].length > 0);
      }
    });

    it('verifies all Geek Details translation keys exist in English (en)', () => {
      assert.strictEqual(translations.en.geekDetailsBtn, 'Tech Info');
      for (const key of requiredGeekKeys) {
        assert.ok(translations.en[key], `Missing English translation for key: ${key}`);
        assert.strictEqual(typeof translations.en[key], 'string');
        assert.ok(translations.en[key].length > 0);
      }
    });
  });
});
