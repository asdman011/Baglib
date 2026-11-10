'use client';
import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { SearchProviderInfo } from '../../../shared/types/search';

export function SearchProviderSettings() {
  const { t, lang } = useWorkspace();
  const [providers, setProviders] = useState<SearchProviderInfo[]>([]);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void window.electronAPI.search.getProviders().then((items: SearchProviderInfo[]) => {
      if (alive) { setProviders(items); setBusy(false); }
    }, () => { if (alive) { setFailed(true); setBusy(false); } });
    return () => { alive = false; };
  }, []);
  const update = async (provider: SearchProviderInfo) => {
    setBusy(true); setFailed(false);
    try {
      if (await window.electronAPI.search.setProviderEnabled(provider.id, !provider.enabled) !== true) throw new Error();
      setProviders(current => current.map(item => item.id === provider.id ? { ...item, enabled: !item.enabled } : item));
    } catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return <fieldset data-search-provider-settings disabled={busy} className="space-y-4">
    {!providers.length && !failed && <p role="status">{t('loading')}</p>}
    {providers.map(provider => <label key={provider.id} className="flex items-start gap-3 rounded-xl border border-subtle p-3">
      <input type="checkbox" className="mt-2 shrink-0" checked={provider.enabled} onChange={() => void update(provider)} />
      <span className="min-w-0"><span className="block font-semibold leading-loose">{lang === 'ar' ? provider.nameAr : provider.name}</span><span className="block text-xs leading-loose text-muted">{lang === 'ar' ? provider.descriptionAr : provider.description}</span></span>
    </label>)}
    {failed && <p role="alert">{t('studyActionFailed')}</p>}
  </fieldset>;
}
