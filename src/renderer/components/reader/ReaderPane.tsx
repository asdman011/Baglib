'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  FileText,
  FileCode,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  AlertCircle,
  ListTree,
  X,
  BookMarked,
  ZoomIn,
  ZoomOut,
  ScanText,
} from 'lucide-react';
import { OcrTextOverlay } from './OcrTextOverlay';
import type { OcrPageResult } from '../../../shared/types/ocr';
import { BookItem } from '../../types/library';
import { DocumentLoader, detectFormat } from '../../libs/reader/document-loader';
import type { BookDoc, BookFormat, TOCItem, ReaderTheme } from '../../libs/reader/types';
import {
  paginateBookSections,
  FormattedPage,
} from '../../libs/reader/epub-paginator';
import {
  getReaderStyles,
  transformClassicalGlosses,
  getViewportCssVariables,
} from '../../libs/reader/typography';
import { translations, TranslationKey } from '../../translations';

interface ReaderPaneProps {
  paneId: 'A' | 'B';
  book: BookItem;
  initialPage?: number;
  onPageChange?: (page: number) => void;
  onTotalPagesChange?: (total: number) => void;
  externalPageTarget?: number | null;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const ReaderPane: React.FC<ReaderPaneProps> = ({
  paneId,
  book,
  initialPage = 1,
  onPageChange,
  onTotalPagesChange,
  externalPageTarget,
  t,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [bookDoc, setBookDoc] = useState<BookDoc | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<BookFormat>('PDF');
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('sepia');
  const [readerFontSize, setReaderFontSize] = useState<number>(18);
  const [readerDirection, setReaderDirection] = useState<'rtl' | 'ltr'>('ltr');
  const [isTocOpen, setIsTocOpen] = useState<boolean>(false);
  const [currentSectionHtml, setCurrentSectionHtml] = useState<string>('');
  const [comicPageUrl, setComicPageUrl] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);

  // EPUB & Reflowable Pagination State
  const [paginatedPages, setPaginatedPages] = useState<FormattedPage[]>([]);
  const [tocPageMap, setTocPageMap] = useState<Map<string | number, number>>(new Map());
  const [isPaginating, setIsPaginating] = useState<boolean>(false);

  // Extracted PDF text
  const [extractedFullText, setExtractedFullText] = useState<string>('');
  const [extractedPages, setExtractedPages] = useState<string[]>([]);
  const [isExtractingText, setIsExtractingText] = useState<boolean>(false);
  const [extractionFailed, setExtractionFailed] = useState<boolean>(false);
  const [scannedInfo, setScannedInfo] = useState<{ numPages: number; totalChars: number } | null>(null);

  // Privileged stream asset URL & Native PDF Blob URL
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [viewType, setViewType] = useState<'text_manuscript' | 'native_pdf'>('native_pdf');

  // OCR state for scanned PDFs in ReaderPane
  const [ocrPages, setOcrPages] = useState<Map<number, OcrPageResult>>(new Map());
  const [isOcrRunning, setIsOcrRunning] = useState<boolean>(false);

  const isComic = ['CBZ', 'CBR', 'CBT', 'CB7'].includes(detectedFormat);
  const isReflowable = [
    'EPUB',
    'MOBI',
    'AZW',
    'AZW3',
    'FB2',
    'FBZ',
    'TXT',
    'MD',
    'DOCX',
    'HTML',
  ].includes(detectedFormat);

  // Maximum pages calculation
  const maxPages = Math.max(
    1,
    detectedFormat === 'PDF'
      ? (scannedInfo?.numPages || (bookDoc?.sections?.length || book.pagesCount || 1))
      : isComic
      ? (bookDoc?.sections?.length || 1)
      : (paginatedPages.length > 0 ? paginatedPages.length : (bookDoc?.sections?.length || 1))
  );

  const activeFormattedPage = paginatedPages[currentPage - 1];

  // Report total pages to parent
  useEffect(() => {
    onTotalPagesChange?.(maxPages);
  }, [maxPages, onTotalPagesChange]);

  // Handle external page sync from partner pane
  useEffect(() => {
    if (externalPageTarget != null && externalPageTarget >= 1 && externalPageTarget <= maxPages) {
      if (externalPageTarget !== currentPage) {
        setCurrentPage(externalPageTarget);
        onPageChange?.(externalPageTarget);
      }
    }
  }, [externalPageTarget, maxPages]);

  // Load document pipeline
  useEffect(() => {
    let isCancelled = false;
    let activeObjectUrl: string | null = null;

    const loadDoc = async () => {
      if (!book.filePath) return;
      setIsLoadingFile(true);
      setIsExtractingText(true);
      setExtractionFailed(false);

      const filePath = book.filePath;
      const format = detectFormat(filePath);
      setDetectedFormat(format);

      const streamUrl = `baglib-asset://${encodeURIComponent(filePath)}`;
      setAssetUrl(streamUrl);

      const windowAPI = (window as any).electronAPI;

      try {
        let bytes: Uint8Array | null = null;
        try {
          const res = await fetch(streamUrl);
          if (res.ok) {
            bytes = new Uint8Array(await res.arrayBuffer());
          }
        } catch (e) {
          console.warn(`[baglib:pane-${paneId}] Stream fetch error:`, e);
        }

        if (!bytes && windowAPI?.readPdfBase64) {
          try {
            const b64 = await windowAPI.readPdfBase64(filePath);
            if (b64) {
              const bin = atob(b64);
              bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            }
          } catch (e) {
            console.warn(`[baglib:pane-${paneId}] readPdfBase64 error:`, e);
          }
        }

        if (bytes && !isCancelled) {
          // If PDF, construct authentic Blob URL for native iframe rendering
          if (format === 'PDF') {
            const pdfBlob = new Blob([bytes as any], { type: 'application/pdf' });
            activeObjectUrl = URL.createObjectURL(pdfBlob);
            setPdfBlobUrl(activeObjectUrl);
            setViewType('native_pdf');
          }

          const loader = new DocumentLoader(bytes, filePath, {
            theme: readerTheme,
            languageHint: book.language,
          });
          const { book: doc } = await loader.open();

          if (!isCancelled) {
            setBookDoc(doc);
            setReaderDirection(doc.dir || 'ltr');

            if (['CBZ', 'CBR', 'CBT', 'CB7'].includes(format)) {
              const first = doc.sections[0];
              if (first?.load) {
                const img = await first.load();
                setComicPageUrl(img);
              }
            } else if (format !== 'PDF') {
              // Paginate reflowable EPUB/MOBI/FB2/HTML/TXT sections into screen-sized pages
              setIsPaginating(true);
              try {
                const { pages, tocMap } = await paginateBookSections(doc.sections, doc.toc, 1500);
                if (!isCancelled) {
                  setPaginatedPages(pages);
                  setTocPageMap(tocMap);
                }
              } catch (e) {
                console.warn(`[baglib:pane-${paneId}] Pagination error:`, e);
              } finally {
                if (!isCancelled) setIsPaginating(false);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[baglib:pane-${paneId}] DocumentLoader error:`, err);
      }

      if (format === 'PDF' && windowAPI?.extractPdfText) {
        try {
          const result = await windowAPI.extractPdfText(filePath);
          if (!isCancelled) {
            if (result && result.isScannedImagePdf) {
              setExtractionFailed(true);
              setScannedInfo({ numPages: result.numpages || 1, totalChars: result.totalChars || 0 });
              setViewType('native_pdf');
            } else if (result && result.text && result.text.trim().length > 20) {
              const full = result.text;
              setExtractedFullText(full);
              const pageRegex = /(?:\r?\n---PAGE_SPLIT_MARKER---\r?\n|\f)/g;
              let rawPages = full.split(pageRegex).map((p: string) => p.trim()).filter((p: string) => p.length > 0);
              if (rawPages.length === 0) {
                const chunkSize = 1200;
                rawPages = [];
                for (let i = 0; i < full.length; i += chunkSize) {
                  rawPages.push(full.substring(i, i + chunkSize));
                }
              }
              setExtractedPages(rawPages);
              if (result.numpages) {
                setScannedInfo({ numPages: result.numpages, totalChars: full.length });
              }
            } else {
              setExtractionFailed(true);
            }
          }
        } catch {
          if (!isCancelled) setExtractionFailed(true);
        } finally {
          if (!isCancelled) {
            setIsExtractingText(false);
            setIsLoadingFile(false);
          }
        }
      } else {
        if (!isCancelled) {
          setIsExtractingText(false);
          setIsLoadingFile(false);
        }
      }
    };

    loadDoc();

    return () => {
      isCancelled = true;
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
      bookDoc?.destroy?.();
    };
  }, [book.filePath]);

  // Update section content when currentPage changes
  useEffect(() => {
    let isCancelled = false;

    const updateSection = async () => {
      if (!bookDoc || !bookDoc.sections.length) return;
      const secIdx = Math.min(bookDoc.sections.length - 1, Math.max(0, currentPage - 1));
      const section = bookDoc.sections[secIdx];
      if (!section) return;

      if (['CBZ', 'CBR', 'CBT', 'CB7'].includes(detectedFormat)) {
        if (section.load) {
          const img = await section.load();
          if (!isCancelled) setComicPageUrl(img);
        }
        return;
      }

      if (section.createDocument) {
        try {
          const doc = await section.createDocument();
          if (!isCancelled && doc?.body) {
            setCurrentSectionHtml(doc.body.innerHTML);
          }
        } catch (err) {
          console.warn(`[baglib:pane-${paneId}] Section error:`, err);
        }
      } else if (section.loadText) {
        const text = await section.loadText();
        if (!isCancelled && text) {
          setCurrentSectionHtml(transformClassicalGlosses(text));
        }
      }
    };

    updateSection();

    return () => {
      isCancelled = true;
    };
  }, [currentPage, bookDoc, detectedFormat]);

  const handlePageStep = (delta: number) => {
    const next = Math.max(1, Math.min(maxPages, currentPage + delta));
    setCurrentPage(next);
    onPageChange?.(next);
  };

  const handleJumpToTOC = (item: TOCItem) => {
    const target =
      tocPageMap.get(item.id) ||
      tocPageMap.get(item.href) ||
      (item.index >= 0 ? item.index + 1 : 1);
    const safeTarget = Math.min(maxPages, Math.max(1, target));
    setCurrentPage(safeTarget);
    onPageChange?.(safeTarget);
    setIsTocOpen(false);
  };

  const activePageText =
    activeFormattedPage?.text ||
    extractedPages[currentPage - 1] ||
    ocrPages.get(currentPage)?.text ||
    extractedFullText;

  const themeClasses = {
    light: 'bg-white text-slate-800 border-slate-200',
    dark: 'bg-[#0f172a] text-slate-100 border-slate-700',
    sepia: 'bg-[#fbf0d9] text-[#5f4b32] border-[#e6d5b8]',
    night: 'bg-[#000000] text-[#999999] border-neutral-800',
    'e-ink': 'bg-[#ffffff] text-[#000000] border-black',
  };

  return (
    <div
      className={`flex-1 flex flex-col h-full bg-canvas text-main overflow-hidden select-none relative border border-subtle/50 rounded-2xl shadow-sm`}
      style={getViewportCssVariables({
        theme: readerTheme,
        fontSize: readerFontSize,
        lineSpacing: 1.85,
        margin: 20,
      })}
    >
      {/* Pane Mini Toolbar */}
      <div className="h-11 bg-surface border-b border-subtle/70 px-3 flex items-center justify-between z-10 shrink-0 gap-2">
        <div className="flex items-center gap-2 truncate">
          <span className="w-5 h-5 rounded-full bg-pale-sky-500/20 text-pale-sky-600 dark:text-pale-sky-400 font-bold text-[10px] flex items-center justify-center font-mono">
            {paneId}
          </span>
          <BookOpen className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
          <span className="font-bold text-xs truncate max-w-[140px] sm:max-w-[200px]" title={book.title}>
            {book.title}
          </span>
          <span className="text-[9px] px-1.5 py-0.2 rounded bg-pale-sky-500/10 text-pale-sky-600 font-mono font-bold uppercase">
            {detectedFormat}
          </span>
        </div>

        {/* Navigation & Formatting */}
        <div className="flex items-center gap-1 sm:gap-2 text-xs">
          {/* TOC Drawer Button */}
          {bookDoc?.toc && bookDoc.toc.length > 0 && (
            <button
              onClick={() => setIsTocOpen(!isTocOpen)}
              className={`p-1 rounded-lg border transition-all cursor-pointer ${
                isTocOpen
                  ? 'bg-pale-sky-500 text-white border-pale-sky-500'
                  : 'bg-canvas border-subtle text-muted hover:text-main'
              }`}
              title={t('tableOfContents')}
            >
              <ListTree className="w-3.5 h-3.5" />
            </button>
          )}

          {/* PDF View Mode Switcher */}
          {detectedFormat === 'PDF' && (
            <div className="flex items-center gap-0.5 bg-canvas p-0.5 rounded-lg border border-subtle">
              <button
                onClick={() => setViewType('native_pdf')}
                title={t('readerViewPdf')}
                className={`p-1 rounded text-[10px] font-bold cursor-pointer transition-all ${
                  viewType === 'native_pdf'
                    ? 'bg-pale-sky-500 text-white shadow-xs'
                    : 'text-muted hover:text-main'
                }`}
              >
                <FileCode className="w-3 h-3" />
              </button>
              <button
                onClick={() => setViewType('text_manuscript')}
                title={t('readerViewText')}
                className={`p-1 rounded text-[10px] font-bold cursor-pointer transition-all ${
                  viewType === 'text_manuscript'
                    ? 'bg-pale-sky-500 text-white shadow-xs'
                    : 'text-muted hover:text-main'
                }`}
              >
                <FileText className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Theme Switcher */}
          <div className="flex items-center gap-1 bg-canvas p-0.5 rounded-lg border border-subtle">
            {(['sepia', 'light', 'dark', 'night', 'e-ink'] as ReaderTheme[]).map((th) => (
              <button
                key={th}
                onClick={() => setReaderTheme(th)}
                className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center transition-all ${
                  readerTheme === th ? 'ring-1 ring-pale-sky-500' : 'opacity-60'
                }`}
                style={{
                  backgroundColor:
                    th === 'sepia'
                      ? '#fbf0d9'
                      : th === 'light'
                      ? '#ffffff'
                      : th === 'dark'
                      ? '#0f172a'
                      : th === 'night'
                      ? '#000000'
                      : '#ffffff',
                  color: th === 'sepia' ? '#5f4b32' : th === 'light' ? '#1e293b' : '#f1f5f9',
                }}
              >
                A
              </button>
            ))}
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 bg-canvas px-1 rounded-lg border border-subtle">
            <button
              onClick={() => setReaderFontSize((s) => Math.max(12, s - 2))}
              className="p-0.5 text-muted hover:text-main cursor-pointer"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="text-[10px] font-mono px-0.5">{readerFontSize}</span>
            <button
              onClick={() => setReaderFontSize((s) => Math.min(32, s + 2))}
              className="p-0.5 text-muted hover:text-main cursor-pointer"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>

          {/* OCR Trigger Button for Scanned Document Pages */}
          <button
            disabled={isOcrRunning}
            onClick={async () => {
              if (!book.filePath) return;
              const windowAPI = (window as any).electronAPI;
              if (!windowAPI?.ocrRecognizePage) return;
              setIsOcrRunning(true);
              try {
                const res: OcrPageResult = await windowAPI.ocrRecognizePage({
                  filePath: book.filePath,
                  pageNumber: currentPage,
                  language: 'auto',
                });
                if (res && res.text) {
                  setOcrPages((prev) => new Map(prev).set(currentPage, res));
                }
              } catch (e) {
                console.warn('[ReaderPane:OCR] error:', e);
              } finally {
                setIsOcrRunning(false);
              }
            }}
            title={t('ocrRecognizePageBtn')}
            className={`p-1 rounded bg-canvas hover:bg-surface border border-subtle cursor-pointer ${
              isOcrRunning ? 'text-amber-500 animate-pulse' : 'text-muted hover:text-main'
            }`}
          >
            {isOcrRunning ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ScanText className="w-3 h-3" />
            )}
          </button>

          {/* Page controls */}
          <div className="flex items-center gap-1">
            <button
              disabled={currentPage <= 1}
              onClick={() => handlePageStep(-1)}
              className="p-1 rounded bg-canvas hover:bg-surface border border-subtle disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="w-3 h-3 rtl:rotate-0 ltr:rotate-180" />
            </button>
            <span className="font-bold text-[11px] font-sans">
              {currentPage} / {maxPages}
            </span>
            <button
              disabled={currentPage >= maxPages}
              onClick={() => handlePageStep(1)}
              className="p-1 rounded bg-canvas hover:bg-surface border border-subtle disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-3 h-3 rtl:rotate-0 ltr:rotate-180" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 relative flex flex-col items-center justify-start">
        {/* Slide-out TOC Drawer */}
        {isTocOpen && bookDoc?.toc && (
          <div className="absolute top-0 bottom-0 inset-inline-start-0 w-64 bg-surface/95 backdrop-blur-md border-r border-subtle z-30 shadow-2xl flex flex-col animate-in slide-in-from-left duration-150">
            <div className="p-2.5 border-b border-subtle flex items-center justify-between bg-canvas/30">
              <span className="font-bold text-xs flex items-center gap-1.5 text-main">
                <ListTree className="w-3.5 h-3.5 text-pale-sky-500" />
                {t('tableOfContents')}
              </span>
              <button
                onClick={() => setIsTocOpen(false)}
                className="p-1 rounded-lg hover:bg-canvas text-muted hover:text-main"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
              {bookDoc.toc.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleJumpToTOC(item)}
                  className="w-full text-start p-1.5 rounded-lg hover:bg-canvas text-main font-medium transition-colors flex items-center gap-1.5 truncate cursor-pointer text-[11px]"
                >
                  <BookMarked className="w-3 h-3 text-pale-sky-500 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content Renderers */}
        {isLoadingFile ? (
          <div className="h-64 flex flex-col items-center justify-center text-muted gap-2 my-auto">
            <Loader2 className="w-5 h-5 animate-spin text-pale-sky-500" />
            <span className="text-xs font-bold">{t('loadingDocument')}</span>
          </div>
        ) : isComic && comicPageUrl ? (
          <div className="w-full flex items-center justify-center my-auto">
            <img
              src={comicPageUrl}
              alt={`Page ${currentPage}`}
              className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-lg border border-subtle"
            />
          </div>
        ) : isReflowable ? (
          <div
            className={`w-full max-w-2xl rounded-2xl p-6 shadow-md border ${
              themeClasses[readerTheme] || themeClasses.sepia
            }`}
            dir={readerDirection}
            style={{
              fontSize: `${readerFontSize}px`,
              lineHeight: 1.85,
              fontFamily: readerDirection === 'rtl' ? "'Amiri', serif" : 'inherit',
            }}
          >
            {isLoadingFile || isPaginating ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted gap-2 my-auto">
                <Loader2 className="w-5 h-5 animate-spin text-pale-sky-500" />
                <span className="text-xs font-bold">{t('loadingDocument')}</span>
              </div>
            ) : activeFormattedPage ? (
              <div
                dangerouslySetInnerHTML={{ __html: activeFormattedPage.html }}
                className="prose prose-slate dark:prose-invert max-w-none text-justify"
              />
            ) : currentSectionHtml ? (
              <div
                dangerouslySetInnerHTML={{ __html: currentSectionHtml }}
                className="prose prose-slate dark:prose-invert max-w-none text-justify"
              />
            ) : activePageText ? (
              <div className="space-y-4">
                {activePageText.split(/\n\n+/).map((p, idx) => (
                  <p key={idx} className="indent-4 leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted text-xs">
                {t('noNotesYet')}
              </div>
            )}
          </div>
        ) : viewType === 'text_manuscript' && activePageText ? (
          <div
            className={`w-full max-w-2xl rounded-2xl p-6 shadow-md border ${
              themeClasses[readerTheme] || themeClasses.light
            }`}
            style={{
              fontSize: `${readerFontSize}px`,
              lineHeight: 1.85,
              fontFamily: readerDirection === 'rtl' ? "'Amiri', serif" : 'inherit',
            }}
          >
            <div className="space-y-4 text-justify">
              {activePageText.split(/\n\n+/).map((p, idx) => (
                <p key={idx} className="indent-4 leading-relaxed">
                  {p}
                </p>
              ))}
            </div>
          </div>
        ) : (pdfBlobUrl || assetUrl) ? (
          <div className="relative w-full h-full overflow-hidden rounded-xl">
            <iframe
              key={`pane-${paneId}-${currentPage}-${pdfBlobUrl}`}
              src={`${pdfBlobUrl || assetUrl}#page=${currentPage}&view=FitH`}
              title={book.title}
              className="w-full h-full border-none rounded-xl"
            />
            {ocrPages.get(currentPage) && (
              <OcrTextOverlay pageResult={ocrPages.get(currentPage)!} />
            )}
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-muted text-xs">
            {t('noNotesYet')}
          </div>
        )}
      </div>
    </div>
  );
};
