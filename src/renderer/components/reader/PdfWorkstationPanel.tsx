'use client';
import { readerEdge } from '../../../shared/reader-immersive';
import { PdfMarksList } from './PdfMarksList';
import { setReaderOverlay, type ReaderOverlay } from '../../../shared/reader-overlay';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  History,
  Bookmark,
  MessageSquare,
  Plus,
  Trash2,
  Save,
  Check,
  CornerDownRight,
  ExternalLink,
  FileText,
  Shield,
  Cpu,
  Folder,
  FolderInput,
  Search,
  Sun,
  Moon,
  Maximize2,
  Pin,
  Minimize2,
  ChevronFirst,
  ChevronLast,
  ShieldCheck,
  Eye,
  BookOpen,
  LayoutGrid,
  Highlighter,
  MoreHorizontal,
  FileDown,
  GitCompare,
} from 'lucide-react';
import type {
  PdfCapability,
  PdfJob,
  PdfSession,
  PdfOperation,
  PdfFeature,
  PdfInspection,
  PdfEditorAPI,
  PdfTextBlock,
  StirlingEngineInfo,
  StirlingProcessorTelemetry,
  PdfVersionItem,
  WatchedFolderSource,
} from '../../../shared/types/pdf-editor';
import type { PdfReview } from '../../../shared/types/pdf-collaboration';
import { useWorkspace } from '../context/WorkspaceContext';
import { outputAfterFailedJob } from '../../libs/reader/pdf-output-state';
import type { TranslationKey } from '../../translations';
import { PdfInlineEditor } from './PdfInlineEditor';
import { MarkupBarCompact } from './ReaderMarkupBar';
import { useOverflowLevel } from '../../hooks/useOverflowLevel';
import type { FileSaveState, SaveNotice } from '../../hooks/useMaterialSave';
import type { MaterialSaveStatus } from '../../../shared/material-save';
import { SaveIncidentBanner } from './FileSaveUi';
import { PdfNativeViewer } from './PdfNativeViewer';
import { PdfToolDirectory } from './PdfToolDirectory';
import { PdfWorkstationTools, type PdfCanvasUse, type StirlingWorkstationMode } from './PdfWorkstationTools';
import { StirlingToolsHub } from '../pdf-workstation/StirlingToolsHub';
import { PdfPageEditor, type PdfPageEditorHandle } from './PdfPageEditor';
import { PdfPageThumbnail } from './PdfPageThumbnail';
import type { PdfViewDocument } from '../../libs/reader/pdf-view-document';

const featureKeys: Record<PdfCapability['feature'], TranslationKey> = {
  preview: 'pdfSuitePreview',
  split: 'pdfSuiteSplit',
  'repair-metadata': 'pdfSuiteRepair',
  'verify-signatures': 'pdfSuiteVerifySignatures',
  inspect: 'pdfSuiteInspect',
  'export-html': 'pdfSuiteHtml',
  create: 'pdfSuiteCreate',
  'edit-content': 'pdfSuiteEdit',
  organize: 'pdfSuiteOrganize',
  ocr: 'pdfSuiteOcr',
  'export-docx': 'pdfSuiteDocx',
  'export-xlsx': 'pdfSuiteXlsx',
  'export-pptx': 'pdfSuitePptx',
  'export-markdown': 'stirlingExportMarkdown',
  'export-text': 'stirlingExportTxt',
  'export-csv': 'stirlingExportCsv',
  'scale-pages': 'stirlingScalePages',
  'multi-page-layout': 'stirlingMultiPageLayout',
  'pdf-to-single-page': 'stirlingSingleLongPage',
  'edit-toc': 'stirlingEditToc',
  sanitize: 'stirlingSanitize',
  watermark: 'stirlingWatermark',
  compress: 'stirlingCompress',
  'page-numbers': 'stirlingPageNumbering',
  'add-image': 'stirlingInsertImage',
  'unlock-forms': 'stirlingUnlockForms',
  'extract-images': 'stirlingExtractImages',
  redact: 'pdfSuiteRedact',
  encrypt: 'pdfSuiteEncrypt',
  validate: 'pdfSuiteValidate',
  sign: 'pdfSuiteSign',
  review: 'pdfSuiteReview',
  summarize: 'pdfSuiteSummary',
  cloud: 'pdfSuiteCloud',
  crop: 'stirlingCrop',
  'document-properties': 'stirlingDocProperties',
  'basic-info': 'stirlingBasicInfo',
  'convert-file-pdf': 'stirlingConvertFile',
};

const PDF_TYPE_LABELS: Record<string, TranslationKey> = { book: 'pdfTypeBook', research_paper: 'pdfTypeResearch', article: 'pdfTypeArticle', lecture: 'pdfTypeLecture' };

const MODE_TABS: { id: StirlingWorkstationMode; labelKey: TranslationKey; defaultTool: PdfFeature }[] = [
  { id: 'view', labelKey: 'stirlingModeView', defaultTool: 'inspect' },
  { id: 'organize', labelKey: 'stirlingModeOrganize', defaultTool: 'organize' },
  { id: 'edit', labelKey: 'stirlingModeEdit', defaultTool: 'edit-content' },
  { id: 'security', labelKey: 'stirlingModeSecurity', defaultTool: 'redact' },
  { id: 'convert', labelKey: 'stirlingModeConvert', defaultTool: 'export-docx' },
];

export function PdfWorkstationPanel({
  workId,
  sourceId,
  onClose,
  embedded = false,
  initialPage = 1,
  onPageChange,
  fileUrl,
  readerIntegration,
  readingActions,
  annotationPanel,
  markupBar,
  fileSave,
}: {
  workId?: string;
  sourceId?: string;
  onClose: () => void;
  embedded?: boolean;
  initialPage?: number;
  onPageChange?: (page: number) => void;
  fileUrl?: string;
  readingActions?: { onReadAloud: () => void; onAutoScroll: () => void; autoScrolling: boolean; onBookmark: () => void; bookmarked: boolean; onSearch?: () => void; onCompare?: () => void };
  annotationPanel?: { open: boolean; content: React.ReactNode; onToggle: () => void; onClose: () => void; count: number };
  markupBar?: React.ReactNode;
  /** ADR-012: writing BagLib's marks into this PDF, and the selective export. */
  fileSave?: { state: FileSaveState; status: MaterialSaveStatus | null; notice: SaveNotice; onSave: () => Promise<boolean>; onClearNotice: () => void; onExport: () => void; onRestore: () => void; onKeep: () => void };
  readerIntegration?: Pick<React.ComponentProps<typeof PdfNativeViewer>, 'highlights' | 'activeSelectionInfo' | 'onSelectionChange' | 'onHighlightClick' | 'onPdfDocLoaded' | 'onOutlineLoaded' | 'onTotalPagesLoaded' | 'contentContainerRef' | 'autoCropMargins' | 'direction'>;
}) {
  const { lang, dir, t, theme: appTheme, books, openBookForReading } = useWorkspace();
  const [immersive, setImmersive] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<ReaderOverlay>(null);
  useEffect(() => {
    if (activeOverlay && annotationPanel?.open) annotationPanel.onClose();
  }, [activeOverlay, annotationPanel]);
  const previousOverlay = useRef<ReaderOverlay>(null);
  const pageEditorRef = useRef<PdfPageEditorHandle>(null);
  const [organizerOpenedFor, setOrganizerOpenedFor] = useState<string | null>(null);
  const overlayTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (activeOverlay && !previousOverlay.current) {
      overlayTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } else if (!activeOverlay && previousOverlay.current) {
      if (overlayTrigger.current?.isConnected) overlayTrigger.current.focus();
      overlayTrigger.current = null;
    }
    previousOverlay.current = activeOverlay;
  }, [activeOverlay]);
  const [pinnedChrome, setPinnedChrome] = useState<string[]>([]);
  const [collapsedChrome, setCollapsedChrome] = useState<string[]>([]);
  const chromeLabels = { top: 'pdfChromeTop', rail: 'pdfChromeRail', library: 'pdfChromeLibrary', tools: 'pdfDirectoryTitle', bottom: 'pdfChromeBottom' } as const;
  const pinChrome = (zone: keyof typeof chromeLabels) => <div className="flex shrink-0 items-center"><button type="button" aria-pressed={pinnedChrome.includes(zone)} title={t(pinnedChrome.includes(zone) ? 'unpinDrawer' : 'pinDrawer')} aria-label={t(pinnedChrome.includes(zone) ? 'unpinDrawer' : 'pinDrawer')} onClick={() => setPinnedChrome(previous => previous.includes(zone) ? previous.filter(item => item !== zone) : [...previous, zone])} className="rounded-lg p-2 hover:bg-emerald-500/20"><Pin size={14} className={pinnedChrome.includes(zone) ? 'text-emerald-500' : ''} /></button><button type="button" aria-label={t('pdfChromeHide', { region: t(chromeLabels[zone]) })} title={t('pdfChromeHide', { region: t(chromeLabels[zone]) })} onClick={() => setCollapsedChrome(previous => [...previous.filter(item => item !== zone), zone])} className="rounded-lg p-1 hover:bg-emerald-500/20"><X size={12} /></button></div>;
  const workstationRoot = useRef<HTMLElement | null>(null);
  /**
   * How compact the header is: 0 shows everything; 1 moves the secondary actions into the More menu; 2 also shrinks the
   * markup bar to its current tool and palette; 3 also moves the PDF tools and Marks buttons into More and shortens the
   * saved pill. The header steps down only when its row overflows, and back up once the wider row (whose width was
   * recorded when it overflowed) fits again, so it never oscillates.
   */
  const headerRef = useRef<HTMLElement | null>(null);
  const headerDensity = useOverflowLevel(headerRef, 3);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const setRevealedEdge = useCallback((edge: string) => { workstationRoot.current?.setAttribute('data-revealed-edge', edge); }, []);
  const hideChromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'F11') { event.preventDefault(); setRevealedEdge(''); setImmersive(value => !value); }
      if (event.key === 'Escape') { setActiveOverlay(null); setImmersive(false); setHeaderMenuOpen(false); }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); if (hideChromeTimer.current) clearTimeout(hideChromeTimer.current); };
  }, [setRevealedEdge]);
  const initialLanguage = useRef(lang);
  const [session, setSession] = useState<PdfSession | null>(null);
  const [mode, setMode] = useState<StirlingWorkstationMode>('view');
  if (mode === 'organize' && session && organizerOpenedFor !== session.id) setOrganizerOpenedFor(session.id);
  const isToolsHubOpen = activeOverlay === 'hub';
  const quickToolsOpen = activeOverlay === 'quick-tools';
  const setIsToolsHubOpen = (open: boolean) => setActiveOverlay(current => setReaderOverlay(current, 'hub', open));
  const setQuickToolsOpen = (open: boolean) => setActiveOverlay(current => setReaderOverlay(current, 'quick-tools', open));
  const [quickToolsSearch, setQuickToolsSearch] = useState('');
  const [hubView, setHubView] = useState<'columns' | 'pipelines'>('columns');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const pageSearch = useRef<HTMLInputElement | null>(null);
  const [themeOverride, setWorkstationTheme] = useState<'dark' | 'light' | 'sepia' | null>(null);
  const workstationTheme = themeOverride || appTheme;
  const [tintPdfPages, setTintPdfPages] = useState(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [activeRailTab, setActiveRailTab] = useState<'view' | 'organize' | 'edit' | 'security' | 'convert' | 'processor'>('view');
  const [fileFilter, setFileFilter] = useState('');
  const [processorTelemetry, setProcessorTelemetry] = useState<StirlingProcessorTelemetry>({
    activePipelines: 0,
    totalPipelines: 0,
    processedToday: 0,
    watchedFolders: 0,
  });
  const [watchedFoldersList, setWatchedFoldersList] = useState<WatchedFolderSource[]>([]);
  const [isPoliciesOpen, setIsPoliciesOpen] = useState(false);
  const [toolDirectoryOpen, setToolDirectoryOpen] = useState(true);
  const [engineStatus, setEngineStatus] = useState<StirlingEngineInfo>({ status: 'stopped', version: '3.2.2' });
  const [viewMode, setViewMode] = useState<'single' | 'double' | 'scroll'>('single');
  const [zoom, setZoom] = useState(100);
  const [inlineBlock, setInlineBlock] = useState<PdfTextBlock | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ xref: number; originalRect: number[] } | null>(null);
  const [imageCrop, setImageCrop] = useState('');
  const [sources, setSources] = useState<{ id: string; filename: string }[]>([]);
  const [capabilities, setCapabilities] = useState<PdfCapability[]>([]);
  const [job, setJob] = useState<PdfJob | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [starting, setStarting] = useState(false);
  const [tool, setTool] = useState<PdfFeature>(workId ? 'inspect' : 'create');
  const [inspection, setInspection] = useState<PdfInspection | null>(null);
  const [preview, setPreview] = useState<{ page: number; image: string; width: number; height: number } | null>(null);
  const [output, setOutput] = useState<PdfJob | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [page, setPage] = useState(initialPage);
  const [nativeTotalPages, setNativeTotalPages] = useState(1);
  const [workingFileUrl, setWorkingFileUrl] = useState<string | null>(null);
  const displayFileUrl = workingFileUrl || fileUrl;
  const handleNativePageChange = useCallback((value: number) => {
    setPage(value);
    onPageChange?.(value);
  }, [onPageChange]);
  const handleNativePageCount = useCallback((total: number) => {
    setNativeTotalPages(total);
    setPage(current => Math.max(1, Math.min(total, current)));
    readerIntegration?.onTotalPagesLoaded?.(total);
  }, [readerIntegration?.onTotalPagesLoaded]);
  const nativeReading = Boolean(displayFileUrl);
  const [canvasUse, setCanvasUse] = useState<PdfCanvasUse>('none');
  const showPagePreview = Boolean(preview) && preview?.page === page && (canvasUse !== 'none' || !displayFileUrl);
  const [pdfDocument, setPdfDocument] = useState<PdfViewDocument | null>(null);
  const handlePdfDocument = useCallback((document: PdfViewDocument) => {
    setPdfDocument(document);
    readerIntegration?.onPdfDocLoaded?.(document);
  }, [readerIntegration?.onPdfDocLoaded]);
  const totalPages = inspection?.totalPages || nativeTotalPages;
  const [rect, setRect] = useState([36, 36, 400, 180]);
  const [boxPage, setBoxPage] = useState<number | null>(null);
  const handleCanvasUse = useCallback((value: PdfCanvasUse) => {
    setCanvasUse(value);
    if (value === 'none') setBoxPage(null);
  }, []);
  const [text, setText] = useState('');
  const openingPage = useRef(initialPage);
  const originalSession = useRef<string | null>(null);
  const [saveMode, setSaveMode] = useState<'copy' | 'overwrite' | 'edition' | 'new-work'>('copy');
  const effectiveSaveMode = (output?.outputs?.length || 0) > 1 && saveMode === 'overwrite' ? 'copy' : saveMode;
  const [title, setTitle] = useState('');
  const isVersionHistoryOpen = activeOverlay === 'versions';
  const setIsVersionHistoryOpen = (open: boolean) => setActiveOverlay(current => setReaderOverlay(current, 'versions', open));
  const [versions, setVersions] = useState<PdfVersionItem[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionActionMessage, setVersionActionMessage] = useState<string | null>(null);
  const [zone2Tab, setZone2Tab] = useState<'thumbnails' | 'bookmarks' | 'comments' | 'marks'>('thumbnails');
  const [comments, setComments] = useState<PdfReview[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentAuthor, setNewCommentAuthor] = useState('');
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [commentReplyText, setCommentReplyText] = useState('');
  const [quickSaveFeedback, setQuickSaveFeedback] = useState<string | null>(null);
  const extraSessions = useRef<string[]>([]);
  const drag = useRef<number[] | null>(null);
  const replacementJob = useRef<string | null>(null);
  const api = (): PdfEditorAPI => window.electronAPI.pdfEditor;
  const pdfBooks = React.useMemo(() => books.filter(book => /\.pdf$/iu.test(book.filePath || '')), [books]);
  const pdfTypeCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of pdfBooks) {
      const type = String(book.workType || 'other');
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return [...counts].sort((first, second) => second[1] - first[1]);
  }, [pdfBooks]);
  const recentPdfBooks = React.useMemo(() => pdfBooks
    .filter(book => book.id === workId || !typeFilter || String(book.workType || 'other') === typeFilter)
    .sort((first, second) => Number(second.id === workId) - Number(first.id === workId) || Number(Boolean(second.lastReadLocation)) - Number(Boolean(first.lastReadLocation)) || String(second.createdAt || '').localeCompare(String(first.createdAt || '')))
    .slice(0, 5), [pdfBooks, typeFilter, workId]);
  const signatureResult = (job?.result?.signature || (job?.operation === 'verify-signatures' ? job.result : null)) as {
    status: string;
    pendingFields?: string[];
    signatures?: { subject: string; fingerprint: string }[];
  } | null;
  const jobId = job?.id;
  const jobState = job?.state;
  const observedPage = useRef(initialPage);
  const pendingPage = useRef<number | null>(null);
  const mounted = useRef(false);
  const stagedOutputs = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Subscribe to engine status
  useEffect(() => {
    const editor = window.electronAPI?.pdfEditor;
    if (!editor) return;
    void editor.engineStatus?.().then(res => {
      if (res?.ok && res.data) setEngineStatus(res.data);
    });
    const unsub = editor.onEngineStatusChanged?.(info => {
      setEngineStatus(info);
    });
    return () => {
      unsub?.();
    };
  }, []);

  // Listen to source change for hot reloading
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const editor = window.electronAPI?.pdfEditor;
      try {
        const [telemetry, folders] = await Promise.all([editor?.getProcessorTelemetry?.(), editor?.getWatchedFolders?.()]);
        if (!alive) return;
        if (telemetry?.ok) setProcessorTelemetry(previous => JSON.stringify(previous) === JSON.stringify(telemetry.data) ? previous : telemetry.data);
        if (folders?.ok) setWatchedFoldersList(previous => JSON.stringify(previous) === JSON.stringify(folders.data) ? previous : folders.data);
      } catch {}
    };
    void refresh();
    const timer = isToolsHubOpen ? setInterval(() => { void refresh(); }, 5000) : undefined;
    return () => { alive = false; clearInterval(timer); };
  }, [isToolsHubOpen]);

  useEffect(() => {
    if (mode !== 'view' || isToolsHubOpen) void window.electronAPI?.pdfEditor?.warmEngine?.();
  }, [mode, isToolsHubOpen]);

  useEffect(() => {
    const editor = window.electronAPI?.pdfEditor;
    if (!editor?.onSourceChanged) return;
    let alive = true;
    const unsub = editor.onSourceChanged(changed => {
      if (changed.workId === workId || (session?.workId && changed.workId === session.workId)) {
        const changedWorkId = changed.workId || workId || session?.workId;
        if (!changedWorkId) return;
        setWorkingFileUrl(null);
        setOutput(null);
        setInspection(null);
        setPreview(null);
        setThumbnails({});
        void editor.open({ workId: changedWorkId, sourceId }).then(async result => {
          if (!alive) { if (result.ok) await editor.close(result.data.id); return; }
          if (result.ok) extraSessions.current.push(result.data.id);
          if (!result.ok) { setError(result.error); return; }
          const preview = !nativeReading ? await editor.start({ sessionId: result.data.id, operation: 'preview', payload: { page }, language: initialLanguage.current }) : null;
          if (!alive) return;
          setSession(result.data);
          if (preview?.ok) setJob(preview.data);
        }).catch(() => { if (alive) setError('storage'); });
      }
    });
    return () => { alive = false; unsub(); };
  }, [workId, sourceId, session, page, nativeReading]);

  useEffect(() => {
    if (nativeReading) {
      const timer = setTimeout(() => setPage(initialPage), 0);
      return () => clearTimeout(timer);
    }
    if (observedPage.current !== initialPage) {
      observedPage.current = initialPage;
      if (initialPage !== preview?.page) pendingPage.current = initialPage;
    }
    if (!embedded || !session || session.id !== originalSession.current || starting || jobState === 'running' || pendingPage.current === null)
      return;
    const requested = pendingPage.current;
    const timer = setTimeout(() => {
      pendingPage.current = null;
      setPage(requested);
      setStarting(true);
      void window.electronAPI.pdfEditor
        .start({ sessionId: session.id, operation: 'preview', payload: { page: requested }, language: initialLanguage.current })
        .then(result => {
          if (!mounted.current) return;
          if (result.ok) setJob(result.data);
          else setError(result.error);
        })
        .catch(() => {
          if (mounted.current) setError('storage');
        })
        .finally(() => {
          if (mounted.current) setStarting(false);
        });
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [initialPage, embedded, session, starting, jobState, preview?.page, nativeReading]);

  useEffect(() => {
    if (preview && preview.page === page && observedPage.current === initialPage && pendingPage.current === null && session?.id === originalSession.current)
      onPageChange?.(preview.page);
  }, [preview, page, initialPage, session?.id, onPageChange]);

  useEffect(() => {
    let alive = true;
    let opened: PdfSession | null = null;
    const editorApi = window.electronAPI?.pdfEditor;
    const timer = setTimeout(() => {
      if (!editorApi) {
        setError('unavailable');
        return;
      }
      void (async () => {
        void editorApi
          .capabilities()
          .then(features => {
            if (alive) setCapabilities(features);
          })
          .catch(() => {
            if (alive) setError('unavailable');
          });
        const result = await (workId ? editorApi.open({ workId, sourceId }) : editorApi.blankSession());
        if (result.ok === true) opened = result.data;
        if (!alive) {
          if (opened) await editorApi.close(opened.id);
          return;
        }
        if (result.ok === true) {
          originalSession.current = result.data.id;
          setSession(result.data);
          if (workId && !fileUrl) {
            setStarting(true);
            try {
              const initialPreview = await editorApi.start({
                sessionId: result.data.id,
                operation: 'preview',
                payload: { page: openingPage.current },
                language: initialLanguage.current,
              });
              if (!alive) return;
              if (initialPreview.ok === true) setJob(initialPreview.data);
              else setError(initialPreview.error);
            } finally {
              if (alive) setStarting(false);
            }
          }
        } else {
          setError(result.error);
          if (result.error === 'source-required' && workId) {
            const available = await editorApi.sources(workId);
            if (alive && available.ok === true) setSources(available.data);
          }
        }
      })().catch(() => {
        if (alive) setError('storage');
      });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
      if (opened) void editorApi?.close(opened.id);
      for (const id of extraSessions.current) void editorApi?.close(id);
      extraSessions.current = [];
    };
  }, [workId, sourceId]);

  useEffect(() => {
    if (!jobId || jobState !== 'running') return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await window.electronAPI.pdfEditor.status(jobId);
        if (!alive) return;
        if (result.ok === true) {
          setJob(result.data);
          if (result.data.state === 'running') timer = setTimeout(() => void poll(), 350);
          else if (result.data.state === 'completed') {
            if (replacementJob.current === result.data.id) {
              setInspection(null);
              setPreview(null);
              setThumbnails({});
              setInlineBlock(null);
              setSelectedImage(null);
              replacementJob.current = null;
            }
            if (result.data.inspection) setInspection(result.data.inspection);
            if (result.data.result?.image) setPreview(result.data.result as unknown as NonNullable<typeof preview>);
            if (result.data.outputs?.length) setOutput(result.data);
            if (result.data.previewUrl) {
              setWorkingFileUrl(result.data.previewUrl);
              setInspection(null);
              setPreview(null);
              setThumbnails({});
              setMode('view');
              setToolDirectoryOpen(true);
              if (result.data.operation === 'organize') setPage(1);
            }
            if (Array.isArray(result.data.result?.thumbnails))
              setThumbnails(prev => ({
                ...prev,
                ...Object.fromEntries(
                  (result.data.result!.thumbnails as { key?: string; page: number; image: string }[]).map(item => [item.key || item.page, item.image]),
                ),
              }));
          } else if (result.data.state === 'failed') {
            const failed = result.data;
            setOutput(current => outputAfterFailedJob(current, failed));
          }
        } else setError(result.error);
      } catch {
        if (alive) setError('storage');
      }
    };
    timer = setTimeout(() => void poll(), 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [jobId, jobState]);

  const start = async (operation: PdfOperation, payload?: Record<string, unknown>) => {
    if (operation === 'preview' && nativeReading && canvasUse === 'none') {
      const requestedPage = Math.max(1, Math.min(nativeTotalPages, Number(payload?.page) || page));
      setPage(requestedPage);
      onPageChange?.(requestedPage);
      return;
    }
    if (!session || starting || job?.state === 'running') return;
    setStarting(true);
    setError(null);
    setSaved(false);
    try {
      const result = await api().start({
        sessionId: session.id,
        operation,
        payload,
        language: lang,
        ...(password ? { password } : {}),
      });
      if (result.ok === true) {
        if (operation === 'edit-content' && Array.isArray(payload?.textReplacements)) replacementJob.current = result.data.id;
        setJob(result.data);
      } else setError(result.error);
    } catch {
      setError('storage');
    } finally {
      setStarting(false);
    }
  };

  // Tools that draw on the page get a page image in the background; the viewer stays on screen until it arrives.
  const requestPreview = useRef(start);
  const requestedPreview = useRef('');
  useEffect(() => { requestPreview.current = start; });
  useEffect(() => {
    if (canvasUse === 'none' || !session || starting || jobState === 'running') return;
    const key = `${session.sha256}:${displayFileUrl}:${page}`;
    if (preview?.page === page || requestedPreview.current === key) return;
    requestedPreview.current = key;
    void requestPreview.current('preview', { page });
  }, [canvasUse, session, starting, jobState, displayFileUrl, page, preview?.page]);

  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const area = event.currentTarget.getBoundingClientRect();
    return [((event.clientX - area.left) / area.width) * preview!.width, ((event.clientY - area.top) / area.height) * preview!.height];
  };

  const switchSource = (value: PdfSession) => {
    setWorkingFileUrl(value.previewUrl || null);
    extraSessions.current.push(value.id);
    setSession(value);
    setInspection(null);
    setPreview(null);
    setOutput(null);
    setPage(1);
    setError(null);
    setSaveMode('copy');
    setInlineBlock(null);
    setSelectedImage(null);
  };

  const loadVersions = async () => {
    if (!session?.id) return;
    setLoadingVersions(true);
    try {
      const res = await window.electronAPI.pdfEditor.listVersions(session.id);
      if (res?.ok && Array.isArray(res.data)) {
        setVersions(res.data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleUndo = async () => {
    if (!session || starting || job?.state === 'running') return;
    setStarting(true);
    try {
      const res = await window.electronAPI.pdfEditor.undoVersion(session.id);
      if (res?.ok && res.data.restored) {
        if (res.data.session) setSession(res.data.session);
        setWorkingFileUrl(res.data.session?.previewUrl || null);
        setOutput(null);
        setJob(null);
        setInspection(null);
        setPreview(null);
        setThumbnails({});
        setMode('view');
        setQuickSaveFeedback(t('pdfUndoSuccess'));
        setTimeout(() => setQuickSaveFeedback(null), 3500);
      } else {
        setError(res?.error || 'failure');
      }
    } catch {
      setError('storage');
    } finally {
      setStarting(false);
    }
  };

  const handleRestoreVersion = async (versionFilename: string) => {
    if (!session || starting || job?.state === 'running') return;
    setStarting(true);
    try {
      const res = await window.electronAPI.pdfEditor.restoreVersion(session.id, versionFilename);
      if (res?.ok && res.data.restored) {
        if (res.data.session) setSession(res.data.session);
        setWorkingFileUrl(res.data.session?.previewUrl || null);
        setOutput(null);
        setJob(null);
        setInspection(null);
        setPreview(null);
        setThumbnails({});
        setMode('view');
        setVersionActionMessage(t('pdfVersionRestored'));
        setTimeout(() => setVersionActionMessage(null), 3000);
        void loadVersions();
      } else {
        setError(res?.error || 'failure');
      }
    } catch {
      setError('storage');
    } finally {
      setStarting(false);
    }
  };

  const handleDeleteVersion = async (versionFilename: string) => {
    if (!session) return;
    try {
      const res = await window.electronAPI.pdfEditor.deleteVersion(session.id, versionFilename);
      if (res?.ok) {
        setVersionActionMessage(t('pdfVersionDeleted'));
        setTimeout(() => setVersionActionMessage(null), 3000);
        void loadVersions();
      }
    } catch {
      /* ignore */
    }
  };

  const loadComments = async () => {
    if (!session?.id) return;
    setLoadingComments(true);
    try {
      const res = await window.electronAPI.pdfCollaboration.reviews(session.id);
      if (res?.ok && Array.isArray(res.data)) {
        setComments(res.data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    if ((zone2Tab === 'comments' || zone2Tab === 'marks') && session?.id) {
      const timer = setTimeout(() => { void loadComments(); }, 0);
      return () => clearTimeout(timer);
    }
  }, [zone2Tab, session?.id]);

  const handleAddComment = async () => {
    if (!session?.id || !newCommentText.trim()) return;
    try {
      const res = await window.electronAPI.pdfCollaboration.saveReview(session.id, {
        page,
        rect,
        kind: 'sticky',
        author: newCommentAuthor.trim() || t('pdfCommentDefaultAuthor'),
        text: newCommentText.trim(),
        status: 'open',
      });
      if (res?.ok) {
        setNewCommentText('');
        void loadComments();
      }
    } catch {
      /* ignore */
    }
  };

  const handleClearAllComments = async () => {
    if (!session) return;
    void start('sanitize');
    setComments([]);
  };

  const handleLocateComment = (comment: PdfReview) => {
    setPage(comment.page);
    setRect(comment.rect || [36, 36, 400, 180]);
    if (!nativeReading) void start('preview', { page: comment.page });
    onPageChange?.(comment.page);
  };

  const handleReplyComment = async (comment: PdfReview) => {
    if (!commentReplyText.trim() || !session) return;
    try {
      const res = await window.electronAPI.pdfCollaboration.reply(
        session.id,
        comment.id,
        newCommentAuthor.trim() || t('pdfReplyDefaultAuthor'),
        commentReplyText.trim(),
        comment.updatedAt,
      );
      if (res?.ok) {
        setCommentReplyText('');
        setReplyingToCommentId(null);
        void loadComments();
      }
    } catch {
      /* ignore */
    }
  };

  const handleQuickSave = async () => {
    if (!session) return;
    if ((output?.outputs?.length || 0) > 1) {
      setSaveMode('copy');
      setCollapsedChrome(previous => previous.filter(zone => zone !== 'tools'));
      setRevealedEdge('end');
      setQuickSaveFeedback(t('pdfChooseSplitOutput'));
      requestAnimationFrame(() => {
        if (!mounted.current) return;
        stagedOutputs.current?.scrollIntoView({ block: 'nearest' });
        stagedOutputs.current?.querySelector<HTMLButtonElement>('button')?.focus();
      });
      return;
    }
    if (output?.outputs?.length) {
      try {
        const res = await api().save({
          jobId: output.id,
          outputIndex: 0,
          mode: session?.sha256 && output.outputs[0].format === 'pdf' ? 'overwrite' : 'copy',
        });
        if (res.ok) {
          setSaved(true);
          setOutput(null);
          setQuickSaveFeedback(t('pdfDocumentSaved'));
          setTimeout(() => setQuickSaveFeedback(null), 3000);
          if (res.data.session) setSession(res.data.session);
          if (fileSave) await fileSave.onSave();
        }
      } catch {
        setError('storage');
      }
    } else if (fileSave && fileSave.state !== 'saved') {
      const saved = await fileSave.onSave();
      if (saved) { setQuickSaveFeedback(t('saveStateSaved')); setTimeout(() => setQuickSaveFeedback(null), 2500); }
    } else {
      setQuickSaveFeedback(t('pdfDocumentUpToDate'));
      setTimeout(() => setQuickSaveFeedback(null), 2500);
    }
  };
  // Save problems (or a file changed outside BagLib) appear in the same feedback toast.
  const saveNoticeText = fileSave?.notice ? t(fileSave.notice) : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleQuickSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session, output, fileSave]);

  const toggleAnnotations = () => {
    if (!annotationPanel) return;
    setActiveOverlay(null);
    setCollapsedChrome(previous => previous.filter(region => region !== 'tools'));
    setRevealedEdge('end');
    annotationPanel.onToggle();
  };
  /** What the header row has no room for, at the current density, in the order of the row. */
  const headerMenuItems: { id: string; label: string; icon: React.ReactNode; checked?: boolean; disabled?: boolean }[] = [
    ...(headerDensity >= 3 ? [{ id: 'tools', label: t('pdfCompactToolsBtn'), icon: <Cpu size={14} /> }] : []),
    ...(headerDensity >= 3 && annotationPanel ? [{ id: 'marks', label: annotationPanel.count ? `${t('annotationsDrawerTitle')} (${annotationPanel.count})` : t('annotationsDrawerTitle'), icon: <MessageSquare size={14} />, checked: annotationPanel.open }] : []),
    ...(readingActions?.onCompare ? [{ id: 'compare', label: t('compareTitle'), icon: <GitCompare size={14} /> }] : []),
    ...(readingActions ? [
      { id: 'read-aloud', label: t('ttsReadAloud'), icon: <BookOpen size={14} /> },
      { id: 'auto-scroll', label: t('autoScrollPlay'), icon: <ChevronDown size={14} />, checked: readingActions.autoScrolling },
      { id: 'bookmark', label: t('addBookmarkBtn'), icon: <Bookmark size={14} />, checked: readingActions.bookmarked },
    ] : []),
    ...(fileSave ? [{ id: 'export', label: t('exportPdfMenu'), icon: <FileDown size={14} /> }] : []),
    { id: 'undo', label: t('pdfUndo'), icon: <RotateCcw size={14} />, disabled: !session || starting || job?.state === 'running' },
    { id: 'history', label: t('pdfVersionHistory'), icon: <History size={14} />, disabled: !session },
    { id: 'page-only', label: t('zenModePurePage'), icon: <Maximize2 size={14} />, checked: immersive },
    { id: 'pin-top', label: t('pdfPinTopBar'), icon: <Pin size={14} />, checked: pinnedChrome.includes('top') },
    { id: 'hide-top', label: t('pdfChromeHide', { region: t(chromeLabels.top) }), icon: <X size={14} /> },
  ];
  const runHeaderItem = (id: string) => {
    setHeaderMenuOpen(false);
    if (id === 'tools') setIsToolsHubOpen(true);
    else if (id === 'marks') toggleAnnotations();
    else if (id === 'compare') readingActions?.onCompare?.();
    else if (id === 'read-aloud') readingActions?.onReadAloud();
    else if (id === 'auto-scroll') readingActions?.onAutoScroll();
    else if (id === 'bookmark') readingActions?.onBookmark();
    else if (id === 'export') fileSave?.onExport();
    else if (id === 'undo') void handleUndo();
    else if (id === 'history') { setIsVersionHistoryOpen(true); void loadVersions(); }
    else if (id === 'page-only') { setRevealedEdge(''); setImmersive(value => !value); }
    else if (id === 'pin-top') setPinnedChrome(previous => previous.includes('top') ? previous.filter(item => item !== 'top') : [...previous, 'top']);
    else if (id === 'hide-top') setCollapsedChrome(previous => [...previous.filter(item => item !== 'top'), 'top']);
  };

  return (
    <aside
      role="region"
      aria-label={t('pdfSuiteTitle')}
      dir={dir}
      data-pdf-workstation
      data-reader-overlay={activeOverlay || undefined}
      data-workstation-theme={workstationTheme}
      data-immersive={immersive || undefined}
      data-pinned-chrome={pinnedChrome.join(' ')}
      data-collapsed-chrome={collapsedChrome.join(' ')}
      onPointerLeave={() => {
        if (hideChromeTimer.current) clearTimeout(hideChromeTimer.current);
        hideChromeTimer.current = setTimeout(() => setRevealedEdge(''), 400);
      }}
      ref={workstationRoot}
      onPointerMove={event => {
        if (!immersive) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const target = event.target as HTMLElement;
        if (target.closest('header, [data-pdf-bottom-navigation]') || target.closest('aside') !== event.currentTarget) {
          if (hideChromeTimer.current) clearTimeout(hideChromeTimer.current);
          return;
        }
        const edge = readerEdge(x, event.clientY - bounds.top, bounds.width, bounds.height, dir);
        if (hideChromeTimer.current) clearTimeout(hideChromeTimer.current);
        if (edge) setRevealedEdge(edge);
        else hideChromeTimer.current = setTimeout(() => setRevealedEdge(''), 400);
      }}
      className={
        embedded
          ? `relative w-full h-full min-h-0 ${workstationTheme === 'dark' ? 'bg-[#0f1115] text-[#e1e4ea]' : 'bg-[#f8f9fa] text-[#111827]'} flex flex-col overflow-hidden`
          : `fixed top-12 bottom-6 inset-x-3 mx-auto z-50 max-w-[1600px] rounded-2xl border ${workstationTheme === 'dark' ? 'border-[#232733] bg-[#0f1115] text-[#e1e4ea]' : 'border-[#e5e7eb] bg-[#f8f9fa] text-[#111827]'} shadow-2xl flex flex-col overflow-hidden`
      }
    >
      {/* HEADER RIBBON */}
      {collapsedChrome.length > 0 && <details data-reader-recovery className="absolute end-2 top-2 z-[60] rounded-xl border border-subtle bg-surface p-2 text-main shadow-xl"><summary className="cursor-pointer text-xs">{t('pdfChromeRestore')}</summary><div className="mt-2 flex flex-col gap-1">{collapsedChrome.map(zone => <button key={zone} type="button" className="rounded-lg px-2 py-1 text-start text-xs hover:bg-canvas" onClick={() => setCollapsedChrome(previous => previous.filter(item => item !== zone))}>{t(chromeLabels[zone as keyof typeof chromeLabels])}</button>)}</div></details>}
      <header ref={headerRef} data-pdf-header data-density={headerDensity} className="flex h-11 min-h-11 flex-nowrap items-center gap-1.5 border-b border-subtle px-2 bg-canvas/60 shrink-0">
        {embedded && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('backToLibrary')}
            title={t('backToLibrary')}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-subtle bg-surface hover:bg-canvas text-xs font-semibold text-main transition-all cursor-pointer shrink-0"
          >
            <ArrowLeft size={14} className="rtl:rotate-180 text-muted" />
            <span className="hidden lg:inline">{t('backToLibrary')}</span>
          </button>
        )}
        <h2 className={`${headerDensity >= 3 ? 'min-w-10' : 'min-w-16'} truncate font-bold text-sm`} dir="auto" title={session?.filename || undefined}>{session?.filename || t('pdfSuiteTitle')}</h2>
        {(inspection || nativeReading) && (
          <span data-pdf-document-page-count className="hidden shrink-0 text-[11px] text-muted xl:inline">
            {t('pdfDocumentPageCount', { count: totalPages })}
          </span>
        )}
        {(() => {
          const staged = !!output?.outputs?.length;
          const state = staged ? 'staged' : fileSave?.state ?? 'saved';
          const label = staged ? t('pdfUnsavedPill') : state === 'recorded' ? t('saveStateRecorded') : state === 'saving' ? t('saveStateSaving') : state === 'no-engine' || state === 'incident' ? t('saveStateRecorded') : t('pdfSavedPill');
          const warm = staged || state === 'recorded' || state === 'no-engine' || state === 'incident';
          const tone = warm ? `bg-amber-500/15 ${workstationTheme === 'dark' ? 'text-amber-300' : 'text-amber-900'}` : state === 'saving' ? 'bg-sky-500/15 text-sky-800 dark:text-sky-200' : `bg-emerald-500/15 ${workstationTheme === 'dark' ? 'text-emerald-300' : 'text-emerald-900'}`;
          const title = state === 'no-engine' ? t('saveStateNoEngine') : state === 'saved' && fileSave?.status?.lastSavedAt ? `${t('saveStateSaved')} · ${new Date(fileSave.status.lastSavedAt).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB')}` : label;
          return <span data-pdf-save-state={state} role="status" title={title} className={`flex min-w-0 shrink items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>
            {!warm && state !== 'saving' && <Check size={11} aria-hidden="true" className="shrink-0" />}
            <span className={headerDensity >= 2 ? 'sr-only' : 'truncate'}>{label}</span>
            {headerDensity >= 2 && warm ? <span aria-hidden="true">•</span> : null}
          </span>;
        })()}
        <span
          role="status"
          title={t(engineStatus.status === 'ready' ? 'stirlingEngineReady' : engineStatus.status === 'starting' ? 'stirlingEngineStarting' : engineStatus.status === 'processing' ? 'stirlingEngineProcessing' : engineStatus.status === 'error' ? 'stirlingEngineError' : 'stirlingEngineStatus')}
          aria-label={t(engineStatus.status === 'ready' ? 'stirlingEngineReady' : engineStatus.status === 'starting' ? 'stirlingEngineStarting' : engineStatus.status === 'processing' ? 'stirlingEngineProcessing' : engineStatus.status === 'error' ? 'stirlingEngineError' : 'stirlingEngineStatus')}
          className={`inline-block size-2 shrink-0 rounded-full ${engineStatus.status === 'ready' ? 'bg-emerald-500' : engineStatus.status === 'starting' ? 'bg-amber-500 animate-pulse' : engineStatus.status === 'processing' ? 'bg-sky-500 animate-pulse' : engineStatus.status === 'error' ? 'bg-red-500' : 'bg-gray-400'}`}
        />

        <div className="ms-auto flex shrink-0 items-center gap-1">
          {/* Compact PDF Tools & Processor Button + Popover */}
          <div className={headerDensity >= 3 ? 'hidden' : 'relative'}>
            <button
              type="button"
              onClick={() => setQuickToolsOpen(!quickToolsOpen)}
              title={t('pdfCompactToolsBtn')}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1.5 text-xs text-emerald-500 dark:text-emerald-400 font-semibold transition-all cursor-pointer"
            >
              <Cpu size={14} />
              <span className="hidden lg:inline">{t('pdfCompactToolsBtn')}</span>
            </button>

            {quickToolsOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setQuickToolsOpen(false)}
                />
                <div
                  className={`absolute end-0 top-full mt-2 w-72 rounded-xl border shadow-2xl p-3 space-y-3 z-50 ${
                    workstationTheme === 'dark'
                      ? 'bg-[#14161c] border-[#262c3b] text-[#e1e4ea]'
                      : 'bg-white border-[#e2e8f0] text-[#0f172a] shadow-xl'
                  }`}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="relative">
                    <Search className={`absolute inset-y-0 start-2.5 my-auto size-3.5 ${workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]'}`} />
                    <input
                      type="search"
                      placeholder={t('pdfQuickFilterPlaceholder')}
                      value={quickToolsSearch}
                      onChange={e => setQuickToolsSearch(e.target.value)}
                      className={`w-full ${
                        workstationTheme === 'dark'
                          ? 'bg-[#181a20] border-[#262a34] text-white'
                          : 'bg-[#f1f5f9] border-[#cbd5e1] text-[#0f172a]'
                      } border rounded-lg ps-8 pe-2 py-1 text-xs outline-none focus:border-emerald-500`}
                    />
                  </div>

                  <div className="space-y-1">
                    {[
                      { id: 'manual-redact', name: t(featureKeys.redact), mode: 'security' as const, tool: 'redact' as const },
                      { id: 'compress-pdf', name: t(featureKeys.compress), mode: 'convert' as const, tool: 'compress' as const },
                      { id: 'ocr-pdf', name: t(featureKeys.ocr), mode: 'convert' as const, tool: 'ocr' as const },
                      { id: 'cert-sign', name: t(featureKeys.sign), mode: 'security' as const, tool: 'sign' as const },
                      { id: 'split', name: t(featureKeys.split), mode: 'organize' as const, tool: 'split' as const },
                      { id: 'merge', name: t(featureKeys.organize), mode: 'organize' as const, tool: 'organize' as const },
                    ]
                      .filter(item => !quickToolsSearch || item.name.toLowerCase().includes(quickToolsSearch.toLowerCase()))
                      .map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setMode(item.mode);
                            setTool(item.tool);
                            setToolDirectoryOpen(false);
                            setQuickToolsOpen(false);
                          }}
                          className={`w-full text-start px-2 py-1.5 rounded-lg ${
                            workstationTheme === 'dark'
                              ? 'hover:bg-[#1e222d] text-[#a0a6b7] hover:text-white'
                              : 'hover:bg-[#f1f5f9] text-[#475569] hover:text-[#0f172a]'
                          } text-xs transition-all flex items-center justify-between cursor-pointer`}
                        >
                          <span>{item.name}</span>
                          <ChevronRight size={12} className="rtl:rotate-180 text-[#686e80]" />
                        </button>
                      ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setQuickToolsOpen(false);
                      setIsToolsHubOpen(true);
                    }}
                    className="w-full py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold text-center block transition-all cursor-pointer"
                  >
                    {t('pdfMoreToolsLink')}
                  </button>
                </div>
              </>
            )}
          </div>

          <MarkupBarCompact.Provider value={headerDensity >= 2}>{markupBar}</MarkupBarCompact.Provider>
          {headerDensity === 0 && readingActions?.onCompare && <button type="button" data-compare-open aria-label={t('compareTitle')} title={t('compareTitle')} onClick={readingActions.onCompare} className="shrink-0 rounded-lg border border-subtle bg-surface p-1.5 text-main hover:bg-canvas"><GitCompare size={14} aria-hidden="true" /></button>}
          {headerDensity === 0 && readingActions && (
            <>
              <button type="button" onClick={readingActions.onReadAloud} aria-label={t('ttsReadAloud')} title={t('ttsReadAloud')} className="rounded-lg border border-subtle p-1.5 text-main hover:bg-surface"><BookOpen size={14} /></button>
              <button type="button" onClick={readingActions.onAutoScroll} aria-pressed={readingActions.autoScrolling} aria-label={t(readingActions.autoScrolling ? 'autoScrollPause' : 'autoScrollPlay')} title={t(readingActions.autoScrolling ? 'autoScrollPause' : 'autoScrollPlay')} className="rounded-lg border border-subtle p-1.5 text-main hover:bg-surface"><ChevronDown size={14} /></button>
              <button type="button" onClick={readingActions.onBookmark} aria-pressed={readingActions.bookmarked} aria-label={t('addBookmarkBtn')} title={t('addBookmarkBtn')} className="rounded-lg border border-subtle p-1.5 text-main hover:bg-surface"><Bookmark size={14} fill={readingActions.bookmarked ? 'currentColor' : 'none'} /></button>
            </>
          )}
          {annotationPanel && headerDensity < 3 && <button
            type="button"
            data-pdf-annotations-toggle
            aria-pressed={annotationPanel.open}
            aria-label={t('annotationsDrawerTitle')}
            title={t('annotationsDrawerTitle')}
            onClick={toggleAnnotations}
            className={`rounded-lg border border-subtle p-1.5 flex items-center gap-1 text-main hover:bg-surface ${annotationPanel.open ? 'ring-1 ring-emerald-500 bg-emerald-500/10' : ''}`}
          ><MessageSquare size={14} />{annotationPanel.count > 0 && <span className="text-[10px] tabular-nums">{annotationPanel.count}</span>}</button>}
          {headerDensity === 0 && fileSave && <button type="button" data-export-open aria-label={t('exportPdfMenu')} title={t('exportPdfMenu')} onClick={fileSave.onExport} className="rounded-lg border border-subtle p-1.5 text-main hover:bg-surface"><FileDown size={14} aria-hidden="true" /></button>}
          {headerDensity === 0 && <><button
            type="button"
            disabled={!session || starting || job?.state === 'running'}
            onClick={() => void handleUndo()}
            className="flex items-center gap-1 rounded-lg border border-subtle px-2.5 py-1.5 text-xs text-muted hover:text-main hover:bg-surface disabled:opacity-40 transition-all cursor-pointer"
            title={t('pdfUndo')}
          >
            <RotateCcw size={13} />
            <span className="hidden 2xl:inline">{t('pdfUndo')}</span>
          </button>

          <button
            type="button"
            disabled={!session}
            onClick={() => {
              setIsVersionHistoryOpen(true);
              void loadVersions();
            }}
            className="flex items-center gap-1 rounded-lg border border-subtle px-2.5 py-1.5 text-xs text-muted hover:text-main hover:bg-surface disabled:opacity-40 transition-all cursor-pointer"
            title={t('pdfVersionHistory')}
          >
            <History size={13} />
            <span className="hidden 2xl:inline">{t('pdfVersionHistory')}</span>
          </button></>}

          <button
            type="button"
            disabled={!session || starting || job?.state === 'running'}
            onClick={() => void handleQuickSave()}
            className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold disabled:opacity-40 transition-all cursor-pointer"
            title={t('pdfSaveDocument')}
          >
            <Save size={13} />
            <span className="hidden md:inline">{t('save')}</span>
          </button>

          {headerDensity === 0 && <>
            <button type="button" aria-pressed={immersive} title={t('zenModePurePage')} aria-label={t('zenModePurePage')} onClick={event => { event.currentTarget.blur(); setRevealedEdge(''); setImmersive(value => !value); }} className="rounded-lg p-1.5 text-main hover:bg-surface"><Maximize2 size={14} /></button>
            {pinChrome('top')}
          </>}
          {headerDensity > 0 && <div className="relative shrink-0">
            <button type="button" data-pdf-header-more aria-haspopup="menu" aria-expanded={headerMenuOpen} aria-label={t('pdfHeaderMore')} title={t('pdfHeaderMore')} onClick={() => setHeaderMenuOpen(open => !open)} className={`rounded-lg border border-subtle p-1.5 text-main hover:bg-surface ${headerMenuOpen ? 'bg-surface' : ''}`}><MoreHorizontal size={14} aria-hidden="true" /></button>
            {headerMenuOpen && <>
              <div className="fixed inset-0 z-40" onClick={() => setHeaderMenuOpen(false)} />
              <div
                role="menu"
                aria-label={t('pdfHeaderMore')}
                data-pdf-header-menu
                ref={menu => { if (menu && !menu.contains(document.activeElement)) menu.querySelector<HTMLElement>('[role^=menuitem]:not(:disabled)')?.focus(); }}
                onKeyDown={event => {
                  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                  event.preventDefault();
                  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role^=menuitem]:not(:disabled)'));
                  const at = items.indexOf(document.activeElement as HTMLElement);
                  items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
                }}
                className="absolute end-0 top-full z-50 mt-2 w-60 max-w-[calc(100vw-1rem)] rounded-xl border border-subtle bg-surface p-1 text-main shadow-2xl"
              >
                {headerMenuItems.map(item => <button
                  key={item.id}
                  type="button"
                  role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                  aria-checked={item.checked}
                  data-pdf-header-item={item.id}
                  disabled={item.disabled}
                  onClick={() => runHeaderItem(item.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs hover:bg-canvas focus:bg-canvas focus:outline-none disabled:opacity-40"
                >
                  <span className="shrink-0 text-muted" aria-hidden="true">{item.icon}</span>
                  <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                  {item.checked && <Check size={13} aria-hidden="true" className="shrink-0 text-emerald-500" />}
                </button>)}
              </div>
            </>}
          </div>}
          {!embedded && (
            <button type="button" aria-label={t('studyClose')} title={t('studyClose')} onClick={onClose} className="rounded-lg p-1.5 text-muted hover:text-main hover:bg-canvas"><X size={16} /></button>
          )}
        </div>
      </header>
      {fileSave?.status?.incident && <SaveIncidentBanner status={fileSave.status} onRestore={fileSave.onRestore} onKeep={fileSave.onKeep} t={t} />}

      {/* Floating Quick-Save / Undo Toast Feedback */}
      {(quickSaveFeedback || saveNoticeText) && (
        <div role="status" data-save-feedback className="fixed top-14 inset-x-0 mx-auto w-fit z-50 flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-xl animate-bounce">
          <Check size={14} />
          <span>{quickSaveFeedback || saveNoticeText}</span>
        </div>
      )}

      {/* WORKSPACE BODY: 4-ZONE WORKSTATION LAYOUT */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ZONE 1: FAR-LEFT ACTIVITY RAIL (44px) */}
        <aside data-reader-chrome="rail" className="w-11 shrink-0 border-e border-subtle bg-canvas flex flex-col items-center py-3 space-y-2 z-10">
          {pinChrome('rail')}
          <button type="button" title={t('pdfRailLibrary')} aria-label={t('pdfRailLibrary')} onClick={onClose} className="size-8 rounded-xl flex items-center justify-center text-main hover:bg-surface transition-all">
            <BookOpen size={16} />
          </button>
          {[
            { id: 'organize' as const, icon: LayoutGrid, title: t('stirlingModeOrganize') },
            { id: 'view' as const, icon: Eye, title: t('stirlingModeView') },
            { id: 'security' as const, icon: Shield, title: t('stirlingModeSecurity') },
          ].map(tab => {
            const isActive = mode === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                title={tab.title}
                aria-label={tab.title}
                aria-pressed={isActive}
                onClick={() => {
                  setMode(tab.id);
                  const def = MODE_TABS.find(m => m.id === tab.id)?.defaultTool || 'inspect';
                  setTool(def);
                  setToolDirectoryOpen(false);
                }}
                className={`size-8 rounded-xl flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-main hover:bg-surface'
                }`}
              >
                <Icon size={16} />
              </button>
            );
          })}
          <button type="button" title={t('pdfRailFiles')} aria-label={t('pdfRailFiles')} aria-pressed={!leftSidebarCollapsed && !collapsedChrome.includes('library')} onClick={() => { setCollapsedChrome(previous => previous.filter(zone => zone !== 'library')); setLeftSidebarCollapsed(value => !value); }} className="size-8 rounded-xl flex items-center justify-center text-main hover:bg-surface transition-all">
            <Folder size={16} />
          </button>
          <button type="button" title={t('pdfRailPipelines')} aria-label={t('pdfRailPipelines')} onClick={() => { setHubView('pipelines'); setIsToolsHubOpen(true); }} className="size-8 rounded-xl flex items-center justify-center text-amber-700 dark:text-amber-400 hover:bg-amber-500/15 transition-all">
            <Cpu size={16} />
          </button>
          <button
            type="button"
            title={t('pdfRailSearch')}
            aria-label={t('pdfRailSearch')}
            onClick={() => {
              if (readingActions?.onSearch) { readingActions.onSearch(); return; }
              setCollapsedChrome(previous => previous.filter(zone => zone !== 'library'));
              setLeftSidebarCollapsed(false);
              requestAnimationFrame(() => pageSearch.current?.focus());
            }}
            className="size-8 rounded-xl flex items-center justify-center text-main hover:bg-surface transition-all"
          >
            <Search size={16} />
          </button>

          <div className="flex-1" />

          {/* Workstation Theme Toggle */}
          <button
            type="button"
            data-pdf-page-tint
            aria-pressed={tintPdfPages}
            title={t(tintPdfPages ? 'pdfOriginalPageColors' : 'pdfEnableDarkPages')}
            aria-label={t(tintPdfPages ? 'pdfOriginalPageColors' : 'pdfEnableDarkPages')}
            onClick={() => setTintPdfPages(value => !value)}
            className={`size-8 rounded-lg flex items-center justify-center hover:bg-emerald-500/20 focus-visible:outline-2 focus-visible:outline-emerald-500 ${tintPdfPages ? 'bg-emerald-500/20 text-emerald-500 ring-1 ring-inset ring-emerald-500' : 'text-main'}`}
          ><Moon size={15} /></button>
          <button
            type="button"
            title={t(workstationTheme === 'dark' ? 'pdfThemeLight' : workstationTheme === 'light' ? 'pdfThemeSepia' : 'pdfThemeDark')}
            aria-label={t(workstationTheme === 'dark' ? 'pdfThemeLight' : workstationTheme === 'light' ? 'pdfThemeSepia' : 'pdfThemeDark')}
            onClick={() => setWorkstationTheme(workstationTheme === 'dark' ? 'light' : workstationTheme === 'light' ? 'sepia' : 'dark')}
            className="size-8 rounded-xl flex items-center justify-center text-main hover:bg-surface transition-all"
          >
            {workstationTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </aside>

        {/* ZONE 2: COLLAPSIBLE LEFT SIDEBAR (PDF Library / Active Files - 250px) */}
        {!leftSidebarCollapsed && (
          <aside data-reader-chrome="library" className={`w-[250px] shrink-0 border-e ${
            workstationTheme === 'dark'
              ? 'border-[#1f2229] bg-[#131519] text-[#e1e4ea]'
              : 'border-[#e2e8f0] bg-white text-[#111827]'
          } flex flex-col min-h-0 overflow-hidden hidden md:flex`}>
            {/* Header & Search */}
            {pinChrome('library')}
            <div className={`p-3 border-b ${workstationTheme === 'dark' ? 'border-[#1f2229]' : 'border-[#e2e8f0]'} space-y-2`}>
              <div className="flex items-center justify-between">
                <span className={`font-bold text-xs uppercase tracking-wider ${workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>{t('pdfChromeLibrary')}</span>
                <span className="text-[10px] font-mono text-emerald-500 dark:text-emerald-400">
                  {t('pdfDocumentPageCount', { count: totalPages })}
                </span>
              </div>
              <div className="relative">
                <Search className={`absolute inset-y-0 start-2.5 my-auto size-3.5 ${workstationTheme === 'dark' ? 'text-[#686e80]' : 'text-[#94a3b8]'}`} />
                <input
                  ref={pageSearch}
                  type="search"
                  aria-label={t('pdfSearchPages')}
                  placeholder={t('pdfSearchPages')}
                  value={fileFilter}
                  onChange={e => setFileFilter(e.target.value)}
                  className={`w-full ${
                    workstationTheme === 'dark'
                      ? 'bg-[#181a20] border-[#222631] text-white placeholder-[#686e80]'
                      : 'bg-[#f8fafc] border-[#cbd5e1] text-[#0f172a] placeholder-[#94a3b8]'
                  } border rounded-lg ps-8 pe-2 py-1 text-xs outline-none focus:border-emerald-500`}
                />
              </div>
            </div>

            {/* RECENT PDFs with the active document as a blue pill */}
            <div className={`px-3 py-2 border-b ${workstationTheme === 'dark' ? 'border-[#1f2229]' : 'border-[#e2e8f0]'} space-y-1 text-[11px]`}>
              <span className={`block font-bold uppercase tracking-wider text-[10px] ${workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>{t('pdfSidebarRecent')}</span>
              {recentPdfBooks.map(book => (
                <button
                  key={book.id}
                  type="button"
                  dir="auto"
                  aria-current={book.id === workId ? 'true' : undefined}
                  onClick={() => { if (book.id !== workId) openBookForReading(book); }}
                  className={`block w-full truncate rounded-full px-2.5 py-1 text-start text-xs transition-colors ${book.id === workId ? 'bg-blue-600 font-semibold text-white' : workstationTheme === 'dark' ? 'text-[#c3c8d4] hover:bg-[#181c24]' : 'text-[#334155] hover:bg-slate-100'}`}
                >
                  {book.title}
                </button>
              ))}
            </div>

            {/* TYPES with document counts */}
            {pdfTypeCounts.length > 0 && (
              <div className={`px-3 py-2 border-b ${workstationTheme === 'dark' ? 'border-[#1f2229]' : 'border-[#e2e8f0]'} space-y-1`}>
                <span className={`block font-bold uppercase tracking-wider text-[10px] ${workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>{t('pdfSidebarTypes')}</span>
                <div className="flex flex-wrap gap-1">
                  {pdfTypeCounts.map(([type, count]) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={typeFilter === type}
                      onClick={() => setTypeFilter(current => current === type ? null : type)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${typeFilter === type ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : workstationTheme === 'dark' ? 'border-[#2a2f3c] text-[#c3c8d4]' : 'border-[#cbd5e1] text-[#334155]'}`}
                    >
                      {t(PDF_TYPE_LABELS[type] ?? 'pdfTypeOther')} <span className="tabular-nums opacity-80">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* FOLDERS with live Watching badge & Dynamic Watched Folders */}
            <div className={`px-3 py-2 border-b ${workstationTheme === 'dark' ? 'border-[#1f2229]' : 'border-[#e2e8f0]'} space-y-1.5 text-[11px]`}>
              <div className={`flex items-center justify-between ${workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>
                <span className="font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <FolderInput size={11} className="text-blue-500" />
                  <span>{t('pdfWatchedFoldersTitle')}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsToolsHubOpen(true)}
                  className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5 font-semibold cursor-pointer"
                  title={t('pdfWatchedFolderAdd')}
                >
                  <Plus size={10} />
                  <span>{t('pdfWatchedFolderAdd')}</span>
                </button>
              </div>

              {watchedFoldersList.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setIsToolsHubOpen(true)}
                  className={`flex items-center justify-between p-1 rounded-md cursor-pointer transition-colors ${
                    workstationTheme === 'dark' ? 'hover:bg-[#181c24]' : 'hover:bg-slate-100'
                  }`}
                >
                  <div className={`flex items-center gap-1.5 text-xs ${workstationTheme === 'dark' ? 'text-[#a0a6b7]' : 'text-[#475569]'}`}>
                    <FolderInput size={13} className="text-blue-400" />
                    <span className="truncate">{t('pdfNoWatchedFolders')}</span>
                  </div>
                </button>
              ) : (
                <div className="space-y-1 max-h-[85px] overflow-y-auto">
                  {watchedFoldersList.map(folder => (
                    <div
                      key={folder.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setIsToolsHubOpen(true)}
                      className={`flex items-center justify-between p-1 rounded-md cursor-pointer transition-colors ${
                        workstationTheme === 'dark' ? 'hover:bg-[#181c24]' : 'hover:bg-slate-100'
                      }`}
                    >
                      <div className={`flex items-center gap-1.5 text-xs min-w-0 ${workstationTheme === 'dark' ? 'text-[#a0a6b7]' : 'text-[#475569]'}`}>
                        <FolderInput size={13} className="text-blue-400 shrink-0" />
                        <span className="truncate font-medium">{folder.name}</span>
                      </div>
                      <span className={`flex items-center gap-1 text-[10px] font-bold shrink-0 ${folder.status === 'watching' ? 'text-emerald-600 dark:text-emerald-400' : folder.status === 'paused' ? 'text-amber-700 dark:text-amber-300' : 'text-red-600 dark:text-red-400'}`}>
                        <span className={`size-1.5 rounded-full bg-current ${folder.status === 'watching' ? 'animate-pulse' : ''}`} />
                        {t(folder.status === 'watching' ? 'pdfWatchedFolderStatusWatching' : folder.status === 'paused' ? 'pdfWatchedFolderPaused' : 'pdfWatchedFolderError')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* FILES: the open document and its restorable versions */}
            <div className={`px-3 py-2 border-b ${workstationTheme === 'dark' ? 'border-[#1f2229]' : 'border-[#e2e8f0]'} space-y-1`}>
              <span className={`block font-bold uppercase tracking-wider text-[10px] ${workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>{t('pdfSidebarFiles')}</span>
              <div className="flex items-center gap-1.5 text-xs">
                <FileText size={13} className="shrink-0 text-emerald-500" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate" dir="auto">{session?.filename || t('pdfSuiteTitle')}</span>
                <button
                  type="button"
                  disabled={!session}
                  aria-label={t('pdfVersionHistory')}
                  title={t('pdfVersionHistory')}
                  onClick={() => { setIsVersionHistoryOpen(true); void loadVersions(); }}
                  className="shrink-0 rounded-md p-1 text-emerald-600 hover:bg-emerald-500/15 disabled:opacity-40 dark:text-emerald-400"
                >
                  <History size={13} />
                </button>
              </div>
            </div>

            {/* Zone 2 Sub-Navigation Tabs: Thumbnails | Bookmarks | Comments */}
            <div className={`flex items-center border-b ${workstationTheme === 'dark' ? 'border-[#1f2229] bg-[#101216]' : 'border-[#e2e8f0] bg-[#f8fafc]'} text-xs font-semibold p-1 gap-1 shrink-0`}>
              {[
                { id: 'thumbnails' as const, label: t('pdfThumbnailsTab'), icon: LayoutGrid },
                { id: 'bookmarks' as const, label: t('pdfBookmarksTab'), icon: Bookmark },
                { id: 'comments' as const, label: t('pdfCommentsTab'), icon: MessageSquare },
                // Study marks and review comments in one list (Wave 9.2).
                { id: 'marks' as const, label: t('marksTab'), icon: Highlighter },
              ].map(tabItem => {
                const isActive = zone2Tab === tabItem.id;
                const Icon = tabItem.icon;
                return (
                  <button
                    key={tabItem.id}
                    type="button"
                    data-zone2-tab={tabItem.id}
                    aria-pressed={isActive}
                    aria-label={tabItem.label}
                    title={tabItem.label}
                    onClick={() => setZone2Tab(tabItem.id)}
                    // Four tabs share a narrow panel: the active one shows its name, the others only their icon.
                    className={`${isActive ? 'flex-[2]' : 'flex-1'} min-w-0 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] transition-all cursor-pointer ${
                      isActive
                        ? workstationTheme === 'dark'
                          ? 'bg-[#1e222d] text-white shadow-xs'
                          : 'bg-white text-emerald-600 shadow-xs'
                        : workstationTheme === 'dark'
                        ? 'text-[#8b92a5] hover:text-white'
                        : 'text-[#64748b] hover:text-[#0f172a]'
                    }`}
                  >
                    <Icon size={12} className="shrink-0" />
                    {isActive && <span className="truncate">{tabItem.label}</span>}
                  </button>
                );
              })}
            </div>

            {zone2Tab === 'marks' && <PdfMarksList
              items={readerIntegration?.highlights ?? []}
              reviews={comments}
              t={t}
              onJump={target => { setPage(target); if (!nativeReading) void start('preview', { page: target }); onPageChange?.(target); }}
            />}

            {/* TAB 1: THUMBNAILS LIST */}
            {zone2Tab === 'thumbnails' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => !fileFilter || String(p).includes(fileFilter))
                  .map(p => {
                    const isCurrent = page === p;
                    const thumbUrl = thumbnails[`current:${p}`] || thumbnails[p];
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setPage(p);
                          if (!nativeReading) void start('preview', { page: p });
                          onPageChange?.(p);
                        }}
                        className={`w-full rounded-xl border p-1.5 text-center transition-all flex items-center gap-3 cursor-pointer ${
                          isCurrent
                            ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                            : workstationTheme === 'dark'
                            ? 'border-[#222631] bg-[#171a21] hover:border-[#32384a]'
                            : 'border-[#e2e8f0] bg-[#f8fafc] hover:border-[#cbd5e1]'
                        }`}
                      >
                        <div className={`w-14 aspect-[3/4] bg-white rounded border ${workstationTheme === 'dark' ? 'border-[#282d3b]' : 'border-[#e2e8f0]'} flex items-center justify-center overflow-hidden shrink-0`}>
                          <PdfPageThumbnail document={pdfDocument} page={p} image={thumbUrl} alt={`${t('page')} ${p}`} fallback={<span className="text-xs font-mono text-neutral-400">{p}</span>} />
                        </div>
                        <div className="text-start min-w-0">
                          <span className={`text-xs block font-bold ${isCurrent ? 'text-emerald-500 dark:text-emerald-400' : workstationTheme === 'dark' ? 'text-white' : 'text-[#0f172a]'}`}>
                            {t('page')} {p}
                          </span>
                          <span className={`text-[10px] ${workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]'} block truncate`}>
                            {isCurrent ? t('pdfActivePage') : ''}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}

            {/* TAB 2: BOOKMARKS (OUTLINE JUMP) */}
            {zone2Tab === 'bookmarks' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {inspection?.outline && inspection.outline.length > 0 ? (
                  inspection.outline
                    .filter(item => !fileFilter || item.title.toLowerCase().includes(fileFilter.toLowerCase()))
                    .map((item, idx) => {
                      const isCurrent = page === item.page;
                      return (
                        <button
                          key={`${item.title}-${item.page}-${idx}`}
                          type="button"
                          onClick={() => {
                            setPage(item.page);
                            if (!nativeReading) void start('preview', { page: item.page });
                            onPageChange?.(item.page);
                          }}
                          style={{ marginInlineStart: `${item.level * 12}px` }}
                          className={`w-full text-start p-2 rounded-lg border text-xs transition-all flex items-center justify-between cursor-pointer ${
                            isCurrent
                              ? 'border-emerald-500 bg-emerald-500/10 font-bold text-emerald-500 dark:text-emerald-400'
                              : workstationTheme === 'dark'
                              ? 'border-[#222631] bg-[#171a21] hover:border-[#32384a] text-[#e1e4ea]'
                              : 'border-[#e2e8f0] bg-[#f8fafc] hover:border-[#cbd5e1] text-[#0f172a]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Bookmark size={12} className="shrink-0 text-emerald-500" />
                            <span className="truncate">{item.title}</span>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-subtle/20 shrink-0 ms-2">
                            p. {item.page}
                          </span>
                        </button>
                      );
                    })
                ) : (
                  <div className="text-center py-8 px-2 space-y-3">
                    <Bookmark className="size-7 mx-auto text-muted/50" />
                    <p className="text-xs text-muted">{t('pdfNoBookmarks')}</p>
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        disabled={!session || starting || job?.state === 'running'}
                        onClick={() => void start('inspect')}
                        className="w-full py-1.5 rounded-lg border border-subtle bg-surface hover:bg-canvas text-xs font-semibold"
                      >
                        {t('pdfSuiteInspect')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('view');
                          setTool('edit-toc');
                          setToolDirectoryOpen(false);
                        }}
                        className="w-full py-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400 text-xs font-bold"
                      >
                        {t('stirlingEditToc')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: COMMENTS & ANNOTATIONS */}
            {zone2Tab === 'comments' && (
              <div className="flex-1 overflow-y-auto p-3 flex flex-col space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-muted">{comments.length} {t('pdfCommentsTab')}</span>
                  {comments.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleClearAllComments()}
                      className="text-[11px] text-red-400 hover:text-red-500 underline cursor-pointer"
                    >
                      {t('pdfClearAllComments')}
                    </button>
                  )}
                </div>

                {/* Add Comment Input */}
                <div className={`p-2.5 rounded-xl border ${workstationTheme === 'dark' ? 'bg-[#171a21] border-[#262c3b]' : 'bg-[#f8fafc] border-[#e2e8f0]'} space-y-2`}>
                  <span className="text-[11px] font-bold block">{t('pdfAddComment')} ({t('page')} {page})</span>
                  <textarea
                    dir="auto"
                    rows={2}
                    placeholder={t('pdfCommentTextPlaceholder')}
                    value={newCommentText}
                    onChange={e => setNewCommentText(e.target.value)}
                    className={`w-full text-xs p-2 rounded-lg border outline-none ${
                      workstationTheme === 'dark' ? 'bg-[#101216] border-[#282d3b] text-white' : 'bg-white border-[#cbd5e1] text-[#0f172a]'
                    }`}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      dir="auto"
                      placeholder={t('pdfCommentAuthorPlaceholder')}
                      value={newCommentAuthor}
                      onChange={e => setNewCommentAuthor(e.target.value)}
                      className={`flex-1 text-[11px] px-2 py-1 rounded border outline-none ${
                        workstationTheme === 'dark' ? 'bg-[#101216] border-[#282d3b] text-white' : 'bg-white border-[#cbd5e1] text-[#0f172a]'
                      }`}
                    />
                    <button
                      type="button"
                      disabled={!newCommentText.trim() || !session?.id}
                      onClick={() => void handleAddComment()}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                    >
                      <Plus size={13} className="inline me-0.5" />
                      {t('pdfAddComment')}
                    </button>
                  </div>
                </div>

                {/* Comments List */}
                {loadingComments ? (
                  <div className="text-center py-6 text-xs text-muted">
                    <div className="inline-block size-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-1" />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted border border-dashed border-subtle rounded-xl p-4">
                    <MessageSquare className="size-6 mx-auto mb-2 text-muted/50" />
                    <p>{t('pdfNoComments')}</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {comments.map(c => (
                      <article
                        key={c.id}
                        className={`p-2.5 rounded-xl border text-xs space-y-2 ${
                          page === c.page
                            ? 'border-emerald-500/60 bg-emerald-500/5'
                            : workstationTheme === 'dark'
                            ? 'border-[#222631] bg-[#161820]'
                            : 'border-[#e2e8f0] bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[11px] text-emerald-500">{c.author || 'User'}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-subtle/30 text-muted">
                            p. {c.page}
                          </span>
                        </div>
                        <p dir="auto" className="leading-relaxed whitespace-pre-wrap">{c.text}</p>

                        {/* Replies list */}
                        {c.replies?.map(r => (
                          <div key={r.id} className="border-s-2 border-emerald-500/40 ps-2 py-0.5 space-y-0.5">
                            <span className="text-[10px] font-semibold text-muted block">{r.author}</span>
                            <p dir="auto" className="text-[11px]">{r.text}</p>
                          </div>
                        ))}

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between pt-1 border-t border-subtle/30 text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleLocateComment(c)}
                            className="text-emerald-500 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <ExternalLink size={11} />
                            <span>{t('pdfLocateInDocument')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setReplyingToCommentId(replyingToCommentId === c.id ? null : c.id)}
                            className="text-muted hover:text-main underline cursor-pointer"
                          >
                            {t('pdfCommentReply')}
                          </button>
                        </div>

                        {/* Reply Input Form */}
                        {replyingToCommentId === c.id && (
                          <div className="pt-2 space-y-1.5">
                            <input
                              dir="auto"
                              placeholder={t('pdfCommentReplyPlaceholder')}
                              value={commentReplyText}
                              onChange={e => setCommentReplyText(e.target.value)}
                              className={`w-full text-xs p-1.5 rounded border outline-none ${
                                workstationTheme === 'dark' ? 'bg-[#101216] border-[#282d3b] text-white' : 'bg-[#f8fafc] border-[#cbd5e1] text-[#0f172a]'
                              }`}
                            />
                            <button
                              type="button"
                              disabled={!commentReplyText.trim()}
                              onClick={() => void handleReplyComment(c)}
                              className="w-full py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                            >
                              <CornerDownRight size={11} className="inline me-1" />
                              {t('pdfCommentSendReply')}
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        {/* CENTER HIGH-DPI CANVAS VIEWPORT OR MULTI-TOOL PAGE EDITOR */}
        <main className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden relative" style={{ backgroundColor: workstationTheme === 'dark' ? '#0b0c0e' : workstationTheme === 'sepia' ? '#efece4' : '#f1f5f9' }}>
          {session && (mode === 'organize' || organizerOpenedFor === session.id) && (
            <div aria-hidden={mode !== 'organize' || undefined} style={{ display: mode === 'organize' ? 'flex' : 'none' }} className="w-full h-full overflow-hidden flex-col">
              <PdfPageEditor
                ref={pageEditorRef}
                key={`${session.id}:${totalPages}`}
                session={session}
                totalPages={totalPages}
                thumbnails={thumbnails}
                document={pdfDocument}
                busy={starting || job?.state === 'running'}
                theme={workstationTheme}
                onViewPage={p => {
                  setPage(p);
                  setMode('view');
                  setToolDirectoryOpen(true);
                  if (!fileUrl) void start('preview', { page: p });
                  onPageChange?.(p);
                }}
                onApply={plan => {
                  const sanitizedPlan = plan.map(item => ({
                    ...(typeof item.page === 'number' ? { page: item.page } : {}),
                    sessionId: item.sessionId || session.id,
                    rotation: item.rotation || 0,
                    blank: item.blank || false,
                    splitAfter: item.splitAfter === true,
                  }));
                  void start('organize', { pages: sanitizedPlan });
                }}
              />
            </div>
          )}
          <div className={mode === 'organize' && session ? 'absolute inset-0 invisible pointer-events-none flex flex-col' : 'contents'}>
          {/* Central Scrollable Canvas */}
          <div className="relative flex-1 min-h-0 overflow-auto p-4 flex items-center justify-center">
            {displayFileUrl && (
              <div className={`pdf-viewport-container w-full h-full${showPagePreview ? ' invisible' : ''}`} dir="ltr">
                <PdfNativeViewer
                  {...readerIntegration}
                  onPdfDocLoaded={handlePdfDocument}
                  theme={workstationTheme}
                  tintPages={tintPdfPages}
                  fileUrl={displayFileUrl}
                  currentPage={page}
                  totalPages={nativeTotalPages}
                  onTotalPagesLoaded={handleNativePageCount}
                  onPageChange={handleNativePageChange}
                  viewMode={viewMode === 'double' ? 'two-column' : viewMode === 'scroll' ? 'scrolled' : 'single'}
                  zoom={zoom / 100}
                />
              </div>
            )}
            {showPagePreview && preview && (
              <div className="absolute inset-0 overflow-auto p-4 flex">
              <div
                dir="ltr"
                data-pdf-page-preview
                className={`relative m-auto shrink-0 bg-white shadow-2xl rounded-sm overflow-hidden select-none touch-none max-w-full${canvasUse === 'box' ? ' cursor-crosshair' : ''}`}
                style={{
                  width: `${preview.width * (zoom / 100)}px`,
                  aspectRatio: `${preview.width}/${preview.height}`,
                }}
                onPointerDown={event => {
                  if (canvasUse !== 'box') return;
                  drag.current = point(event);
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerUp={event => {
                  const begin = drag.current;
                  if (!begin) return;
                  const end = point(event);
                  drag.current = null;
                  if (Math.abs(end[0] - begin[0]) > 3 && Math.abs(end[1] - begin[1]) > 3) {
                    setPage(preview.page);
                    setBoxPage(preview.page);
                    setRect([
                      Math.max(0, Math.min(begin[0], end[0])),
                      Math.max(0, Math.min(begin[1], end[1])),
                      Math.min(preview.width, Math.max(begin[0], end[0])),
                      Math.min(preview.height, Math.max(begin[1], end[1])),
                    ]);
                  }
                }}
              >
                {/* High-DPI rendered page */}
                <img
                  src={preview.image}
                  alt={t('pdfPagePreview', { page: preview.page })}
                  draggable={false}
                  className="w-full h-full pointer-events-none block"
                />

                {/* Embedded Images selection */}
                {tool === 'edit-content' &&
                  inspection?.pages
                    .find(item => item.page === preview.page)
                    ?.images?.flatMap(image =>
                      image.rects.map((area, index) => (
                        <button
                          key={`${image.xref}-${index}`}
                          type="button"
                          aria-label={t('pdfSelectEmbeddedImage')}
                          onPointerDown={event => event.stopPropagation()}
                          onClick={() => {
                            setPage(preview.page);
                            setRect(area);
                            setSelectedImage({ xref: image.xref, originalRect: area });
                            setInlineBlock(null);
                          }}
                          className="absolute z-10 border border-violet-500/30 hover:bg-violet-500/10"
                          style={{
                            left: `${(area[0] / preview.width) * 100}%`,
                            top: `${(area[1] / preview.height) * 100}%`,
                            width: `${((area[2] - area[0]) / preview.width) * 100}%`,
                            height: `${((area[3] - area[1]) / preview.height) * 100}%`,
                          }}
                        />
                      )),
                    )}

                {/* Inline Text Replacement Input */}
                {tool === 'edit-content' && inlineBlock && (
                  <textarea
                    data-pdf-inline-text
                    autoFocus
                    aria-label={t('pdfText')}
                    dir={inlineBlock.direction}
                    value={text}
                    onChange={event => setText(event.target.value)}
                    onPointerDown={event => event.stopPropagation()}
                    onPointerUp={event => event.stopPropagation()}
                    className="absolute z-20 bg-white text-black border-2 border-emerald-600 leading-relaxed resize text-xs p-1"
                    style={{
                      left: `${(rect[0] / preview.width) * 100}%`,
                      top: `${(rect[1] / preview.height) * 100}%`,
                      width: `${((rect[2] - rect[0]) / preview.width) * 100}%`,
                      height: `${((rect[3] - rect[1]) / preview.height) * 100}%`,
                      minHeight: '2.5rem',
                    }}
                  />
                )}

                {/* Box drawn for a tool that places something on the page */}
                {canvasUse === 'box' && boxPage === preview.page && (
                  <div
                    className="absolute border-2 border-emerald-600 bg-emerald-500/15 pointer-events-none"
                    style={{
                      left: `${(rect[0] / preview.width) * 100}%`,
                      top: `${(rect[1] / preview.height) * 100}%`,
                      width: `${((rect[2] - rect[0]) / preview.width) * 100}%`,
                      height: `${((rect[3] - rect[1]) / preview.height) * 100}%`,
                    }}
                  />
                )}

                {/* Text Blocks highlighting */}
                {tool === 'edit-content' &&
                  inspection?.pages
                    .find(item => item.page === preview.page)
                    ?.blocks.map((block, index) => (
                      <button
                        key={index}
                        type="button"
                        aria-label={t('pdfEditBlock', { text: block.text.slice(0, 80) })}
                        title={block.text}
                        onPointerDown={event => event.stopPropagation()}
                        onClick={() => {
                          setPage(preview.page);
                          setText(block.text);
                          setInlineBlock(block);
                          setSelectedImage(null);
                          setRect([
                            Math.max(0, block.x - 2),
                            Math.max(0, block.y - 2),
                            Math.min(preview.width, block.x + block.width + 8),
                            Math.min(preview.height, block.y + block.height + (block.fontSize || 12)),
                          ]);
                        }}
                        className="absolute z-10 border border-transparent hover:border-blue-500 hover:bg-blue-500/10 cursor-pointer"
                        style={{
                          left: `${(block.x / preview.width) * 100}%`,
                          top: `${(block.y / preview.height) * 100}%`,
                          width: `${(block.width / preview.width) * 100}%`,
                          height: `${(block.height / preview.height) * 100}%`,
                        }}
                      />
                    ))}
              </div>
              </div>
            )}
          </div>

          {/* Floating Bottom Stepper / Pill */}
          <div data-pdf-bottom-navigation className={`absolute bottom-4 inset-x-0 mx-auto w-fit z-30 flex items-center gap-3 px-4 py-2 rounded-2xl ${
            workstationTheme === 'dark'
              ? 'bg-[#14161c]/95 border-[#262c3b] text-[#e1e4ea]'
              : 'bg-white/95 border-[#cbd5e1] text-[#0f172a] shadow-xl'
          } border shadow-2xl backdrop-blur-md text-xs`}>
            {/* Stepper |< < page > >| */}
            {pinChrome('bottom')}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => {
                  setPage(1);
                  if (!nativeReading) void start('preview', { page: 1 });
                  onPageChange?.(1);
                }}
                className={`p-1 rounded-lg ${workstationTheme === 'dark' ? 'hover:bg-[#222631]' : 'hover:bg-[#f1f5f9]'} disabled:opacity-30 cursor-pointer`}
              >
                <ChevronFirst size={15} aria-label={t('pdfNavFirst')} role="img" className="rtl:rotate-180" />
              </button>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => {
                  const p = Math.max(1, page - 1);
                  setPage(p);
                  if (!nativeReading) void start('preview', { page: p });
                  onPageChange?.(p);
                }}
                className={`p-1 rounded-lg ${workstationTheme === 'dark' ? 'hover:bg-[#222631]' : 'hover:bg-[#f1f5f9]'} disabled:opacity-30 cursor-pointer`}
              >
                <ChevronLeft size={15} aria-label={t('pdfNavPrevious')} role="img" className="rtl:rotate-180" />
              </button>
              <span className="font-mono font-bold px-2">
                <input aria-label={t('page')} type="number" min={1} max={totalPages} value={page} onChange={event => {
                  const requested = Number(event.target.value);
                  const total = totalPages;
                  if (!Number.isInteger(requested) || requested < 1 || requested > total) return;
                  setPage(requested);
                  if (!nativeReading) void start('preview', { page: requested });
                  onPageChange?.(requested);
                }} className="w-12 rounded border border-subtle bg-canvas px-1 py-0.5 text-center text-main" /> / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => {
                  const p = Math.min(totalPages, page + 1);
                  setPage(p);
                  if (!nativeReading) void start('preview', { page: p });
                  onPageChange?.(p);
                }}
                className={`p-1 rounded-lg ${workstationTheme === 'dark' ? 'hover:bg-[#222631]' : 'hover:bg-[#f1f5f9]'} disabled:opacity-30 cursor-pointer`}
              >
                <ChevronRight size={15} aria-label={t('pdfNavNext')} role="img" className="rtl:rotate-180" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => {
                  const p = totalPages;
                  setPage(p);
                  if (!nativeReading) void start('preview', { page: p });
                  onPageChange?.(p);
                }}
                className={`p-1 rounded-lg ${workstationTheme === 'dark' ? 'hover:bg-[#222631]' : 'hover:bg-[#f1f5f9]'} disabled:opacity-30 cursor-pointer`}
              >
                <ChevronLast size={15} aria-label={t('pdfNavLast')} role="img" className="rtl:rotate-180" />
              </button>
            </div>

            <div className={`h-4 border-e ${workstationTheme === 'dark' ? 'border-[#282d3b]' : 'border-[#e2e8f0]'}`} />

            {/* Layout Toggle */}
            <div className={`flex items-center gap-1 ${workstationTheme === 'dark' ? 'bg-[#181a20] border-[#262a34]' : 'bg-[#f1f5f9] border-[#cbd5e1]'} p-0.5 rounded-lg border`}>
              <button
                type="button"
                onClick={() => setViewMode('single')}
                title={t('pdfLayoutSingle')}
                className={`p-1 rounded text-[11px] cursor-pointer ${viewMode === 'single' ? (workstationTheme === 'dark' ? 'bg-[#262a34] text-white' : 'bg-white text-[#0f172a] shadow-xs') : (workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]')}`}
              >
                1-p
              </button>
              <button
                type="button"
                onClick={() => setViewMode('double')}
                title={t('pdfLayoutSpread')}
                className={`p-1 rounded text-[11px] cursor-pointer ${viewMode === 'double' ? (workstationTheme === 'dark' ? 'bg-[#262a34] text-white' : 'bg-white text-[#0f172a] shadow-xs') : (workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]')}`}
              >
                2-p
              </button>
              <button
                type="button"
                onClick={() => setViewMode('scroll')}
                title={t('pdfLayoutScroll')}
                className={`p-1 rounded text-[11px] cursor-pointer ${viewMode === 'scroll' ? (workstationTheme === 'dark' ? 'bg-[#262a34] text-white' : 'bg-white text-[#0f172a] shadow-xs') : (workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]')}`}
              >
                Scroll
              </button>
            </div>

            <div className={`h-4 border-e ${workstationTheme === 'dark' ? 'border-[#282d3b]' : 'border-[#e2e8f0]'}`} />

            {/* Zoom Slider */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setZoom(Math.max(50, zoom - 10))}
                className={`p-1 rounded ${workstationTheme === 'dark' ? 'hover:bg-[#222631]' : 'hover:bg-[#f1f5f9]'} cursor-pointer`}
              >
                <ZoomOut size={13} />
              </button>
              <input
                type="range"
                min="50"
                max="300"
                step="10"
                value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                className={`w-16 h-1 ${workstationTheme === 'dark' ? 'bg-[#282d3b]' : 'bg-[#cbd5e1]'} rounded-lg appearance-none cursor-pointer accent-emerald-500`}
              />
              <button
                type="button"
                onClick={() => setZoom(Math.min(300, zoom + 10))}
                className={`p-1 rounded ${workstationTheme === 'dark' ? 'hover:bg-[#222631]' : 'hover:bg-[#f1f5f9]'} cursor-pointer`}
              >
                <ZoomIn size={13} />
              </button>
              <span className={`font-mono text-[10px] ${workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]'} w-9 text-end`}>{zoom}%</span>
            </div>
          </div>
          </div>
        </main>

        <aside data-reader-chrome="tools" className={`w-[275px] shrink-0 border-s ${
          workstationTheme === 'dark'
            ? 'border-[#1f2229] bg-[#131519] text-[#e5e7eb]'
            : 'border-[#e2e8f0] bg-white text-[#111827]'
        } ${mode === 'organize' ? 'hidden md:flex' : 'flex'} flex-col min-h-0 overflow-y-auto p-3 space-y-3.5 text-sm`}>
          {/* PDF Processor LIVE Header */}
          {pinChrome('tools')}
          {annotationPanel?.open ? <div data-pdf-annotations-panel className="flex-1 min-h-0 overflow-hidden">{annotationPanel.content}</div> : <>
          <div className={`p-3 rounded-xl ${
            workstationTheme === 'dark'
              ? 'bg-gradient-to-br from-[#181c25] to-[#141b18] border-[#232c3c]'
              : 'bg-gradient-to-br from-[#f8fafc] to-[#f0fdf4] border-[#e2e8f0]'
          } border shadow-sm space-y-1.5`}>
            <div className="flex items-center justify-between">
              <span className={`font-bold text-xs ${workstationTheme === 'dark' ? 'text-white' : 'text-[#0f172a]'} flex items-center gap-1.5`}>
                <Cpu size={14} className="text-emerald-500 dark:text-emerald-400" />
                {t('pdfProcessorLiveTitle')}
              </span>
              <span role="status" className={`px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider ${engineStatus.status === 'ready' || engineStatus.status === 'processing' ? `bg-emerald-500/20 ${workstationTheme === 'dark' ? 'text-emerald-300' : 'text-emerald-900'}` : `bg-amber-500/20 ${workstationTheme === 'dark' ? 'text-amber-300' : 'text-amber-900'}`}`}>
                {t(engineStatus.status === 'ready' || engineStatus.status === 'processing' ? 'pdfEngineLive' : engineStatus.status === 'starting' ? 'stirlingEngineStarting' : 'pdfEngineOffline')}
              </span>
            </div>
            <p className={`text-[10px] ${workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]'} font-mono`}>
              {t('pdfProcessorTelemetry', {
                pipelines: processorTelemetry.activePipelines,
                today: processorTelemetry.processedToday,
                folders: processorTelemetry.watchedFolders ?? watchedFoldersList.length,
              })}
            </p>
          </div>

          {/* Collapsible POLICIES Accordion */}
          <div className={`rounded-xl border ${
            workstationTheme === 'dark'
              ? 'border-[#222631] bg-[#161921]'
              : 'border-[#e2e8f0] bg-[#f8fafc]'
          } overflow-hidden`}>
            <button
              type="button"
              onClick={() => setIsPoliciesOpen(!isPoliciesOpen)}
              className={`w-full flex items-center justify-between p-2.5 text-start font-bold text-xs ${
                workstationTheme === 'dark' ? 'text-white hover:bg-[#1a1e27]' : 'text-[#0f172a] hover:bg-[#f1f5f9]'
              } transition-all cursor-pointer`}
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-500 dark:text-emerald-400" />
                POLICIES
              </span>
              <ChevronDown size={14} className={`transition-transform ${isPoliciesOpen ? 'rotate-180' : ''}`} />
            </button>
            {isPoliciesOpen && (
              <div className={`p-2.5 border-t ${
                workstationTheme === 'dark' ? 'border-[#222631] text-[#a0a6b7]' : 'border-[#e2e8f0] text-[#475569]'
              } space-y-2 text-[11px]`}>
                <div>
                  <span className={`font-bold ${workstationTheme === 'dark' ? 'text-white' : 'text-[#0f172a]'} block`}>{t('pdfPolicyIngestion')}</span>
                  <span className="text-[10px]">{t('pdfPolicyIngestionRule1')}, {t('pdfPolicyIngestionRule2')}</span>
                </div>
                <div>
                  <span className={`font-bold ${workstationTheme === 'dark' ? 'text-white' : 'text-[#0f172a]'} block`}>{t('pdfPolicySecurity')}</span>
                  <span className="text-[10px]">{t('pdfPolicySecurityRule1')} &amp; {t('pdfPolicySecurityRule3')}</span>
                </div>
                <div>
                  <span className={`font-bold ${workstationTheme === 'dark' ? 'text-white' : 'text-[#0f172a]'} block`}>{t('pdfPolicyCompliance')}</span>
                  <span className="text-[10px]">{t('pdfPolicyComplianceRule2')}</span>
                </div>
                <div>
                  <span className={`font-bold ${workstationTheme === 'dark' ? 'text-white' : 'text-[#0f172a]'} block`}>{t('pdfPolicyRouting')} &amp; {t('pdfPolicyRetention')}</span>
                  <span className="text-[10px]">{t('pdfPolicyRetentionRule2')} &amp; {t('pdfPolicyRoutingRule2')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Tool Directory / Tools View */}
          {toolDirectoryOpen ? (
            <PdfToolDirectory
              capabilities={capabilities}
              labels={featureKeys}
              disabled={!session || starting || job?.state === 'running'}
              onSelect={(selected, selectedMode) => {
                setTool(selected);
                setMode(selectedMode);
                setToolDirectoryOpen(false);
              }}
            />
          ) : (
            <button
              type="button"
              className="flex items-center gap-2 text-start text-xs text-[#a0a6b7] hover:text-white"
              onClick={() => setToolDirectoryOpen(true)}
            >
              <ChevronLeft size={14} className="rtl:rotate-180" />
              {t('pdfDirectoryBack')}
            </button>
          )}
          {session && !toolDirectoryOpen && (
            <PdfWorkstationTools
              getOrganizerPages={mode === 'organize' ? () => {
                if (pageEditorRef.current?.sessionId !== session.id) throw new Error('Organizer unavailable');
                return pageEditorRef.current.getPages();
              } : undefined}
              onAppendPages={mode === 'organize' ? pages => {
                if (pageEditorRef.current?.sessionId !== session.id) throw new Error('Organizer unavailable');
                pageEditorRef.current.appendPages(pages);
              } : undefined}
              key={`${session.id}:${tool}`}
              tool={tool}
              mode={mode}
              session={session}
              page={page}
              rect={rect}
              inspection={inspection}
              output={output}
              thumbnails={thumbnails}
              boxDrawn={boxPage === page}
              onCanvasUse={handleCanvasUse}
              text={text}
              setText={setText}
              busy={starting || job?.state === 'running'}
              run={(op, pl) => void start(op, pl)}
              onPage={p => {
                setPage(p);
                void start('preview', { page: p });
              }}
              onSource={src => extraSessions.current.push(src.id)}
            />
          )}

          {/* Job State & Diagnostics */}
          {(error || job?.error) && (
            <p role="alert" className="text-xs text-red-500">
              {t(
                job?.error === 'text-does-not-fit'
                  ? 'pdfTextDoesNotFit'
                  : job?.error === 'signed-document-locked'
                  ? 'pdfSignedLocked'
                  : error === 'source-required'
                  ? 'pdfSuiteSourceRequired'
                  : error === 'encrypted' || job?.error === 'encrypted'
                  ? 'pdfSuiteEncrypted'
                  : error === 'source-changed' || job?.error === 'source-changed'
                  ? 'pdfSuiteSourceChanged'
                  : error === 'engine-missing' || job?.error === 'engine-missing'
                  ? 'pdfEngineComponentMissing'
                  : job?.error === 'no-tables'
                  ? 'pdfNoTablesFound'
                  : job?.error === 'no-text'
                  ? 'pdfNoTextFound'
                  : job?.error === 'redaction-unverified'
                  ? 'pdfRedactionUnverified'
                  : 'pdfSuiteFailure',
              )}
            </p>
          )}

          {job?.state === 'running' && (
            <div role="status" className="p-3 rounded-xl border border-sky-500/30 bg-sky-500/10 space-y-2">
              <p className="text-xs text-sky-900 dark:text-sky-200">
                {t('pdfSuiteProgress', { current: job.current, total: job.total })}
              </p>
              <button
                type="button"
                onClick={() => {
                  void window.electronAPI.pdfEditor
                    .cancel(job.id)
                    .then(() => window.electronAPI.pdfEditor.status(job.id))
                    .then(res => {
                      if (res.ok) setJob(res.data);
                    })
                    .catch(() => setError('storage'));
                }}
                className="text-xs underline text-sky-700 dark:text-sky-300"
              >
                {t('pdfSuiteCancel')}
              </button>
            </div>
          )}

          {/* Save Output Controls */}
          {output?.outputs && (
            <section ref={stagedOutputs} data-pdf-staged-outputs className="space-y-3 border-t border-subtle pt-3">
              <p className="text-xs text-muted">{t('pdfStagedHint')}</p>
              <label className="block text-xs space-y-1">
                <span>{t('pdfSaveMode')}</span>
                <select
                  value={effectiveSaveMode}
                  onChange={event => setSaveMode(event.target.value as typeof saveMode)}
                  className="block w-full rounded border border-subtle bg-canvas p-2 text-xs"
                >
                  <option value="copy">{t('pdfSuiteSaveCopy')}</option>
                  {output.output?.format === 'pdf' && (
                    <>
                      {session?.sha256 && <option value="overwrite">{t('pdfSafeSave')}</option>}
                      {session?.workId && <option value="edition">{t('pdfSaveEdition')}</option>}
                      <option value="new-work">{t('pdfSaveWork')}</option>
                    </>
                  )}
                </select>
              </label>
              {(effectiveSaveMode === 'edition' || effectiveSaveMode === 'new-work') && (
                <label className="block text-xs space-y-1">
                  <span>{t('pdfDocumentTitle')}</span>
                  <input
                    dir="auto"
                    value={title}
                    onChange={event => setTitle(event.target.value)}
                    className="block w-full rounded border border-subtle bg-canvas p-2 text-xs"
                  />
                </label>
              )}
              {effectiveSaveMode === 'overwrite' && <p className="text-xs text-muted">{t('pdfBackupWarning')}</p>}
              {output.outputs.map((item, index) => (
                <button
                  type="button"
                  key={item.filename}
                  className="rounded-lg bg-emerald-700 text-white px-3 py-2 w-full text-xs font-semibold break-all hover:bg-emerald-800 transition-colors"
                  disabled={starting || job?.state === 'running' || ((effectiveSaveMode === 'edition' || effectiveSaveMode === 'new-work') && !title.trim())}
                  onClick={() => {
                    void api()
                      .save({ jobId: output.id, outputIndex: index, mode: effectiveSaveMode, title })
                      .then(result => {
                        if (result.ok === true) {
                          setSaved(result.data.saved);
                          if (result.data.session) {
                            if (result.data.session.id !== session?.id) {
                              setSources([]);
                              switchSource(result.data.session);
                              setJob(null);
                            } else setSession(result.data.session);
                          }
                        } else setError(result.error);
                      })
                      .catch(() => setError('storage'));
                  }}
                >
                  {t('pdfSaveOutput', { name: item.filename })}
                </button>
              ))}
            </section>
          )}

          {saved && <p role="status" className="text-xs text-emerald-600 font-bold">{t('pdfSuiteSaved')}</p>}

          <button
            type="button"
            onClick={() => setIsToolsHubOpen(true)}
            className="w-full py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-all text-center block mt-3"
          >
            {t('pdfMoreToolsLink')}
          </button>
          </>}
        </aside>
      </div>

      {/* Standalone Stirling-PDF Tools & Processor Hub Modal */}
      {isToolsHubOpen && (
        <StirlingToolsHub
          initialView={hubView}
          onClose={() => { setHubView('columns'); setIsToolsHubOpen(false); }}
          onOpenInWorkstation={() => {
            setIsToolsHubOpen(false);
          }}
        />
      )}

      {/* Version History Drawer */}
      {isVersionHistoryOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-opacity"
            onClick={() => setIsVersionHistoryOpen(false)}
          />
          <aside
            dir={dir}
            className={`fixed top-0 bottom-0 end-0 z-50 w-80 sm:w-96 shadow-2xl border-s flex flex-col ${
              workstationTheme === 'dark'
                ? 'bg-[#14161c] border-[#262c3b] text-[#e1e4ea]'
                : 'bg-white border-[#cbd5e1] text-[#0f172a]'
            }`}
          >
            {/* Drawer Header */}
            <div className={`p-4 border-b ${workstationTheme === 'dark' ? 'border-[#262c3b]' : 'border-[#e2e8f0]'} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <History className="size-5 text-emerald-500" />
                <div>
                  <h3 className="text-sm font-bold">{t('pdfVersionHistory')}</h3>
                  <p className={`text-[10px] ${workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>
                    {session?.filename || 'PDF Document'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsVersionHistoryOpen(false)}
                className={`p-1.5 rounded-lg ${workstationTheme === 'dark' ? 'hover:bg-[#222631] text-[#8b92a5]' : 'hover:bg-[#f1f5f9] text-[#64748b]'} transition-colors cursor-pointer`}
              >
                <X size={16} />
              </button>
            </div>

            {/* Notification Banner */}
            {versionActionMessage && (
              <div className="mx-4 mt-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                <Check size={14} />
                <span>{versionActionMessage}</span>
              </div>
            )}

            <div className="p-4 text-[11px] text-muted">
              {t('pdfVersionHistoryDesc')}
            </div>

            {/* Versions List */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
              {loadingVersions ? (
                <div className="text-center py-10 text-xs text-muted">
                  <div className="inline-block size-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2" />
                  <p>{t('pdfVersionsLoading')}</p>
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-xl border border-dashed border-subtle space-y-2">
                  <History className="size-8 mx-auto text-muted/50" />
                  <p className="text-xs text-muted">{t('pdfVersionEmpty')}</p>
                </div>
              ) : (
                versions.map((ver, idx) => {
                  const sizeFormatted = ver.size > 1024 * 1024
                    ? `${(ver.size / (1024 * 1024)).toFixed(2)} MB`
                    : `${Math.round(ver.size / 1024)} KB`;
                  return (
                    <div
                      key={ver.filename}
                      className={`p-3 rounded-xl border transition-all ${
                        workstationTheme === 'dark'
                          ? 'bg-[#181a20] border-[#262a34] hover:border-[#383e4e]'
                          : 'bg-[#f8fafc] border-[#cbd5e1] hover:border-[#94a3b8]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs">
                              {idx === 0 ? t('pdfVersionLatest') : t('pdfVersionNumber', { number: versions.length - idx })}
                            </span>
                            {idx === 0 && (
                              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-500 text-[9px] font-bold">
                                Current
                              </span>
                            )}
                          </div>
                          <span className={`text-[10px] ${workstationTheme === 'dark' ? 'text-[#8b92a5]' : 'text-[#64748b]'} block font-mono mt-0.5`}>
                            {ver.dateStr || new Date(ver.timestamp).toLocaleString(lang)}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-subtle/20 text-muted">
                          {sizeFormatted}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-subtle/40">
                        <button
                          type="button"
                          disabled={starting}
                          onClick={() => void handleRestoreVersion(ver.filename)}
                          className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                        >
                          <RotateCcw size={12} />
                          <span>{t('pdfVersionRestore')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteVersion(ver.filename)}
                          className={`p-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer`}
                          title={t('pdfVersionDelete')}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </>
      )}
    </aside>
  );
}
