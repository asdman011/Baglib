'use client';
import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button, Modal } from '../ui';

export const ONBOARDING_KEY = 'onboarding.v1';
export interface OnboardingPreferences { seen: boolean; libraryFolder?: string }

export function PackStatus() {
  const { t } = useWorkspace();
  const [status, setStatus] = useState<('loading' | 'firstRunPresent' | 'firstRunMissing' | 'firstRunUnknown')[]>(['loading', 'loading', 'loading']);
  useEffect(() => {
    let alive = true;
    const checks = [
      async () => { const result = await window.electronAPI.quran.readerCatalog(); if (!result.ok) throw new Error(); return result.data.sources.length > 0; },
      async () => { const result = await window.electronAPI.sunnah.catalog(); if (!result.ok) throw new Error(); return !!result.data?.hadithCount; },
      async () => { const result = await window.electronAPI.poetry.status(); if (!result.ok) throw new Error(); return result.data.phase === 'ready'; },
    ];
    checks.forEach((check, index) => {
      void check().then(present => {
        if (alive) setStatus(current => current.map((value, i) => i === index ? present ? 'firstRunPresent' : 'firstRunMissing' : value));
      }, () => { if (alive) setStatus(current => current.map((value, i) => i === index ? 'firstRunUnknown' : value)); });
    });
    return () => { alive = false; };
  }, []);
  return <div data-pack-status className="space-y-3">
    <p className="text-sm leading-loose text-muted">{t('firstRunPacksHint')}</p>
    <dl className="space-y-3">{(['navQuran', 'navSunnah', 'navBayan'] as const).map((label, index) => <div key={label} className="flex flex-wrap justify-between gap-2 rounded-xl border border-subtle p-3"><dt>{t(label)}</dt><dd role="status">{t(status[index])}</dd></div>)}</dl>
  </div>;
}

export function FirstRunGuide({ ready }: { ready: boolean }) {
  const { t, theme, lang, toggleTheme, toggleLanguage, setViewMode, setDroppedImportPaths, setIsImportWizardOpen, setIsSupportSheetOpen } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState<OnboardingPreferences>({ seen: false });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void window.electronAPI.settings.get(ONBOARDING_KEY).then(value => {
      if (!alive) return;
      const saved = value && typeof value === 'object' ? value as OnboardingPreferences : { seen: false };
      setPreferences(saved);
      setOpen(!saved.seen);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [ready]);
  useEffect(() => {
    const reopen = () => { setStep(0); setFailed(false); setOpen(true); setIsSupportSheetOpen(false); };
    window.addEventListener('baglib:first-run', reopen);
    return () => window.removeEventListener('baglib:first-run', reopen);
  }, [setIsSupportSheetOpen]);
  const finish = async (importBooks = false) => {
    if (busy) return;
    setBusy(true); setFailed(false);
    try {
      const saved = await window.electronAPI.settings.set(ONBOARDING_KEY, { ...preferences, seen: true });
      if (saved !== true) throw new Error();
      setOpen(false);
      if (importBooks) {
        setViewMode('library');
        setDroppedImportPaths(preferences.libraryFolder ? [preferences.libraryFolder] : []);
        setIsImportWizardOpen(true);
      }
    } catch { setFailed(true); }
    finally { setBusy(false); }
  };
  const chooseFolder = async () => {
    setBusy(true); setFailed(false);
    try {
      const folder = await window.electronAPI.openDirectoryDialog();
      if (folder) {
        const next = { ...preferences, libraryFolder: folder };
        if (await window.electronAPI.settings.set(ONBOARDING_KEY, next) !== true) throw new Error();
        setPreferences(next);
      }
    } catch { setFailed(true); }
    finally { setBusy(false); }
  };
  const labels = ['settingLanguage', 'settingFolder', 'settingPacks', 'firstRunImport'] as const;
  return <Modal open={open} onClose={() => { if (!busy) void finish(); }} title={t('firstRunTitle')}>
    <div data-first-run data-first-run-step={step} className="space-y-5 text-start leading-loose">
      <h2 className="text-lg font-semibold">{t(labels[step])}</h2>
      {step === 0 && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><span>{t('settingLanguage')}</span><Button variant="secondary" data-guide-language onClick={toggleLanguage}>{t(lang === 'ar' ? 'bayanArabic' : 'bayanEnglish')}</Button></div>
        <div className="flex flex-wrap items-center justify-between gap-2"><span>{t('settingTheme')}</span><Button variant="secondary" data-guide-theme onClick={toggleTheme}>{t(theme === 'dark' ? 'themeDark' : 'themeLight')}</Button></div>
      </div>}
      {step === 1 && <div className="space-y-3"><p className="text-sm text-muted">{t('firstRunFolderHint')}</p><p dir="auto" className="break-all text-sm">{preferences.libraryFolder}</p><Button variant="secondary" data-guide-folder disabled={busy} onClick={() => void chooseFolder()}>{t('settingFolder')}</Button></div>}
      {step === 2 && <PackStatus />}
      {step === 3 && <div className="space-y-3"><p className="text-sm text-muted">{t('settingsLibraryHint')}</p><Button data-guide-import disabled={busy} onClick={() => void finish(true)}>{t('firstRunImport')}</Button></div>}
      {failed && <p role="alert">{t('studyActionFailed')}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-subtle pt-4">
        <Button variant="ghost" data-guide-skip disabled={busy} onClick={() => void finish()}>{t('firstRunSkip')}</Button>
        <div className="ms-auto flex flex-wrap gap-2">
          {step > 0 && <Button variant="secondary" data-guide-back disabled={busy} onClick={() => setStep(value => value - 1)}>{t('firstRunBack')}</Button>}
          <Button data-guide-next disabled={busy} onClick={() => step === 3 ? void finish() : setStep(value => value + 1)}>{t(step === 3 ? 'firstRunFinish' : 'firstRunNext')}</Button>
        </div>
      </div>
    </div>
  </Modal>;
}
