'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  PenTool,
  Layers,
  FileOutput,
  Zap,
  ScanText,
  ShieldCheck,
  PlayCircle,
  Type,
  Image as ImageIcon,
  Stamp,
  Hash,
  ListTree,
  Split,
  Crop,
  Scaling,
  Grid2X2,
  Maximize,
  FileText,
  FileSpreadsheet,
  Presentation,
  Globe,
  FileCode,
  File,
  Table,
  Images,
  FilePlus,
  Minimize2,
  Sparkles,
  Wrench,
  Accessibility,
  FileSearch,
  Lock,
  ShieldAlert,
  Pen,
  FileCheck,
  CheckCircle,
  Search,
  Sliders,
} from 'lucide-react';
import type { PdfCapability, PdfFeature } from '../../../shared/types/pdf-editor';
import type { PdfAction } from '../../../shared/pdf-actions';
import type { TranslationKey } from '../../translations';
import { useWorkspace } from '../context/WorkspaceContext';
import type { StirlingWorkstationMode } from './PdfWorkstationTools';
import { PdfSavedActions } from './PdfSavedActions';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import {
  PDF_TOOL_SECTIONS,
  searchPdfTools,
  type PdfToolDefinition,
  type PdfToolResultHint,
  type PdfToolSectionId,
} from './pdf-tool-catalogue';
import type { OcrEngineId, OcrEngineInfo, OcrPageResult } from '../../../shared/types/ocr';
import { OCR_ENGINE_ORDER, ocrEngineBlocker, ocrEngineInfo, ocrFallbackMessage, ocrEngineName } from './ocr-status';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  PenTool,
  Layers,
  FileOutput,
  Zap,
  ScanText,
  ShieldCheck,
  PlayCircle,
  Type,
  Image: ImageIcon,
  Stamp,
  Hash,
  ListTree,
  Split,
  Crop,
  Scaling,
  Grid2X2,
  Maximize,
  FileText,
  FileSpreadsheet,
  Presentation,
  Globe,
  FileCode,
  File,
  Table,
  Images,
  FilePlus,
  Minimize2,
  Sparkles,
  Wrench,
  Accessibility,
  FileSearch,
  Lock,
  ShieldAlert,
  Pen,
  FileCheck,
  CheckCircle,
};

function renderIcon(iconName: string, size = 16, className = '') {
  const IconComponent = ICON_MAP[iconName] ?? FileText;
  return <IconComponent size={size} className={className} />;
}

function getResultHintText(hint: PdfToolResultHint, t: (key: TranslationKey) => string) {
  switch (hint) {
    case 'save':
      return t('pdfResultHintSave');
    case 'new-file':
      return t('pdfResultHintNewFile');
    case 'new-files':
      return t('pdfResultHintNewFiles');
    case 'inspect':
      return t('pdfResultHintInspect');
    case 'ocr':
      return t('pdfResultHintOcr');
    case 'workflow':
      return t('pdfResultHintWorkflow');
    default:
      return '';
  }
}

export interface OcrIntegrationProps {
  pageResult: OcrPageResult | null;
  progress?: { current: number; total: number; words: number } | null;
  readingPage: number;
  isOcrRunning: boolean;
  onRunOcrPage: () => void;
  onRunOcrDocument?: () => void;
  showBoundingBoxes: boolean;
  onToggleBoundingBoxes: () => void;
  onToggleInspector: () => void;
  engines: OcrEngineInfo[];
  selectedEngine: OcrEngineId;
  onSelectEngine: (engine: OcrEngineId) => void;
}

export interface PdfToolDirectoryProps {
  capabilities: PdfCapability[];
  labels: Record<PdfFeature, TranslationKey>;
  disabled: boolean;
  onSelect: (tool: PdfFeature, mode: StirlingWorkstationMode) => void;
  onRunAction?: (action: PdfAction) => void;
  ocrIntegration?: OcrIntegrationProps;
  defaultSection?: PdfToolSectionId;
}

export function PdfToolDirectory({
  capabilities,
  disabled,
  onSelect,
  onRunAction,
  ocrIntegration,
  defaultSection,
  labels,
}: PdfToolDirectoryProps) {
  const { t } = useWorkspace();
  const [query, setQuery] = useState('');
  const directoryRef = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<'lines' | 'columns'>('lines');
  useEffect(() => { void window.electronAPI?.ocrGetLayout?.().then(setLayout).catch(() => {}); }, []);
  useEffect(() => {
    if (!defaultSection) return;
    const section = directoryRef.current?.querySelector<HTMLElement>(`section[data-tool-section="${defaultSection}"]`);
    section?.scrollIntoView({ block: 'start' });
    section?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [defaultSection]);
  const allTools = searchPdfTools(query, t);

  return (
    <section ref={directoryRef} data-pdf-tool-directory className="space-y-4">
      {/* Header and Search Field */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-text flex items-center gap-2">
          <Wrench size={16} className="text-primary-text" />
          <span>{t('pdfDirectoryTitle')}</span>
        </h3>
        <label className="flex items-center gap-2 rounded-xl border border-border bg-surface text-text px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary shadow-xs">
          <Search size={14} className="text-text-muted shrink-0" aria-hidden="true" />
          <input
            data-pdf-tool-search
            aria-label={t('pdfDirectoryFilter')}
            placeholder={t('pdfDirectoryFilter')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 w-full bg-transparent text-xs text-text placeholder:text-text-muted outline-none"
          />
        </label>
      </div>

      {allTools.length === 0 && <p role="status" className="text-xs text-text-muted leading-relaxed">{t('pdfToolsNoResults')}</p>}
      {/* Sections and Tool Cards */}
      <div className="space-y-5">
        {PDF_TOOL_SECTIONS.map((section) => {
          const sectionTools = allTools.filter((tool) => tool.section === section.id);
          const filtered = sectionTools;
          if (filtered.length === 0) return null;

          return (
            <section
              key={section.id}
              data-tool-section={section.id}
              className="space-y-2.5"
            >
              {/* Section Header */}
              <div className="flex items-center gap-2 pb-1 border-b border-border">
                <div className="text-primary-text shrink-0">
                  {renderIcon(section.iconName, 15)}
                </div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-text">
                  {t(section.nameKey)}
                </h4>
              </div>

              <p className="text-xs leading-relaxed text-text-muted">{t(section.descriptionKey)}</p>
              {/* OCR & text Section Inline Actions */}
              {section.id === 'ocr' && ocrIntegration && (
                <div
                  data-ocr-panel-controls
                  className="p-3 rounded-xl border border-border bg-surface space-y-2.5 shadow-xs"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-text flex items-center gap-1.5">
                      <ScanText size={14} className="text-primary-text" />
                      {t('ocrEngineChoice')}
                    </span>
                    <span className="text-[11px] text-text-muted font-mono">
                      {ocrEngineName(t, ocrIntegration.selectedEngine)}
                    </span>
                  </div>

                  <label className="block text-xs leading-relaxed text-text">
                    {t('ocrEngineLabel')}
                    <select value={ocrIntegration.selectedEngine} disabled={ocrIntegration.isOcrRunning} onChange={event => ocrIntegration.onSelectEngine(event.target.value as OcrEngineId)} className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-text">
                      {OCR_ENGINE_ORDER.map(engine => <option key={engine} value={engine}>{ocrEngineName(t, engine)}</option>)}
                    </select>
                  </label>
                  {ocrEngineBlocker(ocrEngineInfo(ocrIntegration.engines, ocrIntegration.selectedEngine)) && <p role="status" className="text-xs leading-relaxed text-warning">{ocrFallbackMessage(t, ocrEngineBlocker(ocrEngineInfo(ocrIntegration.engines, ocrIntegration.selectedEngine))!, ocrEngineInfo(ocrIntegration.engines, ocrIntegration.selectedEngine)?.missingPackages, ocrIntegration.selectedEngine)}</p>}
                  {ocrIntegration.selectedEngine === 'ocrmypdf' && <label className="block text-xs leading-relaxed text-text">
                    {t('ocrLayoutLabel')}
                    <select value={layout} disabled={ocrIntegration.isOcrRunning} onChange={event => { const next = event.target.value as 'lines' | 'columns'; setLayout(next); void window.electronAPI.ocrSetLayout(next); }} className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-text">
                      <option value="lines">{t('ocrLayoutLines')}</option><option value="columns">{t('ocrLayoutColumns')}</option>
                    </select>
                  </label>}
                  {ocrIntegration.progress && <p role="status" className="text-xs leading-relaxed text-text-muted">{t('ocrChipProgress', { current: ocrIntegration.progress.current, total: ocrIntegration.progress.total })}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={ocrIntegration.isOcrRunning}
                      disabled={disabled || ocrIntegration.isOcrRunning}
                      onClick={ocrIntegration.onRunOcrPage}
                      className="flex-1 min-w-[130px]"
                    >
                      {ocrIntegration.isOcrRunning
                        ? t('ocrRunningText')
                        : `${t('ocrRecognizePageBtn')} (${t('page')} ${ocrIntegration.readingPage})`}
                    </Button>

                    {ocrIntegration.onRunOcrDocument && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={disabled || ocrIntegration.isOcrRunning}
                        onClick={ocrIntegration.onRunOcrDocument}
                        className="flex-1 min-w-[130px]"
                      >
                        {t('ocrRecognizeBookBtn')}
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={ocrIntegration.onToggleInspector}
                      title={t('ocrReviewUncertainDesc')}
                      className="text-xs"
                    >
                      {t('ocrReviewUncertainWords')}
                    </Button>

                    <Chip
                      selected={ocrIntegration.showBoundingBoxes}
                      onSelect={ocrIntegration.onToggleBoundingBoxes}
                      label={
                        <span className="flex items-center gap-1 text-[11px]">
                          <Sliders size={12} />
                          {t('ocrDebugOverlay')}
                        </span>
                      }
                      className="cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Tool Cards */}
              <div className="grid grid-cols-1 gap-2">
                {filtered.map((tool: PdfToolDefinition) => {
                  if (tool.id === 'saved-actions') return null;

                  const capability = capabilities.find(
                    (item) => item.feature === (tool.id as PdfFeature)
                  );
                  const isAvailable = capability?.available ?? false;
                  const isToolDisabled = disabled || !isAvailable || tool.id === 'repair-metadata';

                  let disabledReason = disabled ? t('pdfToolsBusy') : '';
                  if (!isAvailable) {
                    disabledReason =
                      capability?.reason === 'engine-missing'
                        ? t('pdfEngineComponentMissing')
                        : capability?.reason === 'text-only' ? t('pdfToolTextOnly')
                        : capability?.reason === 'credentials-required' ? t('pdfToolCredentials')
                        : t('pdfToolUnavailable');
                  } else if (tool.id === 'repair-metadata') {
                    disabledReason = t('pdfToolRepairDisabled');
                  }

                  return (
                    <button
                      type="button"
                      aria-disabled={isToolDisabled}
                      key={tool.id}
                      data-pdf-tool-item={tool.id}
                      data-tool-section={tool.section}
                      className={`group relative flex flex-col p-2.5 rounded-xl border transition-all text-start select-none focus-visible:outline-2 focus-visible:outline-focus ${
                        isToolDisabled
                          ? 'opacity-60 bg-surface/50 border-border cursor-not-allowed'
                          : 'bg-surface hover:bg-canvas border-border hover:border-primary-text/40 shadow-xs hover:shadow-sm cursor-pointer'
                      }`}
                      onClick={() => {
                        if (!isToolDisabled) {
                          if (tool.id === 'ocr' && ocrIntegration) {
                            directoryRef.current?.querySelector('[data-ocr-panel-controls]')?.scrollIntoView({ block: 'start' });
                          } else onSelect(tool.id as PdfFeature, tool.mode);
                        }
                      }}
                      title={[t(tool.descriptionKey), disabledReason].filter(Boolean).join(' · ')}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="p-2 rounded-lg bg-canvas text-primary-text border border-border shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                          {renderIcon(tool.iconName, 15)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5 flex-wrap">
                            <span className="font-semibold text-xs text-text leading-tight">
                              {t(tool.nameKey)}
                            </span>
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border border-border bg-canvas text-text-muted"
                            >
                              {getResultHintText(tool.resultHint, t)}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-muted mt-1 leading-relaxed line-clamp-2">
                            {t(tool.descriptionKey)}
                          </p>
                          {isToolDisabled && disabledReason && (
                            <span className="inline-block mt-1 text-[10px] text-danger font-medium">
                              {disabledReason}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {section.id === 'saved-actions' && <p className="text-xs text-text-muted leading-relaxed">{t('pdfResultHintWorkflow')}</p>}
              {/* Saved actions Section Content */}
              {section.id === 'saved-actions' && onRunAction && (
                <PdfSavedActions
                  disabled={disabled}
                  available={capabilities.filter((item) => item.available).map((item) => item.feature)}
                  labels={labels}
                  onRun={onRunAction}
                />
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
