'use client';

import React, { useState } from 'react';
import {
  ScanText,
  Cpu,
  Crosshair,
  Sliders,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { OcrEngineId, OcrEngineInfo, OcrPageResult } from '../../../shared/types/ocr';
import { OCR_ENGINE_ORDER, ocrEngineBlocker, ocrEngineInfo, ocrEngineName, ocrFallbackMessage } from './ocr-status';

interface OcrQuickActionPillProps {
  pageResult: OcrPageResult | null;
  readingPage: number;
  isOcrRunning: boolean;
  onRunOcrPage: () => void;
  showBoundingBoxes: boolean;
  onToggleBoundingBoxes: () => void;
  isInspectorOpen: boolean;
  onToggleInspector: () => void;
  engines: OcrEngineInfo[];
  selectedEngine: OcrEngineId;
  onSelectEngine: (engine: OcrEngineId) => void;
  /** Icon-only tool buttons, for hosts narrower than the viewport. */
  compact?: boolean;
  className?: string;
}

export const OcrQuickActionPill: React.FC<OcrQuickActionPillProps> = ({
  pageResult,
  readingPage,
  isOcrRunning,
  onRunOcrPage,
  showBoundingBoxes,
  onToggleBoundingBoxes,
  isInspectorOpen,
  onToggleInspector,
  engines,
  selectedEngine,
  onSelectEngine,
  compact = false,
  className = '',
}) => {
  const { t, dir } = useWorkspace();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const wordCount = pageResult?.words?.length || 0;
  const isRecognized = !!pageResult && (wordCount > 0 || !!pageResult.text);
  const engineInfo = ocrEngineInfo(engines, selectedEngine);
  const engineBlocker = pageResult?.fallbackReason ?? ocrEngineBlocker(engineInfo);
  const blockerPackages = pageResult?.missingPackages ?? engineInfo?.missingPackages;
  const blockedEngine = pageResult?.requestedEngine ?? selectedEngine;
  const otherEngineRan = !!pageResult && pageResult.engine !== selectedEngine;

  return (
    <div
      role="toolbar"
      aria-label={t('ocrInspectorTitle')}
      dir={dir}
      className={`ocr-quick-action-pill absolute bottom-5 left-1/2 -translate-x-1/2 z-20 transition-all duration-300 select-none ${className}`}
    >
      <div className="flex items-center gap-1.5 p-1.5 px-3 rounded-full backdrop-blur-md bg-surface/90 border border-subtle/80 shadow-xl hover:shadow-2xl transition-all duration-200">
        {/* Engine Status Badge */}
        <div
          title={
            engineBlocker
              ? ocrFallbackMessage(t, engineBlocker, blockerPackages, blockedEngine)
              : t(selectedEngine === 'ocrmypdf' ? 'ocrEngineOcrmypdfHint' : 'ocrEnginePaddleHint')
          }
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold font-mono border shrink-0 ${
            engineBlocker
              ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30'
              : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20'
          }`}
        >
          <span className="relative flex h-2 w-2">
            {!engineBlocker && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isOcrRunning ? 'bg-amber-400' : 'bg-emerald-400'
              }`} />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              isOcrRunning || engineBlocker ? 'bg-amber-500' : 'bg-emerald-500'
            }`} />
          </span>
          <select
            aria-label={t('ocrEngineLabel')}
            value={selectedEngine}
            disabled={isOcrRunning}
            onChange={event => onSelectEngine(event.target.value as OcrEngineId)}
            className="max-w-28 bg-transparent font-sans font-bold cursor-pointer outline-none disabled:cursor-wait"
          >
            {OCR_ENGINE_ORDER.map(engine => {
              const blocked = ocrEngineBlocker(ocrEngineInfo(engines, engine));
              return (
                <option key={engine} value={engine} disabled={!!blocked} className="bg-surface text-main">
                  {blocked ? `${ocrEngineName(t, engine)} (${t('ocrEngineUnavailableOption')})` : ocrEngineName(t, engine)}
                </option>
              );
            })}
          </select>
          <Cpu className="w-3 h-3 text-pale-sky-500 opacity-80" />
        </div>

        {/* When Collapsed, show compact trigger */}
        {isCollapsed ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={isOcrRunning}
              onClick={onRunOcrPage}
              title={isRecognized ? t('ocrRescanPageBtn') : t('ocrRecognizePageBtn')}
              aria-label={isRecognized ? t('ocrRescanPageBtn') : t('ocrRecognizePageBtn')}
              className="p-1 rounded-full text-pale-sky-600 dark:text-pale-sky-400 hover:bg-canvas transition-colors cursor-pointer disabled:opacity-50"
            >
              {isOcrRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isRecognized ? (
                <RefreshCw className="w-3.5 h-3.5" />
              ) : (
                <ScanText className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              title={t('ocrExpandPill')}
              aria-label={t('ocrExpandPill')}
              className="p-1 rounded-full text-muted hover:text-main hover:bg-canvas transition-colors cursor-pointer"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            {/* Page Recognition Status Chip */}
            <div
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 border ${
                isRecognized
                  ? 'bg-pale-sky-500/10 text-pale-sky-800 dark:text-pale-sky-200 border-pale-sky-500/25'
                  : 'bg-canvas/60 text-muted border-subtle'
              }`}
            >
              {isRecognized ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span className="font-mono font-bold text-main">
                    {t('page')} {readingPage}
                  </span>
                  <span className="text-muted text-[10px]">
                    ({wordCount} {t('ocrMetricWords')}{otherEngineRan ? ` · ${ocrEngineName(t, pageResult.engine)}` : ''})
                  </span>
                </>
              ) : (
                <>
                  <span className="font-mono text-muted">
                    {t('page')} {readingPage}
                  </span>
                  <span className="text-[10px] text-muted hidden md:inline">
                    · {t('ocrStatusUnrecognized')}
                  </span>
                </>
              )}
            </div>

            <div className="w-px h-4 bg-subtle shrink-0 mx-0.5" />

            {/* Run / Re-scan Button */}
            <button
              type="button"
              disabled={isOcrRunning}
              onClick={onRunOcrPage}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shrink-0 ${
                isOcrRunning
                  ? 'bg-pale-sky-500 text-white cursor-wait'
                  : isRecognized
                  ? 'bg-surface border border-subtle hover:bg-canvas text-main shadow-xs'
                  : 'bg-pale-sky-500 hover:bg-pale-sky-600 text-white shadow-md active:scale-95'
              }`}
            >
              {isOcrRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isRecognized ? (
                <RefreshCw className="w-3.5 h-3.5 text-pale-sky-500" />
              ) : (
                <ScanText className="w-3.5 h-3.5" />
              )}
              <span>
                {isOcrRunning
                  ? t('ocrRunningText')
                  : isRecognized
                  ? t('ocrRescanPageBtn')
                  : t('ocrRecognizePageBtn')}
              </span>
            </button>

            {/* Toggle Word Bounding Boxes */}
            <button
              type="button"
              onClick={onToggleBoundingBoxes}
              aria-pressed={showBoundingBoxes}
              title={showBoundingBoxes ? t('ocrHideBoxes') : t('ocrToggleBoxes')}
              aria-label={showBoundingBoxes ? t('ocrHideBoxes') : t('ocrToggleBoxes')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer border shrink-0 ${
                showBoundingBoxes
                  ? 'bg-amber-400/20 border-amber-500/50 text-amber-900 dark:text-amber-200 shadow-xs'
                  : 'bg-transparent border-transparent hover:bg-canvas text-muted hover:text-main'
              }`}
            >
              <Crosshair className={`w-3.5 h-3.5 ${showBoundingBoxes ? 'text-amber-500' : ''}`} />
              {!compact && (
                <span className="hidden sm:inline">
                  {showBoundingBoxes ? t('ocrHideBoxes') : t('ocrToggleBoxes')}
                </span>
              )}
            </button>

            {/* Layout & OCR Inspector Drawer Toggle */}
            <button
              type="button"
              onClick={onToggleInspector}
              aria-pressed={isInspectorOpen}
              title={t('ocrOpenInspector')}
              aria-label={t('ocrOpenInspector')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer border shrink-0 ${
                isInspectorOpen
                  ? 'bg-pale-sky-500/20 border-pale-sky-500/50 text-pale-sky-700 dark:text-pale-sky-300 shadow-xs'
                  : 'bg-transparent border-transparent hover:bg-canvas text-muted hover:text-main'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              {!compact && <span className="hidden md:inline">{t('ocrOpenInspector')}</span>}
            </button>

            {/* Collapse Button */}
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              title={t('ocrCollapsePill')}
              aria-label={t('ocrCollapsePill')}
              className="p-1 rounded-full text-muted hover:text-main hover:bg-canvas transition-colors cursor-pointer shrink-0"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
