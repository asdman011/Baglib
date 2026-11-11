'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Pin,
  X,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  formatHijriCivilDate,
  type CurriculumExamConfig,
  type ReplanResult,
} from '../../../shared/curriculum-exam';
import { Modal } from '../ui/Modal';

const control = 'rounded-lg border border-subtle bg-surface p-2 text-sm text-main min-w-0';
const button = 'inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-2 text-sm disabled:opacity-50 cursor-pointer';
const primary = 'inline-flex items-center gap-1.5 rounded-lg bg-pale-sky-600 text-white px-3 py-2 text-sm disabled:opacity-50 cursor-pointer';

export function CurriculumExamModal({
  pathwayId,
  pathwayName,
  isOpen,
  onClose,
  onPlanApplied,
}: {
  pathwayId: string;
  pathwayName: string;
  isOpen: boolean;
  onClose: () => void;
  onPlanApplied: () => void;
}) {
  const { t, lang } = useWorkspace();
  const [examDate, setExamDate] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState<Record<number, number>>({
    0: 60,
    1: 60,
    2: 60,
    3: 60,
    4: 60,
    5: 0,
    6: 60,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [preview, setPreview] = useState<ReplanResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);

  const loadPreview = useCallback(async (targetExamDate?: string) => {
    const inputVal = typeof document !== 'undefined'
      ? (document.getElementById('exam-date-input') as HTMLInputElement)?.value
      : undefined;
    const target = targetExamDate ?? inputVal ?? examDate;
    if (!target) return;
    setLoadingPreview(true);
    setAppliedSuccess(false);
    try {
      // First save draft config so preview uses current settings
      await window.electronAPI.pathwayExam?.saveConfig?.({
        pathwayId,
        examDate: target,
        availableMinutesPerDay: dailyMinutes,
      });

      const res = await window.electronAPI.pathwayExam?.previewReplan?.(pathwayId, lang);
      setPreview(res);
    } catch {
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [dailyMinutes, examDate, lang, pathwayId]);

  useEffect(() => {
    let alive = true;
    if (isOpen && pathwayId) {
      window.electronAPI.pathwayExam?.getConfig?.(pathwayId)
        .then((cfg: CurriculumExamConfig) => {
          if (!alive || !cfg) return;
          setExamDate(cfg.examDate || '');
          if (cfg.availableMinutesPerDay) {
            setDailyMinutes(cfg.availableMinutesPerDay);
          }
          if (cfg.examDate) {
            void loadPreview(cfg.examDate);
          }
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [isOpen, pathwayId, loadPreview]);

  if (!isOpen) return null;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSaveSuccess(false);
    try {
      await window.electronAPI.pathwayExam?.saveConfig?.({
        pathwayId,
        examDate: examDate || null,
        availableMinutesPerDay: dailyMinutes,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      if (examDate) {
        await loadPreview();
      }
    } catch {
      // Error handled silently
    } finally {
      setSavingSettings(false);
    }
  };

  const handleApplyReplan = async () => {
    if (!preview || preview.suggestedSchedule.length === 0) return;
    setApplying(true);
    try {
      const schedule = preview.suggestedSchedule.map(s => ({
        taskId: s.taskId,
        date: s.suggestedDate,
      }));
      await window.electronAPI.pathwayExam?.applyReplan?.(pathwayId, schedule);
      setAppliedSuccess(true);
      onPlanApplied();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch {
      // Handle error
    } finally {
      setApplying(false);
    }
  };

  const weekdayNamesAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة (راحة)', 'السبت'];
  const weekdayNamesEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday (Rest)', 'Saturday'];

  return (
    <div



      data-curriculum-exam-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <Modal asChild open={true} onClose={onClose} label={t('pathwayExamModalTitle')}><div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-subtle bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle/60 p-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="rounded-lg bg-pale-sky-500/15 p-2 text-pale-sky-600 dark:text-pale-sky-400">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 id="exam-modal-title" className="text-sm sm:text-base font-bold text-main truncate">
                {t('pathwayExamModalTitle')}
              </h3>
              <p className="text-xs text-muted truncate">{pathwayName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t('close')}
            aria-label={t('close')}
            className="rounded-lg p-1 text-muted hover:bg-surface/80 hover:text-main cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs sm:text-sm">
          {/* Exam Date & Schedule Config */}
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="exam-date-input" className="block text-xs font-semibold text-muted">
                {t('pathwayExamDateLabel')}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="exam-date-input"
                  data-exam-date-input
                  type="date"
                  value={examDate}
                  onChange={e => setExamDate(e.target.value)}
                  className={`${control} py-1.5`}
                />
                {examDate && (
                  <span className="text-xs text-muted bg-surface/90 px-2 py-1 rounded-md border border-subtle/60">
                    {formatHijriCivilDate(examDate, lang)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted">{t('pathwayExamDateHint')}</p>
            </div>

            {/* Daily available minutes */}
            <div className="space-y-2 pt-2 border-t border-subtle/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {t('pathwayExamAvailableTime')}
                </span>
                <span className="text-[11px] text-muted">{t('pathwayExamRestDayNotice')}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {[0, 1, 2, 3, 4, 5, 6].map(day => {
                  const dayName = lang === 'ar' ? weekdayNamesAr[day] : weekdayNamesEn[day];
                  return (
                    <div
                      key={day}
                      className={`p-2 rounded-lg border text-xs flex flex-col gap-1 ${
                        day === 5
                          ? 'border-dashed border-subtle/80 bg-subtle/10'
                          : 'border-subtle bg-surface/60'
                      }`}
                    >
                      <span className="font-semibold text-muted truncate">{dayName}</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={1440}
                          step={15}
                          value={dailyMinutes[day] ?? (day === 5 ? 0 : 60)}
                          onChange={e =>
                            setDailyMinutes(prev => ({
                              ...prev,
                              [day]: Number(e.target.value) || 0,
                            }))
                          }
                          aria-label={dayName}
                          className={`${control} py-0.5 px-1.5 text-xs w-full`}
                        />
                        <span className="text-[10px] text-muted">m</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="submit"
                disabled={savingSettings}
                className={`${button} text-xs py-1.5`}
              >
                {t('pathwayExamSaveSettings')}
              </button>
              {saveSuccess && (
                <span role="status" className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" />
                  {t('pathwayExamSaved')}
                </span>
              )}
            </div>
          </form>

          {/* Re-Plan Preview Section */}
          <div className="space-y-3 pt-3 border-t border-subtle/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs sm:text-sm font-bold text-main flex items-center gap-1.5">
                <Sparkles className="size-4 text-pale-sky-500" />
                <span>{t('pathwayExamPreviewTitle')}</span>
              </h4>
              <button
                type="button"
                data-replan-preview-btn
                disabled={!examDate || loadingPreview}
                onClick={() => void loadPreview()}
                className={`${primary} text-xs py-1.5`}
              >
                {loadingPreview ? t('pathwayExamCalculating') : t('pathwayExamGeneratePreview')}
              </button>
            </div>

            {preview && (
              <div className="space-y-3">
                {/* Result Status Banner */}
                {preview.fits ? (
                  <div
                    data-replan-fits-alert
                    role="status"
                    className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 space-y-1 text-xs"
                  >
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        {t('pathwayExamSummaryFits', {
                          steps: preview.totalRemainingSteps,
                          days: preview.freeDaysCount,
                          daily:
                            preview.freeDaysCount > 0
                              ? (preview.totalRemainingSteps / preview.freeDaysCount).toFixed(1)
                              : 0,
                        })}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    data-replan-unfit-alert
                    role="alert"
                    className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 space-y-2 text-xs"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <p className="leading-relaxed font-semibold">{preview.unfitMessage}</p>
                    </div>

                    {/* Drop or Shorten Suggestions */}
                    {preview.droppedOrShortenedSuggestions.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-amber-500/30 space-y-1.5">
                        <span className="font-bold text-amber-950 dark:text-amber-100 flex items-center gap-1">
                          <Layers className="size-3.5" />
                          {t('pathwayExamDropSuggestionsTitle')}
                        </span>
                        <ul className="space-y-1">
                          {preview.droppedOrShortenedSuggestions.map(d => (
                            <li
                              key={d.section}
                              className="p-1.5 rounded-lg bg-surface/60 border border-amber-500/20 text-muted flex items-start justify-between gap-2"
                            >
                              <span>
                                {d.reason === 'already_mastered'
                                  ? t('pathwayExamDropMastered', { section: d.section })
                                  : t('pathwayExamDropProficient', { section: d.section })}
                              </span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 shrink-0">
                                {d.stepCount} steps
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Steps List Preview */}
                {preview.suggestedSchedule.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted">
                      {t('pathwayOutline')} ({preview.suggestedSchedule.length})
                    </span>
                    <ul className="max-h-48 overflow-y-auto rounded-lg border border-subtle divide-y divide-subtle/40 text-xs">
                      {preview.suggestedSchedule.map(s => (
                        <li key={s.itemId} className="p-2 flex items-center justify-between gap-2 hover:bg-surface/60">
                          <div className="flex items-center gap-2 min-w-0">
                            {s.pinned && (
                              <span title={t('pathwayExamPinnedDate')}>
                                <Pin className="size-3 text-pale-sky-500 shrink-0" />
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-main truncate" dir="auto">{s.title}</p>
                              <span className="text-[10px] text-muted truncate">{s.section}</span>
                            </div>
                          </div>
                          <div className="text-end shrink-0">
                            <span
                              className="font-mono text-[11px] text-pale-sky-600 dark:text-pale-sky-400"
                              title={t('pathwayExamStepDate', { date: s.suggestedDate })}
                            >
                              {s.suggestedDate}
                            </span>
                            <p className="text-[10px] text-muted">
                              {formatHijriCivilDate(s.suggestedDate, lang)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-subtle/60 p-4">
          <button type="button" className={button} onClick={onClose}>
            {t('close')}
          </button>

          {preview && preview.suggestedSchedule.length > 0 && (
            <div className="flex items-center gap-2">
              {appliedSuccess && (
                <span role="status" className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" />
                  {t('pathwayExamPlanApplied')}
                </span>
              )}
              <button
                type="button"
                data-replan-confirm-btn
                disabled={applying || appliedSuccess}
                onClick={() => void handleApplyReplan()}
                className={primary}
              >
                {t('pathwayExamConfirmPlan')}
              </button>
            </div>
          )}
        </div>
      </div></Modal>
    </div>
  );
}
