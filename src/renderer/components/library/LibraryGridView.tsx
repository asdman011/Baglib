'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  HardDrive,
  MapPin,
  Edit3,
  Info,
  BookMarked,
  FolderOpen,
  PlusCircle,
  Filter,
  X,
  SlidersHorizontal,
  Tag as TagIcon,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  LayoutGrid,
  List,
  CheckCircle2,
  Clock,
  Trash2,
  FileText,
  RefreshCw,
  UploadCloud,
  AlertTriangle,
  UserCheck,
  Cloud,
  Globe,
  Scissors,
  BarChart2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { BookItem, ReadingStatus } from '../../types/library';
import { BookDetailModal } from './BookDetailModal';
import { BookVolumeBadge } from './BookVolumesPanel';
import { OnlineLibraryHub } from './OnlineLibraryHub';
import { StorageManagerModal } from './StorageManagerModal';
import { ImportWizardModal } from './ImportWizardModal';
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
import { PdfCreationLauncher } from '../reader/PdfCreationLauncher';
import { MetadataAuditModal } from './MetadataAuditModal';
import { useWorkspace } from '../context/WorkspaceContext';
import { matchesSearchQuery } from '../../utils/search';
import { renderPdfPage } from '../../utils/pdf-page-renderer';
import { resolveDroppedFilePath, formatCoverUrl } from '../../utils/file-path-helper';
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
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
  const [droppedImportPaths, setDroppedImportPaths] = useState<string[]>([]);
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

  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => b.tags?.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [books]);

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
        <ArrowUp className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
      ) : (
        <ArrowDown className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
      );
    }
    return <ArrowUpDown className="w-3 h-3 text-muted/40 group-hover:text-muted shrink-0 transition-colors" />;
  };

  // Scalable Multi-dimensional Filter & Search Engine
  const filteredAndSortedBooks = useMemo(() => {
    const seenIds = new Set<string>();
    return books
      .filter((b) => {
        if (!b || !b.id) return false;
        if (seenIds.has(b.id)) return false;
        seenIds.add(b.id);
        // 1. Full text search across all metadata fields with robust Arabic & multilingual normalization
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
        ].filter(Boolean).join(' ');

        if (!matchesSearchQuery(searchableContent, searchQuery)) {
          return false;
        }

        // 2. Book Type filter
        if (selectedBookType === 'digital' && b.bookType !== 'digital') return false;
        if (selectedBookType === 'physical' && b.bookType !== 'physical' && b.bookType !== 'hybrid') return false;
        if (selectedBookType === 'hybrid' && b.bookType !== 'hybrid') return false;

        // 3. Reading Status filter
        if (selectedReadingStatus !== 'ALL') {
          const status = b.readingStatus || 'unread';
          if (status !== selectedReadingStatus) return false;
        }

        // 4. Digital Format filter
        if (selectedFormat !== 'ALL' && b.digitalFormat !== selectedFormat) return false;

        // 5. Category filter
        if (activeLibraryCategory !== 'ALL' && b.primaryCategory?.id !== activeLibraryCategory) return false;

        // 6. Tag filter
        if (selectedTag !== 'ALL' && !(b.tags || []).includes(selectedTag)) return false;

        // 7. Lending Status filter
        const isCurrentlyLent = (b.lendingHistory || []).some((l) => !l.isReturned);
        const todayStr = new Date().toISOString().split('T')[0];
        const isOverdue = (b.lendingHistory || []).some(
          (l) => !l.isReturned && l.expectedReturnDate && l.expectedReturnDate < todayStr
        );

        if (lendingStatus === 'AVAILABLE' && isCurrentlyLent) return false;
        if (lendingStatus === 'LENT' && !isCurrentlyLent) return false;
        if (lendingStatus === 'OVERDUE' && !isOverdue) return false;

        // 8. Physical Location filter
        if (selectedLocation !== 'ALL') {
          if (b.room !== selectedLocation && b.shelf !== selectedLocation) {
            return false;
          }
        }

        // 8. Storage Health filter
        if (selectedStorageFilter === 'HEALTHY') {
          if (b.bookType === 'digital' && b.storageState && b.storageState !== 'available') {
            return false;
          }
        } else if (selectedStorageFilter === 'ATTENTION') {
          if (
            !b.storageState ||
            (b.storageState !== 'missing' &&
              b.storageState !== 'unmounted' &&
              b.storageState !== 'corrupted')
          ) {
            return false;
          }
        } else if (selectedStorageFilter === 'DUPLICATES') {
          if (b.storageState !== 'duplicate') {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortField === 'title') {
          comparison = (a.title || '').localeCompare(b.title || '', 'ar');
        } else if (sortField === 'author') {
          comparison = (a.author || '').localeCompare(b.author || '', 'ar');
        } else if (sortField === 'year') {
          const yearA = parseInt(String(a.publicationYear || 0), 10) || 0;
          const yearB = parseInt(String(b.publicationYear || 0), 10) || 0;
          comparison = yearA - yearB;
        } else if (sortField === 'category') {
          const catA = a.primaryCategory ? (lang === 'ar' ? a.primaryCategory.nameAr : a.primaryCategory.nameEn) : (a.categories?.[0] || '');
          const catB = b.primaryCategory ? (lang === 'ar' ? b.primaryCategory.nameAr : b.primaryCategory.nameEn) : (b.categories?.[0] || '');
          comparison = catA.localeCompare(catB, 'ar');
        } else if (sortField === 'format') {
          const fmtA = a.digitalFormat || (a.bookType === 'digital' ? 'PDF' : 'ورقي');
          const fmtB = b.digitalFormat || (b.bookType === 'digital' ? 'PDF' : 'ورقي');
          comparison = fmtA.localeCompare(fmtB, 'ar');
        } else if (sortField === 'status') {
          const order: Record<string, number> = { reading: 1, unread: 2, completed: 3, paused: 4, abandoned: 5 };
          const stA = order[a.readingStatus || 'unread'] || 99;
          const stB = order[b.readingStatus || 'unread'] || 99;
          comparison = stA - stB;
        } else if (sortField === 'progress' || sortField === 'rating') {
          comparison = (a.readingProgress || 0) - (b.readingProgress || 0);
        } else if (sortField === 'location') {
          const locA = a.shelf || a.room || a.filePath || '';
          const locB = b.shelf || b.room || b.filePath || '';
          comparison = locA.localeCompare(locB, 'ar');
        } else {
          // newest
          comparison = (b.id || '').localeCompare(a.id || '');
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });
  }, [books, searchQuery, selectedBookType, selectedReadingStatus, selectedFormat, selectedStorageFilter, activeLibraryCategory, selectedTag, lendingStatus, selectedLocation, sortField, sortDirection, lang]);

  // Pagination Calculations (Story 9: 9.1, 9.2)
  const totalCount = filteredAndSortedBooks.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedBooks = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredAndSortedBooks.slice(start, start + pageSize);
  }, [filteredAndSortedBooks, safeCurrentPage, pageSize]);

  // Batch Selection Helpers (Story 9: 9.6)
  const handleToggleSelectBook = (id: string, e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
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

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedBookType !== 'ALL' ||
    selectedReadingStatus !== 'ALL' ||
    selectedFormat !== 'ALL' ||
    selectedStorageFilter !== 'ALL' ||
    activeLibraryCategory !== 'ALL' ||
    selectedTag !== 'ALL' ||
    lendingStatus !== 'ALL' ||
    selectedLocation !== 'ALL' ||
    sortField !== 'newest';

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedBookType('ALL');
    setSelectedReadingStatus('ALL');
    setSelectedFormat('ALL');
    setSelectedStorageFilter('ALL');
    setActiveLibraryCategory('ALL');
    setSelectedTag('ALL');
    setLendingStatus('ALL');
    setSelectedLocation('ALL');
    setSortField('newest');
    setSortDirection('desc');
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

  const handleDeleteBook = (id: string) => {
    deleteBook(id);
    setIsDetailModalOpen(false);
    setIsNewBook(false);
  };

  const handleAddNewBook = () => {
    const newBook: BookItem = {
      id: `work-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: lang === 'ar' ? 'مادة جديدة في المكتبة' : 'New Library Material',
      author: lang === 'ar' ? 'مؤلف جديد' : 'New Author',
      language: lang === 'ar' ? 'العربية' : 'English',
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
  const handleOpenBookFromDevice = async () => {
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
        <div className="absolute inset-0 z-50 bg-canvas/85 backdrop-blur-md flex flex-col items-center justify-center p-8 border-2 border-dashed border-pale-sky-500 rounded-2xl animate-in fade-in duration-200 pointer-events-none">
          <div className="w-20 h-20 rounded-2xl bg-pale-sky-500/10 border border-pale-sky-500/30 flex items-center justify-center mb-4 text-pale-sky-500 shadow-xl shadow-pale-sky-500/10">
            <BookOpen className="w-10 h-10 animate-bounce" />
          </div>
          <h3 className="text-xl font-bold font-display text-main mb-2 text-center">
            {t('dropBookHere')}
          </h3>
          <p className="text-sm text-muted mb-4 text-center max-w-md">
            {t('dropBookSubtitle')}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {['PDF', 'EPUB', 'MOBI', 'AZW3', 'TXT', 'HTML'].map((fmt) => (
              <span key={fmt} className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-surface border border-subtle text-pale-sky-500 shadow-sm">
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

      {/* Top Header & Actions */}
      <div className="p-4 border-b border-subtle bg-surface/50 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-pale-sky-500/10 border border-pale-sky-500/20 flex items-center justify-center text-pale-sky-500 font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-main text-base font-display">{t('libraryTitle')}</h2>
              <p className="text-xs text-muted">{t('libraryDesc')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle (Grid / List) */}
            <div className="flex items-center bg-canvas border border-subtle rounded-xl p-0.5">
              <button
                onClick={() => {
                  setViewMode('grid');
                  persistPreferences({ viewMode: 'grid' });
                }}
                title={t('viewGrid') || 'عرض الشبكة'}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-pale-sky-500 text-white shadow-sm'
                    : 'text-muted hover:text-main'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setViewMode('list');
                  persistPreferences({ viewMode: 'list' });
                }}
                title={t('viewList') || 'عرض القائمة'}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-pale-sky-500 text-white shadow-sm'
                    : 'text-muted hover:text-main'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Card Density Controls (Grid Mode) */}
            {viewMode === 'grid' && (
              <div className="flex items-center bg-canvas border border-subtle rounded-xl p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setCardDensity('compact');
                    persistPreferences({ cardDensity: 'compact' });
                  }}
                  title={t('densityCompact')}
                  className={`px-2 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                    cardDensity === 'compact'
                      ? 'bg-pale-sky-500/20 text-pale-sky-500 font-bold'
                      : 'text-muted hover:text-main'
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
                  title={t('densityComfortable')}
                  className={`px-2 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                    cardDensity === 'comfortable'
                      ? 'bg-pale-sky-500/20 text-pale-sky-500 font-bold'
                      : 'text-muted hover:text-main'
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
                  title={t('densitySpacious')}
                  className={`px-2 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                    cardDensity === 'spacious'
                      ? 'bg-pale-sky-500/20 text-pale-sky-500 font-bold'
                      : 'text-muted hover:text-main'
                  }`}
                >
                  {t('densitySpacious').split(' ')[0]}
                </button>
              </div>
            )}

            {/* List Mode Controls: Column Customizer & Row Density */}
            {viewMode === 'list' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const next = listDensity === 'compact' ? 'normal' : 'compact';
                    setListDensity(next);
                    persistPreferences({ listDensity: next });
                  }}
                  title={listDensity === 'compact' ? t('densityNormal') : t('densityRowCompact')}
                  className="px-2.5 py-1.5 rounded-xl border border-subtle bg-canvas hover:bg-surface text-xs font-medium text-muted hover:text-main transition-colors"
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

            {/* Storage Cleaner & Health */}
            <button
              onClick={() => setIsStorageModalOpen(true)}
              title={t('storageManagerTitle')}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-subtle hover:bg-surface text-muted hover:text-main text-xs font-semibold transition-all cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5 text-pale-sky-500" />
              <span className="hidden sm:inline">{t('storageManagerTitle')}</span>
              {storageIssueCount > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse">
                  {storageIssueCount}
                </span>
              )}
            </button>

            {/* Library Metadata Audit & Refresh */}
            <button
              onClick={() => setIsAuditModalOpen(true)}
              title={
                selectedBookIds.size > 0
                  ? t('auditScopeSelected', { count: selectedBookIds.size })
                  : t('auditAndRefreshMetadata')
              }
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                selectedBookIds.size > 0
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'bg-canvas border-subtle hover:bg-surface text-muted hover:text-amber-500'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">
                {selectedBookIds.size > 0
                  ? `${t('auditAndRefreshMetadata')} (${selectedBookIds.size})`
                  : t('auditAndRefreshMetadata')}
              </span>
              {selectedBookIds.size > 0 && (
                <span className="sm:hidden inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                  {selectedBookIds.size}
                </span>
              )}
            </button>

            {/* Import Wizard (Story 6) */}
            <PdfCreationLauncher />
            <button
              onClick={() => setIsImportWizardOpen(true)}
              title={t('openImportWizard')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-subtle hover:bg-surface text-muted hover:text-main text-xs font-semibold transition-all cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5 text-pale-sky-500" />
              <span className="hidden sm:inline">{t('openImportWizard')}</span>
            </button>

            {/* Cloud Sync & Snapshots (KEY-147) */}
            <button
              onClick={() => setIsCloudSyncModalOpen(true)}
              title={t('cloudSyncModalTitle')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-subtle hover:bg-surface text-muted hover:text-main text-xs font-semibold transition-all cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">{t('tabCloudStorage')}</span>
            </button>

            {/* OPDS Catalogs & Feed Server (KEY-148) */}
            <button
              onClick={() => setIsOpdsHubOpen(true)}
              title={t('opdsHubTitle')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-subtle hover:bg-surface text-muted hover:text-main text-xs font-semibold transition-all cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline">{t('tabOpdsCatalogs')}</span>
            </button>

            {/* Web Article & Novel Clipper (KEY-148) */}
            <button
              onClick={() => setIsWebClipperOpen(true)}
              title={t('webClipperTitle')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-subtle hover:bg-surface text-muted hover:text-main text-xs font-semibold transition-all cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">{t('webClipperTitle').split(' ')[0]}</span>
            </button>

            {/* Reading Statistics Dashboard (KEY-149) */}
            <button
              onClick={() => setIsStatsModalOpen(true)}
              title={t('statsDashboardTitle')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-subtle hover:bg-surface text-muted hover:text-main text-xs font-semibold transition-all cursor-pointer"
            >
              <BarChart2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">{t('statsDashboardTitle').split(' ')[0]}</span>
            </button>

            {/* App Lock & Security (KEY-149) */}
            <button
              onClick={() => setIsSecurityModalOpen(true)}
              title={t('securityModalTitle')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-subtle hover:bg-surface text-muted hover:text-main text-xs font-semibold transition-all cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden sm:inline">{t('securityModalTitle').split(' ')[0]}</span>
            </button>

            {/* Add Material (Unified Entry Point) */}
            <button
              onClick={handleAddNewBook}
              title={lang === 'ar' ? 'إضافة مادة جديدة (رقمية، فيزيائية، أو عبر الإنترنت)' : 'Add new material (digital, physical, or online)'}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 shadow-md shadow-pale-sky-500/20 transition-all cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              <span>{t('addBook')}</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar — Render ONLY when there are books in the library */}
        {books.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 lg:grid-cols-12 gap-2 text-xs">
              {/* Search Input */}
              <div className="lg:col-span-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-canvas border border-subtle">
                <Search className="w-4 h-4 text-pale-sky-500 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث بالعنوان، المؤلف، الرف، ISBN، الوسوم..."
                  className="w-full bg-transparent outline-none text-main placeholder:text-muted font-sans text-xs"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-muted hover:text-main cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter 1: Reading Status Dropdown */}
              <div className="lg:col-span-2 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-canvas border border-subtle">
                <BookOpen className="w-3.5 h-3.5 text-muted shrink-0" />
                <select
                  value={selectedReadingStatus}
                  onChange={(e) => setSelectedReadingStatus(e.target.value)}
                  className="w-full bg-transparent outline-none text-main cursor-pointer font-sans text-xs"
                >
                  <option value="ALL">{t('statusAll') || 'حالة القراءة: الكل'}</option>
                  <option value="unread">{t('statusUnread') || 'لم يُقرأ'}</option>
                  <option value="reading">{t('statusReading') || 'قيد القراءة'}</option>
                  <option value="completed">{t('statusCompleted') || 'مكتمل'}</option>
                </select>
              </div>

              {/* Filter 2: Book Type Dropdown */}
              <div className="lg:col-span-2 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-canvas border border-subtle">
                <SlidersHorizontal className="w-3.5 h-3.5 text-muted shrink-0" />
                <select
                  value={selectedBookType}
                  onChange={(e) => setSelectedBookType(e.target.value)}
                  className="w-full bg-transparent outline-none text-main cursor-pointer font-sans text-xs"
                >
                  <option value="ALL">نوع الكيان: الكل</option>
                  <option value="digital">كتب رقمية فقط</option>
                  <option value="physical">كتب فيزيائية (بالرفوف)</option>
                  <option value="hybrid">مزدوج (رقمي + ورقي)</option>
                </select>
              </div>

              {/* Filter 3: Digital Format Dropdown */}
              <div className="lg:col-span-1 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-canvas border border-subtle">
                <Filter className="w-3.5 h-3.5 text-muted shrink-0" />
                <select
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value)}
                  className="w-full bg-transparent outline-none text-main cursor-pointer font-sans text-xs"
                >
                  <option value="ALL">الصيغة: الكل</option>
                  <option value="PDF">PDF</option>
                  <option value="EPUB">EPUB</option>
                  <option value="MOBI">MOBI</option>
                  <option value="AZW3">AZW3</option>
                  <option value="HTML">HTML</option>
                  <option value="TXT">TXT</option>
                </select>
              </div>

              {/* Filter 4: Storage Health Dropdown */}
              <div className="lg:col-span-2 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-canvas border border-subtle">
                <HardDrive className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
                <select
                  value={selectedStorageFilter}
                  onChange={(e) => setSelectedStorageFilter(e.target.value as typeof selectedStorageFilter)}
                  className="w-full bg-transparent outline-none text-main cursor-pointer font-sans text-xs truncate"
                >
                  <option value="ALL">{t('storageFilterAll')}</option>
                  <option value="HEALTHY">{t('storageFilterHealthy')}</option>
                  <option value="ATTENTION">{t('storageFilterAttention')}</option>
                  <option value="DUPLICATES">{t('storageFilterDuplicates')}</option>
                </select>
              </div>

              {/* Filter 5: Category Dropdown */}
              <div className="lg:col-span-2 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-canvas border border-subtle">
                <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <select
                  value={activeLibraryCategory}
                  onChange={(e) => setActiveLibraryCategory(e.target.value)}
                  className="w-full bg-transparent outline-none text-main cursor-pointer font-sans text-xs truncate"
                >
                  <option value="ALL">{t('allCategories')}</option>
                  {allCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {lang === 'ar' ? cat.nameAr : cat.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter: Lending Status Dropdown */}
              <div className="lg:col-span-2 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-canvas border border-subtle">
                <UserCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <select
                  value={lendingStatus}
                  onChange={(e) => setLendingStatus(e.target.value)}
                  className="w-full bg-transparent outline-none text-main cursor-pointer font-sans text-xs truncate"
                >
                  <option value="ALL">{t('filterLendingAll')}</option>
                  <option value="AVAILABLE">{t('filterLendingAvailable')}</option>
                  <option value="LENT">{t('filterLendingLoaned')}</option>
                  <option value="OVERDUE">{t('filterLendingOverdue')}</option>
                </select>
              </div>

              {/* Filter: Physical Location Dropdown */}
              {availableLocations.length > 0 && (
                <div className="lg:col-span-2 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-canvas border border-subtle">
                  <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full bg-transparent outline-none text-main cursor-pointer font-sans text-xs truncate"
                  >
                    <option value="ALL">{t('filterLocationAll')}</option>
                    {availableLocations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filter 6: Multi-criteria Sort Selector & Direction Toggle (Story 9: 9.3) */}
              <div className="lg:col-span-2 flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-canvas border border-subtle">
                <ArrowUpDown className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
                <select
                  value={sortField}
                  onChange={(e) => {
                    const f = e.target.value as SortField;
                    setSortField(f);
                    const defaultDir = f === 'newest' || f === 'year' || f === 'progress' ? 'desc' : 'asc';
                    setSortDirection(defaultDir);
                    persistPreferences({ sortBy: f, sortDirection: defaultDir });
                  }}
                  className="w-full bg-transparent outline-none text-main cursor-pointer font-sans text-xs truncate"
                >
                  <option value="newest">{t('sortNewest') || 'الأحدث أضيفت'}</option>
                  <option value="title">{t('sortTitle') || 'العنوان (أ-ي)'}</option>
                  <option value="author">{t('sortAuthor') || 'اسم المؤلف'}</option>
                  <option value="year">{t('sortYear') || 'سنة النشر'}</option>
                  <option value="progress">{t('sortReadingProgress') || 'نسبة الإنجاز'}</option>
                  <option value="location">{t('sortLocation') || 'الموقع والرف'}</option>
                  <option value="category">{t('sortCategory') || 'التصنيف'}</option>
                  <option value="status">{t('colStatus') || 'حالة القراءة'}</option>
                  <option value="format">{t('sortFormat') || 'الصيغة والنوع'}</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    const nextDir = sortDirection === 'asc' ? 'desc' : 'asc';
                    setSortDirection(nextDir);
                    persistPreferences({ sortDirection: nextDir });
                  }}
                  title={sortDirection === 'asc' ? t('sortDirectionAsc') : t('sortDirectionDesc')}
                  className="p-1 rounded-lg bg-surface border border-subtle hover:bg-surface-raised text-pale-sky-500 transition-colors shrink-0 cursor-pointer"
                >
                  {sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Dynamic Tags & Status Bar with Batch Selection (Story 9: 9.6) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 max-w-full">
                {/* Select All on Page Checkbox Button */}
                {paginatedBooks.length > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleSelectAllOnPage}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-semibold transition-all shrink-0 cursor-pointer ${
                      isAllPageSelected || selectedBookIds.size > 0
                        ? 'bg-pale-sky-500/10 border-pale-sky-500/40 text-pale-sky-500'
                        : 'bg-canvas border-subtle text-muted hover:text-main'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isAllPageSelected}
                      onChange={handleToggleSelectAllOnPage}
                      className="w-3.5 h-3.5 accent-pale-sky-500 rounded cursor-pointer pointer-events-none"
                    />
                    <span>{isAllPageSelected ? t('batchDeselectAll') : t('batchSelectAllPage')}</span>
                  </button>
                )}

                <span className="text-[11px] text-muted font-bold flex items-center gap-1 shrink-0">
                  <TagIcon className="w-3 h-3 text-pale-sky-500" />
                  <span>الوسوم:</span>
                </span>

                <button
                  onClick={() => setSelectedTag('ALL')}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all shrink-0 cursor-pointer ${
                    selectedTag === 'ALL'
                      ? 'bg-pale-sky-500 text-white'
                      : 'bg-canvas border border-subtle text-muted hover:text-main'
                  }`}
                >
                  الكل
                </button>

                {uniqueTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTag(selectedTag === t ? 'ALL' : t)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all shrink-0 cursor-pointer ${
                      selectedTag === t
                        ? 'bg-amber-500 text-white'
                        : 'bg-canvas border border-subtle text-muted hover:text-main'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Results Count & Reset Button */}
              <div className="flex items-center gap-3 text-xs shrink-0">
                <span className="text-muted text-[11px]">
                  عرض <strong className="text-main">{totalCount}</strong> كتاب
                  {selectedBookIds.size > 0 && (
                    <span className="text-pale-sky-500 font-bold ms-1">
                      ({t('batchSelectedCount', { count: selectedBookIds.size })})
                    </span>
                  )}
                </span>

                {hasActiveFilters && (
                  <button
                    onClick={resetAllFilters}
                    className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold hover:underline text-[11px] cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>إعادة ضبط الفلاتر</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Books Display: Empty States, Grid View, or List View */}
      <div className="flex-1 overflow-y-auto p-6">
        {books.length === 0 ? (
          /* STATE A: Completely Empty Library (0 books in state) */
          <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-xl mx-auto space-y-5">
            <div className="w-24 h-24 rounded-3xl bg-pale-sky-500/10 border border-pale-sky-500/20 flex items-center justify-center text-pale-sky-500 shadow-xl">
              <FolderOpen className="w-12 h-12" />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-xl text-main font-display">{t('emptyLibraryTitle')}</h3>
              <p className="text-xs text-muted leading-relaxed">
                {t('emptyLibraryDesc')}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setIsImportWizardOpen(true)}
                className="px-5 py-3 rounded-2xl bg-canvas border border-subtle text-main font-bold text-xs hover:bg-surface shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 text-pale-sky-500" />
                <span>{t('importWizardTitle')}</span>
              </button>
              <button
                onClick={handleAddNewBook}
                className="px-5 py-3 rounded-2xl bg-pale-sky-500 hover:bg-pale-sky-600 text-white font-bold text-xs shadow-lg shadow-pale-sky-500/20 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t('addBook')}</span>
              </button>
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
                          isSelected ? 'border-pale-sky-500 ring-1 ring-pale-sky-500 bg-pale-sky-500/5' : 'border-subtle hover:border-pale-sky-500/50'
                        }`}
                      >
                        {/* Top corner selection checkbox */}
                        <div
                          onClick={(e) => handleToggleSelectBook(book.id, e)}
                          className={`absolute top-2 start-2 z-20 w-4 h-4 rounded border flex items-center justify-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-pale-sky-500 border-pale-sky-500 text-white'
                              : 'border-border/60 bg-surface/90 opacity-0 group-hover:opacity-100 hover:border-pale-sky-500'
                          }`}
                          title={isSelected ? 'إلغاء التحديد' : 'تحديد'}
                        >
                          {isSelected && <CheckCircle2 className="w-3 h-3 stroke-[3]" />}
                        </div>

                        {/* Top Format & Status Dot */}
                        <div className="flex items-center justify-between z-10 text-[9px] px-0.5">
                          <span className="font-mono text-muted truncate max-w-[60px]">
                            {book.digitalFormat || t('physicalBook')}
                          </span>
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              readingStatus === 'completed'
                                ? 'bg-emerald-500'
                                : readingStatus === 'reading'
                                ? 'bg-pale-sky-500'
                                : 'bg-muted/40'
                            }`}
                            title={t(`status${readingStatus.charAt(0).toUpperCase() + readingStatus.slice(1)}` as import('../../translations').TranslationKey)}
                          />
                        </div>

                        {/* Cover Image */}
                        <div
                          onClick={() => handleSafeOpenBook(book)}
                          className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-canvas border border-subtle shadow-inner cursor-pointer"
                        >
                          {book.coverImage ? (
                            <img
                              src={formatCoverUrl(book.coverImage)}
                              alt={book.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-muted">
                              <BookOpen className="w-6 h-6 opacity-30" />
                            </div>
                          )}

                          {/* Hover action overlay */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSafeOpenBook(book);
                              }}
                              className="p-1 rounded-lg bg-pale-sky-500 text-white hover:bg-pale-sky-600 transition-colors shadow-sm"
                              title={t('readBook')}
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBook(book);
                                setIsNewBook(false);
                                setIsDetailModalOpen(true);
                              }}
                              className="p-1 rounded-lg bg-surface text-foreground hover:bg-surface-raised transition-colors shadow-sm"
                              title={t('bookDetailsBtn')}
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Title & Author snippet */}
                        <div className="space-y-0.5 pt-0.5">
                          <h4
                            onClick={() => handleSafeOpenBook(book)}
                            className="font-bold text-main text-xs truncate hover:text-pale-sky-500 cursor-pointer"
                            title={book.title}
                          >
                            {book.title}
                          </h4>
                          <BookVolumeBadge book={book} t={t} />
                          <p className="text-[10px] text-muted truncate">{book.author}</p>
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
                          isSelected ? 'border-pale-sky-500 ring-1 ring-pale-sky-500 bg-pale-sky-500/5' : 'border-subtle hover:border-pale-sky-500/50'
                        }`}
                      >
                        {/* Top corner selection checkbox */}
                        <div
                          onClick={(e) => handleToggleSelectBook(book.id, e)}
                          className={`absolute top-3 start-3 z-20 w-5 h-5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-pale-sky-500 border-pale-sky-500 text-white shadow-sm'
                              : 'border-border/60 bg-surface/90 opacity-0 group-hover:opacity-100 hover:border-pale-sky-500'
                          }`}
                          title={isSelected ? 'إلغاء التحديد' : 'تحديد'}
                        >
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>

                        {/* Top Badges */}
                        <div className="flex items-center justify-between gap-1 z-10 flex-wrap ps-6">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 font-bold border border-pale-sky-500/20 font-mono">
                              {book.digitalFormat || t('physicalBook')}
                            </span>
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
                                    ? 'bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 border-pale-sky-500/30'
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
                              className="w-5 h-5 rounded-full bg-canvas border border-subtle text-muted hover:text-pale-sky-500 flex items-center justify-center transition-all cursor-pointer"
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
                          <div className="w-28 h-40 shrink-0 rounded-xl overflow-hidden bg-canvas border border-subtle shadow-inner relative group-hover:opacity-95 transition-opacity">
                            {book.coverImage ? (
                              <img
                                src={formatCoverUrl(book.coverImage)}
                                alt={book.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-muted">
                                <BookOpen className="w-8 h-8 opacity-40" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 space-y-2">
                            <div>
                              <h3 className="font-bold text-main text-base leading-snug line-clamp-2 group-hover:text-pale-sky-500 transition-colors">
                                {book.title}
                              </h3>
                              <BookVolumeBadge book={book} t={t} />
                              <p className="text-xs text-muted font-serif line-clamp-1">{book.author}</p>
                            </div>

                            {/* Description snippet */}
                            {book.description && (
                              <p className="text-xs text-muted/80 line-clamp-2 leading-relaxed">
                                {book.description}
                              </p>
                            )}

                            {/* Metadata Specs (Publisher, Year, ISBN) */}
                            <div className="text-[11px] text-muted space-y-0.5">
                              {book.publisher && <div className="truncate">الناشر: {book.publisher}</div>}
                              {book.publicationYear && <div>سنة النشر: {book.publicationYear}</div>}
                              {book.isbn && <div className="font-mono text-[10px]">ISBN: {book.isbn}</div>}
                            </div>
                          </div>
                        </div>

                        {/* Micro Progress Bar */}
                        {readingStatus === 'reading' && typeof book.readingProgress === 'number' && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-muted">
                              <span>{t('sortReadingProgress')}</span>
                              <span className="font-bold">{book.readingProgress}%</span>
                            </div>
                            <div className="w-full bg-canvas rounded-full h-1.5 overflow-hidden border border-subtle">
                              <div
                                className="bg-pale-sky-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(0, book.readingProgress))}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Location Breadcrumb & Actions */}
                        <div className="pt-2 border-t border-subtle/60 space-y-2 text-xs">
                          {(book.room || book.shelf) && (
                            <div
                              className="flex items-center gap-1.5 text-muted text-xs font-mono truncate"
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
                              className="flex-1 py-1.5 rounded-xl bg-pale-sky-500 text-white text-xs font-bold hover:bg-pale-sky-600 transition-all flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>{t('readBook')}</span>
                            </button>
                            <button
                              onClick={() => handleDeleteBook(book.id)}
                              title="حذف الكتاب"
                              className="p-1.5 rounded-xl bg-canvas border border-subtle text-muted hover:text-red-500 hover:bg-surface transition-colors cursor-pointer"
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
                        isSelected ? 'border-pale-sky-500 ring-1 ring-pale-sky-500 bg-pale-sky-500/5' : 'border-subtle hover:border-pale-sky-500/50'
                      }`}
                    >
                      {/* Top Selection Checkbox */}
                      <div
                        onClick={(e) => handleToggleSelectBook(book.id, e)}
                        className={`absolute top-2.5 start-2.5 z-20 w-5 h-5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-pale-sky-500 border-pale-sky-500 text-white shadow-sm'
                            : 'border-border/60 bg-surface/90 opacity-0 group-hover:opacity-100 hover:border-pale-sky-500'
                        }`}
                        title={isSelected ? 'إلغاء التحديد' : 'تحديد'}
                      >
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>

                      {/* Format / Reading / Lending Badges Top */}
                      <div className="flex items-center justify-between gap-1 z-10 flex-wrap ps-6">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 font-bold border border-pale-sky-500/20 font-mono">
                            {book.digitalFormat || t('physicalBook')}
                          </span>

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
                                  ? 'bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 border-pale-sky-500/30'
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
                            className="w-5 h-5 rounded-full bg-canvas border border-subtle text-muted hover:text-pale-sky-600 dark:hover:text-pale-sky-300 flex items-center justify-center transition-all cursor-pointer"
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
                        {book.coverImage ? (
                          <div className="w-full h-44 rounded-xl overflow-hidden bg-canvas border border-subtle shadow-inner relative group-hover:opacity-95 transition-opacity">
                            <img
                              src={formatCoverUrl(book.coverImage)}
                              alt={book.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="px-3 py-1.5 rounded-xl bg-pale-sky-500 text-white font-bold text-xs flex items-center gap-1 shadow-lg">
                                <BookMarked className="w-4 h-4" />
                                <span>فتح القراءة الكاملة</span>
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-44 rounded-xl bg-canvas border border-subtle flex flex-col items-center justify-center text-muted group-hover:text-pale-sky-500 transition-colors">
                            <BookOpen className="w-10 h-10 mb-1 opacity-40" />
                            <span className="text-[11px] font-mono">بدون غلاف</span>
                          </div>
                        )}

                        {/* Micro Reading Progress Bar */}
                        {readingStatus === 'reading' && typeof book.readingProgress === 'number' && (
                          <div className="w-full bg-canvas rounded-full h-1 overflow-hidden border border-subtle">
                            <div
                              className="bg-pale-sky-500 h-full rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, Math.max(0, book.readingProgress))}%` }}
                            />
                          </div>
                        )}

                        <div className="space-y-1">
                          <h3 className="font-bold text-main text-sm leading-snug line-clamp-2 group-hover:text-pale-sky-500 transition-colors">
                            {book.title}
                          </h3>
                          <BookVolumeBadge book={book} t={t} />
                          <p className="text-xs text-muted font-serif line-clamp-1">{book.author}</p>
                        </div>

                        {/* Categories & Tags Preview */}
                        <div className="flex flex-wrap items-center gap-1 pt-1">
                          {book.primaryCategory && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-canvas border border-subtle text-muted">
                              {lang === 'ar' ? book.primaryCategory.nameAr : book.primaryCategory.nameEn}
                            </span>
                          )}
                          {book.tags.slice(0, 2).map((tag, tagIdx) => (
                            <span key={`${tag}-${tagIdx}`} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Physical Location Badge, Lending Badge & Actions */}
                      <div className="pt-2 border-t border-subtle/60 space-y-1.5 text-[11px]">
                        {(book.room || book.shelf) && (
                          <div
                            className="flex items-center gap-1.5 text-muted text-[10px] font-mono truncate"
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
                            className="flex-1 py-1.5 rounded-xl bg-pale-sky-500 text-white text-xs font-bold hover:bg-pale-sky-600 transition-all flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>{t('readBook')}</span>
                          </button>

                          <button
                            onClick={() => handleDeleteBook(book.id)}
                            title="حذف الكتاب"
                            className="p-1.5 rounded-xl bg-canvas border border-subtle text-muted hover:text-red-500 hover:bg-surface transition-colors cursor-pointer"
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
                            className="w-3.5 h-3.5 accent-pale-sky-500 rounded cursor-pointer"
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
                              isSelected ? 'bg-pale-sky-500/10' : 'hover:bg-canvas/40'
                            }`}
                          >
                            {/* Checkbox cell */}
                            <td className="w-10 px-3 py-2 text-start">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => handleToggleSelectBook(book.id, e)}
                                className="w-3.5 h-3.5 accent-pale-sky-500 rounded cursor-pointer"
                              />
                            </td>

                            {/* Cover Cell */}
                            {visibleColumns.includes('cover') && (
                              <td className="w-12 py-2 px-2">
                                {book.coverImage ? (
                                  <img
                                    src={formatCoverUrl(book.coverImage)}
                                    alt={book.title}
                                    className={`${listDensity === 'compact' ? 'w-8 h-10' : 'w-10 h-14'} object-cover rounded-lg border border-subtle shrink-0`}
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className={`${listDensity === 'compact' ? 'w-8 h-10' : 'w-10 h-14'} rounded-lg bg-canvas border border-subtle flex items-center justify-center text-muted shrink-0`}>
                                    <BookOpen className="w-4 h-4 opacity-40" />
                                  </div>
                                )}
                              </td>
                            )}

                            {/* Title & Author */}
                            <td className={cellPad}>
                              <div className="min-w-0">
                                <div
                                  onClick={() => handleSafeOpenBook(book)}
                                  className="font-bold text-main hover:text-pale-sky-500 cursor-pointer truncate text-sm"
                                  title={book.title}
                                >
                                  {book.title}
                                </div>
                                <BookVolumeBadge book={book} t={t} />
                                <div className="text-muted text-[11px] truncate">{book.author}</div>
                              </div>
                            </td>

                            {/* Category */}
                            {visibleColumns.includes('category') && (
                              <td className={`${cellPad} hidden sm:table-cell`}>
                                <div className="space-y-1">
                                  {book.primaryCategory && (
                                    <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-canvas border border-subtle text-muted">
                                      {lang === 'ar' ? book.primaryCategory.nameAr : book.primaryCategory.nameEn}
                                    </span>
                                  )}
                                </div>
                              </td>
                            )}

                            {/* Format & Type */}
                            {visibleColumns.includes('format') && (
                              <td className={`${cellPad} hidden md:table-cell`}>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 font-bold border border-pale-sky-500/20 font-mono">
                                  {book.digitalFormat || t('physicalBook')}
                                </span>
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
                                        ? 'bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 border-pale-sky-500/30'
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
                                        className="bg-pale-sky-500 h-full rounded-full transition-all duration-300"
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
                                    <FileText className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
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
                                    className="px-2.5 py-1 rounded-xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 transition-all flex items-center gap-1 cursor-pointer"
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
                                    className="p-1 rounded-xl bg-canvas border border-subtle text-muted hover:text-pale-sky-600 dark:hover:text-pale-sky-400 hover:bg-surface transition-colors cursor-pointer"
                                  >
                                    <Info className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    onClick={() => handleDeleteBook(book.id)}
                                    title="حذف"
                                    className="p-1 rounded-xl bg-canvas border border-subtle text-muted hover:text-red-500 hover:bg-surface transition-colors cursor-pointer"
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
              className="px-4 py-2 rounded-xl bg-pale-sky-500/10 border border-pale-sky-500/20 text-pale-sky-600 dark:text-pale-sky-300 font-bold text-xs hover:bg-pale-sky-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة ضبط كل الفلاتر</span>
            </button>
          </div>
        )}
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

      {/* Storage Cleaner Modal */}
      <StorageManagerModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
        books={books}
        onRemoveDuplicate={deleteBook}
      />

      {/* Import Wizard Modal (Story 6) */}
      <ImportWizardModal
        isOpen={isImportWizardOpen}
        initialPaths={droppedImportPaths}
        onClose={() => { setIsImportWizardOpen(false); setDroppedImportPaths([]); }}
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

      {/* Book Import & Discovery Progress Floating Pill */}
      {isImportingBook && (
        <div className="fixed bottom-6 end-6 z-50 bg-surface/95 dark:bg-canvas/95 border border-pale-sky-500/40 text-main px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
          <RefreshCw className="w-4 h-4 text-pale-sky-500 animate-spin shrink-0" />
          <span>{importMessage}</span>
        </div>
      )}

      {/* Save Success Toast */}
      {dropNotice && <div role={dropNotice.error ? 'alert' : 'status'} className={`fixed bottom-6 end-6 z-50 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold ${dropNotice.error ? 'bg-red-600 text-white' : 'bg-evergreen-600 text-white'}`}>
        {dropNotice.error ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
        <span>{dropNotice.text}</span>
      </div>}
      {saveToast && (
        <div className="fixed bottom-6 end-6 z-50 bg-evergreen-600 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-bottom-2 duration-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}
    </div>
  );
};
