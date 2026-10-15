/**
 * Baglib — Local Search Provider
 *
 * Searches the user's local SQLite catalog across Works, Editions, Authors,
 * Categories, Tags, and Physical Locations using Arabic/multilingual normalization.
 */

import {
  ISearchProvider,
  SearchProviderId,
  UnifiedSearchQuery,
  UnifiedSearchResult,
  SearchFormat,
} from '../../../../shared/types/search';
import { IWorkRepository, BookItem } from '../../../../shared/types/repository';
import {
  normalizeSearchString,
  matchesSearchQuery,
  calculateStringSimilarity,
} from '../../../../shared/utils/text-normalizer';

export class LocalSearchProvider implements ISearchProvider {
  public readonly id: SearchProviderId = 'local';
  public readonly name = 'My Library';
  public readonly nameAr = 'مكتبتي المحلية';
  public readonly description = 'Search physical and digital books in your local collection';
  public readonly descriptionAr = 'البحث في الكتب الورقية والرقمية المخزنة في مكتبتك الخاصة';
  public readonly icon = 'library';
  public readonly supportsDownload = false;
  public readonly supportsFullText = true;

  private enabled = true;

  constructor(private getBooksSupplier: () => BookItem[] | Promise<BookItem[]>) {}

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public async search(query: UnifiedSearchQuery, signal?: AbortSignal): Promise<UnifiedSearchResult[]> {
    if (signal?.aborted) return [];

    const rawTerm = (query.query || '').trim();
    const titleFilter = (query.title || '').trim();
    const authorFilter = (query.author || '').trim();
    const isbnFilter = (query.isbn || '').trim();

    if (!rawTerm && !titleFilter && !authorFilter && !isbnFilter) {
      return [];
    }

    const books = await Promise.resolve(this.getBooksSupplier());
    if (signal?.aborted) return [];

    const results: UnifiedSearchResult[] = [];

    const normQuery = normalizeSearchString(rawTerm);
    const normTitle = normalizeSearchString(titleFilter);
    const normAuthor = normalizeSearchString(authorFilter);
    const cleanIsbn = isbnFilter.replace(/[-\s]/g, '').toUpperCase();

    for (const book of books) {
      if (signal?.aborted) break;

      let score = 0;
      let matches = false;

      // 1. ISBN exact filter
      if (cleanIsbn) {
        const bookIsbn = (book.isbn || '').replace(/[-\s]/g, '').toUpperCase();
        if (bookIsbn && bookIsbn.includes(cleanIsbn)) {
          matches = true;
          score += 1.0;
        }
      }

      // 2. Structured title filter
      if (normTitle) {
        const bookTitleNorm = normalizeSearchString(book.title || '');
        if (bookTitleNorm.includes(normTitle)) {
          matches = true;
          score += 0.8;
        }
      }

      // 3. Structured author filter
      if (normAuthor) {
        const bookAuthorNorm = normalizeSearchString(book.author || '');
        if (bookAuthorNorm.includes(normAuthor)) {
          matches = true;
          score += 0.7;
        }
      }

      // 4. Free-text query across all book fields
      if (normQuery) {
        const bookTitleNorm = normalizeSearchString(book.title || '');
        const bookAuthorNorm = normalizeSearchString(book.author || '');
        const bookDescNorm = normalizeSearchString(book.description || '');
        const bookTagsNorm = normalizeSearchString(book.tags ? book.tags.join(' ') : '');
        const bookCatsNorm = normalizeSearchString(
          (book.categories ? book.categories.join(' ') : '') +
          ' ' +
          (book.primaryCategory ? `${book.primaryCategory.nameAr} ${book.primaryCategory.nameEn}` : '')
        );
        const bookLocationNorm = normalizeSearchString(
          `${book.room || ''} ${book.bookcase || ''} ${book.shelf || ''} ${book.shelfSection || ''}`
        );
        const bookIsbnClean = (book.isbn || '').replace(/[-\s]/g, '').toUpperCase();

        if (bookIsbnClean && bookIsbnClean.includes(normQuery.toUpperCase())) {
          matches = true;
          score += 0.95;
        } else if (bookTitleNorm === normQuery) {
          matches = true;
          score += 0.9;
        } else if (bookTitleNorm.includes(normQuery)) {
          matches = true;
          score += 0.75;
        } else if (bookAuthorNorm.includes(normQuery)) {
          matches = true;
          score += 0.65;
        } else if (matchesSearchQuery(bookTitleNorm + ' ' + bookAuthorNorm, rawTerm)) {
          matches = true;
          score += 0.6;
        } else if (bookCatsNorm.includes(normQuery) || bookTagsNorm.includes(normQuery)) {
          matches = true;
          score += 0.45;
        } else if (bookLocationNorm.includes(normQuery)) {
          matches = true;
          score += 0.4;
        } else if (bookDescNorm.includes(normQuery)) {
          matches = true;
          score += 0.3;
        }
      }

      if (matches) {
        const availableFormats: SearchFormat[] = [];
        if (book.digitalFormat) {
          availableFormats.push(book.digitalFormat as SearchFormat);
        } else if (book.filePath) {
          const ext = book.filePath.split('.').pop()?.toUpperCase();
          if (ext === 'PDF' || ext === 'EPUB' || ext === 'MOBI' || ext === 'TXT') {
            availableFormats.push(ext as SearchFormat);
          }
        }

        results.push({
          id: `local:${book.id}`,
          providerId: 'local',
          providerName: this.name,
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          publishYear: typeof book.publicationYear === 'number' ? book.publicationYear : undefined,
          language: book.language,
          isbn: book.isbn,
          coverUrl: book.coverImage,
          description: book.description,
          subjects: book.categories || [],
          availableFormats: availableFormats.length > 0 ? availableFormats : undefined,
          sourceUrl: book.filePath,
          inLibrary: true,
          localWorkId: book.id,
          matchedEditionId: book.edition,
          score: Math.min(1.0, score),
        });
      }
    }

    // Sort by relevance score descending
    results.sort((a, b) => (b.score || 0) - (a.score || 0));

    const limit = query.limit || 50;
    return results.slice(0, limit);
  }
}
