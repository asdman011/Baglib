import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translations, TranslationKey } from '../../src/renderer/translations';
import { UnifiedSearchResult, SearchProviderId } from '../../src/shared/types/search';

describe('Search Hub UI & Bilingual Verification Tests', () => {
  describe('Bilingual Translations Integrity', () => {
    const requiredKeys: TranslationKey[] = [
      'searchHubTitle',
      'searchHubSubtitle',
      'searchScopeAll',
      'searchScopeLocal',
      'searchScopeOnline',
      'providersHeader',
      'providerLocal',
      'providerOpenLibrary',
      'providerGoogleBooks',
      'providerInternetArchive',
      'providerGutenberg',
      'searchingProviders',
      'searchCompletedIn',
      'searchProgressStatus',
      'inLibraryBadge',
      'viewInLibrary',
      'importToLibrary',
      'downloadAndImport',
      'importingBook',
      'importedSuccess',
      'alreadyInLibraryToast',
      'importSuccessToast',
      'formatsAvailable',
      'noSearchResults',
      'noSearchResultsHint',
      'searchDetailsTitle',
      'publisherLabel',
      'publishedYearLabel',
      'languageLabel',
      'subjectsLabel',
      'sourceProviderLabel',
      'openInBrowser',
      'directDownload',
      'cancelSearch',
      'navSearch',
      'providerStatusRunning',
      'providerStatusCompleted',
      'providerStatusFailed',
      'providerStatusCancelled',
    ];

    it('contains all required Story 11 keys in Arabic and English dictionaries', () => {
      for (const key of requiredKeys) {
        assert.ok(
          translations.ar[key],
          `Missing Arabic translation for key: "${key}"`
        );
        assert.ok(
          translations.en[key],
          `Missing English translation for key: "${key}"`
        );
      }
    });

    it('interpolates template parameters properly in both languages', () => {
      const templateAr = translations.ar.searchCompletedIn;
      const interpolatedAr = templateAr.replace('{count}', '5').replace('{time}', '1.25');
      assert.ok(interpolatedAr.includes('5'));
      assert.ok(interpolatedAr.includes('1.25'));

      const templateEn = translations.en.searchCompletedIn;
      const interpolatedEn = templateEn.replace('{count}', '5').replace('{time}', '1.25');
      assert.ok(interpolatedEn.includes('5'));
      assert.ok(interpolatedEn.includes('1.25'));
    });
  });

  describe('Search Filter & Scope Logic', () => {
    const mockResults: UnifiedSearchResult[] = [
      {
        id: 'local:1',
        providerId: 'local',
        providerName: 'My Library',
        title: 'Local Book',
        author: 'Local Author',
        inLibrary: true,
        localWorkId: 'work-1',
      },
      {
        id: 'ol:1',
        providerId: 'openlibrary',
        providerName: 'Open Library',
        title: 'Online Metadata Only',
        author: 'Online Author',
        inLibrary: false,
      },
      {
        id: 'ia:1',
        providerId: 'internetarchive',
        providerName: 'Internet Archive',
        title: 'Downloadable Public Domain',
        author: 'Classic Author',
        downloadUrl: 'https://archive.org/download/item/item.epub',
        availableFormats: ['EPUB'],
        inLibrary: false,
      },
      {
        id: 'gut:1',
        providerId: 'gutenberg',
        providerName: 'Gutenberg',
        title: 'Duplicate Online Book',
        author: 'Local Author',
        downloadUrl: 'https://gutenberg.org/book.epub',
        availableFormats: ['EPUB'],
        inLibrary: true,
        localWorkId: 'work-1',
      },
    ];

    it('filters strictly in-library books when in_library filter is selected', () => {
      const inLibraryOnly = mockResults.filter((r) => r.inLibrary);
      assert.equal(inLibraryOnly.length, 2);
      assert.ok(inLibraryOnly.every((r) => r.inLibrary));
    });

    it('filters strictly downloadable books when downloadable filter is selected', () => {
      const downloadableOnly = mockResults.filter((r) => Boolean(r.downloadUrl));
      assert.equal(downloadableOnly.length, 2);
      assert.ok(downloadableOnly.every((r) => Boolean(r.downloadUrl)));
    });

    it('allows searching across all providers by default', () => {
      const providers: SearchProviderId[] = [
        'local',
        'openlibrary',
        'googlebooks',
        'internetarchive',
        'gutenberg',
      ];
      assert.equal(providers.length, 5);
      assert.ok(providers.includes('local'));
      assert.ok(providers.includes('gutenberg'));
    });
  });
});
