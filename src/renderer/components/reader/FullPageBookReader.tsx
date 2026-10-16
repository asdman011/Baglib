'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowRight,
  BookOpen,
  FileText,
  Plus,
  Trash2,
  X,
  FileCode,
  Eye,
  Loader2,
  Highlighter,
  MessageSquare,
  Columns2,
  Rows2,
  Maximize2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  AlertCircle,
  Hash,
  ListTree,
  Palette,
  ZoomIn,
  ZoomOut,
  AlignRight,
  AlignLeft,
  Layers,
  Image as ImageIcon,
  SlidersHorizontal,
  Glasses,
  Zap,
  BookMarked,
  Scroll,
  ArrowRightLeft,
  Bookmark,
  PenTool,
  Copy,
  Underline,
  Check,
  Search,
  ScanText,
  BookA,
  Headphones,
  Cloud,
  Puzzle,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { DocumentLoader, detectFormat } from '../../libs/reader/document-loader';
import { paginateBookSections, type FormattedPage } from '../../libs/reader/epub-paginator';
import type {
  BookDoc,
  BookFormat,
  TOCItem,
  ReaderViewMode,
  ReaderTheme,
  FocusAidMode,
} from '../../libs/reader/types';
import {
  getReaderStyles,
  transformClassicalGlosses,
  getViewportCssVariables,
} from '../../libs/reader/typography';
import { ReadingRuler } from './ReadingRuler';
import { ParagraphOverlay } from './ParagraphOverlay';
import { RSVPOverlay } from './RSVPOverlay';
import { SplitPaneReader } from './SplitPaneReader';
import { AnnotationsDrawer } from './AnnotationsDrawer';
import { InkCanvasOverlay } from './InkCanvasOverlay';
import { InBookSearchDrawer } from './InBookSearchDrawer';
import { OcrTextOverlay } from './OcrTextOverlay';
import { DictionaryLookupModal } from './DictionaryLookupModal';
import { AISettingsModal } from '../ai/AISettingsModal';
import { AIResearchAssistantDrawer } from './AIResearchAssistantDrawer';
import { useTTSAudio } from '../../hooks/useTTSAudio';
import { TTSMiniPlayer } from '../tts/TTSMiniPlayer';
import { TTSLyricsView } from '../tts/TTSLyricsView';
import { AudiobookPairingDialog } from '../audiobook/AudiobookPairingDialog';
import { CloudSyncModal } from '../sync/CloudSyncModal';
import { ReaderPluginsModal } from '../plugins/ReaderPluginsModal';
import type { AudiobookPairingData } from '../../../shared/types/audio';
import type { AIResearchToolType } from '../../../shared/types/ai';
import type { OcrPageResult, OcrDocumentResult, OcrLanguage } from '../../../shared/types/ocr';
import type { SearchableSection } from '../../libs/search/in-book-search';
import type { AnnotationDTO, AnnotationPayload, InkStroke } from '../../../shared/types/annotation';
import type { BookBibliographicInfo, BookWithAnnotations } from '../../../shared/types/export';
import {
  registerCssCustomHighlights,
  clearCssCustomHighlights,
  HIGHLIGHT_COLORS,
} from '../../libs/reader/highlight-manager';

export const FullPageBookReader: React.FC = () => {
  const {
    activeBook,
    books,
    readingPage,
    setReadingPage,
    closeReaderToLibrary,
    splitOrientation,
    setSplitOrientation,
    bookNotes,
    addPageNote,
    deletePageNote,
    addHighlight,
    t,
  } = useWorkspace();

  const [selectedText, setSelectedText] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [filterMode, setFilterMode] = useState<'current_page' | 'all_pages'>('current_page');
  const [viewType, setViewType] = useState<'text_manuscript' | 'native_pdf'>('native_pdf');
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfTotalPages, setPdfTotalPages] = useState<number>(1);
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // Multi-Format Reader Engine State
  const [bookDoc, setBookDoc] = useState<BookDoc | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<BookFormat>('PDF');
  const [readerDirection, setReaderDirection] = useState<'rtl' | 'ltr'>('ltr');
  const [isTocOpen, setIsTocOpen] = useState<boolean>(false);
  const [currentSectionHtml, setCurrentSectionHtml] = useState<string>('');
  const [comicPageUrl, setComicPageUrl] = useState<string | null>(null);
  const [secondComicPageUrl, setSecondComicPageUrl] = useState<string | null>(null);
  const [isWideComicPage, setIsWideComicPage] = useState<boolean>(false);

  // EPUB & Reflowable Pagination State
  const [paginatedPages, setPaginatedPages] = useState<FormattedPage[]>([]);
  const [tocPageMap, setTocPageMap] = useState<Map<string | number, number>>(new Map());
  const [isPaginating, setIsPaginating] = useState<boolean>(false);

  // View Modes & Typography State
  const [viewMode, setViewMode] = useState<ReaderViewMode>('single');
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('sepia');
  const [fontFamily, setFontFamily] = useState<string>('amiri');
  const [readerFontSize, setReaderFontSize] = useState<number>(18);
  const [lineSpacing, setLineSpacing] = useState<number>(1.85);
  const [paragraphSpacing, setParagraphSpacing] = useState<number>(0.8);
  const [margin, setMargin] = useState<number>(28);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [wideComicSpread, setWideComicSpread] = useState<boolean>(true);

  // Panels & Focus Aids
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [activeFocusAid, setActiveFocusAid] = useState<FocusAidMode>('none');
  const [isParallelReading, setIsParallelReading] = useState<boolean>(false);
  const [parallelOrientation, setParallelOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const contentContainerRef = useRef<HTMLDivElement>(null);

  // Extracted PDF Text State
  const [extractedFullText, setExtractedFullText] = useState<string>('');
  const [extractedPages, setExtractedPages] = useState<string[]>([]);
  const [isExtractingText, setIsExtractingText] = useState<boolean>(false);
  const [extractionFailed, setExtractionFailed] = useState<boolean>(false);
  const [scannedInfo, setScannedInfo] = useState<{ numPages: number; totalChars: number } | null>(null);

  // Annotations & Freehand Ink State (KEY-137)
  const [annotations, setAnnotations] = useState<AnnotationDTO[]>([]);
  const [isAnnotationsDrawerOpen, setIsAnnotationsDrawerOpen] = useState<boolean>(false);
  const [isInkModeActive, setIsInkModeActive] = useState<boolean>(false);
  const [isInstantHighlightMode, setIsInstantHighlightMode] = useState<boolean>(false);
  const [activeHighlightColor, setActiveHighlightColor] = useState<string>('amber');
  const [showToast, setShowToast] = useState<string | null>(null);
  const [showCopiedToast, setShowCopiedToast] = useState<boolean>(false);

  // In-Book Full-Text Search State (KEY-140)
  const [isSearchDrawerOpen, setIsSearchDrawerOpen] = useState<boolean>(false);

  // Local OCR Engine State (Story 3.2 / KEY-141)
  const [ocrPages, setOcrPages] = useState<Map<number, OcrPageResult>>(new Map());
  const [isOcrRunning, setIsOcrRunning] = useState<boolean>(false);
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>('auto');
  const [showOcrDebug, setShowOcrDebug] = useState<boolean>(false);
  const [isOcrMenuOpen, setIsOcrMenuOpen] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<{ current: number; total: number; words: number } | null>(null);

  // Pluggable Offline Dictionary & Encyclopedia State (Story 3.3 / KEY-142)
  const [isDictionaryModalOpen, setIsDictionaryModalOpen] = useState<boolean>(false);
  const [dictionaryLookupWord, setDictionaryLookupWord] = useState<string>('');

  // BYOK AI Research Assistant & Translation State (KEY-143)
  const [isAIDrawerOpen, setIsAIDrawerOpen] = useState<boolean>(false);
  const [isAISettingsOpen, setIsAISettingsOpen] = useState<boolean>(false);
  const [aiInitialTool, setAiInitialTool] = useState<AIResearchToolType>('chat');
  const [aiSelectedText, setAiSelectedText] = useState<string>('');

  // Text-to-Speech (TTS), Audiobook & SMIL Read-Along State (KEY-145)
  const [isTTSPlayerActive, setIsTTSPlayerActive] = useState<boolean>(false);
  const [isTTSLyricsOpen, setIsTTSLyricsOpen] = useState<boolean>(false);
  const [isPairingDialogOpen, setIsPairingDialogOpen] = useState<boolean>(false);
  const [isCloudSyncModalOpen, setIsCloudSyncModalOpen] = useState<boolean>(false);
  const [isPluginsModalOpen, setIsPluginsModalOpen] = useState<boolean>(false);
  const [pluginStyles, setPluginStyles] = useState<string>('');

  // Editable Page Target for Notes
  const [noteTargetPage, setNoteTargetPage] = useState<number>(readingPage);

  // Maximum valid pages calculation
  const maxBookPages = Math.max(
    1,
    detectedFormat === 'PDF'
      ? (pdfTotalPages || scannedInfo?.numPages || 1)
      : ['CBZ', 'CBR', 'CBT', 'CB7'].includes(detectedFormat)
      ? (bookDoc?.sections?.length || 1)
      : (paginatedPages.length > 0 ? paginatedPages.length : bookDoc?.sections?.length || 1)
  );

  // Sync noteTargetPage with readingPage when user navigates
  useEffect(() => {
    setNoteTargetPage(Math.min(maxBookPages, Math.max(1, readingPage)));
  }, [readingPage, maxBookPages]);

  // Load custom plugin CSS styles dynamically
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.plugins?.getStyles) {
      (window as any).electronAPI.plugins.getStyles().then((styles: string) => {
        if (styles) setPluginStyles(styles);
      }).catch((e: any) => console.warn('[FullPageBookReader] Plugin styles error:', e));
    }
  }, [isPluginsModalOpen]);

  // Reading Statistics Tracking Lifecycle (KEY-149)
  useEffect(() => {
    if (activeBook?.id && typeof window !== 'undefined' && (window as any).electronAPI?.statistics) {
      (window as any).electronAPI.statistics.startSession({
        bookId: activeBook.id,
        title: activeBook.title,
        authors: activeBook.author,
        page: readingPage,
        totalPages: maxBookPages,
        subject: activeBook.categories?.[0] || 'General',
      });
    }
    return () => {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.statistics) {
        (window as any).electronAPI.statistics.endSession();
      }
    };
  }, [activeBook?.id]);

  useEffect(() => {
    if (activeBook?.id && typeof window !== 'undefined' && (window as any).electronAPI?.statistics) {
      (window as any).electronAPI.statistics.turnPage(readingPage, maxBookPages);
    }
  }, [readingPage, maxBookPages, activeBook?.id]);

  useEffect(() => {
    const heartbeatTimer = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.statistics) {
        (window as any).electronAPI.statistics.heartbeat();
      }
    }, 10000);
    return () => clearInterval(heartbeatTimer);
  }, []);

  // Full Screen-Reader Accessible Keyboard Navigation (KEY-149)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Never intercept keystrokes when typing in inputs/textareas
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const isRtl = readerDirection === 'rtl';
      const isNext =
        (isRtl && e.key === 'ArrowLeft') ||
        (!isRtl && e.key === 'ArrowRight') ||
        e.key === 'PageDown' ||
        e.key === ' ';

      const isPrev =
        (isRtl && e.key === 'ArrowRight') ||
        (!isRtl && e.key === 'ArrowLeft') ||
        e.key === 'PageUp';

      if (isNext) {
        e.preventDefault();
        setReadingPage(Math.min(maxBookPages, readingPage + 1));
      } else if (isPrev) {
        e.preventDefault();
        setReadingPage(Math.max(1, readingPage - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setReadingPage(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        setReadingPage(maxBookPages);
      } else if (e.key === 'Escape') {
        if (isSearchDrawerOpen) setIsSearchDrawerOpen(false);
        else if (isAnnotationsDrawerOpen) setIsAnnotationsDrawerOpen(false);
        else if (isTocOpen) setIsTocOpen(false);
        else if (isSettingsOpen) setIsSettingsOpen(false);
        else if (isPluginsModalOpen) setIsPluginsModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    readingPage,
    readerDirection,
    maxBookPages,
    isSearchDrawerOpen,
    isAnnotationsDrawerOpen,
    isTocOpen,
    isSettingsOpen,
    isPluginsModalOpen,
  ]);

  // Aggregate searchable text sections for in-book search engine
  const searchableSections: SearchableSection[] = useMemo(() => {
    if (paginatedPages.length > 0) {
      return paginatedPages.map((p) => ({
        pageNumber: p.pageNumber,
        locationCfiOrPage: String(p.pageNumber),
        chapterTitle: p.chapterLabel,
        text: p.text,
      }));
    }
    const combinedPages: string[] = [...extractedPages];
    ocrPages.forEach((ocrRes, pageNum) => {
      while (combinedPages.length < pageNum) combinedPages.push('');
      if (!combinedPages[pageNum - 1] && ocrRes.text) {
        combinedPages[pageNum - 1] = ocrRes.text;
      }
    });

    if (combinedPages.length > 0) {
      return combinedPages.map((txt, idx) => ({
        pageNumber: idx + 1,
        locationCfiOrPage: String(idx + 1),
        text: txt,
      }));
    }
    return [];
  }, [paginatedPages, extractedPages, ocrPages]);

  // Global Ctrl+F / Cmd+F shortcut to open in-book search drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchDrawerOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Background SQLite FTS5 Indexing on Book Load (KEY-140)
  useEffect(() => {
    if (!activeBook?.id || searchableSections.length === 0) return;
    const windowAPI = typeof window !== 'undefined' ? (window as any).api : null;
    if (!windowAPI?.indexBookContent || !windowAPI?.isBookIndexed) return;

    let isSubscribed = true;
    (async () => {
      try {
        const isIndexed = await windowAPI.isBookIndexed(activeBook.id);
        if (!isIndexed && isSubscribed) {
          const indexedPages = searchableSections.map((s) => ({
            pageNumber: s.pageNumber,
            locationCfiOrPage: s.locationCfiOrPage || String(s.pageNumber),
            chapterTitle: s.chapterTitle,
            content: s.text,
          }));
          await windowAPI.indexBookContent(activeBook.id, indexedPages);
        }
      } catch (err) {
        console.warn('[baglib:reader] Background FTS indexing error:', err);
      }
    })();

    return () => {
      isSubscribed = false;
    };
  }, [activeBook?.id, searchableSections]);

  // Automatic KOReader Progress Sync on Book Load / Close (KEY-147)
  useEffect(() => {
    if (!activeBook?.id) return;
    const windowAPI = (window as any).electronAPI?.cloudSync;
    if (!windowAPI?.getKoSyncConfig || !windowAPI?.pullKoSyncProgress) return;

    let isSubscribed = true;
    (async () => {
      try {
        const cfg = await windowAPI.getKoSyncConfig();
        if (cfg?.autoSyncOnOpenClose && cfg?.username && isSubscribed) {
          const res = await windowAPI.pullKoSyncProgress(activeBook.id);
          if (res?.success && res?.data && typeof res.data.percentage === 'number') {
            console.log('[KOSync] Auto-pulled reading progress on open:', res.data.percentage);
          }
        }
      } catch (err) {
        console.warn('[KOSync] Auto-pull note:', err);
      }
    })();

    return () => {
      isSubscribed = false;
      try {
        const percent = Math.min(1, Math.max(0, readingPage / maxBookPages));
        windowAPI.pushKoSyncProgress?.(activeBook.id, `page-${readingPage}`, percent);
      } catch {}
    };
  }, [activeBook?.id]);

  // Load Document & Initialize Unified Reader Pipeline
  useEffect(() => {
    let isCancelled = false;
    let activeObjectUrl: string | null = null;

    const loadDocumentPipeline = async () => {
      if (!activeBook?.filePath) {
        setAssetUrl(null);
        setBookDoc(null);
        setExtractedFullText('');
        setExtractedPages([]);
        setExtractionFailed(false);
        setScannedInfo(null);
        return;
      }

      setIsLoadingFile(true);
      setIsExtractingText(true);
      setExtractionFailed(false);
      setScannedInfo(null);

      const filePath = activeBook.filePath;
      const format = detectFormat(filePath);
      setDetectedFormat(format);

      // Construct privileged streaming URL
      const streamUrl = `baglib-asset://${encodeURIComponent(filePath)}`;
      setAssetUrl(streamUrl);

      const windowAPI = (window as any).electronAPI;

      try {
        // Fetch raw bytes for parser engine
        let bytes: Uint8Array | null = null;
        try {
          const res = await fetch(streamUrl);
          if (res.ok) {
            bytes = new Uint8Array(await res.arrayBuffer());
          }
        } catch (e) {
          console.warn('[baglib:reader] Stream fetch failed:', e);
        }

        // Fallback to IPC base64 if fetch fails or is rejected
        if (!bytes && windowAPI?.readPdfBase64) {
          try {
            const b64 = await windowAPI.readPdfBase64(filePath);
            if (b64) {
              const bin = atob(b64);
              bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            }
          } catch (e) {
            console.warn('[baglib:reader] readPdfBase64 fallback failed:', e);
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

          // Open via DocumentLoader
          const loader = new DocumentLoader(bytes, filePath, {
            theme: readerTheme,
            languageHint: activeBook.language,
          });
          const { book } = await loader.open();

          if (!isCancelled) {
            setBookDoc(book);
            setReaderDirection(book.dir || 'ltr');

            // If comic/archive, load initial page
            if (['CBZ', 'CBR', 'CBT', 'CB7'].includes(format)) {
              const firstSec = book.sections[0];
              if (firstSec?.load) {
                const imgUrl = await firstSec.load();
                setComicPageUrl(imgUrl);
              }
            } else if (format !== 'PDF') {
              // Paginate reflowable EPUB/MOBI/FB2/HTML/TXT sections into screen-sized pages
              setIsPaginating(true);
              try {
                const { pages, tocMap } = await paginateBookSections(book.sections, book.toc, 1500);
                if (!isCancelled) {
                  setPaginatedPages(pages);
                  setTocPageMap(tocMap);
                }
              } catch (e) {
                console.warn('[baglib:reader] Pagination error:', e);
              } finally {
                if (!isCancelled) setIsPaginating(false);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[baglib:reader] DocumentLoader parsing fallback:', err);
      }

      // If PDF, also run native text extraction for manuscript and search
      if (format === 'PDF' && windowAPI?.extractPdfText) {
        try {
          const result = await windowAPI.extractPdfText(filePath);
          if (!isCancelled) {
            if (result && result.numpages) {
              setPdfTotalPages(result.numpages);
            }
            if (result && result.isScannedImagePdf) {
              setExtractionFailed(true);
              setScannedInfo({ numPages: result.numpages || 1, totalChars: result.totalChars || 0 });
              setViewType('native_pdf');
            } else if (result && result.text && result.text.trim().length > 20) {
              const fullText = result.text;
              setExtractedFullText(fullText);

              const pageRegex = /(?:\r?\n---PAGE_SPLIT_MARKER---\r?\n|\f)/g;
              let rawPages = fullText.split(pageRegex).map((p: string) => p.trim()).filter((p: string) => p.length > 0);

              if (rawPages.length === 0) {
                const chunkSize = 1500;
                rawPages = [];
                for (let i = 0; i < fullText.length; i += chunkSize) {
                  rawPages.push(fullText.substring(i, i + chunkSize));
                }
              }
              setExtractedPages(rawPages);
              if (result.numpages) {
                setScannedInfo({ numPages: result.numpages, totalChars: fullText.length });
              }
            } else {
              setExtractionFailed(true);
              if (result && result.numpages) {
                setScannedInfo({ numPages: result.numpages, totalChars: 0 });
              }
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

    loadDocumentPipeline();

    return () => {
      isCancelled = true;
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
      bookDoc?.destroy?.();
    };
  }, [activeBook?.filePath]);

  // Update Section Content when readingPage changes in reflowable / archive mode
  useEffect(() => {
    let isCancelled = false;

    const updateActiveSection = async () => {
      if (!bookDoc || !bookDoc.sections.length) return;
      const sectionIdx = Math.min(bookDoc.sections.length - 1, Math.max(0, readingPage - 1));
      const section = bookDoc.sections[sectionIdx];
      if (!section) return;

      // Comic / Archive format page loading
      if (['CBZ', 'CBR', 'CBT', 'CB7'].includes(detectedFormat)) {
        if (section.load) {
          const imgUrl = await section.load();
          if (!isCancelled) setComicPageUrl(imgUrl);
        }
        // If two-column mode, load adjacent page if available
        if (viewMode === 'two-column' && sectionIdx + 1 < bookDoc.sections.length) {
          const nextSec = bookDoc.sections[sectionIdx + 1];
          if (nextSec?.load) {
            const nextUrl = await nextSec.load();
            if (!isCancelled) setSecondComicPageUrl(nextUrl);
          }
        } else {
          setSecondComicPageUrl(null);
        }
        return;
      }

      // Reflowable format section loading
      if (section.createDocument) {
        try {
          const doc = await section.createDocument();
          if (!isCancelled && doc?.body) {
            setCurrentSectionHtml(doc.body.innerHTML);
          }
        } catch (err) {
          console.warn('[baglib:reader] Section createDocument error:', err);
        }
      } else if (section.loadText) {
        const text = await section.loadText();
        if (!isCancelled && text) {
          setCurrentSectionHtml(transformClassicalGlosses(text));
        }
      }
    };

    updateActiveSection();

    return () => {
      isCancelled = true;
    };
  }, [readingPage, bookDoc, detectedFormat, viewMode]);

  // Handle Comic Image Loaded to determine aspect ratio for wide spread
  const handleComicImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) {
      const ratio = naturalWidth / naturalHeight;
      setIsWideComicPage(ratio > 1.25);
    }
  };

  if (!activeBook) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-canvas text-main font-sans text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-surface border border-subtle flex items-center justify-center text-muted">
          <BookOpen className="w-8 h-8 text-pale-sky-500" />
        </div>
        <div className="space-y-1">
          <h2 className="font-bold text-lg text-main font-display">{t('noBookSelected')}</h2>
          <p className="text-xs text-muted max-w-sm">{t('noBookSelectedDesc')}</p>
        </div>
        <button
          onClick={closeReaderToLibrary}
          className="px-4 py-2 rounded-xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 shadow-md transition-all cursor-pointer"
        >
          {t('backToLibrary')}
        </button>
      </div>
    );
  }

  // Active Formatted Page & Text Content
  const activeFormattedPage = paginatedPages[readingPage - 1];
  const secondFormattedPage =
    viewMode === 'two-column' && readingPage < paginatedPages.length
      ? paginatedPages[readingPage]
      : null;

  const activePageText =
    activeFormattedPage?.text ||
    extractedPages[readingPage - 1] ||
    ocrPages.get(readingPage)?.text ||
    extractedFullText;

  // TTS & Audiobook Playback Engine Hook (KEY-145)
  const ttsAudio = useTTSAudio({
    bookId: activeBook?.id,
    initialText: activePageText,
  });

  // Sync active page text with TTS queue when page changes (if not actively playing)
  useEffect(() => {
    if (activePageText && !ttsAudio.isPlaying) {
      const parsed = activePageText
        .replace(/([.!?؟؛\n]+)/g, '$1\u0000')
        .split('\u0000')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      ttsAudio.setSentences(parsed);
    }
  }, [activePageText, ttsAudio.isPlaying]);

  // Load existing audiobook pairing when active book changes
  useEffect(() => {
    if (activeBook?.id && window.electronAPI?.audio?.getPairing) {
      window.electronAPI.audio
        .getPairing(activeBook.id)
        .then((pairing) => {
          if (pairing) {
            ttsAudio.loadAudiobook(pairing);
          }
        })
        .catch(console.warn);
    }
  }, [activeBook?.id]);

  // Paragraphs for Focus Mode
  const paragraphList = useMemo(() => {
    if (activeFormattedPage?.text) {
      return activeFormattedPage.text
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    }
    if (currentSectionHtml) {
      if (typeof document !== 'undefined') {
        const tmp = document.createElement('div');
        tmp.innerHTML = currentSectionHtml;
        const ps = Array.from(tmp.querySelectorAll('p, blockquote, div.paragraph'))
          .map((el) => el.textContent?.trim() || '')
          .filter((t) => t.length > 0);
        if (ps.length > 0) return ps;
      }
    }
    if (activePageText) {
      return activePageText
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    }
    return [];
  }, [activeFormattedPage, currentSectionHtml, activePageText]);

  // Text for RSVP Speed Reading
  const rsvpFullText = useMemo(() => {
    if (activeFormattedPage?.text) return activeFormattedPage.text;
    if (activePageText) return activePageText;
    if (currentSectionHtml) {
      if (typeof document !== 'undefined') {
        const tmp = document.createElement('div');
        tmp.innerHTML = currentSectionHtml;
        return tmp.textContent || '';
      }
    }
    return '';
  }, [activeFormattedPage, activePageText, currentSectionHtml]);

  // Filter Notes
  const currentPageNotes = bookNotes.filter((n) => n.pageNumber === noteTargetPage);
  const displayedNotes = filterMode === 'current_page' ? currentPageNotes : bookNotes;

  // Load annotations from SQLite for this book
  const loadAnnotations = async () => {
    if (!activeBook?.id) return;
    try {
      const api = (window as any).electronAPI;
      if (api?.getAnnotations) {
        const data = await api.getAnnotations(activeBook.id);
        setAnnotations(data || []);
      }
    } catch (err) {
      console.warn('[FullPageBookReader] Failed to load annotations:', err);
    }
  };

  useEffect(() => {
    loadAnnotations();
  }, [activeBook?.id]);

  // Bibliographic metadata for Export Engine (KEY-138)
  const activeBookInfo: BookBibliographicInfo = useMemo(() => {
    if (!activeBook) return { title: '' };
    return {
      id: activeBook.id,
      title: activeBook.title,
      author: activeBook.author,
      isbn: activeBook.isbn,
      format: detectedFormat,
      publisher: activeBook.publisher,
      year: activeBook.publicationYear ? String(activeBook.publicationYear) : undefined,
      coverUrl: activeBook.coverImage,
    };
  }, [activeBook, detectedFormat]);

  // Aggregate notes across library for multi-book ZIP export (KEY-138)
  const [allBooksWithNotes, setAllBooksWithNotes] = useState<BookWithAnnotations[]>([]);

  useEffect(() => {
    const fetchAllNotes = async () => {
      try {
        const api = (window as any).electronAPI;
        if (api?.getAllAnnotations) {
          const allNotes: AnnotationDTO[] = await api.getAllAnnotations();
          const grouped = new Map<string, AnnotationDTO[]>();
          for (const note of allNotes) {
            const list = grouped.get(note.bookId) || [];
            list.push(note);
            grouped.set(note.bookId, list);
          }

          const result: BookWithAnnotations[] = (books || []).map((b) => ({
            book: {
              id: b.id,
              title: b.title,
              author: b.author,
              isbn: b.isbn,
              publisher: b.publisher,
              year: b.publicationYear ? String(b.publicationYear) : undefined,
              coverUrl: b.coverImage,
            },
            annotations: grouped.get(b.id) || (b.id === activeBook?.id ? annotations : []),
          }));
          setAllBooksWithNotes(result);
        } else if (activeBook) {
          setAllBooksWithNotes([{ book: activeBookInfo, annotations }]);
        }
      } catch (err) {
        console.warn('[FullPageBookReader] Failed to load all annotations:', err);
        if (activeBook) {
          setAllBooksWithNotes([{ book: activeBookInfo, annotations }]);
        }
      }
    };

    if (isAnnotationsDrawerOpen) {
      fetchAllNotes();
    }
  }, [isAnnotationsDrawerOpen, books, activeBook, activeBookInfo, annotations]);

  // Apply W3C CSS Custom Highlights when content or annotations change
  useEffect(() => {
    if (contentContainerRef.current) {
      registerCssCustomHighlights(contentContainerRef.current, annotations);
    }
    return () => {
      clearCssCustomHighlights();
    };
  }, [annotations, readingPage, activeFormattedPage, currentSectionHtml, activePageText]);

  // Save annotation to SQLite
  const handleSaveAnnotation = async (payload: AnnotationPayload): Promise<AnnotationDTO | undefined> => {
    if (!activeBook?.id) return;
    try {
      const api = (window as any).electronAPI;
      if (api?.saveAnnotation) {
        const saved = await api.saveAnnotation(payload);
        setAnnotations((prev) => {
          const idx = prev.findIndex((a) => a.id === saved.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = saved;
            return updated;
          }
          return [saved, ...prev];
        });
        return saved;
      }
    } catch (err) {
      console.warn('[FullPageBookReader] Failed to save annotation:', err);
    }
  };

  // Delete annotation from SQLite
  const handleDeleteAnnotation = async (id: string) => {
    try {
      const api = (window as any).electronAPI;
      if (api?.deleteAnnotation) {
        await api.deleteAnnotation(id);
        setAnnotations((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.warn('[FullPageBookReader] Failed to delete annotation:', err);
    }
  };

  // Bookmark current page
  const isCurrentPageBookmarked = annotations.some(
    (a) => a.type === 'bookmark' && parseInt(a.locationCfiOrPage, 10) === readingPage
  );

  const handleToggleBookmark = async () => {
    if (!activeBook) return;
    const existing = annotations.find(
      (a) => a.type === 'bookmark' && parseInt(a.locationCfiOrPage, 10) === readingPage
    );
    if (existing) {
      await handleDeleteAnnotation(existing.id);
    } else {
      await handleSaveAnnotation({
        bookId: activeBook.id,
        type: 'bookmark',
        locationCfiOrPage: readingPage.toString(),
        noteContent: `Bookmark on Page ${readingPage}`,
      });
      setShowToast(t('bookmarkAdded', { page: readingPage }));
      setTimeout(() => setShowToast(null), 2500);
    }
  };

  // Current page ink annotation & strokes handler
  const currentInkAnnotation = useMemo(() => {
    return annotations.find(
      (a) => a.type === 'ink' && parseInt(a.locationCfiOrPage, 10) === readingPage
    );
  }, [annotations, readingPage]);

  const handleStrokesChange = async (strokes: InkStroke[]) => {
    if (!activeBook?.id) return;
    await handleSaveAnnotation({
      id: currentInkAnnotation?.id,
      bookId: activeBook.id,
      type: 'ink',
      locationCfiOrPage: readingPage.toString(),
      strokeData: strokes,
    });
  };

  // Local OCR Handlers (KEY-141)
  const handleRunOcrPage = async (pageToScan: number = readingPage) => {
    if (!activeBook?.filePath) return;
    const windowAPI = (window as any).electronAPI;
    if (!windowAPI?.ocrRecognizePage) return;

    setIsOcrRunning(true);
    try {
      const res: OcrPageResult = await windowAPI.ocrRecognizePage({
        filePath: activeBook.filePath,
        pageNumber: pageToScan,
        language: ocrLanguage,
      });

      if (res && res.text) {
        setOcrPages((prev) => new Map(prev).set(pageToScan, res));

        setExtractedPages((prev) => {
          const updated = [...prev];
          while (updated.length < pageToScan) updated.push('');
          updated[pageToScan - 1] = res.text;
          return updated;
        });

        if (activeBook.id && windowAPI?.indexBookContent) {
          windowAPI.indexBookContent(activeBook.id, [
            {
              pageNumber: pageToScan,
              locationCfiOrPage: `page-${pageToScan}`,
              chapterTitle: `Page ${pageToScan}`,
              content: res.text,
            },
          ]);
        }

        setShowToast(
          t('ocrSuccessPage', { count: res.words?.length || res.text.split(/\s+/).length })
        );
        setTimeout(() => setShowToast(null), 3000);
      } else {
        setShowToast(t('ocrFailedText'));
        setTimeout(() => setShowToast(null), 2500);
      }
    } catch (err) {
      console.warn('[handleRunOcrPage] Error:', err);
      setShowToast(t('ocrFailedText'));
      setTimeout(() => setShowToast(null), 2500);
    } finally {
      setIsOcrRunning(false);
    }
  };

  const handleRunOcrDocument = async () => {
    if (!activeBook?.filePath) return;
    const windowAPI = (window as any).electronAPI;
    if (!windowAPI?.ocrRecognizeDocument) return;

    setIsOcrRunning(true);
    setOcrProgress({ current: 1, total: maxBookPages, words: 0 });

    try {
      const unsub = windowAPI.onOcrProgress?.((payload: any) => {
        setOcrProgress({
          current: payload.currentPage,
          total: payload.totalPages,
          words: payload.recognizedWords,
        });
      });

      const res: OcrDocumentResult = await windowAPI.ocrRecognizeDocument({
        filePath: activeBook.filePath,
        bookId: activeBook.id,
        startPage: 1,
        endPage: Math.min(maxBookPages, 20),
        language: ocrLanguage,
        autoIndexFts: true,
      });

      unsub?.();

      if (res && res.pages && res.pages.length > 0) {
        const newMap = new Map<number, OcrPageResult>();
        const newExtracted = [...extractedPages];

        for (const p of res.pages) {
          if (p.text) {
            newMap.set(p.pageNumber, p);
            while (newExtracted.length < p.pageNumber) newExtracted.push('');
            newExtracted[p.pageNumber - 1] = p.text;
          }
        }

        setOcrPages((prev) => new Map([...prev, ...newMap]));
        setExtractedPages(newExtracted);

        const totalWords = res.pages.reduce((s, p) => s + (p.words?.length || 0), 0);
        setShowToast(
          t('ocrSuccessBook', { pages: res.pages.length, words: totalWords })
        );
        setTimeout(() => setShowToast(null), 3500);
      }
    } catch (err) {
      console.warn('[handleRunOcrDocument] Error:', err);
      setShowToast(t('ocrFailedText'));
      setTimeout(() => setShowToast(null), 2500);
    } finally {
      setIsOcrRunning(false);
      setOcrProgress(null);
    }
  };

  // Handle Text Selection in Manuscript View (Supports Instant Mode & Standard Mode)
  const handleMouseUp = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text) return;

    if (isInstantHighlightMode) {
      handleApplyHighlight(activeHighlightColor, text);
      selection?.removeAllRanges();
    } else {
      setSelectedText(text);
    }
  };

  const handleApplyHighlight = async (color = 'amber', customText?: string) => {
    const textToUse = customText || selectedText;
    if (!textToUse || !activeBook) return;
    const safePage = Math.min(maxBookPages, Math.max(1, noteTargetPage));

    await handleSaveAnnotation({
      bookId: activeBook.id,
      type: 'highlight',
      locationCfiOrPage: safePage.toString(),
      selectedText: textToUse,
      color,
    });

    // Also sync to WorkspaceContext legacy notes
    const colorClass = `bg-${color}-500/30`;
    addHighlight(safePage, textToUse, colorClass);
    addPageNote({
      pageNumber: safePage,
      highlightedText: textToUse,
      content: `${t('selectedQuote').replace('"{text}"', `"${textToUse}"`)}`,
    });

    setSelectedText('');
  };

  const handleApplyUnderline = async (customText?: string) => {
    const textToUse = customText || selectedText;
    if (!textToUse || !activeBook) return;
    const safePage = Math.min(maxBookPages, Math.max(1, noteTargetPage));

    await handleSaveAnnotation({
      bookId: activeBook.id,
      type: 'underline',
      locationCfiOrPage: safePage.toString(),
      selectedText: textToUse,
      color: 'underline',
    });

    setSelectedText('');
  };

  const handleCopySelectedText = async () => {
    if (!selectedText) return;
    try {
      await navigator.clipboard.writeText(selectedText);
      setShowCopiedToast(true);
      setTimeout(() => setShowCopiedToast(false), 2000);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  const handleCreateNoteFromSelection = () => {
    if (!selectedText) return;
    const safePage = Math.min(maxBookPages, Math.max(1, noteTargetPage));
    handleSaveAnnotation({
      bookId: activeBook.id,
      type: 'note',
      locationCfiOrPage: safePage.toString(),
      selectedText,
      noteContent: `${t('selectedQuote').replace('"{text}"', `"${selectedText}"`)}`,
    });
    addPageNote({
      pageNumber: safePage,
      highlightedText: selectedText,
      content: `${t('selectedQuote').replace('"{text}"', `"${selectedText}"`)}`,
    });
    setSelectedText('');
  };

  const handleAddManualNote = () => {
    if (!newNoteText.trim() || !activeBook) return;
    const safePage = Math.min(maxBookPages, Math.max(1, noteTargetPage));
    handleSaveAnnotation({
      bookId: activeBook.id,
      type: 'note',
      locationCfiOrPage: safePage.toString(),
      selectedText: selectedText || undefined,
      noteContent: newNoteText,
    });
    addPageNote({
      pageNumber: safePage,
      highlightedText: selectedText || undefined,
      content: newNoteText,
    });
    setNewNoteText('');
    setSelectedText('');
  };

  // Floating Selection Popover (KEY-137 Standard Mode)
  const renderSelectionPopover = () => {
    if (!selectedText || isInstantHighlightMode) return null;
    return (
      <div className="absolute top-16 start-1/2 -translate-x-1/2 z-40 bg-surface/95 backdrop-blur-md text-main p-2 rounded-2xl shadow-2xl flex items-center gap-2 text-xs animate-in fade-in zoom-in duration-150 border border-subtle">
        <span className="font-bold truncate max-w-xs px-2 border-s border-subtle font-serif text-muted">
          "{selectedText}"
        </span>

        {/* 5 Highlight Colors */}
        <div className="flex items-center gap-1 px-1 border-e border-subtle">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => handleApplyHighlight(c.id)}
              title={`Highlight ${c.label}`}
              className="w-5 h-5 rounded-full hover:scale-110 transition-transform cursor-pointer shadow-xs"
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>

        {/* Underline Button */}
        <button
          onClick={() => handleApplyUnderline()}
          title={t('underlineBtn')}
          className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
        >
          <Underline className="w-3.5 h-3.5" />
        </button>

        {/* Link / Create Note Button */}
        <button
          onClick={handleCreateNoteFromSelection}
          title={t('linkToNotesBtn')}
          className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </button>

        {/* Copy Text Button */}
        <button
          onClick={handleCopySelectedText}
          title={t('copyTextBtn')}
          className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>

        {/* Dictionary & Encyclopedia Lookup Button (KEY-142) */}
        <button
          onClick={() => {
            setDictionaryLookupWord(selectedText);
            setIsDictionaryModalOpen(true);
          }}
          title={t('dictionaryLookupBtn')}
          className="p-1.5 rounded-xl hover:bg-canvas text-pale-sky-600 dark:text-pale-sky-400 hover:text-pale-sky-700 transition-colors cursor-pointer"
        >
          <BookA className="w-3.5 h-3.5" />
        </button>

        {/* AI Research Assistant Trigger (KEY-143) */}
        <button
          onClick={() => {
            setAiSelectedText(selectedText);
            setAiInitialTool('contextual_dictionary');
            setIsAIDrawerOpen(true);
          }}
          title={t('aiAssistantTitle')}
          className="p-1.5 rounded-xl hover:bg-canvas text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>

        {/* TTS Read Aloud Selection (KEY-145) */}
        <button
          onClick={() => {
            ttsAudio.setSentences([selectedText]);
            setIsTTSPlayerActive(true);
            ttsAudio.play();
            setSelectedText('');
          }}
          title={t('ttsReadAloudSelection')}
          className="p-1.5 rounded-xl hover:bg-canvas text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 transition-colors cursor-pointer"
        >
          <Headphones className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-subtle" />

        {/* Close */}
        <button
          onClick={() => setSelectedText('')}
          className="p-1 hover:bg-canvas rounded-lg text-muted hover:text-main cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  // Jump to TOC chapter using paginator TOC map
  const handleJumpToTOC = (item: TOCItem) => {
    const target =
      tocPageMap.get(item.id) ||
      tocPageMap.get(item.href) ||
      (item.index >= 0 ? item.index + 1 : 1);
    setReadingPage(Math.min(maxBookPages, Math.max(1, target)));
    setIsTocOpen(false);
  };

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

  const getFontFamilyStyle = () => {
    switch (fontFamily) {
      case 'amiri':
        return "'Amiri', 'Traditional Arabic', serif";
      case 'scheherazade':
        return "'Scheherazade New', 'Amiri', serif";
      case 'serif':
        return "Georgia, 'Times New Roman', serif";
      case 'sans':
        return "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
      case 'mono':
        return "'Consolas', 'Courier New', monospace";
      default:
        return readerDirection === 'rtl' ? "'Amiri', serif" : 'inherit';
    }
  };

  const themeClasses = {
    light: 'bg-white text-slate-800 border-slate-200',
    dark: 'bg-[#0f172a] text-slate-100 border-slate-700',
    sepia: 'bg-[#fbf0d9] text-[#5f4b32] border-[#e6d5b8]',
    night: 'bg-[#000000] text-[#999999] border-neutral-800',
    'e-ink': 'bg-[#ffffff] text-[#000000] border-black',
  };

  // Render Split Notes Panel
  const renderNotesPanel = () => (
    <aside
      className={`bg-surface border-subtle flex flex-col z-10 shrink-0 font-sans ${
        splitOrientation === 'vertical'
          ? 'w-80 sm:w-96 border-r'
          : splitOrientation === 'horizontal'
          ? 'h-64 sm:h-72 border-t'
          : 'flex-1 border-none'
      }`}
    >
      {/* Notes Header */}
      <div className="p-3.5 border-b border-subtle flex items-center justify-between bg-canvas/40">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-pale-sky-500" />
          <h3 className="font-bold text-main text-xs">
            {t('notesForBook').replace('{title}', activeBook.title)}
          </h3>
        </div>
        <button
          onClick={() => setSplitOrientation('none')}
          className="p-1 rounded-lg hover:bg-canvas text-muted hover:text-main cursor-pointer"
          title={t('closeNotesPanel')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Selector */}
      <div className="p-2 border-b border-subtle flex items-center gap-1 bg-canvas/20 text-xs">
        <button
          onClick={() => setFilterMode('current_page')}
          className={`flex-1 py-1 rounded-lg font-bold transition-all cursor-pointer ${
            filterMode === 'current_page'
              ? 'bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 border border-pale-sky-500/30'
              : 'text-muted hover:text-main'
          }`}
        >
          {t('pageFilter')
            .replace('{page}', noteTargetPage.toString())
            .replace('{count}', currentPageNotes.length.toString())}
        </button>
        <button
          onClick={() => setFilterMode('all_pages')}
          className={`flex-1 py-1 rounded-lg font-bold transition-all cursor-pointer ${
            filterMode === 'all_pages'
              ? 'bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 border border-pale-sky-500/30'
              : 'text-muted hover:text-main'
          }`}
        >
          {t('allPagesFilter').replace('{count}', bookNotes.length.toString())}
        </button>
      </div>

      {/* Target Page Selector for Quick Tagging */}
      <div className="px-3 py-2 border-b border-subtle flex items-center justify-between text-xs bg-surface/50">
        <span className="text-muted flex items-center gap-1 font-bold">
          <Hash className="w-3.5 h-3.5 text-pale-sky-500" />
          {t('notePageLabel')}:
        </span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={maxBookPages}
            value={noteTargetPage}
            onChange={(e) =>
              setNoteTargetPage(Math.min(maxBookPages, Math.max(1, parseInt(e.target.value) || 1)))
            }
            className="w-16 px-2 py-0.5 rounded-lg border border-subtle bg-canvas text-main text-center font-bold font-sans text-xs focus:ring-1 focus:ring-pale-sky-500 outline-none"
          />
          <span className="text-muted text-[10px]">/ {maxBookPages}</span>
        </div>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {displayedNotes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted space-y-2">
            <FileText className="w-8 h-8 opacity-40" />
            <p className="text-xs">{t('noNotesYet')}</p>
          </div>
        ) : (
          displayedNotes.map((note) => (
            <div
              key={note.id}
              className="p-3 rounded-2xl bg-canvas border border-subtle space-y-2 hover:border-pale-sky-500/30 transition-all text-xs group"
            >
              <div className="flex items-center justify-between text-[10px] text-muted font-bold">
                <span className="px-2 py-0.5 rounded-full bg-surface border border-subtle">
                  {t('page')} {note.pageNumber}
                </span>
                <button
                  onClick={() => deletePageNote(note.id)}
                  className="opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-opacity p-0.5 cursor-pointer"
                  title={t('deleteNote')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {note.highlightedText && (
                <blockquote className="border-r-2 border-pale-sky-500 pr-2 italic text-muted text-[11px] font-serif bg-surface/50 p-1.5 rounded-lg">
                  "{note.highlightedText}"
                </blockquote>
              )}

              <p className="text-main font-medium leading-relaxed select-text">{note.content}</p>
            </div>
          ))
        )}
      </div>

      {/* Add New Note Input */}
      <div className="p-3 border-t border-subtle bg-canvas/40 space-y-2">
        <textarea
          value={newNoteText}
          onChange={(e) => setNewNoteText(e.target.value)}
          placeholder={t('writeNotePlaceholder')}
          rows={2}
          className="w-full p-2.5 rounded-xl border border-subtle bg-surface text-main text-xs focus:ring-1 focus:ring-pale-sky-500 outline-none resize-none leading-relaxed"
        />
        <button
          disabled={!newNoteText.trim()}
          onClick={handleAddManualNote}
          className="w-full py-2 rounded-xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('saveNoteBtn')}</span>
        </button>
      </div>
    </aside>
  );

  if (isParallelReading && activeBook) {
    return (
      <SplitPaneReader
        primaryBook={activeBook}
        availableBooks={books}
        orientation={parallelOrientation}
        onOrientationChange={setParallelOrientation}
        onClose={() => setIsParallelReading(false)}
        t={t}
      />
    );
  }

  return (
    <div
      role="region"
      aria-label={t('a11yReaderLandmark') || 'Digital Book Reader'}
      className="flex-1 flex flex-col h-full bg-canvas text-main overflow-hidden font-sans select-none relative"
      style={getViewportCssVariables({
        theme: readerTheme,
        fontSize: readerFontSize,
        lineSpacing,
        paragraphSpacing,
        margin,
        brightness,
        contrast,
        fontFamily: getFontFamilyStyle(),
      })}
    >
      {/* Dynamic Screen-Reader Live Region for Page Transitions (KEY-149) */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {(t('a11yPageAnnounce') || 'Current page: {current} of {total}')
          .replace('{current}', String(readingPage))
          .replace('{total}', String(maxBookPages))}
      </div>

      {/* Injected Reader Plugins CSS Styles (KEY-149) */}
      {pluginStyles && (
        <style id="baglib-reader-plugins-styles">{pluginStyles}</style>
      )}

      {/* Top Header Bar */}
      <header
        role="toolbar"
        aria-label={t('a11yToolbarLandmark') || 'Reader Action Toolbar'}
        className="h-14 bg-surface border-b border-subtle flex items-center justify-between px-3 sm:px-4 z-20 shrink-0 gap-2"
      >
        {/* Left Actions: Back to Library & TOC Button */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={closeReaderToLibrary}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-subtle hover:bg-surface text-muted hover:text-main text-xs font-bold transition-all cursor-pointer"
          >
            <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
            <span className="hidden sm:inline">{t('backToLibrary')}</span>
          </button>

          {/* Table of Contents Drawer Toggle */}
          {bookDoc?.toc && bookDoc.toc.length > 0 && (
            <button
              onClick={() => setIsTocOpen(!isTocOpen)}
              className={`p-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1 text-xs font-bold ${
                isTocOpen
                  ? 'bg-pale-sky-500 text-white border-pale-sky-500 shadow-sm'
                  : 'bg-canvas border-subtle text-muted hover:text-main'
              }`}
              title={t('tableOfContents')}
            >
              <ListTree className="w-4 h-4" />
              <span className="hidden md:inline">{t('tableOfContents')}</span>
            </button>
          )}

          <div className="h-4 w-px bg-subtle hidden sm:block" />

          {/* Book Info Title & Format Badge */}
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-pale-sky-500 shrink-0" />
            <h2 className="font-bold text-main text-xs sm:text-sm truncate max-w-xs sm:max-w-sm">
              {activeBook.title} - <span className="text-muted font-serif">{activeBook.author}</span>
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 font-mono font-bold uppercase">
              {detectedFormat}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-canvas border border-subtle text-muted uppercase font-mono">
              {readerDirection.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Center: View Modes & Focus Aids */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* View Modes Selector (Single, Two-Column, Continuous Scrolled) */}
          <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-subtle text-xs">
            <button
              onClick={() => setViewMode('single')}
              title={t('viewModeSingle')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                viewMode === 'single'
                  ? 'bg-pale-sky-500 text-white shadow-sm'
                  : 'text-muted hover:text-main'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('viewModeSingle')}</span>
            </button>
            <button
              onClick={() => setViewMode('two-column')}
              title={t('viewModeTwoColumn')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                viewMode === 'two-column'
                  ? 'bg-pale-sky-500 text-white shadow-sm'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('viewModeTwoColumn')}</span>
            </button>
            <button
              onClick={() => setViewMode('scrolled')}
              title={t('viewModeScrolled')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                viewMode === 'scrolled'
                  ? 'bg-pale-sky-500 text-white shadow-sm'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Scroll className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('viewModeScrolled')}</span>
            </button>
          </div>

          {/* PDF Native vs Manuscript Mode Switcher */}
          {detectedFormat === 'PDF' && (
            <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-subtle text-xs">
              <button
                onClick={() => setViewType('native_pdf')}
                title={t('readerViewPdf')}
                className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  viewType === 'native_pdf'
                    ? 'bg-pale-sky-500 text-white shadow-sm'
                    : 'text-muted hover:text-main'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">{t('readerViewPdf')}</span>
              </button>
              <button
                onClick={() => setViewType('text_manuscript')}
                title={t('readerViewText')}
                className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  viewType === 'text_manuscript'
                    ? 'bg-pale-sky-500 text-white shadow-sm'
                    : 'text-muted hover:text-main'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">{t('readerViewText')}</span>
              </button>
            </div>
          )}

          {/* Focus Aids Dropdown / Buttons */}
          <div className="hidden md:flex items-center gap-1 bg-canvas p-1 rounded-xl border border-subtle text-xs">
            <button
              onClick={() =>
                setActiveFocusAid((prev) => (prev === 'ruler' ? 'none' : 'ruler'))
              }
              title={t('readingRulerBtn')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                activeFocusAid === 'ruler'
                  ? 'bg-pale-sky-500 text-white shadow-sm'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Glasses className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{t('readingRulerBtn')}</span>
            </button>
            <button
              onClick={() =>
                setActiveFocusAid((prev) => (prev === 'paragraph' ? 'none' : 'paragraph'))
              }
              title={t('paragraphFocusBtn')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                activeFocusAid === 'paragraph'
                  ? 'bg-pale-sky-500 text-white shadow-sm'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{t('paragraphFocusBtn')}</span>
            </button>
            <button
              onClick={() =>
                setActiveFocusAid((prev) => (prev === 'rsvp' ? 'none' : 'rsvp'))
              }
              title={t('speedReaderBtn')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                activeFocusAid === 'rsvp'
                  ? 'bg-pale-sky-500 text-white shadow-sm'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{t('speedReaderBtn')}</span>
            </button>
          </div>

          {/* Typography Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            title={t('typographySettings')}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isSettingsOpen
                ? 'bg-pale-sky-500 text-white border-pale-sky-500 shadow-sm'
                : 'bg-canvas border-subtle text-muted hover:text-main'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Annotations & Ink Tools (KEY-137) */}
          <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-subtle text-xs">
            {/* Bookmark Current Page */}
            <button
              onClick={handleToggleBookmark}
              title={t('addBookmarkBtn')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                isCurrentPageBookmarked
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isCurrentPageBookmarked ? 'fill-current' : ''}`} />
            </button>

            {/* Stylus Freehand Ink Mode Toggle */}
            <button
              onClick={() => setIsInkModeActive(!isInkModeActive)}
              title={t('stylusInkMode')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                isInkModeActive
                  ? 'bg-pale-sky-500 text-white shadow-xs'
                  : 'text-muted hover:text-main'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
            </button>

            {/* Instant Highlight Mode Toggle */}
            <button
              onClick={() => {
                const next = !isInstantHighlightMode;
                setIsInstantHighlightMode(next);
                setShowToast(next ? t('instantModeActiveToast') : t('instantModeDisabledToast'));
                setTimeout(() => setShowToast(null), 3000);
              }}
              title={t('instantModeToggle')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                isInstantHighlightMode
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${isInstantHighlightMode ? 'fill-current' : ''}`} />
              <span className="hidden xl:inline">{t('instantModeToggle')}</span>
            </button>

            {/* Annotations Drawer Toggle */}
            <button
              onClick={() => setIsAnnotationsDrawerOpen(!isAnnotationsDrawerOpen)}
              title={t('annotationsDrawerTitle')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                isAnnotationsDrawerOpen
                  ? 'bg-pale-sky-500 text-white shadow-xs'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Highlighter className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('tabHighlights')}</span>
              {annotations.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-surface border border-subtle text-[10px] text-main font-mono">
                  {annotations.length}
                </span>
              )}
            </button>

            {/* In-Book Search Drawer Toggle (KEY-140) */}
            <button
              onClick={() => setIsSearchDrawerOpen(!isSearchDrawerOpen)}
              title={t('searchInBook')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                isSearchDrawerOpen
                  ? 'bg-pale-sky-500 text-white shadow-xs'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('searchInBook')}</span>
            </button>

            {/* Offline Dictionary & Encyclopedia Lookup (KEY-142) */}
            <button
              onClick={() => {
                setDictionaryLookupWord(selectedText || '');
                setIsDictionaryModalOpen(true);
              }}
              title={t('dictionaryLookupTitle')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                isDictionaryModalOpen
                  ? 'bg-pale-sky-500 text-white shadow-xs'
                  : 'text-muted hover:text-main'
              }`}
            >
              <BookA className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('dictionaryLookupTitle')}</span>
            </button>

            {/* BYOK AI Research Assistant & Translator (KEY-143) */}
            <button
              onClick={() => {
                setAiSelectedText(selectedText || '');
                setAiInitialTool('chat');
                setIsAIDrawerOpen(true);
              }}
              title={t('aiAssistantTitle')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                isAIDrawerOpen
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-muted hover:text-indigo-600 dark:hover:text-indigo-400'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('aiAssistantTitle')}</span>
            </button>

            {/* TTS / Audiobook Player Toggle (KEY-145) */}
            <button
              onClick={() => {
                setIsTTSPlayerActive((prev) => !prev);
                if (!isTTSPlayerActive && !ttsAudio.isPlaying) {
                  ttsAudio.play();
                }
              }}
              title={t('ttsPlayerTitle')}
              className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                isTTSPlayerActive || ttsAudio.isPlaying
                  ? 'bg-pale-sky-500 text-white shadow-xs'
                  : 'text-muted hover:text-pale-sky-600 dark:hover:text-pale-sky-400'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('ttsPlayerTitle')}</span>
            </button>

            {/* KOReader & Cloud Sync Trigger (KEY-147) */}
            <button
              onClick={() => setIsCloudSyncModalOpen(true)}
              title={t('cloudSyncModalTitle')}
              className="p-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer text-muted hover:text-amber-600 dark:hover:text-amber-400"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('tabKOSync')}</span>
            </button>

            {/* Reader Plugins & Extensibility (KEY-149) */}
            <button
              onClick={() => setIsPluginsModalOpen(true)}
              title={t('pluginsModalTitle')}
              className="p-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer text-muted hover:text-purple-600 dark:hover:text-purple-400"
              aria-label={t('pluginsModalTitle')}
            >
              <Puzzle className="w-3.5 h-3.5 text-purple-500" />
              <span className="hidden xl:inline">{t('pluginsModalTitle').split(' ')[0]}</span>
            </button>

            {/* Local OCR Engine Trigger & Options (KEY-141) */}
            <div className="relative">
              <button
                onClick={() => setIsOcrMenuOpen(!isOcrMenuOpen)}
                disabled={isOcrRunning}
                title={t('ocrRecognizePageBtn')}
                className={`p-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  isOcrRunning
                    ? 'bg-amber-500/20 text-amber-600 animate-pulse'
                    : isOcrMenuOpen
                    ? 'bg-pale-sky-500 text-white shadow-xs'
                    : 'text-muted hover:text-main'
                }`}
              >
                {isOcrRunning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                ) : (
                  <ScanText className="w-3.5 h-3.5" />
                )}
                <span className="hidden xl:inline">{t('ocrRecognizePageBtn')}</span>
              </button>

              {/* OCR Dropdown Menu */}
              {isOcrMenuOpen && (
                <div className="absolute top-full mt-2 inset-inline-end-0 w-64 bg-surface/95 backdrop-blur-md rounded-2xl shadow-2xl border border-subtle p-3 z-50 animate-in fade-in slide-in-from-top-1 duration-150 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-subtle pb-2">
                    <span className="font-bold text-main flex items-center gap-1.5">
                      <ScanText className="w-3.5 h-3.5 text-pale-sky-500" />
                      {t('ocrRecognizePageBtn')}
                    </span>
                    <button
                      onClick={() => setIsOcrMenuOpen(false)}
                      className="text-muted hover:text-main p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted">
                      {t('ocrLanguageLabel')}
                    </label>
                    <select
                      value={ocrLanguage}
                      onChange={(e) => setOcrLanguage(e.target.value as OcrLanguage)}
                      className="w-full px-2 py-1 rounded-lg border border-subtle bg-canvas text-main text-xs outline-none focus:ring-1 focus:ring-pale-sky-500"
                    >
                      <option value="auto">{t('ocrLangAuto')}</option>
                      <option value="ar-SA">{t('ocrLangAr')}</option>
                      <option value="en-US">{t('ocrLangEn')}</option>
                      <option value="fr-FR">{t('ocrLangFr')}</option>
                      <option value="ja-JP">{t('ocrLangJa')}</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <button
                      disabled={isOcrRunning}
                      onClick={() => {
                        setIsOcrMenuOpen(false);
                        handleRunOcrPage(readingPage);
                      }}
                      className="w-full py-1.5 px-3 rounded-xl bg-pale-sky-500 text-white font-bold hover:bg-pale-sky-600 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <ScanText className="w-3.5 h-3.5" />
                      <span>{t('ocrRecognizePageBtn')}</span>
                    </button>

                    <button
                      disabled={isOcrRunning}
                      onClick={() => {
                        setIsOcrMenuOpen(false);
                        handleRunOcrDocument();
                      }}
                      className="w-full py-1.5 px-3 rounded-xl bg-canvas border border-subtle text-main font-bold hover:bg-surface transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-pale-sky-500" />
                      <span>{t('ocrRecognizeBookBtn')}</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-subtle/50">
                    <label className="flex items-center gap-2 cursor-pointer text-[11px] text-muted">
                      <input
                        type="checkbox"
                        checked={showOcrDebug}
                        onChange={(e) => setShowOcrDebug(e.target.checked)}
                        className="rounded border-subtle text-pale-sky-500 accent-pale-sky-500"
                      />
                      <span>{t('ocrDebugOverlay')}</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Layout Split Mode Switcher */}
        <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-subtle text-xs">
          <button
            onClick={() => setSplitOrientation('none')}
            title={t('splitFullReader')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
              splitOrientation === 'none'
                ? 'bg-pale-sky-500 text-white shadow-sm'
                : 'text-muted hover:text-main'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{t('splitFullReader')}</span>
          </button>

          <button
            onClick={() => setSplitOrientation('vertical')}
            title={t('splitVertical')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
              splitOrientation === 'vertical'
                ? 'bg-pale-sky-500 text-white shadow-sm'
                : 'text-muted hover:text-main'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{t('splitVertical')}</span>
          </button>

          <button
            onClick={() => setSplitOrientation('horizontal')}
            title={t('splitHorizontal')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
              splitOrientation === 'horizontal'
                ? 'bg-pale-sky-500 text-white shadow-sm'
                : 'text-muted hover:text-main'
            }`}
          >
            <Rows2 className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{t('splitHorizontal')}</span>
          </button>
        </div>

        {/* Parallel Reading Workspace Button */}
        <button
          onClick={() => setIsParallelReading(true)}
          title={t('parallelReadingWorkspace')}
          className="px-3 py-1.5 rounded-xl bg-pale-sky-500/10 hover:bg-pale-sky-500/20 text-pale-sky-600 dark:text-pale-sky-400 font-bold border border-pale-sky-500/30 transition-all flex items-center gap-1.5 cursor-pointer text-xs shadow-sm hover:shadow"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('parallelReadingBtn')}</span>
        </button>
      </header>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex min-h-0 relative overflow-hidden ${
          splitOrientation === 'horizontal' ? 'flex-col' : 'flex-row'
        }`}
      >
        {/* Slide-out Table of Contents (TOC) Drawer */}
        {isTocOpen && bookDoc?.toc && (
          <div className="absolute top-0 bottom-0 inset-inline-start-0 w-72 bg-surface/95 backdrop-blur-md border-r border-subtle z-30 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="p-3 border-b border-subtle flex items-center justify-between bg-canvas/30">
              <span className="font-bold text-xs flex items-center gap-1.5 text-main">
                <ListTree className="w-4 h-4 text-pale-sky-500" />
                {t('tableOfContents')}
              </span>
              <button
                onClick={() => setIsTocOpen(false)}
                className="p-1 rounded-lg hover:bg-canvas text-muted hover:text-main"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
              {bookDoc.toc.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleJumpToTOC(item)}
                  className="w-full text-start p-2 rounded-xl hover:bg-canvas text-main font-medium transition-colors flex items-center gap-2 truncate cursor-pointer"
                >
                  <BookMarked className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Slide-out Annotations & Highlights Drawer (KEY-137 / KEY-138) */}
        <AnnotationsDrawer
          isOpen={isAnnotationsDrawerOpen}
          onClose={() => setIsAnnotationsDrawerOpen(false)}
          annotations={annotations}
          currentPage={readingPage}
          bookTitle={activeBook.title}
          bookAuthor={activeBook.author}
          bookIsbn={activeBook.isbn}
          bookFormat={detectedFormat}
          activeBookInfo={activeBookInfo}
          allBooksWithNotes={allBooksWithNotes}
          onJumpToPage={(p) => setReadingPage(Math.min(maxBookPages, Math.max(1, p)))}
          onDeleteAnnotation={handleDeleteAnnotation}
          t={t}
          direction={readerDirection}
        />

        {/* Slide-out In-Book Full-Text Search Drawer (KEY-140) */}
        <InBookSearchDrawer
          isOpen={isSearchDrawerOpen}
          onClose={() => setIsSearchDrawerOpen(false)}
          sections={searchableSections}
          currentPage={readingPage}
          onJumpToPage={(p) => setReadingPage(Math.min(maxBookPages, Math.max(1, p)))}
          t={t}
          direction={readerDirection}
        />

        {/* Pluggable Offline Dictionary & Encyclopedia Modal (KEY-142) */}
        <DictionaryLookupModal
          isOpen={isDictionaryModalOpen}
          onClose={() => setIsDictionaryModalOpen(false)}
          word={dictionaryLookupWord}
          bookLang={activeBook?.language || 'ar'}
          t={t}
        />

        {/* BYOK AI Research Assistant & Translation Drawer (KEY-143) */}
        <AIResearchAssistantDrawer
          isOpen={isAIDrawerOpen}
          onClose={() => setIsAIDrawerOpen(false)}
          bookId={activeBook?.id}
          bookTitle={activeBook?.title || ''}
          authorName={activeBook?.author}
          currentPage={readingPage}
          selectedText={aiSelectedText || selectedText}
          surroundingContext={activeFormattedPage?.text || activePageText || undefined}
          initialTool={aiInitialTool}
          onOpenSettings={() => setIsAISettingsOpen(true)}
          t={t}
        />

        {/* AI & Translation BYOK Settings Modal (KEY-143) */}
        <AISettingsModal
          isOpen={isAISettingsOpen}
          onClose={() => setIsAISettingsOpen(false)}
          t={t}
        />

        {/* TTS & Audiobook Mini Player (KEY-145) */}
        {isTTSPlayerActive && (
          <TTSMiniPlayer
            bookTitle={activeBook?.title}
            playbackState={ttsAudio.playbackState}
            playbackMode={ttsAudio.playbackMode}
            currentTime={ttsAudio.currentTime}
            duration={ttsAudio.duration}
            currentSentenceIndex={ttsAudio.currentSentenceIndex}
            totalSentences={ttsAudio.sentences.length}
            rate={ttsAudio.config.rate}
            sleepRemainingSeconds={ttsAudio.sleepRemainingSeconds}
            voices={ttsAudio.voices}
            activeVoiceAr={ttsAudio.config.voiceAr}
            activeVoiceEn={ttsAudio.config.voiceEn}
            autoLanguageSwitch={ttsAudio.config.autoLanguageSwitch}
            audiobookPairing={ttsAudio.audiobookPairing}
            isLyricsOpen={isTTSLyricsOpen}
            onTogglePlay={ttsAudio.togglePlay}
            onStop={() => {
              ttsAudio.stop();
              setIsTTSPlayerActive(false);
            }}
            onSkipForward={ttsAudio.skipForward}
            onSkipBackward={ttsAudio.skipBackward}
            onNextSentence={() =>
              ttsAudio.playSentence(
                Math.min(ttsAudio.sentences.length - 1, ttsAudio.currentSentenceIndex + 1)
              )
            }
            onPrevSentence={() =>
              ttsAudio.playSentence(Math.max(0, ttsAudio.currentSentenceIndex - 1))
            }
            onSeek={ttsAudio.seek}
            onRateChange={ttsAudio.setPlaybackRate}
            onSleepTimerChange={ttsAudio.setSleepTimer}
            onVoiceArChange={(voiceId) =>
              ttsAudio.setConfig((prev) => ({ ...prev, voiceAr: voiceId }))
            }
            onVoiceEnChange={(voiceId) =>
              ttsAudio.setConfig((prev) => ({ ...prev, voiceEn: voiceId }))
            }
            onToggleAutoSwitch={(enabled) =>
              ttsAudio.setConfig((prev) => ({ ...prev, autoLanguageSwitch: enabled }))
            }
            onToggleLyrics={() => setIsTTSLyricsOpen((prev) => !prev)}
            onOpenPairingWizard={() => setIsPairingDialogOpen(true)}
          />
        )}

        {/* Synchronized Read-Along Karaoke Lyrics Overlay (KEY-145) */}
        <TTSLyricsView
          isOpen={isTTSLyricsOpen}
          onClose={() => setIsTTSLyricsOpen(false)}
          sentences={ttsAudio.sentences}
          currentSentenceIndex={ttsAudio.currentSentenceIndex}
          activeWord={ttsAudio.activeWord}
          onSelectSentence={(idx) => ttsAudio.playSentence(idx)}
          isPlaying={ttsAudio.isPlaying}
        />

        {/* 5-Step Audiobook Pairing Wizard (KEY-145) */}
        <AudiobookPairingDialog
          isOpen={isPairingDialogOpen}
          bookId={activeBook?.id || ''}
          bookTitle={activeBook?.title || ''}
          toc={bookDoc?.toc || []}
          onClose={() => setIsPairingDialogOpen(false)}
          onPairingSaved={(pairing) => {
            ttsAudio.loadAudiobook(pairing);
            setIsTTSPlayerActive(true);
          }}
        />

        {/* Cloud Backup & KOReader Sync Modal (KEY-147) */}
        <CloudSyncModal
          isOpen={isCloudSyncModalOpen}
          onClose={() => setIsCloudSyncModalOpen(false)}
        />

        {/* Reader Plugins & Extensibility Modal (KEY-149) */}
        <ReaderPluginsModal
          isOpen={isPluginsModalOpen}
          onClose={() => setIsPluginsModalOpen(false)}
          lang={readerDirection === 'rtl' ? 'ar' : 'en'}
        />

        {/* Floating Typography Settings Popover */}
        {isSettingsOpen && (
          <div className="absolute top-2 inset-inline-end-4 w-80 bg-surface/95 backdrop-blur-md border border-subtle rounded-2xl shadow-2xl z-30 p-4 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-subtle/40 pb-2">
              <span className="font-bold text-xs text-main flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-pale-sky-500" />
                {t('typographySettings')}
              </span>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 rounded-lg hover:bg-canvas text-muted hover:text-main"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Theme Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-muted">{t('readerTheme')}</span>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { id: 'sepia', bg: '#fbf0d9', text: '#5f4b32', label: t('themeSepia') },
                  { id: 'light', bg: '#ffffff', text: '#1e293b', label: t('themeLight') },
                  { id: 'dark', bg: '#0f172a', text: '#f1f5f9', label: t('themeDark') },
                  { id: 'night', bg: '#000000', text: '#999999', label: t('themeNight') },
                  { id: 'e-ink', bg: '#ffffff', text: '#000000', label: t('themeEink') },
                ].map((th) => (
                  <button
                    key={th.id}
                    onClick={() => setReaderTheme(th.id as ReaderTheme)}
                    title={th.label}
                    className={`h-7 rounded-lg border text-xs font-bold flex items-center justify-center transition-all ${
                      readerTheme === th.id
                        ? 'border-pale-sky-500 ring-2 ring-pale-sky-500/30 shadow-sm'
                        : 'border-subtle'
                    }`}
                    style={{ backgroundColor: th.bg, color: th.text }}
                  >
                    A
                  </button>
                ))}
              </div>
            </div>

            {/* Font Family Selection */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-muted">{t('fontFamilyLabel')}</span>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-subtle bg-canvas text-main text-xs font-medium outline-none focus:ring-1 focus:ring-pale-sky-500"
              >
                <option value="amiri">{t('fontAmiri')}</option>
                <option value="scheherazade">{t('fontScheherazade')}</option>
                <option value="serif">{t('fontSerif')}</option>
                <option value="sans">{t('fontSans')}</option>
                <option value="mono">{t('fontMono')}</option>
              </select>
            </div>

            {/* Font Size & Line Spacing Sliders */}
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted">
                  <span>{t('fontSize')}</span>
                  <span className="font-mono font-bold text-main">{readerFontSize}px</span>
                </div>
                <input
                  type="range"
                  min={12}
                  max={36}
                  value={readerFontSize}
                  onChange={(e) => setReaderFontSize(Number(e.target.value))}
                  className="w-full accent-pale-sky-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted">
                  <span>{t('lineSpacingLabel')}</span>
                  <span className="font-mono font-bold text-main">{lineSpacing}</span>
                </div>
                <input
                  type="range"
                  min={1.2}
                  max={2.4}
                  step={0.05}
                  value={lineSpacing}
                  onChange={(e) => setLineSpacing(Number(e.target.value))}
                  className="w-full accent-pale-sky-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted">
                  <span>{t('marginLabel')}</span>
                  <span className="font-mono font-bold text-main">{margin}px</span>
                </div>
                <input
                  type="range"
                  min={16}
                  max={80}
                  value={margin}
                  onChange={(e) => setMargin(Number(e.target.value))}
                  className="w-full accent-pale-sky-500"
                />
              </div>
            </div>

            {/* Brightness & Contrast Filters */}
            <div className="space-y-2 pt-2 border-t border-subtle/40">
              <div className="flex justify-between text-[11px] text-muted">
                <span>{t('brightnessLabel')}</span>
                <span className="font-mono font-bold text-main">{brightness}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={150}
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="w-full accent-pale-sky-500"
              />
            </div>

            {/* Comic Auto-Spread Toggle */}
            {isComic && (
              <label className="flex items-center gap-2 text-xs text-main font-medium cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={wideComicSpread}
                  onChange={(e) => setWideComicSpread(e.target.checked)}
                  className="rounded border-subtle text-pale-sky-500 accent-pale-sky-500"
                />
                <span>{t('wideComicSpreadLabel')}</span>
              </label>
            )}
          </div>
        )}

        {/* Reading Content Viewport */}
        <div
          ref={contentContainerRef}
          className="flex-1 flex flex-col items-center justify-start p-3 sm:p-6 overflow-y-auto relative"
          style={{
            filter: `brightness(${brightness}%) contrast(${contrast}%)`,
          }}
        >
          {/* Visual Focus Aids Overlays */}
          <ReadingRuler
            containerRef={contentContainerRef}
            isActive={activeFocusAid === 'ruler'}
            onClose={() => setActiveFocusAid('none')}
            direction={readerDirection}
          />

          {activeFocusAid === 'paragraph' && (
            <ParagraphOverlay
              paragraphs={paragraphList}
              initialIndex={0}
              direction={readerDirection}
              theme={readerTheme}
              onClose={() => setActiveFocusAid('none')}
            />
          )}

          {activeFocusAid === 'rsvp' && (
            <RSVPOverlay
              text={rsvpFullText}
              initialWpm={320}
              direction={readerDirection}
              theme={readerTheme}
              onClose={() => setActiveFocusAid('none')}
            />
          )}

          {/* Freehand Stylus Ink Canvas Overlay (KEY-137) */}
          <InkCanvasOverlay
            isActive={isInkModeActive}
            onClose={() => setIsInkModeActive(false)}
            pageNumber={readingPage}
            initialStrokes={currentInkAnnotation?.strokeData || []}
            onStrokesChange={handleStrokesChange}
            t={t}
          />

          {/* Floating Action Feedback Toasts */}
          {showToast && (
            <div className="fixed top-20 start-1/2 -translate-x-1/2 z-50 bg-surface/95 backdrop-blur-md text-main px-4 py-2 rounded-2xl shadow-2xl text-xs font-bold animate-in fade-in slide-in-from-top-2 duration-150 border border-subtle flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-pale-sky-500" />
              <span>{showToast}</span>
            </div>
          )}
          {showCopiedToast && (
            <div className="fixed top-20 start-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2 rounded-2xl shadow-2xl text-xs font-bold animate-in fade-in slide-in-from-top-2 duration-150 flex items-center gap-2">
              <Check className="w-3.5 h-3.5" />
              <span>{t('textCopiedToast')}</span>
            </div>
          )}

          {/* Render Book Content by Format */}
          {isComic ? (
            /* COMIC / ARCHIVE IMAGE VIEWER */
            <div
              className={`w-full flex flex-col items-center justify-center min-h-full ${
                viewMode === 'two-column' ? 'max-w-6xl' : 'max-w-4xl'
              }`}
            >
              {isLoadingFile ? (
                <div className="h-64 flex flex-col items-center justify-center text-muted gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-pale-sky-500" />
                  <span className="text-xs font-bold font-sans">{t('loadingDocument')}</span>
                </div>
              ) : comicPageUrl ? (
                <div className="flex flex-col items-center space-y-4 w-full">
                  {/* Two-Column Comic Layout or Wide Page Spread */}
                  {viewMode === 'two-column' && !isWideComicPage && secondComicPageUrl ? (
                    <div className="flex items-center justify-center gap-4 w-full">
                      <img
                        src={readerDirection === 'rtl' ? secondComicPageUrl : comicPageUrl}
                        alt={`Page ${readingPage}`}
                        onLoad={handleComicImageLoad}
                        className="max-w-[48%] max-h-[82vh] object-contain rounded-2xl shadow-2xl border border-subtle"
                      />
                      <img
                        src={readerDirection === 'rtl' ? comicPageUrl : secondComicPageUrl}
                        alt={`Page ${readingPage + 1}`}
                        className="max-w-[48%] max-h-[82vh] object-contain rounded-2xl shadow-2xl border border-subtle"
                      />
                    </div>
                  ) : (
                    /* Single Column or Unified Wide Splash Image */
                    <div className="flex items-center justify-center w-full">
                      <img
                        src={comicPageUrl}
                        alt={`Page ${readingPage}`}
                        onLoad={handleComicImageLoad}
                        className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-subtle"
                      />
                    </div>
                  )}

                  {/* Navigation controls */}
                  <div className="flex items-center gap-4 text-xs font-bold text-muted bg-surface/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-subtle shadow-md">
                    <button
                      disabled={readingPage <= 1}
                      onClick={() =>
                        setReadingPage(
                          Math.max(1, readingPage - (viewMode === 'two-column' && !isWideComicPage ? 2 : 1))
                        )
                      }
                      className="p-1.5 rounded-lg hover:bg-canvas disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
                    </button>
                    <span>
                      {readingPage}
                      {viewMode === 'two-column' && !isWideComicPage && secondComicPageUrl
                        ? ` - ${Math.min(maxBookPages, readingPage + 1)}`
                        : ''}{' '}
                      / {maxBookPages}
                    </span>
                    <button
                      disabled={readingPage >= maxBookPages}
                      onClick={() =>
                        setReadingPage(
                          Math.min(
                            maxBookPages,
                            readingPage + (viewMode === 'two-column' && !isWideComicPage ? 2 : 1)
                          )
                        )
                      }
                      className="p-1.5 rounded-lg hover:bg-canvas disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : isReflowable ? (
            /* REFLOWABLE FORMAT VIEWER (EPUB, MOBI, FB2, TXT, MD, DOCX, HTML) */
            <div
              onMouseUp={handleMouseUp}
              className={`w-full flex flex-col border rounded-3xl p-6 sm:p-10 shadow-xl relative transition-all overflow-hidden ${
                viewMode === 'two-column' ? 'max-w-6xl' : 'max-w-3xl'
              } ${themeClasses[readerTheme] || themeClasses.sepia}`}
              style={{
                paddingLeft: `${margin}px`,
                paddingRight: `${margin}px`,
              }}
            >
              {/* Header Navigation Bar */}
              <div className="flex items-center justify-between text-xs text-muted pb-3 border-b border-subtle/50 font-serif shrink-0">
                <span className="truncate max-w-md">
                  {activeBook.title} - {activeBook.author}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={readingPage <= 1}
                    onClick={() =>
                      setReadingPage(
                        Math.max(1, readingPage - (viewMode === 'two-column' && secondFormattedPage ? 2 : 1))
                      )
                    }
                    className="p-1 rounded-lg hover:bg-canvas border border-subtle disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
                  </button>
                  <span className="font-bold text-main font-sans">
                    {readingPage}
                    {viewMode === 'two-column' && secondFormattedPage
                      ? ` - ${Math.min(maxBookPages, readingPage + 1)}`
                      : ''}{' '}
                    / {maxBookPages}
                  </span>
                  <button
                    disabled={readingPage >= maxBookPages}
                    onClick={() =>
                      setReadingPage(
                        Math.min(
                          maxBookPages,
                          readingPage + (viewMode === 'two-column' && secondFormattedPage ? 2 : 1)
                        )
                      )
                    }
                    className="p-1 rounded-lg hover:bg-canvas border border-subtle disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
                  </button>
                </div>
              </div>

              {/* Floating Selection Popover for Reflowable Content */}
              {renderSelectionPopover()}

              {/* Rendered HTML Section Content with Discrete Screen-Sized Pagination */}
              <div
                className={`flex-1 py-6 space-y-4 select-text leading-relaxed ${
                  viewMode === 'scrolled' ? 'overflow-y-visible' : 'overflow-y-auto'
                }`}
                dir={readerDirection}
                style={{
                  fontSize: `${readerFontSize}px`,
                  fontFamily: getFontFamilyStyle(),
                  lineHeight: lineSpacing,
                }}
              >
                {isLoadingFile || isPaginating ? (
                  <div className="h-64 flex flex-col items-center justify-center text-muted gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-pale-sky-500" />
                    <span className="text-xs font-bold font-sans">
                      {isPaginating ? t('loadingDocument') : t('loadingDocument')}
                    </span>
                  </div>
                ) : activeFormattedPage ? (
                  viewMode === 'two-column' && secondFormattedPage ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 w-full">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: (readerDirection === 'rtl' ? secondFormattedPage : activeFormattedPage).html,
                        }}
                        className="prose prose-slate dark:prose-invert max-w-none break-words"
                        style={{ lineHeight: lineSpacing }}
                      />
                      <div
                        dangerouslySetInnerHTML={{
                          __html: (readerDirection === 'rtl' ? activeFormattedPage : secondFormattedPage).html,
                        }}
                        className="prose prose-slate dark:prose-invert max-w-none break-words md:border-s md:ps-8 md:border-subtle/40"
                        style={{ lineHeight: lineSpacing }}
                      />
                    </div>
                  ) : (
                    <div
                      dangerouslySetInnerHTML={{ __html: activeFormattedPage.html }}
                      className="prose prose-slate dark:prose-invert max-w-none break-words"
                      style={{ lineHeight: lineSpacing }}
                    />
                  )
                ) : currentSectionHtml ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: currentSectionHtml }}
                    className="prose prose-slate dark:prose-invert max-w-none break-words"
                    style={{
                      lineHeight: lineSpacing,
                    }}
                  />
                ) : (
                  <div className="font-serif text-base sm:text-lg text-main leading-loose space-y-4">
                    {activePageText ? (
                      activePageText.split(/\n\n+/).map((paragraph, idx) => (
                        <p
                          key={idx}
                          className="indent-4 leading-relaxed"
                          style={{ marginBottom: `${paragraphSpacing}em` }}
                        >
                          {paragraph}
                        </p>
                      ))
                    ) : (
                      <div className="h-64 flex flex-col items-center justify-center text-muted gap-2">
                        <BookOpen className="w-8 h-8 opacity-40" />
                        <span className="text-xs">{t('noNotesYet')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Page Footer Navigation */}
              <div className="pt-4 border-t border-subtle/50 flex items-center justify-between text-xs text-muted font-serif shrink-0">
                <span className="flex items-center gap-1.5 text-[11px] text-pale-sky-600 dark:text-pale-sky-300 font-sans truncate max-w-[65%]">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  {activeFormattedPage?.chapterLabel || t('highlightHint')}
                </span>
                <span>{t('pageText').replace('{page}', readingPage.toString())}</span>
              </div>
            </div>
          ) : viewType === 'text_manuscript' ? (
            /* PDF TEXT MANUSCRIPT & HIGHLIGHTING READER */
            <div
              onMouseUp={handleMouseUp}
              className={`w-full flex flex-col border rounded-3xl p-6 sm:p-10 shadow-xl relative transition-all overflow-hidden ${
                viewMode === 'two-column' ? 'max-w-6xl' : 'max-w-3xl'
              } ${themeClasses[readerTheme] || themeClasses.light}`}
              style={{
                paddingLeft: `${margin}px`,
                paddingRight: `${margin}px`,
              }}
            >
              {/* Header Page Controls */}
              <div className="flex items-center justify-between text-xs text-muted pb-3 border-b border-subtle/50 font-serif shrink-0">
                <span>
                  {activeBook.title} - {activeBook.author}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={readingPage <= 1}
                    onClick={() => setReadingPage(Math.max(1, readingPage - 1))}
                    className="p-1 rounded-lg hover:bg-canvas border border-subtle disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
                  </button>
                  <span className="font-bold text-main font-sans">
                    {t('page')} {readingPage} / {maxBookPages}
                  </span>
                  <button
                    disabled={readingPage >= maxBookPages}
                    onClick={() => setReadingPage(Math.min(maxBookPages, readingPage + 1))}
                    className="p-1 rounded-lg hover:bg-canvas border border-subtle disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
                  </button>
                </div>
              </div>

              {/* Floating Selection Popover for Manuscript Content */}
              {renderSelectionPopover()}

              {/* Manuscript Content Area with View Modes */}
              <div
                className={`flex-1 py-6 space-y-6 select-text ${
                  viewMode === 'scrolled' ? 'overflow-y-visible' : 'overflow-y-auto'
                } ${
                  viewMode === 'two-column'
                    ? 'columns-1 md:columns-2 gap-10 [column-rule:1px_solid_var(--border-subtle,#cbd5e1)]'
                    : ''
                }`}
                style={{
                  fontSize: `${readerFontSize}px`,
                  fontFamily: getFontFamilyStyle(),
                  lineHeight: lineSpacing,
                }}
              >
                {isExtractingText ? (
                  <div className="h-64 flex flex-col items-center justify-center text-muted gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-pale-sky-500" />
                    <span className="text-xs font-bold font-sans">{t('extractingText')}</span>
                  </div>
                ) : extractionFailed && !activePageText ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 my-auto">
                    <div className="w-16 h-16 rounded-3xl bg-pale-sky-500/10 border border-pale-sky-500/20 flex items-center justify-center text-pale-sky-500">
                      <ScanText className="w-8 h-8" />
                    </div>
                    <div className="space-y-2 max-w-md">
                      <h3 className="font-bold text-base text-main font-display">
                        {t('scannedPdfDetected')}
                      </h3>
                      <p className="text-xs text-muted leading-relaxed font-sans">
                        {t('ocrScannedNotice')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                      <button
                        disabled={isOcrRunning}
                        onClick={() => handleRunOcrPage(readingPage)}
                        className="px-4 py-2 rounded-xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isOcrRunning ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ScanText className="w-4 h-4" />
                        )}
                        <span>{t('ocrRecognizePageBtn')}</span>
                      </button>
                      <button
                        disabled={isOcrRunning}
                        onClick={handleRunOcrDocument}
                        className="px-4 py-2 rounded-xl bg-surface border border-subtle text-main font-bold text-xs hover:bg-canvas shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <BookOpen className="w-4 h-4 text-pale-sky-500" />
                        <span>{t('ocrRecognizeBookBtn')}</span>
                      </button>
                      <button
                        onClick={() => setViewType('native_pdf')}
                        className="px-4 py-2 rounded-xl bg-surface border border-subtle text-muted hover:text-main font-bold text-xs transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <FileCode className="w-4 h-4" />
                        <span>{t('goToNativePdf')}</span>
                      </button>
                    </div>
                    {ocrProgress && (
                      <div className="text-xs font-mono text-pale-sky-600 dark:text-pale-sky-400 mt-2">
                        {t('ocrProgressStatus', {
                          current: ocrProgress.current,
                          total: ocrProgress.total,
                          words: ocrProgress.words,
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="font-serif text-base sm:text-lg text-main leading-loose space-y-4">
                    {activePageText.split(/\n\n+/).map((paragraph, idx) => (
                      <p
                        key={idx}
                        className="indent-4 leading-relaxed"
                        style={{ marginBottom: `${paragraphSpacing}em` }}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Page Footer Navigation */}
              <div className="pt-4 border-t border-subtle/50 flex items-center justify-between text-xs text-muted font-serif shrink-0">
                <span className="flex items-center gap-1 text-[11px] text-pale-sky-600 dark:text-pale-sky-300 font-sans">
                  <Sparkles className="w-3 h-3" />
                  {t('highlightHint')}
                </span>
                <span>{t('pageText').replace('{page}', readingPage.toString())}</span>
              </div>
            </div>
          ) : (
            /* NATIVE PRIVILEGED ASSET STREAMING PDF VIEW */
            <div className="w-full h-full bg-surface border border-subtle rounded-2xl overflow-hidden shadow-2xl relative flex flex-col">
              {isLoadingFile ? (
                <div className="w-full h-full bg-surface flex flex-col items-center justify-center text-muted gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-pale-sky-500" />
                  <span className="text-xs font-bold">{t('loadingNativePdf')}</span>
                </div>
              ) : (pdfBlobUrl || assetUrl) ? (
                <div className="w-full h-full flex flex-col">
                  {/* Floating PDF Header Controls */}
                  <div className="h-10 bg-surface/90 backdrop-blur border-b border-subtle flex items-center justify-between px-4 text-xs font-sans text-muted shrink-0 z-10">
                    <span className="font-medium truncate max-w-sm">
                      {activeBook.title}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={readingPage <= 1}
                        onClick={() => setReadingPage(Math.max(1, readingPage - 1))}
                        className="p-1 rounded-lg hover:bg-canvas border border-subtle disabled:opacity-40 cursor-pointer"
                        title={t('paginationPrevious') || 'Previous'}
                      >
                        <ChevronRight className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
                      </button>
                      <span className="font-bold text-main">
                        {t('page')} {readingPage} / {maxBookPages}
                      </span>
                      <button
                        disabled={readingPage >= maxBookPages}
                        onClick={() => setReadingPage(Math.min(maxBookPages, readingPage + 1))}
                        className="p-1 rounded-lg hover:bg-canvas border border-subtle disabled:opacity-40 cursor-pointer"
                        title={t('paginationNext') || 'Next'}
                      >
                        <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
                      </button>
                    </div>
                  </div>
                  <div className="relative w-full flex-1 overflow-hidden">
                    <iframe
                      key={`pdf-${readingPage}-${pdfBlobUrl}`}
                      src={`${pdfBlobUrl || assetUrl}#page=${readingPage}&view=FitH`}
                      title={activeBook.title}
                      className="w-full h-full border-none"
                    />
                    {ocrPages.get(readingPage) && (
                      <OcrTextOverlay
                        pageResult={ocrPages.get(readingPage)!}
                        showVisualDebug={showOcrDebug}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted text-xs p-6 space-y-3">
                  <FileText className="w-10 h-10 text-subtle" />
                  <p className="font-bold text-main">{t('noLocalPdf')}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Optional Split-Screen Notes Panel */}
        {splitOrientation !== 'none' && renderNotesPanel()}
      </div>
    </div>
  );
};
