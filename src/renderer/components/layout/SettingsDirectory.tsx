'use client';
import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button, Modal } from '../ui';
import { SearchProviderSettings } from './SearchProviderSettings';
import { AdvancedSettings } from './AdvancedSettings';
import { SaveSettings } from './SaveSettings';
import { PackStatus, ONBOARDING_KEY, type OnboardingPreferences } from './FirstRunGuide';
import { SETTINGS_GROUPS, searchSettings } from './settings-directory-model';
import { StudyRhythmSettings } from '../dashboard/StudyRhythm';
import type { useAthan } from '../../hooks/useAthan';

const Providers = React.lazy(() => import('../library/ProviderSettingsModal').then(module => ({ default: module.ProviderSettingsModal })));
const Sync = React.lazy(() => import('../sync/CloudSyncModal').then(module => ({ default: module.CloudSyncModal })));
const Storage = React.lazy(() => import('../library/StorageManagerModal').then(module => ({ default: module.StorageManagerModal })));
const AI = React.lazy(() => import('../ai/AISettingsModal').then(module => ({ default: module.AISettingsModal })));
const Lock = React.lazy(() => import('../security/AppLockModal').then(module => ({ default: module.AppLockModal })));
const Plugins = React.lazy(() => import('../plugins/ReaderPluginsModal').then(module => ({ default: module.ReaderPluginsModal })));
const Wird = React.lazy(() => import('../dashboard/QuranWirdSettingsModal').then(module => ({ default: module.QuranWirdSettingsModal })));
const Prayer = React.lazy(() => import('./PrayerReminderSettings').then(module => ({ default: module.PrayerReminderSettings })));

function PreferenceToggle({ settingKey, fallback }: { settingKey: string; fallback: boolean }) {
  const { t } = useWorkspace();
  const [value, setValue] = useState(fallback);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void window.electronAPI.settings.get(settingKey, fallback).then(saved => { if (alive) { setValue(saved === true); setBusy(false); } }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [settingKey, fallback]);
  return <div><label className="flex items-center gap-3"><input type="checkbox" checked={value} disabled={busy} onChange={async event => {
    const next = event.target.checked;
    setBusy(true); setFailed(false);
    try { if (await window.electronAPI.settings.set(settingKey, next) !== true) throw new Error(); setValue(next); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }} />{t('settingsEnabled')}</label>{failed && <p role="alert">{t('studyActionFailed')}</p>}</div>;
}

export function SettingsDirectory({ athan }: { athan?: ReturnType<typeof useAthan> }) {
  const { t, lang, dir, theme, toggleTheme, toggleLanguage, toggleNavPinned, setViewMode, setIsSupportSheetOpen, activeBook, books } = useWorkspace();
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [folder, setFolder] = useState('');
  const entries = searchSettings(query);
  const selected = entries.find(entry => entry.action === panel);
  const close = () => setPanel(null);
  const open = async (action: string) => {
    setFailed(false);
    switch (action) {
      case 'theme': toggleTheme(); return;
      case 'language': toggleLanguage(); return;
      case 'navigation': toggleNavPinned(); return;
      case 'guide': window.dispatchEvent(new Event('baglib:first-run')); return;
      case 'about': setIsSupportSheetOpen(true); return;
      case 'library': case 'dashboard': case 'notes': case 'quran': case 'pathways': setViewMode(action); return;
      case 'reader': case 'ocr':
        if (activeBook) { setViewMode('reader'); return; }
        setPanel('reader'); return;
      case 'folder': {
        try {
          const saved = await window.electronAPI.settings.get(ONBOARDING_KEY) as OnboardingPreferences | undefined;
          setFolder(saved?.libraryFolder || ''); setPanel(action);
        } catch { setFailed(true); }
        return;
      }
      default: setPanel(action);
    }
  };
  const chooseFolder = async () => {
    try {
      const next = await window.electronAPI.openDirectoryDialog();
      if (!next) return;
      const saved = await window.electronAPI.settings.get(ONBOARDING_KEY) as OnboardingPreferences | undefined;
      if (await window.electronAPI.settings.set(ONBOARDING_KEY, { ...saved, libraryFolder: next }) !== true) throw new Error();
      setFolder(next);
    } catch { setFailed(true); }
  };
  const modalProps = { isOpen: true, onClose: close };
  return <section data-settings-directory dir={dir} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-canvas p-4 text-start text-main sm:p-8">
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-2xl font-semibold leading-loose">{t('settingsTitle')}</h1><Button variant="ghost" onClick={() => setIsSupportSheetOpen(true)}>{t('settingAbout')}</Button></header>
      <label className="flex items-center gap-3 rounded-xl border border-subtle bg-surface px-4 py-3"><Search size={18} aria-hidden className="shrink-0 text-muted" /><input data-settings-search type="search" dir="auto" value={query} onChange={event => setQuery(event.target.value)} aria-label={t('settingsSearch')} placeholder={t('settingsSearch')} className="min-w-0 flex-1 bg-transparent text-sm leading-loose outline-none" /></label>
      {failed && <p role="alert">{t('studyActionFailed')}</p>}
      {SETTINGS_GROUPS.map(group => {
        const shown = entries.filter(entry => entry.group === group.id);
        if (!shown.length) return null;
        const content = <div className="divide-y divide-subtle">{shown.map(entry => <button key={entry.id} type="button" data-settings-entry={entry.id} data-settings-keys={entry.keys.join(' ')} onClick={() => void open(entry.action)} className="block w-full rounded-xl p-4 text-start hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus">
          <span className="block text-sm font-semibold leading-loose">{t(entry.label)}{entry.action === 'theme' && <small className="ms-3 text-muted">{t(theme === 'dark' ? 'themeDark' : 'themeLight')}</small>}</span>
          <span className="mt-1 block text-xs leading-loose text-muted">{t(entry.description)}</span>
        </button>)}</div>;
        return group.id === 'advanced' ? <details key={group.id} open={query.trim() ? true : undefined} className="rounded-xl border border-subtle p-3"><summary className="cursor-pointer font-semibold leading-loose">{t(group.label)}</summary>{content}</details> : <section key={group.id} aria-label={t(group.label)}><h2 className="px-4 text-sm font-semibold leading-loose text-muted">{t(group.label)}</h2>{content}</section>;
      })}
      {!entries.length && <p role="status">{t('studyNoResults')}</p>}
    </div>
    <React.Suspense fallback={<p role="status">{t('loading')}</p>}>
      {panel === 'providers' && <Providers {...modalProps} />}
      {panel === 'sync' && <Sync {...modalProps} />}
      {panel === 'storage' && <Storage {...modalProps} books={books} />}
      {panel === 'ai' && <AI {...modalProps} t={t} />}
      {panel === 'lock' && <Lock {...modalProps} lang={lang} />}
      {panel === 'plugins' && <Plugins {...modalProps} lang={lang} />}
      {panel === 'wird' && <Wird {...modalProps} />}
      {['advanced', 'saving', 'rhythm', 'packs', 'folder', 'reader', 'honorifics', 'questions', 'prayer', 'searchProviders'].includes(panel || '') && <Modal open onClose={close} title={t(selected?.label || 'settingReader')}>
        {panel === 'searchProviders' && <SearchProviderSettings />}
        {panel === 'advanced' && <AdvancedSettings />}
        {panel === 'saving' && <SaveSettings />}
        {panel === 'rhythm' && <StudyRhythmSettings />}
        {panel === 'packs' && <PackStatus />}
        {panel === 'folder' && <div className="space-y-4"><p className="text-sm leading-loose">{t('firstRunFolderHint')}</p><p dir="auto" className="break-all">{folder}</p><Button variant="secondary" onClick={() => void chooseFolder()}>{t('settingFolder')}</Button></div>}
        {panel === 'reader' && <p className="leading-loose">{t('settingsReaderRequired')}</p>}
        {panel === 'honorifics' && <PreferenceToggle settingKey="notes.honorifics.autoExpand.v1" fallback />}
        {panel === 'questions' && <PreferenceToggle settingKey="knowledge.questions.enabled" fallback={false} />}
        {panel === 'prayer' && (athan?.snapshot ? <Prayer athan={athan} /> : <p role="status">{t('loading')}</p>)}
      </Modal>}
    </React.Suspense>
  </section>;
}
