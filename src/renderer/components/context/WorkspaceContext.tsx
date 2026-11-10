'use client';

import { openStudyNote } from '../../utils/study-navigation';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { BookItem } from '../../types/library';
import { translations, TranslationKey } from '../../translations';
import { removeTempSelectionOverlay, clearActiveSelectionHighlight } from '../../libs/reader/highlight-manager';

import type { CategoryNode } from '../../../shared/types/category';
import type { TagWithCount } from '../../../shared/types/tag';

export type LayoutDirection = 'rtl' | 'ltr';
export type ThemeMode = 'dark' | 'light';
export type LanguageMode = 'ar' | 'en';
export type SplitOrientationMode = 'vertical' | 'horizontal' | 'none' | 'full_notes';
export type WorkspaceViewMode = 'dashboard' | 'planner' | 'pathways' | 'lectures' | 'quran' | 'sunnah' | 'bayan' | 'library' | 'categories' | 'reader' | 'notes' | 'settings';

export interface PageNote {
  id: string;
  bookId: string;
  pageNumber: number;
  highlightedText?: string;
  content: string;
  createdAt: string;
}

export interface WorkspaceState {
  dir: LayoutDirection;
  theme: ThemeMode;
  lang: LanguageMode;
  isCommandPaletteOpen: boolean;
  isSearchHubOpen: boolean;
  isZenMode: boolean;
  isSidebarCollapsed: boolean;
  
  // Real Books Library State
  books: BookItem[];
  
  // Categories & Tags State (Story 10)
  categoryTree: CategoryNode[];
  allTags: TagWithCount[];

  // Single Book Reading Flow State
  activeBook: BookItem | null;
  readingPage: number;
  totalPages: number;
  splitOrientation: SplitOrientationMode;
  bookNotes: PageNote[];
  highlights: { id: string; pageNumber: number; text: string; color: string }[];

  // App Main View Mode
  viewMode: WorkspaceViewMode;
  activeLibraryCategory: string;
  isMobileNavOpen?: boolean;
  isSupportSheetOpen?: boolean;
}

interface WorkspaceContextType extends WorkspaceState {
  toggleDirection: () => void;
  toggleTheme: () => void;
  toggleLanguage: () => void;
  toggleZenMode: () => void;
  toggleSidebar: () => void;
  isMobileNavOpen?: boolean;
  setIsMobileNavOpen: (open: boolean) => void;
  toggleMobileNav: () => void;
  isSupportSheetOpen?: boolean;
  setIsSupportSheetOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSearchHubOpen: (open: boolean) => void;
  isImportWizardOpen: boolean;
  setIsImportWizardOpen: (open: boolean) => void;
  droppedImportPaths: string[];
  setDroppedImportPaths: (paths: string[]) => void;
  setViewMode: (mode: WorkspaceViewMode) => void;
  setActiveLibraryCategory: (catId: string) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  
  // Book Library Management
  refreshBooks: () => Promise<void>;
  refreshCategoryTree: () => Promise<void>;
  refreshTags: () => Promise<void>;
  addBook: (book: BookItem) => void;

  updateBook: (book: BookItem) => void;
  deleteBook: (bookId: string) => void;
  updateBookReadingStatus: (bookId: string, status: import('../../types/library').ReadingStatus, progress?: number) => Promise<void>;
  
  // Reader Flow
  openBookForReading: (book: BookItem) => void;
  closeReaderToLibrary: () => void;
  setReadingPage: (page: number) => void;
  setSplitOrientation: (mode: SplitOrientationMode) => void;
  
  // Notes & Highlights
  addPageNote: (note: { pageNumber: number; highlightedText?: string; content: string }) => void;
  deletePageNote: (noteId: string) => void;
  addHighlight: (pageNumber: number, text: string, color?: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);
const GlobalImportWizard = React.lazy(() => import('../library/ImportWizardModal').then(module => ({ default: module.ImportWizardModal })));

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize with canonical server defaults to guarantee 100% hydration match with SSR
  const [lang, setLang] = useState<LanguageMode>('ar');
  const [dir, setDir] = useState<LayoutDirection>('rtl');
  const [theme, setTheme] = useState<ThemeMode>('dark');

  // Synchronize client-persisted preferences from localStorage after initial hydration
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const savedLang = localStorage.getItem('baglib-lang');
        if (savedLang === 'en' || savedLang === 'ar') {
          setLang(savedLang);
          setDir(savedLang === 'ar' ? 'rtl' : 'ltr');
        }
        const savedTheme = localStorage.getItem('baglib-theme');
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setTheme(savedTheme);
        }
      } catch {}
    });
  }, []);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSearchHubOpen, setIsSearchHubOpen] = useState(false);
  const [isImportWizardOpen, setImportWizardOpen] = useState(false);
  const [droppedImportPaths, setDroppedImportPaths] = useState<string[]>([]);
  const [importStarted, setImportStarted] = useState(false);
  const [importRequest, setImportRequest] = useState(0);
  const setIsImportWizardOpen = (open: boolean) => {
    if (open) { setImportStarted(true); setImportRequest(value => value + 1); }
    setImportWizardOpen(open);
  };
  const [isZenMode, setIsZenMode] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSupportSheetOpen, setIsSupportSheetOpen] = useState(false);
  const toggleMobileNav = () => setIsMobileNavOpen((prev) => !prev);
  
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('dashboard');
  const [activeLibraryCategory, setActiveLibraryCategory] = useState<string>('ALL');
  
  // Pure Real Data (Zero Mock Items)
  const [books, setBooks] = useState<BookItem[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [allTags, setAllTags] = useState<TagWithCount[]>([]);
  const [activeBook, setActiveBook] = useState<BookItem | null>(null);
  const [readingPage, setReadingPage] = useState<number>(1);
  const [totalPages] = useState<number>(100);
  const [splitOrientation, setSplitOrientation] = useState<SplitOrientationMode>('none');

  const [bookNotes, setBookNotes] = useState<PageNote[]>([]);
  useEffect(() => {
    const refresh = () => {
      const api = window.electronAPI;
      if (api?.getAllNotes) void api.getAllNotes().then(notes => { if (Array.isArray(notes)) setBookNotes(notes); }).catch(() => {});
    };
    window.addEventListener('baglib:notes-changed', refresh);
    return () => window.removeEventListener('baglib:notes-changed', refresh);
  }, []);
  const [highlights, setHighlights] = useState<{ id: string; pageNumber: number; text: string; color: string }[]>([]);

  const toggleLanguage = () => {
    setLang((prev) => {
      const nextLang = prev === 'ar' ? 'en' : 'ar';
      const nextDir = nextLang === 'ar' ? 'rtl' : 'ltr';
      setDir(nextDir);
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try { localStorage.setItem('baglib-lang', nextLang); } catch {}
      }
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('lang', nextLang);
        document.documentElement.setAttribute('dir', nextDir);
      }
      return nextLang;
    });
  };

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    let text = translations[lang][key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return text;
  };

  const toggleDirection = () => setDir((prev) => (prev === 'rtl' ? 'ltr' : 'rtl'));
  const toggleZenMode = () => setIsZenMode((prev) => !prev);
  const toggleSidebar = () => setIsSidebarCollapsed((prev) => !prev);
  
  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try { localStorage.setItem('baglib-theme', next); } catch {}
      }
      if (typeof document !== 'undefined') {
        if (next === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
      return next;
    });
  };

  // Refresh books from SQLite database
  const refreshBooks = async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.getAllBooks) {
      try {
        const fetchedBooks: BookItem[] = await window.electronAPI.getAllBooks();
        if (Array.isArray(fetchedBooks)) {
          // Deduplicate fetchedBooks by unique ID and unique filePath
          const seenIds = new Set<string>();
          const seenPaths = new Set<string>();
          const uniqueBooks: BookItem[] = [];
          for (const book of fetchedBooks) {
            if (!book || !book.id || seenIds.has(book.id)) continue;
            if (book.filePath && seenPaths.has(book.filePath)) continue;
            seenIds.add(book.id);
            if (book.filePath) seenPaths.add(book.filePath);
            uniqueBooks.push(book);
          }
          setBooks(uniqueBooks);
        }
      } catch (err: unknown) {
        console.error('[baglib/ui] Failed to refresh books from database:', err);
      }
    }
  };

  // Refresh category tree with direct and recursive counts
  const refreshCategoryTree = async () => {
    if (typeof window !== 'undefined') {
      try {
        const api = window.electronAPI;
        if (api?.categories?.getTree) {
          const tree = await api.categories.getTree({ includeCounts: true });
          setCategoryTree(tree || []);
        } else if (api?.getCategoryTree) {
          const tree = await api.getCategoryTree({ includeCounts: true });
          setCategoryTree(tree || []);
        }
      } catch (err: unknown) {
        console.error('[baglib/ui] Failed to refresh category tree:', err);
      }
    }
  };

  // Refresh tags with work counts
  const refreshTags = async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.tags) {
      try {
        const tags = await (window.electronAPI).tags.getAll();
        setAllTags(tags || []);
      } catch (err: unknown) {
        console.error('[baglib/ui] Failed to refresh tags:', err);
      }
    }
  };

  // Load books, categories, tags, and notes from SQLite database on mount
  useEffect(() => {
    const api = window.electronAPI;
    let alive = true;
    if (typeof api?.getAllBooks === 'function') {
      void api.getAllBooks().then((fetchedBooks: BookItem[]) => {
        if (!alive || !Array.isArray(fetchedBooks)) return;
        const seenIds = new Set<string>(), seenPaths = new Set<string>();
        setBooks(fetchedBooks.filter(book => {
          if (!book?.id || seenIds.has(book.id) || book.filePath && seenPaths.has(book.filePath)) return false;
          seenIds.add(book.id); if (book.filePath) seenPaths.add(book.filePath); return true;
        }));
      }).catch(console.warn);
    }
    const categoriesRequest = api?.categories?.getTree?.({ includeCounts: true }) ?? api?.getCategoryTree?.({ includeCounts: true });
    void categoriesRequest?.then(tree => { if (alive) setCategoryTree(tree || []); }).catch(console.warn);
    void api?.tags?.getAll?.().then(tags => { if (alive) setAllTags(tags || []); }).catch(console.warn);
    if (typeof window !== 'undefined' && typeof window.electronAPI?.getAllNotes === 'function') {
      (window.electronAPI)
        .getAllNotes()
        .then((fetchedNotes: PageNote[]) => {
          if (Array.isArray(fetchedNotes)) {
            setBookNotes(fetchedNotes);
          }
        })
        .catch((err) => {
          console.error('[baglib/ui] Failed to load notes from database:', err);
        });
    }
    return () => { alive = false; };
  }, []);

  // Add or Update book in library with SQLite persistence
  const addBook = async (newBook: BookItem) => {
    // 1. Optimistic state update so UI changes immediately
    setBooks((prev) => {
      const existingIdx = prev.findIndex(
        (b) => (b.id && b.id === newBook.id) || (newBook.filePath && b.filePath === newBook.filePath)
      );

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], ...newBook };
        return updated.filter(
          (b, i) => i === existingIdx || (b.id !== newBook.id && (!newBook.filePath || b.filePath !== newBook.filePath))
        );
      }
      const filtered = prev.filter(
        (b) => b.id !== newBook.id && (!newBook.filePath || b.filePath !== newBook.filePath)
      );
      return [newBook, ...filtered];
    });

    // Sync activeBook if currently open in reader
    setActiveBook((prev) => (prev && prev.id === newBook.id ? { ...prev, ...newBook } : prev));

    // 2. Persist to SQLite
    if (typeof window !== 'undefined' && window.electronAPI?.addBook) {
      try {
        const savedBook = await window.electronAPI.addBook(newBook);
        if (savedBook && savedBook.id) {
          setBooks((prev) => {
            const idx = prev.findIndex((b) => b.id === savedBook.id || (newBook.id && b.id === newBook.id));
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...newBook, ...savedBook };
              return updated.filter((b, i) => i === idx || b.id !== savedBook.id);
            }
            const filtered = prev.filter((b) => b.id !== savedBook.id);
            return [{ ...newBook, ...savedBook }, ...filtered];
          });
          setActiveBook((prev) => (prev && (prev.id === savedBook.id || prev.id === newBook.id) ? { ...prev, ...savedBook } : prev));
        }
      } catch (err) {
        console.error('[baglib/ui] Failed to persist book to SQLite:', err);
      }
    }
  };

  const updateBook = async (updatedBook: BookItem) => {
    // 1. Optimistic state update so UI changes immediately
    setBooks((prev) => {
      const existingIdx = prev.findIndex(
        (b) => (b.id && b.id === updatedBook.id) || (updatedBook.filePath && b.filePath === updatedBook.filePath)
      );

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], ...updatedBook };
        return updated.filter(
          (b, i) => i === existingIdx || (b.id !== updatedBook.id && (!updatedBook.filePath || b.filePath !== updatedBook.filePath))
        );
      }
      const filtered = prev.filter(
        (b) => b.id !== updatedBook.id && (!updatedBook.filePath || b.filePath !== updatedBook.filePath)
      );
      return [updatedBook, ...filtered];
    });

    // Sync activeBook if currently open in reader
    setActiveBook((prev) => (prev && prev.id === updatedBook.id ? { ...prev, ...updatedBook } : prev));

    // 2. Persist to SQLite
    if (typeof window !== 'undefined') {
      const api = window.electronAPI;
      try {
        if (api?.updateBook) {
          const res = await api.updateBook(updatedBook);
          if (res && res.id) {
            setBooks((prev) => {
              const idx = prev.findIndex((b) => b.id === res.id || (updatedBook.id && b.id === updatedBook.id));
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...updatedBook, ...res };
                return next.filter((b, i) => i === idx || b.id !== res.id);
              }
              return prev;
            });
            setActiveBook((prev) => (prev && (prev.id === res.id || prev.id === updatedBook.id) ? { ...prev, ...res } : prev));
          }
        } else if (api?.addBook) {
          const savedBook = await api.addBook(updatedBook);
          if (savedBook && savedBook.id) {
            setBooks((prev) => {
              const idx = prev.findIndex((b) => b.id === savedBook.id || (updatedBook.id && b.id === savedBook.id));
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...updatedBook, ...savedBook };
                return next.filter((b, i) => i === idx || b.id !== savedBook.id);
              }
              return prev;
            });
            setActiveBook((prev) => (prev && (prev.id === savedBook.id || prev.id === updatedBook.id) ? { ...prev, ...savedBook } : prev));
          }
        }
      } catch (err) {
        console.error('[baglib/ui] Failed to update book in SQLite:', err);
      }
    }
  };


  // Direct fast reading status updater
  const updateBookReadingStatus = async (
    bookId: string,
    status: import('../../types/library').ReadingStatus,
    progress?: number
  ) => {
    const calcProgress = typeof progress === 'number'
      ? progress
      : (status === 'completed' ? 100 : (status === 'unread' ? 0 : undefined));

    // Optimistic UI update
    setBooks((prev) =>
      prev.map((b) => {
        if (b.id !== bookId) return b;
        return {
          ...b,
          readingStatus: status,
          readingProgress: calcProgress !== undefined ? calcProgress : (b.readingProgress || 0),
        };
      })
    );

    if (typeof window !== 'undefined') {
      const api = window.electronAPI;
      if (api?.updateReadingStatus) {
        try {
          await api.updateReadingStatus(bookId, status, calcProgress);
        } catch (err) {
          console.error('[baglib/ui] Failed to update reading status in SQLite:', err);
        }
      } else if (api?.addBook) {
        const current = books.find((b) => b.id === bookId);
        if (current) {
          api.addBook({
            ...current,
            readingStatus: status,
            readingProgress: calcProgress !== undefined ? calcProgress : (current.readingProgress || 0),
          }).catch(console.error);
        }
      }
    }
  };

  const deleteBook = async (bookId: string) => {
    if (typeof window !== 'undefined' && window.electronAPI?.deleteBook) {
      try {
        await window.electronAPI.deleteBook(bookId);
      } catch (err) {
        console.error('[baglib/ui] Failed to delete book from SQLite:', err);
      }
    }

    setBooks((prev) => prev.filter((b) => b.id !== bookId));
    if (activeBook?.id === bookId) {
      setActiveBook(null);
      setViewMode('library');
    }
  };

  const safeSetViewMode = (mode: WorkspaceViewMode) => {
    setIsMobileNavOpen(false);
    if (viewMode === 'reader' && mode !== 'reader') {
      try {
        removeTempSelectionOverlay();
        clearActiveSelectionHighlight();
        if (typeof window !== 'undefined') {
          window.getSelection()?.removeAllRanges();
        }
      } catch {}
    }
    setViewMode(mode);
  };

  const openBookForReading = (book: BookItem) => {
    try {
      removeTempSelectionOverlay();
      clearActiveSelectionHighlight();
      if (typeof window !== 'undefined') {
        window.getSelection()?.removeAllRanges();
      }
    } catch {}
    setActiveBook(book);
    setViewMode('reader');
    setReadingPage(1);
    setSplitOrientation('none');
  };

  const closeReaderToLibrary = () => {
    try {
      removeTempSelectionOverlay();
      clearActiveSelectionHighlight();
      if (typeof window !== 'undefined') {
        window.getSelection()?.removeAllRanges();
      }
    } catch {}
    setViewMode('library');
  };

  const addPageNote = async ({ pageNumber, highlightedText, content }: { pageNumber: number; highlightedText?: string; content: string }) => {
    if (!content.trim() || !activeBook) return;
    const newNote: PageNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      bookId: activeBook.id,
      pageNumber,
      highlightedText,
      content,
      createdAt: new Date().toISOString(),
    };

    if (typeof window !== 'undefined' && typeof window.electronAPI?.addNote === 'function') {
      try {
        await (window.electronAPI).addNote(newNote);
      } catch (err) {
        console.error('[baglib/ui] Failed to persist note to SQLite:', err);
      }
    }

    setBookNotes((prev) => [newNote, ...prev]);
  };

  const deletePageNote = async (noteId: string) => {
    if (typeof window !== 'undefined' && typeof window.electronAPI?.deleteNote === 'function') {
      try {
        await (window.electronAPI).deleteNote(noteId);
      } catch (err) {
        console.error('[baglib/ui] Failed to delete note from SQLite:', err);
      }
    }
    setBookNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  const addHighlight = (pageNumber: number, text: string, color = 'bg-amber-500/30') => {
    if (!text.trim()) return;
    setHighlights((prev) => [
      ...prev,
      { id: `hl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, pageNumber, text, color }
    ]);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+N anywhere: a new note, ready to type.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openStudyNote({ content: '' });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = dir;
      document.documentElement.lang = dir === 'rtl' ? 'ar' : 'en';
    }
  }, [dir]);

  return (
    <WorkspaceContext.Provider
      value={{
        dir,
        theme,
        lang,
        isCommandPaletteOpen,
        isZenMode,
        isSidebarCollapsed,
        isMobileNavOpen,
        setIsMobileNavOpen,
        toggleMobileNav,
        isSupportSheetOpen,
        setIsSupportSheetOpen,
        books,
        categoryTree,
        allTags,
        activeBook,
        readingPage,
        totalPages,
        splitOrientation,
        bookNotes,
        highlights,
        viewMode,
        toggleDirection,
        toggleTheme,
        toggleLanguage,
        t,
        toggleZenMode,
        toggleSidebar,
        setCommandPaletteOpen: setIsCommandPaletteOpen,
        isSearchHubOpen,
        setSearchHubOpen: setIsSearchHubOpen,
        isImportWizardOpen,
        setIsImportWizardOpen,
        droppedImportPaths,
        setDroppedImportPaths: paths => { if (!isImportWizardOpen) setDroppedImportPaths(paths); },
        setViewMode: safeSetViewMode,
        activeLibraryCategory,
        setActiveLibraryCategory,
        refreshBooks,
        refreshCategoryTree,
        refreshTags,
        addBook,
        updateBook,
        deleteBook,

        updateBookReadingStatus,
        openBookForReading,
        closeReaderToLibrary,
        setReadingPage,
        setSplitOrientation,
        addPageNote,
        deletePageNote,
        addHighlight,
      }}
    >
      {children}
      {importStarted && <React.Suspense fallback={null}><GlobalImportWizard isOpen={isImportWizardOpen} initialPaths={droppedImportPaths} requestId={importRequest} onClose={() => { setImportWizardOpen(false); setDroppedImportPaths([]); }} /></React.Suspense>}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
