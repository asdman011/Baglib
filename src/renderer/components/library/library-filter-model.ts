import type { BookItem } from '../../../shared/types/work';
import type { LibrarySortField, SortDirection } from '../../../shared/types/library-views';

export type SortField = LibrarySortField;

export type LibraryBookBadgeType = 'physical' | 'digital' | 'wishlist';

export interface LibraryFilterState {
  searchQuery?: string;
  selectedTopics?: string[]; // category IDs or tag names
  selectedAuthors?: string[];
  selectedReadingStatus?: string; // 'ALL' | ReadingStatus
  selectedBookType?: string; // 'ALL' | 'digital' | 'physical' | 'hybrid'
  selectedFormat?: string; // 'ALL' | DigitalFormat
  selectedStorageFilter?: 'ALL' | 'HEALTHY' | 'ATTENTION' | 'DUPLICATES';
  selectedLocation?: string;
  lendingStatus?: 'ALL' | 'AVAILABLE' | 'LENT' | 'OVERDUE';
  activeLibraryCategory?: string;
  selectedTag?: string;
}

export interface LibrarySortState {
  field: SortField;
  direction: SortDirection;
}

export interface AuthorWithCount {
  name: string;
  count: number;
}

export interface TopicWithCount {
  id: string;
  name: string;
  count: number;
  type: 'category' | 'tag';
}

/**
 * Normalizes text for search indexing and queries.
 * Strips Arabic tashkeel, normalizes alef and hamza variants, and folds case.
 */
export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFKD')
    // Remove Arabic diacritics / tashkeel
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Normalize Alef variants to bare Alef
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize Yaa variants to bare Yaa
    .replace(/[ىي]/g, 'ي')
    // Normalize Taa Marbuta to Haa
    .replace(/ة/g, 'ه')
    .trim();
}

/**
 * Checks if searchable content matches all tokens of a search query.
 */
export function matchesSearchQuery(content: string, query: string): boolean {
  if (!query || !query.trim()) return true;
  const normalizedContent = normalizeSearchText(content);
  const tokens = query
    .trim()
    .split(/\s+/)
    .map(normalizeSearchText)
    .filter(Boolean);

  if (tokens.length === 0) return true;
  return tokens.every((token) => normalizedContent.includes(token));
}

/**
 * Determines whether a book is a physical copy, digital file, or wishlist item (D2).
 */
export function getBookSourceBadgeType(book: BookItem): LibraryBookBadgeType {
  const isWishlist =
    (book.readingStatus as string) === 'wishlist' ||
    (Array.isArray(book.tags) &&
      book.tags.some(
        (t) =>
          t === '#أمنيات' ||
          t === '#wishlist' ||
          t === 'أمنيات' ||
          t.toLowerCase() === 'wishlist'
      )) ||
    (book as unknown as { sourceType?: string }).sourceType === 'wishlist' ||
    (book as unknown as { source_type?: string }).source_type === 'wishlist';

  if (isWishlist) {
    return 'wishlist';
  }

  const isPhysical =
    book.bookType === 'physical' ||
    (book as unknown as { sourceType?: string }).sourceType === 'physical' ||
    (book as unknown as { source_type?: string }).source_type === 'physical';

  if (isPhysical) {
    return 'physical';
  }

  return 'digital';
}

/**
 * Identifies if a book is recently imported or marked with a new badge.
 */
export function isRecentBook(book: BookItem, maxAgeDays = 14): boolean {
  if (
    Array.isArray(book.tags) &&
    book.tags.some(
      (t) =>
        t === '#جديد' ||
        t === '#new' ||
        t === 'جديد' ||
        t.toLowerCase() === 'new'
    )
  ) {
    return true;
  }

  if (book.createdAt) {
    const createdTime = new Date(book.createdAt).getTime();
    if (!isNaN(createdTime)) {
      const now = Date.now();
      return now - createdTime >= 0 && now - createdTime < maxAgeDays * 24 * 60 * 60 * 1000;
    }
  }

  return false;
}

/**
 * Localizes digits based on UI language.
 */
export function formatLocalizedNumber(num: number, lang: 'ar' | 'en' = 'ar'): string {
  try {
    return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(num);
  } catch {
    return String(num);
  }
}

/**
 * Builds localized volumes count (e.g., "٢٨ مجلد" / "28 volumes").
 */
export function formatVolumesCount(count: number, lang: 'ar' | 'en' = 'ar'): string {
  const digits = formatLocalizedNumber(count, lang);
  if (lang === 'ar') {
    return `${digits} مجلد`;
  }
  return `${digits} ${count === 1 ? 'volume' : 'volumes'}`;
}

/**
 * Extracts distinct authors with their corresponding book counts.
 */
export function getTopAuthorsWithCounts(books: BookItem[]): AuthorWithCount[] {
  const counts = new Map<string, number>();

  for (const b of books) {
    const author = (b.author || '').trim();
    if (!author || author === 'غير معروف' || author.toLowerCase() === 'unknown author') {
      continue;
    }
    counts.set(author, (counts.get(author) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'));
}

/**
 * Extracts distinct topics (categories and tags) with book counts.
 */
export function getAvailableTopicsWithCounts(
  books: BookItem[],
  allCategories: { id: string; nameAr: string; nameEn: string }[],
  lang: 'ar' | 'en' = 'ar'
): TopicWithCount[] {
  const topicMap = new Map<string, TopicWithCount>();

  // 1. Registered categories
  for (const cat of allCategories) {
    const name = lang === 'ar' ? cat.nameAr : cat.nameEn;
    topicMap.set(cat.id, {
      id: cat.id,
      name: name || cat.nameAr || cat.nameEn,
      count: 0,
      type: 'category',
    });
  }

  // 2. Count occurrences in books
  for (const b of books) {
    const seenCategoriesForBook = new Set<string>();
    if (b.primaryCategory?.id) seenCategoriesForBook.add(b.primaryCategory.id);
    if (Array.isArray(b.categories)) {
      for (const catId of b.categories) seenCategoriesForBook.add(catId);
    }
    for (const catId of seenCategoriesForBook) {
      if (topicMap.has(catId)) {
        topicMap.get(catId)!.count++;
      }
    }

    if (Array.isArray(b.tags)) {
      for (const tag of b.tags) {
        const cleanTag = tag.trim();
        if (!cleanTag || cleanTag === '#جديد' || cleanTag === '#new') continue;
        if (!topicMap.has(cleanTag)) {
          topicMap.set(cleanTag, {
            id: cleanTag,
            name: cleanTag.startsWith('#') ? cleanTag.slice(1) : cleanTag,
            count: 0,
            type: 'tag',
          });
        }
        topicMap.get(cleanTag)!.count++;
      }
    }
  }

  // Return topics that have at least 1 book or are standard categories, sorted by count
  return Array.from(topicMap.values())
    .filter((t) => t.count > 0 || t.type === 'category')
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, lang));
}

/**
 * Finds the featured book to display (the book in progress or most recently opened/added).
 */
export function getFeaturedBook(books: BookItem[]): BookItem | null {
  if (!books || books.length === 0) return null;

  // 1. Prioritize books currently in progress
  const inProgress = books.filter(
    (b) => b.readingStatus === 'reading' && typeof b.readingProgress === 'number'
  );
  if (inProgress.length > 0) {
    // Sort by highest progress or has description/cover
    return inProgress.sort((a, b) => (b.readingProgress || 0) - (a.readingProgress || 0))[0];
  }

  // 2. Prioritize books with a cover image and description
  const richBooks = books.filter((b) => b.coverImage && b.description);
  if (richBooks.length > 0) {
    return richBooks[0];
  }

  // 3. Fallback to first book
  return books[0];
}

/**
 * Filter and sort books according to all active criteria.
 */
export function filterAndSortBooks(
  books: BookItem[],
  filters: LibraryFilterState,
  sort: LibrarySortState
): BookItem[] {
  const seenIds = new Set<string>();
  const todayStr = new Date().toISOString().split('T')[0];

  const filtered = books.filter((b) => {
    if (!b || !b.id) return false;
    if (seenIds.has(b.id)) return false;
    seenIds.add(b.id);

    // 1. Full text search
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const searchableContent = [
        b.title,
        b.author,
        b.publisher,
        b.edition,
        b.publicationYear,
        b.isbn,
        b.shelf,
        b.room,
        b.digitalFormat,
        b.bookType,
        b.readingStatus,
        ...(Array.isArray(b.categories) ? b.categories : []),
        b.primaryCategory?.nameAr,
        b.primaryCategory?.nameEn,
        ...(Array.isArray(b.tags) ? b.tags : []),
      ]
        .filter(Boolean)
        .join(' ');

      if (!matchesSearchQuery(searchableContent, filters.searchQuery)) {
        return false;
      }
    }

    // 2. Selected Topics filter (from filter rail chips)
    if (filters.selectedTopics && filters.selectedTopics.length > 0) {
      const bookTopicIds = new Set<string>();
      if (b.primaryCategory?.id) bookTopicIds.add(b.primaryCategory.id);
      if (b.primaryCategory?.nameAr) bookTopicIds.add(b.primaryCategory.nameAr);
      if (b.primaryCategory?.nameEn) bookTopicIds.add(b.primaryCategory.nameEn);
      if (Array.isArray(b.categories)) {
        for (const c of b.categories) bookTopicIds.add(c);
      }
      if (Array.isArray(b.tags)) {
        for (const t of b.tags) {
          bookTopicIds.add(t);
          if (t.startsWith('#')) bookTopicIds.add(t.slice(1));
        }
      }

      const matchesAnyTopic = filters.selectedTopics.some((topic) =>
        bookTopicIds.has(topic) ||
        (topic.startsWith('#') && bookTopicIds.has(topic.slice(1))) ||
        bookTopicIds.has(`#${topic}`)
      );
      if (!matchesAnyTopic) return false;
    }

    // 3. Selected Authors checklist filter
    if (filters.selectedAuthors && filters.selectedAuthors.length > 0) {
      const author = (b.author || '').trim();
      if (!filters.selectedAuthors.includes(author)) {
        return false;
      }
    }

    // 4. Book Type filter (digital, physical, hybrid)
    if (filters.selectedBookType && filters.selectedBookType !== 'ALL') {
      if (filters.selectedBookType === 'digital' && b.bookType !== 'digital') return false;
      if (
        filters.selectedBookType === 'physical' &&
        b.bookType !== 'physical' &&
        b.bookType !== 'hybrid'
      ) {
        return false;
      }
      if (filters.selectedBookType === 'hybrid' && b.bookType !== 'hybrid') return false;
    }

    // 5. Reading Status filter
    if (filters.selectedReadingStatus && filters.selectedReadingStatus !== 'ALL') {
      const status = b.readingStatus || 'unread';
      if (status !== filters.selectedReadingStatus) return false;
    }

    // 6. Digital Format filter
    if (filters.selectedFormat && filters.selectedFormat !== 'ALL') {
      if (b.digitalFormat !== filters.selectedFormat) return false;
    }

    // 7. Category Dropdown filter
    if (filters.activeLibraryCategory && filters.activeLibraryCategory !== 'ALL') {
      if (b.primaryCategory?.id !== filters.activeLibraryCategory) return false;
    }

    // 8. Tag filter
    if (filters.selectedTag && filters.selectedTag !== 'ALL') {
      if (!(b.tags || []).includes(filters.selectedTag)) return false;
    }

    // 9. Lending Status filter
    if (filters.lendingStatus && filters.lendingStatus !== 'ALL') {
      const isCurrentlyLent = (b.lendingHistory || []).some((l) => !l.isReturned);
      const isOverdue = (b.lendingHistory || []).some(
        (l) => !l.isReturned && l.expectedReturnDate && l.expectedReturnDate < todayStr
      );

      if (filters.lendingStatus === 'AVAILABLE' && isCurrentlyLent) return false;
      if (filters.lendingStatus === 'LENT' && !isCurrentlyLent) return false;
      if (filters.lendingStatus === 'OVERDUE' && !isOverdue) return false;
    }

    // 10. Physical Location filter
    if (filters.selectedLocation && filters.selectedLocation !== 'ALL') {
      if (b.room !== filters.selectedLocation && b.shelf !== filters.selectedLocation) {
        return false;
      }
    }

    // 11. Storage Health filter
    if (filters.selectedStorageFilter && filters.selectedStorageFilter !== 'ALL') {
      if (filters.selectedStorageFilter === 'HEALTHY') {
        if (b.bookType === 'digital' && b.storageState && b.storageState !== 'available' && b.storageState !== 'healthy') {
          return false;
        }
      } else if (filters.selectedStorageFilter === 'ATTENTION') {
        if (
          !b.storageState ||
          (b.storageState !== 'missing' &&
            b.storageState !== 'unmounted' &&
            b.storageState !== 'corrupted')
        ) {
          return false;
        }
      } else if (filters.selectedStorageFilter === 'DUPLICATES') {
        if (b.storageState !== 'duplicate') {
          return false;
        }
      }
    }

    return true;
  });

  // Sort results
  return filtered.sort((a, b) => {
    let comparison = 0;
    const field = sort.field;

    if (field === 'title') {
      comparison = (a.title || '').localeCompare(b.title || '', 'ar');
    } else if (field === 'author') {
      comparison = (a.author || '').localeCompare(b.author || '', 'ar');
    } else if (field === 'year') {
      const yearA = parseInt(String(a.publicationYear || 0), 10) || 0;
      const yearB = parseInt(String(b.publicationYear || 0), 10) || 0;
      comparison = yearA - yearB;
    } else if (field === 'progress') {
      const progA = typeof a.readingProgress === 'number' ? a.readingProgress : -1;
      const progB = typeof b.readingProgress === 'number' ? b.readingProgress : -1;
      comparison = progA - progB;
    } else if (field === 'location') {
      const locA = [a.room, a.shelf].filter(Boolean).join(' ');
      const locB = [b.room, b.shelf].filter(Boolean).join(' ');
      comparison = locA.localeCompare(locB, 'ar');
    } else if (field === 'category') {
      const catA = a.primaryCategory?.nameAr || a.categories?.[0] || '';
      const catB = b.primaryCategory?.nameAr || b.categories?.[0] || '';
      comparison = catA.localeCompare(catB, 'ar');
    } else if (field === 'status') {
      const statusOrder: Record<string, number> = { reading: 3, unread: 2, completed: 1 };
      const valA = statusOrder[a.readingStatus || 'unread'] || 0;
      const valB = statusOrder[b.readingStatus || 'unread'] || 0;
      comparison = valA - valB;
    } else if (field === 'format') {
      const fmtA = a.digitalFormat || (a.bookType === 'digital' ? 'PDF' : 'ورقي');
      const fmtB = b.digitalFormat || (b.bookType === 'digital' ? 'PDF' : 'ورقي');
      comparison = fmtA.localeCompare(fmtB, 'ar');
    } else {
      // Default: 'newest'
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      comparison = timeA - timeB;
    }

    return sort.direction === 'asc' ? comparison : -comparison;
  });
}

export interface ActiveFilterChipItem {
  id: string;
  type:
    | 'search'
    | 'topic'
    | 'author'
    | 'status'
    | 'type'
    | 'format'
    | 'storage'
    | 'location'
    | 'lending'
    | 'category'
    | 'tag';
  label: string;
  onClear: Partial<LibraryFilterState>;
}

/**
 * Counts the number of active advanced filters (excluding the basic search query).
 * Used for the badge on the "Advanced filters" button (KEY-310).
 */
export function countActiveAdvancedFilters(filters: LibraryFilterState): number {
  let count = 0;
  if (filters.selectedTopics && filters.selectedTopics.length > 0) {
    count += filters.selectedTopics.length;
  }
  if (filters.selectedAuthors && filters.selectedAuthors.length > 0) {
    count += filters.selectedAuthors.length;
  }
  if (filters.selectedReadingStatus && filters.selectedReadingStatus !== 'ALL') {
    count++;
  }
  if (filters.selectedBookType && filters.selectedBookType !== 'ALL') {
    count++;
  }
  if (filters.selectedFormat && filters.selectedFormat !== 'ALL') {
    count++;
  }
  if (filters.selectedStorageFilter && filters.selectedStorageFilter !== 'ALL') {
    count++;
  }
  if (filters.selectedLocation && filters.selectedLocation !== 'ALL') {
    count++;
  }
  if (filters.lendingStatus && filters.lendingStatus !== 'ALL') {
    count++;
  }
  if (filters.activeLibraryCategory && filters.activeLibraryCategory !== 'ALL') {
    count++;
  }
  if (filters.selectedTag && filters.selectedTag !== 'ALL') {
    count++;
  }
  return count;
}

/**
 * Builds the list of active filter chips to display directly below the search bar (KEY-310).
 */
export function getActiveFilterChipsList(
  filters: LibraryFilterState,
  options?: {
    topicNameResolver?: (topicId: string) => string;
    labels?: {
      physical?: string;
      digital?: string;
      hybrid?: string;
      readingStatusPrefix?: string;
      locationPrefix?: string;
      lendingPrefix?: string;
      storagePrefix?: string;
      statusUnread?: string;
      statusReading?: string;
      statusCompleted?: string;
    };
  }
): ActiveFilterChipItem[] {
  const chips: ActiveFilterChipItem[] = [];

  // 1. Search Query
  if (filters.searchQuery && filters.searchQuery.trim()) {
    chips.push({
      id: 'search',
      type: 'search',
      label: `"${filters.searchQuery.trim()}"`,
      onClear: { searchQuery: '' },
    });
  }

  // 2. Selected Topics
  if (Array.isArray(filters.selectedTopics)) {
    for (const topicId of filters.selectedTopics) {
      const label = options?.topicNameResolver ? options.topicNameResolver(topicId) : topicId;
      chips.push({
        id: `topic-${topicId}`,
        type: 'topic',
        label,
        onClear: {
          selectedTopics: filters.selectedTopics.filter((id) => id !== topicId),
        },
      });
    }
  }

  // 3. Selected Authors
  if (Array.isArray(filters.selectedAuthors)) {
    for (const author of filters.selectedAuthors) {
      chips.push({
        id: `author-${author}`,
        type: 'author',
        label: author,
        onClear: {
          selectedAuthors: filters.selectedAuthors.filter((a) => a !== author),
        },
      });
    }
  }

  // 4. Reading Status
  if (filters.selectedReadingStatus && filters.selectedReadingStatus !== 'ALL') {
    const status = filters.selectedReadingStatus;
    let label = status;
    if (status === 'unread' && options?.labels?.statusUnread) label = options.labels.statusUnread;
    else if (status === 'reading' && options?.labels?.statusReading) label = options.labels.statusReading;
    else if (status === 'completed' && options?.labels?.statusCompleted) label = options.labels.statusCompleted;

    const prefix = options?.labels?.readingStatusPrefix ? `${options.labels.readingStatusPrefix}: ` : '';
    chips.push({
      id: 'status',
      type: 'status',
      label: `${prefix}${label}`,
      onClear: { selectedReadingStatus: 'ALL' },
    });
  }

  // 5. Book / Material Type
  if (filters.selectedBookType && filters.selectedBookType !== 'ALL') {
    let typeLabel = filters.selectedBookType;
    if (filters.selectedBookType === 'physical' && options?.labels?.physical) {
      typeLabel = options.labels.physical;
    } else if (filters.selectedBookType === 'digital' && options?.labels?.digital) {
      typeLabel = options.labels.digital;
    } else if (filters.selectedBookType === 'hybrid' && options?.labels?.hybrid) {
      typeLabel = options.labels.hybrid;
    }
    chips.push({
      id: 'bookType',
      type: 'type',
      label: typeLabel,
      onClear: { selectedBookType: 'ALL' },
    });
  }

  // 6. Format
  if (filters.selectedFormat && filters.selectedFormat !== 'ALL') {
    chips.push({
      id: 'format',
      type: 'format',
      label: filters.selectedFormat,
      onClear: { selectedFormat: 'ALL' },
    });
  }

  // 7. Storage Filter
  if (filters.selectedStorageFilter && filters.selectedStorageFilter !== 'ALL') {
    const prefix = options?.labels?.storagePrefix ? `${options.labels.storagePrefix}: ` : '';
    chips.push({
      id: 'storage',
      type: 'storage',
      label: `${prefix}${filters.selectedStorageFilter}`,
      onClear: { selectedStorageFilter: 'ALL' },
    });
  }

  // 8. Physical Location
  if (filters.selectedLocation && filters.selectedLocation !== 'ALL') {
    const prefix = options?.labels?.locationPrefix ? `${options.labels.locationPrefix}: ` : '';
    chips.push({
      id: 'location',
      type: 'location',
      label: `${prefix}${filters.selectedLocation}`,
      onClear: { selectedLocation: 'ALL' },
    });
  }

  // 9. Lending Status
  if (filters.lendingStatus && filters.lendingStatus !== 'ALL') {
    const prefix = options?.labels?.lendingPrefix ? `${options.labels.lendingPrefix}: ` : '';
    chips.push({
      id: 'lending',
      type: 'lending',
      label: `${prefix}${filters.lendingStatus}`,
      onClear: { lendingStatus: 'ALL' },
    });
  }

  // 10. Tag
  if (filters.selectedTag && filters.selectedTag !== 'ALL') {
    chips.push({
      id: 'tag',
      type: 'tag',
      label: filters.selectedTag,
      onClear: { selectedTag: 'ALL' },
    });
  }

  return chips;
}

/** KEY-328: books with no category and no topic tag cannot appear under any topic filter. */
export function booksWithoutTopic(books: BookItem[]): BookItem[] {
  return books.filter(book => !book.primaryCategory?.id
    && !(Array.isArray(book.categories) && book.categories.length > 0)
    && !(Array.isArray(book.tags) && book.tags.some(tag => { const clean = tag.trim(); return clean && clean !== '#جديد' && clean !== '#new'; })));
}
