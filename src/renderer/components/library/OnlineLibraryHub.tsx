'use client';

import React, { useState, useMemo } from 'react';
import {
  Globe,
  Search,
  BookOpen,
  Rss,
  ExternalLink,
  Download,
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
  const [libgenResults, setLibgenResults] = useState<any[]>([]);
  const [isSearchingLibgen, setIsSearchingLibgen] = useState(false);
  const [hasSearchedLibgen, setHasSearchedLibgen] = useState(false);
  const [libgenError, setLibgenError] = useState<string | null>(null);

  // Anna's Archive Live Search States
  const [annasResults, setAnnasResults] = useState<any[]>([]);
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
      desc: t('libgenTabDesc') || 'الأوراق والأبحاث الأكاديمية والكتب العالمية',
    },
    {
      id: 'AnnasArchive',
      label: t('annasTabLabel') || "Anna's Archive (أرشيف آنّا)",
      color: 'text-purple-500',
      desc: t('annasTabDesc') || 'أرشيف الكتب العالمي المفتوح',
    },
    {
      id: 'Shamela',
      label: 'المكتبة الشاملة',
      color: 'text-amber-500',
      desc: 'تراث المصنفات والتفاسير',
    },
    {
      id: 'Noor Library',
      label: 'مكتبة نور',
      color: 'text-pale-sky-500',
      desc: 'الكتب العربية العامة والحديثة',
    },
    {
      id: 'Inoreader',
      label: 'Inoreader RSS Feed',
      color: 'text-orange-500',
      desc: 'تجميع المقالات والأخبار العلمية',
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
  const sortItems = (items: any[], criterion: SortCriterion, query: string) => {
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

        const getMatchScore = (item: any, q: string) => {
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
        const yA = typeof a.year === 'number' ? a.year : parseInt(a.year, 10) || 0;
        const yB = typeof b.year === 'number' ? b.year : parseInt(b.year, 10) || 0;
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
        const yA = parseInt(a.year, 10) || 0;
        const yB = parseInt(b.year, 10) || 0;
        return yB - yA;
      }

      if (criterion === 'year_asc') {
        const yA = parseInt(a.year, 10) || 9999;
        const yB = parseInt(b.year, 10) || 9999;
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

    const windowAPI = (window as any).electronAPI;

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
      } catch (err: any) {
        console.error('LibGen search error:', err);
        setLibgenError(err?.message || (lang === 'ar' ? 'فشل الاتصال بـ Library Genesis' : 'Failed to connect to Library Genesis'));
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
      } catch (err: any) {
        console.error('Annas Archive search error:', err);
        setAnnasError(err?.message || (lang === 'ar' ? 'فشل الاتصال بأرشيف آنّا' : 'Failed to connect to Anna\'s Archive'));
      } finally {
        setIsSearchingAnnas(false);
      }
    }
  };

  const handleShieldedDownload = async (item: any) => {
    const targetUrl = item.downloadUrl || item.detailUrl;
    if (!targetUrl) return;

    setDownloadingId(item.id);
    const windowAPI = (window as any).electronAPI;
    const format = (item.format || 'pdf').toLowerCase();
    const filename = `${item.title.slice(0, 50)}.${format}`;

    try {
      if (windowAPI?.safeDownload) {
        const res = await windowAPI.safeDownload(targetUrl, filename);
        if (res.success && res.path) {
          const isEpub = (item.format || '').toUpperCase() === 'EPUB';
          let coverImage = item.coverUrl;
          if (!coverImage && res.path.toLowerCase().endsWith('.pdf') && windowAPI?.extractPdfCover) {
            try {
              const pdfCoverRes = await windowAPI.extractPdfCover(res.path);
              if (pdfCoverRes?.success && pdfCoverRes.coverUrl) {
                coverImage = pdfCoverRes.coverUrl;
              }
            } catch (err) {
              console.warn('[OnlineLibraryHub] extractPdfCover error:', err);
            }
          }

          onImportBook({
            id: item.id || `download-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            title: item.title,
            author: item.author,
            publisher: item.publisher,
            publicationYear: item.year,
            language: item.language || (item.title.match(/[\u0600-\u06FF]/) ? 'العربية' : 'English'),
            digitalFormat: isEpub ? 'EPUB' : 'PDF',
            bookType: 'digital',
            onlineSource: (activeSource === 'AnnasArchive' ? "Anna Archive" : activeSource) as any,
            categories: ['مستورد من الإنترنت', activeSource],
            coverImage: coverImage,
            isbn: item.isbn,
            filePath: res.path,
            fileSize: item.fileSize,
            tags: [`#${activeSource}`, item.format || 'PDF'],
            lendingHistory: [],
          });
          setDownloadToast({
            message: t('downloadAndImportSuccess') || 'Book downloaded & added to your library successfully!',
            path: res.path,
            isError: false,
          });
        } else {
          setDownloadToast({
            message: t('downloadFailed') || 'Download failed',
            isError: true,
          });
        }
      } else {
        window.open(targetUrl, '_blank');
      }
    } catch {
      setDownloadToast({
        message: t('downloadFailed') || 'Download failed',
        isError: true,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleImportOnlineItem = (item: any, sourceName: string) => {
    const isEpub = item.format?.toUpperCase() === 'EPUB';
    onImportBook({
      title: item.title,
      author: item.author,
      publisher: item.publisher,
      publicationYear: item.year,
      language: item.language || (item.title.match(/[\u0600-\u06FF]/) ? 'العربية' : 'English'),
      digitalFormat: isEpub ? 'EPUB' : 'PDF',
      bookType: 'digital',
      onlineSource: (sourceName === "Anna's Archive" ? 'Anna Archive' : sourceName) as any,
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
      <div
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
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Selector Bar */}
        <div className="p-3 bg-canvas border-b border-subtle flex items-center gap-2 overflow-x-auto no-scrollbar">
          {sources.map((src) => (
            <button
              key={src.id}
              onClick={() => {
                setActiveSource(src.id as any);
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
                      >
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
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-pale-sky-500" />
                  <p className="text-xs font-bold text-main">
                    {activeSource === 'LibGen'
                      ? t('searchingLibgen')
                      : t('searchingAnnas')}
                  </p>
                  <p className="text-[11px] text-muted">
                    {lang === 'ar'
                      ? 'جاري فحص الخوادم واستخراج البيانات...'
                      : 'Querying mirror endpoints and parsing records...'}
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
                        {lang === 'ar'
                          ? `النتائج (${(activeSource === 'LibGen' ? sortedLibgenResults : sortedAnnasResults).length})`
                          : `Results (${(activeSource === 'LibGen' ? sortedLibgenResults : sortedAnnasResults).length})`}
                      </span>
                      <span className="text-[11px] text-pale-sky-500 font-medium">
                        {sortBy === 'relevance' &&
                          (lang === 'ar'
                            ? 'مرتب حسب الصلة (PDF و EPUB في المقدمة)'
                            : 'Sorted by relevance (PDF & EPUB on top)')}
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
                          {item.coverUrl ? (
                            <img
                              src={item.coverUrl}
                              alt={item.title}
                              className="w-12 h-16 object-cover rounded-lg border border-subtle shrink-0 bg-surface"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-12 h-16 rounded-lg bg-surface border border-subtle flex items-center justify-center text-muted shrink-0">
                              <BookOpen className="w-5 h-5 opacity-40" />
                            </div>
                          )}

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
                              {lang === 'ar' ? 'المؤلف:' : 'Author:'} {item.author}
                              {item.publisher &&
                                ` • ${lang === 'ar' ? 'الناشر:' : 'Publisher:'} ${item.publisher}`}
                              {item.year && ` • ${item.year}`}
                              {item.pages &&
                                ` • ${item.pages} ${lang === 'ar' ? 'صفحة' : 'pages'}`}
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
                            className="p-2 rounded-xl bg-evergreen-500/10 border border-evergreen-500/20 text-evergreen-600 dark:text-evergreen-400 hover:bg-evergreen-500 hover:text-white text-xs flex items-center gap-1 cursor-pointer transition-all"
                          >
                            {downloadingId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* External Link */}
                          <a
                            href={item.detailUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={t('detailsLink')}
                            className="p-2 rounded-xl bg-surface border border-subtle text-muted hover:text-main text-xs flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>

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
                  placeholder={`ابحث في ${sources.find((s) => s.id === activeSource)?.label} عن كتب، مؤلفين، أو عناوين...`}
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
                        المؤلف: {item.author} • الناشر: {item.publisher}
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
                <span>تجميع خلاصة Inoreader والمجلات العلمية المتجددة</span>
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
                      <span>قراءة المقال الكامل</span>
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
                      const api = (window as any).electronAPI;
                      if (api?.showItemInFolder && downloadToast.path) {
                        api.showItemInFolder(downloadToast.path);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-evergreen-500/10 hover:bg-evergreen-500/20 text-evergreen-600 dark:text-evergreen-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-evergreen-500/20"
                    title={t('showInFolder') || 'عرض في المجلد'}
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>{t('showInFolder') || 'عرض في المجلد'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const api = (window as any).electronAPI;
                      if (api?.openFile && downloadToast.path) {
                        api.openFile(downloadToast.path);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-pale-sky-500/10 hover:bg-pale-sky-500/20 text-pale-sky-600 dark:text-pale-sky-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-pale-sky-500/20"
                    title={t('openDownloadedFile') || 'فتح الملف'}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>{t('openDownloadedFile') || 'فتح الملف'}</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setDownloadToast(null)}
                className="p-1 rounded-lg hover:bg-surface text-muted hover:text-main cursor-pointer"
                title="إغلاق"
              >
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
      </div>
    </div>
  );
};
