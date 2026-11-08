'use client';

import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { normalizeSearchString } from '../../../shared/utils/text-normalizer';

const Providers = React.lazy(() => import('../library/ProviderSettingsModal').then(module => ({ default: module.ProviderSettingsModal })));
const Sync = React.lazy(() => import('../sync/CloudSyncModal').then(module => ({ default: module.CloudSyncModal })));

export function SettingsDirectory() {
  const { t, theme, lang, toggleTheme, toggleLanguage, setViewMode } = useWorkspace();
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'providers' | 'sync' | null>(null);
  const entries = [
    { id: 'theme', title: t('toggleTheme'), detail: t(theme === 'dark' ? 'themeDark' : 'themeLight'), action: toggleTheme },
    { id: 'language', title: t('toggleLanguage'), detail: t(lang === 'ar' ? 'bayanArabic' : 'bayanEnglish'), action: toggleLanguage },
    { id: 'providers', title: t('providerSettingsModalTitle'), detail: t('providerSettingsModalSubtitle'), action: () => setPanel('providers') },
    { id: 'sync', title: t('cloudSyncModalTitle'), detail: t('settingsSyncHint'), action: () => setPanel('sync') },
    { id: 'quran', title: t('navQuran'), detail: t('settingsQuranHint'), action: () => setViewMode('quran') },
    { id: 'library', title: t('navLibrary'), detail: t('settingsLibraryHint'), action: () => setViewMode('library') },
  ];
  const shown = entries.filter(entry => normalizeSearchString(`${entry.title} ${entry.detail}`).includes(normalizeSearchString(query)));
  return <section className="w-full max-w-3xl space-y-3 text-start" aria-label={t('settingsDirectoryTitle')}>
    <h3 className="font-bold text-main">{t('settingsDirectoryTitle')}</h3>
    <input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label={t('settingsSearch')} placeholder={t('settingsSearch')} className="w-full rounded-xl border border-subtle bg-surface p-3 text-main leading-relaxed" />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {shown.map(entry => <button key={entry.id} type="button" data-settings-entry={entry.id} onClick={entry.action} className="min-w-0 rounded-xl border border-subtle bg-surface p-4 text-start hover:border-pale-sky-500 focus-visible:outline-2 focus-visible:outline-pale-sky-500">
        <span className="block font-semibold text-main leading-relaxed">{entry.title}</span>
        <span className="block mt-1 text-xs text-muted leading-relaxed">{entry.detail}</span>
      </button>)}
    </div>
    {!shown.length && <p role="status">{t('studyNoResults')}</p>}
    <React.Suspense fallback={<p role="status">{t('loading')}</p>}>
      {panel === 'providers' && <Providers isOpen onClose={() => setPanel(null)} />}
      {panel === 'sync' && <Sync isOpen onClose={() => setPanel(null)} />}
    </React.Suspense>
  </section>;
}
