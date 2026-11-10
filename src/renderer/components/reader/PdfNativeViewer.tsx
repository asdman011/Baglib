'use client';
import { errorMessage } from '../../../shared/errors';
import { PdfMarkupLayer } from './PdfMarkupLayer';
import { textStyleOf } from '../../../shared/pdf-markup';
import type { PdfViewPreview } from '../../../shared/types/pdf-editor';


import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, AlertCircle } from 'lucide-react';
import type { ReaderTheme, TOCItem } from '../../libs/reader/types';
import type { KnowledgeItemDTO } from '../../../shared/types/knowledge';
import { getPdfThemeFilter } from '../../libs/reader/typography';
import { readerAssetUrl } from '../../../shared/utils/reader-asset-url';
import { nearbyPdfPages } from '../../../shared/pdf-visible-pages';
import { PdfBitmapCache } from '../../../shared/pdf-bitmap-cache';
import { waitForReaderIdle } from '../../../shared/reader-idle';
import { PdfCanvasPool } from '../../../shared/pdf-canvas-pool';
import { idlePdfTextStream } from '../../../shared/pdf-text-stream';
import { useWorkspace } from '../context/WorkspaceContext';
import { usePdfViewSource } from '../../hooks/usePdfViewSource';
import { PdfViewDocument, type PdfOutlineEntry } from '../../libs/reader/pdf-view-document';

const pageBitmapCaches = new WeakMap<PdfViewDocument, PdfBitmapCache<ImageBitmap>>();
const pageCanvasPools = new WeakMap<PdfViewDocument, PdfCanvasPool<HTMLCanvasElement>>();
const EMPTY_HIGHLIGHTS: KnowledgeItemDTO[] = [];

function canvasPool(doc: PdfViewDocument): PdfCanvasPool<HTMLCanvasElement> {
  let pool = pageCanvasPools.get(doc);
  if (!pool) { pool = new PdfCanvasPool(() => document.createElement('canvas')); pageCanvasPools.set(doc, pool); }
  return pool;
}

function bitmapCache(doc: PdfViewDocument): PdfBitmapCache<ImageBitmap> {
  let cache = pageBitmapCaches.get(doc);
  if (!cache) { cache = new PdfBitmapCache<ImageBitmap>(); pageBitmapCaches.set(doc, cache); }
  return cache;
}

/** Encodes a painted page into the small image shown instantly the next time this book opens here. */
async function encodePreview(bitmap: ImageBitmap, width: number, height: number, pages: number): Promise<PdfViewPreview | null> {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const ratio = Math.min(1, 900 / bitmap.width);
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * ratio), Math.round(bitmap.height * ratio));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.72 });
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve({ image: String(reader.result), width, height, pages });
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export interface NormalizedRect {
  x: number;      // 0 to 100 percentage
  y: number;      // 0 to 100 percentage
  width: number;  // 0 to 100 percentage
  height: number; // 0 to 100 percentage
}

export interface PdfSelectionInfo {
  pageNumber: number;
  text: string;
  rects: NormalizedRect[];
  boundingRect: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

interface PdfNativeViewerProps {
  fileUrl: string;
  useViewCache?: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onTotalPagesLoaded?: (total: number) => void;
  onOutlineLoaded?: (outline: TOCItem[]) => void;
  onPdfDocLoaded?: (doc: PdfViewDocument) => void;
  viewMode?: 'single' | 'two-column' | 'scrolled';
  theme?: ReaderTheme;
  tintPages?: boolean;
  zoom?: number; // scale multiplier e.g. 1.0, 1.25
  autoCropMargins?: boolean;
  direction?: 'rtl' | 'ltr';
  highlights?: KnowledgeItemDTO[];
  activeSelectionInfo?: PdfSelectionInfo | null;
  onSelectionChange?: (selection: PdfSelectionInfo | null) => void;
  onHighlightClick?: (highlight: KnowledgeItemDTO, e: React.MouseEvent) => void;
  contentContainerRef?: React.RefObject<HTMLDivElement | null>;
}

// Semantic colors mapping
export const HIGHLIGHT_COLOR_HEX: Record<string, string> = {
  amber: '#FACC15',
  yellow: '#FACC15',
  emerald: '#4ADE80',
  green: '#4ADE80',
  rose: '#F87171',
  red: '#F87171',
  sky: '#60A5FA',
  blue: '#60A5FA',
  violet: '#C084FC',
  purple: '#C084FC',
};

/**
 * Merge adjacent/overlapping rects on the same line so highlights look unified.
 */
export function mergeNormalizedRects(rects: NormalizedRect[]): NormalizedRect[] {
  const valid = rects.filter((r) => r.width >= 0.5 && r.height >= 0.5 && r.x >= 0 && r.y >= 0);
  if (valid.length <= 1) return valid;
  const sorted = [...valid].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: NormalizedRect[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const isSameLine = Math.abs(current.y - next.y) < 1.4 && Math.abs(current.height - next.height) < 1.8;
    const overlapsOrAdjacent = next.x <= current.x + current.width + 1.2;

    if (isSameLine && overlapsOrAdjacent) {
      const newRight = Math.max(current.x + current.width, next.x + next.width);
      current.width = newRight - current.x;
      current.height = Math.max(current.height, next.height);
      current.y = Math.min(current.y, next.y);
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}

/**
 * Parses highlight location JSON storing { page: number, rects: NormalizedRect[] }
 */
export function parseHighlightLocation(locStr: string): { page: number; rects: NormalizedRect[] } {
  try {
    if (locStr.startsWith('{')) {
      const parsed = JSON.parse(locStr);
      if (parsed.rects && Array.isArray(parsed.rects)) {
        return {
          page: Number(parsed.page) || 1,
          rects: parsed.rects.filter((r: { width: number; height: number }) => r && r.width >= 0.5 && r.height >= 0.5),
        };
      }
    }
  } catch {
    // Fallback
  }
  const pageNum = parseInt(locStr, 10) || 1;
  return { page: pageNum, rects: [] };
}

/**
 * Individual PDF Page Stack Component (Canvas + Highlight Layer + TextLayer)
 */
interface PdfPageItemProps {
  pdfDoc: PdfViewDocument;
  pageNumber: number;
  scale: number;
  theme: ReaderTheme;
  autoCropMargins: boolean;
  pageHighlights: KnowledgeItemDTO[];
  activeSelectionRects?: NormalizedRect[];
  onHighlightClick?: (highlight: KnowledgeItemDTO, e: React.MouseEvent) => void;
  onPageMeasured?: (pageNum: number, width: number, height: number) => void;
  onPagePainted?: (doc: PdfViewDocument, page: number) => void;
}

const PdfPageItem = React.memo(function PdfPageItem({
  pdfDoc,
  pageNumber,
  scale,
  theme,
  autoCropMargins,
  pageHighlights,
  activeSelectionRects,
  onHighlightClick,
  onPageMeasured,
  onPagePainted,
}: PdfPageItemProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const isDarkTheme = ['dark', 'night', 'midnight', 'dusk'].includes(theme);

  useEffect(() => {
    let isCancelled = false;
    const renderingAbort = new AbortController();
    const pool = canvasPool(pdfDoc);
    const canvas = pool.acquire();
    delete canvas.dataset.pdfPaintedAt;
    canvas.dataset.pdfRenderScale = String(scale);
    for (const key of ['pdfPageRequestedAt', 'pdfPageReadyAt', 'pdfRasterStartedAt', 'pdfRasterFinishedAt', 'pdfPreviewPaintedAt']) delete canvas.dataset[key];
    canvas.className = 'pdf-canvas block absolute inset-0 w-full h-full pointer-events-none';
    canvasHostRef.current?.appendChild(canvas);
    let textTimer: ReturnType<typeof setTimeout> | undefined;
    let textLayer: pdfjsLib.TextLayer | undefined;
    let textGeneration = 0;
    let hydrateText: (() => Promise<void>) | undefined;
    let textReady = false;
    const scheduleText = () => {
      if (textReady || isCancelled) return;
      textGeneration++;
      textLayer?.cancel();
      clearTimeout(textTimer);
      textTimer = setTimeout(() => { void hydrateText?.(); }, 150);
    };
    const handleScroll = (event: Event) => {
      if (event.target instanceof Element && event.target.contains(containerRef.current)) scheduleText();
    };
    document.addEventListener('scroll', handleScroll, true);

    const renderPage = async () => {
      try {
        setIsRendering(true);
        canvas.dataset.pdfPageRequestedAt = String(performance.now());
        const info = await pdfDoc.pageInfo(pageNumber);
        if (isCancelled) return;
        canvas.dataset.pdfPageReadyAt = String(performance.now());

        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        containerRef.current!.dataset.pdfWidth = String(info.width);
        containerRef.current!.dataset.pdfHeight = String(info.height);
        const displayWidth = Math.round(info.width * scale);
        const displayHeight = Math.round(info.height * scale);

        setDimensions({ width: displayWidth, height: displayHeight });
        onPageMeasured?.(pageNumber, info.width, info.height);

        // 1. Layer 1: Render Canvas (HiDPI)
        const pixelWidth = Math.floor(info.width * scale * dpr), pixelHeight = Math.floor(info.height * scale * dpr);
        if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
        if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

          const cache = bitmapCache(pdfDoc);
          const cacheKey = `${pageNumber}@${scale}@${dpr}`;
          const cached = cache.get(cacheKey);
          const preview = cached || cache.preview(`${pageNumber}@`);
          const drawStarted = performance.now();
          if (preview) {
            ctx.drawImage(preview, 0, 0, displayWidth, displayHeight);
            canvas.dataset.pdfPreviewPaintedAt = String(performance.now());
            setIsRendering(false);
          }
          canvas.dataset.pdfPaintSource = cached ? 'cache' : 'raster';
          if (cached) canvas.dataset.pdfCacheDrawMs = String(performance.now() - drawStarted);
          else delete canvas.dataset.pdfCacheDrawMs;
          if (!cached) {
            canvas.dataset.pdfRasterStartedAt = String(performance.now());
            const bitmap = await pdfDoc.render(pageNumber, scale, dpr, renderingAbort.signal);
            if (isCancelled) { bitmap?.close(); return; }
            if (!bitmap) { setIsRendering(false); return; }
            ctx.drawImage(bitmap, 0, 0, displayWidth, displayHeight);
            cache.set(cacheKey, bitmap);
            canvas.dataset.pdfPaintSource = pdfDoc.usesRasterHost ? 'worker' : 'raster';
            canvas.dataset.pdfRasterFinishedAt = String(performance.now());
          }
        }

        if (isCancelled) return;

        canvas.dataset.pdfPaintedAt = String(performance.now());
        onPagePainted?.(pdfDoc, pageNumber);
        setIsRendering(false);
        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.width = `${displayWidth}px`;
          textLayerDiv.style.height = `${displayHeight}px`;
          textLayerDiv.style.setProperty('--scale-factor', `${scale}`);
          textLayerDiv.style.setProperty('--total-scale-factor', `${scale}`);

          hydrateText = async () => {
            const generation = textGeneration;
            try {
              const textContent = await pdfDoc.textContent(pageNumber);
              if (isCancelled || generation !== textGeneration || textReady) return;
              textLayerDiv.replaceChildren();
              const viewport = { scale, rotation: info.rotation, rawDims: info.rawDims } as unknown as pdfjsLib.PageViewport;
              textLayer = new pdfjsLib.TextLayer({ textContentSource: idlePdfTextStream(textContent as Parameters<typeof idlePdfTextStream>[0]) as ReadableStream, container: textLayerDiv, viewport });
              await textLayer.render();
              if (!isCancelled && generation === textGeneration) textReady = true;
            } catch (error) {
              if (!isCancelled && generation === textGeneration) console.warn('[PdfNativeViewer] Text layer hydration failed:', error);
            }
          };
          scheduleText();
        }

        setIsRendering(false);
      } catch (err: unknown) {
        if (isCancelled) return;
        console.error(`[PdfNativeViewer] Error rendering page ${pageNumber}:`, err);
        setIsRendering(false);
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      renderingAbort.abort();
      textGeneration++;
      clearTimeout(textTimer);
      textLayer?.cancel();
      document.removeEventListener('scroll', handleScroll, true);
      canvas.remove();
      pool.release(canvas);
    };
  }, [pdfDoc, pageNumber, scale, onPageMeasured, onPagePainted]);

  // Compute theme filter for PDF canvas
  const canvasFilter = useMemo(() => {
    return getPdfThemeFilter(theme);
  }, [theme]);

  return (
    <div
      ref={containerRef}
      data-page-number={pageNumber}
      dir="ltr"
      className="pdf-page-container relative mx-auto my-3 bg-white shadow-2xl transition-transform duration-200 select-text rounded-[6px] overflow-hidden"
      style={{
        direction: 'ltr',
        unicodeBidi: 'normal',
        textAlign: 'left',
        position: 'relative',
        contain: 'layout style paint',
        display: 'block',
        marginBottom: '24px',
        width: dimensions.width ? `${dimensions.width}px` : 'auto',
        height: dimensions.height ? `${dimensions.height}px` : 'auto',
        minHeight: dimensions.height ? `${dimensions.height}px` : '400px',
        transform: autoCropMargins ? 'scale(1.15) translateY(-0.5%)' : 'none',
        transformOrigin: 'top center',
      }}
    >
      {/* Layer 1: Visual Canvas */}
      <div
        ref={canvasHostRef}
        className="canvasWrapper absolute inset-0 w-full h-full pointer-events-none overflow-hidden"
        dir="ltr"
        style={{ direction: 'ltr', unicodeBidi: 'normal', filter: canvasFilter }}
      />

      {/* Layer 2: Persistent Highlight Overlay & Active Transient Selection */}
      <div
        className="pdf-highlight-layer absolute inset-0 pointer-events-none z-10 overflow-hidden"
        dir="ltr"
        style={{
          direction: 'ltr',
          textAlign: 'left',
          overflow: 'hidden',
          pointerEvents: 'none',
          mixBlendMode: isDarkTheme ? 'screen' : 'multiply',
        }}
      >
        {/* Active transient selection highlight overlay */}
        {activeSelectionRects &&
          activeSelectionRects
            .filter((r) => r.width >= 0.5 && r.height >= 0.5 && !(r.x <= 0.2 && r.width < 2))
            .map((r, idx) => (
              <div
                key={`active-selection-${idx}`}
                className="pdf-active-selection-rect absolute rounded-xs pointer-events-none"
                style={{
                  left: `${r.x}%`,
                  top: `${r.y}%`,
                  width: `${r.width}%`,
                  height: `${r.height}%`,
                  backgroundColor: 'rgba(59, 130, 246, 0.35)',
                  outline: 'none',
                  border: 'none',
                }}
              />
            ))}

        {pageHighlights.map((highlight) => {
          const { rects } = parseHighlightLocation(highlight.location);
          const colorHex = HIGHLIGHT_COLOR_HEX[highlight.color || 'amber'] || '#FACC15';
          // Underline and strike-out (Wave 9.1) draw a line under or through the words instead of a fill.
          const style = textStyleOf(highlight.location);

          return (
            <React.Fragment key={highlight.id}>
              {rects.map((r, idx) => (
                <div
                  key={idx}
                  data-pdf-text-mark={style}
                  className="pdf-highlight-rect absolute rounded-xs cursor-pointer pointer-events-auto transition-opacity hover:opacity-80"
                  onClick={(e) => {
                    e.stopPropagation();
                    onHighlightClick?.(highlight, e);
                  }}
                  title={highlight.quotedText || ''}
                  style={style === 'highlight' ? {
                    left: `${r.x}%`,
                    top: `${r.y}%`,
                    width: `${r.width}%`,
                    height: `${r.height}%`,
                    backgroundColor: colorHex,
                    opacity: isDarkTheme ? 0.6 : 0.45,
                    outline: 'none',
                    border: 'none',
                  } : {
                    left: `${r.x}%`,
                    top: `${style === 'underline' ? r.y + r.height * 0.88 : r.y + r.height * 0.48}%`,
                    width: `${r.width}%`,
                    height: `${Math.max(0.18, r.height * 0.1)}%`,
                    minHeight: '2px',
                    backgroundColor: colorHex,
                    opacity: 0.95,
                    outline: 'none',
                    border: 'none',
                  }}
                />
              ))}
            </React.Fragment>
          );
        })}
      </div>

      {/* Layer 3: Interactive Text Selection Layer */}
      <div
        ref={textLayerRef}
        dir="ltr"
        className="textLayer absolute inset-0 select-text cursor-text z-20 overflow-hidden"
        style={{
          direction: 'ltr',
          unicodeBidi: 'normal',
          textAlign: 'left',
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          opacity: 1,
          lineHeight: 1,
          contain: 'layout style paint',
        }}
      />

      {/* Layer 4: study shapes, text boxes and comment pins, and the drawing surface for shape tools */}
      <PdfMarkupLayer pageNumber={pageNumber} items={pageHighlights} />

      {/* Loading Overlay */}
      {isRendering && (
        <div className="absolute inset-0 bg-surface/40 backdrop-blur-xs flex items-center justify-center z-30 pointer-events-none transition-opacity">
          <Loader2 className="w-6 h-6 animate-spin text-pale-sky-500 opacity-60" />
        </div>
      )}
    </div>
  );
});

interface PdfScrolledPageProps extends PdfPageItemProps {
  active: boolean;
  placeholderWidth: number;
  placeholderHeight: number;
}

const PdfScrolledPage = React.memo(function PdfScrolledPage({ active, placeholderWidth, placeholderHeight, ...props }: PdfScrolledPageProps) {
  return <div data-page-number={props.pageNumber} className="pdf-page-holder w-full flex justify-center">
    {active ? <PdfPageItem {...props} /> : <div
      data-page-number={props.pageNumber}
      dir="ltr"
      className="pdf-page-container relative mx-auto my-3 bg-white/5 border border-subtle/30 rounded-xs flex items-center justify-center text-muted text-xs font-mono select-none"
      style={{ direction: 'ltr', unicodeBidi: 'normal', width: `${placeholderWidth}px`, height: `${placeholderHeight}px` }}
    />}
  </div>;
});

/**
 * Extracts a local filesystem path from a baglib-asset, local-pdf, or file URL.
 */
export function extractDiskPathFromUrl(urlStr: string): string | null {
  try {
    let clean = urlStr.split('?')[0].split('#')[0];
    clean = clean.replace(/^(?:baglib-asset|local-pdf|file):\/\/?/i, '');
    clean = decodeURIComponent(clean);
    clean = clean.replace(/^\/+/, '');
    if (/^[a-zA-Z]:[\\/]/.test(clean)) {
      return clean;
    }
    if (/^[a-zA-Z][\\/]/.test(clean)) {
      return `${clean[0]}:${clean.slice(1)}`;
    }
    if (clean.startsWith('/') || clean.startsWith('\\')) {
      return clean;
    }
    return clean || null;
  } catch {
    return null;
  }
}

/**
 * Normalizes any PDF file URL or local path to a string that pdfjsLib.getDocument's
 * getUrlProp can safely parse without throwing "Invalid PDF url data".
 */
export function normalizePdfUrl(rawUrl: unknown): string | null {
  if (!rawUrl) return null;
  if (rawUrl instanceof URL) return rawUrl.href;
  if (typeof rawUrl !== 'string') return null;
  let trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Auto-repair any incoming %3A drive letter in baglib-asset or local-pdf URLs
  // e.g. baglib-asset:///F%3A/... -> baglib-asset:///F:/...
  trimmed = trimmed.replace(/^((?:baglib-asset|local-pdf):\/\/\/??)([a-zA-Z])%3A(\/.*)?$/i, '$1$2:$3');

  // Blob and Data URIs
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  // Recognized URL schemes supported directly in the browser/Electron
  if (/^(https?|baglib-asset|local-pdf):\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Handle file:// protocol (extract path and convert to readerAssetUrl)
  if (trimmed.startsWith('file://')) {
    const withoutScheme = trimmed.replace(/^file:\/\/\/?/i, '');
    let decoded = withoutScheme;
    try {
      decoded = decodeURIComponent(withoutScheme);
    } catch {}
    return readerAssetUrl(decoded);
  }

  // Handle Windows paths: e.g. D:\... or C:/... or \\server\share\...
  if (/^[a-zA-Z]:[\\/]/i.test(trimmed) || trimmed.startsWith('\\\\')) {
    return readerAssetUrl(trimmed);
  }

  // Handle absolute POSIX paths: /var/...
  if (trimmed.startsWith('/')) {
    return readerAssetUrl(trimmed);
  }

  // Fallback: try new URL relative to window.location
  try {
    if (typeof window !== 'undefined' && window.location?.href) {
      return new URL(trimmed, window.location.href).href;
    }
  } catch {
    /* fallback to readerAssetUrl */
  }

  return readerAssetUrl(trimmed);
}

const PdfNativeViewerComponent: React.FC<PdfNativeViewerProps> = ({
  fileUrl,
  useViewCache = true,
  currentPage,
  totalPages,
  onPageChange,
  onTotalPagesLoaded,
  onOutlineLoaded,
  onPdfDocLoaded,
  viewMode = 'single',
  tintPages = false,
  zoom = 1.0,
  autoCropMargins = false,
  direction = 'ltr',
  highlights = EMPTY_HIGHLIGHTS,
  activeSelectionInfo = null,
  onSelectionChange,
  onHighlightClick,
  contentContainerRef,
}) => {
  const { t } = useWorkspace();
  const { url: viewingUrl, preview: instantPreview, rejectCachedSource, savePreview } = usePdfViewSource(fileUrl, extractDiskPathFromUrl(fileUrl), useViewCache, currentPage);
  const [pdfDoc, setPdfDoc] = useState<PdfViewDocument | null>(null);
  const paintBarrier = useRef<{ document: PdfViewDocument; finish: () => void } | null>(null);
  const previewStored = useRef<PdfViewDocument | null>(null);
  const hasInstantPreview = useRef(false);
  useEffect(() => { hasInstantPreview.current = Boolean(instantPreview); }, [instantPreview]);
  const onPagePainted = useCallback((doc: PdfViewDocument, page: number) => {
    if (paintBarrier.current?.document === doc) paintBarrier.current.finish();
    if (previewStored.current === doc) return;
    previewStored.current = doc;
    if (hasInstantPreview.current) return;
    void (async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
      const dpr = window.devicePixelRatio || 1;
      const bitmap = bitmapCache(doc).preview(`${page}@`);
      if (!bitmap || !dpr) return;
      const info = await doc.pageInfo(page);
      const preview = await encodePreview(bitmap, info.width, info.height, doc.numPages);
      if (preview) savePreview(page, preview);
    })().catch(() => undefined);
  }, [savePreview]);
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [calculatedScale, setCalculatedScale] = useState<number>(1.2);
  const [isSelecting, setIsSelecting] = useState(false);
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = contentContainerRef || internalContainerRef;

  // Track page heights in scrolled mode
  const [pageDimensions, setPageDimensions] = useState<Map<number, { width: number; height: number }>>(() => new Map());
  const onPageMeasured = useCallback((page: number, width: number, height: number) => {
    setPageDimensions(previous => {
      const existing = previous.get(page);
      if (existing?.width === width && existing.height === height) return previous;
      return new Map(previous).set(page, { width, height });
    });
  }, []);

  // Visible pages tracking for smooth pre-rendering in Continuous Scroll mode
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => {
    const s = new Set<number>();
    for (let p = Math.max(1, currentPage - 2); p <= currentPage + 3; p++) {
      s.add(p);
    }
    return s;
  });


  const [previousPdfSource, setPreviousPdfSource] = useState<readonly unknown[] | null>(null);
  const inputsPdfSource = [fileUrl, viewingUrl];
  if (previousPdfSource === null || inputsPdfSource.some((value, index) => !Object.is(value, previousPdfSource[index]))) {
    setPreviousPdfSource(inputsPdfSource);
    setIsLoadingDoc(true);
    setLoadError(null);
  }
  // 1. Open the book's one parser pipeline, and always destroy it when the source changes or the viewer unmounts
  useEffect(() => {
    let isCancelled = false;
    let loadedDoc: PdfViewDocument | undefined;
    const backgroundWork = new AbortController();

    const applyOutline = async (doc: PdfViewDocument) => {
      const toToc = (items: PdfOutlineEntry[]): TOCItem[] => items.map(item => ({
        id: `pdf-toc-${item.page}-${Math.random().toString(36).slice(2, 7)}`,
        label: item.title,
        href: `#page=${item.page}`,
        index: item.page - 1,
        subitems: item.items.length ? toToc(item.items) : undefined,
      }));
      const outline = await doc.outline();
      if (outline.length) { onOutlineLoaded?.(toToc(outline)); return; }
      await waitForReaderIdle(document, backgroundWork.signal, 1500);
      // Smart scan of first 15 pages for headings when document outline is absent
      const smartHeadings: TOCItem[] = [];
      for (let pNum = 1; pNum <= Math.min(doc.numPages, 15); pNum++) {
        await waitForReaderIdle(document, backgroundWork.signal);
        if (isCancelled) return;
        try {
          const content = await doc.textContent(pNum);
          let maxFontSize = 0;
          let candidateTitle = '';
          for (const item of content.items) {
            if ('str' in item && item.str && item.str.trim().length > 2) {
              const fontSize = Math.hypot(item.transform?.[0] || 0, item.transform?.[1] || 0) || item.height || 0;
              const isHeadingKeyword = /^(Chapter|الفصل|الباب|المبحث|المطلب|Part|Section|المقدمة|الفهرس|المحتويات|تمهيد)\b/i.test(item.str.trim());
              if (isHeadingKeyword || (fontSize > 16 && fontSize > maxFontSize)) {
                maxFontSize = fontSize;
                candidateTitle = item.str.trim();
              }
            }
          }
          if (candidateTitle) smartHeadings.push({ id: `smart-heading-p${pNum}`, label: candidateTitle, href: `#page=${pNum}`, index: pNum - 1 });
        } catch {
          // Ignore page text scan error
        }
      }
      if (smartHeadings.length > 0) onOutlineLoaded?.(smartHeadings);
      else onOutlineLoaded?.(Array.from({ length: Math.min(doc.numPages, 30) }, (_, index) => ({
        id: `page-${index + 1}`, label: `${t('page')} ${index + 1}`, href: `#page=${index + 1}`, index,
      })));
    };

    const loadDoc = async () => {
      if (!viewingUrl) return;
      const targetUrl = normalizePdfUrl(viewingUrl);
      if (!targetUrl) {
        setIsLoadingDoc(false);
        return;
      }

      try {
        const doc = await PdfViewDocument.open(targetUrl, backgroundWork.signal, () => {
          // A cached derivative failed after opening: the source effect reopens the original at the same page.
          if (!isCancelled && !rejectCachedSource()) setLoadError(t('pdfDocumentLoadFailed'));
        });
        loadedDoc = doc;
        if (isCancelled) { await doc.destroy(); return; }
        const firstPaint = onOutlineLoaded ? new Promise<void>(resolve => {
          const finish = () => { backgroundWork.signal.removeEventListener('abort', finish); resolve(); };
          backgroundWork.signal.addEventListener('abort', finish, { once: true });
          paintBarrier.current = { document: doc, finish };
        }) : undefined;
        setPageDimensions(new Map());
        setPdfDoc(doc);
        setIsLoadingDoc(false);
        onTotalPagesLoaded?.(doc.numPages);
        onPdfDocLoaded?.(doc);

        if (!onOutlineLoaded) return;
        await firstPaint;
        if (isCancelled) return;
        await waitForReaderIdle(document, backgroundWork.signal, 300);
        await applyOutline(doc).catch(tocErr => { if (!isCancelled) console.warn('[PdfNativeViewer] Outline extraction notice:', tocErr); });
      } catch (err: unknown) {
        if (!isCancelled) {
          if (rejectCachedSource()) return;
          const isInvalidPdf =
            (err instanceof Error ? err.name : undefined) === 'InvalidPDFException' ||
            errorMessage(err)?.includes('Invalid PDF structure') ||
            errorMessage(err)?.includes('Missing PDF');
          if (isInvalidPdf) {
            console.warn('[PdfNativeViewer] PDF parsing notice:', errorMessage(err));
          } else {
            console.error('[PdfNativeViewer] Document load error:', err);
          }
          setLoadError(errorMessage(err) || t('pdfDocumentLoadFailed'));
          setIsLoadingDoc(false);
        }
      }
    };

    loadDoc();

    return () => {
      isCancelled = true;
      backgroundWork.abort();
      if (paintBarrier.current?.document === loadedDoc) paintBarrier.current = null;
      if (loadedDoc) {
        pageBitmapCaches.get(loadedDoc)?.dispose();
        pageBitmapCaches.delete(loadedDoc);
        pageCanvasPools.get(loadedDoc)?.dispose();
        pageCanvasPools.delete(loadedDoc);
        void loadedDoc.destroy();
      }
    };
  }, [fileUrl, viewingUrl, rejectCachedSource]);

  useEffect(() => {
    if (!pdfDoc || viewMode === 'scrolled' || typeof createImageBitmap !== 'function') return;
    const nextPage = currentPage + (viewMode === 'two-column' ? 2 : 1);
    if (nextPage > pdfDoc.numPages) return;
    const controller = new AbortController();
    const cache = bitmapCache(pdfDoc);
    const dpr = window.devicePixelRatio || 1;
    const key = `${nextPage}@${calculatedScale}@${dpr}`;
    const preload = async () => {
      try {
        await waitForReaderIdle(document, controller.signal, 750);
        if (cache.get(key)) return;
        const bitmap = await pdfDoc.render(nextPage, calculatedScale, dpr, controller.signal);
        if (controller.signal.aborted) bitmap?.close();
        else if (bitmap) cache.set(key, bitmap);
      } catch (error) {
        if (!controller.signal.aborted) console.warn('[PdfNativeViewer] Idle page preload failed:', error);
      }
    };
    void preload();
    return () => controller.abort();
  }, [pdfDoc, currentPage, calculatedScale, viewMode]);

  // 2. Responsive Fit Calculation
  const updateScale = useCallback((container: HTMLElement | null) => {
    if (!container) return;
    const containerWidth = container.clientWidth - (viewMode === 'two-column' ? 96 : 48);
    const containerHeight = container.clientHeight - 80;

    const baseWidth = 595;
    const baseHeight = 842;

    let computedScale = 1.0;
    if (viewMode === 'two-column') {
      const targetWidth = containerWidth / 2;
      const scaleByWidth = targetWidth / baseWidth;
      const scaleByHeight = containerHeight / baseHeight;
      computedScale = Math.min(scaleByWidth, scaleByHeight);
    } else if (viewMode === 'single') {
      const scaleByWidth = containerWidth / baseWidth;
      const scaleByHeight = containerHeight / baseHeight;
      computedScale = Math.min(scaleByWidth, scaleByHeight);
    } else {
      // Scrolled mode
      computedScale = containerWidth / baseWidth;
    }

    const finalComputed = Math.min(3.0, Math.max(0.5, computedScale * zoom));
    setCalculatedScale(finalComputed);
  }, [viewMode, zoom]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    updateScale(container);
    if (!container || typeof ResizeObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Settling first keeps a sliding sidebar from re-rasterizing the page on every animation frame.
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => updateScale(container), 120);
    });
    observer.observe(container);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [updateScale, scrollContainerRef]);

  // Guard against initial IntersectionObserver callback resetting page on viewMode transition
  const isPositioningScrollRef = useRef(false);
  const lastReportedPageRef = useRef(currentPage);

  // When entering scrolled mode, scroll directly to currentPage and preserve position
  useEffect(() => {
    if (viewMode === 'scrolled' && pdfDoc) {
      isPositioningScrollRef.current = true;
      const targetPage = currentPage;
      lastReportedPageRef.current = targetPage;


      const applyScroll = () => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const pageEl = container.querySelector(
          `.pdf-page-holder[data-page-number="${targetPage}"]`
        ) as HTMLElement | null;

        if (pageEl) {
          const containerRect = container.getBoundingClientRect();
          const pageRect = pageEl.getBoundingClientRect();
          container.scrollTop += (pageRect.top - containerRect.top);
          setTimeout(() => {
            isPositioningScrollRef.current = false;
          }, 300);
        } else {
          requestAnimationFrame(() => {
            const retryEl = container.querySelector(
              `.pdf-page-holder[data-page-number="${targetPage}"]`
            ) as HTMLElement | null;
            if (retryEl) {
              const cRect = container.getBoundingClientRect();
              const pRect = retryEl.getBoundingClientRect();
              container.scrollTop += (pRect.top - cRect.top);
            }
            setTimeout(() => {
              isPositioningScrollRef.current = false;
            }, 300);
          });
        }
      };

      requestAnimationFrame(applyScroll);
    }
  }, [viewMode, pdfDoc]);

  // When currentPage changes externally while in scrolled mode (TOC, scrubber, jump)
  useEffect(() => {
    if (viewMode === 'scrolled' && pdfDoc && !isPositioningScrollRef.current) {
      if (currentPage !== lastReportedPageRef.current) {
        lastReportedPageRef.current = currentPage;
        const container = scrollContainerRef.current;
        if (!container) return;
        const pageEl = container.querySelector(
          `.pdf-page-holder[data-page-number="${currentPage}"]`
        ) as HTMLElement | null;
        if (pageEl) {
          const containerRect = container.getBoundingClientRect();
          const pageRect = pageEl.getBoundingClientRect();
          container.scrollTop += (pageRect.top - containerRect.top);
        }
      }
    }
  }, [currentPage, viewMode, pdfDoc]);

  // Pre-rendering & Active Page IntersectionObserver for Continuous Scroll Mode
  useEffect(() => {
    if (viewMode !== 'scrolled' || !scrollContainerRef.current || !pdfDoc) return;

    const container = scrollContainerRef.current;
    const pageHolders = container.querySelectorAll('.pdf-page-holder');
    if (pageHolders.length === 0) return;
    const intersections = new Map<number, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        if (isPositioningScrollRef.current) {
          return;
        }

        let maxRatio = 0;
        let mostVisiblePage = -1;

          for (const entry of entries) {
            const pageNum = parseInt(entry.target.getAttribute('data-page-number') || '0', 10);
            if (pageNum <= 0) continue;

            if (entry.isIntersecting) {
              intersections.set(pageNum, entry.intersectionRatio);
            } else intersections.delete(pageNum);
          }
        const next = nearbyPdfPages(intersections, pdfDoc.numPages);
        setVisiblePages(prev => prev.size === next.size && [...next].every(page => prev.has(page)) ? prev : next);
        for (const [page, ratio] of intersections) {
          if (ratio > maxRatio) { maxRatio = ratio; mostVisiblePage = page; }
        }

        if (
          !isPositioningScrollRef.current &&
          mostVisiblePage > 0 &&
          mostVisiblePage !== lastReportedPageRef.current
        ) {
          lastReportedPageRef.current = mostVisiblePage;
          React.startTransition(() => onPageChange(mostVisiblePage));
        }
      },
      {
        root: container,
        rootMargin: '75% 0px',
        threshold: [0, 0.25, 0.5, 0.75],
      }
    );

    pageHolders.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [viewMode, pdfDoc, totalPages, calculatedScale, onPageChange, scrollContainerRef]);

  // 3. Selection & MouseUp Text Rect Calculation
  const lastSelectionKeyRef = useRef<string>('');
  const handleMouseUp = useCallback(() => {
    if (!onSelectionChange) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      lastSelectionKeyRef.current = '';
      onSelectionChange(null);
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      onSelectionChange(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const pageEl = (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement)?.closest(
      '.pdf-page-container'
    ) as HTMLElement | null;

    if (!pageEl) {
      onSelectionChange(null);
      return;
    }

    const pageNum = parseInt(pageEl.getAttribute('data-page-number') || '1', 10);
    const pageRect = pageEl.getBoundingClientRect();
    const rawClientRects = Array.from(range.getClientRects());

    // Filter out zero-width/zero-height boundary leaks, line-break artifacts, and full-container boxes
    const validClientRects = rawClientRects.filter((r) => {
      if (r.width < 3 || r.height < 3) return false;
      if (r.left <= pageRect.left || r.right <= pageRect.left + 2 || r.left >= pageRect.right - 2) return false;
      if (r.width >= pageRect.width * 0.98) return false;
      return true;
    });

    if (validClientRects.length === 0) {
      onSelectionChange(null);
      return;
    }

    // Convert to percentage rects relative to the page container
    const normalizedRects: NormalizedRect[] = validClientRects
      .map((r) => {
        const x = Math.max(0, Math.min(100, ((r.left - pageRect.left) / pageRect.width) * 100));
        const y = Math.max(0, Math.min(100, ((r.top - pageRect.top) / pageRect.height) * 100));
        const width = Math.max(0, Math.min(100 - x, (r.width / pageRect.width) * 100));
        const height = Math.max(0, Math.min(100 - y, (r.height / pageRect.height) * 100));
        return { x, y, width, height };
      })
      .filter((r) => r.width >= 0.5 && r.height >= 0.5 && !(r.x <= 0.2 && r.width < 2));

    const merged = mergeNormalizedRects(normalizedRects);

    // Skip redundant parent updates (prevents re-render flicker on repeated mouseups)
    const selectionKey = `${pageNum}|${text}|${merged.length}`;
    if (selectionKey === lastSelectionKeyRef.current) return;
    lastSelectionKeyRef.current = selectionKey;

    const minTop = Math.min(...validClientRects.map((r) => r.top));
    const maxBottom = Math.max(...validClientRects.map((r) => r.bottom));
    const minLeft = Math.min(...validClientRects.map((r) => r.left));
    const maxRight = Math.max(...validClientRects.map((r) => r.right));

    onSelectionChange({
      pageNumber: pageNum,
      text,
      rects: merged,
      boundingRect: {
        top: minTop,
        bottom: maxBottom,
        left: minLeft,
        right: maxRight,
      },
    });
  }, [onSelectionChange]);

  // Filter highlights per page
  const pageHighlights = useMemo(() => {
    const grouped = new Map<number, KnowledgeItemDTO[]>();
    for (const highlight of highlights) {
      const { page } = parseHighlightLocation(highlight.location);
      const existing = grouped.get(page);
      if (existing) existing.push(highlight);
      else grouped.set(page, [highlight]);
    }
    return grouped;
  }, [highlights]);
  const getHighlightsForPage = useCallback((page: number) => pageHighlights.get(page) || EMPTY_HIGHLIGHTS, [pageHighlights]);

  const failed = !isLoadingDoc && (Boolean(loadError) || !pdfDoc);
  const numPages = pdfDoc?.numPages ?? 0;

  return (
    <div
      ref={scrollContainerRef}
      onMouseDown={(e) => {
        if (e.button === 0) setIsSelecting(true);
      }}
      onMouseUp={() => {
        setIsSelecting(false);
        // Defer to next frame so the browser finalizes the Selection before we measure it
        requestAnimationFrame(handleMouseUp);
      }}
      dir="ltr"
      className={`pdf-native-viewer-container pdf-viewer-workspace${!isSelecting && activeSelectionInfo ? ' pdf-selection-locked' : ''} w-full h-full overflow-y-auto overflow-x-hidden flex flex-col items-center p-4 sm:p-6 select-text`}
      style={{
        direction: 'ltr',
        unicodeBidi: 'isolate',
        textAlign: 'left',
        scrollbarWidth: 'none',
      }}
    >
      {isLoadingDoc && (instantPreview ? (
        <div className="pdf-viewer-viewport flex flex-col items-center justify-center w-full min-h-full my-auto py-2" dir="ltr">
          <img
            src={instantPreview.image}
            alt=""
            decoding="sync"
            data-pdf-instant-preview="true"
            className="pdf-page-container relative mx-auto my-3 bg-white shadow-2xl rounded-[6px]"
            style={{ width: `${Math.round(instantPreview.width * calculatedScale)}px`, height: `${Math.round(instantPreview.height * calculatedScale)}px`, marginBottom: '24px' }}
          />
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-muted gap-3 select-none">
          <Loader2 className="w-8 h-8 animate-spin text-pale-sky-500" />
          <span className="text-xs font-bold tracking-wide">{t('loadingNativePdf')}</span>
        </div>
      ))}

      {failed && (
        <div className="w-full h-full flex flex-col items-center justify-center text-rose-500 gap-3 p-6 text-center select-none">
          <AlertCircle className="w-10 h-10" />
          <h3 className="font-bold text-sm">{t('pdfDocumentLoadFailed')}</h3>
          <p className="text-xs text-muted max-w-md">{t('pdfDocumentLoadHelp')}</p>
        </div>
      )}

      {/* 1. Scrolled Continuous View Mode */}
      {!isLoadingDoc && !failed && pdfDoc && viewMode === 'scrolled' && (
        <div
          className="pdf-viewer-viewport w-full flex flex-col items-center gap-4 py-2"
          dir="ltr"
          style={{ direction: 'ltr', unicodeBidi: 'normal' }}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
            const shouldRender =
              visiblePages.has(pageNum) ||
              Math.abs(pageNum - currentPage) <= 2;

            return (
              <PdfScrolledPage
                key={pageNum}
                    active={shouldRender}
                    placeholderWidth={Math.round((pageDimensions.get(pageNum)?.width ?? 595) * calculatedScale)}
                    placeholderHeight={Math.round((pageDimensions.get(pageNum)?.height ?? 842) * calculatedScale)}
                    pdfDoc={pdfDoc}
                    pageNumber={pageNum}
                    scale={calculatedScale}
                    theme={tintPages ? 'dark' : 'paper'}
                    autoCropMargins={autoCropMargins}
                    onPageMeasured={onPageMeasured}
                    onPagePainted={onPagePainted}
                    pageHighlights={getHighlightsForPage(pageNum)}
                    activeSelectionRects={
                      activeSelectionInfo && activeSelectionInfo.pageNumber === pageNum
                        ? activeSelectionInfo.rects
                        : undefined
                    }
                    onHighlightClick={onHighlightClick}
                  />
            );
          })}
        </div>
      )}

      {/* 2. Dual-Page Book Spread Mode */}
      {!isLoadingDoc && !failed && pdfDoc && viewMode === 'two-column' && (
        <div
          className="pdf-viewer-viewport flex items-center justify-center gap-6 max-w-full my-auto"
          dir={direction}
          style={{ direction }}
        >
          {/* Column 1 (Right in RTL, Left in LTR) */}
          <PdfPageItem
            key={currentPage}
            pdfDoc={pdfDoc}
            pageNumber={currentPage}
            scale={calculatedScale}
            theme={tintPages ? 'dark' : 'paper'}
            autoCropMargins={autoCropMargins}
            onPagePainted={onPagePainted}
            pageHighlights={getHighlightsForPage(currentPage)}
            activeSelectionRects={
              activeSelectionInfo && activeSelectionInfo.pageNumber === currentPage
                ? activeSelectionInfo.rects
                : undefined
            }
            onHighlightClick={onHighlightClick}
          />

          {/* Column 2 (Left in RTL, Right in LTR) */}
          {currentPage + 1 <= numPages && (
            <PdfPageItem
              key={currentPage + 1}
              pdfDoc={pdfDoc}
              pageNumber={currentPage + 1}
              scale={calculatedScale}
              theme={tintPages ? 'dark' : 'paper'}
              autoCropMargins={autoCropMargins}
              onPagePainted={onPagePainted}
              pageHighlights={getHighlightsForPage(currentPage + 1)}
              activeSelectionRects={
                activeSelectionInfo && activeSelectionInfo.pageNumber === currentPage + 1
                  ? activeSelectionInfo.rects
                  : undefined
              }
              onHighlightClick={onHighlightClick}
            />
          )}
        </div>
      )}

      {/* 3. Single Page Mode */}
      {!isLoadingDoc && !failed && pdfDoc && viewMode === 'single' && (
        <div
          className="pdf-viewer-viewport flex flex-col items-center justify-center w-full min-h-full my-auto py-2"
          dir="ltr"
          style={{ direction: 'ltr', unicodeBidi: 'normal' }}
        >
          <PdfPageItem
            key={currentPage}
            pdfDoc={pdfDoc}
            pageNumber={currentPage}
            scale={calculatedScale}
            theme={tintPages ? 'dark' : 'paper'}
            autoCropMargins={autoCropMargins}
            onPagePainted={onPagePainted}
            pageHighlights={getHighlightsForPage(currentPage)}
            activeSelectionRects={
              activeSelectionInfo && activeSelectionInfo.pageNumber === currentPage
                ? activeSelectionInfo.rects
                : undefined
            }
            onHighlightClick={onHighlightClick}
          />
        </div>
      )}
    </div>
  );
};

export const PdfNativeViewer = React.memo(PdfNativeViewerComponent);
