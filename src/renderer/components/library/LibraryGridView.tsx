'use client';

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { LibraryRibbon } from './LibraryRibbon';
import {
  BookOpen,
  Search,
  Plus,
  HardDrive,
  MapPin,
  Info,
  FolderOpen,
  Filter,
  X,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  LayoutGrid,
  List,
  CheckCircle2,
  Trash2,
  FileText,
  RefreshCw,
  UploadCloud,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import { BookItem } from '../../types/library';
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
import { ColumnSelectorDropdown } from './ColumnSelectorDropdown';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { StirlingToolsHub } from '../pdf-workstation/StirlingToolsHub';
import { MetadataAuditModal } from './MetadataAuditModal';
import { LibraryBookCover } from './LibraryBookCover';
import { FeaturedBookCard } from './FeaturedBookCard';
import { LibraryFilterRail } from './LibraryFilterRail';
import { LibraryMoreMenu } from './LibraryMoreMenu';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Chip } from '../ui/Chip';
import { Sheet } from '../ui/Sheet';
import {
  getBookSourceBadgeType,
  isRecentBook,
  formatVolumesCount,
  getFeaturedBook,
  filterAndSortBooks,
  type LibraryFilterState,
  type LibrarySortState,
} from './library-filter-model';
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
  const [undoToast, setUndoToast] = useState<{
    id: string;
    message: string;
    onUndo: () => Promise<void>;
  } | null>(null);

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
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isNewBook, setIsNewBook] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [dropNotice, setDropNotice] = useState<{ text: string; error: boolean } | null>(null);
  const dropNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (dropNoticeTimer.current) clearTimeout(dropNoticeTimer.current); }, []);
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

  // Books scope for audit & refresh modal (selection vs entire library)
  const booksToAudit = useMemo(() => {
    if (selectedBookIds.size > 0) {
      return books.filter((b) => selectedBookIds.has(b.id));
    }
    return books;
  }, [books, selectedBookIds]);

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

  // Auto-dismiss Undo toast after 8 seconds (KEY-45)
  useEffect(() => {
    if (!undoToast) return;
    const timer = setTimeout(() => {
      setUndoToast(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [undoToast]);

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

  const filteredAndSortedBooks = useMemo(() => {
    return filterAndSortBooks(books, filterState, sortState);
  }, [books, filterState, sortState]);

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

  const hasActiveFilters = Boolean(
    (searchQuery && searchQuery.trim()) ||
    selectedTopics.length > 0 ||
    selectedAuthors.length > 0 ||
    selectedReadingStatus !== 'ALL' ||
    selectedBookType !== 'ALL' ||
    selectedFormat !== 'ALL' ||
    selectedStorageFilter !== 'ALL' ||
    selectedLocation !== 'ALL' ||
    lendingStatus !== 'ALL' ||
    activeLibraryCategory !== 'ALL' ||
    selectedTag !== 'ALL'
  );

  // Pagination Calculations (Story 9: 9.1, 9.2)
  const totalCount = filteredAndSortedBooks.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedBooks = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredAndSortedBooks.slice(start, start + pageSize);
  }, [filteredAndSortedBooks, safeCurrentPage, pageSize]);

  // Batch Selection Helpers with Shift-Click Range Support (Story 9: 9.6 / KEY-44)
  const handleToggleSelectBook = (id: string, e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    const isShift = (e as React.MouseEvent)?.shiftKey;

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
      setTimeout(() => setSaveToast(null), 4000);
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
    setSaveToast(lang === 'ar' ? 'تم حفظ التعديلات بنجاح!' : 'Changes saved successfully!');
    setTimeout(() => setSaveToast(null), 3000);
  };

  const handleDeleteBook = async (id: string) => {
    const targetBook = books.find((b) => b.id === id);
    const bookTitle = targetBook?.title || (lang === 'ar' ? 'الكتاب' : 'Book');

    await deleteBook(id);
    setIsDetailModalOpen(false);
    setIsNewBook(false);
    void refreshTrashCount();

    // Floating Interactive Undo Prompt (KEY-45)
    setUndoToast({
      id: String(Date.now()),
      message: `${bookTitle} — ${t('bookMovedToTrash')}`,
      onUndo: async () => {
        if (typeof window !== 'undefined' && window.electronAPI?.restoreBook) {
          await window.electronAPI.restoreBook(id);
          await refreshBooks();
          void refreshTrashCount();
          setSaveToast(t('bookRestored'));
          setTimeout(() => setSaveToast(null), 3500);
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
      setTimeout(() => setSaveToast(null), 5000);
    } catch {
      setSaveToast(t('coverPhotoFailed'));
      setTimeout(() => setSaveToast(null), 3500);
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
    setImportMessage(
      lang === 'ar'
        ? 'جاري استيراد الكتاب واكتشاف بياناته بدون إنترنت...'
        : 'Importing book & discovering offline metadata...'
    );

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
      setSaveToast(
        t('bookAddedFromDrop', { title: newDigitalBook.title }) ||
        (lang === 'ar'
          ? `تمت إضافة الكتاب "${newDigitalBook.title}" إلى المكتبة بنجاح!`
          : `Book "${newDigitalBook.title}" added to your library successfully!`)
      );
      setTimeout(() => setSaveToast(null), 3500);
      return newDigitalBook;
    } finally {
      setIsImportingBook(false);
    }
  };

  // Open Native Electron File Dialog with Progressive Metadata & Cover Discovery
  const _handleOpenBookFromDevice = async () => {
    const windowAPI = (window).electronAPI;

    if (windowAPI?.openFileDialog) {
      const fullPath: string | null = await windowAPI.openFileDialog();
      if (!fullPath) return;

      const pathSegments = fullPath.split(/[/\\]/);
      const fileNameWithExt = pathSegments[pathSegments.length - 1];
      const importedBook = await importDigitalBookFromFile(fullPath, fileNameWithExt);
      if (importedBook) {
        openBookForReading(importedBook);
      }
    } else {
      fileInputRef.current?.click();
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
    if (dropNoticeTimer.current) clearTimeout(dropNoticeTimer.current);
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
      dropNoticeTimer.current = setTimeout(() => setDropNotice(null), 5000);
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
    setSaveToast(
      lang === 'ar'
        ? `تمت إضافة "${imported.title}" إلى مكتبتك بنجاح!`
        : `"${imported.title}" added to your library successfully!`
    );
    setTimeout(() => setSaveToast(null), 3500);
  };

  return (
    <div
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

      {/* Top Header & Actions: Calm Ribbon & Collection Header */}
      <div data-library-controls className="p-3 sm:p-4 border-b border-border/70 bg-surface/40 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Primary Actions: Add Material & Import + Calm More Menu wrapped in LibraryRibbon */}
          <LibraryRibbon className="w-auto border-0 bg-transparent p-0">
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddNewBook}
              icon={<Plus className="size-3.5" />}
              title={lang === 'ar' ? 'إضافة مادة جديدة (رقمية، فيزيائية، أو عبر الإنترنت)' : 'Add new material (digital, physical, or online)'}
              data-library-dialog="book"
            >
              <span>{t('addBook')}</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsImportWizardOpen(true)}
              icon={<UploadCloud className="size-3.5" />}
              title={t('openImportWizard')}
              data-library-dialog="import"
            >
              <span>{t('importWizardTitle')}</span>
            </Button>

            <LibraryMoreMenu
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
          </LibraryRibbon>

          {/* Mobile Filter Button (Visible at 480 px / < md) */}
          <div className="md:hidden flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Filter className="size-3.5 text-primary-text" />}
              onClick={() => setIsFilterSheetOpen(true)}
              data-mobile-filter-button
            >
              <span>{t('filterTopics')}</span>
              {hasActiveFilters && (
                <span className="size-2 rounded-full bg-accent inline-block ms-0.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Collection Header per Figma Vision Mockup */}
        <div className="flex items-center justify-between gap-4 pt-1 flex-wrap" data-collection-header>
          <div className="space-y-1 min-w-0">
            <h2 className="font-display font-bold text-xl sm:text-2xl text-text truncate">
              {collectionTitle}
            </h2>
            <p className="text-xs text-text-muted flex items-center gap-1.5 font-sans">
              <span>{formatVolumesCount(filteredAndSortedBooks.length, lang)}</span>
              <span className="opacity-60">•</span>
              <span>{t('updatedRecently')}</span>
            </p>
          </div>

          {/* Grid / List View Toggle & Densities */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-canvas border border-border rounded-xl p-0.5" data-view-mode-toggle>
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
              >
                <LayoutGrid className="size-4" aria-hidden="true" />
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
              >
                <List className="size-4" aria-hidden="true" />
              </button>
            </div>

            {/* Density controls */}
            {viewMode === 'grid' && (
              <div className="hidden sm:flex items-center bg-canvas border border-border rounded-xl p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setCardDensity('compact');
                    persistPreferences({ cardDensity: 'compact' });
                  }}
                  className={`px-2 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                    cardDensity === 'compact'
                      ? 'bg-primary/15 text-primary-text font-bold'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  {t('densityCompact').split(' ')[0]}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCardDensity('comfortable');
                    persistPreferences({ cardDensity: 'comfortable' });
                  }}
                  className={`px-2 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                    cardDensity === 'comfortable'
                      ? 'bg-primary/15 text-primary-text font-bold'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  {t('densityComfortable').split(' ')[0]}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCardDensity('spacious');
                    persistPreferences({ cardDensity: 'spacious' });
                  }}
                  className={`px-2 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                    cardDensity === 'spacious'
                      ? 'bg-primary/15 text-primary-text font-bold'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  {t('densitySpacious').split(' ')[0]}
                </button>
              </div>
            )}

            {viewMode === 'list' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const next = listDensity === 'compact' ? 'normal' : 'compact';
                    setListDensity(next);
                    persistPreferences({ listDensity: next });
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-border bg-canvas hover:bg-surface text-xs font-medium text-text-muted hover:text-text transition-colors"
                >
                  {listDensity === 'compact' ? t('densityNormal') : t('densityRowCompact')}
                </button>

                <ColumnSelectorDropdown
                  visibleColumns={visibleColumns}
                  onToggleColumn={(col) => {
                    setVisibleColumns((prev) => {
                      const next = prev.includes(col)
                        ? prev.filter((k) => k !== col)
                        : [...prev, col];
                      persistPreferences({ visibleColumns: next });
                      return next;
                    });
                  }}
                  onResetColumns={() => {
                    const defaults: ListColumnKey[] = [
                      'cover',
                      'title',
                      'category',
                      'format',
                      'location',
                      'status',
                      'actions',
                    ];
                    setVisibleColumns(defaults);
                    persistPreferences({ visibleColumns: defaults });
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Workspace Layout: Filter Rail + Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Persistent Side Filter Rail */}
        {books.length > 0 && (
          <div className="hidden md:block w-64 lg:w-72 shrink-0 border-e border-border/70 bg-surface/30 p-4 overflow-y-auto overscroll-contain">
            <LibraryFilterRail
              filterState={filterState}
              onFilterChange={handleFilterChange}
              onClearFilters={resetAllFilters}
              allCategories={allCategories}
              books={books}
              availableLocations={availableLocations}
              sortState={sortState}
              onSortChange={handleSortChange}
            />
          </div>
        )}

        {/* Mobile 480px Filter Sheet */}
        <Sheet
          open={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          title={t('filterSheetToggle')}
          side="start"
        >
          <LibraryFilterRail
            filterState={filterState}
            onFilterChange={handleFilterChange}
            onClearFilters={resetAllFilters}
            allCategories={allCategories}
            books={books}
            availableLocations={availableLocations}
            sortState={sortState}
            onSortChange={handleSortChange}
            isSheet
            onCloseSheet={() => setIsFilterSheetOpen(false)}
          />
        </Sheet>

        {/* Main Books Display: Empty States, Featured Card, Grid View, or List View */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Featured Card (Shown on page 1 in Grid mode when not actively searching) */}
          {featuredBook && !filterState.searchQuery && currentPage === 1 && viewMode === 'grid' && (
            <FeaturedBookCard
              book={featuredBook}
              onOpenBook={handleSafeOpenBook}
              onOpenDetails={(b) => {
                setSelectedBook(b);
                setIsNewBook(false);
                setIsDetailModalOpen(true);
              }}
            />
          )}

          {books.length === 0 ? (
            /* STATE A: Completely Empty Library (0 books in state) */
            <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-xl mx-auto space-y-5">
              <div className="size-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary-text shadow-lg">
                <FolderOpen className="size-10" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-bold text-xl text-text">{t('emptyLibraryTitle')}</h3>
                <p className="text-xs text-text-muted leading-relaxed font-sans">
                  {t('emptyLibraryDesc')}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setIsImportWizardOpen(true)}
                  icon={<UploadCloud className="size-4" />}
                >
                  {t('importWizardTitle')}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleAddNewBook}
                  icon={<Plus className="size-4" />}
                >
                  {t('addBook')}
                </Button>
              </div>
            </div>
          ) : filteredAndSortedBooks.length > 0 ? (
            viewMode === 'grid' ? (
            /* STATE B1: Books matching filter — ENHANCED GRID VIEW (Story 9: 9.4) */
            <div className="space-y-4">
              <div
                className={
                  cardDensity === 'compact'
                    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3'
                    : cardDensity === 'spacious'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'
                    : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
                }
              >
                {paginatedBooks.map((book, idx) => {
                  const activeLend = book.lendingHistory.find((l) => !l.isReturned);
                  const readingStatus = book.readingStatus || 'unread';
                  const isSelected = selectedBookIds.has(book.id);

                  // Density 1: COMPACT CARD
                  if (cardDensity === 'compact') {
                    return (
                      <div
                        key={`${book.id || 'book'}-${idx}`}
                        className={`group relative bg-surface border rounded-xl p-2 flex flex-col justify-between transition-all duration-200 hover:shadow-lg overflow-hidden space-y-1.5 ${
                          isSelected ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border/70 hover:border-primary-text/40'
                        }`}
                      >
                        {/* Top corner selection checkbox */}
                        <div
                          onClick={(e) => handleToggleSelectBook(book.id, e)}
                          className={`absolute top-2 start-2 z-20 size-4 rounded border flex items-center justify-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-primary border-primary text-primary-contrast'
                              : 'border-border/60 bg-surface/90 opacity-0 group-hover:opacity-100 hover:border-primary-text'
                          }`}
                          title={isSelected ? 'إلغاء التحديد' : 'تحديد'}
                        >
                          {isSelected && <CheckCircle2 className="size-3 stroke-[3]" />}
                        </div>

                        {/* Top Badges */}
                        <div className="flex items-center justify-between gap-1 z-10 text-[9px] px-0.5 flex-wrap">
                          <div className="flex items-center gap-1 min-w-0">
                            {isRecentBook(book) && (
                              <Badge variant="accent" className="text-[9px] px-1 py-0">
                                {t('badgeNew')}
                              </Badge>
                            )}
                            {(() => {
                              const badgeType = getBookSourceBadgeType(book);
                              if (badgeType === 'physical') {
                                return <Badge variant="outline" className="text-[9px] px-1 py-0">{t('badgePhysical')}</Badge>;
                              }
                              if (badgeType === 'wishlist') {
                                return <Badge variant="warning" className="text-[9px] px-1 py-0">{t('badgeWishlist')}</Badge>;
                              }
                              return <Badge variant="primary" className="text-[9px] px-1 py-0">{t('badgeDigital')}</Badge>;
                            })()}
                            {book.digitalFormat && (
                              <span className="font-mono text-text-muted text-[8px] truncate max-w-[40px]">
                                {book.digitalFormat}
                              </span>
                            )}
                          </div>
                          <span
                            className={`size-2 rounded-full shrink-0 ${
                              readingStatus === 'completed'
                                ? 'bg-success'
                                : readingStatus === 'reading'
                                ? 'bg-primary-text'
                                : 'bg-text-muted/40'
                            }`}
                            title={t(`status${readingStatus.charAt(0).toUpperCase() + readingStatus.slice(1)}` as import('../../translations').TranslationKey)}
                          />
                        </div>

                        {/* Cover Image */}
                        <div
                          onClick={() => handleSafeOpenBook(book)}
                          className="relative w-full rounded-lg overflow-hidden cursor-pointer group/thumb"
                        >
                          <LibraryBookCover url={book.coverImage} title={book.title} />

                          {/* Hover action overlay */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1 rounded-xl">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSafeOpenBook(book);
                              }}
                              className="p-1 rounded-lg bg-primary text-primary-contrast hover:opacity-90 transition-opacity shadow-sm cursor-pointer"
                              title={t('readBook')}
                            >
                              <BookOpen className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBook(book);
                                setIsNewBook(false);
                                setIsDetailModalOpen(true);
                              }}
                              className="p-1 rounded-lg bg-surface text-text hover:bg-canvas transition-colors shadow-sm cursor-pointer"
                              title={t('bookDetailsBtn')}
                            >
                              <Info className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Title & Author snippet */}
                        <div className="space-y-0.5 pt-0.5">
                          <h4
                            onClick={() => handleSafeOpenBook(book)}
                            className="font-display font-bold text-text text-xs truncate hover:text-primary-text cursor-pointer leading-snug"
                            title={book.title}
                          >
                            {book.title}
                          </h4>
                          <BookVolumeBadge book={book} t={t} />
                          <p className="text-[10px] text-text-muted font-serif truncate">{book.author}</p>
                          {(() => {
                            const subject = book.primaryCategory
                              ? (lang === 'ar' ? book.primaryCategory.nameAr : book.primaryCategory.nameEn)
                              : book.categories?.[0] || (book.tags?.find((t) => t !== '#جديد' && t !== '#new') ? book.tags?.find((t) => t !== '#جديد' && t !== '#new')!.replace(/^#/, '') : undefined);
                            if (!subject) return null;
                            return (
                              <div className="pt-0.5">
                                <Chip label={subject} className="text-[9px] py-0 px-1.5" />
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  }

                  // Density 3: SPACIOUS EXPANDED CARD
                  if (cardDensity === 'spacious') {
                    return (
                      <div
                        key={`${book.id || 'book'}-${idx}`}
                        className={`group relative bg-surface border rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-2xl overflow-hidden space-y-4 ${
                          isSelected ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-subtle hover:border-primary/50'
                        }`}
                      >
                        {/* Top corner selection checkbox */}
                        <div
                          onClick={(e) => handleToggleSelectBook(book.id, e)}
                          className={`absolute top-3 start-3 z-20 w-5 h-5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-primary border-primary text-primary-contrast shadow-sm'
                              : 'border-border/60 bg-surface/90 opacity-0 group-hover:opacity-100 hover:border-primary'
                          }`}
                          title={isSelected ? 'إلغاء التحديد' : 'تحديد'}
                        >
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>

                        {/* Top Badges */}
                        <div className="flex items-center justify-between gap-1.5 z-10 flex-wrap ps-6">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isRecentBook(book) && (
                              <Badge variant="accent" className="text-[10px] px-2 py-0.5">
                                {t('badgeNew')}
                              </Badge>
                            )}
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
                              <span className="font-mono text-text-muted text-[10px] truncate max-w-[60px]">
                                {book.digitalFormat}
                              </span>
                            )}
                            <div className="relative" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={readingStatus}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  updateBookReadingStatus(book.id, e.target.value as NonNullable<BookItem['readingStatus']>);
                                }}
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
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBook(book);
                                setIsNewBook(false);
                                setIsDetailModalOpen(true);
                              }}
                              className="w-5 h-5 rounded-full bg-canvas border border-subtle text-muted hover:text-primary-text flex items-center justify-center transition-all cursor-pointer"
                              title={t('bookDetailsBtn')}
                            >
                              <Info className="w-3 h-3" />
                            </button>
                          </div>

                          {activeLend && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 font-bold">
                              مستعار ({activeLend.borrowerName})
                            </span>
                          )}
                        </div>

                        {/* Large Cover & Content */}
                        <div className="flex gap-4 cursor-pointer" onClick={() => handleSafeOpenBook(book)}>
                          <div className="w-28 shrink-0 rounded-xl overflow-hidden shadow-inner">
                            <LibraryBookCover url={book.coverImage} title={book.title} />
                          </div>

                          <div className="flex-1 min-w-0 space-y-2">
                            <div>
                              <h3 className="font-display font-bold text-text text-base leading-snug line-clamp-2 group-hover:text-primary-text transition-colors">
                                {book.title}
                              </h3>
                              <BookVolumeBadge book={book} t={t} />
                              <p className="text-xs text-text-muted font-serif line-clamp-1">{book.author}</p>
                              {(() => {
                                const subject = book.primaryCategory
                                  ? (lang === 'ar' ? book.primaryCategory.nameAr : book.primaryCategory.nameEn)
                                  : book.categories?.[0] || (book.tags?.find((t) => t !== '#جديد' && t !== '#new') ? book.tags?.find((t) => t !== '#جديد' && t !== '#new')!.replace(/^#/, '') : undefined);
                                if (!subject) return null;
                                return (
                                  <div className="pt-1">
                                    <Chip label={subject} className="text-[10px] py-0 px-2" />
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Description snippet */}
                            {book.description && (
                              <p className="text-xs text-text-muted/80 line-clamp-2 leading-relaxed">
                                {book.description}
                              </p>
                            )}

                            {/* Metadata Specs (Publisher, Year, ISBN) */}
                            <div className="text-[11px] text-text-muted space-y-0.5">
                              {book.publisher && <div className="truncate">الناشر: {book.publisher}</div>}
                              {book.publicationYear && <div>سنة النشر: {book.publicationYear}</div>}
                              {book.isbn && <div className="font-mono text-[10px]">ISBN: {book.isbn}</div>}
                            </div>
                          </div>
                        </div>

                        {/* Micro Progress Bar */}
                        {readingStatus === 'reading' && typeof book.readingProgress === 'number' && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-text-muted">
                              <span>{t('sortReadingProgress')}</span>
                              <span className="font-bold">{book.readingProgress}%</span>
                            </div>
                            <div className="w-full bg-canvas rounded-full h-1.5 overflow-hidden border border-subtle">
                              <div
                                className="bg-primary h-full rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(0, book.readingProgress))}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Location Breadcrumb & Actions */}
                        <div className="pt-2 border-t border-subtle/60 space-y-2 text-xs">
                          {(book.room || book.shelf) && (
                            <div
                              className="flex items-center gap-1.5 text-text-muted text-xs font-mono truncate"
                              title={[book.room, book.bookcase, book.shelf, book.shelfSection].filter(Boolean).join(' › ')}
                            >
                              <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span className="truncate">
                                {[book.room, book.bookcase, book.shelf, book.shelfSection].filter(Boolean).join(' › ')}
                              </span>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => handleSafeOpenBook(book)}
                              className="flex-1 py-1.5 rounded-xl bg-primary text-primary-contrast text-xs font-bold hover:opacity-90 transition-all flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>{t('readBook')}</span>
                            </button>
                            <button
                              onClick={() => handleDeleteBook(book.id)}
                              title={t('delete')}
                              className="p-1.5 rounded-xl bg-canvas border border-subtle text-text-muted hover:text-danger hover:bg-surface transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Density 2: COMFORTABLE CARD (Standard)
                  return (
                    <div
                      key={`${book.id || 'book'}-${idx}`}
                      className={`group relative bg-surface border rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 hover:shadow-xl overflow-hidden space-y-3 ${
                        isSelected ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-subtle hover:border-primary/50'
                      }`}
                    >
                      {/* Top Selection Checkbox */}
                      <div
                        onClick={(e) => handleToggleSelectBook(book.id, e)}
                        className={`absolute top-2.5 start-2.5 z-20 w-5 h-5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-primary border-primary text-primary-contrast shadow-sm'
                            : 'border-border/60 bg-surface/90 opacity-0 group-hover:opacity-100 hover:border-primary'
                        }`}
                        title={isSelected ? 'إلغاء التحديد' : 'تحديد'}
                      >
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>

                      {/* Format / Reading / Lending Badges Top */}
                      <div className="flex items-center justify-between gap-1 z-10 flex-wrap ps-6">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isRecentBook(book) && (
                            <Badge variant="accent" className="text-[10px] px-2 py-0.5">
                              {t('badgeNew')}
                            </Badge>
                          )}
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
                            <span className="font-mono text-text-muted text-[10px] truncate max-w-[60px]">
                              {book.digitalFormat}
                            </span>
                          )}

                          {/* Reading Status Selector */}
                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={readingStatus}
                              onChange={(e) => {
                                e.stopPropagation();
                                updateBookReadingStatus(book.id, e.target.value as NonNullable<BookItem['readingStatus']>);
                              }}
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
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBook(book);
                              setIsNewBook(false);
                              setIsDetailModalOpen(true);
                            }}
                            title={t('bookDetailsBtn')}
                            className="w-5 h-5 rounded-full bg-canvas border border-subtle text-muted hover:text-primary-text flex items-center justify-center transition-all cursor-pointer"
                          >
                            <Info className="w-3 h-3" />
                          </button>
                        </div>

                        {activeLend && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 font-bold">
                            مستعار ({activeLend.borrowerName})
                          </span>
                        )}

                        {/* Storage Health Badges */}
                        {book.storageState === 'missing' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBook(book);
                              setIsStorageModalOpen(true);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-bold border border-red-500/20 flex items-center gap-1 cursor-pointer"
                            title={t('storageMissingWarning')}
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>{t('storageHealthMissingBadge')}</span>
                          </button>
                        )}
                        {book.storageState === 'unmounted' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBook(book);
                              setIsStorageModalOpen(true);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20 flex items-center gap-1 cursor-pointer"
                            title={t('storageMissingWarning')}
                          >
                            <HardDrive className="w-2.5 h-2.5" />
                            <span>{t('storageHealthUnmountedBadge')}</span>
                          </button>
                        )}
                        {book.storageState === 'corrupted' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBook(book);
                              setIsStorageModalOpen(true);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-bold border border-red-500/20 flex items-center gap-1 cursor-pointer"
                            title={t('storageCorruptedWarning')}
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>{t('storageHealthCorruptedBadge')}</span>
                          </button>
                        )}
                        {book.storageState === 'duplicate' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBook(book);
                              setIsStorageModalOpen(true);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20 flex items-center gap-1 cursor-pointer"
                            title={t('storageStatusDuplicate')}
                          >
                            <Layers className="w-2.5 h-2.5" />
                            <span>{t('storageHealthDuplicateBadge')}</span>
                          </button>
                        )}
                      </div>

                      {/* Cover & Title */}
                      <div onClick={() => handleSafeOpenBook(book)} className="space-y-3 flex-1 cursor-pointer">
                        <div className="relative w-full rounded-xl overflow-hidden group/thumb">
                          <LibraryBookCover url={book.coverImage} title={book.title} />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2 rounded-xl">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSafeOpenBook(book);
                              }}
                              className="p-1.5 rounded-lg bg-primary text-primary-contrast hover:opacity-90 transition-opacity shadow-sm cursor-pointer"
                              title={t('readBook')}
                            >
                              <BookOpen className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBook(book);
                                setIsNewBook(false);
                                setIsDetailModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg bg-surface text-text hover:bg-canvas transition-colors shadow-sm cursor-pointer"
                              title={t('bookDetailsBtn')}
                            >
                              <Info className="size-4" />
                            </button>
                          </div>
                        </div>

                        {/* Micro Reading Progress Bar */}
                        {readingStatus === 'reading' && typeof book.readingProgress === 'number' && (
                          <div className="w-full bg-canvas rounded-full h-1 overflow-hidden border border-subtle">
                            <div
                              className="bg-primary h-full rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, Math.max(0, book.readingProgress))}%` }}
                            />
                          </div>
                        )}

                        <div className="space-y-1">
                          <h3 className="font-display font-bold text-text text-sm leading-snug line-clamp-2 group-hover:text-primary-text transition-colors">
                            {book.title}
                          </h3>
                          <BookVolumeBadge book={book} t={t} />
                          <p className="text-xs text-text-muted font-serif line-clamp-1">{book.author}</p>
                        </div>

                        {/* Subject Chip */}
                        {(() => {
                          const subject = book.primaryCategory
                            ? (lang === 'ar' ? book.primaryCategory.nameAr : book.primaryCategory.nameEn)
                            : book.categories?.[0] || (book.tags?.find((t) => t !== '#جديد' && t !== '#new') ? book.tags?.find((t) => t !== '#جديد' && t !== '#new')!.replace(/^#/, '') : undefined);
                          if (!subject) return null;
                          return (
                            <div className="pt-0.5">
                              <Chip label={subject} className="text-[10px] py-0 px-2" />
                            </div>
                          );
                        })()}
                      </div>

                      {/* Physical Location Badge, Lending Badge & Actions */}
                      <div className="pt-2 border-t border-subtle/60 space-y-1.5 text-[11px]">
                        {(book.room || book.shelf) && (
                          <div
                            className="flex items-center gap-1.5 text-text-muted text-[10px] font-mono truncate"
                            title={[book.room, book.bookcase, book.shelf, book.shelfSection].filter(Boolean).join(' › ')}
                          >
                            <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="truncate">
                              {[book.room, book.shelf].filter(Boolean).join(' › ')}
                            </span>
                          </div>
                        )}

                        {/* Lending Status Badge & Action */}
                        {(() => {
                          const activeLoan = (book.lendingHistory || []).find((l) => !l.isReturned);
                          if (activeLoan) {
                            const today = new Date().toISOString().split('T')[0];
                            const isOverdue = activeLoan.expectedReturnDate && activeLoan.expectedReturnDate < today;
                            const daysOverdue = isOverdue
                              ? Math.max(
                                  1,
                                  Math.round(
                                    (new Date(today).getTime() - new Date(activeLoan.expectedReturnDate).getTime()) /
                                      (1000 * 3600 * 24)
                                  )
                                )
                              : 0;

                            return (
                              <div className="flex items-center justify-between gap-1 pt-0.5">
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold truncate flex items-center gap-1 ${
                                    isOverdue
                                      ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 animate-pulse'
                                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                                  }`}
                                  title={t('loanedToBadge', { name: activeLoan.borrowerName })}
                                >
                                  <UserCheck className="w-3 h-3 shrink-0" />
                                  <span className="truncate">
                                    {isOverdue
                                      ? t('daysOverdueBadge', { days: daysOverdue })
                                      : t('loanedToBadge', { name: activeLoan.borrowerName })}
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setQuickReturnBook(book)}
                                  className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-evergreen-500/15 text-evergreen-600 dark:text-evergreen-400 hover:bg-evergreen-500/25 transition-colors cursor-pointer shrink-0"
                                >
                                  {t('returnBookBtn')}
                                </button>
                              </div>
                            );
                          } else if (book.bookType === 'physical' || book.shelf || book.room) {
                            return (
                              <div className="flex items-center justify-between gap-1 pt-0.5">
                                <span className="text-[10px] text-muted flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-evergreen-500 shrink-0" />
                                  <span>{t('lendingStatusAvailable')}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setQuickLendBook(book)}
                                  className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer shrink-0"
                                >
                                  {t('lendBookBtn')}
                                </button>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => handleSafeOpenBook(book)}
                            className="flex-1 py-1.5 rounded-xl bg-primary text-primary-contrast text-xs font-bold hover:opacity-90 transition-all flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>{t('readBook')}</span>
                          </button>

                          <button
                            onClick={() => handleDeleteBook(book.id)}
                            title={t('delete')}
                            className="p-1.5 rounded-xl bg-canvas border border-subtle text-text-muted hover:text-danger hover:bg-surface transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                          title="ترتيب حسب العنوان والمؤلف"
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
                            title="ترتيب حسب التصنيف"
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
                            title="ترتيب حسب الصيغة والنوع"
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
                            className="py-3 px-4 text-start cursor-pointer hover:bg-canvas transition-colors select-none group"
                            title="ترتيب حسب حالة القراءة"
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
                            title="ترتيب حسب الرف والمسار"
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
                            className="py-3 px-4 text-start cursor-pointer hover:bg-canvas transition-colors select-none group"
                            title="ترتيب حسب سنة النشر"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{t('columnYear')}</span>
                              {renderSortIcon('year')}
                            </div>
                          </th>
                        )}

                        {/* Publisher Column */}
                        {visibleColumns.includes('publisher') && (
                          <th className="py-3 px-4 text-start">{t('columnPublisher')}</th>
                        )}

                        {/* ISBN Column */}
                        {visibleColumns.includes('isbn') && (
                          <th className="py-3 px-4 text-start font-mono text-[10px]">{t('columnIsbn')}</th>
                        )}

                        {/* Tags Column */}
                        {visibleColumns.includes('tags') && (
                          <th className="py-3 px-4 text-start">{t('columnTags')}</th>
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
                        const cellPad = listDensity === 'compact' ? 'py-1.5 px-3' : 'py-3 px-4';

                        return (
                          <tr
                            key={`${book.id || 'book'}-${idx}`}
                            className={`transition-colors group ${
                              isSelected ? 'bg-primary/5' : 'hover:bg-canvas/40'
                            }`}
                          >
                            {/* Checkbox cell */}
                            <td className="w-10 px-3 py-2 text-start">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => handleToggleSelectBook(book.id, e)}
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

                            {/* Title & Author */}
                            <td className={cellPad}>
                              <div className="min-w-0">
                                <div
                                  onClick={() => handleSafeOpenBook(book)}
                                  className="font-display font-bold text-text hover:text-primary-text cursor-pointer truncate text-sm"
                                  title={book.title}
                                >
                                  {book.title}
                                </div>
                                <BookVolumeBadge book={book} t={t} />
                                <div className="text-text-muted text-[11px] truncate font-serif">{book.author}</div>
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
                              <td className={cellPad}>
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
                                    <div className="w-full bg-canvas rounded-full h-1 overflow-hidden border border-subtle">
                                      <div
                                        className="bg-primary h-full rounded-full transition-all duration-300"
                                        style={{ width: `${Math.min(100, Math.max(0, book.readingProgress))}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
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
                                    <span className="truncate max-w-[140px] font-mono text-[10px]">{book.fileSize || 'ملف رقمي'}</span>
                                  </div>
                                ) : (
                                  <span>—</span>
                                )}
                              </td>
                            )}

                            {/* Year */}
                            {visibleColumns.includes('year') && (
                              <td className={`${cellPad} text-muted text-[11px]`}>
                                {book.publicationYear || '—'}
                              </td>
                            )}

                            {/* Publisher */}
                            {visibleColumns.includes('publisher') && (
                              <td className={`${cellPad} text-muted text-[11px] truncate max-w-[120px]`}>
                                {book.publisher || '—'}
                              </td>
                            )}

                            {/* ISBN */}
                            {visibleColumns.includes('isbn') && (
                              <td className={`${cellPad} text-muted font-mono text-[10px] truncate max-w-[110px]`}>
                                {book.isbn || '—'}
                              </td>
                            )}

                            {/* Tags */}
                            {visibleColumns.includes('tags') && (
                              <td className={`${cellPad} text-[10px]`}>
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
                                          className="px-2 py-1 rounded-xl bg-evergreen-500/15 text-evergreen-600 dark:text-evergreen-400 text-[10px] font-bold hover:bg-evergreen-500/25 transition-colors cursor-pointer"
                                        >
                                          {t('returnBookBtn')}
                                        </button>
                                      );
                                    } else if (book.bookType === 'physical' || book.shelf || book.room) {
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => setQuickLendBook(book)}
                                          title={t('lendBookBtn')}
                                          className="px-2 py-1 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold hover:bg-amber-500/20 transition-colors cursor-pointer"
                                        >
                                          {t('lendBookBtn')}
                                        </button>
                                      );
                                    }
                                    return null;
                                  })()}

                                  <button
                                    onClick={() => handleSafeOpenBook(book)}
                                    title="قراءة الكتاب"
                                    className="px-2.5 py-1 rounded-xl bg-primary text-primary-contrast font-bold text-xs hover:opacity-90 transition-all flex items-center gap-1 cursor-pointer"
                                  >
                                    <BookOpen className="w-3.5 h-3.5" />
                                    <span>{t('readBook')}</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setSelectedBook(book);
                                      setIsNewBook(false);
                                      setIsDetailModalOpen(true);
                                    }}
                                    title={t('bookDetailsBtn')}
                                    className="p-1 rounded-xl bg-canvas border border-subtle text-text-muted hover:text-primary-text hover:bg-surface transition-colors cursor-pointer"
                                  >
                                    <Info className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    onClick={() => handleDeleteBook(book.id)}
                                    title={t('delete')}
                                    className="p-1 rounded-xl bg-canvas border border-subtle text-text-muted hover:text-danger hover:bg-surface transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
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
          setTimeout(() => setSaveToast(null), 4000);
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
              setTimeout(() => setSaveToast(null), 3500);
            },
          });
        }}
      />

      {/* Book Detail & Edit Modal */}
      <BookDetailModal
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
          setTimeout(() => setSaveToast(null), 4000);
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
          setTimeout(() => setSaveToast(null), 4000);
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
      {dropNotice && <div role={dropNotice.error ? 'alert' : 'status'} className={`fixed bottom-6 end-6 z-50 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold ${dropNotice.error ? 'bg-red-600 text-white' : 'bg-evergreen-600 text-white'}`}>
        {dropNotice.error ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
        <span>{dropNotice.text}</span>
      </div>}
      {/* Floating Interactive Undo Toast (KEY-45) */}
      {undoToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-8 start-1/2 -translate-x-1/2 z-50 flex items-center gap-3.5 px-5 py-3 rounded-2xl bg-neutral-900/95 dark:bg-neutral-800/95 text-white border border-neutral-700/80 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-lg w-[calc(100%-2rem)] sm:w-auto"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-1.5 rounded-xl bg-red-500/20 text-red-400 shrink-0">
              <Trash2 className="w-4 h-4" />
            </span>
            <span className="text-sm font-medium truncate text-neutral-100">
              {undoToast.message}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 ms-auto">
            <button
              onClick={async () => {
                const undoFn = undoToast.onUndo;
                setUndoToast(null);
                await undoFn();
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:opacity-90 active:scale-95 text-primary-contrast text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>{t('undo')}</span>
            </button>

            <button
              onClick={() => setUndoToast(null)}
              className="p-1.5 rounded-xl hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title={t('cancel')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 8-second animated countdown progress bar */}
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10 rounded-b-2xl overflow-hidden pointer-events-none">
            <div
              className="h-full bg-primary"
              style={{ animation: 'undo-shrink 8s linear forwards' }}
            />
          </div>
        </div>
      )}

      {saveToast && (
        <div className="fixed bottom-6 end-6 z-50 bg-evergreen-600 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-bottom-2 duration-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}
    </div>
  );
};
