'use client';
import { useToast } from '../ui/Toast';

import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Cpu,
  Layers,
  FileText,
  Table as TableIcon,
  Crosshair,
  RefreshCw,
  ScanText,
  Sliders,
  Search,
  Eye,
  Code,
  Download,
  HardDrive,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Edit3,
  SkipForward,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import {
  findOcrSuspects,
  applyWordCorrection,
  applyStoredCorrections,
  ocrCorrectionsKey,
  ocrAcceptedKey,
  resolveAndMigratePageCorrections,
  type OcrSuspect,
  type OcrWordCorrectionsMap,
  type OcrWordCorrectionEntry,
  type StaleCorrectionInfo,
} from '../../../shared/ocr-suspects';
import { useWorkspace } from '../context/WorkspaceContext';
import { OcrCompare } from './OcrCompare';
import type { OcrEngineId, OcrPageResult, OcrWord, OcrEngineInfo } from '../../../shared/types/ocr';
import { OCR_ENGINE_ORDER, ocrEngineBlocker, ocrEngineInfo, ocrEngineName, ocrFallbackMessage } from './ocr-status';

interface OcrInspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pageResult: OcrPageResult | null;
  readingPage: number;
  sourceId?: string | null;
  bookId?: string;
  sourcesCount?: number;
  isOcrRunning?: boolean;
  onRunOcrPage?: () => void;
  showBoundingBoxes?: boolean;
  onToggleBoundingBoxes?: () => void;
  activeWordIndex?: number | null;
  onSelectWord?: (index: number | null) => void;
  onUpdatePageResult?: (updated: OcrPageResult) => void;
  engines: OcrEngineInfo[];
  selectedEngine: OcrEngineId;
  onSelectEngine: (engine: OcrEngineId) => void;
  onEnginesChanged: () => void;
}

export const OcrInspectorDrawer: React.FC<OcrInspectorDrawerProps> = ({
  isOpen,
  onClose,
  pageResult,
  readingPage,
  sourceId,
  bookId,
  sourcesCount = 1,
  isOcrRunning = false,
  onRunOcrPage,
  showBoundingBoxes = false,
  onToggleBoundingBoxes,
  activeWordIndex = null,
  onSelectWord,
  onUpdatePageResult,
  engines,
  selectedEngine,
  onSelectEngine,
  onEnginesChanged,
}) => {
  const { t, dir } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'markdown' | 'text' | 'tables' | 'bboxes' | 'review'>('markdown');
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(60);
  const [acceptedIndices, setAcceptedIndices] = useState<Set<number>>(new Set());
  const [currentSuspectIndex, setCurrentSuspectIndex] = useState<number>(0);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editText, setEditText] = useState<string>('');
  const { showToast: notify } = useToast();
  const [savedCorrections, setSavedCorrections] = useState<OcrWordCorrectionsMap>({});
  const [staleCorrections, setStaleCorrections] = useState<StaleCorrectionInfo[]>([]);
  const cropCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const editInputRef = React.useRef<HTMLInputElement>(null);
  const effectiveSourceKey = sourceId || bookId || null;
  const [markdownView, setMarkdownView] = useState<'preview' | 'raw'>('preview');
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedTableIdx, setCopiedTableIdx] = useState<number | null>(null);
  const [wordFilter, setWordFilter] = useState<string>('');
  const [isDownloadingModel, setIsDownloadingModel] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; speedMb: number; file: string } | null>(null);

  React.useEffect(() => {
    if (isOpen) onEnginesChanged();
  }, [isOpen, onEnginesChanged]);

  const handleDownloadModel = async () => {
    if (!window.electronAPI?.ocrDownloadModel || isDownloadingModel) return;
    setIsDownloadingModel(true);
    setDownloadProgress({ percent: 0, speedMb: 0, file: '' });

    const unsub = window.electronAPI.onOcrDownloadProgress?.((payload) => {
      if (payload.status === 'downloading') {
        setDownloadProgress({
          percent: payload.percent || 0,
          speedMb: payload.speedMb || 0,
          file: payload.file || '',
        });
      }
    });

    try {
      await window.electronAPI.ocrDownloadModel();
      onEnginesChanged();
    } catch (err) {
      console.warn('[handleDownloadModel] Error:', err);
    } finally {
      setIsDownloadingModel(false);
      setDownloadProgress(null);
      unsub?.();
    }
  };

  // Load saved accepted indices and corrections for this page (keyed by source with safe book fallback)
  React.useEffect(() => {
    if (!effectiveSourceKey || !window.electronAPI?.settings?.get) return;
    let mounted = true;
    (async () => {
      try {
        const { corrections, acceptedIndices: acc } = await resolveAndMigratePageCorrections({
          sourceId: effectiveSourceKey,
          bookId,
          sourcesCount,
          page: readingPage,
          getSetting: window.electronAPI.settings.get,
          setSetting: window.electronAPI.settings.set,
        });
        if (mounted) {
          setSavedCorrections(corrections);
          setAcceptedIndices(new Set(acc));
          if (pageResult) {
            const check = applyStoredCorrections(pageResult, corrections, selectedEngine);
            setStaleCorrections(check.staleCorrections);
            if (check.appliedCount > 0 && check.patchedResult.text !== pageResult.text) {
              onUpdatePageResult?.(check.patchedResult);
              const targetBook = bookId || effectiveSourceKey;
              if (targetBook && window.electronAPI?.reindexPageContent) {
                window.electronAPI.reindexPageContent(targetBook, {
                  pageNumber: readingPage,
                  locationCfiOrPage: `page-${readingPage}`,
                  chapterTitle: `Page ${readingPage}`,
                  content: check.patchedResult.text,
                }).catch(() => {});
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load accepted suspects:', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [effectiveSourceKey, bookId, sourcesCount, readingPage, pageResult, selectedEngine, onUpdatePageResult]);

  // Compute suspects ordered by reading order
  const pageWords = pageResult?.words;
  const suspects = React.useMemo(() => {
    if (!pageWords || pageWords.length === 0) return [];
    return findOcrSuspects(pageWords, {
      confidenceThreshold: confidenceThreshold / 100,
      isRtl: dir === 'rtl',
    });
  }, [pageWords, confidenceThreshold, dir]);

  const activeSuspects = React.useMemo(() => {
    return suspects.filter(s => !acceptedIndices.has(s.originalIndex));
  }, [suspects, acceptedIndices]);

  const staleIndices = React.useMemo(() => new Set(staleCorrections.map(s => s.index)), [staleCorrections]);
  const appliedCorrectionsList = React.useMemo(() => {
    return Object.entries(savedCorrections)
      .filter(([k, v]) => {
        const idx = Number(k);
        return !staleIndices.has(idx) && v && typeof v === 'object' && 'corrected' in v && 'original' in v;
      })
      .map(([k, v]) => ({
        idx: Number(k),
        entry: v as OcrWordCorrectionEntry,
      }));
  }, [savedCorrections, staleIndices]);

  const activeSuspectsCount = activeSuspects.length;
  const safeSuspectIndex = Math.min(Math.max(0, currentSuspectIndex), Math.max(0, activeSuspects.length - 1));
  const currentSuspect: OcrSuspect | null = activeSuspects[safeSuspectIndex] || null;

  // Sync highlight and active word with current suspect when on review tab
  React.useEffect(() => {
    if (activeTab === 'review' && currentSuspect) {
      onSelectWord?.(currentSuspect.originalIndex);
      if (!showBoundingBoxes) {
        onToggleBoundingBoxes?.();
      }
    }
  }, [activeTab, currentSuspect, onSelectWord, onToggleBoundingBoxes, showBoundingBoxes]);

  // Focus input when editing starts
  React.useEffect(() => {
    if (isEditing) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [isEditing]);

  // Draw zoomed crop on canvas when current suspect changes
  React.useEffect(() => {
    if (activeTab !== 'review' || !currentSuspect || !pageResult) return;
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sourceCanvas = document.querySelector('canvas.pdf-canvas') as HTMLCanvasElement | null;
    if (sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
      const scaleX = sourceCanvas.width / (pageResult.width || 1);
      const scaleY = sourceCanvas.height / (pageResult.height || 1);
      const bbox = currentSuspect.word.bbox;

      const padX = Math.max(12, bbox.width * 0.15);
      const padY = Math.max(10, bbox.height * 0.25);

      const sx = Math.max(0, (bbox.x - padX) * scaleX);
      const sy = Math.max(0, (bbox.y - padY) * scaleY);
      const sw = Math.min(sourceCanvas.width - sx, (bbox.width + padX * 2) * scaleX);
      const sh = Math.min(sourceCanvas.height - sy, (bbox.height + padY * 2) * scaleY);

      if (sw > 0 && sh > 0) {
        const hRatio = (canvas.width - 24) / sw;
        const vRatio = (canvas.height - 20) / sh;
        const fitRatio = Math.min(hRatio, vRatio, 3.2);

        const dw = sw * fitRatio;
        const dh = sh * fitRatio;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;

        ctx.fillStyle = '#fafaf9';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(sourceCanvas, sx, sy, sw, sh, dx, dy, dw, dh);

        const wordDx = dx + padX * scaleX * fitRatio;
        const wordDy = dy + padY * scaleY * fitRatio;
        const wordDw = bbox.width * scaleX * fitRatio;
        const wordDh = bbox.height * scaleY * fitRatio;

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.strokeRect(wordDx, wordDy, wordDw, wordDh);
        return;
      }
    }

    // Fallback placeholder
    ctx.fillStyle = '#f5f5f4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#44403c';
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentSuspect.word.text, canvas.width / 2, canvas.height / 2);
  }, [activeTab, currentSuspect, pageResult]);

  // Actions for Review tab
  const handleNextSuspect = () => {
    if (activeSuspects.length <= 1) return;
    setIsEditing(false);
    setCurrentSuspectIndex((prev) => (prev + 1) % activeSuspects.length);
  };

  const handlePrevSuspect = () => {
    if (activeSuspects.length <= 1) return;
    setIsEditing(false);
    setCurrentSuspectIndex((prev) => (prev - 1 + activeSuspects.length) % activeSuspects.length);
  };

  const handleDiscardStaleCorrection = async (staleIdx: number) => {
    const nextCorr = { ...savedCorrections };
    delete nextCorr[String(staleIdx)];
    setSavedCorrections(nextCorr);
    setStaleCorrections(prev => prev.filter(s => s.index !== staleIdx));

    if (effectiveSourceKey && window.electronAPI?.settings?.set) {
      const corrKey = ocrCorrectionsKey(effectiveSourceKey, readingPage);
      if (corrKey) {
        await window.electronAPI.settings.set(corrKey, nextCorr).catch(() => {});
      }
    }
  };

  const handleReapplyStaleCorrection = async (stale: StaleCorrectionInfo) => {
    if (activeWordIndex === null || !pageResult?.words?.[activeWordIndex]) return;
    const targetWord = pageResult.words[activeWordIndex];

    const updated = applyWordCorrection(pageResult, activeWordIndex, stale.corrected);
    onUpdatePageResult?.(updated);

    const nextCorr: OcrWordCorrectionsMap = { ...savedCorrections };
    delete nextCorr[String(stale.index)];
    nextCorr[String(activeWordIndex)] = {
      original: targetWord.text,
      corrected: stale.corrected,
      engine: selectedEngine,
          };

    setSavedCorrections(nextCorr);
    setStaleCorrections(prev => prev.filter(s => s.index !== stale.index));

    if (effectiveSourceKey && window.electronAPI?.settings?.set) {
      const corrKey = ocrCorrectionsKey(effectiveSourceKey, readingPage);
      if (corrKey) {
        await window.electronAPI.settings.set(corrKey, nextCorr).catch(() => {});

        // KEY-292: Re-index page chunk in book_content_fts
        const targetBook = bookId || effectiveSourceKey;
        if (targetBook && window.electronAPI?.reindexPageContent) {
          await window.electronAPI.reindexPageContent(targetBook, {
            pageNumber: readingPage,
            locationCfiOrPage: `page-${readingPage}`,
            chapterTitle: `Page ${readingPage}`,
            content: updated.text,
          }).catch((err) => console.warn('[OcrInspector] FTS re-index failed:', err));
        }
      }
    }

    notify({ message: t('ocrWordCorrectedToast') });
  };

  const handleDiscardCorrection = async (wordIdxStr: string) => {
    const entry = savedCorrections[wordIdxStr];
    if (!entry) return;
    const wordIdx = Number(wordIdxStr);
    const originalText = typeof entry === 'string' ? '' : entry.original;

    const nextCorr = { ...savedCorrections };
    delete nextCorr[wordIdxStr];
    setSavedCorrections(nextCorr);

    let restored = pageResult;
    if (pageResult && Number.isFinite(wordIdx) && originalText) {
      restored = applyWordCorrection(pageResult, wordIdx, originalText);
      onUpdatePageResult?.(restored);
    }

    if (effectiveSourceKey && window.electronAPI?.settings?.set) {
      const corrKey = ocrCorrectionsKey(effectiveSourceKey, readingPage);
      if (corrKey) {
        await window.electronAPI.settings.set(corrKey, nextCorr).catch(() => {});
      }
    }

    // KEY-292: Re-index page chunk in book_content_fts with restored text
    const targetBook = bookId || effectiveSourceKey;
    if (targetBook && restored && window.electronAPI?.reindexPageContent) {
      await window.electronAPI.reindexPageContent(targetBook, {
        pageNumber: readingPage,
        locationCfiOrPage: `page-${readingPage}`,
        chapterTitle: `Page ${readingPage}`,
        content: restored.text,
      }).catch((err) => console.warn('[OcrInspector] FTS re-index failed on discard:', err));
    }

    // Un-accept so it returns to suspect review
    setAcceptedIndices((prev) => {
      const next = new Set(prev);
      next.delete(wordIdx);
      if (effectiveSourceKey && window.electronAPI?.settings?.set) {
        const accKey = ocrAcceptedKey(effectiveSourceKey, readingPage);
        if (accKey) {
          window.electronAPI.settings.set(accKey, Array.from(next)).catch(() => {});
        }
      }
      return next;
    });

    notify({ message: t('ocrDiscardCorrectionToast') });
  };

  const handleAcceptSuspect = async () => {
    if (!currentSuspect) return;
    const wordIdx = currentSuspect.originalIndex;
    setAcceptedIndices((prev) => {
      const next = new Set(prev);
      next.add(wordIdx);
      if (effectiveSourceKey && window.electronAPI?.settings?.set) {
        const accKey = ocrAcceptedKey(effectiveSourceKey, readingPage);
        if (accKey) {
          window.electronAPI.settings.set(accKey, Array.from(next)).catch(() => {});
        }
      }
      return next;
    });
  };

  const handleSkipSuspect = () => {
    handleNextSuspect();
  };

  const handleSaveEdit = async () => {
    if (!currentSuspect || !pageResult || !editText.trim()) return;
    const trimmed = editText.trim();
    const wordIdx = currentSuspect.originalIndex;
    const updated = applyWordCorrection(pageResult, wordIdx, trimmed);
    onUpdatePageResult?.(updated);

    const existingCorr = savedCorrections[String(wordIdx)];
    const originalWord = (typeof existingCorr === 'object' && existingCorr?.original)
      ? existingCorr.original
      : currentSuspect.word.text;

    if (effectiveSourceKey && window.electronAPI?.settings) {
      try {
        const corrKey = ocrCorrectionsKey(effectiveSourceKey, readingPage);
        if (corrKey) {
          const nextCorr: OcrWordCorrectionsMap = {
            ...savedCorrections,
            [String(wordIdx)]: {
              original: originalWord,
              corrected: trimmed,
              engine: selectedEngine,
            },
          };
          setSavedCorrections(nextCorr);
          await window.electronAPI.settings.set(corrKey, nextCorr);

          // KEY-292: Re-index page chunk in book_content_fts
          const targetBook = bookId || effectiveSourceKey;
          if (targetBook && window.electronAPI?.reindexPageContent) {
            await window.electronAPI.reindexPageContent(targetBook, {
              pageNumber: readingPage,
              locationCfiOrPage: `page-${readingPage}`,
              chapterTitle: `Page ${readingPage}`,
              content: updated.text,
            }).catch((err) => console.warn('[OcrInspector] FTS re-index failed:', err));
          }
        }
      } catch (err) {
        console.warn('Failed to save correction:', err);
      }
    }

    // Accept after edit
    handleAcceptSuspect();
    setIsEditing(false);
    notify({ message: t('ocrWordCorrectedToast') });
  };

  // Keyboard navigation shortcuts
  React.useEffect(() => {
    if (!isOpen || activeTab !== 'review' || !currentSuspect) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTyping) {
        if (e.key === 'Escape') {
          setIsEditing(false);
        }
        return;
      }

      if (e.key === 'Enter' || e.key === 'j' || e.key === 'n') {
        e.preventDefault();
        handleNextSuspect();
      } else if (e.key === 'k' || e.key === 'p') {
        e.preventDefault();
        handlePrevSuspect();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleAcceptSuspect();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleSkipSuspect();
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setIsEditing(true);
        setEditText(currentSuspect.word.text);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeTab, currentSuspect, activeSuspects.length, currentSuspectIndex, isEditing, editText, pageResult, handleNextSuspect, handlePrevSuspect, handleAcceptSuspect, handleSkipSuspect]);

  const engineInfo = ocrEngineInfo(engines, selectedEngine);
  const engineBlocker = ocrEngineBlocker(engineInfo);
  const isPaddle = selectedEngine === 'paddleocr_vl';
  const engineName = ocrEngineName(t, selectedEngine);
  const wordCount = pageResult?.words?.length || 0;
  const lineCount = pageResult?.lines?.length || 0;
  const tablesCount = pageResult?.tables?.length || 0;
  const durationMs = pageResult?.durationMs || 0;
  const dimensions = pageResult ? `${pageResult.width} × ${pageResult.height}` : '—';

  // Filtered words for Bounding Boxes tab
  const filterQuery = wordFilter.trim().toLowerCase();
  const filteredWords = pageResult?.words
    ? pageResult.words
        .map((w: OcrWord, originalIndex: number) => ({ word: w, originalIndex }))
        .filter(({ word }) => (!filterQuery ? true : word.text.toLowerCase().includes(filterQuery)))
    : [];

  const selectedWord =
    activeWordIndex !== null && pageResult?.words?.[activeWordIndex]
      ? pageResult.words[activeWordIndex]
      : null;

  if (!isOpen) return null;

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleCopyTable = async (table: { headers: string[]; rows: string[][] }, tableIndex: number) => {
    try {
      const headerLine = `| ${table.headers.join(' | ')} |`;
      const sepLine = `| ${table.headers.map(() => '---').join(' | ')} |`;
      const rowsLines = table.rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
      const mdTable = `${headerLine}\n${sepLine}\n${rowsLines}`;

      await navigator.clipboard.writeText(mdTable);
      setCopiedTableIdx(tableIndex);
      setTimeout(() => setCopiedTableIdx(null), 2000);
    } catch (err) {
      console.error('Failed to copy table:', err);
    }
  };

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label={t('ocrInspectorTitle')}
      dir={dir}
      className="fixed inset-y-0 end-0 z-50 w-full sm:w-[480px] md:w-[540px] bg-surface border-s border-subtle shadow-2xl flex flex-col transition-all duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-subtle bg-canvas/60 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-400">
            <ScanText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-main truncate font-display">
              {t('ocrInspectorTitle')}
            </h2>
            <p className="text-[11px] text-muted truncate">
              {t('page')} {readingPage} · {t('ocrInspectorSubtitle')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={t('studyClose')}
          className="p-1.5 rounded-lg text-muted hover:text-main hover:bg-canvas transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Engine Status Banner */}
      <div className={`p-4 border-b border-subtle space-y-3 ${engineBlocker ? 'bg-amber-500/10' : 'bg-emerald-500/5'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {!engineBlocker && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${engineBlocker ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
            </span>
            <span className={`text-xs font-bold ${engineBlocker ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-800 dark:text-emerald-300'}`}>
              {engineBlocker ? t('ocrEngineNotReady', { engine: engineName }) : t(isPaddle ? 'ocrEngineBadge' : 'ocrEngineBadgeOcrmypdf')}
            </span>
          </div>

          {isPaddle && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted font-mono bg-surface px-2 py-0.5 rounded-md border border-subtle">
              <Cpu className="w-3.5 h-3.5 text-pale-sky-500" />
              <span>AVX2 · 8T</span>
            </div>
          )}
        </div>

        {/* Engine Choice */}
        <div role="radiogroup" aria-label={t('ocrEngineLabel')} className="grid grid-cols-2 gap-2">
          {OCR_ENGINE_ORDER.map(engine => {
            const info = ocrEngineInfo(engines, engine);
            const blocked = ocrEngineBlocker(info);
            const isSelected = engine === selectedEngine;
            return (
              <button
                key={engine}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!!blocked || isOcrRunning}
                onClick={() => onSelectEngine(engine)}
                className={`p-2 rounded-lg border text-start text-[11px] transition-all cursor-pointer disabled:cursor-not-allowed ${
                  isSelected ? 'border-pale-sky-500 bg-pale-sky-500/10' : 'border-subtle bg-surface hover:bg-canvas'
                } ${blocked ? 'opacity-70' : ''}`}
              >
                <span className="block font-bold text-main">{ocrEngineName(t, engine)}</span>
                <span className="block mt-0.5 leading-relaxed text-muted">
                  {blocked
                    ? ocrFallbackMessage(t, blocked, info?.missingPackages, engine)
                    : t(engine === 'ocrmypdf' ? 'ocrEngineOcrmypdfHint' : 'ocrEnginePaddleHint')}
                </span>
              </button>
            );
          })}
        </div>

        <p role={engineBlocker ? 'alert' : undefined} className="text-[11px] text-muted leading-relaxed">
          {engineBlocker
            ? ocrFallbackMessage(t, engineBlocker, engineInfo?.missingPackages, selectedEngine)
            : isPaddle ? `${t('ocrEngineLocalCpu')} · ${t('ocrCpuSlowHint')}` : t('ocrEngineOcrmypdfLocal')}
        </p>

        {/* Local Model Files Card */}
        {isPaddle && (
        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface border border-subtle text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <HardDrive className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-main block truncate text-[11px]">
                {engineInfo?.isDownloaded
                  ? t('ocrModelReady')
                  : t('ocrModelFilesCount', {
                      existing: engineInfo?.existingFilesCount || 0,
                      total: engineInfo?.totalExpectedFiles || 14,
                      size: engineInfo?.downloadedMb || 0,
                    })}
              </span>
            </div>
          </div>

          {!engineInfo?.isDownloaded && (
            <button
              type="button"
              disabled={isDownloadingModel}
              onClick={handleDownloadModel}
              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-pale-sky-500 hover:bg-pale-sky-600 text-white flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
            >
              {isDownloadingModel ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              <span>
                {isDownloadingModel
                  ? t('ocrDownloadingModel', {
                      percent: downloadProgress?.percent || 0,
                      speed: downloadProgress?.speedMb || 0,
                    })
                  : t('ocrDownloadModelBtn')}
              </span>
            </button>
          )}
        </div>
        )}

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {onToggleBoundingBoxes && (
            <button
              type="button"
              onClick={onToggleBoundingBoxes}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                showBoundingBoxes
                  ? 'bg-amber-400/20 border-amber-500/40 text-amber-800 dark:text-amber-200'
                  : 'bg-surface border-subtle text-muted hover:text-main hover:bg-canvas'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{showBoundingBoxes ? t('ocrHideBoxes') : t('ocrToggleBoxes')}</span>
            </button>
          )}

          {onRunOcrPage && (
            <button
              type="button"
              disabled={isOcrRunning}
              onClick={onRunOcrPage}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pale-sky-500 hover:bg-pale-sky-600 text-white flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isOcrRunning ? 'animate-spin' : ''}`} />
              <span>
                {isOcrRunning
                  ? t('ocrRunningText')
                  : pageResult
                  ? t('ocrRescanPageBtn')
                  : t('ocrRecognizePageBtn')}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Which engine produced this result */}
      {pageResult && (
        <p className="px-4 pt-2 text-[11px] font-bold text-muted">
          {t('ocrRanWithEngine', { engine: ocrEngineName(t, pageResult.engine) })}
        </p>
      )}

      {/* Metrics Row */}
      {pageResult && (
        <div className="grid grid-cols-4 gap-2 px-4 py-2.5 border-b border-subtle bg-canvas/40 text-center text-xs">
          <div>
            <span className="block text-[10px] text-muted">{t('ocrMetricWords')}</span>
            <span className="font-bold font-mono text-main">{wordCount}</span>
          </div>
          <div>
            <span className="block text-[10px] text-muted">{t('ocrMetricLines')}</span>
            <span className="font-bold font-mono text-main">{lineCount}</span>
          </div>
          <div>
            <span className="block text-[10px] text-muted">{t('ocrMetricDuration')}</span>
            <span className="font-bold font-mono text-main">{durationMs}ms</span>
          </div>
          <div>
            <span className="block text-[10px] text-muted">{t('ocrMetricDimensions')}</span>
            <span className="font-bold font-mono text-main text-[11px] truncate">{dimensions}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-subtle px-4 bg-canvas/20 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('markdown')}
          className={`py-2 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'markdown'
              ? 'border-pale-sky-500 text-pale-sky-600 dark:text-pale-sky-400'
              : 'border-transparent text-muted hover:text-main'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{t('ocrTabMarkdown')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('text')}
          className={`py-2 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'text'
              ? 'border-pale-sky-500 text-pale-sky-600 dark:text-pale-sky-400'
              : 'border-transparent text-muted hover:text-main'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>{t('ocrTabText')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tables')}
          className={`py-2 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'tables'
              ? 'border-pale-sky-500 text-pale-sky-600 dark:text-pale-sky-400'
              : 'border-transparent text-muted hover:text-main'
          }`}
        >
          <TableIcon className="w-3.5 h-3.5" />
          <span>{t('ocrTabTables')}</span>
          {tablesCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-pale-sky-500/10 text-pale-sky-600 text-[10px]">
              {tablesCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bboxes')}
          className={`py-2 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'bboxes'
              ? 'border-pale-sky-500 text-pale-sky-600 dark:text-pale-sky-400'
              : 'border-transparent text-muted hover:text-main'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{t('ocrTabBboxes', { count: wordCount })}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('review')}
          className={`py-2 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'review'
              ? 'border-pale-sky-500 text-pale-sky-600 dark:text-pale-sky-400'
              : 'border-transparent text-muted hover:text-main'
          }`}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>{t('ocrTabReview', { count: activeSuspectsCount })}</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0 text-xs">
        {!pageResult ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted space-y-3">
            <ScanText className="w-10 h-10 text-subtle stroke-1" />
            <p className="max-w-xs leading-relaxed font-medium">
              {t('ocrNoResultYet')}
            </p>
            {onRunOcrPage && (
              <button
                type="button"
                disabled={isOcrRunning}
                onClick={onRunOcrPage}
                className="px-4 py-2 rounded-xl bg-pale-sky-500 hover:bg-pale-sky-600 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isOcrRunning ? 'animate-spin' : ''}`} />
                <span>{isOcrRunning ? t('ocrRunningText') : t('ocrRecognizePageBtn')}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tab: Markdown */}
            {activeTab === 'markdown' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  {/* Segmented View Mode Toggle */}
                  <div className="inline-flex items-center p-0.5 rounded-lg bg-canvas border border-subtle">
                    <button
                      type="button"
                      onClick={() => setMarkdownView('preview')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                        markdownView === 'preview'
                          ? 'bg-surface text-main shadow-xs'
                          : 'text-muted hover:text-main'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>{t('ocrFormattedPreview')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarkdownView('raw')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                        markdownView === 'raw'
                          ? 'bg-surface text-main shadow-xs'
                          : 'text-muted hover:text-main'
                      }`}
                    >
                      <Code className="w-3 h-3" />
                      <span>{t('ocrRawMarkdown')}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopy(pageResult.markdown || pageResult.text)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-canvas border border-subtle hover:bg-surface text-main flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? t('ocrCopied') : t('ocrCopyMarkdown')}</span>
                  </button>
                </div>

                {markdownView === 'raw' ? (
                  <pre
                    dir="auto"
                    className="p-3 rounded-xl border border-subtle bg-canvas font-mono text-xs whitespace-pre-wrap break-words leading-relaxed select-text"
                  >
                    {pageResult.markdown || pageResult.text}
                  </pre>
                ) : (
                  <div
                    dir="auto"
                    className="p-4 rounded-xl border border-subtle bg-canvas/50 text-main space-y-3 select-text leading-relaxed font-sans"
                  >
                    {(pageResult.markdown || pageResult.text)
                      .split('\n\n')
                      .map((block, idx) => {
                        const trimmed = block.trim();
                        if (!trimmed) return null;

                        if (trimmed.startsWith('# ')) {
                          return (
                            <h1 key={`md-h1-${idx}`} className="text-base font-bold text-main border-b border-subtle pb-1">
                              {trimmed.slice(2)}
                            </h1>
                          );
                        }
                        if (trimmed.startsWith('## ')) {
                          return (
                            <h2 key={`md-h2-${idx}`} className="text-sm font-bold text-main">
                              {trimmed.slice(3)}
                            </h2>
                          );
                        }
                        if (trimmed.startsWith('### ')) {
                          return (
                            <h3 key={`md-h3-${idx}`} className="text-xs font-bold text-main">
                              {trimmed.slice(4)}
                            </h3>
                          );
                        }
                        if (trimmed.startsWith('> ')) {
                          return (
                            <blockquote
                              key={`md-quote-${idx}`}
                              className="border-s-2 border-pale-sky-500 ps-3 italic text-muted text-xs"
                            >
                              {trimmed.slice(2)}
                            </blockquote>
                          );
                        }
                        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                          return (
                            <ul key={`md-ul-${idx}`} className="list-disc ps-5 space-y-1 text-xs">
                              {trimmed.split('\n').map((item, itemIdx) => (
                                <li key={`md-li-${itemIdx}`}>{item.replace(/^[-*]\s+/, '')}</li>
                              ))}
                            </ul>
                          );
                        }

                        return (
                          <p key={`md-p-${idx}`} className="text-xs leading-relaxed text-main">
                            {trimmed}
                          </p>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Plain Text */}
            {activeTab === 'text' && (
              <div className="space-y-2">
                <OcrCompare text={pageResult.text} />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleCopy(pageResult.text)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-canvas border border-subtle hover:bg-surface text-main flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? t('ocrCopied') : t('ocrCopyText')}</span>
                  </button>
                </div>
                <div
                  dir="auto"
                  className="p-3 rounded-xl border border-subtle bg-canvas font-serif text-sm whitespace-pre-wrap break-words leading-loose select-text"
                >
                  {pageResult.text}
                </div>
              </div>
            )}

            {/* Tab: Tables */}
            {activeTab === 'tables' && (
              <div className="space-y-3">
                {tablesCount === 0 ? (
                  <div className="py-12 text-center text-muted space-y-1">
                    <TableIcon className="w-8 h-8 mx-auto text-subtle stroke-1" />
                    <p>{t('ocrTabTables')} (0)</p>
                  </div>
                ) : (
                  pageResult.tables?.map((table, tIdx) => (
                    <div key={`table-${tIdx}`} className="space-y-2 border border-subtle rounded-xl p-3 bg-canvas overflow-x-auto">
                      <div className="flex items-center justify-between text-[11px] text-muted mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-main">Table #{tIdx + 1}</span>
                          <span className="font-mono text-[10px]">
                            {table.rows.length} rows × {table.headers.length || (table.rows[0]?.length ?? 0)} cols
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyTable(table, tIdx)}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-surface border border-subtle hover:bg-canvas text-main flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {copiedTableIdx === tIdx ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedTableIdx === tIdx ? t('ocrTableCopied') : t('ocrCopyTable')}</span>
                        </button>
                      </div>
                      <table className="w-full text-xs text-start border-collapse border border-subtle rounded-lg overflow-hidden">
                        {table.headers.length > 0 && (
                          <thead className="bg-surface font-bold">
                            <tr>
                              {table.headers.map((h, hIdx) => (
                                <th key={`h-${hIdx}`} className="p-2 border border-subtle text-start">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                        )}
                        <tbody>
                          {table.rows.map((row, rIdx) => (
                            <tr key={`r-${rIdx}`} className="odd:bg-canvas even:bg-surface/50 hover:bg-surface transition-colors">
                              {row.map((cell, cIdx) => (
                                <td key={`c-${cIdx}`} className="p-2 border border-subtle">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab: Review Suspects */}
            {activeTab === 'review' && (
              <div className="space-y-4">
                {/* Header & Threshold Slider */}
                <div className="p-3 rounded-xl border border-subtle bg-canvas space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-pale-sky-500" />
                      <span className="font-bold text-main text-xs">{t('ocrReviewSuspectsTitle')}</span>
                    </div>
                    {activeSuspectsCount > 0 && (
                      <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-400 font-bold">
                        {t('ocrSuspectCounter', { current: safeSuspectIndex + 1, total: activeSuspectsCount })}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    {t('ocrReviewSuspectsSubtitle')}
                  </p>

                  {/* Threshold Control */}
                  <div className="pt-1 flex items-center justify-between gap-3 text-xs">
                    <label htmlFor="suspect-threshold" className="text-[11px] text-muted whitespace-nowrap">
                      {t('ocrSuspectThreshold')}:
                    </label>
                    <input
                      id="suspect-threshold"
                      type="range"
                      min={10}
                      max={90}
                      step={5}
                      value={confidenceThreshold}
                      onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                      className="w-full h-1.5 bg-subtle/50 rounded-lg appearance-none cursor-pointer accent-pale-sky-500"
                    />
                    <span className="font-mono text-[11px] font-bold text-main w-10 text-end">
                      {confidenceThreshold}%
                    </span>
                  </div>
                </div>

                {/* Stale Corrections Warning & Resolution */}
                {staleCorrections.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{t('ocrCorrectionNoLongerMatches')}</span>
                    </div>
                    <div className="space-y-2">
                      {staleCorrections.map((stale) => (
                        <div
                          key={`stale-${stale.index}`}
                          className="flex flex-col gap-1.5 rounded-lg border border-amber-500/20 bg-surface/90 p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between text-[11px] text-muted">
                            {stale.original ? (
                              <span>{t('ocrStaleOriginal').replace('{text}', stale.original)}</span>
                            ) : null}
                            <span className="font-semibold text-main">
                              {t('ocrStaleCorrected').replace('{text}', stale.corrected)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-subtle/40">
                            {activeWordIndex !== null && pageResult?.words?.[activeWordIndex] ? (
                              <button
                                type="button"
                                onClick={() => handleReapplyStaleCorrection(stale)}
                                className="px-2 py-1 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-900 dark:text-amber-200 hover:bg-amber-500/30 transition-colors cursor-pointer"
                              >
                                {t('ocrReapplyCorrection')}
                              </button>
                            ) : (
                              <span className="text-[10px] text-muted italic">
                                {"(Select word to re-apply)"}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDiscardStaleCorrection(stale.index)}
                              className="px-2 py-1 rounded-md text-[11px] font-semibold text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer"
                            >
                              {t('ocrDiscardStaleCorrection')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Applied Active Corrections List (KEY-292) */}
                {appliedCorrectionsList.length > 0 && (
                  <div className="rounded-xl border border-pale-sky-500/30 bg-pale-sky-500/5 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-main">
                      <CheckCheck className="w-4 h-4 text-pale-sky-500 shrink-0" />
                      <span>{t('ocrSavedCorrectionsTitle')} ({appliedCorrectionsList.length})</span>
                    </div>
                    <div className="space-y-1.5">
                      {appliedCorrectionsList.map(({ idx, entry }) => (
                        <div
                          key={`applied-corr-${idx}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-subtle bg-surface p-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span dir="auto" className="font-bold text-main block truncate">
                              {entry.corrected}
                            </span>
                            <span dir="auto" className="text-[10px] text-muted block truncate">
                              {t('ocrStaleOriginal').replace('{text}', entry.original)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDiscardCorrection(String(idx))}
                            className="px-2 py-1 rounded-md text-[11px] font-semibold text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                            title={t('ocrDiscardCorrection')}
                          >
                            {t('ocrDiscardCorrection')}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeSuspectsCount === 0 ? (
                  <div className="py-12 text-center text-muted space-y-2">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/80 stroke-1" />
                    <p className="font-bold text-main text-xs">
                      {suspects.length > 0
                        ? t('ocrAllSuspectsReviewed')
                        : t('ocrNoSuspectsNotice', { threshold: confidenceThreshold })}
                    </p>
                  </div>
                ) : currentSuspect ? (
                  <div className="space-y-3.5">
                    {/* Suspect metadata badge */}
                    <div className="flex items-center justify-between gap-2">
                      {currentSuspect.kind === 'confidence' ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          <span>
                            {t('ocrSuspectConfidenceScore', {
                              score: Math.round((currentSuspect.confidence ?? 0) * 100),
                            })}
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-sky-500/10 text-sky-800 dark:text-sky-300 border border-sky-500/20">
                          <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                          <span>
                            {t('ocrSuspectHeuristicLabel', {
                              reason:
                                currentSuspect.heuristicReason === 'mixed-scripts'
                                  ? t('ocrHeuristicMixedScripts')
                                  : currentSuspect.heuristicReason === 'invalid-chars'
                                  ? t('ocrHeuristicInvalidChars')
                                  : currentSuspect.heuristicReason === 'isolated-arabic'
                                  ? t('ocrHeuristicIsolatedArabic')
                                  : t('ocrHeuristicDictionaryMiss'),
                            })}
                          </span>
                        </div>
                      )}

                      {/* Nav Chevrons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handlePrevSuspect}
                          disabled={activeSuspectsCount <= 1}
                          title={t('ocrSuspectPrev')}
                          className="p-1 rounded-md text-muted hover:text-main hover:bg-canvas border border-subtle transition-colors cursor-pointer disabled:opacity-40"
                        >
                          <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                        </button>
                        <button
                          type="button"
                          onClick={handleNextSuspect}
                          disabled={activeSuspectsCount <= 1}
                          title={t('ocrSuspectNext')}
                          className="p-1 rounded-md text-muted hover:text-main hover:bg-canvas border border-subtle transition-colors cursor-pointer disabled:opacity-40"
                        >
                          <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                        </button>
                      </div>
                    </div>

                    {/* Word Crop Canvas & Comparison Card */}
                    <div className="p-3.5 rounded-xl border border-subtle bg-canvas space-y-3">
                      <div>
                        <span className="block text-[10px] text-muted uppercase font-bold tracking-wider mb-1.5">
                          {t('ocrSelectedWord')}
                        </span>
                        <div className="flex justify-center bg-surface/80 rounded-lg p-2 border border-subtle overflow-hidden">
                          <canvas
                            ref={cropCanvasRef}
                            width={320}
                            height={90}
                            className="max-w-full h-auto rounded border border-subtle/60 shadow-xs"
                          />
                        </div>
                      </div>

                      {/* Recognized Word / Edit Mode */}
                      <div>
                        <span className="block text-[10px] text-muted uppercase font-bold tracking-wider mb-1">
                          {t('ocrTabText')}
                        </span>
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              ref={editInputRef}
                              type="text"
                              dir="auto"
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit();
                                if (e.key === 'Escape') setIsEditing(false);
                              }}
                              className="w-full px-3 py-2 rounded-lg border border-pale-sky-500 bg-surface text-sm font-serif text-main focus:outline-none focus:ring-2 focus:ring-pale-sky-500/30"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleSaveEdit}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-pale-sky-500 hover:bg-pale-sky-600 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{t('ocrSuspectSaveEdit')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsEditing(false)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-subtle hover:bg-canvas text-muted hover:text-main transition-all cursor-pointer"
                              >
                                <span>{t('ocrSuspectCancelEdit')}</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-surface border border-subtle flex items-center justify-between gap-2">
                            <span
                              dir="auto"
                              className="font-serif text-base font-bold text-main break-words select-text"
                            >
                              {currentSuspect.word.text}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditing(true);
                                setEditText(currentSuspect.word.text);
                              }}
                              className="p-1 rounded-md text-muted hover:text-main hover:bg-canvas transition-colors cursor-pointer"
                              title={t('ocrSuspectEdit')}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons Row */}
                      {!isEditing && (
                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleAcceptSuspect}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 flex items-center justify-center gap-1 transition-all cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{t('ocrSuspectAccept')}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsEditing(true);
                              setEditText(currentSuspect.word.text);
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-pale-sky-500/15 border border-pale-sky-500/30 hover:bg-pale-sky-500/25 text-pale-sky-700 dark:text-pale-sky-300 flex items-center justify-center gap-1 transition-all cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{t('ocrSuspectEdit')}</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleSkipSuspect}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-subtle hover:bg-canvas text-muted hover:text-main flex items-center justify-center gap-1 transition-all cursor-pointer"
                          >
                            <SkipForward className="w-3.5 h-3.5" />
                            <span>{t('ocrSuspectSkip')}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Tab: Bounding Boxes */}
            {activeTab === 'bboxes' && (
              <div className="space-y-3">
                <p className="text-[11px] text-muted leading-relaxed">
                  {t('ocrDebugOverlay')}
                </p>

                {/* Filter / Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={wordFilter}
                    onChange={(e) => setWordFilter(e.target.value)}
                    placeholder={t('ocrFilterWords')}
                    className="w-full ps-8 pe-8 py-1.5 rounded-lg border border-subtle bg-canvas text-xs text-main placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-pale-sky-500"
                  />
                  {wordFilter && (
                    <button
                      type="button"
                      onClick={() => setWordFilter('')}
                      className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-main cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Selected Word Banner */}
                {selectedWord && activeWordIndex !== null && (
                  <div className="p-2.5 rounded-xl border border-amber-500/40 bg-amber-400/10 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-300 block">
                        {t('ocrSelectedWord')}
                      </span>
                      <span dir="auto" className="font-bold text-xs text-main truncate block">
                        «{selectedWord.text}»
                      </span>
                      <span className="text-[10px] font-mono text-muted">
                        x:{selectedWord.bbox.x} y:{selectedWord.bbox.y} · w:{selectedWord.bbox.width} h:{selectedWord.bbox.height}
                        {selectedWord.confidence !== undefined && ` · ${(selectedWord.confidence * 100).toFixed(0)}%`}
                      </span>
                    </div>
                    {onSelectWord && (
                      <button
                        type="button"
                        onClick={() => onSelectWord(null)}
                        className="p-1 rounded-md text-muted hover:text-main hover:bg-canvas cursor-pointer shrink-0"
                        title={t('studyClose')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                <div className="text-[10px] text-muted flex items-center justify-between">
                  <span>{t('ocrClickWordHint')}</span>
                  <span className="font-mono">
                    {filteredWords.length} / {wordCount}
                  </span>
                </div>

                {/* Word Cards List */}
                <div className="space-y-1.5 max-h-[420px] overflow-y-auto pe-1">
                  {filteredWords.map(({ word: w, originalIndex }) => {
                    const isSelected = activeWordIndex === originalIndex;

                    return (
                      <div
                        key={`bbox-${originalIndex}`}
                        onClick={() => onSelectWord?.(isSelected ? null : originalIndex)}
                        className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-400/20 border-amber-500 ring-2 ring-amber-400/50 shadow-xs'
                            : 'bg-canvas border-subtle hover:bg-surface hover:border-pale-sky-500/30'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pe-2">
                          <span dir="auto" className="font-bold text-main block truncate">
                            {w.text}
                          </span>
                          {w.confidence !== undefined && (
                            <span className="text-[10px] text-muted">
                              {t('ocrConfidence')} {(w.confidence * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-muted text-end shrink-0">
                          x:{w.bbox.x} y:{w.bbox.y}
                          <br />
                          w:{w.bbox.width} h:{w.bbox.height}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
