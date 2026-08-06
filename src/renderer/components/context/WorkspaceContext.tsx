'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { BookItem } from '../../types/library';

export type LayoutDirection = 'rtl' | 'ltr';
export type ThemeMode = 'dark' | 'light';
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
  viewMode: 'library' | 'reader' | 'notes' | 'settings';
}

interface WorkspaceContextType extends WorkspaceState {
  toggleDirection: () => void;
  toggleTheme: () => void;
  toggleZenMode: () => void;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setViewMode: (mode: 'library' | 'reader' | 'notes' | 'settings') => void;
  
  // Book Library Management
  addBook: (book: BookItem) => void;
  deleteBook: (bookId: string) => void;
  
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
  const [dir, setDir] = useState<LayoutDirection>('rtl');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<'library' | 'reader' | 'notes' | 'settings'>('library');
  
  // Pure Real Data (Zero Mock Items)
  const [books, setBooks] = useState<BookItem[]>([]);
  const [activeBook, setActiveBook] = useState<BookItem | null>(null);
  const [readingPage, setReadingPage] = useState<number>(1);
  const [totalPages] = useState<number>(100);
  const [splitOrientation, setSplitOrientation] = useState<SplitOrientationMode>('vertical');

  const [bookNotes, setBookNotes] = useState<PageNote[]>([]);
  const [highlights, setHighlights] = useState<{ id: string; pageNumber: number; text: string; color: string }[]>([]);

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

  // Add or Update book in library (deduplicating by ID or path)
  const addBook = (newBook: BookItem) => {
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
  };

  const deleteBook = (bookId: string) => {
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

  const addPageNote = ({ pageNumber, highlightedText, content }: { pageNumber: number; highlightedText?: string; content: string }) => {
    if (!content.trim() || !activeBook) return;
    const newNote: PageNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      bookId: activeBook.id,
      pageNumber,
      highlightedText,
      content,
      createdAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    };
    setBookNotes((prev) => [newNote, ...prev]);
  };

  const deletePageNote = (noteId: string) => {
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
        toggleZenMode,
        toggleSidebar,
        setCommandPaletteOpen: setIsCommandPaletteOpen,
        setViewMode,
        addBook,
        deleteBook,
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
