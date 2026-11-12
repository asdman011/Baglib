'use client';
import type { LibgenSearchResult } from '../../../main/services/metadata/libgen.provider';
import type { AnnasSearchResult } from '../../../main/services/metadata/annas.provider';
import { errorMessage } from '../../../shared/errors';


import { BookCoverThumbnail } from './BookCoverThumbnail';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Globe,
  Search,
  BookOpen,
  Rss,
  ExternalLink,
  PlusCircle,
  X,
  Sparkles,
  Loader2,
  AlertCircle,
  Check,
  ShieldCheck,
  ArrowUpDown,
  FolderOpen
} from 'lucide-react';
import { INITIAL_RSS_FEEDS } from '../../data/libraryMockData';
import { BookItem } from '../../types/library';
import { useWorkspace } from '../context/WorkspaceContext';
import { SourceUrlsPanel } from './SourceUrlsPanel';
import { Modal } from '../ui/Modal';
import { pageCountLabel, formatLibraryNumber } from '../../utils/book-count';

interface OnlineLibraryHubProps {
  isOpen: boolean;
  onClose: () => void;
  onImportBook: (newBook: Partial<BookItem>) => void;
}

type SortCriterion = 'relevance' | 'format' | 'year_desc' | 'year_asc' | 'title_asc' | 'size_desc';

export const OnlineLibraryHub: React.FC<OnlineLibraryHubProps> = ({
  isOpen,
  onClose,
  onImportBook,
}) => {
  const { lang, dir, t } = useWorkspace();

  const [activeSource, setActiveSource] = useState<
    'LibGen' | 'AnnasArchive' | 'Shamela' | 'Noor Library' | 'Inoreader'
  >('LibGen');
  const [searchQuery, setSearchQuery] = useState('');
  const [importedId, setImportedId] = useState<string | null>(null);

  // Sorting State
  const [sortBy, setSortBy] = useState<SortCriterion>('relevance');

  // LibGen Live Search States
  const [libgenResults, setLibgenResults] = useState<LibgenSearchResult[]>([]);
  const [isSearchingLibgen, setIsSearchingLibgen] = useState(false);
  const [hasSearchedLibgen, setHasSearchedLibgen] = useState(false);
  const [libgenError, setLibgenError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    const windowAPI = (window).electronAPI;
    if (windowAPI?.onLibgenDownloadProgress) {
      const unsub = windowAPI.onLibgenDownloadProgress((p) => {
        if (p?.md5 && typeof p.percent === 'number') {
          setDownloadProgress((prev) => ({ ...prev, [p.md5]: p.percent }));
        }
      });
      return () => unsub();
    }
  }, []);

  // Anna's Archive Live Search States
  const [annasResults, setAnnasResults] = useState<AnnasSearchResult[]>([]);
  const [isSearchingAnnas, setIsSearchingAnnas] = useState(false);
  const [hasSearchedAnnas, setHasSearchedAnnas] = useState(false);
  const [annasError, setAnnasError] = useState<string | null>(null);

  // Shielded Download States
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadToast, setDownloadToast] = useState<{ message: string; path?: string; isError?: boolean } | null>(null);

  const sources = [
    {
      id: 'LibGen',
      label: t('libgenTabLabel') || 'LibGen (Library Genesis)',
      color: 'text-evergreen-500',
      desc: t('libgenTabDesc'),
    },
    {
      id: 'AnnasArchive',
      label: t('annasTabLabel'),
      color: 'text-purple-500',
      desc: t('annasTabDesc'),
    },
    {
      id: 'Shamela',
      label: t('onlineShamelaLabel'),
      color: 'text-amber-500',
      desc: t('onlineShamelaDesc'),
    },
    {
      id: 'Noor Library',
      label: t('onlineNoorLabel'),
      color: 'text-pale-sky-500',
      desc: t('onlineNoorDesc'),
    },
    {
      id: 'Inoreader',
      label: 'Inoreader RSS Feed',
      color: 'text-orange-500',
      desc: t('onlineInoreaderDesc'),
    },
  ];

  const onlineResults = [
    {
      id: 'on-1',
      title: 'زاد المعاد في هدي خير العباد',
      author: 'ابن قيم الجوزية',
      publisher: 'مؤسسة الرسالة',
      source: 'Shamela',
      format: 'PDF / Shamela',
      url: 'https://shamela.ws/book/21714',
    },
    {
      id: 'on-3',
      title: 'دراسات في العقل العربي والمعرفة الإسلامية',
      author: 'د. محمد عابد الجابري',
      publisher: 'مركز دراسات الوحدة العربية',
      source: 'Noor Library',
      format: 'EPUB',
      url: 'https://noor-book.com/jabri',
    },
  ];

  const filteredLocalResults = onlineResults.filter(
    (item) => item.source === activeSource || activeSource === 'Inoreader'
  );

  // Sort function prioritizing PDF & EPUB in relevance
  const sortItems = (items: LibgenSearchResult[], criterion: SortCriterion, query: string) => {
    return [...items].sort((a, b) => {
      if (criterion === 'relevance') {
        const getFormatScore = (fmt?: string) => {
          const upper = (fmt || '').toUpperCase();
          if (upper === 'PDF') return 120;
          if (upper === 'EPUB') return 110;
          if (upper === 'MOBI' || upper === 'AZW3' || upper === 'AZW') return 60;
          if (upper === 'DJVU') return 40;
          return 10;
        };

        const getMatchScore = (item: LibgenSearchResult, q: string) => {
          if (!q) return 0;
          const qLow = q.toLowerCase();
          const tLow = (item.title || '').toLowerCase();
          const aLow = (item.author || '').toLowerCase();

          if (tLow === qLow) return 300;
          if (tLow.startsWith(qLow)) return 200;
          if (tLow.includes(qLow)) return 140;
          if (aLow.includes(qLow)) return 70;

          const tokens = qLow.split(/\s+/).filter(Boolean);
          let tokenSum = 0;
          for (const tok of tokens) {
            if (tLow.includes(tok)) tokenSum += 40;
            if (aLow.includes(tok)) tokenSum += 20;
          }
          return tokenSum;
        };

        const scoreA = getFormatScore(a.format) + getMatchScore(a, query);
        const scoreB = getFormatScore(b.format) + getMatchScore(b, query);

        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }

        // Secondary tiebreaker: Year
        const yA = typeof a.year === 'number' ? a.year : parseInt(String(a.year ?? ""), 10) || 0;
        const yB = typeof b.year === 'number' ? b.year : parseInt(String(b.year ?? ""), 10) || 0;
        return yB - yA;
      }

      if (criterion === 'format') {
        const priority: Record<string, number> = {
          PDF: 1,
          EPUB: 2,
          MOBI: 3,
          AZW3: 4,
          AZW: 5,
          DJVU: 6,
        };
        const pA = priority[(a.format || '').toUpperCase()] || 99;
        const pB = priority[(b.format || '').toUpperCase()] || 99;
        if (pA !== pB) return pA - pB;
        return (a.title || '').localeCompare(b.title || '');
      }

      if (criterion === 'year_desc') {
        const yA = parseInt(String(a.year ?? ""), 10) || 0;
        const yB = parseInt(String(b.year ?? ""), 10) || 0;
        return yB - yA;
      }

      if (criterion === 'year_asc') {
        const yA = parseInt(String(a.year ?? ""), 10) || 9999;
        const yB = parseInt(String(b.year ?? ""), 10) || 9999;
        return yA - yB;
      }

      if (criterion === 'title_asc') {
        return (a.title || '').localeCompare(b.title || '');
      }

      if (criterion === 'size_desc') {
        const parseBytes = (sz?: string): number => {
          if (!sz) return 0;
          const match = sz.match(/([\d.]+)\s*(GB|MB|KB)/i);
          if (!match || !match[1] || !match[2]) return 0;
          const num = parseFloat(match[1]);
          const unit = match[2].toUpperCase();
          if (unit === 'GB') return num * 1024 * 1024 * 1024;
          if (unit === 'MB') return num * 1024 * 1024;
          if (unit === 'KB') return num * 1024;
          return num;
        };
        return parseBytes(b.fileSize) - parseBytes(a.fileSize);
      }

      return 0;
    });
  };

  const sortedLibgenResults = useMemo(() => {
    return sortItems(libgenResults, sortBy, searchQuery);
  }, [libgenResults, sortBy, searchQuery]);

  const sortedAnnasResults = useMemo(() => {
    return sortItems(annasResults, sortBy, searchQuery);
  }, [annasResults, sortBy, searchQuery]);

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    const windowAPI = (window).electronAPI;

    if (activeSource === 'LibGen') {
      setIsSearchingLibgen(true);
      setHasSearchedLibgen(true);
      setLibgenError(null);
      try {
        if (windowAPI?.searchLibgen) {
          const results = await windowAPI.searchLibgen(searchQuery.trim(), 25);
          setLibgenResults(results || []);
        } else {
          setLibgenResults([]);
        }
      } catch (err: unknown) {
        console.error('LibGen search error:', err);
        setLibgenError(errorMessage(err) || t('onlineLibgenConnectionFailed'));
      } finally {
        setIsSearchingLibgen(false);
      }
    } else if (activeSource === 'AnnasArchive') {
      setIsSearchingAnnas(true);
      setHasSearchedAnnas(true);
      setAnnasError(null);
      try {
        if (windowAPI?.searchAnnasArchive) {
          const results = await windowAPI.searchAnnasArchive(searchQuery.trim(), 25);
          setAnnasResults(results || []);
        } else {
          setAnnasResults([]);
        }
      } catch (err: unknown) {
        console.error('Annas Archive search error:', err);
        setAnnasError(errorMessage(err) || t('onlineAnnasConnectionFailed'));
      } finally {
        setIsSearchingAnnas(false);
      }
    }
  };

  const handleShieldedDownload = async (item: LibgenSearchResult) => {
    // Prevent accidentally downloading HTML details pages
    const isDirectDownload = item.downloadUrl && !item.downloadUrl.includes('edition.php') && !item.downloadUrl.includes('file.php');
    const targetUrl = isDirectDownload ? item.downloadUrl : null;
    if (!targetUrl && !item.md5) {
      setDownloadToast({
        message: t('onlineDirectDownloadUnavailable'),
        isError: true,
      });
      return;
    }

    setDownloadingId(item.id);
    const windowAPI = (window).electronAPI;
    const format = (item.format || 'pdf').toLowerCase();
    const filename = `${item.title.slice(0, 50)}.${format}`;

    try {
      let res: { success?: boolean; path?: string; filePath?: string; error?: string; sha256?: string; md5?: string } | undefined;
      if (item.md5 && windowAPI?.downloadLibgen) {
        res = await windowAPI.downloadLibgen({
          md5: item.md5,
          ipfsCid: item.ipfsCid,
          filename,
          expectedFormat: format,
        });
      } else if (targetUrl && windowAPI?.safeDownload) {
        res = await windowAPI.safeDownload(targetUrl, filename);
      }
      if (res && res.success && res.filePath) {
        res.path = res.filePath;
      }
      if (res && res.success && res.path) {
          const pathExt = (res.path.split('.').pop() || '').toUpperCase();
          const digitalFormat = ['PDF', 'EPUB', 'MOBI', 'AZW3', 'DJVU', 'CBZ', 'CBR', 'FB2', 'TXT'].includes(pathExt)
            ? pathExt
            : (item.format || 'PDF').toUpperCase();
          let coverImage = item.coverUrl;
          if (res.path.toLowerCase().endsWith('.pdf') && windowAPI?.extractPdfCover) {
            try {
              const pdfCoverRes = await windowAPI.extractPdfCover(res.path);
              if (pdfCoverRes?.success && pdfCoverRes.coverUrl) {
                coverImage = pdfCoverRes.coverUrl;
              }
            } catch (err) {
              console.warn('[OnlineLibraryHub] extractPdfCover error:', err);
            }
          } else if (!coverImage && res.path.toLowerCase().endsWith('.epub') && windowAPI?.extractEpubCover) {
            try {
              const epubCoverRes = await windowAPI.extractEpubCover(res.path);
              if (epubCoverRes?.success && epubCoverRes.coverUrl) {
                coverImage = epubCoverRes.coverUrl;
              }
            } catch (err) {
              console.warn('[OnlineLibraryHub] extractEpubCover error:', err);
            }
          }

          onImportBook({
            id: item.id,
            title: item.title,
            author: item.author,
            publisher: item.publisher,
            publicationYear: item.year,
            language: item.language || (item.title && /[\u0600-\u06FF]/.test(item.title) ? 'العربية' : undefined),
            digitalFormat: digitalFormat as BookItem['digitalFormat'],
            bookType: 'digital',
            onlineSource: (activeSource === 'AnnasArchive' ? "Anna Archive" : activeSource),
            categories: ['مستورد من الإنترنت', activeSource],
            coverImage: coverImage,
            isbn: item.isbn,
            filePath: res.path,
            fileSize: item.fileSize,
            fileHash: res.sha256 || res.md5 || item.md5,
            tags: [`#${activeSource}`, digitalFormat],
            lendingHistory: [],
          });
          setDownloadToast({
            message: t('downloadAndImportSuccess') || 'Book downloaded & added to your library successfully!',
            path: res.path,
            isError: false,
          });
        } else {
          const failMsg = res?.error || t('downloadFailed') || t('onlineMirrorDownloadFailed');
          setDownloadToast({
            message: failMsg,
            isError: true,
          });
        }
    } catch (err: unknown) {
      const errDetail = errorMessage(err) || t('downloadFailed') || t('onlineDownloadFailed');
      setDownloadToast({
        message: errDetail,
        isError: true,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleImportOnlineItem = (item: Partial<LibgenSearchResult> & { id: string; title: string; author: string; url?: string }, sourceName: string) => {
    const isEpub = item.format?.toUpperCase() === 'EPUB';
    onImportBook({
      title: item.title,
      author: item.author,
      publisher: item.publisher,
      publicationYear: item.year,
      language: item.language || (item.title && /[\u0600-\u06FF]/.test(item.title) ? 'العربية' : undefined),
      digitalFormat: isEpub ? 'EPUB' : 'PDF',
      bookType: 'digital',
      onlineSource: (sourceName === "Anna's Archive" ? 'Anna Archive' : sourceName) as BookItem['onlineSource'],
      categories: ['مستورد من الإنترنت', sourceName],
      coverImage: item.coverUrl,
      isbn: item.isbn,
      filePath: item.downloadUrl || item.detailUrl,
      tags: [`#${sourceName}`, item.format || 'PDF'],
      lendingHistory: [],
    });
    setImportedId(item.id);
    setTimeout(() => setImportedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <Modal asChild open={true} onClose={onClose} label={t('onlineHubTitle')}><div
        className="w-full max-w-4xl bg-surface border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[85vh] font-sans"
        dir={dir}
      >
        {/* Header */}
        <div className="p-4 bg-canvas/80 border-b border-subtle flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pale-sky-500/10 border border-pale-sky-500/20 flex items-center justify-center text-pale-sky-500 font-bold shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-main text-base">{t('onlineHubTitle')}</h3>
              <p className="text-xs text-muted">{t('onlineHubDesc')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main cursor-pointer"
           aria-label={t('close')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Selector Bar */}
        <div className="p-3 bg-canvas border-b border-subtle flex items-center gap-2 overflow-x-auto no-scrollbar">
          {sources.map((src) => (
            <button
              key={src.id}
              onClick={() => {
                setActiveSource(src.id as typeof activeSource);
                setSearchQuery('');
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeSource === src.id
                  ? 'bg-pale-sky-500 text-white shadow-sm'
                  : 'bg-surface border border-subtle text-muted hover:text-main hover:bg-canvas'
              }`}
            >
              <span>{src.label}</span>
            </button>
          ))}
        </div>



        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {activeSource === 'LibGen' || activeSource === 'AnnasArchive' ? (
            /* ============================================================= */
            /* LIBGEN & ANNA'S ARCHIVE LIVE SEARCH INTERFACE                */
            /* ============================================================= */
            <div className="space-y-4">
              {/* Search Form & Sort Control */}
              <div className="space-y-3">
                <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 p-3 rounded-2xl bg-canvas border border-subtle text-xs focus-within:border-pale-sky-500/60 transition-colors">
                    <Search className="w-4 h-4 text-pale-sky-500 shrink-0" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={
                        activeSource === 'LibGen'
                          ? t('libgenSearchPlaceholder')
                          : t('annasSearchPlaceholder')
                      }
                      className="flex-1 bg-transparent outline-none text-main placeholder:text-muted font-sans text-xs"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="text-muted hover:text-main cursor-pointer"
                       aria-label={t('searchClearQuery')}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={
                      (activeSource === 'LibGen' ? isSearchingLibgen : isSearchingAnnas) ||
                      !searchQuery.trim()
                    }
                    className={`px-5 py-3 rounded-2xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer shrink-0 ${
                      (activeSource === 'LibGen' ? isSearchingLibgen : isSearchingAnnas) ||
                      !searchQuery.trim()
                        ? 'bg-muted/30 text-muted cursor-not-allowed'
                        : 'bg-pale-sky-500 text-white hover:bg-pale-sky-600'
                    }`}
                  >
                    {(activeSource === 'LibGen' ? isSearchingLibgen : isSearchingAnnas) ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>
                          {activeSource === 'LibGen'
                            ? t('searchingLibgen')
                            : t('searchingAnnas')}
                        </span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        <span>{t('searchBtn')}</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Sub-bar: Tip & Sorting Mechanism */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="px-3 py-1.5 rounded-xl bg-pale-sky-500/10 border border-pale-sky-500/20 text-[11px] text-pale-sky-600 dark:text-pale-sky-300 font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {activeSource === 'LibGen'
                        ? t('libgenAdvancedTip')
                        : t('annasAdvancedTip')}
                    </span>
                  </div>

                  {/* Sort Dropdown Selector */}
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <span className="text-[11px] font-bold text-muted flex items-center gap-1">
                      <ArrowUpDown className="w-3 h-3 text-pale-sky-500" />
                      {t('sortByLabel')}
                    </span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortCriterion)}
                      className="px-2.5 py-1.5 rounded-xl bg-canvas border border-subtle text-main text-[11px] font-bold outline-none cursor-pointer hover:border-pale-sky-500/50 transition-colors"
                    >
                      <option value="relevance">{t('sortRelevance')}</option>
                      <option value="format">{t('sortFormatPriority')}</option>
                      <option value="year_desc">{t('sortYearDesc')}</option>
                      <option value="year_asc">{t('sortYearAsc')}</option>
                      <option value="title_asc">{t('sortTitleAZ')}</option>
                      <option value="size_desc">{t('sortSizeDesc')}</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Error Alert */}
              {((activeSource === 'LibGen' && libgenError) ||
                (activeSource === 'AnnasArchive' && annasError)) && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{activeSource === 'LibGen' ? libgenError : annasError}</span>
                </div>
              )}

              {/* Loading State */}
              {((activeSource === 'LibGen' && isSearchingLibgen) ||
                (activeSource === 'AnnasArchive' && isSearchingAnnas)) && (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3" role="status">
                  <Loader2 className="w-8 h-8 animate-spin text-pale-sky-500" />
                  <p className="text-xs font-bold text-main">
                    {activeSource === 'LibGen'
                      ? t('searchingLibgen')
                      : t('searchingAnnas')}
                  </p>
                  <p className="text-[11px] text-muted">
                    {t('onlineSearchProgress')}
                  </p>
                </div>
              )}

              {/* Results List */}
              {!(activeSource === 'LibGen' ? isSearchingLibgen : isSearchingAnnas) &&
                (activeSource === 'LibGen' ? sortedLibgenResults : sortedAnnasResults).length >
                  0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-muted">
                      <span>
                        {t('onlineResultsCount', { count: formatLibraryNumber((activeSource === 'LibGen' ? sortedLibgenResults : sortedAnnasResults).length, lang) })}
                      </span>
                      <span className="text-[11px] text-pale-sky-500 font-medium">
                        {sortBy === 'relevance' &&
                          t('onlineRelevanceHint')}
                      </span>
                    </div>

                    {(activeSource === 'LibGen'
                      ? sortedLibgenResults
                      : sortedAnnasResults
                    ).map((item, idx) => (
                      <div
                        key={item.id ? `${item.id}-${idx}` : `item-${idx}`}
                        className="p-4 rounded-2xl bg-canvas border border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-pale-sky-500/40 transition-all group"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <BookCoverThumbnail url={item.coverUrl} title={item.title} className="w-12 h-16 rounded-lg border border-subtle shrink-0" />

                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4
                                className="font-bold text-main text-sm line-clamp-1"
                                title={item.title}
                              >
                                {item.title}
                              </h4>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 font-bold font-mono">
                                {item.format}
                              </span>
                              {item.fileSize && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-subtle text-muted font-mono">
                                  {item.fileSize}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-muted truncate">
                              {t('diagnosticsAuthorLabel')} {item.author}
                              {item.publisher &&
                                ` • ${t('diagnosticsPublisherLabel')} ${item.publisher}`}
                              {item.year && ` • ${item.year}`}
                              {item.pages &&
                                ` • ${pageCountLabel(item.pages, lang, t)}`}
                            </p>

                            {item.isbn && (
                              <p className="text-[10px] text-muted font-mono">
                                ISBN: {item.isbn}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {/* Shielded Safe Download (Defuses Ads & Popunders) */}
                          <button
                            onClick={() => handleShieldedDownload(item)}
                            disabled={downloadingId === item.id}
                            title={t('shieldDownloadBtn')}
                            className="p-2 rounded-xl bg-evergreen-500/10 border border-evergreen-500/20 text-evergreen-600 dark:text-evergreen-400 hover:bg-evergreen-500 hover:text-white text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                           aria-label={t('shieldDownloadBtn')}>
                            {downloadingId === item.id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {item.md5 && typeof downloadProgress[item.md5] === 'number' && downloadProgress[item.md5] > 0 && (
                                  <span className="text-[10px] font-mono font-bold">
                                    {downloadProgress[item.md5]}%
                                  </span>
                                )}
                              </>
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* External Link (opens in OS default browser) */}
                          <button
                            type="button"
                            onClick={() => {
                              const api = (window).electronAPI;
                              if (api?.openExternal && item.detailUrl) {
                                api.openExternal(item.detailUrl);
                              } else if (item.detailUrl) {
                                window.open(item.detailUrl, '_blank');
                              }
                            }}
                            title={t('detailsLink')}
                            className="p-2 rounded-xl bg-surface border border-subtle text-muted hover:text-main text-xs flex items-center gap-1 cursor-pointer transition-colors"
                           aria-label={t('detailsLink')}>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>

                          {/* Add to Library */}
                          <button
                            onClick={() =>
                              handleImportOnlineItem(
                                item,
                                activeSource === 'LibGen' ? 'LibGen' : "Anna's Archive"
                              )
                            }
                            className={`flex items-center gap-1 px-3 py-2 rounded-xl font-bold text-xs transition-all shadow-sm cursor-pointer ${
                              importedId === item.id
                                ? 'bg-evergreen-500 text-white'
                                : 'bg-amber-500 text-white hover:bg-amber-600'
                            }`}
                          >
                            {importedId === item.id ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>{t('addedToLibrary')}</span>
                              </>
                            ) : (
                              <>
                                <PlusCircle className="w-3.5 h-3.5" />
                                <span>{t('addToMyLibrary')}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              {/* No Results Empty State */}
              {!(activeSource === 'LibGen' ? isSearchingLibgen : isSearchingAnnas) &&
                (activeSource === 'LibGen' ? hasSearchedLibgen : hasSearchedAnnas) &&
                (activeSource === 'LibGen' ? libgenResults : annasResults).length === 0 &&
                !(activeSource === 'LibGen' ? libgenError : annasError) && (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-canvas border border-subtle flex items-center justify-center text-muted">
                      <Search className="w-6 h-6 opacity-40" />
                    </div>
                    <h4 className="font-bold text-main text-sm">
                      {activeSource === 'LibGen'
                        ? t('noLibgenResults')
                        : t('noAnnasResults')}
                    </h4>
                    <p className="text-xs text-muted max-w-sm">
                      {activeSource === 'LibGen'
                        ? t('noLibgenResultsHint')
                        : t('noAnnasResultsHint')}
                    </p>
                  </div>
                )}

              {/* Initial State */}
              {!(activeSource === 'LibGen' ? isSearchingLibgen : isSearchingAnnas) &&
                !(activeSource === 'LibGen' ? hasSearchedLibgen : hasSearchedAnnas) && (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-evergreen-500/10 border border-evergreen-500/20 flex items-center justify-center text-evergreen-500">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold text-main text-sm">
                      {activeSource === 'LibGen'
                        ? t('libgenTabLabel')
                        : t('annasTabLabel')}
                    </h4>
                    <p className="text-xs text-muted max-w-sm">
                      {activeSource === 'LibGen'
                        ? t('libgenInitialPrompt')
                        : t('annasInitialPrompt')}
                    </p>
                    <div className="w-full max-w-xl pt-4 text-start"><SourceUrlsPanel /></div>
                  </div>
                )}
            </div>
          ) : activeSource !== 'Inoreader' ? (
            /* Other Online Sources */
            <>
              {/* Search Bar */}
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-canvas border border-subtle text-xs">
                <Search className="w-4 h-4 text-pale-sky-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('onlineSearchPlaceholder', { source: sources.find((s) => s.id === activeSource)?.label ?? '' })}
                  className="flex-1 bg-transparent outline-none text-main placeholder:text-muted font-sans text-xs"
                />
              </div>

              {/* Results List */}
              <div className="space-y-3">
                {filteredLocalResults.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-canvas border border-subtle flex items-center justify-between hover:border-pale-sky-500/40 transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-main text-sm">{item.title}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-pale-sky-500/10 text-pale-sky-500 font-bold">
                          {item.format}
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        {t('onlineAuthorPublisher', { author: item.author, publisher: item.publisher })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-xl bg-surface border border-subtle text-muted hover:text-main text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleImportOnlineItem(item, item.source)}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition-all shadow-sm cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>
                          {importedId === item.id
                            ? t('addedToLibrary')
                            : t('addToMyLibrary')}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Inoreader RSS Stream View */
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs font-semibold flex items-center gap-2">
                <Rss className="w-4 h-4" />
                <span>{t('onlineInoreaderSummary')}</span>
              </div>

              {INITIAL_RSS_FEEDS.map((feed) => (
                <div
                  key={feed.id}
                  className="p-4 rounded-2xl bg-canvas border border-subtle space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-main text-sm">{feed.title}</span>
                    <span className="text-[10px] text-muted">{feed.date}</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">{feed.snippet}</p>
                  <div className="pt-2 flex items-center justify-between border-t border-subtle/50 text-[11px]">
                    <span className="text-pale-sky-500 font-semibold">{feed.source}</span>
                    <a
                      href={feed.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-500 font-bold hover:underline flex items-center gap-1"
                    >
                      <span>{t('onlineReadFullArticle')}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Interactive Download Toast with Folder and File actions */}
        {downloadToast && (
          <div className="mx-4 mb-3 p-3 rounded-2xl bg-canvas border border-evergreen-500/30 text-main shadow-lg flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-2.5 min-w-0">
              {downloadToast.isError ? (
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              ) : (
                <Check className="w-5 h-5 text-evergreen-500 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-main truncate">{downloadToast.message}</p>
                {downloadToast.path && (
                  <p className="text-[10px] text-muted truncate max-w-md font-mono">{downloadToast.path}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {downloadToast.path && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const api = (window).electronAPI;
                      if (api?.showItemInFolder && downloadToast.path) {
                        api.showItemInFolder(downloadToast.path);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-evergreen-500/10 hover:bg-evergreen-500/20 text-evergreen-600 dark:text-evergreen-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-evergreen-500/20"
                    title={t('showInFolder') || 'عرض في المجلد'}
                   aria-label={t('showInFolder')}>
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>{t('showInFolder') || 'عرض في المجلد'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const api = (window).electronAPI;
                      if (api?.openFile && downloadToast.path) {
                        api.openFile(downloadToast.path);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-pale-sky-500/10 hover:bg-pale-sky-500/20 text-pale-sky-600 dark:text-pale-sky-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-pale-sky-500/20"
                    title={t('openDownloadedFile') || 'فتح الملف'}
                   aria-label={t('openDownloadedFile')}>
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>{t('openDownloadedFile') || 'فتح الملف'}</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setDownloadToast(null)}
                className="p-1 rounded-lg hover:bg-surface text-muted hover:text-main cursor-pointer"
                title={t('close')}
               aria-label={t('close')}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 bg-canvas border-t border-subtle flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-surface border border-subtle text-xs font-bold text-main hover:bg-canvas transition-all cursor-pointer"
          >
            {t('onlineHubClose')}
          </button>
        </div>
      </div></Modal>
    </div>
  );
};
