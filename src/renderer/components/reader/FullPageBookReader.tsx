'use client';
import { STAMPS, measurementLabel } from '../../../shared/pdf-study-tools';
import { translations } from '../../translations';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  CheckCircle2,
  BookA,
  Headphones,
  Cloud,
  Puzzle,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { DocumentLoader, detectFormat } from '../../libs/reader/document-loader';
import { paginateBookSections, type FormattedPage } from '../../libs/reader/epub-paginator';
import { chaptersFromPages, inlineBlobImages } from '../../libs/reader/book-pdf-export';
import { openKnowledgeCard } from '../../libs/knowledge-card-context';
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
  getPdfThemeFilter,
} from '../../libs/reader/typography';
import { ReaderHeader } from './ReaderHeader';
import { ReaderSidePanel } from './ReaderSidePanel';
import { PdfMarksList } from './PdfMarksList';
import { useReaderChrome } from './useReaderChrome';
import type { PdfReview } from '../../../shared/types/pdf-collaboration';
import chromeStyles from './reader-chrome.module.css';
import { Chip } from '../ui/Chip';
import { getOcrStatusChipInfo, type OcrStatusState } from './pdf-tool-catalogue';
import { ZenCornerHotspots } from './ZenCornerHotspots';
import { ReaderMarkupBar, ReaderShortcutSheet } from './ReaderMarkupBar';
import { PdfMarkupProvider } from './PdfMarkupLayer';
import { PdfMarkPopover } from './PdfMarkPopover';
import { PdfCompareDialog } from './PdfCompareDialog';
import { isTextTool, shapeLocation, type MarkupTool, type ShapeMark } from '../../../shared/pdf-markup';
import {
  buildEpubCfi,
  serializeEpubLocation,
  parseEpubLocation,
  extractMarkPage,
  isEpubLocation,
} from '../../../shared/epub-marks';
import { QuestionCardEditor } from '../knowledge/QuestionCardEditor';
import { StudyAssistant } from '../notes/StudyAssistant';
import { readerSelectionCard, type ReaderStudySource } from '../../../shared/reader-study-selection';
import type { SaveCardInput } from '../../../shared/types/knowledge-cards';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import { selectionStudyLocation, resolveStudyCfi, revealStudyRange } from '../../libs/reader/epub-study-location';
import { bookCfiTarget, bookStudyTarget } from '../../../shared/study-notes';
import { consumePendingPage, consumePendingCfi } from '../../utils/study-navigation';
import { markHistoryShortcut, readerShortcut } from '../../libs/reader/reader-shortcuts';
import { ZenSelectionMenu } from './ZenSelectionMenu';
import { ZenTocDrawer } from './ZenTocDrawer';
import { ZenFootnotePopover } from './ZenFootnotePopover';
import type { KnowledgeItemDTO, KnowledgeType } from '../../../shared/types/knowledge';
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
import { useTTSAudio, type TTSProviderNoticeKind } from '../../hooks/useTTSAudio';
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
  setActiveSelectionHighlight,
  clearActiveSelectionHighlight,
  renderTempSelectionOverlay,
  removeTempSelectionOverlay,
  injectHighlightStyles,
  findRangesForText,
  setActiveTtsHighlight,
  clearActiveTtsHighlight,
  HIGHLIGHT_COLORS,
} from '../../libs/reader/highlight-manager';
import { useReaderPanels } from './useReaderPanels';
import { PdfWorkstationPanel } from './PdfWorkstationPanel';
import { OcrInspectorDrawer } from './OcrInspectorDrawer';
import { PdfAccessibilityDrawer } from './PdfAccessibilityDrawer';
import { PdfReflowModal } from './PdfReflowModal';
import { PdfReadingOrderOverlay } from './PdfReadingOrderOverlay';
import type {
  PdfAccessibilityReadingOrderItem,
  PdfAccessibilityBaseReport,
} from '../../../shared/types/pdf-accessibility';
import {
  applyWordCorrection,
  applyStoredCorrections,
  resolveAndMigratePageCorrections,
} from '../../../shared/ocr-suspects';
import { OcrPageOverlay } from './OcrPageOverlay';
import { ocrEngineName, ocrFallbackMessage } from './ocr-status';
import { useOcrEngines } from './useOcrEngines';
import { PdfNativeViewer, type PdfSelectionInfo, type NormalizedRect } from './PdfNativeViewer';
import { HighlightActionPopover } from './HighlightActionPopover';
import { segmentTextIntoSentences } from '../../../shared/utils/tts-text';
import { readerAssetUrl } from '../../../shared/utils/reader-asset-url';
import { useCompanionContext } from '../../utils/companion-context';
import { useMaterialSave } from '../../hooks/useMaterialSave';
import { saveReaderKnowledge } from '../../libs/reader/save-reader-knowledge';
import { registerCloseGuard } from '../../utils/close-guard';
import { ExportPdfDialog, SaveCloseDialog } from './FileSaveUi';

const PDF_TEXT_DELAY_MS = 2500;

export const FullPageBookReader: React.FC = () => {
  const { activeBook } = useWorkspace();
  return <SourceBookReader key={`${activeBook?.id}:${activeBook?.sourceId ?? activeBook?.filePath ?? ''}`} />;
};

// Reader state, including OCR results and pending corrections, belongs to the open source.
const SourceBookReader: React.FC = () => {
  const {
    activeBook,
    books,
    readingPage,
    setReadingPage,
    closeReaderToLibrary,
    splitOrientation,
    setSplitOrientation,
    bookNotes,
    deletePageNote,
    t,
    lang: workspaceLang,
    dir: workspaceDir,
  } = useWorkspace();

  const panels = useReaderPanels();
  const chrome = useReaderChrome(activeBook?.id, panels.activePanel, panels.setters);
  const [focusMode, setFocusMode] = useState(false);
  const [pdfReviews, setPdfReviews] = useState<PdfReview[]>([]);
  const isDocumentPanelOpen = panels.activePanel === 'document';
  const setIsDocumentPanelOpen = panels.setters.document;
  const [selectedText, setSelectedText] = useState('');
  const [studySource, setStudySource] = useState<ReaderStudySource | null>(null);
  const [studyDraft, setStudyDraft] = useState<SaveCardInput | null>(null);
  const reviewSaving = useRef(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [activeRange, setActiveRange] = useState<Range | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [filterMode, setFilterMode] = useState<'current_page' | 'all_pages'>('current_page');
  const [viewType, setViewType] = useState<'text_manuscript' | 'native_pdf'>('native_pdf');
  const [legacyPdfWork, setLegacyPdfWork] = useState<string | null>(null);
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfSourceRevision, setPdfSourceRevision] = useState(0);
  useEffect(() => window.electronAPI?.pdfEditor?.onSourceChanged(source => {
    if (source.workId === activeBook?.id) setPdfSourceRevision(previous => previous + 1);
  }), [activeBook?.id]);

  const currentSourceId = activeBook?.sourceId ?? null;
  const sourcesCount = activeBook?.sourceCount ?? 0;
  const [pdfTotalPages, setPdfTotalPages] = useState<number>(1);
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // Multi-Format Reader Engine State
  const [bookDoc, setBookDoc] = useState<BookDoc | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<BookFormat>(() => {
    return activeBook?.filePath ? detectFormat(activeBook.filePath) : 'PDF';
  });
  const effectiveFormat = activeBook?.filePath ? detectFormat(activeBook.filePath) : detectedFormat;
  const isPdfWorkstationActive = effectiveFormat === 'PDF' && legacyPdfWork !== activeBook?.id;
  const isComic = ['CBZ', 'CBR', 'CBT', 'CB7'].includes(effectiveFormat);
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
  ].includes(effectiveFormat);
  const [readerDirection, setReaderDirection] = useState<'rtl' | 'ltr'>('ltr');
  const isTocOpen = panels.activePanel === 'toc';
  const setIsTocOpen = panels.setters['toc'];
  const [currentSectionHtml, setCurrentSectionHtml] = useState<string>('');
  const [comicPageUrl, setComicPageUrl] = useState<string | null>(null);
  const [secondComicPageUrl, setSecondComicPageUrl] = useState<string | null>(null);
  const [isWideComicPage, setIsWideComicPage] = useState<boolean>(false);

  // Zen Viewport & Edge Sensors State
  const [isTopBarVisible, setIsTopBarVisible] = useState<boolean>(false);
  const [isBottomBarVisible, setIsBottomBarVisible] = useState<boolean>(false);
  const [isIdle, setIsIdle] = useState<boolean>(false);
  const isTocPinned = panels.tocPinned;
  const setIsTocPinned = panels.pinToc;
  const isKnowledgeDrawerOpen = panels.activePanel === 'knowledge';
  const setIsKnowledgeDrawerOpen = panels.setters['knowledge'];
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItemDTO[]>([]);
  const [previousJumpPage, setPreviousJumpPage] = useState<number | null>(null);
  const [autoCropMargins, setAutoCropMargins] = useState<boolean>(false);
  const [pdfFitMode, setPdfFitMode] = useState<'Fit' | 'FitH' | 'FitV'>('FitH');
  const [activeFootnote, setActiveFootnote] = useState<{
    index: string | number;
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const [pdfSelectionInfo, setPdfSelectionInfo] = useState<PdfSelectionInfo | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PdfSelectionInfo | null>(null);
  const [pdfToc, setPdfToc] = useState<TOCItem[]>([]);
  const [activeHighlightPopover, setActiveHighlightPopover] = useState<{
    highlight: KnowledgeItemDTO;
    position: { x: number; y: number };
  } | null>(null);
  const isTopBarHoveredRef = useRef(false);
  const isBottomBarHoveredRef = useRef(false);
  const topHideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const bottomHideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const topHoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const bottomHoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStartTimeRef = useRef<number>(0);
  useEffect(() => {
    sessionStartTimeRef.current = Date.now();
    return () => {
      removeTempSelectionOverlay();
      clearActiveSelectionHighlight();
      clearCssCustomHighlights();
      if (typeof window !== 'undefined') {
        window.getSelection()?.removeAllRanges();
      }
    };
  }, []);
  const startPageRef = useRef<number>(readingPage);

  // EPUB & Reflowable Pagination State
  const [paginatedPages, setPaginatedPages] = useState<FormattedPage[]>([]);
  const [tocPageMap, setTocPageMap] = useState<Map<string | number, number>>(new Map());
  const [isPaginating, setIsPaginating] = useState<boolean>(false);
  const [pdfDocProxy, setPdfDocProxy] = useState<import('../../libs/reader/pdf-view-document').PdfViewDocument | null>(null);

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
  const isSettingsOpen = panels.activePanel === 'settings';
  const setIsSettingsOpen = panels.setters['settings'];
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
  const isAnnotationsDrawerOpen = panels.activePanel === 'annotations';
  const setIsAnnotationsDrawerOpen = panels.setters['annotations'];
  const [isInkModeActive, setIsInkModeActive] = useState<boolean>(false);
  // Markup tools (Wave 8.3): the armed tool, and the lock that keeps it armed after one use. A text tool armed is the
  // old "keep highlighter on": a selection is saved at once in that style.
  const [markupTool, setMarkupTool] = useState<MarkupTool>('select');
  const [markupLocked, setMarkupLocked] = useState(false);
  const isInstantHighlightMode = isTextTool(markupTool);
  const toggleMarkupLock = useCallback(() => {
    if (markupLocked) { setMarkupLocked(false); setMarkupTool('select'); }
    else { setMarkupLocked(true); setMarkupTool(tool => (tool === 'select' ? 'highlight' : tool)); }
  }, [markupLocked]);
  const chooseMarkupTool = useCallback((tool: MarkupTool) => setMarkupTool(current => (current === tool ? 'select' : tool)), []);
  const stopMarkup = useCallback(() => { setMarkupTool('select'); setMarkupLocked(false); }, []);
  const finishMarkup = useCallback(() => { if (!markupLocked) setMarkupTool('select'); }, [markupLocked]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [openMark, setOpenMark] = useState<{ item: KnowledgeItemDTO; at: { x: number; y: number } } | null>(null);
  const [markThreadCounts, setMarkThreadCounts] = useState<Record<string, { open: number; total: number }>>({});
  const refreshMarkCounts = useCallback(() => { void window.electronAPI?.knowledgeHistory?.commentTotals?.().then(setMarkThreadCounts, () => {}); }, []);
  // Pin colours need the thread counts as soon as the book opens.
  useEffect(() => { const timer = setTimeout(refreshMarkCounts, 0); return () => clearTimeout(timer); }, [activeBook?.id, refreshMarkCounts]);
  const [activeHighlightColor, setActiveHighlightColor] = useState<string>('amber');
  const [showReaderShortcuts, setShowReaderShortcuts] = useState(false);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [showCopiedToast, setShowCopiedToast] = useState<boolean>(false);

  // Hands-Free Auto-Scrolling / Auto-Reader Mode State
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);
  useEffect(() => {
    const pause = () => setIsAutoScrolling(false);
    window.addEventListener('baglib:study-pause', pause);
    return () => window.removeEventListener('baglib:study-pause', pause);
  }, []);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(1);
  const lastWheelTimeRef = useRef<number>(0);
  const isPositioningEpubScrollRef = useRef<boolean>(false);
  const lastReportedEpubPageRef = useRef<number>(1);

  // In-Book Full-Text Search State (KEY-140)
  const isSearchDrawerOpen = panels.activePanel === 'search';
  const setIsSearchDrawerOpen = panels.setters['search'];

  // Local OCR Engine State (Story 3.2 / KEY-141)
  const [ocrPages, setOcrPages] = useState<Map<number, OcrPageResult>>(new Map());
  const [isOcrRunning, setIsOcrRunning] = useState<boolean>(false);
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>('auto');
  const { engines: ocrEngines, selectedEngine: ocrEngine, selectEngine: selectOcrEngine, refreshEngines: refreshOcrEngines } = useOcrEngines();
  const [showOcrDebug, setShowOcrDebug] = useState<boolean>(false);
  const isOcrMenuOpen = panels.activePanel === 'ocr';
  const setIsOcrMenuOpen = panels.setters['ocr'];
  const isAccessibilityDrawerOpen = panels.activePanel === 'accessibility';
  const setIsAccessibilityDrawerOpen = panels.setters['accessibility'];
  const [isReflowModalOpen, setIsReflowModalOpen] = useState<boolean>(false);
  const [showReadingOrderOverlay, setShowReadingOrderOverlay] = useState<boolean>(false);
  const [readingOrderItems, setReadingOrderItems] = useState<PdfAccessibilityReadingOrderItem[]>([]);
  const [isReadingOrderTagged, setIsReadingOrderTagged] = useState<boolean>(false);
  const [a11yReport, setA11yReport] = useState<PdfAccessibilityBaseReport | null>(null);
  const [ocrProgress, setOcrProgress] = useState<{ current: number; total: number; words: number } | null>(null);
  const [activeOcrWordIndex, setActiveOcrWordIndex] = useState<number | null>(null);

  // Pluggable Offline Dictionary & Encyclopedia State (Story 3.3 / KEY-142)
  const isDictionaryModalOpen = panels.activePanel === 'dictionary';
  const setIsDictionaryModalOpen = panels.setters['dictionary'];
  const [dictionaryLookupWord, setDictionaryLookupWord] = useState<string>('');

  // BYOK AI Research Assistant & Translation State (KEY-143)
  const isAIDrawerOpen = panels.activePanel === 'ai';
  const setIsAIDrawerOpen = panels.setters['ai'];
  const isAISettingsOpen = panels.activePanel === 'ai-settings';
  const setIsAISettingsOpen = panels.setters['ai-settings'];
  const [aiInitialTool, setAiInitialTool] = useState<AIResearchToolType>('chat');
  const [aiSelectedText, setAiSelectedText] = useState<string>('');

  // Text-to-Speech (TTS), Audiobook & SMIL Read-Along State (KEY-145)
  const [isTTSPlayerActive, setIsTTSPlayerActive] = useState<boolean>(false);
  const isTTSLyricsOpen = panels.activePanel === 'lyrics';
  const setIsTTSLyricsOpen = panels.setters['lyrics'];
  const isPairingDialogOpen = panels.activePanel === 'pairing';
  const setIsPairingDialogOpen = panels.setters['pairing'];
  const isCloudSyncModalOpen = panels.activePanel === 'cloud';
  const setIsCloudSyncModalOpen = panels.setters['cloud'];
  const isPluginsModalOpen = panels.activePanel === 'plugins';
  const setIsPluginsModalOpen = panels.setters['plugins'];
  const [pluginStyles, setPluginStyles] = useState<string>('');

  // Editable Page Target for Notes
  const [noteTargetPage, setNoteTargetPage] = useState<number>(readingPage);

  // Exclusive Panel Switching: Opening any panel automatically closes previously open panels
  const closeAllPanelsExcept = panels.close;
  const handleToggleSearch = useCallback(() => setIsSearchDrawerOpen(previous => !previous), [setIsSearchDrawerOpen]);
  const handleToggleAIDrawer = () => setIsAIDrawerOpen(previous => !previous);
  const handleToggleSettings = () => setIsSettingsOpen(previous => !previous);

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
  const [previousReaderPage, setPreviousReaderPage] = useState<readonly unknown[] | null>(null);
  const inputsReaderPage = [readingPage, maxBookPages];
  if (previousReaderPage === null || inputsReaderPage.some((value, index) => !Object.is(value, previousReaderPage[index]))) {
    setPreviousReaderPage(inputsReaderPage);
    setNoteTargetPage(Math.min(maxBookPages, Math.max(1, readingPage)));
    setSelectedText('');
    setPdfSelectionInfo(null);
    setActiveRange(null);
    setActiveOcrWordIndex(null);
  }
  useEffect(() => {
    clearActiveSelectionHighlight();
    removeTempSelectionOverlay();
  }, [readingPage, maxBookPages]);

  // Load custom plugin CSS styles dynamically
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.plugins) {
      (window).electronAPI.plugins.getStyles().then((styles: string) => {
        if (styles) setPluginStyles(styles);
      }).catch((e) => console.warn('[FullPageBookReader] Plugin styles error:', e));
    }
  }, [isPluginsModalOpen]);

  // Reading Statistics Tracking Lifecycle (KEY-149)
  useEffect(() => {
    if (activeBook?.id && typeof window !== 'undefined' && (window).electronAPI?.statistics) {
      (window).electronAPI.statistics.startSession({
        bookId: activeBook.id,
        title: activeBook.title,
        authors: activeBook.author,
        page: readingPage,
        totalPages: maxBookPages,
        subject: activeBook.categories?.[0] || 'General',
      });
    }
    return () => {
      if (typeof window !== 'undefined' && (window).electronAPI?.statistics) {
        (window).electronAPI.statistics.endSession();
      }
    };
  }, [activeBook?.id]);

  useEffect(() => {
    if (activeBook?.id && typeof window !== 'undefined' && (window).electronAPI?.statistics) {
      (window).electronAPI.statistics.turnPage(readingPage, maxBookPages);
    }
  }, [readingPage, maxBookPages, activeBook?.id]);

  useEffect(() => {
    const heartbeatTimer = setInterval(() => {
      if (typeof window !== 'undefined' && (window).electronAPI?.statistics) {
        (window).electronAPI.statistics.heartbeat();
      }
    }, 10000);
    return () => clearInterval(heartbeatTimer);
  }, []);

  const handleNextPage = useCallback(() => {
    setReadingPage(Math.min(maxBookPages, readingPage + (viewMode === 'two-column' ? 2 : 1)));
  }, [maxBookPages, readingPage, viewMode, setReadingPage]);

  const handlePrevPage = useCallback(() => {
    setReadingPage(Math.max(1, readingPage - (viewMode === 'two-column' ? 2 : 1)));
  }, [readingPage, viewMode, setReadingPage]);

  const handleCycleAutoScrollSpeed = useCallback(() => {
    const speeds: number[] = [0.5, 1, 1.5, 2];
    const nextIdx = (speeds.indexOf(autoScrollSpeed) + 1) % speeds.length;
    setAutoScrollSpeed(speeds[nextIdx]);
  }, [autoScrollSpeed]);

  const handleToggleAutoScroll = useCallback(() => {
    setIsAutoScrolling((prev) => {
      const next = !prev;
      if (next && viewMode !== 'scrolled') {
        isPositioningEpubScrollRef.current = true;
        setViewMode('scrolled');
      }
      return next;
    });
  }, [viewMode]);

  // Helper to discover true scrollable node in EPUB / reflowable reader
  const getEpubScrollElement = useCallback((mountEl: HTMLElement | null): HTMLElement | null => {
    if (!mountEl) return null;
    const candidates = [
      mountEl.querySelector('.epub-container') as HTMLElement,
      mountEl.querySelector('.epub-stream-container') as HTMLElement,
      mountEl,
      ...Array.from(mountEl.querySelectorAll<HTMLElement>('.select-text, .epub-stream-page, div')),
    ].filter(Boolean);

    for (const el of candidates) {
      if (el.scrollHeight > el.clientHeight + 4) {
        return el;
      }
    }
    const iframe = mountEl.querySelector('iframe');
    const docScroll = iframe?.contentDocument?.scrollingElement as HTMLElement | null;
    if (docScroll && docScroll.scrollHeight > docScroll.clientHeight + 4) {
      return docScroll;
    }
    return (mountEl.querySelector('.epub-stream-container') as HTMLElement) || (mountEl.querySelector('.epub-container') as HTMLElement) || mountEl;
  }, []);

  // EPUB & Reader Mouse Wheel Scrolling Interceptor
  useEffect(() => {
    const container = contentContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // 1. Do not intercept if user is scrolling inside modals, dialogs, aside, or inputs
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('[role="dialog"]') ||
        target?.closest('[role="toolbar"]') ||
        target?.closest('[role="complementary"]') ||
        target?.closest('aside') ||
        target?.closest('select') ||
        target?.closest('input') ||
        target?.closest('textarea')
      ) {
        return;
      }

      // 2. In continuous scroll mode, ensure standard vertical scrolling functions smoothly
      if (viewMode === 'scrolled') {
        const scrollEl =
          detectedFormat === 'PDF' && viewType === 'native_pdf'
            ? (container.querySelector('.pdf-native-viewer-container') as HTMLElement) || container
            : getEpubScrollElement(container) || container;

        if (scrollEl) {
          scrollEl.scrollTop += e.deltaY;
          if (target && target.ownerDocument !== document) {
            e.preventDefault();
          }
          if (e.deltaY > 0 && scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 5) {
            if (typeof (bookDoc)?.rendition?.next === 'function') {
              (bookDoc).rendition.next();
            }
            if (readingPage < maxBookPages) {
              handleNextPage();
            }
          } else if (e.deltaY < 0 && scrollEl.scrollTop <= 2) {
            if (typeof (bookDoc)?.rendition?.prev === 'function') {
              (bookDoc).rendition.prev();
            }
            if (readingPage > 1) {
              handlePrevPage();
            }
          }
        }
        return;
      }

      // 3. In pagination / column mode:
      // If a nested child element has active scroll headroom, let it scroll locally first
      if (target && target !== container) {
        let parent: HTMLElement | null = target;
        let hasLocalScroll = false;
        while (parent && parent !== container) {
          const style = window.getComputedStyle(parent);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            const canScrollDown = e.deltaY > 0 && parent.scrollTop + parent.clientHeight < parent.scrollHeight - 1;
            const canScrollUp = e.deltaY < 0 && parent.scrollTop > 1;
            if (canScrollDown || canScrollUp) {
              hasLocalScroll = true;
              break;
            }
          }
          parent = parent.parentElement;
        }
        if (hasLocalScroll) return;
      }

      // Ignore micro-jitter below threshold
      if (Math.abs(e.deltaY) < 15 && Math.abs(e.deltaX) < 15) {
        return;
      }

      // Prevent native viewport bounce or default page scroll
      e.preventDefault();

      // Debounce wheel events (~200ms threshold) so a single flick doesn't flip 10 pages
      const now = performance.now();
      if (now - lastWheelTimeRef.current < 200) {
        return;
      }
      lastWheelTimeRef.current = now;

      // Determine next vs. prev based on deltaY (vertical) or deltaX (horizontal swipe)
      let isNext = false;
      let isPrev = false;

      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        if (e.deltaY > 0) isNext = true;
        else if (e.deltaY < 0) isPrev = true;
      } else {
        const isRtl = readerDirection === 'rtl';
        if (isRtl) {
          if (e.deltaX < 0) isNext = true;
          else if (e.deltaX > 0) isPrev = true;
        } else {
          if (e.deltaX > 0) isNext = true;
          else if (e.deltaX < 0) isPrev = true;
        }
      }

      if (isNext) {
        if (typeof (bookDoc)?.rendition?.next === 'function') {
          (bookDoc).rendition.next();
        }
        handleNextPage();
      } else if (isPrev) {
        if (typeof (bookDoc)?.rendition?.prev === 'function') {
          (bookDoc).rendition.prev();
        }
        handlePrevPage();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    const attachIframeWheel = () => {
      const iframes = container.querySelectorAll('iframe');
      iframes.forEach((iframe) => {
        try {
          iframe.contentDocument?.removeEventListener('wheel', handleWheel);
          iframe.contentDocument?.addEventListener('wheel', handleWheel, { passive: false });
          iframe.contentWindow?.removeEventListener('wheel', handleWheel);
          iframe.contentWindow?.addEventListener('wheel', handleWheel, { passive: false });
        } catch {}
      });
    };

    attachIframeWheel();
    const wheelInterval = setInterval(attachIframeWheel, 1000);

    return () => {
      clearInterval(wheelInterval);
      container.removeEventListener('wheel', handleWheel);
      const iframes = container.querySelectorAll('iframe');
      iframes.forEach((iframe) => {
        try {
          iframe.contentDocument?.removeEventListener('wheel', handleWheel);
          iframe.contentWindow?.removeEventListener('wheel', handleWheel);
        } catch {}
      });
    };
  }, [
    viewMode,
    readerDirection,
    detectedFormat,
    viewType,
    readingPage,
    maxBookPages,
    bookDoc,
    handleNextPage,
    handlePrevPage,
    paginatedPages.length,
    getEpubScrollElement,
  ]);

  // Hands-Free Auto-Scrolling Engine: Continuous Scroll Mode (rAF loop with Sub-Pixel Accumulator)
  useEffect(() => {
    if (!isAutoScrolling || viewMode !== 'scrolled') return;

    let animId: number;
    let lastTime = performance.now();
    let accumulatedScroll = 0;

    const getScrollEl = (): HTMLElement | null => {
      if (!contentContainerRef.current) return null;
      const root = contentContainerRef.current;

      // 1. PDF scroll container
      if (effectiveFormat === 'PDF' && viewType === 'native_pdf') {
        const pdfEl = (root.classList.contains('pdf-native-viewer-container')
          ? root
          : root.querySelector('.pdf-native-viewer-container')) as HTMLElement | null;
        if (pdfEl && pdfEl.scrollHeight > pdfEl.clientHeight) {
          return pdfEl;
        }
      }

      // 2. EPUB / reflowable scroll element
      return getEpubScrollElement(root) || root;
    };

    const step = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const el = getScrollEl();
      if (el) {
        // Base speed: 45 px/sec at 1x multiplier, scaled smoothly with sub-pixel accumulator
        const pxPerSec = 45 * autoScrollSpeed;
        accumulatedScroll += pxPerSec * dt;

        if (accumulatedScroll >= 1) {
          const wholePixels = Math.floor(accumulatedScroll);
          el.scrollTop += wholePixels;
          accumulatedScroll -= wholePixels;
        }

        // Check if reached bottom of scroll container: advance to next chapter/page
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
          if (readingPage < maxBookPages) {
            handleNextPage();
          } else {
            setIsAutoScrolling(false);
            return;
          }
        }
      }

      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [
    isAutoScrolling,
    viewMode,
    autoScrollSpeed,
    detectedFormat,
    viewType,
    readingPage,
    maxBookPages,
    handleNextPage,
    getEpubScrollElement,
  ]);

  // Hands-Free Auto-Scrolling Engine: Paginated / Book Spread Mode (Timed page turn)
  useEffect(() => {
    if (!isAutoScrolling || viewMode === 'scrolled') return;

    // Base interval: 20 seconds at 1x, scaled inversely by speed (0.5x -> 40s, 1x -> 20s, 1.5x -> 13.3s, 2x -> 10s)
    const intervalMs = Math.round((20 / autoScrollSpeed) * 1000);

    const timer = setInterval(() => {
      if (readingPage < maxBookPages) {
        handleNextPage();
      } else {
        // Reached end of book
        setIsAutoScrolling(false);
      }
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [isAutoScrolling, viewMode, autoScrollSpeed, readingPage, maxBookPages, handleNextPage]);


  // Full Screen-Reader Accessible Keyboard Navigation & Physics
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Keep text selection and focused study controls under native keyboard handling.
      if (e.defaultPrevented || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.closest('button, select, [role="dialog"]') ||
          target.isContentEditable)
      ) {
        return;
      }

      // 1. Continuous Scroll Mode Keyboard Navigation
      if (viewMode === 'scrolled') {
        const container = contentContainerRef.current;
        const scrollEl = container
          ? (detectedFormat === 'PDF' && viewType === 'native_pdf'
              ? (container.querySelector('.pdf-native-viewer-container') as HTMLElement) || container
              : getEpubScrollElement(container) || container)
          : null;

        if (scrollEl) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            scrollEl.scrollTop += 60;
            if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 5) {
              if (typeof (bookDoc)?.rendition?.next === 'function') {
                (bookDoc).rendition.next();
              }
              if (readingPage < maxBookPages) {
                handleNextPage();
              }
            }
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            scrollEl.scrollTop -= 60;
            if (scrollEl.scrollTop <= 2) {
              if (typeof (bookDoc)?.rendition?.prev === 'function') {
                (bookDoc).rendition.prev();
              }
              if (readingPage > 1) {
                handlePrevPage();
              }
            }
            return;
          }
          if (e.key === 'PageDown' || e.key === ' ') {
            e.preventDefault();
            const pageStep = Math.round(scrollEl.clientHeight * 0.85);
            scrollEl.scrollTop += pageStep;
            if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 5) {
              if (typeof (bookDoc)?.rendition?.next === 'function') {
                (bookDoc).rendition.next();
              }
              if (readingPage < maxBookPages) {
                handleNextPage();
              }
            }
            return;
          }
          if (e.key === 'PageUp') {
            e.preventDefault();
            const pageStep = Math.round(scrollEl.clientHeight * 0.85);
            scrollEl.scrollTop -= pageStep;
            if (scrollEl.scrollTop <= 2) {
              if (typeof (bookDoc)?.rendition?.prev === 'function') {
                (bookDoc).rendition.prev();
              }
              if (readingPage > 1) {
                handlePrevPage();
              }
            }
            return;
          }
        }
      }

      // 2. Paginated Mode Keyboard Navigation
      const isRtl = readerDirection === 'rtl';
      const isNext =
        (isRtl && e.key === 'ArrowLeft') ||
        (!isRtl && e.key === 'ArrowRight') ||
        e.key === 'ArrowDown' ||
        e.key === 'PageDown' ||
        e.key === ' ';

      const isPrev =
        (isRtl && e.key === 'ArrowRight') ||
        (!isRtl && e.key === 'ArrowLeft') ||
        e.key === 'ArrowUp' ||
        e.key === 'PageUp';

      if (isNext) {
        e.preventDefault();
        if (typeof (bookDoc)?.rendition?.next === 'function') {
          (bookDoc).rendition.next();
        }
        handleNextPage();
      } else if (isPrev) {
        e.preventDefault();
        if (typeof (bookDoc)?.rendition?.prev === 'function') {
          (bookDoc).rendition.prev();
        }
        handlePrevPage();
      } else if (e.key === 'Home') {
        e.preventDefault();
        setReadingPage(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        setReadingPage(maxBookPages);
      } else if (e.key === 'Escape') {
        if (isDocumentPanelOpen) setIsDocumentPanelOpen(false);
        else if (isSearchDrawerOpen) setIsSearchDrawerOpen(false);
        else if (isKnowledgeDrawerOpen) setIsKnowledgeDrawerOpen(false);
        else if (isAnnotationsDrawerOpen) setIsAnnotationsDrawerOpen(false);
        else if (isTocOpen) setIsTocOpen(false);
        else if (isSettingsOpen) setIsSettingsOpen(false);
        else if (isPluginsModalOpen) setIsPluginsModalOpen(false);
        else if (selectedText) {
          setSelectedText('');
          setPendingSelection(null);
          setPdfSelectionInfo(null);
          window.getSelection()?.removeAllRanges();
          clearActiveSelectionHighlight();
          setActiveRange(null);
        }
        else if (activeFootnote) setActiveFootnote(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const container = contentContainerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
    }

    const attachIframeKeydown = () => {
      if (!contentContainerRef.current) return;
      const iframes = contentContainerRef.current.querySelectorAll('iframe');
      iframes.forEach((iframe) => {
        try {
          iframe.contentDocument?.removeEventListener('keydown', handleKeyDown);
          iframe.contentDocument?.addEventListener('keydown', handleKeyDown);
          iframe.contentWindow?.removeEventListener('keydown', handleKeyDown);
          iframe.contentWindow?.addEventListener('keydown', handleKeyDown);
        } catch {}
      });
    };

    attachIframeKeydown();
    const keyInterval = setInterval(attachIframeKeydown, 1000);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (container) {
        container.removeEventListener('keydown', handleKeyDown);
      }
      clearInterval(keyInterval);
      if (contentContainerRef.current) {
        const iframes = contentContainerRef.current.querySelectorAll('iframe');
        iframes.forEach((iframe) => {
          try {
            iframe.contentDocument?.removeEventListener('keydown', handleKeyDown);
            iframe.contentWindow?.removeEventListener('keydown', handleKeyDown);
          } catch {}
        });
      }
    };
  }, [
    readingPage,
    readerDirection,
    maxBookPages,
    viewMode,
    detectedFormat,
    viewType,
    bookDoc,
    handleNextPage,
    handlePrevPage,
    getEpubScrollElement,
    isDocumentPanelOpen,
    setIsDocumentPanelOpen,
    isSearchDrawerOpen,
    isKnowledgeDrawerOpen,
    isAnnotationsDrawerOpen,
    isTocOpen,
    isSettingsOpen,
    isPluginsModalOpen,
    selectedText,
    activeFootnote,
  ]);

  // Global Mouse Coordinate Tracking & Edge Hover Physics (Natural, Zero-Jitter Reveal)
  useEffect(() => {
    let lastMove = 0;
    const handleGlobalMouseMove = (e: MouseEvent) => {
      setIsIdle(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setIsIdle(true);
      }, 2500);

      const now = performance.now();
      if (now - lastMove < 25) return; // throttle ~40fps
      lastMove = now;

      const y = e.clientY;
      const windowHeight = window.innerHeight;

      // 1. Top Bar Trigger (clientY <= 44px). Keep open while <= 88px or hovering directly inside.
      if (y <= 44) {
        if (topHideTimerRef.current) {
          clearTimeout(topHideTimerRef.current);
          topHideTimerRef.current = null;
        }
        setIsTopBarVisible(true);
      } else if (y > 88) {
        isTopBarHoveredRef.current = false;
        if (!topHideTimerRef.current) {
          topHideTimerRef.current = setTimeout(() => {
            setIsTopBarVisible(false);
            topHideTimerRef.current = null;
          }, 250);
        }
      } else {
        if (topHideTimerRef.current) {
          clearTimeout(topHideTimerRef.current);
          topHideTimerRef.current = null;
        }
      }

      // 2. Bottom Scrubber Trigger (dist <= 44px). Keep open while <= 88px or hovering inside.
      const distFromBottom = windowHeight - y;
      if (distFromBottom <= 44) {
        if (bottomHideTimerRef.current) {
          clearTimeout(bottomHideTimerRef.current);
          bottomHideTimerRef.current = null;
        }
        setIsBottomBarVisible(true);
      } else if (distFromBottom > 88 && !isBottomBarHoveredRef.current) {
        if (!bottomHideTimerRef.current) {
          bottomHideTimerRef.current = setTimeout(() => {
            setIsBottomBarVisible(false);
            bottomHideTimerRef.current = null;
          }, 250);
        }
      } else {
        if (bottomHideTimerRef.current) {
          clearTimeout(bottomHideTimerRef.current);
          bottomHideTimerRef.current = null;
        }
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
    idleTimerRef.current = setTimeout(() => {
      setIsIdle(true);
    }, 2500);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (topHideTimerRef.current) clearTimeout(topHideTimerRef.current);
      if (bottomHideTimerRef.current) clearTimeout(bottomHideTimerRef.current);
    };
  }, []);

  // Viewport Click / Tap Toggle (when clicking empty book canvas)
  const handleViewportClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('textarea') ||
      target.closest('a') ||
      target.closest('[role="toolbar"]') ||
      target.closest('[role="dialog"]') ||
      target.closest('[role="complementary"]') ||
      target.closest('[role="tooltip"]') ||
      window.getSelection()?.toString().trim()
    ) {
      return;
    }
    // Dismiss active selection if clicking empty viewport canvas
    if (selectedText) {
      setSelectedText('');
      setPdfSelectionInfo(null);
      window.getSelection()?.removeAllRanges();
      clearActiveSelectionHighlight();
      setActiveRange(null);
      return;
    }
    setIsTopBarVisible((prev) => !prev);
    setIsBottomBarVisible((prev) => !prev);
  };

  // Resolves and navigates internal EPUB anchors, chapters, and footnotes without browser URL reloads
  const navigateToInternalEpubHref = useCallback(
    (rawHref: string, anchorEl?: HTMLElement, clickEvent?: MouseEvent | React.MouseEvent) => {
      if (!rawHref) return;

      // 1. Direct page references e.g. #page=12
      if (rawHref.includes('#page=')) {
        const match = rawHref.match(/#page=(\d+)/);
        if (match) {
          const target = parseInt(match[1], 10);
          if (!isNaN(target)) {
            setPreviousJumpPage(readingPage);
            setReadingPage(Math.min(maxBookPages, Math.max(1, target)));
            return;
          }
        }
      }

      // 2. Pure anchor fragment e.g. #fn1, #footnote-1, #ref1
      if (rawHref.startsWith('#')) {
        const targetId = rawHref.replace(/^#/, '');
        if (!targetId) return;

        // Check if target element exists on current rendered page
        if (contentContainerRef.current) {
          try {
            const targetEl = contentContainerRef.current.querySelector(
              `#${CSS.escape(targetId)}, [name="${CSS.escape(targetId)}"]`
            ) as HTMLElement | null;

            if (targetEl) {
              const isFootnote =
                anchorEl?.matches('a[href^="#fn"], a[href^="#note"], a.footnote-ref, sup a, a[data-footnote]') ||
                anchorEl?.hasAttribute('data-footnote') ||
                rawHref.startsWith('#fn') ||
                rawHref.startsWith('#note');

              if (isFootnote && clickEvent) {
                const noteText =
                  targetEl.textContent?.trim() ||
                  anchorEl?.getAttribute('title') ||
                  anchorEl?.textContent?.trim() ||
                  '';
                if (noteText) {
                  setActiveFootnote({
                    index: anchorEl?.textContent?.trim() || '1',
                    text: noteText,
                    x: clickEvent.clientX,
                    y: clickEvent.clientY,
                  });
                }
              }

              targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return;
            }
          } catch {
            // ignore selector error
          }
        }

        // If not on current page, search in paginatedPages
        const targetPageObj = paginatedPages.find(
          (p) =>
            p.html.includes(`id="${targetId}"`) ||
            p.html.includes(`id='${targetId}'`) ||
            p.html.includes(`name="${targetId}"`) ||
            p.html.includes(`name='${targetId}'`)
        );

        if (targetPageObj) {
          setPreviousJumpPage(readingPage);
          setReadingPage(targetPageObj.pageNumber);
          setTimeout(() => {
            try {
              const el = contentContainerRef.current?.querySelector(
                `#${CSS.escape(targetId)}, [name="${CSS.escape(targetId)}"]`
              );
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch {}
          }, 120);
          return;
        }

        // Check tocPageMap
        const mappedPage = tocPageMap.get(rawHref) || tocPageMap.get(targetId);
        if (mappedPage) {
          setPreviousJumpPage(readingPage);
          setReadingPage(mappedPage);
          return;
        }

        return;
      }

      // 3. Cross-file / Chapter link e.g. chapter2.xhtml#fn1, ../Text/ch01.xhtml
      const [filePart, hashPart] = rawHref.split('#');
      const cleanFileName = filePart.split('/').pop() || filePart;

      let targetPage =
        tocPageMap.get(rawHref) ||
        tocPageMap.get(filePart) ||
        tocPageMap.get(cleanFileName);

      if (!targetPage && hashPart) {
        const targetWithHash = paginatedPages.find(
          (p) =>
            (p.sectionId.includes(cleanFileName) || cleanFileName === '') &&
            (p.html.includes(`id="${hashPart}"`) ||
              p.html.includes(`id='${hashPart}'`) ||
              p.html.includes(`name="${hashPart}"`) ||
              p.html.includes(`name='${hashPart}'`))
        );
        if (targetWithHash) {
          targetPage = targetWithHash.pageNumber;
        }
      }

      if (!targetPage) {
        const targetSection = paginatedPages.find(
          (p) =>
            p.sectionId.includes(cleanFileName) ||
            cleanFileName.includes(p.sectionId) ||
            p.sectionId.endsWith(cleanFileName)
        );
        if (targetSection) {
          targetPage = targetSection.pageNumber;
        }
      }

      if (!targetPage && bookDoc?.resolveHref) {
        try {
          const resolved = bookDoc.resolveHref(rawHref);
          if (resolved && typeof resolved.index === 'number') {
            const pageForIndex = paginatedPages.find(
              (p) => p.sectionIndex === resolved.index
            );
            if (pageForIndex) {
              targetPage = pageForIndex.pageNumber;
            }
          }
        } catch {}
      }

      if (targetPage) {
        setPreviousJumpPage(readingPage);
        setReadingPage(Math.min(maxBookPages, Math.max(1, targetPage)));

        if (hashPart) {
          setTimeout(() => {
            try {
              const el = contentContainerRef.current?.querySelector(
                `#${CSS.escape(hashPart)}, [name="${CSS.escape(hashPart)}"]`
              );
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch {}
          }, 120);
        }
      }
    },
    [readingPage, maxBookPages, paginatedPages, tocPageMap, bookDoc]
  );

  // Content Click Interceptor for Footnotes & Links (React synthetic event fallback)
  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const anchor = target.closest('a[href], [xlink\\:href], a[data-footnote]') as HTMLElement | null;
    if (!anchor) return;

    e.preventDefault();
    e.stopPropagation();

    const rawHref = anchor.getAttribute('href') || anchor.getAttribute('xlink:href') || '';
    if (!rawHref) return;

    if (/^(https?:|mailto:|tel:)/i.test(rawHref)) {
      const winAPI = (window).electronAPI;
      if (winAPI?.openExternal) {
        winAPI.openExternal(rawHref);
      } else {
        window.open(rawHref, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    navigateToInternalEpubHref(rawHref, anchor, e);
  };

  // Capture-phase native click and auxclick listener attached to EPUB container
  // Guarantees zero 404 navigations against http://localhost:3000/... across all internal links
  useEffect(() => {
    const container = contentContainerRef.current;
    if (!container) return;

    const handleCaptureClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest('a[href], [xlink\\:href], a[data-footnote]') as HTMLElement | null;
      if (!anchor) return;

      event.preventDefault();
      event.stopPropagation();

      const rawHref = anchor.getAttribute('href') || anchor.getAttribute('xlink:href') || '';
      if (!rawHref) return;

      if (/^(https?:|mailto:|tel:)/i.test(rawHref)) {
        const winAPI = (window).electronAPI;
        if (winAPI?.openExternal) {
          winAPI.openExternal(rawHref);
        } else {
          window.open(rawHref, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      navigateToInternalEpubHref(rawHref, anchor, event);
    };

    const handleCaptureAuxClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('a[href], [xlink\\:href]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    container.addEventListener('click', handleCaptureClick, true);
    container.addEventListener('auxclick', handleCaptureAuxClick, true);

    return () => {
      container.removeEventListener('click', handleCaptureClick, true);
      container.removeEventListener('auxclick', handleCaptureAuxClick, true);
    };
  }, [navigateToInternalEpubHref]);

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

  // Load persistent OCR word corrections for the current page and source
  useEffect(() => {
    const currentPageResult = ocrPages.get(readingPage);
    if (!currentPageResult || !activeBook?.id || !window.electronAPI?.settings?.get) return;

    let mounted = true;
    (async () => {
      try {
        const effectiveKey = currentSourceId;
        if (!effectiveKey) return;

        const { corrections } = await resolveAndMigratePageCorrections({
          sourceId: effectiveKey,
          bookId: activeBook.id,
          sourcesCount,
          page: readingPage,
          getSetting: window.electronAPI.settings.get,
          setSetting: window.electronAPI.settings.set,
        });

        if (!mounted || Object.keys(corrections).length === 0) return;

        const { patchedResult, appliedCount } = applyStoredCorrections(currentPageResult, corrections, ocrEngine);
        if (appliedCount > 0 && mounted) {
          if (patchedResult.text !== currentPageResult.text) {
            setOcrPages((prev) => new Map(prev).set(readingPage, patchedResult));
            setExtractedPages((prev) => {
              const next = [...prev];
              while (next.length < readingPage) next.push('');
              next[readingPage - 1] = patchedResult.text;
              return next;
            });
          }
        }
      } catch (err) {
        console.warn('Failed to load persistent OCR corrections:', err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [activeBook?.id, currentSourceId, sourcesCount, readingPage, ocrPages, ocrEngine]);

  // Single-key markup shortcuts for the PDF workstation and EPUB reflowable reader: H keeps highlighter on, 1-5 pick a colour, ? lists shortcuts.
  useEffect(() => {
    if (!isPdfWorkstationActive && !isReflowable) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const action = readerShortcut(e, markupTool !== 'select');
      if (!action) return;
      if (action.kind === 'toggle-highlighter') toggleMarkupLock();
      else if (action.kind === 'stop-highlighter') stopMarkup();
      else if (action.kind === 'tool') {
        if (!isReflowable || action.tool === 'select' || action.tool === 'highlight' || action.tool === 'underline' || action.tool === 'strike' || action.tool === 'comment') {
          chooseMarkupTool(action.tool);
        }
      }
      else if (action.kind === 'color') setActiveHighlightColor(action.color);
      else setShowReaderShortcuts(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPdfWorkstationActive, isReflowable, markupTool, toggleMarkupLock, stopMarkup, chooseMarkupTool]);

  // The companion note pane links to the page being read.
  useCompanionContext('reader', () => activeBook ? { kind: 'book', target: bookStudyTarget(activeBook, Math.max(1, readingPage)), label: `${activeBook.title} (${Math.max(1, readingPage)})` } : null, [activeBook?.id, activeBook?.sourceId, activeBook?.title, readingPage]);

  // Global Ctrl+F / Cmd+F shortcut to open in-book search drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        handleToggleSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleSearch]);

  // Background SQLite FTS5 Indexing on Book Load (KEY-140)
  useEffect(() => {
    if (!activeBook?.id || searchableSections.length === 0) return;
    const windowAPI = typeof window !== 'undefined' ? (window).electronAPI : null;
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
    const windowAPI = (window).electronAPI?.cloudSync;
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
    let loadedBook: BookDoc | null = null;
    const fetchController = new AbortController();

    const loadDocumentPipeline = async () => {
      if (!activeBook?.filePath) {
        setAssetUrl(null);
        setPdfBlobUrl(null);
        setBookDoc(null);
        setExtractedFullText('');
        setExtractedPages([]);
        setExtractionFailed(false);
        setScannedInfo(null);
        return;
      }

      setPdfBlobUrl(null);
      setBookDoc(null);
      setExtractedFullText('');
      setExtractedPages([]);
      setPaginatedPages([]);
      setPdfTotalPages(1);
      setPdfToc([]);
      setPdfDocProxy(null);
      setIsLoadingFile(true);
      setIsExtractingText(true);
      setExtractionFailed(false);
      setScannedInfo(null);

      const filePath = activeBook.filePath;
      const format = detectFormat(filePath);
      setDetectedFormat(format);

      // Construct privileged streaming URL
      const streamUrl = `${readerAssetUrl(filePath)}?revision=${pdfSourceRevision}`;
      setAssetUrl(streamUrl);

      const windowAPI = (window).electronAPI;

      if (format === 'PDF') {
        setPdfBlobUrl(streamUrl);
        setViewType('native_pdf');
        setIsLoadingFile(false);
      } else try {
        // Fetch raw bytes for parser engine
        let bytes: Uint8Array | null = null;
        try {
          const res = await fetch(streamUrl, { signal: fetchController.signal });
          if (res.ok) {
            bytes = new Uint8Array(await res.arrayBuffer());
          }
        } catch (e) {
          if (isCancelled) return;
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
          // Open via DocumentLoader
          const loader = new DocumentLoader(bytes, filePath, {
            theme: readerTheme,
            languageHint: activeBook.language,
          });
          const { book } = await loader.open();
          loadedBook = book;
          if (isCancelled) {
            book.destroy?.();
            return;
          }

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
            } else {
              // Paginate reflowable EPUB/MOBI/FB2/HTML/TXT sections into screen-sized pages
              setIsPaginating(true);
              try {
                const { pages, tocMap } = await paginateBookSections(book.sections, book.toc, 1500, book.resolveHref);
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
      if (isCancelled) return;
      if (format === 'PDF' && windowAPI?.extractPdfText) {
        try {
          // Search and read-aloud use this text; the page itself never waits for it.
          await new Promise(resolve => setTimeout(resolve, PDF_TEXT_DELAY_MS));
          if (isCancelled) return;
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
      fetchController.abort();
      loadedBook?.destroy?.();
    };
  }, [activeBook?.filePath, pdfSourceRevision]);

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

  // Synchronize readingPage as user scrolls down the continuous EPUB vertical stream
  useEffect(() => {
    if (viewMode !== 'scrolled' || !isReflowable) return;

    const pageElements = document.querySelectorAll('.epub-stream-page');
    if (pageElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isPositioningEpubScrollRef.current) return;

        let bestPage = -1;
        let maxRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const p = parseInt(entry.target.getAttribute('data-page-number') || '0', 10);
            if (p > 0) bestPage = p;
          }
        }
        if (
          !isPositioningEpubScrollRef.current &&
          bestPage > 0 &&
          bestPage !== lastReportedEpubPageRef.current
        ) {
          lastReportedEpubPageRef.current = bestPage;
          setReadingPage(bestPage);
        }
      },
      {
        threshold: [0.1, 0.4, 0.7],
      }
    );

    pageElements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [viewMode, isReflowable, paginatedPages.length]);

  // When switching into scrolled mode, scroll directly to current readingPage and preserve position
  useEffect(() => {
    if (viewMode === 'scrolled' && isReflowable) {
      isPositioningEpubScrollRef.current = true;
      const targetPage = readingPage;
      lastReportedEpubPageRef.current = targetPage;

      const scrollToTargetPage = () => {
        const scrollEl = getEpubScrollElement(contentContainerRef.current) || contentContainerRef.current;
        const pageEl =
          document.getElementById(`epub-page-${targetPage}`) ||
          (contentContainerRef.current?.querySelector(
            `.epub-stream-page[data-page-number="${targetPage}"]`
          ) as HTMLElement | null);

        if (scrollEl && pageEl) {
          const scrollRect = scrollEl.getBoundingClientRect();
          const pageRect = pageEl.getBoundingClientRect();
          scrollEl.scrollBy({ top: pageRect.top - scrollRect.top });
          setTimeout(() => {
            isPositioningEpubScrollRef.current = false;
          }, 350);
        } else if (pageEl) {
          pageEl.scrollIntoView({ behavior: 'auto', block: 'start' });
          setTimeout(() => {
            isPositioningEpubScrollRef.current = false;
          }, 350);
        } else {
          requestAnimationFrame(() => {
            const retryPageEl = document.getElementById(`epub-page-${targetPage}`);
            if (scrollEl && retryPageEl) {
              const sRect = scrollEl.getBoundingClientRect();
              const pRect = retryPageEl.getBoundingClientRect();
              scrollEl.scrollTop += (pRect.top - sRect.top);
            }
            setTimeout(() => {
              isPositioningEpubScrollRef.current = false;
            }, 350);
          });
        }
      };

      requestAnimationFrame(scrollToTargetPage);
    }
  }, [viewMode, isReflowable, getEpubScrollElement]);

  // When readingPage changes externally while in EPUB scrolled mode (TOC, scrubber)
  useEffect(() => {
    if (viewMode === 'scrolled' && isReflowable && !isPositioningEpubScrollRef.current) {
      if (readingPage !== lastReportedEpubPageRef.current) {
        lastReportedEpubPageRef.current = readingPage;
        const scrollEl = getEpubScrollElement(contentContainerRef.current) || contentContainerRef.current;
        const pageEl = document.getElementById(`epub-page-${readingPage}`);
        if (scrollEl && pageEl) {
          const scrollRect = scrollEl.getBoundingClientRect();
          const pageRect = pageEl.getBoundingClientRect();
          scrollEl.scrollBy({ top: pageRect.top - scrollRect.top });
        }
      }
    }
  }, [readingPage, viewMode, isReflowable, getEpubScrollElement]);

  // Handle Comic Image Loaded to determine aspect ratio for wide spread
  const handleComicImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) {
      const ratio = naturalWidth / naturalHeight;
      setIsWideComicPage(ratio > 1.25);
    }
  };


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

  const narrationPageTexts = useMemo(() => {
    if (effectiveFormat === 'PDF' && extractedPages.length > 0) return extractedPages;
    if (paginatedPages.length > 0) return paginatedPages.map((page) => page.text);
    return activePageText ? [activePageText] : [];
  }, [activePageText, effectiveFormat, extractedPages, paginatedPages]);

  const narrationText = useMemo(() => narrationPageTexts.filter(Boolean).join('\n\n'), [narrationPageTexts]);
  const narrationSentencePages = useMemo(
    () => narrationPageTexts.flatMap((text, pageIndex) => segmentTextIntoSentences(text).map(() => pageIndex)),
    [narrationPageTexts]
  );

  const handleTtsSentenceChange = useCallback(
    (sentenceIndex: number) => {
      const targetPage = narrationSentencePages[sentenceIndex];
      if (typeof targetPage === 'number' && targetPage + 1 !== readingPage) {
        setReadingPage(targetPage + 1);
      }
    },
    [narrationSentencePages, readingPage, setReadingPage]
  );

  const handleTtsProviderNotice = useCallback((message: string, kind: TTSProviderNoticeKind = 'unavailable') => {
    console.warn('[baglib:tts]', message);
    const notices = {
      unavailable: t('ttsProviderUnavailable'),
      arabicUnsupported: t('ttsArabicFallback'),
      playbackFallback: t('ttsPlaybackFallback'),
    };
    setShowToast(notices[kind]);
  }, [t]);

  // TTS & Audiobook Playback Engine Hook (KEY-145)
  const ttsAudio = useTTSAudio({
    bookId: activeBook?.id,
    initialText: narrationText || activePageText,
    language:
      (typeof activeBook?.language === 'string' ? activeBook.language : undefined) ||
      (typeof bookDoc?.metadata?.language === 'string' ? bookDoc.metadata.language : undefined) ||
      'en',
    onSentenceChange: handleTtsSentenceChange,
    onProviderNotice: handleTtsProviderNotice,
  });

  const startReadAloud = (selection?: string) => {
    ttsAudio.stop();
    closeAllPanelsExcept();
    const sentences = narrationPageTexts.flatMap((text) => segmentTextIntoSentences(text).map((sentence) => sentence.text));
    const pageIndex = narrationPageTexts.length > 1 ? readingPage - 1 : 0;
    let startIndex = narrationSentencePages.findIndex((page) => page >= pageIndex);
    if (startIndex < 0) return;
    if (selection) {
      const normalizedSelection = selection.replace(/\s+/g, ' ').trim();
      const selectedIndex = sentences.findIndex((sentence, index) => index >= startIndex && narrationSentencePages[index] === pageIndex && sentence.includes(normalizedSelection));
      if (selectedIndex >= 0) startIndex = selectedIndex;
    }
    ttsAudio.setSentences(sentences);
    setIsTTSLyricsOpen(false);
    setIsTTSPlayerActive(true);
    ttsAudio.playSentence(startIndex);
  };

  const handleSaveBookAsPdf = async () => {
    if (!activeBook || isSavingPdf) return;
    setIsSavingPdf(true);
    setShowToast(t('readerSavePdfBusy'));
    try {
      const chapters = await Promise.all(chaptersFromPages(paginatedPages).map(async chapter => ({
        ...chapter,
        contentHtml: await inlineBlobImages(chapter.contentHtml),
      })));
      const saved = await window.electronAPI?.pdfExport?.saveBook({
        title: activeBook.title,
        author: activeBook.author,
        language: activeBook.language,
        direction: readerDirection,
        contentsLabel: t('tableOfContents'),
        chapters,
      });
      if (saved?.ok) setShowToast(t('readerSavePdfDone'));
      else if (saved?.error === 'cancelled') setShowToast(null);
      else setShowToast(t(saved?.error === 'engine-missing' ? 'clipPdfEngineMissing' : 'readerSavePdfFailed'));
    } catch (error) {
      console.warn('[baglib:reader] PDF export failed:', error);
      setShowToast(t('readerSavePdfFailed'));
    } finally {
      setIsSavingPdf(false);
    }
  };

  useEffect(() => {
    if (!showToast) return;
    const timer = setTimeout(() => setShowToast(null), 6000);
    return () => clearTimeout(timer);
  }, [showToast]);

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


  useEffect(() => {
    if (!activeBook?.id || !window.electronAPI?.getAnnotations) return;
    let alive = true;
    void window.electronAPI.getAnnotations(activeBook.id).then(data => { if (alive) setAnnotations(data || []); }).catch(console.warn);
    return () => { alive = false; };
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
        const api = (window).electronAPI;
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

  useEffect(() => {
    const container = contentContainerRef.current;
    const sentence = ttsAudio.sentences[ttsAudio.currentSentenceIndex];
    if (!container || !sentence || !ttsAudio.isPlaying) {
      clearActiveTtsHighlight();
      return;
    }
    const ranges = findRangesForText(container, sentence);
    setActiveTtsHighlight(ranges);
    const activeRange = ranges[0];
    activeRange?.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return () => clearActiveTtsHighlight();
  }, [activeFormattedPage, activePageText, currentSectionHtml, readingPage, ttsAudio.currentSentenceIndex, ttsAudio.isPlaying, ttsAudio.sentences]);

  // Save annotation to SQLite
  const handleSaveAnnotation = async (payload: AnnotationPayload): Promise<AnnotationDTO | undefined> => {
    if (!activeBook?.id) return;
    try {
      const api = (window).electronAPI;
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
      const api = (window).electronAPI;
      if (api?.deleteAnnotation) {
        if (knowledgeItems.some(item => item.id === id)) {
          await api.knowledge.delete(id, 'reader');
          setKnowledgeItems(previous => previous.filter(item => item.id !== id));
        } else await api.deleteAnnotation(id);
        setAnnotations((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.warn('[FullPageBookReader] Failed to delete annotation:', err);
    }
  };

  // Retain the consumed request across Strict Mode effect replay.
  const requestedLocation = useRef<{ book: typeof activeBook; page: number | null; cfi: string | null }>({ book: null, page: null, cfi: null });
  // Explicit links win over the saved work location, including same-work/source navigation.
  useEffect(() => {
    if (!activeBook?.id) return;
    if (requestedLocation.current.book !== activeBook) {
      requestedLocation.current = { book: activeBook, page: consumePendingPage(activeBook.id), cfi: consumePendingCfi(activeBook.id) };
    }
    if (requestedLocation.current.cfi) return;
    const linkedPage = requestedLocation.current.page;
    if (linkedPage) { setReadingPage(linkedPage); return; }
    let alive = true;
    void window.electronAPI?.reader?.getLastLocation(activeBook.id).then(loc => {
      const page = parseInt(loc || '', 10);
      if (alive && page > 0) setReadingPage(page);
    }).catch(console.warn);
    return () => { alive = false; };
  }, [activeBook, setReadingPage]);

  useEffect(() => {
    const cfi = requestedLocation.current.cfi;
    if (!cfi || !paginatedPages.length || isPaginating || isLoadingFile) return;
    const location = resolveStudyCfi(paginatedPages, cfi);
    if (!location) return;
    if (readingPage !== location.page) { setReadingPage(location.page); return; }
    const timer = setTimeout(() => {
      const root = contentContainerRef.current?.querySelector<HTMLElement>(`[data-study-epub-page="${location.page}"]`);
      if (root) { revealStudyRange(root, location.start, location.end); requestedLocation.current.cfi = null; }
    }, 150);
    return () => clearTimeout(timer);
  }, [activeBook, paginatedPages, isPaginating, isLoadingFile, readingPage, setReadingPage]);

  // Debounced continuous tracking of reading location (2000ms debounce)
  useEffect(() => {
    if (!activeBook?.id) return;
    const timer = setTimeout(() => {
      const api = (window).electronAPI;
      if (api?.reader?.updateLastLocation) {
        api.reader.updateLastLocation(activeBook.id, String(readingPage)).catch(console.warn);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [readingPage, activeBook?.id]);

  // Record Reading Session to SQLite on unmount or book switch
  const recordCurrentReadingSession = () => {
    if (!activeBook?.id) return;
    const api = (window).electronAPI;
    if (api?.reader?.recordSession) {
      const now = Date.now();
      const durationSeconds = Math.max(1, Math.round((now - sessionStartTimeRef.current) / 1000));
      const pagesRead = Math.abs(readingPage - startPageRef.current);
      api.reader
        .recordSession({
          workId: activeBook.id,
          startTime: sessionStartTimeRef.current,
          endTime: now,
          startLocation: String(startPageRef.current),
          endLocation: String(readingPage),
          durationSeconds,
          pagesRead,
        })
        .catch(console.warn);
    }
  };

  useEffect(() => {
    sessionStartTimeRef.current = Date.now();
    startPageRef.current = readingPage;
    return () => {
      recordCurrentReadingSession();
    };
  }, [activeBook?.id]);

  /**
   * ADR-012: marks are recorded in BagLib at once; the save policy decides when they are written into the PDF. A
   * completed action shows up as a new list of marks or new comment counts, which is what `changed()` listens to.
   */
  const fileSave = useMaterialSave(activeBook?.id ?? null, isPdfWorkstationActive);
  const initialMarksLoad = useRef(false);
  const seenThreadCounts = useRef<string | null>(null);
  const fileSaveChanged = fileSave.changed;
  useEffect(() => {
    if (initialMarksLoad.current) { initialMarksLoad.current = false; return; }
    fileSaveChanged();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new list of marks is the signal; the callback is stable per policy
  }, [knowledgeItems]);
  useEffect(() => {
    const key = JSON.stringify(markThreadCounts);
    if (seenThreadCounts.current !== null && seenThreadCounts.current !== key) fileSaveChanged();
    seenThreadCounts.current = key;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- as above
  }, [markThreadCounts]);
  const markWorkId = activeBook?.id;
  const reloadMarks = useCallback(async () => {
    if (!markWorkId) return;
    const [items, notes] = await Promise.all([window.electronAPI.knowledge.getByWork(markWorkId), window.electronAPI.getAnnotations?.(markWorkId)]);
    if (items) setKnowledgeItems(items);
    if (notes) setAnnotations(notes);
    refreshMarkCounts();
  }, [markWorkId, refreshMarkCounts]);
  // Ctrl+Z / Ctrl+Shift+Z undo and redo marks and notes, also after a restart. Typing fields keep their own undo.
  const historyRequestPending = useRef(false);
  useEffect(() => {
    if (!activeBook?.id) return;
    const workId = activeBook.id;
    const key = (event: KeyboardEvent) => {
      const action = markHistoryShortcut(event, !!document.querySelector('[role="dialog"],[role="alertdialog"],dialog[open]'));
      if (!action) return;
      event.preventDefault();
      if (historyRequestPending.current) return;
      historyRequestPending.current = true;
      const redo = action === 'redo';
      void (redo ? window.electronAPI.materialSave.redo(workId) : window.electronAPI.materialSave.undo(workId)).then(async result => {
        if (result.ok) {
          const [kind, operation, origin] = result.data.action.split('|');
          const kindKey = { highlight: 'historyKindHighlight', note: 'historyKindNote', question: 'historyKindQuestion', bookmark: 'historyKindBookmark', quote: 'historyKindQuote' } as const;
          const actionKey = { save: 'historyActionSave', trash: 'historyActionTrash', restore: 'historyActionRestore' } as const;
          setShowToast(t(redo ? 'historyRedoneDetail' : 'historyUndoneDetail', {
            kind: t(kindKey[kind as keyof typeof kindKey] || 'historyKindNote'),
            action: t(operation?.startsWith('comment') ? 'historyActionComment' : actionKey[operation as keyof typeof actionKey] || 'historyActionOther'),
            origin: t(origin === 'reader' ? 'historyOriginReader' : 'historyOriginNotes'),
          }));
        } else {
          setShowToast(t(result.error === 'nothing-to-redo' ? 'nothingToRedo' : result.error === 'nothing-to-undo' ? 'nothingToUndo' : result.error === 'history-unappliable' ? 'historyUnappliable' : 'studyActionFailed'));
        }
        setTimeout(() => setShowToast(null), 2000);
        if (result.ok) await reloadMarks();
      }).catch(error => { console.warn('[FullPageBookReader] Mark history failed:', error); setShowToast(t('studyActionFailed')); }).finally(() => { historyRequestPending.current = false; });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [activeBook?.id, reloadMarks, t]);
  // Closing with changes not yet written into the file asks first; closing without writing keeps them in BagLib.
  const [closePrompt, setClosePrompt] = useState<((choice: 'save' | 'discard' | 'cancel') => void) | null>(null);
  const [closeSaving, setCloseSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const askBeforeClosing = useCallback(async (): Promise<boolean> => {
    const current = await fileSave.refresh();
    if (!current?.pending || !current.writable || current.incident) return true;
    const choice = await new Promise<'save' | 'discard' | 'cancel'>(resolve => setClosePrompt(() => resolve));
    if (choice === 'save') {
      setCloseSaving(true);
      const saved = await fileSave.saveNow();
      setCloseSaving(false);
      setClosePrompt(null);
      return saved;
    }
    setClosePrompt(null);
    return choice === 'discard';
  }, [fileSave]);
  useEffect(() => isPdfWorkstationActive ? registerCloseGuard(askBeforeClosing) : undefined, [askBeforeClosing, isPdfWorkstationActive]);
  const handleCloseReader = () => {
    void askBeforeClosing().then(close => {
      if (!close) return;
      recordCurrentReadingSession();
      closeReaderToLibrary();
    });
  };

  // Load Knowledge Items from SQLite (KEY-12 / Epic 5)
  useEffect(() => {
    if (!activeBook?.id) return;
    const api = (window).electronAPI;
    if (api?.knowledge?.getByWork) {
      api.knowledge
        .getByWork(activeBook.id)
        .then((items: KnowledgeItemDTO[]) => {
          if (items) { initialMarksLoad.current = true; setKnowledgeItems(items); }
        })
        .catch(console.warn);
    }
  }, [activeBook?.id]);

  // Unified SQLite Knowledge Item Persistence (Supports PDF Normalized Rects & EPUB CFIs)
  const handleSaveKnowledge = async (
    type: KnowledgeType,
    color?: string,
    content?: string,
    contextNote?: string,
    textOverride?: string,
    pageOverride?: number,
    styleOverride?: 'underline' | 'strike',
  ) => {
    if (!activeBook?.id) return false;
    const safePage = Math.min(maxBookPages, Math.max(1, pageOverride ?? readingPage));
    const textToUse = textOverride ?? selectedText ?? '';
    const effectiveStyle = styleOverride || (markupTool === 'underline' || markupTool === 'strike' ? markupTool : undefined);

    // Determine location payload: EPUB CFI JSON or PDF normalized rects JSON or page string
    let locationToSave = String(safePage);
    const pdfSelection = pendingSelection || pdfSelectionInfo;
    if (isReflowable) {
      const sectionIdx = typeof activeFormattedPage?.sectionIndex === 'number'
        ? activeFormattedPage.sectionIndex
        : Math.max(0, safePage - 1);
      const sectionId = activeFormattedPage?.sectionId;
      const chapterLabel = activeFormattedPage?.chapterLabel;
      const cfi = buildEpubCfi(
        sectionIdx,
        activeRange?.startOffset ?? 0,
        activeRange?.endOffset,
        sectionId,
      );
      locationToSave = serializeEpubLocation({
        cfi,
        chapter: chapterLabel,
        sectionIndex: sectionIdx,
        sectionId,
        page: safePage,
        style: effectiveStyle,
        color: color || activeHighlightColor,
        text: textToUse || undefined,
      });
    } else if (type === 'highlight' && pdfSelection && pdfSelection.rects.length > 0) {
      locationToSave = JSON.stringify({
        page: pdfSelection.pageNumber,
        rects: pdfSelection.rects,
        text: textToUse || pdfSelection.text,
        color: color || activeHighlightColor,
        // Underline and strike-out are highlights drawn differently (Wave 9.1); a plain highlight stores no style.
        ...(effectiveStyle ? { style: effectiveStyle } : {}),
      });
    }

    try {
      const saved = await saveReaderKnowledge(window.electronAPI?.knowledge, {
        workId: activeBook.id,
        knowledgeType: type,
        location: locationToSave,
        quotedText: textToUse || undefined,
        noteContent: type === 'note' ? content : undefined,
        contextNote: type === 'quote' ? contextNote : undefined,
        questionText: type === 'question' ? content : undefined,
        label: type === 'bookmark' ? content : undefined,
        color: color || activeHighlightColor,
      });
      setKnowledgeItems(previous => [saved.item, ...previous.filter(item => item.id !== saved.item.id)]);
      const annotation = saved.annotation;
      if (annotation) {
        setAnnotations(previous => [annotation, ...previous.filter(item => item.id !== annotation.id)]);
      }
      window.dispatchEvent(new Event('baglib:notes-changed'));
    } catch (error) {
      console.warn('[FullPageBookReader] Save knowledge failed:', error);
      setShowToast(t('studyActionFailed'));
      return false;
    }

    setPendingSelection(null);
    setPdfSelectionInfo(null);
    window.getSelection()?.removeAllRanges();
    clearActiveSelectionHighlight();
    removeTempSelectionOverlay();
    setActiveRange(null);
    setSelectedText('');
    setShowToast(t(type === 'highlight' ? 'highlightSavedToast' : type === 'bookmark' ? 'bookmarkAdded' : 'knowledgeSavedToast', { page: safePage }));
    setTimeout(() => setShowToast(null), 2500);
    setTimeout(() => renderSavedEpubHighlights(), 50);
    return true;
  };

  const handleChangeHighlightColor = async (highlightId: string, newColor: string) => {
    const item = knowledgeItems.find((k) => k.id === highlightId);
    if (!item || !activeBook?.id) return;

    let updatedLocation = item.location;
    try {
      if (updatedLocation.startsWith('{')) {
        const parsed = JSON.parse(updatedLocation);
        parsed.color = newColor;
        updatedLocation = JSON.stringify(parsed);
      }
    } catch {
      // ignore
    }

    const payload = {
      ...item,
      color: newColor,
      location: updatedLocation,
    };

    const api = (window).electronAPI;
    if (api?.knowledge?.save) {
      try {
        const saved = await api.knowledge.save({ ...payload, actor: 'reader' });
        if (saved) {
          setKnowledgeItems((prev) => prev.map((k) => (k.id === highlightId ? saved : k)));
        }
      } catch (err) {
        console.warn('Failed to update highlight color:', err);
      }
    }
    setActiveHighlightPopover((prev) =>
      prev ? { ...prev, highlight: { ...prev.highlight, color: newColor, location: updatedLocation } } : null
    );
  };

  const handleSaveHighlightNote = async (highlightId: string, noteContent: string) => {
    const item = knowledgeItems.find((k) => k.id === highlightId);
    if (!item) return;

    const payload = {
      ...item,
      noteContent,
    };

    const api = (window).electronAPI;
    if (api?.knowledge?.save) {
      try {
        const saved = await api.knowledge.save(payload);
        if (saved) {
          setKnowledgeItems((prev) => prev.map((k) => (k.id === highlightId ? saved : k)));
        }
      } catch (err) {
        console.warn('Failed to save highlight note:', err);
      }
    }
    setActiveHighlightPopover((prev) =>
      prev ? { ...prev, highlight: { ...prev.highlight, noteContent } } : null
    );
  };

  const handleDeleteKnowledgeItem = async (id: string) => {
    const api = (window).electronAPI;
    if (api?.knowledge?.delete) {
      try {
        await api.knowledge.delete(id, 'reader');
        setKnowledgeItems((prev) => prev.filter((i) => i.id !== id));
      } catch (e) {
        console.warn('[FullPageBookReader] Delete knowledge failed:', e);
      }
    }
    await handleDeleteAnnotation(id);
    setActiveHighlightPopover(null);
  };

  const colorHexMap: Record<string, string> = useMemo(
    () => ({
      yellow: '#FACC15',
      amber: '#F59E0B',
      green: '#4ADE80',
      emerald: '#10B981',
      red: '#F87171',
      rose: '#F43F5E',
      blue: '#60A5FA',
      sky: '#0EA5E9',
      purple: '#C084FC',
      violet: '#8B5CF6',
    }),
    []
  );

  // Render Saved EPUB & Reflowable Highlights (supports epub.js rendition SVG fill + DOM/iframe marks)
  const renderSavedEpubHighlights = useCallback(() => {
    const container = contentContainerRef.current;
    if (!container) return;

    const allItems = [
      ...knowledgeItems.map(item => ({ ...item, locationCfiOrPage: item.location, selectedText: item.quotedText })),
      ...annotations.map(item => ({
        id: item.id, workId: item.bookId, knowledgeType: item.type === 'note' ? 'note' as const : 'highlight' as const, type: item.type,
        location: item.locationCfiOrPage, locationCfiOrPage: item.locationCfiOrPage,
        selectedText: item.selectedText || undefined, quotedText: item.selectedText || undefined,
        noteContent: item.noteContent || undefined, color: item.color || undefined, createdAt: item.createdAt, updatedAt: item.updatedAt,
      })),
    ];

    // 1. If using epub.js: apply SVG fill + fill-opacity attributes
    const rendition = (bookDoc)?.rendition;
    if (rendition && typeof rendition.annotations?.highlight === 'function') {
      allItems.forEach((item) => {
        const cfiRange = (item).location || (item).locationCfiOrPage;
        if (cfiRange && (cfiRange.startsWith('epubcfi(') || cfiRange.startsWith('cfi('))) {
          const colorKey = item.color || 'amber';
          const hex = colorHexMap[colorKey] || colorKey || '#FACC15';
          try {
            rendition.annotations?.remove(cfiRange, 'highlight');
          } catch {}
          try {
            rendition.annotations?.highlight(
              cfiRange,
              { id: item.id, color: colorKey },
              (e: MouseEvent) => {
                setActiveHighlightPopover({
                  highlight: { ...item, type: item.knowledgeType },
                  position: { x: e.clientX, y: e.clientY },
                });
              },
              `baglib-epub-highlight-${colorKey}`,
              {
                fill: hex,
                'fill-opacity': '0.38',
                'mix-blend-mode': 'multiply',
                'pointer-events': 'all',
                cursor: 'pointer',
              }
            );
          } catch {}
        }
      });
    }

    // 2. Direct DOM range / iframe rendering with <mark class="baglib-highlight ...">
    const rootsToProcess: HTMLElement[] = [container];
    const iframes = container.querySelectorAll('iframe');
    iframes.forEach((iframe) => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          injectHighlightStyles(doc);
          rootsToProcess.push(doc.body);
        }
      } catch {}
    });

    injectHighlightStyles(document);

    // Apply W3C CSS Custom Highlights
    rootsToProcess.forEach((root) => {
      try {
        registerCssCustomHighlights(root, allItems);
      } catch {}
    });

    // Directly paint text marks for saved highlights
    const highlightItems = allItems.filter(
      (item) =>
        (item.type === 'highlight' || (!item.type && item.knowledgeType === 'highlight')) &&
        ((item).selectedText || (item).quotedText)
    );

    rootsToProcess.forEach((root) => {
      // Clean previous marks cleanly without destroying text nodes
      const previousMarks = root.querySelectorAll('mark.baglib-highlight');
      previousMarks.forEach((mark) => {
        const parent = mark.parentNode;
        if (parent) {
          while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
          }
          parent.removeChild(mark);
          parent.normalize();
        }
      });

      // Wrap each matching text occurrence in visible colored mark
      highlightItems.forEach((item) => {
        const text = ((item).selectedText || (item).quotedText || '').trim();
        if (!text || text.length < 2) return;
        const color = item.color || 'amber';
        const hex = colorHexMap[color] || '#FACC15';

        let markStyle: 'highlight' | 'underline' | 'strike' = 'highlight';
        try {
          const loc = parseEpubLocation(item.location);
          if (loc?.style) markStyle = loc.style;
          else if (item.location?.startsWith('{')) {
            const p = JSON.parse(item.location);
            if (p.style) markStyle = p.style;
          }
        } catch {}

        const applyMarkProps = (mark: HTMLElement) => {
          mark.className = `baglib-highlight baglib-highlight-${color} baglib-mark-${markStyle}`;
          mark.setAttribute('data-highlight-id', item.id);
          mark.setAttribute('data-mark-id', item.id);
          mark.setAttribute('data-mark-style', markStyle);
          mark.style.color = 'inherit';
          mark.style.cursor = 'pointer';
          if (markStyle === 'underline') {
            mark.style.backgroundColor = 'transparent';
            mark.style.textDecoration = `underline 2px solid ${hex}`;
            mark.style.textUnderlineOffset = '3px';
          } else if (markStyle === 'strike') {
            mark.style.backgroundColor = 'transparent';
            mark.style.textDecoration = `line-through 2px solid ${hex}`;
          } else {
            mark.style.backgroundColor = `${hex}66`;
            mark.style.borderRadius = '2px';
            mark.style.padding = '1px 0';
          }

          mark.onclick = (e) => {
            e.stopPropagation();
            const knowledgeItem = knowledgeItems.find(k => k.id === item.id);
            setOpenMark({
              item: knowledgeItem || {
                id: item.id,
                workId: item.workId,
                knowledgeType: ((item as { knowledgeType?: KnowledgeType }).knowledgeType) || ((item as { type?: string }).type === 'note' ? 'note' : 'highlight'),
                location: item.location,
                quotedText: item.quotedText || ('selectedText' in item ? item.selectedText : undefined),
                noteContent: item.noteContent,
                contextNote: 'contextNote' in item ? (item.contextNote as string | undefined) : undefined,
                questionText: 'questionText' in item ? (item.questionText as string | undefined) : undefined,
                label: 'label' in item ? (item.label as string | undefined) : undefined,
                color: item.color,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
              },
              at: { x: e.clientX, y: e.clientY },
            });
          };
        };

        const ranges = findRangesForText(root, text);
        ranges.forEach((range) => {
          try {
            const mark = (root.ownerDocument || document).createElement('mark');
            applyMarkProps(mark);
            range.surroundContents(mark);
          } catch {
            try {
              const mark = (root.ownerDocument || document).createElement('mark');
              applyMarkProps(mark);
              const fragment = range.extractContents();
              mark.appendChild(fragment);
              range.insertNode(mark);
            } catch {}
          }
        });
      });
    });
  }, [bookDoc, knowledgeItems, annotations, colorHexMap]);

  useEffect(() => {
    renderSavedEpubHighlights();
  }, [
    renderSavedEpubHighlights,
    readingPage,
    activeFormattedPage,
    currentSectionHtml,
    viewMode,
    paginatedPages.length,
    knowledgeItems,
    annotations,
  ]);

  useEffect(() => {
    const rendition = (bookDoc)?.rendition;
    if (rendition && typeof rendition.on === 'function') {
      const onRendered = () => {
        renderSavedEpubHighlights();
      };
      rendition.on('rendered', onRendered);
      return () => {
        try {
          rendition.off?.('rendered', onRendered);
        } catch {}
      };
    }
  }, [bookDoc, renderSavedEpubHighlights]);

  // Bookmark current page status
  const isCurrentPageBookmarked =
    knowledgeItems.some((k) => k.type === 'bookmark' && parseInt(k.location, 10) === readingPage) ||
    annotations.some(
      (a) => a.type === 'bookmark' && parseInt(a.locationCfiOrPage, 10) === readingPage
    );

  const bookmarkedPageNumbers = useMemo(() => {
    const pages = new Set<number>();
    knowledgeItems.forEach((k) => {
      if (k.type === 'bookmark') {
        const p = parseInt(k.location, 10);
        if (!isNaN(p)) pages.add(p);
      }
    });
    annotations.forEach((a) => {
      if (a.type === 'bookmark') {
        const p = parseInt(a.locationCfiOrPage, 10);
        if (!isNaN(p)) pages.add(p);
      }
    });
    return Array.from(pages).sort((a, b) => a - b);
  }, [knowledgeItems, annotations]);

  const handleToggleBookmark = async () => {
    if (!activeBook) return;
    const existingKnowledge = knowledgeItems.find(
      (k) => k.type === 'bookmark' && parseInt(k.location, 10) === readingPage
    );
    if (existingKnowledge) {
      await handleDeleteKnowledgeItem(existingKnowledge.id);
      setShowToast(t('bookmarkRemoved', { page: readingPage }) || 'Bookmark removed');
      setTimeout(() => setShowToast(null), 2000);
      return;
    }
    const existingAnnotation = annotations.find(
      (a) => a.type === 'bookmark' && parseInt(a.locationCfiOrPage, 10) === readingPage
    );
    if (existingAnnotation) {
      await handleDeleteAnnotation(existingAnnotation.id);
      setShowToast(t('bookmarkRemoved', { page: readingPage }) || 'Bookmark removed');
      setTimeout(() => setShowToast(null), 2000);
      return;
    }

    await handleSaveKnowledge('bookmark', undefined, `${t('page')} ${readingPage}`);
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
    const windowAPI = (window).electronAPI;
    if (!windowAPI?.ocrRecognizePage) return;

    setIsOcrRunning(true);
    setShowToast(ocrEngine === 'paddleocr_vl' ? t('ocrCpuSlowHint') : t('ocrRunningText'));
    try {
      const res: OcrPageResult = await windowAPI.ocrRecognizePage({
        filePath: activeBook.filePath,
        pageNumber: pageToScan,
        language: ocrLanguage,
        engine: ocrEngine,
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
          res.fallbackReason
            ? ocrFallbackMessage(t, res.fallbackReason, res.missingPackages, res.requestedEngine)
            : `${t('ocrSuccessPage', { count: res.words?.length || res.text.split(/\s+/).length })} ${t('ocrRanWithEngine', { engine: ocrEngineName(t, res.engine) })}`
        );
        setTimeout(() => setShowToast(null), res.fallbackReason ? 8000 : 3000);
      } else {
        setShowToast(res?.fallbackReason ? ocrFallbackMessage(t, res.fallbackReason, res.missingPackages, res.requestedEngine) : t('ocrFailedText'));
        setTimeout(() => setShowToast(null), res?.fallbackReason ? 8000 : 2500);
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
    const windowAPI = (window).electronAPI;
    if (!windowAPI?.ocrRecognizeDocument) return;

    setIsOcrRunning(true);
    setOcrProgress({ current: 1, total: maxBookPages, words: 0 });

    try {
      const unsub = windowAPI.onOcrProgress?.((payload) => {
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
        engine: ocrEngine,
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
        const fallback = res.pages.find((p) => p.fallbackReason);
        setShowToast(
          fallback?.fallbackReason
            ? ocrFallbackMessage(t, fallback.fallbackReason, fallback.missingPackages, fallback.requestedEngine)
            : `${t('ocrSuccessBook', { pages: res.pages.length, words: totalWords })} ${t('ocrRanWithEngine', { engine: ocrEngineName(t, ocrEngine) })}`
        );
        setTimeout(() => setShowToast(null), fallback ? 8000 : 3500);
      } else {
        setShowToast(t('ocrFailedText'));
        setTimeout(() => setShowToast(null), 2500);
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

  // Keep-highlighter-on for PDFs: the viewer reports the selection, then it is saved in the chosen colour without the menu.
  useEffect(() => {
    if (!isInstantHighlightMode || !isPdfWorkstationActive || !pendingSelection?.rects?.length || !selectedText) return;
    // Saved on the next tick, outside the effect body, so the save's state updates do not cascade renders.
    const timer = setTimeout(() => { void handleSaveKnowledge('highlight', activeHighlightColor).then(saved => { if (saved) finishMarkup(); }); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstantHighlightMode, isPdfWorkstationActive, pendingSelection, selectedText]);

  // Handle Text Selection in Manuscript / Reflowable View (Supports Instant Mode & Standard Mode)
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const text = selection.toString().trim();
    if (!text) return;

    // 1. Capture and Lock Selection Range on mouseup
    const range = selection.getRangeAt(0).cloneRange();
    setActiveRange(range);
    setActiveSelectionHighlight(range);
    renderTempSelectionOverlay(range, contentContainerRef.current);

    if (isInstantHighlightMode) {
      void handleApplyHighlight(activeHighlightColor, text).then(() => {
        finishMarkup();
      });
    } else if (markupTool === 'comment') {
      void handleSaveKnowledge('note', activeHighlightColor, '', undefined, text, readingPage).then(saved => {
        if (saved) finishMarkup();
      });
    } else {
      setSelectedText(text);
    }
  };

  // Global mouseup listener to catch selection releases across container margins, padding, and iframes
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('[role="dialog"]') ||
        target?.closest('[role="toolbar"]') ||
        target?.closest('button') ||
        target?.closest('input') ||
        target?.closest('textarea')
      ) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

      if (contentContainerRef.current && contentContainerRef.current.contains(selection.anchorNode)) {
        // PDF text layers are handled by PdfNativeViewer's own locked overlay; avoid stacking a second one
        const anchorEl = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
        if (anchorEl?.closest('.textLayer')) return;
        const text = selection.toString().trim();
        if (text && text !== selectedText) {
          const range = selection.getRangeAt(0).cloneRange();
          setActiveRange(range);
          setActiveSelectionHighlight(range);
          renderTempSelectionOverlay(range, contentContainerRef.current);
          setSelectedText(text);
        }
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [selectedText]);

  // EPUB / Sub-document iframe text selection listener
  useEffect(() => {
    const container = contentContainerRef.current;
    if (!container) return;

    const handleIframeMouseUp = (e: MouseEvent) => {
      const targetDoc = e.currentTarget as Document;
      const selection = targetDoc.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const text = selection.toString().trim();
      if (!text) return;

      const range = selection.getRangeAt(0).cloneRange();
      setActiveRange(range);
      renderTempSelectionOverlay(range, targetDoc);
      setSelectedText(text);
    };

    const attachIframeSelection = () => {
      const iframes = container.querySelectorAll('iframe');
      iframes.forEach((iframe) => {
        try {
          iframe.contentDocument?.removeEventListener('mouseup', handleIframeMouseUp);
          iframe.contentDocument?.addEventListener('mouseup', handleIframeMouseUp);
        } catch {}
      });
    };

    attachIframeSelection();
    const interval = setInterval(attachIframeSelection, 1000);
    return () => {
      clearInterval(interval);
      const iframes = container.querySelectorAll('iframe');
      iframes.forEach((iframe) => {
        try {
          iframe.contentDocument?.removeEventListener('mouseup', handleIframeMouseUp);
        } catch {}
      });
    };
  }, []);

  const handleApplyHighlight = async (color = 'amber', customText?: string) => {
    const textToUse = customText || selectedText;
    if (!textToUse || !activeBook) return;
    const safePage = Math.min(maxBookPages, Math.max(1, noteTargetPage));

    if (!await handleSaveKnowledge('highlight', color, undefined, undefined, textToUse, safePage)) { setSelectedText(textToUse); return; }

    setPendingSelection(null);
    setPdfSelectionInfo(null);
    window.getSelection()?.removeAllRanges();
    clearActiveSelectionHighlight();
    removeTempSelectionOverlay();
    setActiveRange(null);
    setSelectedText('');
    setTimeout(() => renderSavedEpubHighlights(), 50);
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

    setPdfSelectionInfo(null);
    window.getSelection()?.removeAllRanges();
    clearActiveSelectionHighlight();
    setActiveRange(null);
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

  const handleCreateNoteFromSelection = async () => {
    if (!selectedText || !activeBook) return;
    const safePage = Math.min(maxBookPages, Math.max(1, noteTargetPage));
    if (!await handleSaveKnowledge('note', undefined, t('selectedQuote').replace('"{text}"', `"${selectedText}"`), undefined, selectedText, safePage)) return;
    setPdfSelectionInfo(null);
    window.getSelection()?.removeAllRanges();
    clearActiveSelectionHighlight();
    setActiveRange(null);
    setSelectedText('');
  };

  const handleAddManualNote = async () => {
    if (!newNoteText.trim() || !activeBook) return;
    const safePage = Math.min(maxBookPages, Math.max(1, noteTargetPage));
    const draft = newNoteText;
    if (!await handleSaveKnowledge('note', undefined, draft, undefined, selectedText, safePage)) return;
    setNewNoteText(current => current === draft ? '' : current);
    setPdfSelectionInfo(null);
    window.getSelection()?.removeAllRanges();
    clearActiveSelectionHighlight();
    setActiveRange(null);
    setSelectedText('');
  };

  const selectionCard = () => {
    if (!activeBook || (isReflowable && !activeRange)) throw new Error('invalid-selection');
    const page = pendingSelection?.pageNumber ?? pdfSelectionInfo?.pageNumber ?? readingPage;
    const epub = isReflowable && activeRange ? selectionStudyLocation(paginatedPages, activeRange, readingPage) : null;
    const target = epub ? bookCfiTarget(activeBook, epub.cfi) : bookStudyTarget(activeBook, page);
    const label = epub
      ? `${activeBook.title} — ${epub.chapter}`
      : t('readerStudyPage', { title: activeBook.title, page });
    return readerSelectionCard(selectedText, { target, label, workId: activeBook.id, language: workspaceLang });
  };
  const studySelection = async (action: 'explain' | 'practice' | 'review') => {
    if (reviewSaving.current) return;
    try {
      const input = selectionCard();
      if (action === 'explain') {
        setStudySource({ target: input.sourceRef!, label: input.sourceLabel!, text: input.front });
        return;
      }
      if (action === 'practice') {
        setStudyDraft(input);
        return;
      }
      reviewSaving.current = true;
      setReviewBusy(true);
      const card = await window.electronAPI.knowledgeCards.save(input);
      if (!await window.electronAPI.knowledgeCards.setMemorizing(card.id, true)) throw new Error('missing-card');
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
      setShowToast(t('readerStudySaved'));
      setTimeout(() => setShowToast(null), 3000);
    } catch {
      setShowToast(t('srsFailed'));
    } finally {
      reviewSaving.current = false;
      setReviewBusy(false);
    }
  };

  // Floating Zen Selection Menu (KEY-137 / KEY-12)
  const renderSelectionPopover = () => {
    if (!activeBook || !selectedText || isInstantHighlightMode) return null;
    return (
      <ZenSelectionMenu
        studyActions={<div role="group" aria-label={t('readerStudyActions')} className="flex flex-wrap gap-2 border-b border-subtle pb-2 mb-2" dir={workspaceDir}>
          {(['explain', 'practice', 'review'] as const).map(action => (
            <button
              key={action}
              autoFocus={action === 'explain'}
              type="button"
              data-reader-study={action}
              disabled={reviewBusy}
              onClick={() => void studySelection(action)}
              className="rounded-lg border border-subtle px-3 py-2 leading-loose hover:bg-canvas focus-visible:outline-2 focus-visible:outline-amber-500"
            >
              {t(action === 'explain' ? 'readerStudyExplain' : action === 'practice' ? 'readerStudyPractice' : 'readerStudyReviewLater')}
            </button>
          ))}
        </div>}
        selectedText={selectedText}
        readingPage={readingPage}
        bookTitle={activeBook.title}
        bookAuthor={activeBook.author}
        bookPublisher={activeBook.publisher}
        onApplyHighlight={(colorId) => handleSaveKnowledge('highlight', colorId)}
        onApplyUnderline={() => handleSaveKnowledge('highlight', activeHighlightColor, undefined, undefined, undefined, undefined, 'underline')}
        onApplyStrike={() => handleSaveKnowledge('highlight', activeHighlightColor, undefined, undefined, undefined, undefined, 'strike')}
        onSaveNote={(content) => handleSaveKnowledge('note', undefined, content)}
        onSaveQuote={(contextNote) =>
          handleSaveKnowledge('quote', undefined, undefined, contextNote)
        }
        onSaveQuestion={(questionText) =>
          handleSaveKnowledge('question', undefined, questionText)
        }
        onOpenKnowledgeCard={() => {
          const selection = window.getSelection();
          const bounds = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
          openKnowledgeCard({
            text: selectedText,
            context: { kind: 'book', ref: activeBook ? bookStudyTarget(activeBook, Math.max(1, readingPage)) : undefined, label: activeBook?.title, workId: activeBook?.id },
            x: bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2,
            y: bounds?.bottom ?? window.innerHeight / 3,
          });
        }}
        onOpenDictionary={() => {
          closeAllPanelsExcept();
          setDictionaryLookupWord(selectedText);
          setIsDictionaryModalOpen(true);
        }}
        onOpenAI={() => {
          closeAllPanelsExcept('ai');
          setAiSelectedText(selectedText);
          setAiInitialTool('contextual_dictionary');
          setIsAIDrawerOpen(true);
        }}
        onPlayTTS={() => {
          closeAllPanelsExcept();
          setIsTTSLyricsOpen(false);
          startReadAloud(selectedText);
          setIsTTSPlayerActive(true);
          setPdfSelectionInfo(null);
          window.getSelection()?.removeAllRanges();
          clearActiveSelectionHighlight();
          removeTempSelectionOverlay();
          setActiveRange(null);
          setSelectedText('');
        }}
        onClose={() => {
          setPdfSelectionInfo(null);
          window.getSelection()?.removeAllRanges();
          clearActiveSelectionHighlight();
          removeTempSelectionOverlay();
          setActiveRange(null);
          setSelectedText('');
        }}
        t={t}
      />
    );
  };

  // Jump to TOC chapter using paginator TOC map or explicit #page target
  const handleJumpToTOC = (item: TOCItem) => {
    let target = 1;
    if (item.href && item.href.includes('#page=')) {
      const match = item.href.match(/#page=(\d+)/);
      if (match) target = parseInt(match[1], 10);
    } else {
      target =
        tocPageMap.get(item.id) ||
        tocPageMap.get(item.href) ||
        (item.index >= 0 ? item.index + 1 : 1);
    }
    setPreviousJumpPage(readingPage);
    setReadingPage(Math.min(maxBookPages, Math.max(1, target)));
    if (!isTocPinned) {
      setIsTocOpen(false);
    }
  };


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

  const themeClasses: Record<ReaderTheme, string> = {
    paper: 'bg-[#fcfaf2] text-[#2b2b2b] border-[#e8e4d9]',
    sepia: 'bg-[#fbf0d9] text-[#5f4b32] border-[#e6d5b8]',
    dusk: 'bg-[#2d2a32] text-[#e0dede] border-[#3f3b47]',
    midnight: 'bg-[#0f172a] text-[#e2e8f0] border-[#1e293b]',
    light: 'bg-white text-slate-800 border-slate-200',
    dark: 'bg-[#0f172a] text-slate-100 border-slate-700',
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
            {t('notesForBook').replace('{title}', activeBook?.title || '')}
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
                  &quot;{note.highlightedText}&quot;
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

  const closeChromePanel = () => panels.close();
  const changeFocusMode = (focus: boolean) => {
    setFocusMode(focus);
    setIsTopBarVisible(false);
    setIsBottomBarVisible(false);
    if (focus) panels.close();
  };
  const renderChrome = (pdf?: Parameters<NonNullable<React.ComponentProps<typeof PdfWorkstationPanel>['renderReaderHeader']>>[0]) => {
    const currentPageOcr = ocrPages.get(readingPage);
    const hasOcrWords = !!currentPageOcr && ((currentPageOcr.words?.length ?? 0) > 0 || !!currentPageOcr.text);
    const hasText = Boolean(scannedInfo?.totalChars || extractedFullText?.trim());
    const ocrState: OcrStatusState = isOcrRunning ? 'running'
      : hasOcrWords ? 'done'
      : hasText ? 'text-layer'
      : scannedInfo ? 'no-text-layer' : 'checking';
    const words = currentPageOcr?.words || [];
    const scoredWords = words.filter(word => word.confidence !== undefined);
    const avgConfidence = scoredWords.length
      ? scoredWords.reduce((sum, word) => sum + word.confidence!, 0) / scoredWords.length * 100
      : undefined;
    const ocrChipInfo = getOcrStatusChipInfo(ocrState, {
      confidence: avgConfidence, wordCount: words.length,
      current: ocrProgress?.current, total: ocrProgress?.total,
    }, t);

    const ocrChip = effectiveFormat === 'PDF' ? (
      <span
        title={ocrChipInfo.tooltip}
        className="inline-flex cursor-pointer"
        data-reader-ocr-chip
        data-ocr-state={ocrChipInfo.state}
      >
        <Chip
          onSelect={() => { panels.close(); pdf?.openOcrTool?.(); }}
          label={
            <span className="flex items-center gap-1.5 font-medium text-[11px]">
              {ocrChipInfo.state === 'running' ? (
                <Loader2 className="size-3 animate-spin text-primary-text" />
              ) : ocrChipInfo.state === 'done' ? (
                <CheckCircle2 className="size-3 text-success" />
              ) : ocrChipInfo.state === 'no-text-layer' ? (
                <ScanText className="size-3 text-warning" />
              ) : (
                <FileText className="size-3 text-text-muted" />
              )}
              <span className="sr-only sm:not-sr-only">{ocrChipInfo.label}</span>
            </span>
          }
          className="cursor-pointer"
        />
      </span>
    ) : undefined;

    return (
      <ReaderHeader title={activeBook.title} author={activeBook.author} format={effectiveFormat} dir={workspaceDir}
        page={readingPage} total={maxBookPages} onPage={page => setReadingPage(page)}
        viewMode={pdf?.viewMode ?? viewMode} onViewMode={pdf?.onViewMode ?? setViewMode}
        zoom={pdf?.zoom ?? Math.round(readerFontSize / 18 * 100)}
        onZoom={pdf?.onZoom ?? (value => setReaderFontSize(Math.max(9, Math.min(54, Math.round(value * 18 / 100)))))}
        onFit={pdf?.onFit ?? (() => { setReaderFontSize(18); setMargin(28); })}
        onReflow={pdf?.onReflow ?? (effectiveFormat === 'PDF' ? () => setIsReflowModalOpen(true) : undefined)}
        onClose={handleCloseReader} onPanel={() => { pdf?.closeTools(); chrome.open ? panels.close() : chrome.select(chrome.tab); }} panelOpen={chrome.open}
        onSearch={() => { pdf?.closeTools(); chrome.select('search'); }}
        onTools={() => { panels.close(); pdf ? pdf.onTools() : handleToggleSettings(); }}
        onSave={pdf?.onSave} saveState={pdf?.saveState} saveLabel={pdf?.saveLabel} saveDisabled={pdf?.saveDisabled}
        focusMode={focusMode} onFocusMode={changeFocusMode} visible={pdf ? (!focusMode || isTopBarVisible) : (!focusMode && (isTopBarVisible || isSettingsOpen))}
        onMouseEnter={() => { isTopBarHoveredRef.current = true; }} onMouseLeave={() => { isTopBarHoveredRef.current = false; }}
        markupBar={<ReaderMarkupBar color={activeHighlightColor} onColor={setActiveHighlightColor} tool={markupTool} onTool={chooseMarkupTool}
          locked={markupLocked} onToggleLock={toggleMarkupLock} allowedTools={isReflowable ? ['select', 'highlight', 'underline', 'strike', 'comment'] : undefined}
          onShowShortcuts={() => setShowReaderShortcuts(true)} t={t} />}
        ocrChip={ocrChip}
        overflowItems={[
          ...(previousJumpPage !== null ? [{
            label: t('jumpToPreviousNotice', { page: previousJumpPage }),
            onClick: () => {
              setReadingPage(previousJumpPage);
              setPreviousJumpPage(null);
            },
          }] : []),
          ...(pdf?.overflowItems ?? []),
          { label: t('tableOfContents'), onClick: () => { pdf?.closeTools(); chrome.select('toc'); } },
          { label: t('readerPanelMarks'), onClick: () => { pdf?.closeTools(); chrome.select('knowledge'); } },
          { label: t('readerPanelNotes'), onClick: () => { pdf?.closeTools(); chrome.select('annotations'); } },
          { label: t('dictionaryLookupTitle'), onClick: () => { setDictionaryLookupWord(selectedText || ''); setIsDictionaryModalOpen(true); } },
          { label: t('aiAssistantTitle'), onClick: handleToggleAIDrawer },
          { label: t('pluginsTitle'), onClick: () => setIsPluginsModalOpen(true) },
          { label: t('typographySettings'), onClick: handleToggleSettings },
          { label: t('autoCropMargins'), onClick: () => setAutoCropMargins(previous => !previous) },
          ...(!pdf && effectiveFormat === 'PDF' ? [{ label: t('fitPage'), onClick: () => setPdfFitMode(previous => previous === 'Fit' ? 'FitH' : 'Fit') }] : []),
          { label: t(readerDirection === 'rtl' ? 'readingDirectionRtl' : 'readingDirectionLtr'), onClick: () => setReaderDirection(readerDirection === 'rtl' ? 'ltr' : 'rtl') },
          ...(!pdf ? [
            { label: t('ttsReadAloud'), onClick: () => startReadAloud() },
            { label: t(isAutoScrolling ? 'autoScrollPause' : 'autoScrollPlay'), onClick: handleToggleAutoScroll },
            { label: t('autoScrollSpeed') + ' ' + autoScrollSpeed, onClick: handleCycleAutoScrollSpeed },
            ...(paginatedPages.length ? [{ label: t('readerSavePdf'), disabled: isSavingPdf, onClick: () => { void handleSaveBookAsPdf(); } }] : []),
          ] : []),
        ]} t={t} />
    );
  };

  return (
    <div
      role="region"
      aria-label={t('a11yReaderLandmark') || 'Digital Book Reader'}
      data-reader-source={currentSourceId ?? undefined}
      data-reader-page={readingPage}
      data-reader-panel-open={chrome.open && !focusMode || undefined}
      data-reader-focus-mode={focusMode || undefined}
      dir={workspaceDir}
      onClick={handleViewportClick}
      className={`${chromeStyles.reader} fixed inset-y-0 start-0 z-50 h-screen overflow-hidden bg-canvas text-main font-sans select-none flex flex-col ${
        isIdle ? 'cursor-none' : 'cursor-auto'
      }`}
      style={{ ...(getViewportCssVariables({
        theme: readerTheme,
        fontSize: readerFontSize,
        lineSpacing,
        paragraphSpacing,
        margin,
        brightness,
        contrast,
        fontFamily: getFontFamilyStyle(),
      // The companion note pane, when open, takes the end edge; the reader ends where it starts.
      }) as React.CSSProperties), ...({ '--reader-panel-width': `${chrome.width}px` } as React.CSSProperties), insetInlineEnd: 'var(--companion-width, 0px)' }}
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

      {/* Floating Zen Top Bar */}
      {isDocumentPanelOpen && effectiveFormat === 'PDF' && legacyPdfWork === activeBook.id && <PdfWorkstationPanel key={activeBook.id} workId={activeBook.id} sourceId={currentSourceId ?? undefined} onClose={() => setIsDocumentPanelOpen(false)} />}
      {!isPdfWorkstationActive && renderChrome()}

      {/* Zen Corner Hotspots */}
      {!isPdfWorkstationActive && !focusMode && (
      <ZenCornerHotspots
        isCurrentPageBookmarked={isCurrentPageBookmarked}
        onToggleBookmark={handleToggleBookmark}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        readerDirection={readerDirection}
        canGoPrev={readingPage > 1}
        canGoNext={readingPage < maxBookPages}
        t={t}
      />
      )}

      <ReaderSidePanel open={chrome.open && !focusMode} tab={chrome.tab} onTab={chrome.select}
        onClose={closeChromePanel} width={chrome.width} onResize={chrome.resize} dir={workspaceDir} t={t}>
        {chrome.tab === 'toc' && (<ZenTocDrawer
          embedded
          isOpen={isTocOpen}
          isPinned={isTocPinned}
          onTogglePin={() => setIsTocPinned(!isTocPinned)}
          onClose={() => setIsTocOpen(false)}
          onMouseEnter={() => {
            isTopBarHoveredRef.current = true;
          }}
          onMouseLeave={() => {
            isTopBarHoveredRef.current = false;
          }}
          toc={pdfToc.length > 0 ? pdfToc : (bookDoc?.toc || [])}
          tocPageMap={tocPageMap}
          onJumpToTOC={handleJumpToTOC}
          readingPage={readingPage}
          totalPages={maxBookPages}
          bookmarkedPages={bookmarkedPageNumbers}
          onJumpToPage={(p) => {
            setPreviousJumpPage(readingPage);
            setReadingPage(p);
          }}
          t={t}
          pdfDoc={pdfDocProxy}
          paginatedPages={paginatedPages}
        />)}
        {chrome.tab === 'knowledge' && <PdfMarksList items={knowledgeItems} reviews={pdfReviews} isReflowable={isReflowable} t={t}
          onOpenMark={(item, at) => { refreshMarkCounts(); setOpenMark({ item, at }); }}
          onJump={(page, cfi) => {
            if (cfi && isReflowable) { try { (bookDoc?.rendition as { display?: (target: string) => void } | undefined)?.display?.(cfi); } catch {} }
            setPreviousJumpPage(readingPage); setReadingPage(Math.min(maxBookPages, Math.max(1, page)));
          }} />}
        {chrome.tab === 'annotations' && (<AnnotationsDrawer
          embedded
          isOpen={isAnnotationsDrawerOpen}
          onClose={() => setIsAnnotationsDrawerOpen(false)}
          annotations={annotations}
          currentPage={readingPage}
          bookTitle={activeBook.title}
          sourceId={currentSourceId ?? undefined}
          bookAuthor={activeBook.author}
          bookIsbn={activeBook.isbn}
          bookFormat={detectedFormat}
          activeBookInfo={activeBookInfo}
          allBooksWithNotes={allBooksWithNotes}
          onJumpToPage={(p) => setReadingPage(Math.min(maxBookPages, Math.max(1, p)))}
          onDeleteAnnotation={handleDeleteAnnotation}
          t={t}
          direction={readerDirection}
        />)}
        {chrome.tab === 'search' && (<InBookSearchDrawer
          embedded
          isOpen={isSearchDrawerOpen}
          onClose={() => setIsSearchDrawerOpen(false)}
          sections={searchableSections}
          currentPage={readingPage}
          onJumpToPage={(p) => setReadingPage(Math.min(maxBookPages, Math.max(1, p)))}
          t={t}
          direction={readerDirection}
        />)}
      </ReaderSidePanel>

      {/* Main Content Area */}
      <div
        data-reader-content
        className={`flex-1 flex min-w-0 min-h-0 relative overflow-hidden ${
          splitOrientation === 'horizontal' ? 'flex-col' : 'flex-row'
        }`}
      >
        {/* Slide-out Table of Contents (TOC) & Bookmarks Drawer */}


        {/* Inline Footnote / Classical Gloss Popover */}
        <ZenFootnotePopover
          footnote={activeFootnote}
          onClose={() => setActiveFootnote(null)}
          t={t}
        />

        {/* Slide-out Annotations & Highlights Drawer (KEY-137 / KEY-138) */}


        {/* Slide-out In-Book Full-Text Search Drawer (KEY-140) */}


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

        {/* Layout & OCR Inspector Drawer */}
        <OcrInspectorDrawer
          isOpen={isOcrMenuOpen}
          onClose={() => {
            setIsOcrMenuOpen(false);
            setActiveOcrWordIndex(null);
          }}
          pageResult={ocrPages.get(readingPage) || null}
          readingPage={readingPage}
          sourceId={currentSourceId}
          bookId={currentSourceId ? activeBook?.id : undefined}
          sourcesCount={sourcesCount}
          isOcrRunning={isOcrRunning}
          onRunOcrPage={() => handleRunOcrPage(readingPage)}
          showBoundingBoxes={showOcrDebug}
          onToggleBoundingBoxes={() => setShowOcrDebug(prev => !prev)}
          activeWordIndex={activeOcrWordIndex}
          onSelectWord={(idx) => {
            setActiveOcrWordIndex(idx);
            if (idx !== null && !showOcrDebug) {
              setShowOcrDebug(true);
            }
          }}
          onUpdatePageResult={(updated) => {
            setOcrPages((prev) => new Map(prev).set(readingPage, updated));
            setExtractedPages((prev) => {
              const next = [...prev];
              while (next.length < readingPage) next.push('');
              next[readingPage - 1] = updated.text;
              return next;
            });
          }}
          engines={ocrEngines}
          selectedEngine={ocrEngine}
          onSelectEngine={selectOcrEngine}
          onEnginesChanged={refreshOcrEngines}
        />

        {/* PDF Accessibility Drawer */}
        <PdfAccessibilityDrawer
          isOpen={isAccessibilityDrawerOpen}
          onClose={() => {
            setIsAccessibilityDrawerOpen(false);
          }}
          filePath={activeBook?.filePath}
          workId={activeBook?.id}
          readingPage={readingPage}
          onOpenOcr={() => {
            setIsAccessibilityDrawerOpen(false);
            setIsOcrMenuOpen(true);
          }}
          onOpenReflow={() => {
            setIsReflowModalOpen(true);
          }}
          showReadingOrder={showReadingOrderOverlay}
          onToggleReadingOrder={(show, order, isTagged) => {
            setShowReadingOrderOverlay(show);
            if (order) setReadingOrderItems(order);
            if (isTagged !== undefined) setIsReadingOrderTagged(isTagged);
          }}
          onReportLoaded={(rep) => setA11yReport(rep.base)}
        />

        {/* PDF Reflow & Read-Aloud Modal */}
        <PdfReflowModal
          isOpen={isReflowModalOpen}
          onClose={() => setIsReflowModalOpen(false)}
          currentPage={readingPage}
          totalPages={maxBookPages}
          onPageChange={(p) => setReadingPage(p)}
          pageText={
            a11yReport?.pageTexts?.[String(readingPage)] ||
            extractedPages[readingPage - 1] ||
            ''
          }
          hasUnmappedGlyphs={
            Boolean(a11yReport?.pageHasUnmapped?.[String(readingPage)])
          }
          docTitle={activeBook?.title}
          defaultDirection={readerDirection}
        />

        {/* TTS & Audiobook Mini Player (KEY-145) */}
        {isTTSPlayerActive && (
          <TTSMiniPlayer
            aboveWorkstation={isPdfWorkstationActive}
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
          aboveWorkstation={isPdfWorkstationActive}
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
          <div className="absolute top-2 end-4 w-80 max-w-[calc(100%-2rem)] max-h-[calc(100%-1rem)] overflow-y-auto bg-surface/95 backdrop-blur-md border border-subtle rounded-2xl shadow-2xl z-30 p-4 space-y-4 animate-in fade-in zoom-in-95 duration-150">
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

            <label className="block space-y-1 text-xs">
              <span>{t('contrast')} · {contrast}%</span>
              <input type="range" min={50} max={150} value={contrast} onChange={event => setContrast(Number(event.target.value))} className="w-full accent-primary" />
            </label>
            <label className="block space-y-1 text-xs">
              <span>{t('paragraphSpacing')} · {paragraphSpacing}</span>
              <input type="range" min={0} max={2} step={0.1} value={paragraphSpacing} onChange={event => setParagraphSpacing(Number(event.target.value))} className="w-full accent-primary" />
            </label>

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
          onClick={handleContentClick}
          className={`flex-1 flex flex-col items-center justify-start relative w-full h-full select-text ${isPdfWorkstationActive ? 'p-0 overflow-hidden' : 'p-3 sm:p-6 overflow-y-auto'}`}
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
              onKeyUp={event => { if (event.shiftKey) handleMouseUp(); }}
              tabIndex={0}
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
                ) : viewMode === 'scrolled' ? (
                  /* Continuous Vertical Stream of Pages / Sections (EPUB & Reflowable) */
                  <div className="epub-stream-container w-full flex flex-col items-center gap-10 py-4">
                    {paginatedPages.length > 0 ? (
                      paginatedPages.map((page, idx) => (
                        <div
                          key={`epub-stream-${idx}`}
                          id={`epub-page-${idx + 1}`}
                          data-page-number={idx + 1}
                          data-study-epub-page={idx + 1}
                          className="epub-stream-page w-full max-w-3xl pb-8 border-b border-subtle/30 prose prose-slate dark:prose-invert max-w-none break-words relative"
                          style={{ lineHeight: lineSpacing }}
                          dangerouslySetInnerHTML={{ __html: page.html }}
                        />
                      ))
                    ) : (
                      <div
                        dangerouslySetInnerHTML={{ __html: currentSectionHtml }}
                        className="prose prose-slate dark:prose-invert max-w-none break-words"
                        style={{ lineHeight: lineSpacing }}
                      />
                    )}
                  </div>
                ) : activeFormattedPage ? (
                  viewMode === 'two-column' && secondFormattedPage ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 w-full">
                      <div
                        data-study-epub-page={(readerDirection === 'rtl' ? secondFormattedPage : activeFormattedPage).pageNumber}
                        dangerouslySetInnerHTML={{
                          __html: (readerDirection === 'rtl' ? secondFormattedPage : activeFormattedPage).html,
                        }}
                        className="prose prose-slate dark:prose-invert max-w-none break-words"
                        style={{ lineHeight: lineSpacing }}
                      />
                      <div
                        data-study-epub-page={(readerDirection === 'rtl' ? activeFormattedPage : secondFormattedPage).pageNumber}
                        dangerouslySetInnerHTML={{
                          __html: (readerDirection === 'rtl' ? activeFormattedPage : secondFormattedPage).html,
                        }}
                        className="prose prose-slate dark:prose-invert max-w-none break-words md:border-s md:ps-8 md:border-subtle/40"
                        style={{ lineHeight: lineSpacing }}
                      />
                    </div>
                  ) : (
                    <div
                      data-study-epub-page={activeFormattedPage.pageNumber}
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
                  <span data-epub-marks-status className="text-[11px] text-muted ms-2 italic">
                    • {t('epubMarksKeptInBaglib')}
                  </span>
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
            /* NATIVE PRIVILEGED ASSET STREAMING PDF VIEW VIA PDFJS-DIST */
            <div
              className={`pdf-viewer-workspace w-full h-full relative flex flex-col justify-center items-center overflow-hidden ${isPdfWorkstationActive ? '' : 'bg-surface border border-subtle rounded-2xl shadow-2xl'}`}
              dir="ltr"
              style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
            >
              {isLoadingFile || (!pdfBlobUrl && effectiveFormat === 'PDF' && activeBook?.filePath) ? (
                <div className="w-full h-full bg-surface flex flex-col items-center justify-center text-muted gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-pale-sky-500" />
                  <span className="text-xs font-bold">{t('loadingNativePdf')}</span>
                </div>
              ) : effectiveFormat === 'PDF' && legacyPdfWork !== activeBook.id ? (
                <PdfMarkupProvider value={{
                  tool: markupTool,
                  color: activeHighlightColor,
                  threadCounts: markThreadCounts,
                  labels: { pin: t('markupToolComment'), textBox: t('markupToolText'), drawHint: t(markupTool === 'comment' ? 'markupCommentHint' : 'markupDrawHint') },
                  onCreate: (mark: ShapeMark) => {
                    if (!activeBook?.id) return;
                    let noteContent = '';
                    if (mark.shape === 'stamp') {
                      const stamp = STAMPS.find(entry => entry.id === mark.stampId);
                      if (!stamp || !mark.language) return;
                      noteContent = translations[mark.language][stamp.label];
                    }
                    if (mark.measurement) noteContent = measurementLabel(mark, mark.measurement.language);
                    void window.electronAPI.knowledge.save({ actor: 'reader', workId: activeBook.id, type: 'note', location: shapeLocation(mark), noteContent }).then((saved: KnowledgeItemDTO) => {
                      setKnowledgeItems(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
                      // A text box and a comment pin open at once for their text; other shapes stay as drawn.
                      if (mark.shape === 'text' || mark.shape === 'pin') {
                        const page = document.querySelector(`[data-page-number="${mark.page}"]`)?.getBoundingClientRect();
                        setOpenMark({ item: saved, at: page ? { x: page.left + (page.width * mark.box.x) / 100, y: page.top + (page.height * mark.box.y) / 100 } : { x: 200, y: 200 } });
                      }
                      finishMarkup();
                    }, () => { setShowToast(t('studyActionFailed')); setTimeout(() => setShowToast(null), 2500); });
                  },
                  onOpen: (item, at) => { refreshMarkCounts(); setOpenMark({ item, at }); },
                }}>
                <PdfWorkstationPanel
                  key={`embedded-${activeBook.id}`}
                  embedded
                  renderReaderHeader={renderChrome}
                  focusMode={focusMode}
                  onReviewsChange={setPdfReviews}
                  workId={activeBook.id}
                  filePath={activeBook.filePath}
                  sourceId={currentSourceId ?? undefined}
                  fileUrl={pdfBlobUrl || undefined}
                  initialPage={readingPage}
                  onPageChange={setReadingPage}
                  onClose={handleCloseReader}
                  fileSave={{ state: fileSave.state, status: fileSave.status, notice: fileSave.notice, onSave: fileSave.saveNow, onClearNotice: fileSave.clearNotice, onExport: () => setExportOpen(true),
                    onRestore: () => { if (activeBook) void window.electronAPI.materialSave.restoreEmergency(activeBook.id).then(() => fileSave.refresh()); },
                    onKeep: () => { if (activeBook) void window.electronAPI.materialSave.resolveIncident(activeBook.id).then(() => fileSave.refresh()); } }}
                  readingActions={{ onReadAloud: () => startReadAloud(), onAutoScroll: handleToggleAutoScroll, autoScrolling: isAutoScrolling, onBookmark: () => { void handleToggleBookmark(); }, bookmarked: isCurrentPageBookmarked, onSearch: () => panels.setters['search'](true), onCompare: () => setCompareOpen(true) }}
                  markupBar={<ReaderMarkupBar
                    color={activeHighlightColor}
                    onColor={setActiveHighlightColor}
                    locked={markupLocked}
                    onToggleLock={toggleMarkupLock}
                    tool={markupTool}
                    onTool={chooseMarkupTool}
                    onShowShortcuts={() => setShowReaderShortcuts(true)}
                    t={t}
                  />}
                  readerIntegration={{
                    highlights: knowledgeItems,
                    activeSelectionInfo: pdfSelectionInfo,
                    onTotalPagesLoaded: setPdfTotalPages,
                    onOutlineLoaded: setPdfToc,
                    onPdfDocLoaded: setPdfDocProxy,
                    contentContainerRef,
                    autoCropMargins,
                    direction: readerDirection,
                    onSelectionChange: info => {
                      if (info) {
                        setPdfSelectionInfo(info);
                        setPendingSelection(info);
                        setSelectedText(info.text);
                        setNoteTargetPage(info.pageNumber);
                      } else if (!selectedText) {
                        setPdfSelectionInfo(null);
                        setPendingSelection(null);
                      }
                    },
                    onHighlightClick: (highlight, event) => {
                      setActiveHighlightPopover({ highlight, position: { x: event.clientX, y: event.clientY } });
                    },
                  }}
                  ocrIntegration={{
                    pageResult: ocrPages.get(readingPage) || null,
                    readingPage,
                    isOcrRunning,
                    progress: ocrProgress,
                    onRunOcrPage: () => handleRunOcrPage(readingPage),
                    onRunOcrDocument: handleRunOcrDocument,
                    showBoundingBoxes: showOcrDebug,
                    onToggleBoundingBoxes: () => setShowOcrDebug(prev => !prev),
                    onToggleInspector: () => {
                      setIsInkModeActive(false);
                      setIsOcrMenuOpen(prev => !prev);
                    },
                    engines: ocrEngines,
                    selectedEngine: ocrEngine,
                    onSelectEngine: selectOcrEngine,
                  }}
                />
                {ocrPages.get(readingPage) && (
                  <OcrPageOverlay pageNumber={readingPage}>
                    <OcrTextOverlay
                      pageResult={ocrPages.get(readingPage)!}
                      showVisualDebug={showOcrDebug}
                      activeWordIndex={activeOcrWordIndex}
                      onWordClick={(word, idx) => {
                        setActiveOcrWordIndex(idx);
                        if (!isOcrMenuOpen) setIsOcrMenuOpen(true);
                      }}
                    />
                  </OcrPageOverlay>
                )}
                {showReadingOrderOverlay && (
                  <PdfReadingOrderOverlay
                    pageNumber={readingPage}
                    items={readingOrderItems}
                    isTagged={isReadingOrderTagged}
                  />
                )}
                {closePrompt && <SaveCloseDialog title={activeBook.title} busy={closeSaving} t={t} onSave={() => closePrompt('save')} onDiscard={() => closePrompt('discard')} onCancel={() => closePrompt('cancel')} />}
                {exportOpen && <ExportPdfDialog workId={activeBook.id} pages={maxBookPages} t={t} lang={workspaceLang} dir={workspaceDir} onClose={() => setExportOpen(false)} />}
                {compareOpen && <PdfCompareDialog workId={activeBook.id} onClose={() => setCompareOpen(false)} onJump={page => setReadingPage(Math.min(maxBookPages, Math.max(1, page)))} />}
                </PdfMarkupProvider>
              ) : pdfBlobUrl ? (
                <div
                  className="pdf-viewport-container relative w-full h-full overflow-hidden flex items-center justify-center"
                  dir="ltr"
                  style={{ direction: 'ltr', unicodeBidi: 'normal' }}
                >
                  <PdfNativeViewer
                    fileUrl={pdfBlobUrl}
                    currentPage={readingPage}
                    totalPages={maxBookPages}
                    onPageChange={(p) => setReadingPage(p)}
                    onTotalPagesLoaded={(total) => {
                      setPdfTotalPages(total);
                    }}
                    onOutlineLoaded={(items) => {
                      setPdfToc(items);
                    }}
                    onPdfDocLoaded={(doc) => {
                      setPdfDocProxy(doc);
                    }}
                    viewMode={viewMode}
                    theme={readerTheme}
                    zoom={pdfFitMode === 'Fit' ? 1.0 : 1.25}
                    autoCropMargins={autoCropMargins}
                    direction={readerDirection}
                    highlights={knowledgeItems}
                    activeSelectionInfo={pdfSelectionInfo}
                    onSelectionChange={(info) => {
                      if (info) {
                        setPdfSelectionInfo(info);
                        setPendingSelection(info);
                        setSelectedText(info.text);
                        setNoteTargetPage(info.pageNumber);
                      } else {
                        // Crucial: keep selection snapshot so clicking floating color button does not lose anchor
                        if (!selectedText) {
                          setPdfSelectionInfo(null);
                          setPendingSelection(null);
                        }
                      }
                    }}
                    onHighlightClick={(highlight, e) => {
                      setActiveHighlightPopover({
                        highlight,
                        position: { x: e.clientX, y: e.clientY },
                      });
                    }}
                    contentContainerRef={contentContainerRef}
                  />
                  {ocrPages.get(readingPage) && (
                    <OcrTextOverlay
                      pageResult={ocrPages.get(readingPage)!}
                      showVisualDebug={showOcrDebug}
                      activeWordIndex={activeOcrWordIndex}
                      onWordClick={(word, idx) => {
                        setActiveOcrWordIndex(idx);
                        if (!isOcrMenuOpen) setIsOcrMenuOpen(true);
                      }}
                    />
                  )}
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
        {splitOrientation !== 'none' && !isPdfWorkstationActive && renderNotesPanel()}
      </div>

      {/* Floating Selection Action Pill */}
      {renderSelectionPopover()}
      {studySource && <StudyAssistant readerSource={studySource} notes={[]} initialNotes={[]} onClose={() => setStudySource(null)} />}
      {studyDraft && <div className="fixed inset-0 z-[90] bg-black/40 p-3 flex items-center justify-center" onClick={() => setStudyDraft(null)}>
        <section role="dialog" aria-modal="true" aria-label={t('readerStudyPractice')} dir={workspaceDir} data-reader-study-editor className="w-full max-w-xl max-h-full overflow-y-auto rounded-xl bg-surface text-main p-4" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setStudyDraft(null); } }}>
          <button autoFocus type="button" className="mb-3 rounded-lg border border-subtle p-2" onClick={() => setStudyDraft(null)}>{t('close')}</button>
          <p dir="auto" className="mb-3 break-words leading-loose">{studyDraft.sourceLabel}</p>
          <QuestionCardEditor initial={studyDraft} onSaved={() => setStudyDraft(null)} />
        </section>
      </div>}
      {showReaderShortcuts && <ReaderShortcutSheet onClose={() => setShowReaderShortcuts(false)} t={t} />}

      {/* Existing Highlight Options Popover */}
      {activeHighlightPopover && (
        <HighlightActionPopover
          highlight={activeHighlightPopover.highlight}
          position={activeHighlightPopover.position}
          onChangeColor={handleChangeHighlightColor}
          onSaveNote={handleSaveHighlightNote}
          onDelete={handleDeleteKnowledgeItem}
          onClose={() => setActiveHighlightPopover(null)}
        />
      )}

      {/* Unified Mark Popover (PDF & EPUB: details, colors, notes, comments, threads, delete) */}
      {openMark && (
        <PdfMarkPopover
          key={openMark.item.id}
          item={openMark.item}
          at={openMark.at}
          t={t}
          onClose={() => {
            setOpenMark(null);
            refreshMarkCounts();
          }}
          onSaved={(saved) => {
            setKnowledgeItems((previous) => previous.map((item) => (item.id === saved.id ? saved : item)));
            setOpenMark((current) => (current ? { ...current, item: saved } : current));
            setTimeout(() => renderSavedEpubHighlights(), 50);
          }}
          onDeleted={(id) => {
            setKnowledgeItems((previous) => previous.filter((item) => item.id !== id));
            setOpenMark(null);
            setTimeout(() => renderSavedEpubHighlights(), 50);
          }}
          onThreadsChanged={refreshMarkCounts}
        />
      )}
    </div>
  );
};
