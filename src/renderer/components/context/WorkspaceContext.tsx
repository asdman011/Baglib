'use client';

import { editorLeaveGuard } from '../research/editor-leave';
import { MediaCoverBackfill } from '../library/MediaCoverBackfill';
import { ToastProvider } from '../ui/Toast';
import { isLectureFormat } from '../../../shared/lectures';
import { openLecture } from '../../utils/lecture-navigation';
import { openStudyNote } from '../../utils/study-navigation';
import { matchesShortcut } from '../actions/shortcuts';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BookItem } from '../../types/library';
import { translations, TranslationKey } from '../../translations';
import { removeTempSelectionOverlay, clearActiveSelectionHighlight } from '../../libs/reader/highlight-manager';
import {
  activeTab as getActiveTab,
  currentLocation,
  findTab,
  homeLocation,
  newTab,
  tabsReducer,
  type TabLocation,
  type TabsState,
  type ViewSnapshot,
  type WorkspaceView,
} from '../../../shared/workspace-tabs';

import type { CategoryNode } from '../../../shared/types/category';
import type { TagWithCount } from '../../../shared/types/tag';

export type LayoutDirection = 'rtl' | 'ltr';
export type ThemeMode = 'dark' | 'light';
export type LanguageMode = 'ar' | 'en';
export type SplitOrientationMode = 'vertical' | 'horizontal' | 'none' | 'full_notes';
export type WorkspaceViewMode = WorkspaceView;

export interface PageNote {
  id: string;
  bookId: string;
  pageNumber: number;
  highlightedText?: string;
  content: string;
  createdAt: string;
}

export interface WorkspaceGlobalState {
  researchEditorAvailable: boolean;
  dir: LayoutDirection;
  theme: ThemeMode;
  lang: LanguageMode;
  isCommandPaletteOpen: boolean;
  isSearchHubOpen: boolean;
  isZenMode: boolean;
  isSidebarCollapsed: boolean;
  isNavPinned: boolean;
  isNavPeekOpen: boolean;

  // Real Books Library State
  books: BookItem[];
  booksLoading: boolean;
  booksError: boolean;

  // Categories & Tags State (Story 10)
  categoryTree: CategoryNode[];
  allTags: TagWithCount[];

  activeLibraryCategory: string;
  isMobileNavOpen?: boolean;
  isSupportSheetOpen?: boolean;
}

export interface TabScopeState {
  // Single Book Reading Flow State
  activeBook: BookItem | null;
  readingPage: number;
  totalPages: number;
  splitOrientation: SplitOrientationMode;
  bookNotes: PageNote[];
  highlights: { id: string; pageNumber: number; text: string; color: string }[];

  // App Main View Mode
  viewMode: WorkspaceViewMode;
}

export interface WorkspaceState extends WorkspaceGlobalState, TabScopeState {}

export interface WorkspaceGlobalContextType extends WorkspaceGlobalState {
  toggleDirection: () => void;
  toggleTheme: () => void;
  toggleLanguage: () => void;
  toggleZenMode: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  collapseSidebar: () => void;
  expandSidebar: () => void;
  toggleNavPinned: () => void;
  setNavPinned: (pinned: boolean) => void;
  isNavPeekOpen: boolean;
  setIsNavPeekOpen: (open: boolean) => void;
  openNavPeek: () => void;
  closeNavPeek: () => void;
  scheduleCloseNavPeek: () => void;
  cancelCloseNavPeek: () => void;
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
  setActiveLibraryCategory: (catId: string) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;

  // Book Library Management
  refreshBooks: () => Promise<void>;
  refreshCategoryTree: () => Promise<void>;
  refreshTags: () => Promise<void>;
  addBook: (book: BookItem) => void;
  updateBook: (book: BookItem) => void;
  deleteBook: (bookId: string) => Promise<void>;
  updateBookReadingStatus: (bookId: string, status: import('../../types/library').ReadingStatus, progress?: number) => Promise<void>;
}

export interface TabScopeContextType extends TabScopeState {
  setViewMode: (mode: WorkspaceViewMode) => void;

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

export interface WorkspaceContextType extends WorkspaceGlobalContextType, TabScopeContextType {}

export interface TabSnapshotHandlers {
  saveState?: () => Promise<ViewSnapshot | undefined> | ViewSnapshot | undefined;
  restoreState?: (snapshot: ViewSnapshot) => void;
}

export interface UseTabResult {
  id: string;
  isFocused: boolean;
  location: TabLocation;
  registerSnapshot: (handlers: TabSnapshotHandlers) => () => void;
}

export interface UseTabsResult {
  state: TabsState;
  open: (location: TabLocation, options?: { afterId?: string; background?: boolean }) => string;
  close: (id: string) => void;
  activate: (id: string) => void;
  navigate: (id: string, location: TabLocation) => void;
}

interface BookSyncSubscriber {
  onUpdate: (book: BookItem) => void;
  onDelete: (bookId: string) => void;
}

interface TabsInternalApi {
  subscribeBookSync: (subscriber: BookSyncSubscriber) => () => void;
  notifyBookUpdate: (book: BookItem) => void;
  notifyBookDelete: (bookId: string) => void;
  publishFocusedScope: (tabId: string, scope: TabScopeContextType) => void;
  unpublishFocusedScope: (tabId: string) => void;
}

const WorkspaceGlobalContext = createContext<WorkspaceGlobalContextType | undefined>(undefined);
const TabScopeContext = createContext<TabScopeContextType | undefined>(undefined);
const FocusedTabScopeContext = createContext<TabScopeContextType | undefined>(undefined);
const TabContext = createContext<UseTabResult | undefined>(undefined);
const TabsContext = createContext<UseTabsResult | undefined>(undefined);
const TabsInternalContext = createContext<TabsInternalApi | undefined>(undefined);

const GlobalImportWizard = React.lazy(() => import('../library/ImportWizardModal').then(module => ({ default: module.ImportWizardModal })));

function createInitialTabsState(): TabsState {
  return {
    tabs: [newTab('tab-1', homeLocation(), 0)],
    activeId: 'tab-1',
  };
}

function clearReaderSelection() {
  try {
    removeTempSelectionOverlay();
    clearActiveSelectionHighlight();
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
  } catch {}
}

export const WorkspaceProvider: React.FC<{ children: React.ReactNode; initialTabs?: TabsState }> = ({ children, initialTabs }) => {
  // Initialize with canonical server defaults to guarantee 100% hydration match with SSR
  const [researchEditorAvailable, setResearchEditorAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    void window.electronAPI?.researchEditor?.available().then(value => { if (alive) setResearchEditorAvailable(value); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
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
  const [droppedImportPaths, setDroppedImportPathsState] = useState<string[]>([]);
  const [importStarted, setImportStarted] = useState(false);
  const [importRequest, setImportRequest] = useState(0);
  const setIsImportWizardOpen = useCallback((open: boolean) => {
    if (open) { setImportStarted(true); setImportRequest(value => value + 1); }
    setImportWizardOpen(open);
  }, []);
  const setDroppedImportPaths = useCallback((paths: string[]) => {
    setImportWizardOpen(open => {
      if (!open) setDroppedImportPathsState(paths);
      return open;
    });
  }, []);

  const [isZenMode, setIsZenMode] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  // Pin-or-Peek side navigation state (KEY-310)
  const [isNavPinned, setIsNavPinnedState] = useState<boolean>(true);
  const [isNavPeekOpen, setIsNavPeekOpen] = useState<boolean>(false);
  const peekCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        if (window.electronAPI?.settings?.get) {
          const savedPinned = await window.electronAPI.settings.get('shell.navPinned.v1');
          if (typeof savedPinned === 'boolean') {
            setIsNavPinnedState(savedPinned);
            return;
          }
        }
        const local = localStorage.getItem('shell.navPinned.v1');
        if (local !== null) {
          setIsNavPinnedState(local === 'true');
        }
      } catch {}
    });
  }, []);

  const cancelCloseNavPeek = useCallback(() => {
    if (peekCloseTimerRef.current) {
      clearTimeout(peekCloseTimerRef.current);
      peekCloseTimerRef.current = null;
    }
  }, []);

  const setNavPinned = useCallback((pinned: boolean) => {
    cancelCloseNavPeek();
    setIsNavPinnedState(pinned);
    setIsNavPeekOpen(false);
    try {
      if (window.electronAPI?.settings?.set) {
        void window.electronAPI.settings.set('shell.navPinned.v1', pinned);
      }
      localStorage.setItem('shell.navPinned.v1', String(pinned));
    } catch {}
  }, [cancelCloseNavPeek]);

  const toggleNavPinned = useCallback(() => {
    cancelCloseNavPeek();
    setIsNavPinnedState((prev) => {
      const next = !prev;
      setIsNavPeekOpen(false);
      try {
        if (window.electronAPI?.settings?.set) {
          void window.electronAPI.settings.set('shell.navPinned.v1', next);
        }
        localStorage.setItem('shell.navPinned.v1', String(next));
      } catch {}
      return next;
    });
  }, [cancelCloseNavPeek]);

  const openNavPeek = useCallback(() => {
    cancelCloseNavPeek();
    if (!isNavPinned) {
      setIsNavPeekOpen(true);
    }
  }, [cancelCloseNavPeek, isNavPinned]);

  const closeNavPeek = useCallback(() => {
    cancelCloseNavPeek();
    setIsNavPeekOpen(false);
  }, [cancelCloseNavPeek]);

  const scheduleCloseNavPeek = useCallback(() => {
    cancelCloseNavPeek();
    peekCloseTimerRef.current = setTimeout(() => {
      setIsNavPeekOpen(false);
      peekCloseTimerRef.current = null;
    }, 300);
  }, [cancelCloseNavPeek]);

  useEffect(() => {
    const handleNavKey = (e: KeyboardEvent) => {
      // Ctrl+B / Cmd+B toggles pinned
      if (matchesShortcut(e, 'navigation')) {
        e.preventDefault();
        toggleNavPinned();
        return;
      }
      // Esc closes peek if open and unpinned
      if (e.key === 'Escape' && isNavPeekOpen && !isNavPinned) {
        e.preventDefault();
        closeNavPeek();
      }
    };
    window.addEventListener('keydown', handleNavKey);
    return () => window.removeEventListener('keydown', handleNavKey);
  }, [toggleNavPinned, isNavPeekOpen, isNavPinned, closeNavPeek]);

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSupportSheetOpen, setIsSupportSheetOpen] = useState(false);
  const toggleMobileNav = useCallback(() => setIsMobileNavOpen((prev) => !prev), []);
  const [activeLibraryCategory, setActiveLibraryCategory] = useState<string>('ALL');

  // Pure Real Data (Zero Mock Items)
  const [books, setBooks] = useState<BookItem[]>([]);
  const booksRef = useRef<BookItem[]>(books);
  useEffect(() => { booksRef.current = books; }, [books]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksError, setBooksError] = useState(false);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [allTags, setAllTags] = useState<TagWithCount[]>([]);

  // Book sync subscribers for mounted TabScopes
  const bookSubscribersRef = useRef<Set<BookSyncSubscriber>>(new Set());
  const subscribeBookSync = useCallback((subscriber: BookSyncSubscriber) => {
    bookSubscribersRef.current.add(subscriber);
    return () => {
      bookSubscribersRef.current.delete(subscriber);
    };
  }, []);
  const notifyBookUpdate = useCallback((book: BookItem) => {
    for (const sub of bookSubscribersRef.current) sub.onUpdate(book);
  }, []);
  const notifyBookDelete = useCallback((bookId: string) => {
    for (const sub of bookSubscribersRef.current) sub.onDelete(bookId);
  }, []);

  const toggleLanguage = useCallback(() => {
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
  }, []);

  const t = useCallback((key: TranslationKey, params?: Record<string, string | number>): string => {
    let text = translations[lang][key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return text;
  }, [lang]);

  const toggleDirection = useCallback(() => setDir((prev) => (prev === 'rtl' ? 'ltr' : 'rtl')), []);
  const toggleZenMode = useCallback(() => setIsZenMode((prev) => !prev), []);
  const toggleSidebar = useCallback(() => setIsSidebarCollapsed((prev) => !prev), []);
  const setSidebarCollapsed = useCallback((collapsed: boolean) => setIsSidebarCollapsed(collapsed), []);
  const collapseSidebar = useCallback(() => setIsSidebarCollapsed(true), []);
  const expandSidebar = useCallback(() => setIsSidebarCollapsed(false), []);

  const toggleTheme = useCallback(() => {
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
  }, []);

  // Refresh books from SQLite database
  const refreshBooks = useCallback(async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.getAllBooks) {
      try {
        setBooksLoading(true);
        const fetchedBooks: BookItem[] = await window.electronAPI.getAllBooks();
        setBooksError(false);
        if (Array.isArray(fetchedBooks)) {
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
        setBooksError(true);
        console.error('[baglib/ui] Failed to refresh books from database:', err);
      } finally {
        setBooksLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      void refreshBooks();
    };
    window.addEventListener('baglib:refresh-books', handleRefresh);
    return () => window.removeEventListener('baglib:refresh-books', handleRefresh);
  }, [refreshBooks]);

  const refreshCategoryTree = useCallback(async () => {
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
  }, []);

  const refreshTags = useCallback(async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.tags) {
      try {
        const tags = await window.electronAPI.tags.getAll();
        setAllTags(tags || []);
      } catch (err: unknown) {
        console.error('[baglib/ui] Failed to refresh tags:', err);
      }
    }
  }, []);

  // Load books, categories, tags from SQLite database on mount
  useEffect(() => {
    const api = window.electronAPI;
    let alive = true;
    if (typeof api?.getAllBooks === 'function') {
      void api.getAllBooks().then((fetchedBooks: BookItem[]) => {
        if (!alive || !Array.isArray(fetchedBooks)) return;
        const seenIds = new Set<string>(), seenPaths = new Set<string>();
        setBooksError(false);
        setBooks(fetchedBooks.filter(book => {
          if (!book?.id || seenIds.has(book.id) || book.filePath && seenPaths.has(book.filePath)) return false;
          seenIds.add(book.id); if (book.filePath) seenPaths.add(book.filePath); return true;
        }));
      }).catch(() => { if (alive) setBooksError(true); }).finally(() => { if (alive) setBooksLoading(false); });
    } else { queueMicrotask(() => { if (alive) setBooksLoading(false); }); }
    const categoriesRequest = api?.categories?.getTree?.({ includeCounts: true }) ?? api?.getCategoryTree?.({ includeCounts: true });
    void categoriesRequest?.then(tree => { if (alive) setCategoryTree(tree || []); }).catch(console.warn);
    void api?.tags?.getAll?.().then(tags => { if (alive) setAllTags(tags || []); }).catch(console.warn);
    return () => { alive = false; };
  }, []);

  // Add or Update book in library with SQLite persistence
  const addBook = useCallback(async (newBook: BookItem) => {
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

    notifyBookUpdate(newBook);

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
          notifyBookUpdate(savedBook);
        }
      } catch (err) {
        console.error('[baglib/ui] Failed to persist book to SQLite:', err);
      }
    }
  }, [notifyBookUpdate]);

  const updateBook = useCallback(async (updatedBook: BookItem) => {
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

    notifyBookUpdate(updatedBook);

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
            notifyBookUpdate(res);
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
            notifyBookUpdate(savedBook);
          }
        }
      } catch (err) {
        console.error('[baglib/ui] Failed to update book in SQLite:', err);
      }
    }
  }, [notifyBookUpdate]);

  const updateBookReadingStatus = useCallback(async (
    bookId: string,
    status: import('../../types/library').ReadingStatus,
    progress?: number
  ) => {
    const calcProgress = typeof progress === 'number'
      ? progress
      : (status === 'completed' ? 100 : (status === 'unread' ? 0 : undefined));

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
        const current = booksRef.current.find((b) => b.id === bookId);
        if (current) {
          api.addBook({
            ...current,
            readingStatus: status,
            readingProgress: calcProgress !== undefined ? calcProgress : (current.readingProgress || 0),
          }).catch(console.error);
        }
      }
    }
  }, []);

  const deleteBook = useCallback(async (bookId: string) => {
    if (typeof window !== 'undefined' && window.electronAPI?.deleteBook) {
      try {
        await window.electronAPI.deleteBook(bookId);
      } catch (err) {
        console.error('[baglib/ui] Failed to delete book from SQLite:', err);
        throw err;
      }
    }

    setBooks((prev) => prev.filter((b) => b.id !== bookId));
    notifyBookDelete(bookId);
  }, [notifyBookDelete]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+N anywhere: a new note, ready to type.
      if (matchesShortcut(e, 'new-note')) {
        e.preventDefault();
        openStudyNote({ content: '' });
        return;
      }
      if (matchesShortcut(e, 'palette')) {
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

  const globalValue = useMemo<WorkspaceGlobalContextType>(() => ({
    researchEditorAvailable,
    dir,
    theme,
    lang,
    isCommandPaletteOpen,
    isSearchHubOpen,
    isZenMode,
    isSidebarCollapsed,
    isNavPinned,
    isNavPeekOpen,
    toggleNavPinned,
    setNavPinned,
    setIsNavPeekOpen,
    openNavPeek,
    closeNavPeek,
    scheduleCloseNavPeek,
    cancelCloseNavPeek,
    isMobileNavOpen,
    setIsMobileNavOpen,
    toggleMobileNav,
    isSupportSheetOpen,
    setIsSupportSheetOpen,
    books,
    booksLoading,
    booksError,
    categoryTree,
    allTags,
    toggleDirection,
    toggleTheme,
    toggleLanguage,
    t,
    toggleZenMode,
    toggleSidebar,
    setSidebarCollapsed,
    collapseSidebar,
    expandSidebar,
    setCommandPaletteOpen: setIsCommandPaletteOpen,
    setSearchHubOpen: setIsSearchHubOpen,
    isImportWizardOpen,
    setIsImportWizardOpen,
    droppedImportPaths,
    setDroppedImportPaths,
    activeLibraryCategory,
    setActiveLibraryCategory,
    refreshBooks,
    refreshCategoryTree,
    refreshTags,
    addBook,
    updateBook,
    deleteBook,
    updateBookReadingStatus,
  }), [
    researchEditorAvailable,
    dir,
    theme,
    lang,
    isCommandPaletteOpen,
    isSearchHubOpen,
    isZenMode,
    isSidebarCollapsed,
    isNavPinned,
    isNavPeekOpen,
    toggleNavPinned,
    setNavPinned,
    openNavPeek,
    closeNavPeek,
    scheduleCloseNavPeek,
    cancelCloseNavPeek,
    isMobileNavOpen,
    toggleMobileNav,
    isSupportSheetOpen,
    books,
    booksLoading,
    booksError,
    categoryTree,
    allTags,
    toggleDirection,
    toggleTheme,
    toggleLanguage,
    t,
    toggleZenMode,
    toggleSidebar,
    setSidebarCollapsed,
    collapseSidebar,
    expandSidebar,
    isImportWizardOpen,
    setIsImportWizardOpen,
    droppedImportPaths,
    setDroppedImportPaths,
    activeLibraryCategory,
    refreshBooks,
    refreshCategoryTree,
    refreshTags,
    addBook,
    updateBook,
    deleteBook,
    updateBookReadingStatus,
  ]);

  return (
    <WorkspaceGlobalContext.Provider value={globalValue}>
      <TabsProvider
        initialTabs={initialTabs}
        subscribeBookSync={subscribeBookSync}
        notifyBookUpdate={notifyBookUpdate}
        notifyBookDelete={notifyBookDelete}
      >
        <ToastProvider>
          <MediaCoverBackfill />
          {children}
          {importStarted && (
            <React.Suspense fallback={null}>
              <GlobalImportWizard
                isOpen={isImportWizardOpen}
                initialPaths={droppedImportPaths}
                requestId={importRequest}
                onClose={() => { setImportWizardOpen(false); setDroppedImportPathsState([]); }}
              />
            </React.Suspense>
          )}
        </ToastProvider>
      </TabsProvider>
    </WorkspaceGlobalContext.Provider>
  );
};

interface TabsProviderProps {
  children: React.ReactNode;
  initialTabs?: TabsState;
  subscribeBookSync: (subscriber: BookSyncSubscriber) => () => void;
  notifyBookUpdate: (book: BookItem) => void;
  notifyBookDelete: (bookId: string) => void;
}

const TabsProvider: React.FC<TabsProviderProps> = ({
  children,
  initialTabs,
  subscribeBookSync,
  notifyBookUpdate,
  notifyBookDelete,
}) => {
  const [state, dispatch] = useReducer(tabsReducer, initialTabs, (init) => init ?? createInitialTabsState());
  const nextIdRef = useRef(2);
  const allocateId = useCallback(() => `tab-${nextIdRef.current++}`, []);

  const open = useCallback((location: TabLocation, options?: { afterId?: string; background?: boolean }) => {
    const id = allocateId();
    dispatch({ type: 'open', id, location, now: Date.now(), afterId: options?.afterId, background: options?.background });
    return id;
  }, [allocateId]);

  const close = useCallback((id: string) => {
    const homeId = allocateId();
    dispatch({ type: 'close', id, homeId, now: Date.now() });
  }, [allocateId]);

  const activate = useCallback((id: string) => {
    dispatch({ type: 'activate', id, now: Date.now() });
  }, []);

  const navigate = useCallback((id: string, location: TabLocation) => {
    dispatch({ type: 'navigate', id, location, now: Date.now() });
  }, []);

  const tabsValue = useMemo<UseTabsResult>(() => ({
    state,
    open,
    close,
    activate,
    navigate,
  }), [state, open, close, activate, navigate]);

  // Focused scope registry so `useWorkspace()` outside any `<TabScope>` reads the focused tab's scope.
  const [publishedFocus, setPublishedFocus] = useState<{ tabId: string; scope: TabScopeContextType } | null>(null);
  const publishFocusedScope = useCallback((tabId: string, scope: TabScopeContextType) => {
    setPublishedFocus(prev => (prev && prev.tabId === tabId && prev.scope === scope ? prev : { tabId, scope }));
  }, []);
  const unpublishFocusedScope = useCallback((tabId: string) => {
    setPublishedFocus(prev => (prev && prev.tabId === tabId ? null : prev));
  }, []);

  const internalApi = useMemo<TabsInternalApi>(() => ({
    subscribeBookSync,
    notifyBookUpdate,
    notifyBookDelete,
    publishFocusedScope,
    unpublishFocusedScope,
  }), [subscribeBookSync, notifyBookUpdate, notifyBookDelete, publishFocusedScope, unpublishFocusedScope]);

  const focusedTabId = state.activeId ?? state.tabs[0]?.id ?? 'tab-1';

  return (
    <TabsContext.Provider value={tabsValue}>
      <TabsInternalContext.Provider value={internalApi}>
        <FallbackTabScopeBridge tabId={focusedTabId} publishedFocus={publishedFocus}>
          {children}
        </FallbackTabScopeBridge>
      </TabsInternalContext.Provider>
    </TabsContext.Provider>
  );
};

/**
 * Provides a working `TabScope` for `FocusedTabScopeContext` even before a child `<TabScope>` mounts
 * (or in tests that mount `<WorkspaceProvider>` directly without `<AppLayout>`).
 * When a child `<TabScope>` for `tabId` is mounted, its published scope takes precedence.
 */
const FallbackTabScopeBridge: React.FC<{
  tabId: string;
  publishedFocus: { tabId: string; scope: TabScopeContextType } | null;
  children: React.ReactNode;
}> = ({ tabId, publishedFocus, children }) => {
  const scope = useTabScopeState(tabId);
  const activeScope = publishedFocus && publishedFocus.tabId === tabId ? publishedFocus.scope : scope;
  return (
    <FocusedTabScopeContext.Provider value={activeScope}>
      {children}
    </FocusedTabScopeContext.Provider>
  );
};

function useTabScopeState(tabId: string): TabScopeContextType {
  const global = useContext(WorkspaceGlobalContext);
  const tabsCtx = useContext(TabsContext);
  const internal = useContext(TabsInternalContext);

  const tab = tabsCtx ? findTab(tabsCtx.state, tabId) : undefined;
  const location = tab ? currentLocation(tab) : homeLocation();
  const viewMode: WorkspaceViewMode = location.view;
  const viewModeRef = useRef<WorkspaceViewMode>(viewMode);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  const [activeBook, setActiveBook] = useState<BookItem | null>(null);
  const activeBookRef = useRef<BookItem | null>(activeBook);
  useEffect(() => { activeBookRef.current = activeBook; }, [activeBook]);
  const [readingPage, setReadingPage] = useState<number>(1);
  const [totalPages] = useState<number>(100);
  const [splitOrientation, setSplitOrientation] = useState<SplitOrientationMode>('none');
  const [bookNotes, setBookNotes] = useState<PageNote[]>([]);
  const [highlights, setHighlights] = useState<{ id: string; pageNumber: number; text: string; color: string }[]>([]);

  useEffect(() => {
    const refresh = () => {
      const api = window.electronAPI;
      if (api?.getAllNotes) void api.getAllNotes().then(notes => { if (Array.isArray(notes)) setBookNotes(notes); }).catch(() => {});
    };
    refresh();
    window.addEventListener('baglib:notes-changed', refresh);
    return () => window.removeEventListener('baglib:notes-changed', refresh);
  }, []);

  const setIsMobileNavOpen = global?.setIsMobileNavOpen;
  const setIsSidebarCollapsed = global?.setSidebarCollapsed;
  const navigateTab = tabsCtx?.navigate;

  const setViewMode = useCallback((mode: WorkspaceViewMode) => {
    const apply = () => {
      setIsMobileNavOpen?.(false);
      setIsSidebarCollapsed?.(true);
      if (viewModeRef.current === 'reader' && mode !== 'reader') {
        clearReaderSelection();
      }
      navigateTab?.(tabId, { view: mode, title: '' });
    };
    const guard = mode === 'notes-editor' ? undefined : editorLeaveGuard();
    if (guard) {
      void guard().then(allowed => {
        if (allowed) apply();
      });
    } else {
      apply();
    }
  }, [tabId, navigateTab, setIsMobileNavOpen, setIsSidebarCollapsed]);

  const subscribeBookSync = internal?.subscribeBookSync;
  useEffect(() => {
    if (!subscribeBookSync) return;
    return subscribeBookSync({
      onUpdate: (book) => {
        setActiveBook((prev) => (prev && prev.id === book.id ? { ...prev, ...book } : prev));
      },
      onDelete: (bookId) => {
        if (activeBookRef.current?.id === bookId) {
          setActiveBook(null);
          setViewMode('library');
        }
      },
    });
  }, [subscribeBookSync, setViewMode]);

  const openBookForReading = useCallback((book: BookItem) => {
    if (book.workType === 'lecture' && book.filePath && isLectureFormat(book.digitalFormat)) {
      openLecture({ id: book.id, seconds: 0, tabId });
      setViewMode('lectures');
      return;
    }
    clearReaderSelection();
    setActiveBook(book);
    setViewMode('reader');
    setReadingPage(1);
    setSplitOrientation('none');
  }, [tabId, setViewMode]);

  const closeReaderToLibrary = useCallback(() => {
    clearReaderSelection();
    setViewMode('library');
  }, [setViewMode]);

  const addPageNote = useCallback(async ({ pageNumber, highlightedText, content }: { pageNumber: number; highlightedText?: string; content: string }) => {
    const book = activeBookRef.current;
    if (!content.trim() || !book) return;
    const newNote: PageNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      bookId: book.id,
      pageNumber,
      highlightedText,
      content,
      createdAt: new Date().toISOString(),
    };

    if (typeof window !== 'undefined' && typeof window.electronAPI?.addNote === 'function') {
      try {
        await window.electronAPI.addNote(newNote);
      } catch (err) {
        console.error('[baglib/ui] Failed to persist note to SQLite:', err);
      }
    }

    setBookNotes((prev) => [newNote, ...prev]);
  }, []);

  const deletePageNote = useCallback(async (noteId: string) => {
    if (typeof window !== 'undefined' && typeof window.electronAPI?.deleteNote === 'function') {
      try {
        await window.electronAPI.deleteNote(noteId);
      } catch (err) {
        console.error('[baglib/ui] Failed to delete note from SQLite:', err);
      }
    }
    setBookNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, []);

  const addHighlight = useCallback((pageNumber: number, text: string, color = 'bg-amber-500/30') => {
    if (!text.trim()) return;
    setHighlights((prev) => [
      ...prev,
      { id: `hl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, pageNumber, text, color },
    ]);
  }, []);

  return useMemo<TabScopeContextType>(() => ({
    activeBook,
    readingPage,
    totalPages,
    splitOrientation,
    bookNotes,
    highlights,
    viewMode,
    setViewMode,
    openBookForReading,
    closeReaderToLibrary,
    setReadingPage,
    setSplitOrientation,
    addPageNote,
    deletePageNote,
    addHighlight,
  }), [
    activeBook,
    readingPage,
    totalPages,
    splitOrientation,
    bookNotes,
    highlights,
    viewMode,
    setViewMode,
    openBookForReading,
    closeReaderToLibrary,
    addPageNote,
    deletePageNote,
    addHighlight,
  ]);
}

export const TabScope: React.FC<{ tabId: string; children: React.ReactNode }> = ({ tabId, children }) => {
  const tabsCtx = useContext(TabsContext);
  const internal = useContext(TabsInternalContext);
  const scopeValue = useTabScopeState(tabId);
  const snapshotHandlersRef = useRef<TabSnapshotHandlers | null>(null);

  const registerSnapshot = useCallback((handlers: TabSnapshotHandlers) => {
    snapshotHandlersRef.current = handlers;
    return () => {
      if (snapshotHandlersRef.current === handlers) {
        snapshotHandlersRef.current = null;
      }
    };
  }, []);

  const tab = tabsCtx ? findTab(tabsCtx.state, tabId) : undefined;
  const activeTab = tabsCtx ? getActiveTab(tabsCtx.state) : undefined;
  const isFocused = tabsCtx ? (activeTab ? activeTab.id === tabId : tabsCtx.state.tabs[0]?.id === tabId) : true;
  const location = tab ? currentLocation(tab) : homeLocation();

  const tabResult = useMemo<UseTabResult>(() => ({
    id: tabId,
    isFocused,
    location,
    registerSnapshot,
  }), [tabId, isFocused, location, registerSnapshot]);

  const publishFocusedScope = internal?.publishFocusedScope;
  const unpublishFocusedScope = internal?.unpublishFocusedScope;

  useLayoutEffect(() => {
    if (isFocused && publishFocusedScope) {
      publishFocusedScope(tabId, scopeValue);
    }
  }, [isFocused, tabId, scopeValue, publishFocusedScope]);

  useLayoutEffect(() => {
    return () => {
      unpublishFocusedScope?.(tabId);
    };
  }, [tabId, unpublishFocusedScope]);

  return (
    <TabContext.Provider value={tabResult}>
      <TabScopeContext.Provider value={scopeValue}>
        {children}
      </TabScopeContext.Provider>
    </TabContext.Provider>
  );
};

export const useWorkspace = (): WorkspaceContextType => {
  const global = useContext(WorkspaceGlobalContext);
  if (!global) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  const localTab = useContext(TabScopeContext);
  const tab = localTab ?? React.use(FocusedTabScopeContext);
  if (!tab) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return useMemo(() => ({ ...global, ...tab }), [global, tab]);
};

export const useTab = (): UseTabResult => {
  const tab = useContext(TabContext);
  if (!tab) {
    throw new Error('useTab must be used within a TabScope');
  }
  return tab;
};

/** Optional `useTab()` for views that may be mounted standalone in unit tests without a `TabScope`. */
export const useOptionalTab = (): UseTabResult | null => useContext(TabContext) ?? null;

export const useTabs = (): UseTabsResult => {
  const tabs = useContext(TabsContext);
  if (!tabs) {
    throw new Error('useTabs must be used within a WorkspaceProvider');
  }
  return tabs;
};
