'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  Globe,
  HardDrive,
  MapPin,
  Edit3,
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
  FileText
} from 'lucide-react';
import { BookItem, ReadingStatus } from '../../types/library';
import { BookDetailModal } from './BookDetailModal';
import { OnlineLibraryHub } from './OnlineLibraryHub';
import { StorageManagerModal } from './StorageManagerModal';
import { useWorkspace } from '../context/WorkspaceContext';
import { matchesSearchQuery } from '../../utils/search';

export type SortField = 'newest' | 'title' | 'author' | 'year' | 'category' | 'format' | 'status' | 'location';
export type SortDirection = 'asc' | 'desc';

export const LibraryGridView: React.FC = () => {
  const {
    books,
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

  // View Mode: Grid or List
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Scalable Filter States
  const [selectedBookType, setSelectedBookType] = useState<string>('ALL');
  const [selectedReadingStatus, setSelectedReadingStatus] = useState<string>('ALL');
  const [selectedFormat, setSelectedFormat] = useState<string>('ALL');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [lendingStatus, setLendingStatus] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('newest');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal States
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isNewBook, setIsNewBook] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [isOnlineHubOpen, setIsOnlineHubOpen] = useState(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);

  // Fetch all categories for filter and modal
  const [allCategories, setAllCategories] = useState<{ id: string, nameAr: string, nameEn: string }[]>([]);
  useEffect(() => {
    async function fetchCats() {
      if (typeof window !== 'undefined' && window.electronAPI) {
        try {
          const tree = await window.electronAPI.getCategoryTree() as any[];
          const flat: { id: string, nameAr: string, nameEn: string }[] = [];
          const flatten = (nodes: any[]) => {
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
    return books
      .filter((b) => {
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
        if (lendingStatus === 'AVAILABLE' && isCurrentlyLent) return false;
        if (lendingStatus === 'LENT' && !isCurrentlyLent) return false;

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
  }, [books, searchQuery, selectedBookType, selectedReadingStatus, selectedFormat, activeLibraryCategory, selectedTag, lendingStatus, sortField, sortDirection, lang]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedBookType !== 'ALL' ||
    selectedReadingStatus !== 'ALL' ||
    selectedFormat !== 'ALL' ||
    activeLibraryCategory !== 'ALL' ||
    selectedTag !== 'ALL' ||
    lendingStatus !== 'ALL' ||
    sortField !== 'newest';

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedBookType('ALL');
    setSelectedReadingStatus('ALL');
    setSelectedFormat('ALL');
    setActiveLibraryCategory('ALL');
    setSelectedTag('ALL');
    setLendingStatus('ALL');
    setSortField('newest');
    setSortDirection('desc');
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
      id: `work-${Date.now()}`,
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


  // Open Native Electron File Dialog
  const handleOpenBookFromDevice = async () => {
    const windowAPI = (window as any).electronAPI;

    if (windowAPI?.openFileDialog) {
      const fullPath: string | null = await windowAPI.openFileDialog();
      if (!fullPath) return;

      const pathSegments = fullPath.split(/[/\\]/);
      const fileNameWithExt = pathSegments[pathSegments.length - 1];
      const fileName = fileNameWithExt.replace(/\.[^/.]+$/, "");
      const ext = fileNameWithExt.split('.').pop()?.toUpperCase() || 'PDF';

      const newDigitalBook: BookItem = {
        id: `book-local-${Date.now()}`,
        title: fileName,
        author: t('noAuthor'),
        digitalFormat: ext as any,
        bookType: 'digital',
        readingStatus: 'reading',
        readingProgress: 0,
        filePath: fullPath,
        fileSize: '1.5 MB',
        language: 'العربية',
        categories: ['ملفات رقمية محددة'],
        tags: [`#${ext}`],
        lendingHistory: [],
      };

      addBook(newDigitalBook);
      openBookForReading(newDigitalBook);
    } else {
      fileInputRef.current?.click();
    }
  };

  // Handle HTML fallback selection
  const handleFileSelectFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    const ext = file.name.split('.').pop()?.toUpperCase() || 'PDF';
    const filePath = (file as any).path || file.name;

    const newDigitalBook: BookItem = {
      id: `book-local-${Date.now()}`,
      title: fileName,
      author: t('noAuthor'),
      digitalFormat: ext as any,
      bookType: 'digital',
      readingStatus: 'reading',
      readingProgress: 0,
      filePath,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      language: 'العربية',
      categories: ['ملفات رقمية محددة'],
      tags: [`#${ext}`],
      lendingHistory: [],
    };

    addBook(newDigitalBook);
    openBookForReading(newDigitalBook);
  };

  const handleImportOnlineBook = (partialBook: Partial<BookItem>) => {
    const imported: BookItem = {
      id: `book-${Date.now()}`,
      title: partialBook.title || 'كتاب مستورد',
      author: partialBook.author || t('noAuthor'),
      publisher: partialBook.publisher,
      digitalFormat: partialBook.digitalFormat || 'PDF',
      bookType: 'digital',
      readingStatus: 'unread',
      language: partialBook.language || 'العربية',
      categories: partialBook.categories || ['مستورد من الإنترنت'],
      tags: ['#مستورد_رقمي'],
      lendingHistory: [],
      onlineSource: partialBook.onlineSource as any,
    };
    addBook(imported);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas overflow-hidden font-sans select-none">
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
                onClick={() => setViewMode('grid')}
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
                onClick={() => setViewMode('list')}
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

            {/* Import Book Button */}
            <button
              onClick={handleOpenBookFromDevice}
              title="استيراد كتاب من جهازك (PDF, EPUB, MOBI, AZW3, TXT, HTML)"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 shadow-md shadow-pale-sky-500/20 transition-all cursor-pointer"
            >
              <FolderOpen className="w-4 h-4" />
              <span>{t('importBook') || 'استيراد كتاب'}</span>
            </button>

            {/* Storage Cleaner */}
            <button
              onClick={() => setIsStorageModalOpen(true)}
              title="إدارة القرص وتنظيف الملفات المكررة"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-subtle hover:bg-surface text-muted hover:text-main text-xs font-semibold transition-all cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5 text-pale-sky-500" />
              <span className="hidden sm:inline">تنظيف المكررات</span>
            </button>

            {/* Online Hub Connector */}
            <button
              onClick={() => setIsOnlineHubOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pale-sky-500/10 border border-pale-sky-500/30 text-pale-sky-600 dark:text-pale-sky-300 text-xs font-bold hover:bg-pale-sky-500/20 transition-all cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>المكتبات المفتوحة & RSS</span>
            </button>

            {/* Add Book Details */}
            <button
              onClick={handleAddNewBook}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-subtle text-main text-xs font-bold hover:bg-surface transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t('addBook')}</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar — Render ONLY when there are books in the library */}
        {books.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 lg:grid-cols-12 gap-2 text-xs">
              {/* Search Input */}
              <div className="lg:col-span-3 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-canvas border border-subtle">
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

              {/* Filter 4: Category Dropdown */}
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

              {/* Filter 5: Sort Selector */}
              <div className="lg:col-span-2 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-canvas border border-subtle">
                <ArrowUpDown className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
                <select
                  value={sortField}
                  onChange={(e) => {
                    const f = e.target.value as SortField;
                    setSortField(f);
                    setSortDirection(f === 'newest' || f === 'year' ? 'desc' : 'asc');
                  }}
                  className="w-full bg-transparent outline-none text-main cursor-pointer font-sans text-xs"
                >
                  <option value="newest">{t('sortNewest') || 'الأحدث أضيفت'}</option>
                  <option value="title">{t('sortTitle') || 'العنوان (أ-ي)'}</option>
                  <option value="author">{t('sortAuthor') || 'اسم المؤلف'}</option>
                  <option value="year">{t('sortYear') || 'سنة النشر'}</option>
                  <option value="category">{t('sortCategory') || 'التصنيف'}</option>
                  <option value="status">{t('colStatus') || 'حالة القراءة'}</option>
                  <option value="format">{t('sortFormat') || 'الصيغة والنوع'}</option>
                </select>
              </div>
            </div>

            {/* Dynamic Tags & Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full">
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
                  عرض <strong className="text-main">{filteredAndSortedBooks.length}</strong> من أصل{' '}
                  <strong className="text-main">{books.length}</strong> كتاب
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
                onClick={handleOpenBookFromDevice}
                className="px-6 py-3 rounded-2xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 shadow-lg shadow-pale-sky-500/20 transition-all flex items-center gap-2 cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
                <span>{t('importBook') || 'اختيار كتاب من الجهاز'}</span>
              </button>
              <button
                onClick={handleAddNewBook}
                className="px-5 py-3 rounded-2xl bg-surface border border-subtle text-main font-bold text-xs hover:bg-canvas transition-all flex items-center gap-2 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{t('addBook')}</span>
              </button>
            </div>
          </div>
        ) : filteredAndSortedBooks.length > 0 ? (
          viewMode === 'grid' ? (
            /* STATE B1: Books matching filter — GRID VIEW */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {filteredAndSortedBooks.map((book) => {
                const activeLend = book.lendingHistory.find((l) => !l.isReturned);
                const readingStatus = book.readingStatus || 'unread';

                return (
                  <div
                    key={book.id}
                    className="group relative bg-surface border border-subtle hover:border-pale-sky-500/50 rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 hover:shadow-xl overflow-hidden space-y-3"
                  >
                    {/* Format / Reading / Lending Badges Top */}
                    <div className="flex items-center justify-between gap-1 z-10 flex-wrap">
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
                              updateBookReadingStatus(book.id, e.target.value as any);
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
                      </div>

                      {activeLend && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 font-bold">
                          مستعار ({activeLend.borrowerName})
                        </span>
                      )}
                    </div>

                    {/* Cover & Title */}
                    <div
                      onClick={() => openBookForReading(book)}
                      className="space-y-3 flex-1 cursor-pointer"
                    >
                      {book.coverImage ? (
                        <div className="w-full h-44 rounded-xl overflow-hidden bg-canvas border border-subtle shadow-inner relative group-hover:opacity-95 transition-opacity">
                          <img
                            src={book.coverImage}
                            alt={book.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
                        <p className="text-xs text-muted font-serif line-clamp-1">{book.author}</p>
                      </div>

                      {/* Categories & Tags Preview */}
                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        {book.primaryCategory && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-canvas border border-subtle text-muted">
                            {lang === 'ar' ? book.primaryCategory.nameAr : book.primaryCategory.nameEn}
                          </span>
                        )}
                        {book.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Physical Location Badge & Actions */}
                    <div className="pt-2 border-t border-subtle/60 space-y-2 text-[11px]">
                      {book.shelf && (
                        <div className="flex items-center gap-1.5 text-muted truncate">
                          <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="truncate">{book.shelf}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => openBookForReading(book)}
                          className="flex-1 py-1.5 rounded-xl bg-pale-sky-500 text-white text-xs font-bold hover:bg-pale-sky-600 transition-all flex items-center justify-center gap-1 shadow-sm cursor-pointer"
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
                          title="تعديل بيانات الكتاب والرف والسجل"
                          className="p-1.5 rounded-xl bg-canvas border border-subtle text-muted hover:text-main hover:bg-surface transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
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
          ) : (
            /* STATE B2: Books matching filter — LIST VIEW */
            <div className="bg-surface border border-subtle rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-subtle bg-canvas/60 text-muted font-bold text-[11px]">
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
                      <th className="py-3 px-4 text-end">{t('colActions') || 'الإجراءات'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle/60">
                    {filteredAndSortedBooks.map((book) => {
                      const readingStatus = book.readingStatus || 'unread';

                      return (
                        <tr
                          key={book.id}
                          className="hover:bg-canvas/40 transition-colors group"
                        >
                          {/* Title & Author */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {book.coverImage ? (
                                <img
                                  src={book.coverImage}
                                  alt={book.title}
                                  className="w-10 h-14 object-cover rounded-lg border border-subtle shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-14 rounded-lg bg-canvas border border-subtle flex items-center justify-center text-muted shrink-0">
                                  <BookOpen className="w-5 h-5 opacity-40" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div
                                  onClick={() => openBookForReading(book)}
                                  className="font-bold text-main hover:text-pale-sky-500 cursor-pointer truncate text-sm"
                                  title={book.title}
                                >
                                  {book.title}
                                </div>
                                <div className="text-muted text-[11px] truncate">{book.author}</div>
                                {book.publicationYear && (
                                  <div className="text-[10px] text-muted/80">{book.publicationYear}</div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Category */}
                          <td className="py-3 px-4 hidden sm:table-cell">
                            <div className="space-y-1">
                              {book.primaryCategory && (
                                <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-canvas border border-subtle text-muted">
                                  {lang === 'ar' ? book.primaryCategory.nameAr : book.primaryCategory.nameEn}
                                </span>
                              )}
                              {book.tags.length > 0 && (
                                <div className="text-[10px] text-amber-600 dark:text-amber-400 font-mono truncate max-w-[150px]">
                                  {book.tags.slice(0, 2).join(' ')}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Format & Type */}
                          <td className="py-3 px-4 hidden md:table-cell">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 font-bold border border-pale-sky-500/20 font-mono">
                              {book.digitalFormat || t('physicalBook')}
                            </span>
                          </td>

                          {/* Reading Status Selector & Progress */}
                          <td className="py-3 px-4">
                            <div className="space-y-1.5 max-w-[140px]">
                              <select
                                value={readingStatus}
                                onChange={(e) => updateBookReadingStatus(book.id, e.target.value as any)}
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

                          {/* Location / Shelf */}
                          <td className="py-3 px-4 hidden lg:table-cell text-muted text-[11px]">
                            {book.shelf ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span className="truncate max-w-[140px]">{book.shelf}</span>
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

                          {/* Actions */}
                          <td className="py-3 px-4 text-end">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openBookForReading(book)}
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
                                title="تعديل"
                                className="p-1 rounded-xl bg-canvas border border-subtle text-muted hover:text-main hover:bg-surface transition-colors cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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

      {/* Save Success Toast */}
      {saveToast && (
        <div className="fixed bottom-6 end-6 z-50 bg-evergreen-600 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-bottom-2 duration-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}
    </div>
  );
};
