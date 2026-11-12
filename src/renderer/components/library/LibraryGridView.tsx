'use client';

import React, { createElement, useState, useRef, useMemo, useEffect, useLayoutEffect, useCallback } from 'react';
import { ContextMenu } from '../ui/ContextMenu';
import { Menu } from '../ui/Menu';
import { getCardActions, type CardActionIcon } from './library-card-actions';
import type { MenuItemProps } from '../ui/Menu';
import { LibraryBookCard } from './LibraryBookCard';
import {
  BookOpen,
  Search,
  MapPin,
  Info,
  FolderOpen,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  LayoutGrid,
  List,
  Trash2,
  FileText,
  RefreshCw,
  SlidersHorizontal,
  Bookmark,
  ArrowLeftRight,
  History,
  FilePenLine,
  FolderTree,
  Tags,
  BookMarked,
  Heart,
  CopyCheck,
  Download,
  type LucideIcon,
} from 'lucide-react';
import { recentlyOpenedBooks, recentlyImportedBooks, type RecentReadingActivity } from '../../../shared/recent-books';
import { isTextEntry } from '../actions/context-actions';
import { shortcutForEvent } from '../actions/shortcuts';
import { libraryNavigationIndex } from './library-keyboard';
import { bookCountLabel } from '../../utils/book-count';
import { BookItem } from '../../types/library';

/** One icon per card action, so the right-click and ⋯ menus are scannable (KEY-308). */
const CARD_ACTION_ICONS: Record<CardActionIcon, LucideIcon> = {
  BookOpen, Info, Bookmark, ArrowLeftRight, Trash2, History, FilePenLine, FolderTree, Tags, BookMarked, Heart, CopyCheck, FolderOpen, Download,
};
import { BookDetailModal } from './BookDetailModal';
import { BookVolumeBadge } from './BookVolumesPanel';
import { OnlineLibraryHub } from './OnlineLibraryHub';
import { StorageManagerModal } from './StorageManagerModal';
import { TrashBinModal } from './TrashBinModal';
import { CloudSyncModal } from '../sync/CloudSyncModal';
import { OPDSHubModal } from '../opds/OPDSHubModal';
import { WebClipperModal } from '../clipper/WebClipperModal';
import { ReadingStatisticsModal } from '../statistics/ReadingStatisticsModal';
import { AppLockModal } from '../security/AppLockModal';
import { LendBookModal } from './LendBookModal';
import { ReturnBookModal } from './ReturnBookModal';
import { PaginationBar } from './PaginationBar';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { StirlingToolsHub } from '../pdf-workstation/StirlingToolsHub';
import { MetadataAuditModal } from './MetadataAuditModal';
import { LibraryBookCover } from './LibraryBookCover';
import { FeaturedBookCard } from './FeaturedBookCard';
import { LibraryFilterRail } from './LibraryFilterRail';
import { LibraryMoreMenu } from './LibraryMoreMenu';
import { useToast } from '../ui/Toast';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Chip } from '../ui/Chip';
import { Sheet } from '../ui/Sheet';
import {
  getBookSourceBadgeType,
  getFeaturedBook,
  filterAndSortBooks,
  countActiveAdvancedFilters,
  getActiveFilterChipsList,
  type LibraryFilterState,
  type LibrarySortState,
  formatLocalizedNumber,
  booksWithoutTopic,
} from './library-filter-model';
import type { TranslationKey } from '../../translations';
import {
  computeScrollHeaderState,
  type ScrollHeaderState,
} from './library-scroll-header';
import { useWorkspace } from '../context/WorkspaceContext';
import { renderPdfPage } from '../../utils/pdf-page-renderer';
import { resolveDroppedFilePath, localAssetUrl } from '../../utils/file-path-helper';
import { routeBookDrop } from '../../utils/book-drop';
import type {
  CardDensity,
  ListDensity,
  ListColumnKey,
  LibrarySortField,
} from '../../../shared/types/library-views';

export type SortField = LibrarySortField;
export type SortDirection = 'asc' | 'desc';

export const LibraryGridView: React.FC = () => {
  const {
    books,
    booksLoading,
    booksError,
    refreshBooks,
    addBook,
    updateBook,
    deleteBook,
    updateBookReadingStatus,
    openBookForReading,
    t,
    lang,
    activeLibraryCategory,
    setActiveLibraryCategory,
  } = useWorkspace();
  const [recentView, setRecentView] = useState<'all' | 'opened' | 'imported'>('all');
  const [recentActivity, setRecentActivity] = useState<RecentReadingActivity[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState(false);
  const [recentRevision, setRecentRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    const activityRequest = window.electronAPI?.reader?.getRecentActivity?.();
    Promise.resolve(activityRequest ?? []).then(activity => {
      if (alive) {
        setRecentActivity(activity);
        setRecentError(false);
      }
    }).catch(() => {
      if (alive) setRecentError(true);
    }).finally(() => {
      if (alive) setRecentLoading(false);
    });
    return () => { alive = false; };
  }, [books, recentRevision]);
  const changeRecentView = (view: 'all' | 'opened' | 'imported') => {
    setRecentView(view);
    setSelectedBookIds(new Set());
    lastSelectedBookIdRef.current = null;
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [isStirlingHubOpen, setIsStirlingHubOpen] = useState(false);

  // View Mode & Densities (Story 9: 9.4, 9.5)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [cardDensity, setCardDensity] = useState<CardDensity>('comfortable');
  const [listDensity, setListDensity] = useState<ListDensity>('normal');
  const [visibleColumns, setVisibleColumns] = useState<ListColumnKey[]>([
    'cover',
    'title',
    'category',
    'format',
    'location',
    'status',
    'actions',
  ]);

  // Pagination State (Story 9: 9.1, 9.2)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(24);

  // Batch Multi-Select State (Story 9: 9.6)
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const lastSelectedBookIdRef = useRef<string | null>(null);

  // Trash Bin & Undo Deletion State (KEY-45)
  const [isTrashModalOpen, setIsTrashModalOpen] = useState<boolean>(false);
  const [trashCount, setTrashCount] = useState<number>(0);
  const { showToast } = useToast();
  const feedbackError = () => showToast({ message: t('feedbackActionFailed'), type: 'danger' });
  const setUndoToast = (toast: { id: string; message: string; onUndo: () => Promise<void> }) => {
    showToast({ message: toast.message, duration: 8000, action: {
      label: t('undo'),
      onClick: async () => { try { await toast.onUndo(); } catch { feedbackError(); } },
    } });
  };

  // Scalable Filter States
  const [selectedBookType, setSelectedBookType] = useState<string>('ALL');
  const [selectedReadingStatus, setSelectedReadingStatus] = useState<string>('ALL');
  const [selectedFormat, setSelectedFormat] = useState<string>('ALL');
  const [selectedStorageFilter, setSelectedStorageFilter] = useState<'ALL' | 'HEALTHY' | 'ATTENTION' | 'DUPLICATES'>('ALL');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [lendingStatus, setLendingStatus] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('newest');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState<boolean>(false);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState<boolean>(false);
  const [scrollHeader, setScrollHeader] = useState<ScrollHeaderState>({
    isCollapsed: false,
    lastScrollTop: 0,
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerFocusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const previous = headerFocusRef.current;
    if (scrollHeader.isCollapsed || !previous) return;
    headerFocusRef.current = null;
    const label = previous.getAttribute('aria-label');
    const replacement = Array.from(document.querySelectorAll<HTMLElement>('[data-library-controls] input, [data-library-controls] button, [data-library-controls] select'))
      .find(control => control.tagName === previous.tagName && control.getAttribute('aria-label') === label);
    replacement?.focus({ preventScroll: true });
  }, [scrollHeader.isCollapsed]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleNativeScroll = () => {
      const st = el.scrollTop;
      setScrollHeader((prev) => computeScrollHeaderState(prev, st));
    };
    el.addEventListener('scroll', handleNativeScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleNativeScroll);
  }, []);

  // Load View Preferences from SQLite app_settings on mount (Story 9: 9.7)
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.electronAPI?.settings?.getViewPreferences === 'function') {
      (window).electronAPI.settings.getViewPreferences().then((prefs) => {
        if (prefs) {
          if (prefs.viewMode) setViewMode(prefs.viewMode);
          if (prefs.cardDensity) setCardDensity(prefs.cardDensity);
          if (prefs.listDensity) setListDensity(prefs.listDensity);
          if (Array.isArray(prefs.visibleColumns) && prefs.visibleColumns.length > 0) {
            setVisibleColumns(prefs.visibleColumns);
          }
          if (prefs.sortBy) setSortField(prefs.sortBy);
          if (prefs.sortDirection) setSortDirection(prefs.sortDirection);
          if (prefs.pageSize) setPageSize(prefs.pageSize);
        }
      }).catch((e) => console.warn('[LibraryGridView] Failed to load view preferences:', e));
    }
  }, []);

  // Persist View Preferences helper (Story 9: 9.7)
  const persistPreferences = (updates: Partial<{
    viewMode: 'grid' | 'list';
    cardDensity: CardDensity;
    listDensity: ListDensity;
    visibleColumns: ListColumnKey[];
    sortBy: SortField;
    sortDirection: SortDirection;
    pageSize: number;
  }>) => {
    if (typeof window !== 'undefined' && typeof window.electronAPI?.settings?.saveViewPreferences === 'function') {
      (window).electronAPI.settings.saveViewPreferences(updates).catch((e) =>
        console.warn('[LibraryGridView] Failed to save view preferences:', e)
      );
    }
  };

  // Reset to first page whenever any filter or search changes
  const [previousResetInputs1, setPreviousResetInputs1] = useState<readonly unknown[] | null>(null);
  const resetInputs1 = [
    recentView,
    searchQuery,
    selectedTopics,
    selectedAuthors,
    selectedBookType,
    selectedReadingStatus,
    selectedFormat,
    selectedStorageFilter,
    activeLibraryCategory,
    selectedTag,
    lendingStatus,
    selectedLocation,
    sortField,
    sortDirection,
  ];
  if (previousResetInputs1 === null || resetInputs1.some((value, index) => !Object.is(value, previousResetInputs1[index]))) {
    setPreviousResetInputs1(resetInputs1);

    setCurrentPage(1);

  }

  // Quick Lending / Return modals for cards and table rows
  const [quickLendBook, setQuickLendBook] = useState<BookItem | null>(null);
  const [quickReturnBook, setQuickReturnBook] = useState<BookItem | null>(null);

  // Collect unique rooms and shelves for the location filter
  const availableLocations = useMemo(() => {
    const locSet = new Set<string>();
    for (const b of books) {
      if (b.room && b.room.trim()) locSet.add(b.room.trim());
      if (b.shelf && b.shelf.trim()) locSet.add(b.shelf.trim());
    }
    return Array.from(locSet).sort();
  }, [books]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal States
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'physical' | 'classification' | 'lending'>('info');
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isNewBook, setIsNewBook] = useState(false);
  const setSaveToast = (message: string | null) => { if (message) showToast({ message, type: 'success' }); };
  const setDropNotice = (notice: { text: string; error: boolean } | null) => {
    if (notice) showToast({ message: notice.text, type: notice.error ? 'danger' : 'success' });
  };
  const [isImportingBook, setIsImportingBook] = useState(false);
  const dropImporting = useRef(false);
  const [importMessage, setImportMessage] = useState<string>('');
  const [isOnlineHubOpen, setIsOnlineHubOpen] = useState(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const { isImportWizardOpen, setIsImportWizardOpen, setDroppedImportPaths } = useWorkspace();
  const [isCloudSyncModalOpen, setIsCloudSyncModalOpen] = useState(false);
  const [isOpdsHubOpen, setIsOpdsHubOpen] = useState(false);
  const [isWebClipperOpen, setIsWebClipperOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isLockScreenActive, setIsLockScreenActive] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounterRef = useRef(0);

  // Refresh trash count on mount and when books change (KEY-45)
  const refreshTrashCount = useCallback(async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.getTrashCount) {
      try {
        const count = await window.electronAPI.getTrashCount();
        setTrashCount(Number(count) || 0);
      } catch {
        setTrashCount(0);
      }
    }
  }, []);

  useEffect(() => {
    let alive = true;
    if (typeof window !== 'undefined' && window.electronAPI?.getTrashCount) {
      window.electronAPI.getTrashCount().then((count) => {
        if (alive) setTrashCount(Number(count) || 0);
      }).catch(() => {
        if (alive) setTrashCount(0);
      });
    }
    return () => {
      alive = false;
    };
  }, [books]);

  // App Lock Security check on mount and periodic idle monitoring
  useEffect(() => {
    if (typeof window !== 'undefined' && (window).electronAPI?.appLock) {
      (window).electronAPI.appLock.getLockState().then((state) => {
        if (state && state.enabled && state.isLocked) {
          setIsLockScreenActive(true);
        }
      }).catch((e) => console.warn('[LibraryGridView] App lock initial check error:', e));

      const interval = setInterval(() => {
        (window).electronAPI.appLock.checkIdleTimeout().then((timedOut: boolean) => {
          if (timedOut) {
            setIsLockScreenActive(true);
          }
        }).catch((e) => console.warn('[LibraryGridView] Idle timeout check error:', e));
      }, 30000);

      return () => clearInterval(interval);
    }
  }, []);

  // Compute digital books with storage issues (missing, unmounted, corrupted, duplicate)
  const storageIssueCount = useMemo(() => {
    return books.filter(
      (b) =>
        b.bookType === 'digital' &&
        (b.storageState === 'missing' ||
          b.storageState === 'unmounted' ||
          b.storageState === 'corrupted' ||
          b.storageState === 'duplicate')
    ).length;
  }, [books]);

  // Fetch all categories for filter and modal
  const [allCategories, setAllCategories] = useState<{ id: string, nameAr: string, nameEn: string }[]>([]);
  useEffect(() => {
    async function fetchCats() {
      if (typeof window !== 'undefined' && window.electronAPI) {
        try {
          const tree = await window.electronAPI.getCategoryTree() as import('../../../shared/types/category').CategoryNode[];
          const flat: { id: string, nameAr: string, nameEn: string }[] = [];
          const flatten = (nodes: import('../../../shared/types/category').CategoryNode[]) => {
            for (const n of nodes) {
              flat.push({ id: n.id, nameAr: n.nameAr, nameEn: n.nameEn });
              if (n.children && n.children.length > 0) flatten(n.children);
            }
          };
          flatten(tree);
          setAllCategories(flat);
        } catch (e) {
          console.error(e);
        }
      }
    }
    fetchCats();
  }, []);

  // Handle Interactive Header Sorting
  const handleHeaderSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'newest' || field === 'year' ? 'desc' : 'asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField === field) {
      return sortDirection === 'asc' ? (
        <ArrowUp className="w-3.5 h-3.5 text-primary-text shrink-0" />
      ) : (
        <ArrowDown className="w-3.5 h-3.5 text-primary-text shrink-0" />
      );
    }
    return <ArrowUpDown className="w-3 h-3 text-muted/40 group-hover:text-muted shrink-0 transition-colors" />;
  };

  // Scalable Multi-dimensional Filter & Search Engine
  const filterState: LibraryFilterState = useMemo(() => ({
    searchQuery,
    selectedTopics,
    selectedAuthors,
    selectedReadingStatus,
    selectedBookType,
    selectedFormat,
    selectedStorageFilter,
    selectedLocation,
    lendingStatus: lendingStatus as 'ALL' | 'AVAILABLE' | 'LENT' | 'OVERDUE',
    activeLibraryCategory,
    selectedTag,
  }), [
    searchQuery,
    selectedTopics,
    selectedAuthors,
    selectedReadingStatus,
    selectedBookType,
    selectedFormat,
    selectedStorageFilter,
    selectedLocation,
    lendingStatus,
    activeLibraryCategory,
    selectedTag,
  ]);

  const sortState: LibrarySortState = useMemo(() => ({
    field: sortField,
    direction: sortDirection,
  }), [sortField, sortDirection]);

  const recentBooks = useMemo(() => {
    if (recentView === 'opened') return recentlyOpenedBooks(books, recentActivity);
    if (recentView === 'imported') return recentlyImportedBooks(books);
    return books;
  }, [books, recentView, recentActivity]);
  const filteredAndSortedBooks = useMemo(() => {
    const filtered = filterAndSortBooks(recentBooks, filterState, sortState);
    if (recentView === 'all') return filtered;
    const matchingIds = new Set(filtered.map(book => book.id));
    return recentBooks.filter(book => matchingIds.has(book.id));
  }, [recentBooks, recentView, filterState, sortState]);
  const booksToAudit = useMemo(() => {
    if (selectedBookIds.size > 0) return books.filter(book => selectedBookIds.has(book.id));
    return recentView === 'all' ? books : filteredAndSortedBooks;
  }, [books, selectedBookIds, recentView, filteredAndSortedBooks]);

  const featuredBook = useMemo(() => {
    return getFeaturedBook(books);
  }, [books]);

  const collectionTitle = useMemo(() => {
    if (activeLibraryCategory && activeLibraryCategory !== 'ALL') {
      const cat = allCategories.find((c) => c.id === activeLibraryCategory);
      if (cat) return lang === 'ar' ? cat.nameAr : cat.nameEn;
    }
    if (selectedTopics.length === 1) {
      const cat = allCategories.find((c) => c.id === selectedTopics[0]);
      if (cat) return lang === 'ar' ? cat.nameAr : cat.nameEn;
      return selectedTopics[0].startsWith('#') ? selectedTopics[0].slice(1) : selectedTopics[0];
    }
    if (selectedTag && selectedTag !== 'ALL') {
      return selectedTag.startsWith('#') ? selectedTag.slice(1) : selectedTag;
    }
    if (searchQuery && searchQuery.trim()) {
      return `"${searchQuery.trim()}"`;
    }
    return t('allBooksTitle') || t('libraryTitle');
  }, [activeLibraryCategory, selectedTopics, selectedTag, searchQuery, allCategories, lang, t]);

  const advancedFilterCount = useMemo(() => {
    return countActiveAdvancedFilters(filterState);
  }, [filterState]);

  const activeChips = useMemo(() => {
    return getActiveFilterChipsList(filterState, {
      topicNameResolver: (topicId) => {
        const cat = allCategories.find((c) => c.id === topicId);
        if (cat) return lang === 'ar' ? cat.nameAr : cat.nameEn;
        return topicId;
      },
      labels: {
        physical: t('badgePhysical'),
        digital: t('badgeDigital'),
        readingStatusPrefix: t('colStatus') || 'الحالة',
        locationPrefix: t('sortLocation') || 'الموقع',
        lendingPrefix: t('filterLendingAll') || 'الإعارة',
        storagePrefix: t('storageManagerTitle') || 'التخزين',
        statusUnread: t('statusUnread') || 'لم يُقرأ',
        statusReading: t('statusReading') || 'قيد القراءة',
        statusCompleted: t('statusCompleted') || 'مكتمل',
      },
    });
  }, [filterState, allCategories, lang, t]);

  const handleFilterChange = (updates: Partial<LibraryFilterState>) => {
    if (updates.searchQuery !== undefined) setSearchQuery(updates.searchQuery);
    if (updates.selectedTopics !== undefined) setSelectedTopics(updates.selectedTopics);
    if (updates.selectedAuthors !== undefined) setSelectedAuthors(updates.selectedAuthors);
    if (updates.selectedReadingStatus !== undefined) setSelectedReadingStatus(updates.selectedReadingStatus);
    if (updates.selectedBookType !== undefined) setSelectedBookType(updates.selectedBookType);
    if (updates.selectedFormat !== undefined) setSelectedFormat(updates.selectedFormat);
    if (updates.selectedStorageFilter !== undefined) setSelectedStorageFilter(updates.selectedStorageFilter);
    if (updates.selectedLocation !== undefined) setSelectedLocation(updates.selectedLocation);
    if (updates.lendingStatus !== undefined) setLendingStatus(updates.lendingStatus);
    if (updates.activeLibraryCategory !== undefined) setActiveLibraryCategory(updates.activeLibraryCategory);
    if (updates.selectedTag !== undefined) setSelectedTag(updates.selectedTag);
    setCurrentPage(1);
  };

  const handleSortChange = (newSort: LibrarySortState) => {
    setSortField(newSort.field);
    setSortDirection(newSort.direction);
    persistPreferences({ sortBy: newSort.field, sortDirection: newSort.direction });
  };

  const unclassifiedBooks = useMemo(() => booksWithoutTopic(books), [books]);
  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedTopics([]);
    setSelectedAuthors([]);
    setSelectedReadingStatus('ALL');
    setSelectedBookType('ALL');
    setSelectedFormat('ALL');
    setSelectedStorageFilter('ALL');
    setActiveLibraryCategory('ALL');
    setSelectedTag('ALL');
    setLendingStatus('ALL');
    setSelectedLocation('ALL');
    setCurrentPage(1);
  };

  // Pagination Calculations (Story 9: 9.1, 9.2)
  const totalCount = filteredAndSortedBooks.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedBooks = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredAndSortedBooks.slice(start, start + pageSize);
  }, [filteredAndSortedBooks, safeCurrentPage, pageSize]);

  // Batch Selection Helpers with Shift-Click Range Support (Story 9: 9.6 / KEY-44)
  const handleToggleSelectBook = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isShift = e?.shiftKey;

    setSelectedBookIds((prev) => {
      const next = new Set(prev);

      if (isShift && lastSelectedBookIdRef.current && lastSelectedBookIdRef.current !== id) {
        const ids = paginatedBooks.map((b) => b.id);
        const startIdx = ids.indexOf(lastSelectedBookIdRef.current);
        const endIdx = ids.indexOf(id);

        if (startIdx !== -1 && endIdx !== -1) {
          const [low, high] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = low; i <= high; i++) {
            next.add(ids[i]);
          }
          lastSelectedBookIdRef.current = id;
          return next;
        }
      }

      if (next.has(id)) {
        next.delete(id);
        lastSelectedBookIdRef.current = null;
      } else {
        next.add(id);
        lastSelectedBookIdRef.current = id;
      }
      return next;
    });
  };

  const isAllPageSelected = useMemo(() => {
    if (paginatedBooks.length === 0) return false;
    return paginatedBooks.every((b) => selectedBookIds.has(b.id));
  }, [paginatedBooks, selectedBookIds]);

  const handleToggleSelectAllOnPage = () => {
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      if (isAllPageSelected) {
        paginatedBooks.forEach((b) => next.delete(b.id));
      } else {
        paginatedBooks.forEach((b) => next.add(b.id));
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedBookIds(new Set());
  };

  // Safe book opener that intercepts missing, unmounted, or corrupted files
  const handleSafeOpenBook = (book: BookItem) => {
    if (
      book.bookType === 'digital' &&
      (book.storageState === 'missing' ||
        book.storageState === 'unmounted' ||
        book.storageState === 'corrupted')
    ) {
      setSelectedBook(book);
      setIsStorageModalOpen(true);
      setSaveToast(
        book.storageState === 'corrupted'
          ? t('storageCorruptedWarning')
          : t('storageMissingWarning')
      );

      return;
    }
    openBookForReading(book);
  };

  const handleSaveBook = (updatedBook: BookItem) => {
    if (isNewBook) {
      addBook(updatedBook);
    } else {
      updateBook(updatedBook);
    }
    setSaveToast(t('feedbackSaved'));

  };

  const handleDeleteBook = async (id: string) => {
    try { await deleteBook(id); } catch { feedbackError(); return; }
    setIsDetailModalOpen(false);
    setIsNewBook(false);
    void refreshTrashCount();

    // Floating Interactive Undo Prompt (KEY-45)
    setUndoToast({
      id: String(Date.now()),
      message: t('bookMovedToTrash'),
      onUndo: async () => {
        if (typeof window !== 'undefined' && window.electronAPI?.restoreBook) {
          await window.electronAPI.restoreBook(id);
          await refreshBooks();
          void refreshTrashCount();
          setSaveToast(t('bookRestored'));

        }
      },
    });
  };

  const handleAddNewBook = useCallback(() => {
    const newBook: BookItem = {
      id: `work-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: t('newPhysicalBookDefaultTitle'),
      author: t('newMaterialDefaultAuthor'),
      language: t('newMaterialDefaultLanguage'),
      categories: [],
      tags: ['#جديد'],
      workType: 'book',
      workTypeId: 'wt-book',
      bookType: 'physical',
      readingStatus: 'unread',
      lendingHistory: [],
      shelf: '',
      room: '',
    };
    setSelectedBook(newBook);
    setIsNewBook(true);
    setIsDetailModalOpen(true);
  }, [t, setSelectedBook, setIsNewBook, setIsDetailModalOpen]);

  useEffect(() => {
    const handler = () => {
      handleAddNewBook();
    };
    window.addEventListener('baglib:add-physical-book', handler);
    return () => window.removeEventListener('baglib:add-physical-book', handler);
  }, [handleAddNewBook]);

  /** KEY-259: the cover photo proposes the entry; the reader reviews it in the usual form before saving. */
  const handleAddFromCover = async () => {
    try {
      const proposal = await window.electronAPI.coverPhoto.propose();
      if (!proposal) return;
      const match = proposal.match;
      const newBook: BookItem = {
        id: `work-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: match?.title || proposal.title || t('coverPhotoUntitled'),
        author: match?.authors?.join('، ') || proposal.author || t('newMaterialDefaultAuthor'),
        publisher: match?.publisher || undefined,
        language: /[\u0600-\u06FF]/u.test(proposal.title) ? 'العربية' : 'English',
        categories: [],
        tags: [],
        workType: 'book',
        workTypeId: 'wt-book',
        bookType: 'physical',
        readingStatus: 'unread',
        lendingHistory: [],
        shelf: '',
        room: '',
        coverImage: localAssetUrl(proposal.cover),
      };
      setSelectedBook(newBook);
      setIsNewBook(true);
      setIsDetailModalOpen(true);
      setSaveToast(t(proposal.title ? 'coverPhotoReview' : 'coverPhotoNoText'));

    } catch {
      setSaveToast(t('coverPhotoFailed'));

    }
  };

  // Reusable Digital File Ingestion with Offline Metadata Discovery
  const importDigitalBookFromFile = async (fullPath: string, fileNameWithExt: string, fileSize?: number): Promise<BookItem | null> => {
    const ext = fileNameWithExt.split('.').pop()?.toUpperCase() || 'PDF';
    const fileName = fileNameWithExt.replace(/\.[^/.]+$/, "");

    let discoveredTitle = fileName;
    let discoveredAuthor = t('noAuthor');
    let discoveredPublisher: string | undefined;
    let discoveredYear: number | string | undefined;
    let discoveredIsbn: string | undefined;
    let discoveredCover: string | undefined;
    let discoveredEdition: string | undefined;
    let discoveredPagesCount: number | undefined;
    let discoveredDescription: string | undefined;
    let discoveredLanguage: string | undefined;

    setIsImportingBook(true);
    setImportMessage(t('libraryOfflineImportProgress'));

    let discoveryResult: Awaited<ReturnType<typeof window.electronAPI.discoverMetadata>> | null = null;

    try {
      const windowAPI = (window).electronAPI;
      const extractor = windowAPI?.extractOfflineMetadata || windowAPI?.discoverMetadata;
      if (extractor) {
        try {
          const discovery = await extractor({
            filePath: fullPath,
            filename: fileNameWithExt,
            offlineOnly: true,
          });
          if (discovery) {
            discoveryResult = discovery;
            if (discovery.title) discoveredTitle = discovery.title;
            if (discovery.authors && discovery.authors.length > 0) {
              discoveredAuthor = discovery.authors.join('، ');
            } else {
              const isArabic =
                discovery.language?.toLowerCase().startsWith('ar') ||
                discovery.language === 'العربية' ||
                /[\u0600-\u06FF]/.test(discoveredTitle) ||
                lang === 'ar';
              discoveredAuthor = isArabic ? 'غير معروف' : 'Unknown Author';
            }
            if (discovery.publisher) discoveredPublisher = discovery.publisher;
            if (discovery.publicationYear) discoveredYear = discovery.publicationYear;
            if (discovery.isbn) discoveredIsbn = discovery.isbn;
            if (discovery.coverUrl) discoveredCover = discovery.coverUrl;
            if (discovery.edition) discoveredEdition = discovery.edition;
            if (discovery.pagesCount) discoveredPagesCount = discovery.pagesCount;
            if (discovery.description) discoveredDescription = discovery.description;
            if (discovery.language) discoveredLanguage = discovery.language;
          }
        } catch (err) {
          console.warn('[LibraryGridView] Offline metadata extraction failed:', err);
        }
      }

      // Automatically extract cover from PDF if not already discovered
      if (ext === 'PDF') {
        try {
          if (windowAPI?.extractPdfCover) {
            const extRes = await windowAPI.extractPdfCover(fullPath, 1);
            if (extRes?.success && extRes.coverUrl) {
              discoveredCover = extRes.coverUrl;
            }
          }
          if (!discoveredCover) {
            const pdfCoverRes = await renderPdfPage(fullPath, 1);
            if (pdfCoverRes?.success && pdfCoverRes.coverUrl) {
              discoveredCover = pdfCoverRes.coverUrl;
            }
          }
        } catch (err) {
          console.warn('[LibraryGridView] Automatic PDF cover extraction error:', err);
        }
      }

      const formattedSize = fileSize ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB` : '1.5 MB';

      const offlineProvenance: import('../../../shared/types/work').MetadataProvenance = {
        primaryProvider: discoveryResult?.provenance?.providerUsed || (discoveryResult?.provenance?.embeddedFound ? 'Embedded Container' : 'Local Filename Parser'),
        discoveredAt: new Date().toISOString(),
        method: discoveryResult?.provenance?.embeddedFound ? 'offline_embedded' : 'offline_filename',
        confidence: discoveryResult?.confidence || 0.85,
        fieldSources: {
          title: { source: discoveryResult?.provenance?.embeddedFound ? 'Container Metadata' : 'Filename Parser', status: 'extracted', value: discoveredTitle, confidence: 0.9 },
          author: { source: discoveryResult?.provenance?.embeddedFound ? 'Container Metadata' : 'Filename Parser', status: 'extracted', value: discoveredAuthor, confidence: 0.9 },
          isbn: { source: discoveredIsbn ? 'Container Stream' : 'none', status: discoveredIsbn ? 'verified' : 'fallback', value: discoveredIsbn, confidence: 1.0 },
          pagesCount: { source: discoveredPagesCount ? 'Page Counter Stream' : 'none', status: 'calculated', value: discoveredPagesCount, confidence: 1.0 },
          coverImage: { source: discoveredCover ? 'Raster Extraction Stream' : 'none', status: 'extracted', value: discoveredCover ? 'Extracted Cover' : undefined, confidence: 0.9 },
          publisher: { source: discoveredPublisher ? 'Container Metadata' : 'none', status: 'extracted', value: discoveredPublisher, confidence: 0.85 },
          publicationYear: { source: discoveredYear ? 'Container Metadata' : 'none', status: 'extracted', value: discoveredYear, confidence: 0.85 },
        },
        auditTrace: [
          `[Digital Ingestion] Processed local file: ${fileNameWithExt} (${formattedSize})`,
          discoveryResult?.provenance?.embeddedFound
            ? `[Extractor] Successfully extracted embedded ${ext} headers and metadata tags`
            : `[Extractor] Analyzed filename patterns and tokens`,
          discoveredPagesCount
            ? `[Page Counter] Detected ${discoveredPagesCount} pages`
            : `[Page Counter] Page count deferred or not available in headers`,
          discoveredCover
            ? `[Raster Cover Engine] Generated first-page raster thumbnail`
            : `[Raster Cover Engine] Cover image extraction deferred`,
        ],
        rawBibliographic: discoveryResult || { fileName: fileNameWithExt, path: fullPath, ext, size: formattedSize },
      };

      const newDigitalBook: BookItem = {
        id: `book-local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: discoveredTitle,
        author: discoveredAuthor,
        publisher: discoveredPublisher,
        publicationYear: discoveredYear,
        isbn: discoveredIsbn,
        coverImage: discoveredCover,
        edition: discoveredEdition,
        pagesCount: discoveredPagesCount,
        abstract: discoveredDescription,
        digitalFormat: ext as BookItem['digitalFormat'],
        bookType: 'digital',
        readingStatus: 'reading',
        readingProgress: 0,
        filePath: fullPath,
        fileSize: formattedSize,
        language: discoveredLanguage,
        categories: ['ملفات رقمية محددة'],
        tags: [`#${ext}`],
        lendingHistory: [],
        metadataProvenance: offlineProvenance,
      };

      addBook(newDigitalBook);
      setSaveToast(t('bookAddedFromDrop', { title: newDigitalBook.title }));

      return newDigitalBook;
    } finally {
      setIsImportingBook(false);
    }
  };

  // Handle HTML fallback selection with Progressive Metadata Discovery
  const handleFileSelectFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const fullPath = await resolveDroppedFilePath(file);
    const importedBook = await importDigitalBookFromFile(fullPath, file.name, file.size);
    if (importedBook) {
      openBookForReading(importedBook);
    }
  };

  // Drag & Drop Handlers for Library View
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (isImportWizardOpen) return;
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragActive(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragActive(false);

    if (isImportWizardOpen || isImportingBook || dropImporting.current) return;
    const files = Array.from(e.dataTransfer.files);
    if (!files || files.length === 0) return;

    dropImporting.current = true;
    setDropNotice(null);
    setSaveToast(null);
    setIsImportingBook(true);
    setImportMessage(t('singleDropImporting'));
    try {
      const paths: string[] = [];
      for (const file of files) paths.push(await resolveDroppedFilePath(file));
      const outcome = await routeBookDrop(paths, window.electronAPI);
      if (outcome.kind === 'batch') {
        setDroppedImportPaths(outcome.paths);
        setIsImportWizardOpen(true);
      } else if (!outcome.result.success) {
        setDropNotice({ text: t('singleDropFailed'), error: true });
      } else if (outcome.result.skipped) {
        setDropNotice({ text: t('singleDropAlreadyImported'), error: false });
      } else {
        await refreshBooks();
        setDropNotice({ text: t('bookAddedFromDrop', { title: outcome.result.extractedMetadata?.title || outcome.result.fileName }), error: false });
      }
    } catch {
      setDropNotice({ text: t('singleDropFailed'), error: true });
    } finally {
      dropImporting.current = false;
      setIsImportingBook(false);
    }
  };

  const handleImportOnlineBook = (partialBook: Partial<BookItem>) => {
    const imported: BookItem = {
      id: partialBook.id || `book-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: partialBook.title || 'كتاب مستورد',
      author: partialBook.author || t('noAuthor'),
      publisher: partialBook.publisher,
      digitalFormat: partialBook.digitalFormat || 'PDF',
      bookType: 'digital',
      readingStatus: 'unread',
      readingProgress: 0,
      language: partialBook.language,
      categories: partialBook.categories || ['مستورد من الإنترنت'],
      tags: partialBook.tags || ['#مستورد_رقمي'],
      lendingHistory: [],
      onlineSource: partialBook.onlineSource,
      filePath: partialBook.filePath,
      fileSize: partialBook.fileSize,
      fileHash: partialBook.fileHash,
      coverImage: partialBook.coverImage,
      isbn: partialBook.isbn,
      publicationYear: partialBook.publicationYear,
    };
    addBook(imported);
    setSaveToast(t('libraryDownloadAdded', { title: imported.title }));

  };

  const bookMenu = (book: BookItem): MenuItemProps[] => {
    if (selectedBookIds.size > 1 && selectedBookIds.has(book.id)) {
      return [
        { id: 'bulk-category', label: t('ctxBulk') + ' · ' + t('bulkAssignCategory'), onClick: () => window.dispatchEvent(new CustomEvent('baglib:bulk-menu', { detail: 'category' })) },
        { id: 'bulk-tags', label: t('ctxTags'), onClick: () => window.dispatchEvent(new CustomEvent('baglib:bulk-menu', { detail: 'tags' })) },
        { id: 'bulk-status', label: t('readingStatus'), onClick: () => window.dispatchEvent(new CustomEvent('baglib:bulk-menu', { detail: 'status' })) },
        { id: 'bulk-export', label: t('ctxExportBooks'), onClick: () => exportBooks(books.filter(item => selectedBookIds.has(item.id))) },
        { id: 'bulk-delete', label: t('delete'), danger: true, onClick: () => window.dispatchEvent(new CustomEvent('baglib:bulk-menu', { detail: 'delete' })) },
      ];
    }
    const actions = getCardActions(book, {
      onRead: handleSafeOpenBook,
      onOpenDetails: item => { setDetailTab('info'); setSelectedBook(item); setIsNewBook(false); setIsDetailModalOpen(true); },
      onLend: item => { if(item.lendingHistory?.some(entry => !entry.isReturned))setQuickReturnBook(item);else setQuickLendBook(item); },
      onDelete: handleDeleteBook,
      onUpdateReadingStatus: updateBookReadingStatus,
      onAction: async (id, item) => {
        if (id === 'last') { handleSafeOpenBook(item); return; }
        if (id === 'folder' && item.filePath) { await window.electronAPI.showItemInFolder(item.filePath); return; }
        if (id === 'duplicates') { setSelectedStorageFilter('DUPLICATES'); return; }
        if (id === 'export') { exportBooks([item]); return; }
        if (id === 'wishlist') { await updateBook({ ...item, tags: [...new Set([...item.tags, '#wishlist'])] }); return; }
        setDetailTab(id === 'category' || id === 'tags' ? 'classification' : id === 'physical' ? 'physical' : 'info');
        setSelectedBook(item); setIsNewBook(false); setIsDetailModalOpen(true);
      },
    }, t);
    return actions.map(action => ({ id: action.id, label: action.label, icon: createElement(CARD_ACTION_ICONS[action.icon] ?? Info, { size: 14 }), danger: action.danger, disabled: !!action.disabledReason, disabledReason: action.disabledReason, onClick: action.onSelect }));
  };
  const exportBooks = (items: BookItem[]) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'baglib-books.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const handleLibraryEscape = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return;
    if (event.nativeEvent.isComposing) return;
    const searching = target.matches('[data-simple-search-input], [data-library-filter-search]');
    if (isTextEntry(target) && !searching) return;
    if (shortcutForEvent({ ...event, target: undefined }, 'library')?.id !== 'library-clear') return;
    if (searching && searchQuery) setSearchQuery('');
    else if (selectedBookIds.size > 0) handleClearSelection();
    else if (isAdvancedFiltersOpen) setIsAdvancedFiltersOpen(false);
    else if (searchQuery) setSearchQuery('');
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleBookNavigation = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const surface = target.closest<HTMLElement>('[data-library-book-card], [data-library-book-row]');
    if (!surface || target !== surface) return;
    const shortcut = shortcutForEvent(event, 'library');
    if (!shortcut?.id.startsWith('library-') || shortcut.id === 'library-clear') return;
    const surfaces = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-library-book-card], [data-library-book-row]'));
    const index = surfaces.indexOf(surface);
    if (shortcut.id === 'library-open') {
      event.preventDefault();
      if (paginatedBooks[index]) void handleSafeOpenBook(paginatedBooks[index]);
      return;
    }
    const firstTop = surfaces[0]?.getBoundingClientRect().top;
    const columns = surfaces.filter(node => Math.abs(node.getBoundingClientRect().top - firstTop) < 2).length;
    const next = libraryNavigationIndex({ key: event.key, index, count: surfaces.length, columns, dir: lang === 'ar' ? 'rtl' : 'ltr' });
    if (next === null) return;
    event.preventDefault();
    surfaces[next].focus();
    surfaces[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <div
      onKeyDown={handleLibraryEscape}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="flex-1 flex flex-col h-full bg-canvas overflow-hidden font-sans select-none relative"
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 bg-canvas/85 backdrop-blur-md flex flex-col items-center justify-center p-8 border-2 border-dashed border-primary rounded-2xl animate-in fade-in duration-200 pointer-events-none">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-4 text-primary-text shadow-xl shadow-primary/10">
            <BookOpen className="w-10 h-10 animate-bounce" />
          </div>
          <h3 className="text-xl font-bold font-display text-text mb-2 text-center">
            {t('dropBookHere')}
          </h3>
          <p className="text-sm text-text-muted mb-4 text-center max-w-md">
            {t('dropBookSubtitle')}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {['PDF', 'EPUB', 'MOBI', 'AZW3', 'TXT', 'HTML'].map((fmt) => (
              <span key={fmt} className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-surface border border-subtle text-primary-text shadow-sm">
                .{fmt.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Hidden Native Fallback File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelectFallback}
        accept=".pdf,.epub,.mobi,.azw3,.txt,.html,.djvu,.docx"
        className="hidden"
      />

      {/* Top Header & Actions: Auto-hiding Decluttered Library Header (KEY-310) */}
      <div
        data-library-controls
        onFocus={event => {
          if (scrollHeader.isCollapsed) {
            headerFocusRef.current = event.target as HTMLElement;
            setScrollHeader(prev => ({ ...prev, isCollapsed: false }));
          }
        }}
        className="sticky top-0 z-20 border-b border-border/70 bg-surface/95 backdrop-blur-md shrink-0 transition-all duration-300 ease-in-out motion-reduce:transition-none"
      >
        {scrollHeader.isCollapsed ? (
          /* SLIM STICKY BAR: Visible when scrolled down (Collection title + search field + essential tools) */
          <div
            data-library-sticky-header
            className="px-3 sm:px-6 py-2 flex items-center justify-between gap-3 min-w-0"
          >
            {/* Title & Volume Count */}
            <div
              className="flex items-center gap-2 min-w-0 shrink max-w-[35%] sm:max-w-xs cursor-pointer select-none"
              onClick={() => setScrollHeader((prev) => ({ ...prev, isCollapsed: false }))}
              title={collectionTitle}
            >
              <h2 className="font-display font-bold text-sm sm:text-base text-text truncate">
                {collectionTitle}
              </h2>
              <span className="hidden sm:inline-block text-[11px] px-1.5 py-0.5 rounded-full bg-canvas border border-border text-text-muted font-mono shrink-0">
                {bookCountLabel(filteredAndSortedBooks.length, lang, t)}
              </span>
            </div>

            {/* Compact Actions: Search, Sort, Grid/List, Advanced filters */}
            <div className="flex items-center gap-2 shrink-0 flex-1 justify-end max-w-xl">
              {/* Compact Search Field */}
              <div className="relative flex-1 min-w-[140px] max-w-xs">
                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-text-muted pointer-events-none" aria-hidden="true" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => handleFilterChange({ searchQuery: e.target.value })}
                  placeholder={t('simpleSearchPlaceholder')}
                  aria-label={t('simpleSearchPlaceholder')}
                  data-simple-search-input
                  className="w-full bg-canvas border border-border rounded-lg ps-8 pe-7 py-1 text-xs text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-focus outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => handleFilterChange({ searchQuery: '' })}
                    aria-label={t('searchClearQuery')}
                    className="absolute end-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text cursor-pointer"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-1 bg-canvas border border-border rounded-lg px-2 py-1 text-xs">
                <ArrowUpDown className="size-3 text-primary-text shrink-0" aria-hidden="true" />
                <select
                  value={recentView === 'all' ? sortField : recentView}
                  disabled={recentView !== 'all'}
                  onChange={(e) => {
                    const f = e.target.value as SortField;
                    const defaultDir = f === 'newest' || f === 'progress' ? 'desc' : 'asc';
                    handleSortChange({ field: f, direction: defaultDir });
                  }}
                  className="bg-transparent text-text text-xs outline-none cursor-pointer pe-1"
                  aria-label={t('sortLabel')}
                >
                  {recentView !== 'all' && <option value={recentView}>{t(recentView === 'opened' ? 'libraryRecentOpened' : 'libraryRecentImported')}</option>}
                    <option value="newest">{t('sortRecentlyAdded')}</option>
                  <option value="title">{t('sortTitle')}</option>
                  <option value="author">{t('sortAuthor')}</option>
                  <option value="progress">{t('sortRecentlyRead')}</option>
                </select>
              </div>

              {/* Grid / List View Toggle */}
              <div className="flex items-center bg-canvas border border-border rounded-lg p-0.5" data-view-mode-toggle>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('grid');
                    persistPreferences({ viewMode: 'grid' });
                  }}
                  title={t('viewGrid') || 'عرض الشبكة'}
                  className={`p-1 rounded transition-all cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-primary text-primary-contrast shadow-xs'
                      : 'text-text-muted hover:text-text'
                  }`}
                 aria-label={t('viewGrid')}>
                  <LayoutGrid className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('list');
                    persistPreferences({ viewMode: 'list' });
                  }}
                  title={t('viewList') || 'عرض القائمة'}
                  className={`p-1 rounded transition-all cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-primary text-primary-contrast shadow-xs'
                      : 'text-text-muted hover:text-text'
                  }`}
                 aria-label={t('viewList')}>
                  <List className="size-3.5" aria-hidden="true" />
                </button>
              </div>

              {/* Advanced Filters Button */}
              <Button
                variant={isAdvancedFiltersOpen ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  if (typeof window !== 'undefined' && window.innerWidth < 768) {
                    setIsFilterSheetOpen(true);
                  } else {
                    setIsAdvancedFiltersOpen((prev) => !prev);
                  }
                }}
                icon={<SlidersHorizontal className="size-3 text-primary-text" />}
                data-advanced-filter-button
                title={t('advancedFiltersToggle')}
               aria-label={t('advancedFiltersToggle')}>
                <span className="hidden sm:inline">{t('advancedFiltersToggle')}</span>
                {advancedFilterCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold font-mono bg-accent text-accent-contrast">
                    {advancedFilterCount}
                  </span>
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* FULL HEADER: One calm row per KEY-310 (Title + Count + Search + Sort + Grid/List + Advanced + ⋯ More) */
          <div className="px-3 sm:px-6 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-3 min-w-0 flex-wrap sm:flex-nowrap">
              {/* Title + Count (Reem Kufi font-display at moderate size) */}
              <div className="flex items-center gap-2 min-w-0 shrink max-w-[40%] sm:max-w-xs select-none" data-collection-header>
                <h2 className="font-display font-bold text-base sm:text-lg text-text truncate">
                  {collectionTitle}
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-canvas border border-border text-text-muted font-mono shrink-0">
                  {bookCountLabel(filteredAndSortedBooks.length, lang, t)}
                </span>
              </div>

              {/* Action Controls: Search, Sort, View, Advanced Filters, More Menu */}
              <div className="flex items-center gap-2 shrink-0 flex-1 justify-end max-w-2xl flex-wrap sm:flex-nowrap">
                {/* One Search Field at the Top of the Library (KEY-310) */}
                <div className="relative flex-1 min-w-[140px] max-w-xs">
                  <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-text-muted pointer-events-none" aria-hidden="true" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => handleFilterChange({ searchQuery: e.target.value })}
                    placeholder={t('simpleSearchPlaceholder')}
                    aria-label={t('simpleSearchPlaceholder')}
                    data-simple-search-input
                    className="w-full bg-canvas border border-border rounded-xl ps-8 pe-7 py-1.5 text-xs text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-focus outline-none transition-all shadow-xs"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => handleFilterChange({ searchQuery: '' })}
                      aria-label={t('searchClearQuery')}
                      className="absolute end-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text cursor-pointer"
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-1.5 bg-canvas border border-border rounded-xl px-2.5 py-1.5 text-xs shadow-xs">
                  <ArrowUpDown className="size-3.5 text-primary-text shrink-0" aria-hidden="true" />
                  <select
                    value={recentView === 'all' ? sortField : recentView}
                    disabled={recentView !== 'all'}
                    onChange={(e) => {
                      const f = e.target.value as SortField;
                      const defaultDir = f === 'newest' || f === 'progress' ? 'desc' : 'asc';
                      handleSortChange({ field: f, direction: defaultDir });
                    }}
                    className="bg-transparent text-text text-xs outline-none cursor-pointer pe-1"
                    aria-label={t('sortLabel')}
                  >
                    {recentView !== 'all' && <option value={recentView}>{t(recentView === 'opened' ? 'libraryRecentOpened' : 'libraryRecentImported')}</option>}
                    <option value="newest">{t('sortRecentlyAdded')}</option>
                    <option value="title">{t('sortTitle')}</option>
                    <option value="author">{t('sortAuthor')}</option>
                    <option value="progress">{t('sortRecentlyRead')}</option>
                  </select>
                </div>

                {/* Grid / List View Toggle */}
                <div className="flex items-center bg-canvas border border-border rounded-xl p-0.5 shadow-xs" data-view-mode-toggle>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('grid');
                      persistPreferences({ viewMode: 'grid' });
                    }}
                    title={t('viewGrid') || 'عرض الشبكة'}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                      viewMode === 'grid'
                        ? 'bg-primary text-primary-contrast shadow-xs'
                        : 'text-text-muted hover:text-text'
                    }`}
                   aria-label={t('viewGrid')}>
                    <LayoutGrid className="size-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('list');
                      persistPreferences({ viewMode: 'list' });
                    }}
                    title={t('viewList') || 'عرض القائمة'}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-primary text-primary-contrast shadow-xs'
                        : 'text-text-muted hover:text-text'
                    }`}
                   aria-label={t('viewList')}>
                    <List className="size-3.5" aria-hidden="true" />
                  </button>
                </div>

                {/* Advanced Filters Button */}
                <Button
                  variant={isAdvancedFiltersOpen ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.innerWidth < 768) {
                      setIsFilterSheetOpen(true);
                    } else {
                      setIsAdvancedFiltersOpen((prev) => !prev);
                    }
                  }}
                  icon={<SlidersHorizontal className="size-3.5 text-primary-text" />}
                  data-advanced-filter-button
                  title={t('advancedFiltersToggle')}
                 aria-label={t('advancedFiltersToggle')}>
                  <span className="hidden sm:inline">{t('advancedFiltersToggle')}</span>
                  {advancedFilterCount > 0 && (
                    <span className="ms-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold font-mono bg-accent text-accent-contrast">
                      {advancedFilterCount}
                    </span>
                  )}
                </Button>

                {/* ⋯ More Actions Menu (with Add Material and Import Wizard) */}
                <LibraryMoreMenu
                  onAddNewBook={handleAddNewBook}
                  onOpenImportWizard={() => setIsImportWizardOpen(true)}
                  onImportFolder={async () => {
                    try {
                      const folder = await window.electronAPI?.openDirectoryDialog?.();
                      if (folder) {
                        setDroppedImportPaths([folder]);
                        setIsImportWizardOpen(true);
                      }
                    } catch (err) {
                      console.error('Failed to open directory dialog:', err);
                    }
                  }}
                  onAddFromCover={() => void handleAddFromCover()}
                  onOpenWebClipper={() => setIsWebClipperOpen(true)}
                  onOpenPdfTools={() => setIsStirlingHubOpen(true)}
                  onOpenStorageManager={() => setIsStorageModalOpen(true)}
                  onOpenAudit={() => setIsAuditModalOpen(true)}
                  onOpenTrash={() => setIsTrashModalOpen(true)}
                  onOpenStats={() => setIsStatsModalOpen(true)}
                  onOpenSecurity={() => setIsSecurityModalOpen(true)}
                  onOpenCloudSync={() => setIsCloudSyncModalOpen(true)}
                  onOpenOpds={() => setIsOpdsHubOpen(true)}
                  storageIssueCount={storageIssueCount}
                  trashCount={trashCount}
                  selectedBooksCount={selectedBookIds.size}
                />
              </div>
            </div>

            {/* Active Filter Chips Row (KEY-310: Chips under search with Clear all) */}
            {activeChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5" data-active-filter-chips>
                {activeChips.map((chip) => (
                  <Chip
                    key={chip.id}
                    label={chip.label}
                    selected
                    removable
                    onRemove={() => handleFilterChange(chip.onClear)}
                  />
                ))}
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-[11px] font-medium text-accent hover:underline cursor-pointer ms-1.5"
                  title={t('clearAllFilters')}
                 aria-label={t('clearAllFilters')}>
                  {t('clearAllFilters')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-3 sm:px-6 py-2 border-b border-border space-y-2" data-library-recent>
        <div role="group" aria-label={t('libraryRecent')} className="flex flex-wrap items-center gap-1">
          {(['all', 'opened', 'imported'] as const).map(view => (
            <Button key={view} size="sm" variant={recentView === view ? 'primary' : 'ghost'}
              aria-pressed={recentView === view} data-recent-view={view} onClick={() => changeRecentView(view)}>
              {t(view === 'all' ? 'allBooksTitle' : view === 'opened' ? 'libraryRecentOpened' : 'libraryRecentImported')}
            </Button>
          ))}
        </div>
        {recentView === 'imported' && <p className="text-xs leading-relaxed text-text-muted">{t('libraryRecentImportWindow')}</p>}
      </div>

      {/* Main Workspace Layout: Filter Rail + Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Side Filter Rail (shown when isAdvancedFiltersOpen on desktop) */}
        {books.length > 0 && isAdvancedFiltersOpen && (
          <div className="hidden md:block w-64 lg:w-72 shrink-0 border-e border-border/70 bg-surface/30 p-4 overflow-y-auto overscroll-contain animate-in fade-in duration-200">
            <LibraryFilterRail
              filterState={filterState}
              onFilterChange={handleFilterChange}
              onClearFilters={resetAllFilters}
              allCategories={allCategories}
              books={recentBooks}
              availableLocations={availableLocations}
              sortState={sortState}
            sortDisabled={recentView !== 'all'}
              onSortChange={handleSortChange}
              cardDensity={cardDensity}
              onCardDensityChange={(d) => {
                setCardDensity(d);
                persistPreferences({ cardDensity: d });
              }}
              listDensity={listDensity}
              onListDensityChange={(d) => {
                setListDensity(d);
                persistPreferences({ listDensity: d });
              }}
              viewMode={viewMode}
              visibleColumns={visibleColumns}
              onToggleColumn={(col) => {
                setVisibleColumns((prev) => {
                  const next = prev.includes(col) ? prev.filter((k) => k !== col) : [...prev, col];
                  persistPreferences({ visibleColumns: next });
                  return next;
                });
              }}
              onResetColumns={() => {
                const defaults: ListColumnKey[] = ['cover', 'title', 'category', 'format', 'location', 'status', 'actions'];
                setVisibleColumns(defaults);
                persistPreferences({ visibleColumns: defaults });
              }}
            />
          </div>
        )}

        {/* Mobile 480px Filter Sheet */}
        <Sheet
          open={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          title={t('advancedFiltersToggle')}
          side="start"
        >
          <LibraryFilterRail
            filterState={filterState}
            onFilterChange={handleFilterChange}
            onClearFilters={resetAllFilters}
            allCategories={allCategories}
            books={recentBooks}
            availableLocations={availableLocations}
            sortState={sortState}
              sortDisabled={recentView !== 'all'}
            onSortChange={handleSortChange}
            isSheet
            onCloseSheet={() => setIsFilterSheetOpen(false)}
            cardDensity={cardDensity}
            onCardDensityChange={(d) => {
              setCardDensity(d);
              persistPreferences({ cardDensity: d });
            }}
            listDensity={listDensity}
            onListDensityChange={(d) => {
              setListDensity(d);
              persistPreferences({ listDensity: d });
            }}
            viewMode={viewMode}
            visibleColumns={visibleColumns}
            onToggleColumn={(col) => {
              setVisibleColumns((prev) => {
                const next = prev.includes(col) ? prev.filter((k) => k !== col) : [...prev, col];
                persistPreferences({ visibleColumns: next });
                return next;
              });
            }}
            onResetColumns={() => {
              const defaults: ListColumnKey[] = ['cover', 'title', 'category', 'format', 'location', 'status', 'actions'];
              setVisibleColumns(defaults);
              persistPreferences({ visibleColumns: defaults });
            }}
          />
        </Sheet>

        {/* Main Books Display: Empty States, Featured Card, Grid View, or List View */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6"
          data-library-scroll-container
          onKeyDown={handleBookNavigation}
          onScroll={(e) => {
            const st = e.currentTarget.scrollTop;
            setScrollHeader((prev) => computeScrollHeaderState(prev, st));
          }}
        >
          {/* Featured Card (Shown on page 1 in Grid mode when not actively searching) */}
          {recentView === 'all' && featuredBook && !filterState.searchQuery && currentPage === 1 && viewMode === 'grid' && (
            <ContextMenu onOpenMenu={() => bookMenu(featuredBook)}><FeaturedBookCard
              book={featuredBook}
              onOpenBook={handleSafeOpenBook}
              onOpenDetails={(b) => {
                setSelectedBook(b);
                setIsNewBook(false);
                setIsDetailModalOpen(true);
              }}
            /></ContextMenu>
          )}

          {(booksLoading || (recentView === 'opened' && recentLoading)) ? (
            <div role="status" aria-label={t('loading')} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map(id => <Skeleton key={id} className="h-64" />)}
            </div>
          ) : (booksError || (recentView === 'opened' && recentError)) ? (
            <EmptyState title={t('feedbackDatabaseUnavailable')} action={<Button onClick={() => { void refreshBooks(); setRecentRevision(revision => revision + 1); }}>{t('lookupRetry')}</Button>} />
          ) : books.length === 0 ? (
            <EmptyState title={t('emptyLibraryDesc')} icon={<FolderOpen className="size-6" />}
              action={<Button onClick={() => setIsImportWizardOpen(true)}>{t('importWizardTitle')}</Button>} />
          ) : recentView !== 'all' && recentBooks.length === 0 ? (
            <EmptyState title={t(recentView === 'opened' ? 'libraryRecentOpenedEmpty' : 'libraryRecentImportedEmpty')} />
          ) : filteredAndSortedBooks.length > 0 ? (
            viewMode === 'grid' ? (
            /* STATE B1: Books matching filter — CALM CARDS (KEY-310) */
            <div className="space-y-4">
              <div
                className={
                  cardDensity === 'compact'
                    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3'
                    : cardDensity === 'spacious'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'
                    : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'
                }
              >
                {paginatedBooks.map((book) => (
                  <LibraryBookCard
                    key={book.id}
                    book={book}
                    onOpenMenu={() => bookMenu(book)}
                    isSelected={selectedBookIds.has(book.id)}
                    onToggleSelect={handleToggleSelectBook}
                    onOpenBook={handleSafeOpenBook}
                    onOpenDetails={(b) => {
                      setSelectedBook(b);
                      setIsNewBook(false);
                      setIsDetailModalOpen(true);
                    }}
                    onUpdateReadingStatus={(bookId, status) => {
                      void updateBookReadingStatus(bookId, status);
                    }}
                    onLend={(b) => {
                      setQuickLendBook(b);
                    }}
                    onDelete={(bookId) => {
                      void handleDeleteBook(bookId);
                    }}
                    cardDensity={cardDensity}
                  />
                ))}
              </div>

              {/* Pagination Bar for Grid View (Story 9: 9.2) */}
              <PaginationBar
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                pageSizeOptions={[12, 24, 48, 96]}
                onPageChange={(p) => {
                  setCurrentPage(p);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onPageSizeChange={(sz) => {
                  setPageSize(sz);
                  setCurrentPage(1);
                  persistPreferences({ pageSize: sz });
                }}
              />
            </div>
          ) : (
            /* STATE B2: Books matching filter — ENHANCED LIST VIEW (Story 9: 9.5) */
            <div className="space-y-4">
              <div className="bg-surface border border-subtle rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-subtle bg-canvas/60 text-muted font-bold text-[11px]">
                        {/* Checkbox column */}
                        <th className="w-10 py-3 px-3 text-start">
                          <input
                            type="checkbox"
                            checked={isAllPageSelected}
                            onChange={handleToggleSelectAllOnPage}
                            className="w-3.5 h-3.5 accent-primary rounded cursor-pointer"
                            aria-label={isAllPageSelected ? t('batchDeselectAll') : t('batchSelectAllPage')}
                            title={isAllPageSelected ? t('batchDeselectAll') : t('batchSelectAllPage')}
                          />
                        </th>

                        {/* Optional Cover Column */}
                        {visibleColumns.includes('cover') && (
                          <th className="w-12 py-3 px-2 text-start">{t('columnCover')}</th>
                        )}

                        {/* Title Column (Mandatory, Sortable) */}
                        <th
                          onClick={() => handleHeaderSort('title')}
                          className="py-3 px-4 text-start cursor-pointer hover:bg-canvas transition-colors select-none group"
                          title={t('librarySortByColumn', { column: t('colCoverTitle') })}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{t('colCoverTitle') || 'الكتاب والمؤلف'}</span>
                            {renderSortIcon('title')}
                          </div>
                        </th>

                        {/* Category Column */}
                        {visibleColumns.includes('category') && (
                          <th
                            onClick={() => handleHeaderSort('category')}
                            className="py-3 px-4 text-start hidden sm:table-cell cursor-pointer hover:bg-canvas transition-colors select-none group"
                            title={t('librarySortByColumn', { column: t('colCategory') })}
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{t('colCategory') || 'التصنيف'}</span>
                              {renderSortIcon('category')}
                            </div>
                          </th>
                        )}

                        {/* Format Column */}
                        {visibleColumns.includes('format') && (
                          <th
                            onClick={() => handleHeaderSort('format')}
                            className="py-3 px-4 text-start hidden md:table-cell cursor-pointer hover:bg-canvas transition-colors select-none group"
                            title={t('librarySortByColumn', { column: t('colFormat') })}
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{t('colFormat') || 'الصيغة والنوع'}</span>
                              {renderSortIcon('format')}
                            </div>
                          </th>
                        )}

                        {/* Status Column */}
                        {visibleColumns.includes('status') && (
                          <th
                            onClick={() => handleHeaderSort('status')}
                            className="py-3 px-4 text-start max-sm:hidden cursor-pointer hover:bg-canvas transition-colors select-none group"
                            title={t('librarySortByColumn', { column: t('colStatus') })}
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{t('colStatus') || 'حالة القراءة'}</span>
                              {renderSortIcon('status')}
                            </div>
                          </th>
                        )}

                        {/* Location Column */}
                        {visibleColumns.includes('location') && (
                          <th
                            onClick={() => handleHeaderSort('location')}
                            className="py-3 px-4 text-start hidden lg:table-cell cursor-pointer hover:bg-canvas transition-colors select-none group"
                            title={t('librarySortByColumn', { column: t('colLocation') })}
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{t('colLocation') || 'الرف / المسار'}</span>
                              {renderSortIcon('location')}
                            </div>
                          </th>
                        )}

                        {/* Publication Year Column */}
                        {visibleColumns.includes('year') && (
                          <th
                            onClick={() => handleHeaderSort('year')}
                            className="py-3 px-4 text-start max-sm:hidden cursor-pointer hover:bg-canvas transition-colors select-none group"
                            title={t('librarySortByColumn', { column: t('columnYear') })}
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{t('columnYear')}</span>
                              {renderSortIcon('year')}
                            </div>
                          </th>
                        )}

                        {/* Publisher Column */}
                        {visibleColumns.includes('publisher') && (
                          <th className="py-3 px-4 text-start max-sm:hidden">{t('columnPublisher')}</th>
                        )}

                        {/* ISBN Column */}
                        {visibleColumns.includes('isbn') && (
                          <th className="py-3 px-4 text-start max-sm:hidden font-mono text-[10px]">{t('columnIsbn')}</th>
                        )}

                        {/* Tags Column */}
                        {visibleColumns.includes('tags') && (
                          <th className="py-3 px-4 text-start max-sm:hidden">{t('columnTags')}</th>
                        )}

                        {/* Actions Column */}
                        {visibleColumns.includes('actions') && (
                          <th className="py-3 px-4 text-end">{t('colActions') || 'الإجراءات'}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle/60">
                      {paginatedBooks.map((book, idx) => {
                        const readingStatus = book.readingStatus || 'unread';
                        const isSelected = selectedBookIds.has(book.id);
                        const cellPad = `${listDensity === 'compact' ? 'py-1.5 px-3' : 'py-3 px-4'} max-sm:px-2`;
                        // Phones show the reading state under the author instead of in its own column.
                        const statusControl = (
                          <div className="space-y-1 max-w-[140px]">
                            <select
                              value={readingStatus}
                              onChange={(e) => updateBookReadingStatus(book.id, e.target.value as NonNullable<BookItem['readingStatus']>)}
                              className={`text-[10px] font-bold rounded-full px-2 py-0.5 border cursor-pointer outline-none transition-all ${
                                readingStatus === 'completed'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                  : readingStatus === 'reading'
                                  ? 'bg-primary/10 text-primary-text border-primary/30'
                                  : 'bg-canvas text-muted border-subtle'
                              }`}
                            >
                              <option value="unread">{t('statusUnread') || 'لم يُقرأ'}</option>
                              <option value="reading">{t('statusReading') || 'قيد القراءة'}</option>
                              <option value="completed">{t('statusCompleted') || 'مكتمل'}</option>
                            </select>
                            {readingStatus === 'reading' && typeof book.readingProgress === 'number' && (
                              <div className="w-full bg-canvas rounded-full h-1 overflow-hidden border border-subtle" role="progressbar" aria-label={book.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, book.readingProgress))}>
                                <div
                                  className="bg-primary h-full rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min(100, Math.max(0, book.readingProgress))}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );

                        return (
                          <ContextMenu as="tr" onOpenMenu={()=>bookMenu(book)}
                            data-library-book-row
                            aria-label={book.title}
                            key={`${book.id || 'book'}-${idx}`}
                            className={`transition-colors group focus-visible:bg-primary/15 [&:focus-visible>td]:shadow-[inset_0_2px_0_var(--color-focus),inset_0_-2px_0_var(--color-focus)] ${
                              isSelected ? 'bg-primary/5' : 'hover:bg-canvas/40'
                            }`}
                          >
                            {/* Checkbox cell */}
                            <td className="w-10 px-3 py-2 text-start">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                onClick={(event) => handleToggleSelectBook(book.id, event)}
                                aria-checked={isSelected}
                                aria-label={t(isSelected ? 'deselectBook' : 'selectBook', { title: book.title })}
                                className="w-3.5 h-3.5 accent-primary rounded cursor-pointer"
                              />
                            </td>

                            {/* Cover Cell */}
                            {visibleColumns.includes('cover') && (
                              <td className="w-12 py-2 px-2">
                                <div className={listDensity === 'compact' ? 'w-8' : 'w-10'}>
                                  <LibraryBookCover url={book.coverImage} title={book.title} />
                                </div>
                              </td>
                            )}

                            {/* Title & Author (phones: a narrower cell so long titles truncate instead of scrolling) */}
                            <td className={`${cellPad} max-sm:max-w-[10rem]`} data-library-row-title>
                              <div className="min-w-0">
                                <div
                                  onClick={() => handleSafeOpenBook(book)}
                                  className="font-display font-bold text-text hover:text-primary-text cursor-pointer truncate text-sm"
                                  title={book.title}
                                >
                                  <bdi>{book.title}</bdi>
                                </div>
                                <BookVolumeBadge book={book} t={t} />
                                <div className="text-text-muted text-[11px] truncate font-serif"><bdi>{book.author}</bdi></div>
                                {visibleColumns.includes('status') && <div className="sm:hidden mt-1" data-library-row-status>{statusControl}</div>}
                              </div>
                            </td>

                            {/* Category */}
                            {visibleColumns.includes('category') && (
                              <td className={`${cellPad} hidden sm:table-cell`}>
                                <div className="space-y-1">
                                  {book.primaryCategory && (
                                    <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-canvas border border-subtle text-text-muted">
                                      {lang === 'ar' ? book.primaryCategory.nameAr : book.primaryCategory.nameEn}
                                    </span>
                                  )}
                                </div>
                              </td>
                            )}

                            {/* Format & Type */}
                            {visibleColumns.includes('format') && (
                              <td className={`${cellPad} hidden md:table-cell`}>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {(() => {
                                    const type = getBookSourceBadgeType(book);
                                    if (type === 'wishlist') {
                                      return (
                                        <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                                          {t('badgeWishlist')}
                                        </Badge>
                                      );
                                    }
                                    if (type === 'physical') {
                                      return (
                                        <Badge variant="default" className="text-[10px] px-2 py-0.5">
                                          {t('badgePhysical')}
                                        </Badge>
                                      );
                                    }
                                    return (
                                      <Badge variant="primary" className="text-[10px] px-2 py-0.5">
                                        {t('badgeDigital')}
                                      </Badge>
                                    );
                                  })()}
                                  {book.digitalFormat && (
                                    <span className="font-mono text-text-muted text-[10px]">
                                      {book.digitalFormat}
                                    </span>
                                  )}
                                </div>
                              </td>
                            )}

                            {/* Reading Status Selector & Progress */}
                            {visibleColumns.includes('status') && (
                              <td className={`${cellPad} max-sm:hidden`}>
                                {statusControl}
                              </td>
                            )}

                            {/* Location / Shelf */}
                            {visibleColumns.includes('location') && (
                              <td className={`${cellPad} hidden lg:table-cell text-muted text-[11px]`}>
                                {book.room || book.shelf ? (
                                  <div
                                    className="flex items-center gap-1 font-mono text-[10px]"
                                    title={[book.room, book.bookcase, book.shelf, book.shelfSection].filter(Boolean).join(' › ')}
                                  >
                                    <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    <span className="truncate max-w-[140px]">
                                      {[book.room, book.shelf].filter(Boolean).join(' › ')}
                                    </span>
                                  </div>
                                ) : book.filePath ? (
                                  <div className="flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5 text-primary-text shrink-0" />
                                    <span className="truncate max-w-[140px] font-mono text-[10px]">{book.fileSize || t('badgeDigital')}</span>
                                  </div>
                                ) : (
                                  <span>—</span>
                                )}
                              </td>
                            )}

                            {/* Year */}
                            {visibleColumns.includes('year') && (
                              <td className={`${cellPad} max-sm:hidden text-muted text-[11px]`}>
                                {book.publicationYear || '—'}
                              </td>
                            )}

                            {/* Publisher */}
                            {visibleColumns.includes('publisher') && (
                              <td className={`${cellPad} max-sm:hidden text-muted text-[11px] truncate max-w-[120px]`}>
                                {book.publisher || '—'}
                              </td>
                            )}

                            {/* ISBN */}
                            {visibleColumns.includes('isbn') && (
                              <td className={`${cellPad} max-sm:hidden text-muted font-mono text-[10px] truncate max-w-[110px]`}>
                                {book.isbn || '—'}
                              </td>
                            )}

                            {/* Tags */}
                            {visibleColumns.includes('tags') && (
                              <td className={`${cellPad} max-sm:hidden text-[10px]`}>
                                <div className="flex flex-wrap gap-1 max-w-[150px]">
                                  {book.tags.slice(0, 2).map((tg, tIdx) => (
                                    <span key={`${tg}-${tIdx}`} className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono">
                                      {tg}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            )}

                            {/* Actions */}
                            {visibleColumns.includes('actions') && (
                              <td className={`${cellPad} text-end`}>
                                <div className="flex items-center justify-end gap-1.5">
                                  {(() => {
                                    const activeLoan = (book.lendingHistory || []).find((l) => !l.isReturned);
                                    if (activeLoan) {
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => setQuickReturnBook(book)}
                                          title={t('returnBookBtn')}
                                          className="max-sm:hidden px-2 py-1 rounded-xl bg-evergreen-500/15 text-evergreen-600 dark:text-evergreen-400 text-[10px] font-bold hover:bg-evergreen-500/25 transition-colors cursor-pointer"
                                         aria-label={t('returnBookBtn')}>
                                          {t('returnBookBtn')}
                                        </button>
                                      );
                                    } else if (book.bookType === 'physical' || book.shelf || book.room) {
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => setQuickLendBook(book)}
                                          title={t('lendBookBtn')}
                                          className="max-sm:hidden px-2 py-1 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold hover:bg-amber-500/20 transition-colors cursor-pointer"
                                         aria-label={t('lendBookBtn')}>
                                          {t('lendBookBtn')}
                                        </button>
                                      );
                                    }
                                    return null;
                                  })()}

                                  <button
                                    onClick={() => handleSafeOpenBook(book)}
                                    title={t('readBook')}
                                    className="px-2.5 py-1 rounded-xl bg-primary text-primary-contrast font-bold text-xs hover:opacity-90 transition-all flex items-center gap-1 cursor-pointer"
                                   aria-label={t('readBook')}>
                                    <BookOpen className="w-3.5 h-3.5" />
                                    <span className="max-sm:hidden">{t('readBook')}</span>
                                  </button>

                                  <Menu portal items={[]} onOpenMenu={() => bookMenu(book)} trigger={properties => <button {...properties} type="button" data-row-menu-button aria-label={t('ribbonMoreActions')} title={t('ribbonMoreActions')} className="rounded-lg border border-border bg-surface px-2 py-1 text-primary-text">⋯</button>} />
                                </div>
                              </td>
                            )}
                          </ContextMenu>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination Bar for List View (Story 9: 9.2) */}
              <PaginationBar
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                pageSizeOptions={[25, 50, 100]}
                onPageChange={(p) => {
                  setCurrentPage(p);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onPageSizeChange={(sz) => {
                  setPageSize(sz);
                  setCurrentPage(1);
                  persistPreferences({ pageSize: sz });
                }}
              />
            </div>
          )
        ) : (
          /* STATE C: Books exist in library, but active filters returned 0 matches */
          <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-canvas border border-subtle flex items-center justify-center text-muted">
              <Search className="w-8 h-8 opacity-40" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-main font-display">{t('emptySearchTitle')}</h3>
              <p className="text-xs text-muted">{t('emptySearchDesc')}</p>
            </div>
            {selectedTopics.length > 0 && unclassifiedBooks.length > 0 && (
              <div className="space-y-2 max-w-sm" data-library-topic-hint>
                <p className="text-xs text-main leading-relaxed">{t(`libraryTopicEmptyHint_${new Intl.PluralRules(lang).select(unclassifiedBooks.length)}` as TranslationKey, { count: formatLocalizedNumber(unclassifiedBooks.length, lang) })}</p>
                <button
                  type="button"
                  data-library-select-unclassified
                  onClick={() => { resetAllFilters(); setSelectedBookIds(new Set(unclassifiedBooks.map(book => book.id))); }}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-contrast font-bold text-xs hover:opacity-90 transition-all cursor-pointer"
                >
                  {t('librarySelectUnclassified')}
                </button>
              </div>
            )}
            <button
              onClick={resetAllFilters}
              className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary-text font-bold text-xs hover:bg-primary/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('clearAllFilters')}</span>
            </button>
          </div>
        )}
      </div>
    </div>

      {/* Floating Bulk Actions Toolbar (Story 9: 9.6) */}
      <BulkActionsToolbar
        selectedBookIds={Array.from(selectedBookIds)}
        selectedBooks={books.filter((b) => selectedBookIds.has(b.id))}
        allCategories={allCategories}
        onClearSelection={handleClearSelection}
        onOpenAudit={() => setIsAuditModalOpen(true)}
        onOperationComplete={(msg) => {
          setSaveToast(msg);

          refreshBooks();
        }}
        onUndoToast={(toast) => {
          setUndoToast({
            id: String(Date.now()),
            message: toast.message,
            onUndo: async () => {
              await toast.onUndo();
              void refreshTrashCount();
              setSaveToast(t('booksRestored'));

            },
          });
        }}
      />

      {/* Book Detail & Edit Modal */}
      <BookDetailModal
        initialTab={detailTab}
        book={selectedBook}
        isOpen={isDetailModalOpen}
        isNew={isNewBook}
        allCategories={allCategories}
        onClose={() => {
          setIsDetailModalOpen(false);
          setIsNewBook(false);
        }}
        onSave={handleSaveBook}
        onDelete={handleDeleteBook}
        onOpenVolume={(volume, create) => { setSelectedBook(volume); setIsNewBook(create); }}
      />

      {/* Online Library Hub Modal */}
      <OnlineLibraryHub
        isOpen={isOnlineHubOpen}
        onClose={() => setIsOnlineHubOpen(false)}
        onImportBook={handleImportOnlineBook}
      />

      {/* Trash Bin Modal (KEY-45) */}
      <TrashBinModal
        isOpen={isTrashModalOpen}
        onClose={() => {
          setIsTrashModalOpen(false);
          void refreshTrashCount();
        }}
        onRestored={() => {
          void refreshBooks();
          void refreshTrashCount();
        }}
      />

      {/* Storage Cleaner Modal */}
      <StorageManagerModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
        books={books}
        onRemoveDuplicate={deleteBook}
      />

      {/* Cloud Backup & KOReader Sync Modal (KEY-147) */}
      <CloudSyncModal
        isOpen={isCloudSyncModalOpen}
        onClose={() => setIsCloudSyncModalOpen(false)}
      />

      {/* OPDS Hub & Wireless Feed Server Modal (KEY-148) */}
      <OPDSHubModal
        isOpen={isOpdsHubOpen}
        onClose={() => setIsOpdsHubOpen(false)}
        onBookImported={() => refreshBooks()}
      />

      {/* Web Clipper & Serialized Novel Ingestion Modal (KEY-148) */}
      <WebClipperModal
        isOpen={isWebClipperOpen}
        onClose={() => setIsWebClipperOpen(false)}
        onBookClipped={() => refreshBooks()}
      />

      {/* Reading Statistics Dashboard Modal (KEY-149) */}
      <ReadingStatisticsModal
        isOpen={isStatsModalOpen}
        onClose={() => setIsStatsModalOpen(false)}
        lang={lang}
      />

      {/* App Lock & Security Settings Modal (KEY-149) */}
      <AppLockModal
        isOpen={isSecurityModalOpen}
        isLockScreen={false}
        onClose={() => setIsSecurityModalOpen(false)}
        lang={lang}
      />

      {/* App Lock Screen Active Shield (KEY-149) */}
      <AppLockModal
        isOpen={isLockScreenActive}
        isLockScreen={true}
        onClose={() => setIsLockScreenActive(false)}
        onUnlocked={() => setIsLockScreenActive(false)}
        lang={lang}
      />

      {/* Quick Lend Book Modal (Story 8) */}
      <LendBookModal
        isOpen={!!quickLendBook}
        book={quickLendBook}
        onClose={() => setQuickLendBook(null)}
        onSuccess={() => {
          setSaveToast(t('lendSuccess'));

          refreshBooks();
        }}
      />

      {/* Quick Return Book Modal (Story 8) */}
      <ReturnBookModal
        isOpen={!!quickReturnBook}
        book={quickReturnBook}
        onClose={() => setQuickReturnBook(null)}
        onSuccess={() => {
          setSaveToast(t('returnSuccess'));

          refreshBooks();
        }}
      />

      {/* Library Metadata Audit & Refresh Modal */}
      {isAuditModalOpen && (
        <MetadataAuditModal
          isOpen={isAuditModalOpen}
          onClose={() => {
            setIsAuditModalOpen(false);
            refreshBooks();
          }}
          booksToAudit={booksToAudit}
          onUpdateBook={async (b) => {
            await updateBook(b);
            await refreshBooks();
          }}
          allCategories={allCategories}
        />
      )}

      {/* Standalone Stirling-PDF Tools & Processor Hub Modal */}
      {isStirlingHubOpen && (
        <StirlingToolsHub
          onClose={() => {
            setIsStirlingHubOpen(false);
            void refreshBooks();
          }}
          onOpenInWorkstation={(filePath) => {
            setIsStirlingHubOpen(false);
            const matchingBook = books.find(b => b.filePath === filePath);
            if (matchingBook) {
              openBookForReading(matchingBook);
            } else {
              void refreshBooks();
            }
          }}
        />
      )}

      {/* Book Import & Discovery Progress Floating Pill */}
      {isImportingBook && (
        <div className="fixed bottom-6 end-6 z-50 bg-surface/95 dark:bg-canvas/95 border border-primary/40 text-text px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
          <RefreshCw className="w-4 h-4 text-primary-text animate-spin shrink-0" />
          <span>{importMessage}</span>
        </div>
      )}

      {/* Save Success Toast */}

    </div>
  );
};
