'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { BookItem } from '../../types/library';
import { translations, TranslationKey } from '../../translations';

import type { CategoryNode } from '../../../shared/types/category';
import type { TagWithCount } from '../../../shared/types/tag';

export type LayoutDirection = 'rtl' | 'ltr';
export type ThemeMode = 'dark' | 'light';
export type LanguageMode = 'ar' | 'en';
export type SplitOrientationMode = 'vertical' | 'horizontal' | 'none' | 'full_notes';
export type WorkspaceViewMode = 'quran' | 'sunnah' | 'library' | 'categories' | 'reader' | 'notes' | 'settings';

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
}

interface WorkspaceContextType extends WorkspaceState {
  toggleDirection: () => void;
  toggleTheme: () => void;
  toggleLanguage: () => void;
  toggleZenMode: () => void;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSearchHubOpen: (open: boolean) => void;
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

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<LanguageMode>('ar');
  const [dir, setDir] = useState<LayoutDirection>('rtl');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSearchHubOpen, setIsSearchHubOpen] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('library');
  const [activeLibraryCategory, setActiveLibraryCategory] = useState<string>('ALL');
  
  // Pure Real Data (Zero Mock Items)
  const [books, setBooks] = useState<BookItem[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [allTags, setAllTags] = useState<TagWithCount[]>([]);
  const [activeBook, setActiveBook] = useState<BookItem | null>(null);
  const [readingPage, setReadingPage] = useState<number>(1);
  const [totalPages] = useState<number>(100);
  const [splitOrientation, setSplitOrientation] = useState<SplitOrientationMode>('vertical');

  const [bookNotes, setBookNotes] = useState<PageNote[]>([]);
  const [highlights, setHighlights] = useState<{ id: string; pageNumber: number; text: string; color: string }[]>([]);

  const toggleLanguage = () => {
    setLang((prev) => {
      const nextLang = prev === 'ar' ? 'en' : 'ar';
      setDir(nextLang === 'ar' ? 'rtl' : 'ltr');
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
      } catch (err: any) {
        console.error('[baglib/ui] Failed to refresh books from database:', err);
      }
    }
  };

  // Refresh category tree with direct and recursive counts
  const refreshCategoryTree = async () => {
    if (typeof window !== 'undefined') {
      try {
        const api = window.electronAPI as any;
        if (api?.categories?.getTree) {
          const tree = await api.categories.getTree({ includeCounts: true });
          setCategoryTree(tree || []);
        } else if (api?.getCategoryTree) {
          const tree = await api.getCategoryTree({ includeCounts: true });
          setCategoryTree(tree || []);
        }
      } catch (err: any) {
        console.error('[baglib/ui] Failed to refresh category tree:', err);
      }
    }
  };

  // Refresh tags with work counts
  const refreshTags = async () => {
    if (typeof window !== 'undefined' && (window.electronAPI as any)?.tags?.getAll) {
      try {
        const tags = await (window.electronAPI as any).tags.getAll();
        setAllTags(tags || []);
      } catch (err: any) {
        console.error('[baglib/ui] Failed to refresh tags:', err);
      }
    }
  };

  // Load books, categories, tags, and notes from SQLite database on mount
  useEffect(() => {
    refreshBooks();
    refreshCategoryTree();
    refreshTags();

    if (typeof window !== 'undefined' && (window.electronAPI as any)?.getAllNotes) {
      (window.electronAPI as any)
        .getAllNotes()
        .then((fetchedNotes: PageNote[]) => {
          if (Array.isArray(fetchedNotes)) {
            setBookNotes(fetchedNotes);
          }
        })
        .catch((err: any) => {
          console.error('[baglib/ui] Failed to load notes from database:', err);
        });
    }
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
      const api = window.electronAPI as any;
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
      const api = window.electronAPI as any;
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

  const openBookForReading = (book: BookItem) => {
    setActiveBook(book);
    setViewMode('reader');
    setReadingPage(1);
  };

  const closeReaderToLibrary = () => {
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

    if (typeof window !== 'undefined' && (window.electronAPI as any)?.addNote) {
      try {
        await (window.electronAPI as any).addNote(newNote);
      } catch (err) {
        console.error('[baglib/ui] Failed to persist note to SQLite:', err);
      }
    }

    setBookNotes((prev) => [newNote, ...prev]);
  };

  const deletePageNote = async (noteId: string) => {
    if (typeof window !== 'undefined' && (window.electronAPI as any)?.deleteNote) {
      try {
        await (window.electronAPI as any).deleteNote(noteId);
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
        setViewMode,
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
