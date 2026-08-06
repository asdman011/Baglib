'use client';

import React, { useState, useRef, useMemo } from 'react';
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
  RotateCcw
} from 'lucide-react';
import { BookItem } from '../../types/library';
import { BookDetailModal } from './BookDetailModal';
import { OnlineLibraryHub } from './OnlineLibraryHub';
import { StorageManagerModal } from './StorageManagerModal';
import { useWorkspace } from '../context/WorkspaceContext';

export const LibraryGridView: React.FC = () => {
  const { books, addBook, deleteBook, openBookForReading } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');

  // Scalable Filter States
  const [selectedBookType, setSelectedBookType] = useState<string>('ALL');
  const [selectedFormat, setSelectedFormat] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [lendingStatus, setLendingStatus] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'title' | 'author' | 'year'>('newest');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal States
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isOnlineHubOpen, setIsOnlineHubOpen] = useState(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);

  // Dynamically extract categories & tags from user's actual library books
  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => b.categories?.forEach((c) => set.add(c)));
    return Array.from(set);
  }, [books]);

  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => b.tags?.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [books]);

  // Scalable Multi-dimensional Filter Engine
  const filteredAndSortedBooks = useMemo(() => {
    return books
      .filter((b) => {
        // 1. Full text search
        const matchesSearch =
          !searchQuery.trim() ||
          b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (b.shelf && b.shelf.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (b.room && b.room.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (b.isbn && b.isbn.includes(searchQuery)) ||
          b.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
          b.categories.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase()));

        if (!matchesSearch) return false;

        // 2. Book Type filter
        if (selectedBookType === 'digital' && b.bookType !== 'digital') return false;
        if (selectedBookType === 'physical' && b.bookType !== 'physical' && b.bookType !== 'hybrid') return false;
        if (selectedBookType === 'hybrid' && b.bookType !== 'hybrid') return false;

        // 3. Digital Format filter
        if (selectedFormat !== 'ALL' && b.digitalFormat !== selectedFormat) return false;

        // 4. Category filter
        if (selectedCategory !== 'ALL' && !b.categories.includes(selectedCategory)) return false;

        // 5. Tag filter
        if (selectedTag !== 'ALL' && !b.tags.includes(selectedTag)) return false;

        // 6. Lending Status filter
        const isCurrentlyLent = b.lendingHistory.some((l) => !l.isReturned);
        if (lendingStatus === 'AVAILABLE' && isCurrentlyLent) return false;
        if (lendingStatus === 'LENT' && !isCurrentlyLent) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title, 'ar');
        if (sortBy === 'author') return a.author.localeCompare(b.author, 'ar');
        if (sortBy === 'year') {
          const yearA = parseInt(String(a.publicationYear || 0)) || 0;
          const yearB = parseInt(String(b.publicationYear || 0)) || 0;
          return yearB - yearA;
        }
        return b.id.localeCompare(a.id);
      });
  }, [books, searchQuery, selectedBookType, selectedFormat, selectedCategory, selectedTag, lendingStatus, sortBy]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedBookType !== 'ALL' ||
    selectedFormat !== 'ALL' ||
    selectedCategory !== 'ALL' ||
    selectedTag !== 'ALL' ||
    lendingStatus !== 'ALL';

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedBookType('ALL');
    setSelectedFormat('ALL');
    setSelectedCategory('ALL');
    setSelectedTag('ALL');
    setLendingStatus('ALL');
    setSortBy('newest');
  };

  const handleSaveBook = (updatedBook: BookItem) => {
    addBook(updatedBook);
  };

  const handleDeleteBook = (id: string) => {
    deleteBook(id);
    setIsDetailModalOpen(false);
  };

  const handleAddNewBook = () => {
    const newBook: BookItem = {
      id: `book-${Date.now()}`,
      title: 'كتاب جديد في المكتبة',
      author: 'مؤلف جديد',
      language: 'العربية',
      categories: ['مؤلفات حديثة'],
      tags: ['#جديد'],
      bookType: 'physical',
      lendingHistory: [],
      shelf: 'رف المكتبة الرئيسية',
      room: 'المكتبة الرئيسية',
    };
    setSelectedBook(newBook);
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
        author: 'مؤلف غير محدد',
        digitalFormat: ext as any,
        bookType: 'digital',
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
      author: 'مؤلف غير محدد',
      digitalFormat: ext as any,
      bookType: 'digital',
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
      author: partialBook.author || 'غير معروف',
      publisher: partialBook.publisher,
      digitalFormat: partialBook.digitalFormat || 'PDF',
      bookType: 'digital',
      language: partialBook.language || 'العربية',
      categories: partialBook.categories || ['مستورد من الإنترنت'],
      tags: ['#مستورد_رقمي'],
      lendingHistory: [],
      onlineSource: partialBook.onlineSource as any,
    };
    addBook(imported);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas overflow-hidden font-sans select-none" dir="rtl">
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
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-pale-sky-500/10 border border-pale-sky-500/20 flex items-center justify-center text-pale-sky-500 font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-main text-base font-display">المكتبة العلمية والشخصية</h2>
              <p className="text-xs text-muted">إدارة وتقسيم كتبك الفيزيائية والدراسات الرقمية بمرونة كاملة</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Pick Any Book Format from Computer */}
            <button
              onClick={handleOpenBookFromDevice}
              title="اختر أي كتاب من جهازك (PDF, EPUB, MOBI, AZW3, TXT, HTML) لفتحه وقراءته فوراً"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 shadow-md shadow-pale-sky-500/20 transition-all cursor-pointer"
            >
              <FolderOpen className="w-4 h-4" />
              <span>اختيار كتاب من الجهاز</span>
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
              <span>إضافة كتاب يدوي</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar — Render ONLY when there are books in the library */}
        {books.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 lg:grid-cols-12 gap-2 text-xs">
              {/* Search Input */}
              <div className="lg:col-span-4 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-canvas border border-subtle">
                <Search className="w-4 h-4 text-pale-sky-500 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث بالعنوان، المؤلف، الرف، ISBN، الوسوم..."
                  className="w-full bg-transparent outline-none text-main placeholder:text-muted font-sans text-xs"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-muted hover:text-main">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter 1: Type Dropdown */}
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

              {/* Filter 2: Digital Format Dropdown */}
              <div className="lg:col-span-2 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-canvas border border-subtle">
                <Filter className="w-3.5 h-3.5 text-muted shrink-0" />
                <select
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value)}
                  className="w-full bg-transparent outline-none text-main cursor-pointer font-sans text-xs"
                >
                  <option value="ALL">الصيغة الرقمية: الكل</option>
                  <option value="PDF">PDF</option>
                  <option value="EPUB">EPUB</option>
                  <option value="MOBI">MOBI</option>
                  <option value="AZW3">AZW3</option>
                  <option value="HTML">HTML</option>
                  <option value="TXT">TXT</option>
                </select>
              </div>

              {/* Filter 3: Dynamic Category / Collection Dropdown */}
              <div className="lg:col-span-2 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-canvas border border-subtle">
                <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full bg-transparent outline-none text-main cursor-pointer font-sans text-xs truncate"
                >
                  <option value="ALL">التصنيفات: الكل</option>
                  {uniqueCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter 4: Sort Selector */}
              <div className="lg:col-span-2 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-canvas border border-subtle">
                <ArrowUpDown className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full bg-transparent outline-none text-main cursor-pointer font-sans text-xs"
                >
                  <option value="newest">الأحدث أضيفت</option>
                  <option value="title">العنوان (أ-ي)</option>
                  <option value="author">اسم المؤلف</option>
                  <option value="year">سنة النشر</option>
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
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all shrink-0 ${
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
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all shrink-0 ${
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

      {/* Main Books Grid / Empty States */}
      <div className="flex-1 overflow-y-auto p-6">
        {books.length === 0 ? (
          /* STATE A: Completely Empty Library (0 books in state) */
          <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-xl mx-auto space-y-5">
            <div className="w-24 h-24 rounded-3xl bg-pale-sky-500/10 border border-pale-sky-500/20 flex items-center justify-center text-pale-sky-500 shadow-xl">
              <FolderOpen className="w-12 h-12" />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-xl text-main font-display">مرحباً بك في مكتبتك البحثية</h3>
              <p className="text-xs text-muted leading-relaxed">
                لم تقم بإضافة كتب حتى الآن. يمكنك اختيار ملف كتاب (PDF, EPUB, MOBI, TXT) من حاسوبك لقراءته فوراً وتدوين الملاحظات والتظليلات، أو إضافة سجلات كتبك الفيزيائية.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={handleOpenBookFromDevice}
                className="px-6 py-3 rounded-2xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 shadow-lg shadow-pale-sky-500/20 transition-all flex items-center gap-2 cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
                <span>اختيار كتاب من الجهاز</span>
              </button>
              <button
                onClick={handleAddNewBook}
                className="px-5 py-3 rounded-2xl bg-surface border border-subtle text-main font-bold text-xs hover:bg-canvas transition-all flex items-center gap-2 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>إضافة كتاب يدوي</span>
              </button>
            </div>
          </div>
        ) : filteredAndSortedBooks.length > 0 ? (
          /* STATE B: Books matching filter */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredAndSortedBooks.map((book) => {
              const activeLend = book.lendingHistory.find((l) => !l.isReturned);

              return (
                <div
                  key={book.id}
                  className="group relative bg-surface border border-subtle hover:border-pale-sky-500/50 rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 hover:shadow-xl overflow-hidden space-y-3"
                >
                  {/* Format / Lending Badges Top */}
                  <div className="flex items-center justify-between z-10">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 font-bold border border-pale-sky-500/20 font-mono">
                      {book.digitalFormat || 'فيزيائي'}
                    </span>

                    {activeLend ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 font-bold">
                        مستعار ({activeLend.borrowerName})
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-evergreen-500/10 text-evergreen-600 font-semibold">
                        متوفر بالرف
                      </span>
                    )}
                  </div>

                  {/* Cover & Title */}
                  <div
                    onClick={() => openBookForReading(book)}
                    className="space-y-3 flex-1 cursor-pointer"
                  >
                    {book.coverImage && (
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
                    )}

                    <div className="space-y-1">
                      <h3 className="font-bold text-main text-sm leading-snug line-clamp-2 group-hover:text-pale-sky-500 transition-colors">
                        {book.title}
                      </h3>
                      <p className="text-xs text-muted font-serif line-clamp-1">{book.author}</p>
                    </div>

                    {/* Categories & Tags Preview */}
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      {book.categories.slice(0, 2).map((cat) => (
                        <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded bg-canvas border border-subtle text-muted">
                          {cat}
                        </span>
                      ))}
                      {book.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Physical Location Badge */}
                  <div className="pt-2 border-t border-subtle/60 space-y-2 text-[11px]">
                    {book.shelf && (
                      <div className="flex items-center gap-1.5 text-muted truncate">
                        <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="truncate">{book.shelf}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => openBookForReading(book)}
                        className="flex-1 py-1.5 rounded-xl bg-pale-sky-500 text-white text-xs font-bold hover:bg-pale-sky-600 transition-all flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>قراءة الكتاب</span>
                      </button>

                      <button
                        onClick={() => {
                          setSelectedBook(book);
                          setIsDetailModalOpen(true);
                        }}
                        title="تعديل بيانات الكتاب والرف والسجل"
                        className="p-1.5 rounded-xl bg-canvas border border-subtle text-muted hover:text-main hover:bg-surface transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* STATE C: Books exist in library, but active filters returned 0 matches */
          <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-surface border border-subtle flex items-center justify-center text-pale-sky-500 shadow-inner">
              <Search className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-main font-display">لم يتم العثور على كتب تطابق الفلاتر</h3>
              <p className="text-xs text-muted max-w-md">
                جرّب تعديل مصطلحات البحث أو إعادة ضبط الفلاتر المحددة للوصول إلى كتب ومخطوطات مكتبتك.
              </p>
            </div>
            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                className="px-4 py-2 rounded-xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 shadow-md shadow-pale-sky-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>إعادة ضبط الفلاتر</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Book Metadata & Lending Modal */}
      <BookDetailModal
        book={selectedBook}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onSave={handleSaveBook}
        onDelete={handleDeleteBook}
      />

      {/* Online Hub Modal */}
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
        onRemoveDuplicate={handleDeleteBook}
      />
    </div>
  );
};
