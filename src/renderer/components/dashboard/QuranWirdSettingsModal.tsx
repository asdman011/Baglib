'use client';

import React, { useState, useEffect } from 'react';
import { X, BookOpen, AlertCircle, CheckCircle2, RotateCw } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  DEFAULT_QURAN_WIRD_CONFIG,
  validateQuranWirdConfig,
  type QuranWirdConfig,
  type QuranWirdProfile,
  type QuranWirdUnit,
} from '../../../shared/quran-wird';

export interface QuranWirdSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (savedConfig: QuranWirdConfig) => void;
}

export function QuranWirdSettingsModal({ isOpen, onClose, onSaved }: QuranWirdSettingsModalProps) {
  const { t, dir } = useWorkspace();

  const [config, setConfig] = useState<QuranWirdConfig>(DEFAULT_QURAN_WIRD_CONFIG);
  const [layoutAvailable, setLayoutAvailable] = useState<boolean>(true);
  const [hasLayoutWarning, setHasLayoutWarning] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let alive = true;
    void (async () => {
      try {
        const loaded = await window.electronAPI?.studyWird?.getConfig?.();
        if (alive && loaded) {
          const validated = validateQuranWirdConfig(loaded);
          setConfig(validated);

          // Check if current profile has layout installed
          const ok = await window.electronAPI?.studyWird?.hasLayout?.(validated.profile);
          if (alive) {
            setLayoutAvailable(Boolean(ok));
            if (validated.unit === 'pages' && !ok) {
              setHasLayoutWarning(true);
            }
          }
        }
      } catch {}
    })();

    return () => {
      alive = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProfileChange = async (profile: QuranWirdProfile) => {
    setConfig(prev => ({ ...prev, profile }));
    setHasLayoutWarning(false);
    try {
      const ok = await window.electronAPI?.studyWird?.hasLayout?.(profile);
      setLayoutAvailable(Boolean(ok));
      if (config.unit === 'pages' && !ok) {
        setHasLayoutWarning(true);
      }
    } catch {
      setLayoutAvailable(false);
    }
  };

  const handleUnitChange = (unit: QuranWirdUnit) => {
    setConfig(prev => ({ ...prev, unit }));
    if (unit === 'pages' && !layoutAvailable) {
      setHasLayoutWarning(true);
    } else {
      setHasLayoutWarning(false);
    }
  };

  const handleWeekdayToggle = (day: number) => {
    setConfig(prev => {
      const exists = prev.activeWeekdays.includes(day);
      let updated: number[];
      if (exists) {
        // Must have at least 1 active day
        if (prev.activeWeekdays.length <= 1) return prev;
        updated = prev.activeWeekdays.filter(d => d !== day);
      } else {
        updated = [...prev.activeWeekdays, day].sort((a, b) => a - b);
      }
      return { ...prev, activeWeekdays: updated };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (config.unit === 'pages' && !layoutAvailable) {
      setHasLayoutWarning(true);
      return;
    }

    setIsSaving(true);
    try {
      const saved = await window.electronAPI?.studyWird?.saveConfig?.(config);
      if (saved) {
        setSaveSuccess(true);
        onSaved?.(saved);
        setTimeout(() => {
          setSaveSuccess(false);
          onClose();
        }, 700);
      }
    } catch (err: unknown) {
      const typedErr = err as { error?: string };
      if (typedErr?.error === 'missing-layout') {
        setHasLayoutWarning(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const weekdays = [
    { day: 6, label: t('todayDaySat') },
    { day: 0, label: t('todayDaySun') },
    { day: 1, label: t('todayDayMon') },
    { day: 2, label: t('todayDayTue') },
    { day: 3, label: t('todayDayWed') },
    { day: 4, label: t('todayDayThu') },
    { day: 5, label: t('todayDayFri') },
  ];

  return (
    <div
      role="dialog"
      data-quran-wird-settings-modal
      aria-modal="true"
      aria-label={t('quranWirdSettingsTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div
        dir={dir}
        className="w-full max-w-lg rounded-2xl border border-subtle bg-surface p-5 shadow-2xl space-y-4 text-main max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle/50 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-base font-bold">{t('quranWirdSettingsTitle')}</h3>
          </div>
          <button
            type="button"
            data-wird-settings-close
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:text-main hover:bg-surface/80 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs sm:text-sm">
          {/* Missing layout alert banner */}
          {hasLayoutWarning && (
            <div
              data-wird-layout-warning
              className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">{t('quranWirdMissingLayoutError')}</p>
                <p className="text-xs leading-relaxed">{t('quranWirdMissingLayoutWarning')}</p>
              </div>
            </div>
          )}

          {/* Profile: Hafs or Warsh */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-muted">
              {t('quranWirdProfileLabel')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-wird-profile-hafs
                onClick={() => void handleProfileChange('hafs')}
                className={`flex items-center justify-center rounded-xl border p-2.5 font-medium transition-all cursor-pointer ${
                  config.profile === 'hafs'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'border-subtle bg-canvas text-muted hover:text-main'
                }`}
              >
                {t('quranWirdProfileHafs')}
              </button>
              <button
                type="button"
                data-wird-profile-warsh
                onClick={() => void handleProfileChange('warsh')}
                className={`flex items-center justify-center rounded-xl border p-2.5 font-medium transition-all cursor-pointer ${
                  config.profile === 'warsh'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'border-subtle bg-canvas text-muted hover:text-main'
                }`}
              >
                {t('quranWirdProfileWarsh')}
              </button>
            </div>
          </div>

          {/* Unit: Pages, Ayahs, Juz */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-muted">
              {t('quranWirdUnitLabel')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                data-wird-unit-pages
                onClick={() => handleUnitChange('pages')}
                className={`flex items-center justify-center rounded-xl border p-2.5 font-medium transition-all cursor-pointer ${
                  config.unit === 'pages'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'border-subtle bg-canvas text-muted hover:text-main'
                }`}
              >
                {t('quranWirdUnitPages')}
              </button>
              <button
                type="button"
                data-wird-unit-ayahs
                onClick={() => handleUnitChange('ayahs')}
                className={`flex items-center justify-center rounded-xl border p-2.5 font-medium transition-all cursor-pointer ${
                  config.unit === 'ayahs'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'border-subtle bg-canvas text-muted hover:text-main'
                }`}
              >
                {t('quranWirdUnitAyahs')}
              </button>
              <button
                type="button"
                data-wird-unit-juz
                onClick={() => handleUnitChange('juz')}
                className={`flex items-center justify-center rounded-xl border p-2.5 font-medium transition-all cursor-pointer ${
                  config.unit === 'juz'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'border-subtle bg-canvas text-muted hover:text-main'
                }`}
              >
                {t('quranWirdUnitJuz')}
              </button>
            </div>
          </div>

          {/* Daily Amount */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-muted">
              {t('quranWirdAmountLabel')}
            </label>
            <input
              type="number"
              min={1}
              max={config.unit === 'ayahs' ? 300 : config.unit === 'juz' ? 10 : 100}
              value={config.dailyAmount}
              onChange={e => setConfig(prev => ({ ...prev, dailyAmount: Math.max(1, Number(e.target.value) || 1) }))}
              className="w-full rounded-xl border border-subtle bg-canvas px-3 py-2 text-main focus:border-emerald-500 focus:outline-hidden"
            />
          </div>

          {/* Muraja'a (Revision Cycle) Section */}
          <div className="space-y-3 rounded-xl border border-subtle/80 bg-canvas/40 p-3.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 font-semibold cursor-pointer">
                <RotateCw className="h-4 w-4 text-emerald-500" />
                <span>{t('quranWirdMurajaaSection')}</span>
              </label>
              <input
                type="checkbox"
                data-wird-murajaa-toggle
                checked={config.murajaa.enabled}
                onChange={e =>
                  setConfig(prev => ({
                    ...prev,
                    murajaa: { ...prev.murajaa, enabled: e.target.checked },
                  }))
                }
                className="h-4 w-4 rounded-sm border-subtle accent-emerald-600 cursor-pointer"
              />
            </div>

            {config.murajaa.enabled && (
              <div className="space-y-3 pt-2 border-t border-subtle/40">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-xs text-muted font-medium">
                      {t('quranWirdMurajaaAmount')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={config.murajaa.amount}
                      onChange={e =>
                        setConfig(prev => ({
                          ...prev,
                          murajaa: { ...prev.murajaa, amount: Math.max(1, Number(e.target.value) || 1) },
                        }))
                      }
                      className="w-full rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-main text-xs focus:border-emerald-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs text-muted font-medium">
                      {t('quranWirdMurajaaRangeLimit')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={config.murajaa.rangeLimit || 30}
                      onChange={e =>
                        setConfig(prev => ({
                          ...prev,
                          murajaa: { ...prev.murajaa, rangeLimit: Math.max(1, Math.min(30, Number(e.target.value) || 30)) },
                        }))
                      }
                      className="w-full rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-main text-xs focus:border-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Active Weekdays */}
          <div className="space-y-2">
            <label className="block font-semibold text-muted">
              {t('quranWirdActiveWeekdays')}
            </label>
            <div className="grid grid-cols-7 gap-1.5">
              {weekdays.map(({ day, label }) => {
                const active = config.activeWeekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleWeekdayToggle(day)}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2 text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'border-subtle/50 bg-canvas text-muted/60 hover:text-muted'
                    }`}
                  >
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-subtle/50">
            {saveSuccess && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{t('quranWirdSaveSuccess')}</span>
              </span>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-subtle px-4 py-2 font-medium text-muted hover:text-main cursor-pointer"
            >
              {t('cancel')}
            </button>

            <button
              type="submit"
              disabled={isSaving}
              data-wird-settings-save
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 font-bold cursor-pointer transition-all shadow-xs disabled:opacity-50"
            >
              <span>{t('save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
