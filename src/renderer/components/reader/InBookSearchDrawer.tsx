import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  BookOpen,
  Sparkles,
  SlidersHorizontal,
  Bookmark,
} from 'lucide-react';
import {
  searchBookProgressive,
  SearchableSection,
} from '../../libs/search/in-book-search';
import type {
  InBookSearchMatch,
  InBookSearchProgress,
} from '../../../shared/types/full-text-search';

interface InBookSearchDrawerProps {
  embedded?: boolean;
  isOpen: boolean;
  onClose: () => void;
  sections: SearchableSection[];
  currentPage: number;
  onJumpToPage: (page: number, locationCfiOrPage?: string) => void;
  t: (key: import('../../translations').TranslationKey, vars?: Record<string, string | number>) => string;
  direction?: 'rtl' | 'ltr';
}

export const InBookSearchDrawer: React.FC<InBookSearchDrawerProps> = ({
  isOpen,
  embedded = false,
  onClose,
  sections,
  currentPage,
  onJumpToPage,
  t,
  direction = 'rtl',
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [matches, setMatches] = useState<InBookSearchMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [progress, setProgress] = useState<InBookSearchProgress | null>(null);

  // Options
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [normalizeArabic, setNormalizeArabic] = useState(true);
  const [showOptions, setShowOptions] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [isOpen]);

  const [previousBookQuery, setPreviousBookQuery] = useState<readonly unknown[] | null>(null);
  const inputsBookQuery = [isOpen, query, caseSensitive, matchWholeWord, normalizeArabic];
  if (previousBookQuery === null || inputsBookQuery.some((value, index) => !Object.is(value, previousBookQuery[index]))) {
    setPreviousBookQuery(inputsBookQuery);
    if (isOpen) { setActiveMatchIndex(0); setIsSearching(Boolean(query.trim())); if (!query.trim()) { setMatches([]); setProgress(null); } }
  }
  // Execute search when query or options change
  useEffect(() => {
    if (!isOpen) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;


    const timer = setTimeout(async () => {
      try {
        const found = await searchBookProgressive(sections, trimmed, {
          caseSensitive,
          matchWholeWord,
          normalizeArabic,
          signal: controller.signal,
          onProgress: (prog) => {
            if (controller.signal.aborted) return;
            setProgress(prog);
            setMatches(prog.matches);
          },
        });

        if (!controller.signal.aborted) {
          setMatches(found);
          setIsSearching(false);
        }
      } catch (err: unknown) {
        if ((!(err instanceof Error) || err.name !== 'AbortError')) {
          console.error('[baglib:search-drawer] Search error:', err);
        }
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, caseSensitive, matchWholeWord, normalizeArabic, sections, isOpen]);

  // Jump to next match
  const handleNextMatch = () => {
    if (matches.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % matches.length;
    setActiveMatchIndex(nextIdx);
    const m = matches[nextIdx];
    onJumpToPage(m.pageNumber, m.locationCfiOrPage);
  };

  // Jump to previous match
  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + matches.length) % matches.length;
    setActiveMatchIndex(prevIdx);
    const m = matches[prevIdx];
    onJumpToPage(m.pageNumber, m.locationCfiOrPage);
  };

  // Click on a match item
  const handleSelectMatch = (m: InBookSearchMatch, idx: number) => {
    setActiveMatchIndex(idx);
    onJumpToPage(m.pageNumber, m.locationCfiOrPage);
  };

  if (!isOpen) return null;

  return (
    <aside
      dir={direction}
      className={embedded ? 'relative flex h-full min-h-0 w-full flex-col bg-surface' : 'absolute top-0 bottom-0 start-0 w-84 sm:w-96 bg-surface/95 backdrop-blur-md border-e border-subtle z-30 shadow-2xl flex flex-col animate-in duration-200'}
    >
      {/* Header */}
      <div className="p-3 border-b border-subtle flex items-center justify-between bg-canvas/40">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-pale-sky-500" />
          <span className="font-bold text-xs text-main">{t('searchInBook')}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-canvas text-muted hover:text-main transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search Input Bar */}
      <div className="p-3 border-b border-subtle space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) handlePrevMatch();
                else handleNextMatch();
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder={t('searchInBookPlaceholder')}
            className="w-full ps-9 pe-8 py-2 text-xs rounded-xl border border-subtle bg-canvas text-main outline-none focus:ring-1 focus:ring-pale-sky-500 transition-all placeholder:text-muted/60"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-main p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search Options Accordion / Controls */}
        <div className="flex items-center justify-between text-[11px] text-muted pt-1">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setNormalizeArabic(!normalizeArabic)}
              title={t('morphologyAware')}
              className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all ${
                normalizeArabic
                  ? 'bg-pale-sky-500/15 text-pale-sky-600 dark:text-pale-sky-400 border-pale-sky-500/30'
                  : 'border-subtle hover:bg-canvas'
              }`}
            >
              {t('morphologyAware')}
            </button>
            <button
              onClick={() => setMatchWholeWord(!matchWholeWord)}
              title={t('matchWholeWord')}
              className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all ${
                matchWholeWord
                  ? 'bg-pale-sky-500/15 text-pale-sky-600 dark:text-pale-sky-400 border-pale-sky-500/30'
                  : 'border-subtle hover:bg-canvas'
              }`}
            >
              {t('matchWholeWord')}
            </button>
            <button
              onClick={() => setCaseSensitive(!caseSensitive)}
              title={t('caseSensitive')}
              className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all ${
                caseSensitive
                  ? 'bg-pale-sky-500/15 text-pale-sky-600 dark:text-pale-sky-400 border-pale-sky-500/30'
                  : 'border-subtle hover:bg-canvas'
              }`}
            >
              Aa
            </button>
          </div>

          {/* Stepper Controls */}
          {matches.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-muted">
                {activeMatchIndex + 1}/{matches.length}
              </span>
              <button
                onClick={handlePrevMatch}
                title={t('prevMatch')}
                className="p-1 rounded hover:bg-canvas text-muted hover:text-main"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleNextMatch}
                title={t('nextMatch')}
                className="p-1 rounded hover:bg-canvas text-muted hover:text-main"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Scanning progress bar */}
        {isSearching && progress && (
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[10px] text-muted">
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin text-pale-sky-500" />
                {t('scanningPageProgress', {
                  current: progress.currentSection,
                  total: progress.totalSections,
                })}
              </span>
              <span>{Math.round((progress.currentSection / (progress.totalSections || 1)) * 100)}%</span>
            </div>
            <div className="w-full h-1 bg-subtle/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-pale-sky-500 transition-all duration-100"
                style={{
                  width: `${(progress.currentSection / (progress.totalSections || 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {!query.trim() ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted">
            <Search className="w-8 h-8 stroke-1 text-muted/40 mb-2" />
            <p className="text-xs font-bold text-main mb-1">{t('searchInBook')}</p>
            <p className="text-[11px] text-muted max-w-[200px] leading-relaxed">
              {t('searchInBookPlaceholder')}
            </p>
          </div>
        ) : matches.length === 0 && !isSearching ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted">
            <BookOpen className="w-8 h-8 stroke-1 text-muted/40 mb-2" />
            <p className="text-xs font-bold text-main mb-1">{t('noMatchesInBook')}</p>
            <p className="text-[11px] text-muted max-w-[220px] leading-relaxed">
              {t('noMatchesHint')}
            </p>
          </div>
        ) : (
          matches.map((m, idx) => {
            const isActive = idx === activeMatchIndex;
            return (
              <div
                key={m.id}
                onClick={() => handleSelectMatch(m, idx)}
                className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                  isActive
                    ? 'border-pale-sky-500 bg-pale-sky-500/10 shadow-xs ring-1 ring-pale-sky-500/30'
                    : 'border-subtle bg-canvas/30 hover:bg-canvas hover:border-subtle/80'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5 text-[10px]">
                  <span className="font-bold text-pale-sky-600 dark:text-pale-sky-400 truncate max-w-[170px] flex items-center gap-1">
                    <Bookmark className="w-3 h-3 shrink-0" />
                    {m.chapterTitle || `${t('page')} ${m.pageNumber}`}
                  </span>
                  <span className="px-1.5 py-0.2 rounded-md bg-surface border border-subtle text-muted font-mono">
                    {t('page')} {m.pageNumber}
                  </span>
                </div>

                {/* Highlighted context snippet */}
                <p
                  className="text-[11px] text-muted leading-relaxed line-clamp-3 select-none"
                  dangerouslySetInnerHTML={{
                    __html: m.fullSnippet.replace(
                      /<mark>/g,
                      '<mark class="bg-amber-400/30 text-amber-900 dark:text-amber-200 font-bold px-1 py-0.5 rounded">'
                    ),
                  }}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Footer Summary */}
      {matches.length > 0 && (
        <div className="p-2.5 border-t border-subtle bg-canvas/40 flex items-center justify-between text-[11px] text-muted">
          <span className="font-bold text-main">
            {t('foundMatchesCount', { count: matches.length })}
          </span>
          <span className="text-[10px]">
            {t('matchCounter', { current: activeMatchIndex + 1, total: matches.length })}
          </span>
        </div>
      )}
    </aside>
  );
};
