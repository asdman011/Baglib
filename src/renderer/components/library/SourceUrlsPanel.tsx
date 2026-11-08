'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FileJson, RefreshCw, RotateCcw } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { SOURCE_KEYS, type SourceUrlState } from '../../../shared/source-urls';

const button = 'inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-1.5 text-xs font-semibold disabled:opacity-50';

/** KEY-260: book-site addresses come from one file that can be replaced when a mirror is blocked. */
export function SourceUrlsPanel({ onStatus }: { onStatus?: (status: { dirty: boolean; busy: boolean }) => void } = {}) {
  const { t } = useWorkspace();
  const api = window.electronAPI.sources;
  const [state, setState] = useState<SourceUrlState | null>(null);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let alive = true;
    if (api) void api.get().then(value => { if (alive) { setState(value); setAddress(value.updateUrl); } }).catch(() => {});
    return () => { alive = false; };
  }, [api]);
  const dirty = !!state && address !== state.updateUrl;
  useEffect(() => { onStatus?.({ dirty, busy }); }, [onStatus, dirty, busy]);
  const act = async (work: () => Promise<SourceUrlState | null>, updateAddress = false) => {
    setBusy(true); setMessage(null);
    try { const next = await work(); if (next && mounted.current) { setState(next); if (updateAddress) setAddress(next.updateUrl); setMessage({ error: false, text: t('sourceUrlsUpdated', { date: next.file.updated }) }); } }
    catch { if (mounted.current) setMessage({ error: true, text: t('sourceUrlsFailed') }); }
    finally { if (mounted.current) setBusy(false); }
  };
  if (!state) return null;
  return <section className="p-3.5 rounded-2xl bg-canvas border border-subtle space-y-2 text-xs" data-source-urls>
    <h4 className="font-semibold text-main">{t('sourceUrlsTitle')}</h4>
    <p className="text-[11px] text-muted leading-relaxed">{t('sourceUrlsNotice', { date: state.file.updated })}{state.custom && ` ${t('sourceUrlsCustom')}`}</p>
    <ul className="space-y-1">{SOURCE_KEYS.map(key => <li key={key}><span className="font-semibold">{t(key === 'libgen' ? 'sourceUrlsLibgen' : 'sourceUrlsAnnas')}</span>: <bdi dir="ltr" className="text-muted break-all">{state.file.sources[key].map(url => new URL(url).host).join(' · ')}</bdi></li>)}</ul>
    <div className="flex flex-wrap gap-2">
      <input dir="ltr" value={address} onChange={event => setAddress(event.target.value)} placeholder="https://…/sources.json" aria-label={t('sourceUrlsAddress')} className="min-w-0 flex-1 rounded-lg border border-subtle bg-surface p-1.5" />
      <button type="button" className={button} disabled={busy || !address.trim()} onClick={() => void act(() => api.update(address), true)}><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />{t('sourceUrlsUpdate')}</button>
      <button type="button" className={button} disabled={busy} onClick={() => void act(() => api.importFile())}><FileJson className="w-3.5 h-3.5" />{t('sourceUrlsImport')}</button>
      {state.custom && <button type="button" className={button} disabled={busy} onClick={() => void act(() => api.reset())}><RotateCcw className="w-3.5 h-3.5" />{t('sourceUrlsReset')}</button>}
    </div>
    {message && <p role={message.error ? 'alert' : 'status'} className="text-[11px]">{message.text}</p>}
  </section>;
}
