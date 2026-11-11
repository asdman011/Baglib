'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  RefreshCw,
  Volume2,
  Eye,
  ShieldCheck,
  BookOpen,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type {
  PdfAccessibilityReport,
  PdfAccessibilityFixResult,
  PdfAccessibilityReadingOrderItem,
} from '../../../shared/types/pdf-accessibility';
import { Sheet } from '../ui/Sheet';

interface PdfAccessibilityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filePath?: string;
  onOpenReflow?: () => void;
  showReadingOrder?: boolean;
  onToggleReadingOrder?: (show: boolean, order?: PdfAccessibilityReadingOrderItem[], isTagged?: boolean) => void;
  onFixStaged?: (result: PdfAccessibilityFixResult) => void;
  onReportLoaded?: (report: PdfAccessibilityReport) => void;
  onOpenOcr?: () => void;
  workId?: string;
  readingPage?: number;
}

export function PdfAccessibilityDrawer({
  isOpen,
  onClose,
  filePath,
  onOpenReflow,
  showReadingOrder,
  onToggleReadingOrder,
  onFixStaged,
  onReportLoaded,
  onOpenOcr,
}: PdfAccessibilityDrawerProps) {
  const { t } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<PdfAccessibilityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Staged metadata fix state
  const [fixing, setFixing] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [showTitlePrompt, setShowTitlePrompt] = useState(false);
  const [fixSuccessNotice, setFixSuccessNotice] = useState<string | null>(null);

  // veraPDF check state
  const [runningVera, setRunningVera] = useState(false);

  const runCheck = useCallback(async (runVera = false) => {
    if (!filePath || !window.electronAPI?.pdfEditor?.accessibilityCheck) return;
    setLoading(!runVera);
    if (runVera) setRunningVera(true);
    setError(null);
    try {
      const res = await window.electronAPI.pdfEditor.accessibilityCheck({
        path: filePath,
        runVeraPdf: runVera,
      });
      if (res.ok) {
        setReport(res.data);
        onReportLoaded?.(res.data);
        if (res.data.base.title) {
          setTitleInput(res.data.base.title);
        }
      } else {
        setError(res.error || 'accessibility-check-failed');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRunningVera(false);
    }
  }, [filePath]);

  useEffect(() => {
    if (!isOpen || !filePath) return;
    const timer = setTimeout(() => {
      void runCheck(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, filePath, runCheck]);

  const handleFixLanguage = async (language: 'ar' | 'en') => {
    if (!filePath || !window.electronAPI?.pdfEditor?.fixAccessibility) return;
    setFixing(true);
    try {
      const res = await window.electronAPI.pdfEditor.fixAccessibility({
        path: filePath,
        language,
      });
      if (res.ok) {
        onFixStaged?.(res.data);
        setFixSuccessNotice(t('pdfA11yFixStaged'));
        void runCheck(false);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFixing(false);
    }
  };

  const handleFixTitle = async () => {
    if (!filePath || !titleInput.trim() || !window.electronAPI?.pdfEditor?.fixAccessibility) return;
    setFixing(true);
    try {
      const res = await window.electronAPI.pdfEditor.fixAccessibility({
        path: filePath,
        title: titleInput.trim(),
      });
      if (res.ok) {
        onFixStaged?.(res.data);
        setShowTitlePrompt(false);
        setFixSuccessNotice(t('pdfA11yFixStaged'));
        void runCheck(false);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFixing(false);
    }
  };

  if (!isOpen) return null;

  const base = report?.base;

  return (
    <Sheet asChild open={true} onClose={onClose} label={t('pdfA11yTitle')}><div
      role="dialog"
      aria-modal="true"
      aria-label={t('pdfA11yTitle')}
      data-pdf-accessibility-drawer
      className="fixed inset-y-0 end-0 z-50 flex w-full max-w-md flex-col border-s border-subtle bg-surface text-main shadow-2xl animate-in slide-in-from-right duration-200"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-emerald-500" aria-hidden="true" />
          <h2 className="text-sm font-bold text-main">{t('pdfA11yTitle')}</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            tabIndex={0}
            data-refresh-a11y-check
            aria-label={t('quranRefresh')}
            title={t('quranRefresh')}
            disabled={loading || fixing}
            onClick={() => void runCheck(false)}
            className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main focus-visible:outline-2 focus-visible:outline-emerald-500"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            tabIndex={0}
            data-close-a11y-drawer
            aria-label={t('close')}
            title={t('close')}
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main focus-visible:outline-2 focus-visible:outline-emerald-500"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main Drawer Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Notices */}
        {fixSuccessNotice && (
          <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-800 dark:text-emerald-200">
            {fixSuccessNotice}
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center p-8 text-muted gap-2" role="status">
            <RefreshCw size={16} className="animate-spin" />
            <span>{t('loading')}</span>
          </div>
        )}

        {!loading && base && (
          <>
            {/* Quick Actions Bar */}
            <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-subtle bg-canvas">
              {onOpenReflow && (
                <button
                  type="button"
                  tabIndex={0}
                  data-pdf-reflow-button
                  onClick={onOpenReflow}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-500"
                >
                  <Volume2 size={14} aria-hidden="true" />
                  <span>{t('pdfA11yReflowReader')}</span>
                </button>
              )}

              <button
                type="button"
                tabIndex={0}
                data-toggle-reading-order
                aria-pressed={showReadingOrder}
                onClick={() => onToggleReadingOrder?.(!showReadingOrder, base?.readingOrder || [], Boolean(base?.isTagged))}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-emerald-500 ${
                  showReadingOrder
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                    : 'border-subtle bg-surface hover:bg-canvas'
                }`}
              >
                <Eye size={14} aria-hidden="true" />
                <span>{showReadingOrder ? t('pdfA11yHideReadingOrder') : t('pdfA11yShowReadingOrder')}</span>
              </button>
            </div>

            {/* Reading Order Badge Info */}
            <div className="p-2.5 rounded-xl border border-subtle bg-surface space-y-1">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider">{t('pdfA11yReadingOrder')}</span>
              <p className="text-muted leading-relaxed">
                {base.isTagged ? t('pdfA11yReadingOrderTagged') : t('pdfA11yReadingOrderEstimate')}
              </p>
            </div>

            {/* Audit Checklist */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider">{t('pdfA11yTitle')}</span>

              {/* 1. Tagging */}
              <div className="rounded-xl border border-subtle bg-surface p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-main">{t('pdfA11yTagged')}</span>
                  {base.isTagged ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                      <CheckCircle2 size={14} /> {t('pdfA11yPass')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-500 font-bold text-[11px]">
                      <XCircle size={14} /> {t('pdfA11yFail')}
                    </span>
                  )}
                </div>
                <p className="text-muted text-[11px]">
                  {base.isTagged ? t('pdfA11yTaggedPass') : t('pdfA11yTaggedFail')}
                </p>
              </div>

              {/* 2. Document Language */}
              <div className="rounded-xl border border-subtle bg-surface p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-main">{t('pdfA11yLang')}</span>
                  {base.hasLanguage ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                      <CheckCircle2 size={14} /> {t('pdfA11yPass')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-500 font-bold text-[11px]">
                      <XCircle size={14} /> {t('pdfA11yFail')}
                    </span>
                  )}
                </div>
                <p className="text-muted text-[11px]">
                  {base.hasLanguage ? t('pdfA11yLangPass', { lang: base.language || '' }) : t('pdfA11yLangFail')}
                </p>
                {!base.hasLanguage && (
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted">{t('pdfA11ySetLang')}:</span>
                    <button
                      type="button"
                      tabIndex={0}
                      data-set-lang-ar
                      disabled={fixing}
                      onClick={() => void handleFixLanguage('ar')}
                      className="rounded-lg border border-subtle bg-canvas px-2 py-1 text-xs font-semibold hover:border-emerald-500 focus-visible:outline-2 focus-visible:outline-emerald-500"
                    >
                      {t('pdfA11ySetLangAr')}
                    </button>
                    <button
                      type="button"
                      tabIndex={0}
                      data-set-lang-en
                      disabled={fixing}
                      onClick={() => void handleFixLanguage('en')}
                      className="rounded-lg border border-subtle bg-canvas px-2 py-1 text-xs font-semibold hover:border-emerald-500 focus-visible:outline-2 focus-visible:outline-emerald-500"
                    >
                      {t('pdfA11ySetLangEn')}
                    </button>
                  </div>
                )}
              </div>

              {/* 3. Document Title */}
              <div className="rounded-xl border border-subtle bg-surface p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-main">{t('pdfA11yDocTitle')}</span>
                  {base.hasTitle && base.displayDocTitle ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                      <CheckCircle2 size={14} /> {t('pdfA11yPass')}
                    </span>
                  ) : base.hasTitle && !base.displayDocTitle ? (
                    <span className="flex items-center gap-1 text-amber-500 font-bold text-[11px]">
                      <AlertTriangle size={14} /> {t('pdfA11yWarning')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-500 font-bold text-[11px]">
                      <XCircle size={14} /> {t('pdfA11yFail')}
                    </span>
                  )}
                </div>
                <p className="text-muted text-[11px]">
                  {base.hasTitle && base.displayDocTitle
                    ? t('pdfA11yDocTitlePass')
                    : base.hasTitle && !base.displayDocTitle
                    ? t('pdfA11yDocTitleWarn', { title: base.title || '' })
                    : t('pdfA11yDocTitleFail')}
                </p>
                {(!base.hasTitle || !base.displayDocTitle) && (
                  <div className="pt-1">
                    {!showTitlePrompt ? (
                      <button
                        type="button"
                        tabIndex={0}
                        data-show-set-title
                        onClick={() => setShowTitlePrompt(true)}
                        className="rounded-lg border border-subtle bg-canvas px-2.5 py-1 text-xs font-semibold hover:border-emerald-500 focus-visible:outline-2 focus-visible:outline-emerald-500"
                      >
                        {t('pdfA11ySetTitle')}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          tabIndex={0}
                          data-title-input
                          value={titleInput}
                          onChange={e => setTitleInput(e.target.value)}
                          placeholder={t('pdfA11yEnterTitle')}
                          className="min-w-0 flex-1 rounded-lg border border-subtle bg-canvas px-2 py-1 text-xs text-main outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          tabIndex={0}
                          data-save-title-button
                          disabled={fixing || !titleInput.trim()}
                          onClick={() => void handleFixTitle()}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {t('save')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Figures Alternative Text */}
              <div className="rounded-xl border border-subtle bg-surface p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-main">{t('pdfA11yFigures')}</span>
                  {base.figuresWithoutAlt === 0 ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                      <CheckCircle2 size={14} /> {t('pdfA11yPass')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-500 font-bold text-[11px]">
                      <AlertTriangle size={14} /> {t('pdfA11yWarning')}
                    </span>
                  )}
                </div>
                <p className="text-muted text-[11px]">
                  {base.figuresWithoutAlt === 0
                    ? t('pdfA11yFiguresPass')
                    : t('pdfA11yFiguresWarn', { count: base.figuresWithoutAlt })}
                </p>
              </div>

              {/* 5. Text Layer / Scanned Pages */}
              <div className="rounded-xl border border-subtle bg-surface p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-main">{t('pdfA11yTextLayer')}</span>
                  {base.pagesWithoutText.length === 0 ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                      <CheckCircle2 size={14} /> {t('pdfA11yPass')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-500 font-bold text-[11px]">
                      <XCircle size={14} /> {t('pdfA11yFail')}
                    </span>
                  )}
                </div>
                <p className="text-muted text-[11px]">
                  {base.pagesWithoutText.length === 0
                    ? t('pdfA11yTextLayerPass', { pages: base.totalPages })
                    : t('pdfA11yTextLayerFail', { count: base.pagesWithoutText.length })}
                </p>
                {base.pagesWithoutText.length > 0 && onOpenOcr && (
                  <div className="pt-1">
                    <button
                      type="button"
                      tabIndex={0}
                      data-open-ocr-tool
                      onClick={onOpenOcr}
                      className="rounded-lg border border-subtle bg-canvas px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:border-emerald-500 focus-visible:outline-2 focus-visible:outline-emerald-500"
                    >
                      {t('pdfA11yOpenOcr')}
                    </button>
                  </div>
                )}
              </div>

              {/* 6. Fonts without /ToUnicode */}
              <div className="rounded-xl border border-subtle bg-surface p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-main">{t('pdfA11yFonts')}</span>
                  {base.fontsWithoutToUnicode.length === 0 ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                      <CheckCircle2 size={14} /> {t('pdfA11yPass')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-500 font-bold text-[11px]">
                      <AlertTriangle size={14} /> {t('pdfA11yWarning')}
                    </span>
                  )}
                </div>
                <p className="text-muted text-[11px]">
                  {base.fontsWithoutToUnicode.length === 0
                    ? t('pdfA11yFontsPass')
                    : t('pdfA11yFontsWarn', { count: base.fontsWithoutToUnicode.length })}
                </p>
              </div>
            </div>

            {/* 7. Optional deeper check: veraPDF PDF/UA-1 */}
            {report.veraPdfAvailable && (
              <div className="rounded-xl border border-subtle bg-surface p-3 space-y-2" data-verapdf-section>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-main">
                    <ShieldCheck size={16} className="text-sky-500" />
                    <span>{t('pdfA11yVeraPdf')}</span>
                  </div>
                  <button
                    type="button"
                    tabIndex={0}
                    data-run-verapdf
                    disabled={runningVera}
                    onClick={() => void runCheck(true)}
                    className="rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-500"
                  >
                    {runningVera ? t('pdfA11yVeraPdfRunning') : t('pdfA11yVeraPdfRun')}
                  </button>
                </div>

                {report.veraPdfReport && (
                  <div className="space-y-1.5 pt-1 text-[11px]" data-verapdf-results>
                    <div className="flex items-center gap-1 font-bold">
                      {report.veraPdfReport.compliant ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 size={13} /> {t('pdfA11yVeraPdfCompliant')}
                        </span>
                      ) : (
                        <span className="text-red-500 flex items-center gap-1">
                          <XCircle size={13} /> {t('pdfA11yVeraPdfNonCompliant', { failed: report.veraPdfReport.failedRules })}
                        </span>
                      )}
                    </div>
                    {report.veraPdfReport.ruleSummaries.length > 0 && (
                      <ul className="space-y-1 rounded-lg border border-subtle/50 bg-canvas p-2 text-[10px] text-muted max-h-36 overflow-y-auto">
                        {report.veraPdfReport.ruleSummaries.slice(0, 8).map((rule, idx) => (
                          <li key={idx} className="flex flex-col gap-0.5">
                            <span className="font-semibold text-main">Clause {rule.clause}: {rule.description}</span>
                            {rule.errorMessage && <span>{rule.errorMessage}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div></Sheet>
  );
}
