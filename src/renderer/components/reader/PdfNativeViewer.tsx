'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, AlertCircle } from 'lucide-react';
import type { ReaderTheme, TOCItem } from '../../libs/reader/types';
import type { KnowledgeItemDTO } from '../../../shared/types/knowledge';
import { getPdfThemeFilter } from '../../libs/reader/typography';

// Shared worker instance & initialization promise
let pdfWorkerInstance: Worker | null = null;
let pdfWorkerInitPromise: Promise<Worker | null> | null = null;

/**
 * Instantiates a Blob-backed ES module Web Worker for PDF.js attached directly to workerPort.
 * This completely eliminates dynamic import() CORS and origin failures in both dev (localhost:3000)
 * and packaged Electron (file://) environments.
 */
export async function ensurePdfWorker(): Promise<Worker | null> {
  if (typeof window === 'undefined') return null;

  if (pdfjsLib.GlobalWorkerOptions.workerPort) {
    return pdfjsLib.GlobalWorkerOptions.workerPort as Worker;
  }
  if (pdfWorkerInstance) {
    pdfjsLib.GlobalWorkerOptions.workerPort = pdfWorkerInstance;
    return pdfWorkerInstance;
  }
  if (pdfWorkerInitPromise) {
    return pdfWorkerInitPromise;
  }

  pdfWorkerInitPromise = (async () => {
    try {
      const workerUrl = '/vendor/pdfjs/pdf.worker.min.mjs';
      const response = await fetch(workerUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF worker from ${workerUrl}: ${response.status} ${response.statusText}`);
      }
      const workerScript = await response.text();
      const blob = new Blob([workerScript], { type: 'text/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      const worker = new Worker(blobUrl, { type: 'module' });
      pdfjsLib.GlobalWorkerOptions.workerPort = worker;
      pdfWorkerInstance = worker;
      return worker;
    } catch (err) {
      console.warn('[PdfNativeViewer] Blob-backed module worker initialization fallback:', err);
      // Fallback to workerSrc if blob worker instantiation fails
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
      return null;
    }
  })();

  return pdfWorkerInitPromise;
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
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onTotalPagesLoaded?: (total: number) => void;
  onOutlineLoaded?: (outline: TOCItem[]) => void;
  onPdfDocLoaded?: (doc: pdfjsLib.PDFDocumentProxy) => void;
  viewMode?: 'single' | 'two-column' | 'scrolled';
  theme?: ReaderTheme;
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
          rects: parsed.rects.filter((r: any) => r && r.width >= 0.5 && r.height >= 0.5),
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
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  theme: ReaderTheme;
  autoCropMargins: boolean;
  pageHighlights: KnowledgeItemDTO[];
  activeSelectionRects?: NormalizedRect[];
  onHighlightClick?: (highlight: KnowledgeItemDTO, e: React.MouseEvent) => void;
  onPageMeasured?: (pageNum: number, height: number) => void;
}

const PdfPageItem: React.FC<PdfPageItemProps> = ({
  pdfDoc,
  pageNumber,
  scale,
  theme,
  autoCropMargins,
  pageHighlights,
  activeSelectionRects,
  onHighlightClick,
  onPageMeasured,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const renderTaskRef = useRef<any>(null);

  const isDarkTheme = ['dark', 'night', 'midnight', 'dusk'].includes(theme);

  useEffect(() => {
    let isCancelled = false;

    const renderPage = async () => {
      try {
        setIsRendering(true);
        const page = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;

        // Base viewport at 1.0 to get native aspect ratio
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const finalScale = scale;
        const viewport = page.getViewport({ scale: finalScale });

        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const displayWidth = Math.round(viewport.width);
        const displayHeight = Math.round(viewport.height);

        setDimensions({ width: displayWidth, height: displayHeight });
        onPageMeasured?.(pageNumber, displayHeight);

        // 1. Layer 1: Render Canvas (HiDPI)
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${displayWidth}px`;
          canvas.style.height = `${displayHeight}px`;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            if (renderTaskRef.current) {
              try {
                renderTaskRef.current.cancel();
              } catch {
                // Ignore cancel errors
              }
            }

            renderTaskRef.current = page.render({
              canvasContext: ctx,
              viewport,
            });

            await renderTaskRef.current.promise;
          }
        }

        if (isCancelled) return;

        // 2. Layer 3: Render TextLayer
        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.width = `${displayWidth}px`;
          textLayerDiv.style.height = `${displayHeight}px`;
          textLayerDiv.style.setProperty('--scale-factor', `${viewport.scale}`);
          textLayerDiv.style.setProperty('--total-scale-factor', `${viewport.scale}`);

          const textContent = await page.getTextContent();
          if (isCancelled) return;

          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport,
          });

          await textLayer.render();
        }

        setIsRendering(false);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`[PdfNativeViewer] Error rendering page ${pageNumber}:`, err);
        }
        if (!isCancelled) setIsRendering(false);
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, pageNumber, scale]);

  // Compute theme filter for PDF canvas
  const canvasFilter = useMemo(() => {
    return getPdfThemeFilter(theme);
  }, [theme]);

  return (
    <div
      ref={containerRef}
      data-page-number={pageNumber}
      dir="ltr"
      className="pdf-page-container relative mx-auto my-3 bg-white shadow-2xl transition-transform duration-200 select-text rounded-xs overflow-hidden"
      style={{
        direction: 'ltr',
        unicodeBidi: 'normal',
        textAlign: 'left',
        position: 'relative',
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
        className="canvasWrapper absolute inset-0 w-full h-full pointer-events-none overflow-hidden"
        dir="ltr"
        style={{ direction: 'ltr', unicodeBidi: 'normal' }}
      >
        <canvas
          ref={canvasRef}
          className="pdf-canvas block absolute inset-0 w-full h-full pointer-events-none"
          style={{
            filter: canvasFilter,
          }}
        />
      </div>

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

          return (
            <React.Fragment key={highlight.id}>
              {rects.map((r, idx) => (
                <div
                  key={idx}
                  className="pdf-highlight-rect absolute rounded-xs cursor-pointer pointer-events-auto transition-opacity hover:opacity-80"
                  onClick={(e) => {
                    e.stopPropagation();
                    onHighlightClick?.(highlight, e);
                  }}
                  title={highlight.quotedText || ''}
                  style={{
                    left: `${r.x}%`,
                    top: `${r.y}%`,
                    width: `${r.width}%`,
                    height: `${r.height}%`,
                    backgroundColor: colorHex,
                    opacity: isDarkTheme ? 0.6 : 0.45,
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
        }}
      />

      {/* Loading Overlay */}
      {isRendering && (
        <div className="absolute inset-0 bg-surface/40 backdrop-blur-xs flex items-center justify-center z-30 pointer-events-none transition-opacity">
          <Loader2 className="w-6 h-6 animate-spin text-pale-sky-500 opacity-60" />
        </div>
      )}
    </div>
  );
};

export const PdfNativeViewer: React.FC<PdfNativeViewerProps> = ({
  fileUrl,
  currentPage,
  totalPages,
  onPageChange,
  onTotalPagesLoaded,
  onOutlineLoaded,
  onPdfDocLoaded,
  viewMode = 'single',
  theme = 'paper',
  zoom = 1.0,
  autoCropMargins = false,
  direction = 'ltr',
  highlights = [],
  activeSelectionInfo = null,
  onSelectionChange,
  onHighlightClick,
  contentContainerRef,
}) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [calculatedScale, setCalculatedScale] = useState<number>(1.2);
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = contentContainerRef || internalContainerRef;

  // Track page heights in scrolled mode
  const pageHeightsRef = useRef<Map<number, number>>(new Map());

  // Visible pages tracking for smooth pre-rendering in Continuous Scroll mode
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => {
    const s = new Set<number>();
    for (let p = Math.max(1, currentPage - 2); p <= currentPage + 3; p++) {
      s.add(p);
    }
    return s;
  });

  useEffect(() => {
    setVisiblePages((prev) => {
      let updated = false;
      const next = new Set(prev);
      for (let p = Math.max(1, currentPage - 2); p <= Math.min(totalPages || 1000, currentPage + 3); p++) {
        if (!next.has(p)) {
          next.add(p);
          updated = true;
        }
      }
      return updated ? next : prev;
    });
  }, [currentPage, totalPages]);

  // 1. Load PDF Document via pdfjsLib
  useEffect(() => {
    let isCancelled = false;
    setIsLoadingDoc(true);
    setLoadError(null);

    const loadDoc = async () => {
      if (!fileUrl || typeof fileUrl !== 'string' || fileUrl.trim() === '') {
        setIsLoadingDoc(false);
        return;
      }

      try {
        await ensurePdfWorker();
        const loadingTask = pdfjsLib.getDocument({
          url: fileUrl,
          cMapUrl: '/vendor/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
        });

        const doc = await loadingTask.promise;
        if (isCancelled) return;

        setPdfDoc(doc);
        setIsLoadingDoc(false);
        onTotalPagesLoaded?.(doc.numPages);
        onPdfDocLoaded?.(doc);

        // Extract PDF Table of Contents (Outline)
        try {
          const rawOutline = await doc.getOutline();
          if (rawOutline && rawOutline.length > 0) {
            const traverseOutline = async (items: any[]): Promise<TOCItem[]> => {
              const res: TOCItem[] = [];
              for (const it of items) {
                let pageNumber = 1;
                try {
                  let dest = it.dest;
                  if (typeof dest === 'string') {
                    dest = await doc.getDestination(dest);
                  }
                  if (Array.isArray(dest) && dest[0]) {
                    const pageIndex = await doc.getPageIndex(dest[0]);
                    pageNumber = pageIndex + 1;
                  }
                } catch {
                  // ignore dest errors
                }

                const subitems = it.items && it.items.length > 0 ? await traverseOutline(it.items) : undefined;
                res.push({
                  id: `pdf-toc-${pageNumber}-${Math.random().toString(36).slice(2, 7)}`,
                  label: (it.title || '').trim(),
                  href: `#page=${pageNumber}`,
                  index: pageNumber - 1,
                  subitems,
                });
              }
              return res;
            };

            const parsedToc = await traverseOutline(rawOutline);
            onOutlineLoaded?.(parsedToc);
          } else {
            // Smart scan of first 15 pages for headings when document outline is absent
            const smartHeadings: TOCItem[] = [];
            const scanLimit = Math.min(doc.numPages, 15);
            for (let pNum = 1; pNum <= scanLimit; pNum++) {
              try {
                const page = await doc.getPage(pNum);
                const content = await page.getTextContent();
                let maxFontSize = 0;
                let candidateTitle = '';
                for (const item of content.items as any[]) {
                  if (item.str && item.str.trim().length > 2) {
                    const fontSize = Math.hypot(item.transform?.[0] || 0, item.transform?.[1] || 0) || item.height || 0;
                    const isHeadingKeyword = /^(Chapter|الفصل|الباب|المبحث|المطلب|Part|Section|المقدمة|الفهرس|المحتويات|تمهيد)\b/i.test(
                      item.str.trim()
                    );
                    if (isHeadingKeyword || (fontSize > 16 && fontSize > maxFontSize)) {
                      maxFontSize = fontSize;
                      candidateTitle = item.str.trim();
                    }
                  }
                }
                if (candidateTitle) {
                  smartHeadings.push({
                    id: `smart-heading-p${pNum}`,
                    label: candidateTitle,
                    href: `#page=${pNum}`,
                    index: pNum - 1,
                  });
                }
              } catch {
                // Ignore page text scan error
              }
            }

            if (smartHeadings.length > 0) {
              onOutlineLoaded?.(smartHeadings);
            } else {
              // Generate basic thumbnail navigation outline
              const fallbackToc: TOCItem[] = [];
              for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
                fallbackToc.push({
                  id: `page-${i}`,
                  label: `Page ${i}`,
                  href: `#page=${i}`,
                  index: i - 1,
                });
              }
              onOutlineLoaded?.(fallbackToc);
            }
          }
        } catch (tocErr) {
          console.warn('[PdfNativeViewer] Outline extraction notice:', tocErr);
        }
      } catch (err: any) {
        if (!isCancelled) {
          const isInvalidPdf =
            err?.name === 'InvalidPDFException' ||
            err?.message?.includes('Invalid PDF structure') ||
            err?.message?.includes('Missing PDF');
          if (isInvalidPdf) {
            console.warn('[PdfNativeViewer] PDF parsing notice:', err?.message);
          } else {
            console.error('[PdfNativeViewer] Document load error:', err);
          }
          setLoadError(err?.message || 'Failed to load PDF document.');
          setIsLoadingDoc(false);
        }
      }
    };

    loadDoc();

    return () => {
      isCancelled = true;
    };
  }, [fileUrl]);

  // 2. Responsive Fit Calculation
  const updateScale = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const containerWidth = scrollContainerRef.current.clientWidth - (viewMode === 'two-column' ? 96 : 48);
    const containerHeight = scrollContainerRef.current.clientHeight - 80;

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
  }, [viewMode, zoom, scrollContainerRef]);

  useEffect(() => {
    updateScale();
    const handleResize = () => updateScale();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateScale]);

  // Guard against initial IntersectionObserver callback resetting page on viewMode transition
  const isPositioningScrollRef = useRef(false);
  const lastReportedPageRef = useRef(currentPage);

  // When entering scrolled mode, scroll directly to currentPage and preserve position
  useEffect(() => {
    if (viewMode === 'scrolled' && pdfDoc) {
      isPositioningScrollRef.current = true;
      const targetPage = currentPage;
      lastReportedPageRef.current = targetPage;

      setVisiblePages((prev) => {
        const next = new Set(prev);
        for (let p = Math.max(1, targetPage - 2); p <= Math.min(pdfDoc.numPages, targetPage + 3); p++) {
          next.add(p);
        }
        return next;
      });

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

    const observer = new IntersectionObserver(
      (entries) => {
        if (isPositioningScrollRef.current) {
          return;
        }

        let maxRatio = 0;
        let mostVisiblePage = -1;

        setVisiblePages((prev) => {
          let updated = false;
          const next = new Set(prev);

          for (const entry of entries) {
            const pageNum = parseInt(entry.target.getAttribute('data-page-number') || '0', 10);
            if (pageNum <= 0) continue;

            if (entry.isIntersecting) {
              if (!next.has(pageNum)) {
                next.add(pageNum);
                if (pageNum > 1) next.add(pageNum - 1);
                if (pageNum < (pdfDoc?.numPages || 1000)) next.add(pageNum + 1);
                updated = true;
              }
              if (entry.intersectionRatio > maxRatio) {
                maxRatio = entry.intersectionRatio;
                mostVisiblePage = pageNum;
              }
            }
          }
          return updated ? next : prev;
        });

        if (
          !isPositioningScrollRef.current &&
          mostVisiblePage > 0 &&
          mostVisiblePage !== lastReportedPageRef.current
        ) {
          lastReportedPageRef.current = mostVisiblePage;
          onPageChange(mostVisiblePage);
        }
      },
      {
        root: container,
        rootMargin: '150% 0px 150% 0px',
        threshold: [0, 0.25, 0.5, 0.75],
      }
    );

    pageHolders.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [viewMode, pdfDoc, totalPages, calculatedScale, onPageChange, scrollContainerRef]);

  // 3. Selection & MouseUp Text Rect Calculation
  const handleMouseUp = useCallback(() => {
    if (!onSelectionChange) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
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
  const getHighlightsForPage = useCallback(
    (pageNum: number) => {
      return highlights.filter((h) => {
        const { page } = parseHighlightLocation(h.location);
        return page === pageNum;
      });
    },
    [highlights]
  );

  if (isLoadingDoc) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-muted gap-3 select-none">
        <Loader2 className="w-8 h-8 animate-spin text-pale-sky-500" />
        <span className="text-xs font-bold tracking-wide">جاري تحميل المستند عبر محرك PDF المدمج...</span>
      </div>
    );
  }

  if (loadError || !pdfDoc) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-rose-500 gap-3 p-6 text-center select-none">
        <AlertCircle className="w-10 h-10" />
        <h3 className="font-bold text-sm">تعذر فتح ملف PDF</h3>
        <p className="text-xs text-muted max-w-md">{loadError}</p>
      </div>
    );
  }

  const numPages = pdfDoc.numPages;

  return (
    <div
      ref={scrollContainerRef}
      onMouseUp={handleMouseUp}
      dir="ltr"
      className="pdf-native-viewer-container pdf-viewer-workspace w-full h-full overflow-y-auto overflow-x-hidden flex flex-col items-center p-4 sm:p-6 select-text"
      style={{
        direction: 'ltr',
        unicodeBidi: 'isolate',
        textAlign: 'left',
        scrollbarWidth: 'none',
      }}
    >
      {/* 1. Scrolled Continuous View Mode */}
      {viewMode === 'scrolled' && (
        <div
          className="pdf-viewer-viewport w-full flex flex-col items-center gap-4 py-2"
          dir="ltr"
          style={{ direction: 'ltr', unicodeBidi: 'normal' }}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
            const shouldRender =
              numPages <= 25 ||
              visiblePages.has(pageNum) ||
              Math.abs(pageNum - currentPage) <= 2;

            return (
              <div
                key={pageNum}
                data-page-number={pageNum}
                className="pdf-page-holder w-full flex justify-center"
              >
                {shouldRender ? (
                  <PdfPageItem
                    key={pageNum}
                    pdfDoc={pdfDoc}
                    pageNumber={pageNum}
                    scale={calculatedScale}
                    theme={theme}
                    autoCropMargins={autoCropMargins}
                    pageHighlights={getHighlightsForPage(pageNum)}
                    activeSelectionRects={
                      activeSelectionInfo && activeSelectionInfo.pageNumber === pageNum
                        ? activeSelectionInfo.rects
                        : undefined
                    }
                    onHighlightClick={onHighlightClick}
                  />
                ) : (
                  <div
                    data-page-number={pageNum}
                    dir="ltr"
                    className="pdf-page-container relative mx-auto my-3 bg-white/5 border border-subtle/30 rounded-xs flex items-center justify-center text-muted text-xs font-mono select-none"
                    style={{
                      direction: 'ltr',
                      unicodeBidi: 'normal',
                      width: `${Math.round(595 * calculatedScale)}px`,
                      height: `${Math.round(842 * calculatedScale)}px`,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 2. Dual-Page Book Spread Mode */}
      {viewMode === 'two-column' && (
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
            theme={theme}
            autoCropMargins={autoCropMargins}
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
              theme={theme}
              autoCropMargins={autoCropMargins}
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
      {viewMode === 'single' && (
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
            theme={theme}
            autoCropMargins={autoCropMargins}
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
