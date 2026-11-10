import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesSearchQuery,
  normalizeSearchText,
  getBookSourceBadgeType,
  isRecentBook,
  formatLocalizedNumber,
  formatVolumesCount,
  getTopAuthorsWithCounts,
  getAvailableTopicsWithCounts,
  getFeaturedBook,
  filterAndSortBooks,
  type LibraryFilterState,
  type LibrarySortState,
} from '../../src/renderer/components/library/library-filter-model';
import type { BookItem } from '../../src/shared/types/work';
import { translations } from '../../src/renderer/translations';

describe('Library Filter Model (KEY-299)', () => {
  const sampleBooks: BookItem[] = [
    {
      id: 'book-1',
      title: 'تهافت الفلاسفة',
      author: 'أبو حامد الغزالي',
      bookType: 'digital',
      digitalFormat: 'PDF',
      readingStatus: 'reading',
      readingProgress: 63,
      publicationYear: 1095,
      createdAt: new Date().toISOString(),
      categories: ['cat-phil'],
      primaryCategory: { id: 'cat-phil', nameAr: 'الفلسفة الإسلامية', nameEn: 'Islamic Philosophy' },
      tags: ['#فلسفة', '#جديد'],
      description: 'كتاب نقدي يعتبر من أهم المؤلفات في تاريخ الفكر الإسلامي.',
      coverImage: 'covers/tahafut.png',
      lendingHistory: [],
    },
    {
      id: 'book-2',
      title: 'مقدمة ابن خلدون',
      author: 'عبد الرحمن ابن خلدون',
      bookType: 'digital',
      digitalFormat: 'EPUB',
      readingStatus: 'unread',
      readingProgress: 0,
      publicationYear: 1377,
      createdAt: '2026-01-01T00:00:00Z',
      categories: ['cat-hist'],
      primaryCategory: { id: 'cat-hist', nameAr: 'التاريخ', nameEn: 'History' },
      tags: ['#تاريخ', '#عمران'],
      lendingHistory: [],
    },
    {
      id: 'book-3',
      title: 'فصل المقال فيما بين الحكمة والشريعة من الاتصال',
      author: 'ابن رشد',
      bookType: 'physical',
      readingStatus: 'completed',
      readingProgress: 100,
      publicationYear: 1179,
      createdAt: '2026-02-01T00:00:00Z',
      categories: ['cat-phil'],
      primaryCategory: { id: 'cat-phil', nameAr: 'الفلسفة الإسلامية', nameEn: 'Islamic Philosophy' },
      tags: ['#فلسفة', '#فقه'],
      room: 'المكتبة الرئيسية',
      shelf: 'A-12',
      lendingHistory: [],
    },
    {
      id: 'book-4',
      title: 'حي بن يقظان',
      author: 'ابن طفيل',
      bookType: 'physical',
      readingStatus: 'wishlist',
      publicationYear: 1180,
      createdAt: '2026-03-01T00:00:00Z',
      categories: ['cat-lit'],
      primaryCategory: { id: 'cat-lit', nameAr: 'الأدب والفلسفة', nameEn: 'Literature' },
      tags: ['#أدب', '#أمنيات'],
      lendingHistory: [],
    },
    {
      id: 'book-5',
      title: 'Why lyrics last: evolution, cognition, and Shakespeare',
      author: 'Brian Boyd',
      bookType: 'digital',
      digitalFormat: 'PDF',
      readingStatus: 'unread',
      readingProgress: 0,
      publicationYear: 2012,
      createdAt: new Date().toISOString(),
      categories: ['cat-lit'],
      primaryCategory: { id: 'cat-lit', nameAr: 'دراسات أدبية', nameEn: 'Literary Studies' },
      tags: ['#shakespeare', '#cognition'],
      lendingHistory: [],
    },
  ];

  const defaultSort: LibrarySortState = { field: 'newest', direction: 'desc' };

  it('normalizes Arabic and English queries correctly', () => {
    assert.equal(normalizeSearchText('الإسلامية'), 'الاسلاميه');
    assert.equal(normalizeSearchText('تَهَافُتُ الفَلَاسِفَةِ'), 'تهافت الفلاسفه');
    assert.equal(normalizeSearchText('SHAKESPEARE'), 'shakespeare');
  });

  it('matches multi-token search queries regardless of order and diacritics', () => {
    assert.ok(matchesSearchQuery('تهافت الفلاسفة لأبي حامد الغزالي', 'الغزالي تهافت'));
    assert.ok(matchesSearchQuery('Why lyrics last: Shakespeare', 'shakespeare lyrics'));
    assert.ok(!matchesSearchQuery('مقدمة ابن خلدون', 'فلسفة'));
  });

  it('determines source badge types accurately per Decision D2 (physical, digital, wishlist)', () => {
    assert.equal(getBookSourceBadgeType(sampleBooks[0]), 'digital');
    assert.equal(getBookSourceBadgeType(sampleBooks[1]), 'digital');
    assert.equal(getBookSourceBadgeType(sampleBooks[2]), 'physical');
    assert.equal(getBookSourceBadgeType(sampleBooks[3]), 'wishlist');
    assert.equal(getBookSourceBadgeType(sampleBooks[4]), 'digital');
  });

  it('identifies recent books ("new" badge)', () => {
    assert.ok(isRecentBook(sampleBooks[0]), 'Book with #جديد tag should be recent');
    assert.ok(!isRecentBook(sampleBooks[1]), 'Book from 2026-01 without tag is not recent');
    assert.ok(isRecentBook(sampleBooks[4]), 'Book created just now is recent');
  });

  it('formats numbers with localized digits for Arabic and English', () => {
    const arDigits = formatLocalizedNumber(28, 'ar');
    const enDigits = formatLocalizedNumber(28, 'en');

    assert.equal(enDigits, '28');
    assert.ok(arDigits === '٢٨' || arDigits === '28', `Arabic digits format: ${arDigits}`);

    assert.equal(formatVolumesCount(28, 'en'), '28 volumes');
    assert.equal(formatVolumesCount(1, 'en'), '1 volume');
    assert.ok(formatVolumesCount(28, 'ar').includes('مجلد'));
  });

  it('pins translation keys for library domain coverage', () => {
    const keys = [
      'volumesCount',
      'librarySearchFields',
      'libraryRibbonView',
      'importFolderDesc',
      'libraryDesc',
      'allCategories',
      'physicalBook',
    ] as const;
    for (const k of keys) {
      assert.ok(translations.ar[k], `Arabic key ${k} must exist`);
      assert.ok(translations.en[k], `English key ${k} must exist`);
    }
  });

  it('aggregates top authors with correct book counts', () => {
    const authors = getTopAuthorsWithCounts(sampleBooks);
    assert.ok(authors.length >= 4);
    assert.ok(authors.some((a) => a.name === 'أبو حامد الغزالي' && a.count === 1));
    assert.ok(authors.some((a) => a.name === 'عبد الرحمن ابن خلدون' && a.count === 1));
  });

  it('aggregates available topics (categories and tags) with counts', () => {
    const categories = [
      { id: 'cat-phil', nameAr: 'الفلسفة الإسلامية', nameEn: 'Islamic Philosophy' },
      { id: 'cat-hist', nameAr: 'التاريخ', nameEn: 'History' },
      { id: 'cat-lit', nameAr: 'الأدب والفلسفة', nameEn: 'Literature' },
    ];
    const topics = getAvailableTopicsWithCounts(sampleBooks, categories, 'ar');
    const phil = topics.find((t) => t.id === 'cat-phil');
    assert.ok(phil && phil.count === 2, 'Philosophy category should have 2 books');
    assert.ok(topics.some((t) => t.id === '#تاريخ'));
  });

  it('finds the featured book prioritizing in-progress reading', () => {
    const featured = getFeaturedBook(sampleBooks);
    assert.ok(featured);
    assert.equal(featured?.id, 'book-1', 'book-1 is reading with 63% progress, should be featured');
  });

  it('combines filters correctly: topic + author', () => {
    const filters: LibraryFilterState = {
      selectedTopics: ['cat-phil'],
      selectedAuthors: ['ابن رشد'],
    };
    const results = filterAndSortBooks(sampleBooks, filters, defaultSort);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'book-3');
  });

  it('combines filters correctly: search + bookType (physical)', () => {
    const filters: LibraryFilterState = {
      searchQuery: 'الحكمة',
      selectedBookType: 'physical',
    };
    const results = filterAndSortBooks(sampleBooks, filters, defaultSort);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'book-3');
  });

  it('combines filters correctly: digital format + reading status', () => {
    const filters: LibraryFilterState = {
      selectedFormat: 'PDF',
      selectedReadingStatus: 'reading',
    };
    const results = filterAndSortBooks(sampleBooks, filters, defaultSort);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'book-1');
  });

  it('combines filters correctly: location filter', () => {
    const filters: LibraryFilterState = {
      selectedLocation: 'المكتبة الرئيسية',
    };
    const results = filterAndSortBooks(sampleBooks, filters, defaultSort);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'book-3');
  });

  it('sorts books by publication year asc and desc', () => {
    const asc = filterAndSortBooks(sampleBooks, {}, { field: 'year', direction: 'asc' });
    assert.equal(asc[0].id, 'book-1', '1095 should be first');

    const desc = filterAndSortBooks(sampleBooks, {}, { field: 'year', direction: 'desc' });
    assert.equal(desc[0].id, 'book-5', '2012 should be first in desc');
  });
});
