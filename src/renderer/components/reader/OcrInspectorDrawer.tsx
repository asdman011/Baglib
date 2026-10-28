'use client';

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
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { OcrPageResult, OcrWord, OcrEngineInfo } from '../../../shared/types/ocr';

interface OcrInspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pageResult: OcrPageResult | null;
  readingPage: number;
  isOcrRunning?: boolean;
  onRunOcrPage?: () => void;
  showBoundingBoxes?: boolean;
  onToggleBoundingBoxes?: () => void;
  activeWordIndex?: number | null;
  onSelectWord?: (index: number | null) => void;
}

export const OcrInspectorDrawer: React.FC<OcrInspectorDrawerProps> = ({
  isOpen,
  onClose,
  pageResult,
  readingPage,
  isOcrRunning = false,
  onRunOcrPage,
  showBoundingBoxes = false,
  onToggleBoundingBoxes,
  activeWordIndex = null,
  onSelectWord,
}) => {
  const { t, dir } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'markdown' | 'text' | 'tables' | 'bboxes'>('markdown');
  const [markdownView, setMarkdownView] = useState<'preview' | 'raw'>('preview');
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedTableIdx, setCopiedTableIdx] = useState<number | null>(null);
  const [wordFilter, setWordFilter] = useState<string>('');
  const [engineInfo, setEngineInfo] = useState<OcrEngineInfo | null>(null);
  const [isDownloadingModel, setIsDownloadingModel] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; speedMb: number; file: string } | null>(null);

  React.useEffect(() => {
    if (isOpen && window.electronAPI?.ocrGetEngineInfo) {
      window.electronAPI.ocrGetEngineInfo().then((info) => setEngineInfo(info)).catch(console.warn);
    }
  }, [isOpen]);

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
      const info = await window.electronAPI.ocrDownloadModel();
      setEngineInfo(info);
    } catch (err) {
      console.warn('[handleDownloadModel] Error:', err);
    } finally {
      setIsDownloadingModel(false);
      setDownloadProgress(null);
      unsub?.();
    }
  };

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
      <div className="p-4 border-b border-subtle bg-emerald-500/5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
              {t('ocrEngineBadge')}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted font-mono bg-surface px-2 py-0.5 rounded-md border border-subtle">
            <Cpu className="w-3.5 h-3.5 text-pale-sky-500" />
            <span>AVX2 · 12T</span>
          </div>
        </div>

        <p className="text-[11px] text-muted leading-relaxed">
          {t('ocrEngineLocalCpu')}
        </p>

        {/* Local Model Files Card */}
        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface border border-subtle text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <HardDrive className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-main block truncate text-[11px]">
                {engineInfo?.isDownloaded
                  ? t('ocrModelReady')
                  : t('ocrModelFilesCount', {
                      existing: engineInfo?.existingFilesCount || 13,
                      total: engineInfo?.totalExpectedFiles || 14,
                      size: engineInfo?.downloadedMb || 12.5,
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
