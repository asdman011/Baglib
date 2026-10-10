'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { BookItem } from '../../types/library';
import { translations, TranslationKey } from '../../translations';

export type LayoutDirection = 'rtl' | 'ltr';
export type ThemeMode = 'dark' | 'light';
export type LanguageMode = 'ar' | 'en';
export type SplitOrientationMode = 'vertical' | 'horizontal' | 'none' | 'full_notes';

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
  isZenMode: boolean;
  isSidebarCollapsed: boolean;
  
  // Real Books Library State
  books: BookItem[];
  
  // Single Book Reading Flow State
  activeBook: BookItem | null;
  readingPage: number;
  totalPages: number;
  splitOrientation: SplitOrientationMode;
  bookNotes: PageNote[];
  highlights: { id: string; pageNumber: number; text: string; color: string }[];

  // App Main View Mode
  viewMode: 'library' | 'categories' | 'reader' | 'notes' | 'settings';
  activeLibraryCategory: string;
}

interface WorkspaceContextType extends WorkspaceState {
  toggleDirection: () => void;
  toggleTheme: () => void;
  toggleLanguage: () => void;
  toggleZenMode: () => void;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setViewMode: (mode: 'library' | 'categories' | 'reader' | 'notes' | 'settings') => void;
  setActiveLibraryCategory: (catId: string) => void;
  t: (key: TranslationKey) => string;
  
  // Book Library Management
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
  const [isZenMode, setIsZenMode] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<'library' | 'categories' | 'reader' | 'notes' | 'settings'>('library');
  const [activeLibraryCategory, setActiveLibraryCategory] = useState<string>('ALL');
  
  // Pure Real Data (Zero Mock Items)
  const [books, setBooks] = useState<BookItem[]>([]);
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

  const t = (key: TranslationKey): string => {
    return translations[lang][key] || key;
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

  // Load books and notes from SQLite database on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.electronAPI?.getAllBooks) {
        window.electronAPI
          .getAllBooks()
          .then((fetchedBooks: BookItem[]) => {
            if (Array.isArray(fetchedBooks)) {
              setBooks(fetchedBooks);
            }
          })
          .catch((err: any) => {
            console.error('[baglib/ui] Failed to load books from database:', err);
          });
      }

      if ((window.electronAPI as any)?.getAllNotes) {
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
    }
  }, []);

  // Add or Update book in library with SQLite persistence
  const addBook = async (newBook: BookItem) => {
    // 1. Optimistic state update so UI changes immediately
    setBooks((prev) => {
      const existingIdx = prev.findIndex(
        (b) => b.id === newBook.id || (newBook.filePath && b.filePath === newBook.filePath)
      );

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], ...newBook };
        return updated;
      }
      return [newBook, ...prev];
    });

    // Sync activeBook if currently open in reader
    setActiveBook((prev) => (prev && prev.id === newBook.id ? { ...prev, ...newBook } : prev));

    // 2. Persist to SQLite
    if (typeof window !== 'undefined' && window.electronAPI?.addBook) {
      try {
        const savedBook = await window.electronAPI.addBook(newBook);
        if (savedBook && savedBook.id) {
          setBooks((prev) => {
            const idx = prev.findIndex((b) => b.id === savedBook.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...newBook, ...savedBook };
              return updated;
            }
            return prev;
          });
          setActiveBook((prev) => (prev && prev.id === savedBook.id ? { ...prev, ...savedBook } : prev));
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
        (b) => b.id === updatedBook.id || (updatedBook.filePath && b.filePath === updatedBook.filePath)
      );

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], ...updatedBook };
        return updated;
      }
      return [updatedBook, ...prev];
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
              const idx = prev.findIndex((b) => b.id === res.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...updatedBook, ...res };
                return next;
              }
              return prev;
            });
            setActiveBook((prev) => (prev && prev.id === res.id ? { ...prev, ...res } : prev));
          }
        } else if (api?.addBook) {
          const savedBook = await api.addBook(updatedBook);
          if (savedBook && savedBook.id) {
            setBooks((prev) => {
              const idx = prev.findIndex((b) => b.id === savedBook.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...updatedBook, ...savedBook };
                return next;
              }
              return prev;
            });
            setActiveBook((prev) => (prev && prev.id === savedBook.id ? { ...prev, ...savedBook } : prev));
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
        setViewMode,
        activeLibraryCategory,
        setActiveLibraryCategory,
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
