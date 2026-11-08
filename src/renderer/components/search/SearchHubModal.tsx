'use client';
import { errorMessage } from '../../../shared/errors';


import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import {
  Search,
  X,
  SlidersHorizontal,
  BookmarkCheck,
  Globe,
  Archive,
  BookOpen,
  Feather,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Filter,
  FileText,
} from 'lucide-react';
import {
  UnifiedSearchResult,
  SearchProviderId,
  SearchScope,
  SearchProviderInfo,
  SearchProgressUpdate,
} from '../../../shared/types/search';
import type { LibraryFtsResult } from '../../../shared/types/full-text-search';
import { useWorkspace } from '../context/WorkspaceContext';
import { SearchResultCard } from './SearchResultCard';
import { StudySourcesSearch } from './StudySourcesSearch';

export const SearchHubModal: React.FC = () => {
  const {
    isSearchHubOpen,
    setSearchHubOpen,
    refreshBooks,
    setViewMode,
    books,
    openBookForReading,
    setReadingPage,
    dir,
    lang,
    t,
  } = useWorkspace();

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [ftsResults, setFtsResults] = useState<LibraryFtsResult[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<SearchProviderId[]>([
    'local',
    'openlibrary',
    'googlebooks',
    'internetarchive',
    'gutenberg',
  ]);
  const [providersInfo, setProvidersInfo] = useState<SearchProviderInfo[]>([]);

  const [isSearching, setIsSearching] = useState(false);
  const [previousOpen, setPreviousOpen] = useState(isSearchHubOpen);
  if (previousOpen !== isSearchHubOpen) {
    setPreviousOpen(isSearchHubOpen);
    if (!isSearchHubOpen) setIsSearching(false);
  }
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [searchTimeMs, setSearchTimeMs] = useState<number | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<
    Record<string, { status: string; count: number }>
  >({});

  // Result filter (all, only in-library, only downloadable)
  const [filterMode, setFilterMode] = useState<'all' | 'in_library' | 'downloadable'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const activeSearchIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchSequenceRef = useRef(0);
  const invalidateSearch = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    const previous = activeSearchIdRef.current;
    activeSearchIdRef.current = null;
    if (previous && window.electronAPI?.search?.cancel) {
      void Promise.resolve(window.electronAPI.search.cancel(previous)).catch(console.warn);
    }
  }, []);

  useEffect(() => {
    if (!isSearchHubOpen) invalidateSearch();
    return invalidateSearch;
  }, [isSearchHubOpen, invalidateSearch]);

  // Show transient toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  };

  // Load available providers info on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.search?.getProviders) {
      window.electronAPI.search.getProviders().then((list) => {
        if (Array.isArray(list)) {
          setProvidersInfo(list);
        }
      });
    }
  }, []);

  // Listen for streaming progress updates
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.search?.onProgress) return;

    const cleanup = window.electronAPI.search.onProgress((update: SearchProgressUpdate) => {
      if (update.searchId !== activeSearchIdRef.current) return;

      setProviderStatuses((prev) => ({
        ...prev,
        [update.providerId]: {
          status: update.status,
          count: update.resultCount,
        },
      }));

      // If provider completed with partial results, merge them progressively
      if (update.results && update.results.length > 0) {
        setResults((prev) => {
          const map = new Map<string, UnifiedSearchResult>();
          for (const item of prev) map.set(item.id, item);
          for (const item of update.results!) map.set(item.id, item);
          return Array.from(map.values());
        });
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  const dialogRef = useDialogFocus(isSearchHubOpen, () => setSearchHubOpen(false), inputRef);

  // Execute search function
  const executeSearch = useCallback(
    async (searchTerm: string, targetScope: SearchScope, providers: SearchProviderId[]) => {
      const trimmed = searchTerm.trim();
      invalidateSearch();
      if (!trimmed || targetScope === 'sources') {
        setResults([]);
        setFtsResults([]);
        setIsSearching(false);
        setSearchTimeMs(null);
        setProviderStatuses({});
        return;
      }

      const searchId = `search-${Date.now()}-${++searchSequenceRef.current}`;
      activeSearchIdRef.current = searchId;

      setIsSearching(true);
      setProviderStatuses({});
      const startTime = Date.now();

      // SQLite FTS5 Full-Text Search Branch (KEY-140)
      if (targetScope === 'fulltext') {
        const windowAPI = typeof window !== 'undefined' ? (window).electronAPI : null;
        if (windowAPI?.searchLibraryFullText) {
          try {
            const ftsRes = await windowAPI.searchLibraryFullText(trimmed);
            if (activeSearchIdRef.current === searchId) {
              setFtsResults(ftsRes || []);
              setSearchTimeMs(Date.now() - startTime);
            }
          } catch (e) {
            console.error('[baglib:search-hub] FTS search error:', e);
          } finally {
            if (activeSearchIdRef.current === searchId) {
              setIsSearching(false);
            }
          }
        } else {
          setIsSearching(false);
        }
        return;
      }

      try {
        if (typeof window !== 'undefined' && window.electronAPI?.search?.query) {
          const res = await window.electronAPI.search.query(
            {
              query: trimmed,
              scope: targetScope,
              providers: providers.length > 0 ? providers : undefined,
              limit: 40,
            },
            { searchId, timeoutMs: 9000 }
          );

          if (activeSearchIdRef.current === searchId && res) {
            setResults(res.results || []);
            setSearchTimeMs(Date.now() - startTime);
          }
        }
      } catch (err) {
        console.error('[baglib:search-hub] Search query error:', err);
      } finally {
        if (activeSearchIdRef.current === searchId) {
          setIsSearching(false);
        }
      }
    },
    [invalidateSearch]
  );

  // Debounced auto-search on typing
  const handleQueryChange = (val: string) => {
    invalidateSearch();
    setQuery(val);
    setResults([]);
    setFtsResults([]);
    setProviderStatuses({});
    setSearchTimeMs(null);
    setIsSearching(false);
    if (!val.trim()) return;

    debounceTimerRef.current = setTimeout(() => {
      executeSearch(val, scope, selectedProviders);
    }, 450);
  };

  const handleScopeChange = (newScope: SearchScope) => {
    setScope(newScope);
    executeSearch(query, newScope, selectedProviders);
  };

  const toggleProvider = (id: SearchProviderId) => {
    let next: SearchProviderId[];
    if (selectedProviders.includes(id)) {
      if (selectedProviders.length === 1) return; // Keep at least one
      next = selectedProviders.filter((p) => p !== id);
    } else {
      next = [...selectedProviders, id];
    }
    setSelectedProviders(next);
    executeSearch(query, scope, next);
  };

  // Import book handler
  const handleImportResult = async (result: UnifiedSearchResult, download: boolean): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.electronAPI?.search?.importResult) {
      return false;
    }

    try {
      const res = await window.electronAPI.search.importResult({
        result,
        downloadDigitalCopy: download,
      });

      if (res.success) {
        if (res.alreadyInLibrary) {
          showToast(t('alreadyInLibraryToast'));
        } else {
          showToast(t('importSuccessToast'));
          await refreshBooks();
        }
        return true;
      } else {
        showToast(res.error || 'Import failed');
        return false;
      }
    } catch (err: unknown) {
      console.error('[baglib:search-hub] importResult error:', err);
      showToast(errorMessage(err) || 'Import failed');
      return false;
    }
  };

  const handleViewLocal = (workId: string) => {
    setSearchHubOpen(false);
    setViewMode('library');
  };

  // Filtered results
  const displayedResults = results.filter((item) => {
    if (filterMode === 'in_library') return item.inLibrary;
    if (filterMode === 'downloadable') return Boolean(item.downloadUrl);
    return true;
  });

  const handleOpenFtsResult = (r: LibraryFtsResult) => {
    const book = books.find((b) => b.id === r.bookId);
    if (book) {
      setSearchHubOpen(false);
      openBookForReading(book);
      setReadingPage(r.pageNumber);
    }
  };

  if (!isSearchHubOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 transition-all"
      dir={dir}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('searchHubTitle')} tabIndex={-1} className="w-full max-w-5xl h-[90dvh] max-h-[calc(100dvh-1.5rem)] bg-surface border border-subtle rounded-3xl shadow-2xl flex flex-col overflow-hidden relative transition-all">
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 bg-arabesque-pattern pointer-events-none opacity-20 z-0" />

        {/* 1. Header Zone: Title & Close */}
        <div className="p-4 sm:p-5 border-b border-subtle flex items-center justify-between bg-canvas/60 relative z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pale-sky-500/10 border border-pale-sky-500/30 flex items-center justify-center text-pale-sky-500">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-main font-display">
                {t('searchHubTitle')}
              </h2>
              <p className="text-xs text-muted font-sans hidden sm:block">
                {t('searchHubSubtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={() => setSearchHubOpen(false)}
            className="p-2 rounded-xl bg-surface hover:bg-canvas border border-subtle text-muted hover:text-main transition-colors cursor-pointer"
            title={t('close')}
            aria-label={t('close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Control Zone: Search Input, Scopes, and Provider Pills */}
        <div className="max-h-[45%] overflow-y-auto overscroll-contain p-3 sm:p-4 border-b border-subtle bg-surface/80 space-y-3 relative z-10 shrink-0">
          {/* Main Search Input */}
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-pale-sky-500 absolute start-4 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                  executeSearch(query, scope, selectedProviders);
                }
              }}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="w-full bg-canvas border border-subtle focus:border-pale-sky-500/60 rounded-2xl py-3 px-11 text-sm text-main placeholder:text-muted outline-none transition-all shadow-inner font-sans"
            />
            {query && (
              <button
                onClick={() => {
                  handleQueryChange('');
                  inputRef.current?.focus();
                }}
                aria-label={t('searchClearQuery')}
                className="absolute end-4 p-1 rounded-lg hover:bg-surface text-muted hover:text-main transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Scope Selectors & Provider Toggles */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Scope Tabs */}
            <div className="flex items-center gap-1 p-1 bg-canvas rounded-xl border border-subtle">
              <button
                onClick={() => handleScopeChange('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  scope === 'all'
                    ? 'bg-pale-sky-500 text-white shadow-xs'
                    : 'text-muted hover:text-main'
                }`}
              >
                {t('searchScopeAll')}
              </button>
              <button
                onClick={() => handleScopeChange('local')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  scope === 'local'
                    ? 'bg-pale-sky-500 text-white shadow-xs'
                    : 'text-muted hover:text-main'
                }`}
              >
                {t('searchScopeLocal')}
              </button>
              <button
                onClick={() => handleScopeChange('online')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  scope === 'online'
                    ? 'bg-pale-sky-500 text-white shadow-xs'
                    : 'text-muted hover:text-main'
                }`}
              >
                {t('searchScopeOnline')}
              </button>
              <button
                onClick={() => handleScopeChange('sources')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  scope === 'sources'
                    ? 'bg-pale-sky-500 text-white shadow-xs'
                    : 'text-muted hover:text-main'
                }`}
              >
                {t('searchScopeSources')}
              </button>
              <button
                onClick={() => handleScopeChange('fulltext')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  scope === 'fulltext'
                    ? 'bg-pale-sky-500 text-white shadow-xs'
                    : 'text-muted hover:text-main'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{t('libraryFtsTitle')}</span>
              </button>
            </div>

            {/* Provider Filter Badges */}
            {scope !== 'fulltext' && scope !== 'sources' && (
              <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-muted font-bold px-1 hidden md:inline">
                {t('providersHeader')}:
              </span>

              {/* Local Provider */}
              {scope !== 'online' && (
                <button
                  onClick={() => toggleProvider('local')}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                    selectedProviders.includes('local')
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 shadow-xs'
                      : 'bg-canvas text-muted/60 border-subtle opacity-60'
                  }`}
                >
                  <BookmarkCheck className="w-3 h-3" />
                  <span>{t('providerLocal')}</span>
                  {providerStatuses['local']?.status === 'running' && (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  )}
                </button>
              )}

              {/* Online Providers */}
              {scope !== 'local' && (
                <>
                  <button
                    onClick={() => toggleProvider('openlibrary')}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                      selectedProviders.includes('openlibrary')
                        ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/40 shadow-xs'
                        : 'bg-canvas text-muted/60 border-subtle opacity-60'
                    }`}
                  >
                    <Globe className="w-3 h-3" />
                    <span>Open Library</span>
                    {providerStatuses['openlibrary']?.status === 'running' && (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    )}
                  </button>

                  <button
                    onClick={() => toggleProvider('googlebooks')}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                      selectedProviders.includes('googlebooks')
                        ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/40 shadow-xs'
                        : 'bg-canvas text-muted/60 border-subtle opacity-60'
                    }`}
                  >
                    <BookOpen className="w-3 h-3" />
                    <span>Google Books</span>
                    {providerStatuses['googlebooks']?.status === 'running' && (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    )}
                  </button>

                  <button
                    onClick={() => toggleProvider('internetarchive')}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                      selectedProviders.includes('internetarchive')
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40 shadow-xs'
                        : 'bg-canvas text-muted/60 border-subtle opacity-60'
                    }`}
                  >
                    <Archive className="w-3 h-3" />
                    <span>Internet Archive</span>
                    {providerStatuses['internetarchive']?.status === 'running' && (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    )}
                  </button>

                  <button
                    onClick={() => toggleProvider('gutenberg')}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                      selectedProviders.includes('gutenberg')
                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/40 shadow-xs'
                        : 'bg-canvas text-muted/60 border-subtle opacity-60'
                    }`}
                  >
                    <Feather className="w-3 h-3" />
                    <span>Gutenberg</span>
                    {providerStatuses['gutenberg']?.status === 'running' && (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    )}
                  </button>
                </>
              )}
            </div>
            )}
          </div>
        </div>

        {/* 3. Status Bar & Result Filters */}
        <div className="px-5 py-2.5 bg-canvas/50 border-b border-subtle flex items-center justify-between text-xs text-muted relative z-10 shrink-0">
          <div className="flex items-center gap-2">
            {isSearching ? (
              <div className="flex items-center gap-2 text-pale-sky-500 font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t('searchingProviders', { active: selectedProviders.length })}</span>
              </div>
            ) : searchTimeMs !== null ? (
              <span>
                {t('searchCompletedIn', {
                  count: results.length,
                  time: (searchTimeMs / 1000).toFixed(2),
                })}
              </span>
            ) : (
              <span>{t('searchHubSubtitle')}</span>
            )}
          </div>

          {/* Quick Result Filter Tabs */}
          {results.length > 0 && (
            <div className="flex items-center gap-1 text-[11px]">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                  filterMode === 'all'
                    ? 'bg-surface text-main shadow-xs font-bold'
                    : 'text-muted hover:text-main'
                }`}
              >
                {t('searchScopeAll')} ({results.length})
              </button>
              <button
                onClick={() => setFilterMode('in_library')}
                className={`px-2 py-0.5 rounded-md font-medium transition-all flex items-center gap-1 ${
                  filterMode === 'in_library'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'text-muted hover:text-main'
                }`}
              >
                <BookmarkCheck className="w-3 h-3" />
                <span>{t('inLibraryBadge')} ({results.filter((r) => r.inLibrary).length})</span>
              </button>
              <button
                onClick={() => setFilterMode('downloadable')}
                className={`px-2 py-0.5 rounded-md font-medium transition-all flex items-center gap-1 ${
                  filterMode === 'downloadable'
                    ? 'bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-400 font-bold'
                    : 'text-muted hover:text-main'
                }`}
              >
                <Download className="w-3 h-3" />
                <span>{t('directDownload')} ({results.filter((r) => Boolean(r.downloadUrl)).length})</span>
              </button>
            </div>
          )}
        </div>

        {/* 4. Results List Zone */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 relative z-10">
          {scope === 'sources' ? (
            <StudySourcesSearch query={query} onLeave={() => setSearchHubOpen(false)} />
          ) : scope === 'fulltext' ? (
            ftsResults.length > 0 ? (
              <div className="space-y-3">
                {ftsResults.map((r, idx) => (
                  <div
                    key={`${r.bookId}-${r.pageNumber}-${idx}`}
                    onClick={() => handleOpenFtsResult(r)}
                    className="p-4 rounded-2xl border border-subtle bg-canvas/40 hover:bg-canvas hover:border-pale-sky-500/50 transition-all cursor-pointer shadow-xs hover:shadow-md space-y-2 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-pale-sky-500 shrink-0" />
                        <h4 className="font-bold text-xs text-main font-display group-hover:text-pale-sky-600 dark:group-hover:text-pale-sky-400 transition-colors">
                          {r.bookTitle}
                        </h4>
                        {r.bookAuthor && (
                          <span className="text-[11px] text-muted hidden sm:inline">
                            • {r.bookAuthor}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {r.chapterTitle && (
                          <span className="px-2 py-0.5 rounded-lg bg-surface border border-subtle text-[10px] text-muted truncate max-w-[150px]">
                            {r.chapterTitle}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-lg bg-pale-sky-500/10 border border-pale-sky-500/30 text-pale-sky-600 dark:text-pale-sky-400 text-[10px] font-mono font-bold">
                          {t('page')} {r.pageNumber}
                        </span>
                      </div>
                    </div>
                    <p
                      className="text-xs text-muted leading-relaxed select-none"
                      dangerouslySetInnerHTML={{
                        __html: r.snippet.replace(
                          /<mark>/g,
                          '<mark class="bg-amber-400/30 text-amber-900 dark:text-amber-200 font-bold px-1 py-0.5 rounded">'
                        ),
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : isSearching ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center text-muted space-y-3">
                <Loader2 className="w-8 h-8 text-pale-sky-500 animate-spin" />
                <p className="text-sm font-medium">{t('searchingInBook')}</p>
              </div>
            ) : query.trim() ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center text-muted space-y-3">
                <AlertCircle className="w-10 h-10 text-muted/60" />
                <h3 className="text-base font-bold text-main font-display">{t('noSearchResults')}</h3>
                <p className="text-xs text-muted max-w-md">{t('noMatchesHint')}</p>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center text-muted space-y-3">
                <FileText className="w-12 h-12 text-pale-sky-500/40" />
                <h3 className="text-base font-bold text-main font-display">{t('libraryFtsTitle')}</h3>
                <p className="text-xs text-muted max-w-md">{t('libraryFtsDesc')}</p>
              </div>
            )
          ) : displayedResults.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayedResults.map((item) => (
                <SearchResultCard
                  key={item.id}
                  result={item}
                  onImport={handleImportResult}
                  onViewLocal={handleViewLocal}
                />
              ))}
            </div>
          ) : isSearching ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center text-muted space-y-3">
              <Loader2 className="w-8 h-8 text-pale-sky-500 animate-spin" />
              <p className="text-sm font-medium">{t('searchingProviders', { active: selectedProviders.length })}</p>
            </div>
          ) : query.trim() ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center text-muted space-y-3">
              <AlertCircle className="w-10 h-10 text-muted/60" />
              <h3 className="text-base font-bold text-main font-display">{t('noSearchResults')}</h3>
              <p className="text-xs text-muted max-w-md">{t('noSearchResultsHint')}</p>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center text-muted space-y-3">
              <BookOpen className="w-12 h-12 text-pale-sky-500/40" />
              <h3 className="text-base font-bold text-main font-display">{t('searchHubTitle')}</h3>
              <p className="text-xs text-muted max-w-md">{t('searchHubSubtitle')}</p>
            </div>
          )}
        </div>

        {/* Toast Notification Popup */}
        {toastMessage && (
          <div className="absolute bottom-5 inset-inline-end-5 z-50 bg-main text-canvas px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-bottom-2 duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
