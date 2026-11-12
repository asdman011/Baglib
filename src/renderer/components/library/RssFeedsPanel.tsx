'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Plus, RefreshCw, Rss, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { RssFeed, RssItem } from '../../../shared/rss';
import type { TranslationKey } from '../../translations';

const ERROR_KEYS: [string, TranslationKey][] = [
  ['invalid-request', 'rssErrorInvalid'], ['not-a-feed', 'rssErrorNotFeed'], ['feed-exists', 'rssErrorExists'],
  ['feed-too-large', 'rssErrorTooLarge'], ['feed-unavailable', 'rssErrorUnavailable'],
];
const errorKey = (error: unknown): TranslationKey => ERROR_KEYS.find(([code]) => String(error).includes(code))?.[1] ?? 'rssErrorUnavailable';

/** KEY-50: register RSS or Atom feeds from libraries and blogs and read their newest items. */
export function RssFeedsPanel() {
  const { t, lang, dir } = useWorkspace();
  const [feeds, setFeeds] = useState<RssFeed[]>([]);
  const [items, setItems] = useState<RssItem[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState<'adding' | 'loading' | null>('loading');
  const [error, setError] = useState<TranslationKey | null>(null);

  const refresh = useCallback(async () => {
    setBusy('loading');
    try {
      const [list, result] = await Promise.all([window.electronAPI.rss.list(), window.electronAPI.rss.items()]);
      setFeeds(list); setItems(result.items); setFailed(result.failed.map(entry => entry.feedId));
    } catch (reason) { setError(errorKey(reason)); }
    finally { setBusy(null); }
  }, []);
  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);

  const add = async () => {
    setBusy('adding'); setError(null);
    try { await window.electronAPI.rss.add(address); setAddress(''); await refresh(); }
    catch (reason) { setError(errorKey(reason)); setBusy(null); }
  };
  const remove = async (id: string) => {
    try { await window.electronAPI.rss.remove(id); await refresh(); } catch (reason) { setError(errorKey(reason)); }
  };
  const date = (value: string | null) => value ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium' }).format(new Date(value)) : '';

  return <div className="space-y-3" dir={dir} data-rss-panel>
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); if (address.trim() && busy !== 'adding') void add(); }}>
      <input type="url" dir="ltr" value={address} onChange={event => setAddress(event.target.value)} maxLength={2000} placeholder={t('rssAddPlaceholder')} aria-label={t('rssAddPlaceholder')} data-rss-address
        className="min-w-[12rem] flex-1 rounded-xl border border-subtle bg-canvas px-3 py-2 text-xs text-main outline-none focus:border-pale-sky-500" />
      <button type="submit" disabled={!address.trim() || busy === 'adding'} data-rss-add className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-contrast disabled:opacity-50">
        <Plus className="size-3.5" aria-hidden="true" />{t(busy === 'adding' ? 'rssAdding' : 'rssAdd')}
      </button>
      <button type="button" onClick={() => void refresh()} disabled={busy !== null || feeds.length === 0} aria-label={t('rssRefresh')} title={t('rssRefresh')} className="rounded-xl border border-subtle px-2.5 py-2 text-muted disabled:opacity-40">
        <RefreshCw className={`size-3.5 ${busy === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
      </button>
    </form>
    <p className="text-[11px] leading-relaxed text-muted">{t('rssPrivacy')}</p>
    {error && <p role="alert" data-rss-error className="text-xs text-red-600 dark:text-red-400">{t(error)}</p>}
    {feeds.length > 0 && <ul className="flex flex-wrap gap-2" aria-label={t('rssTabLabel')}>
      {feeds.map(feed => <li key={feed.id} data-rss-feed={feed.id} className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${failed.includes(feed.id) ? 'border-amber-500/40 text-amber-700 dark:text-amber-300' : 'border-subtle text-main'}`}>
        <Rss className="size-3 shrink-0" aria-hidden="true" /><bdi className="truncate" title={failed.includes(feed.id) ? t('rssFeedFailed', { feed: feed.title }) : feed.url}>{feed.title}</bdi>
        <button type="button" onClick={() => void remove(feed.id)} aria-label={t('rssRemove')} title={t('rssRemove')} data-rss-remove className="rounded p-0.5 text-muted hover:text-main"><Trash2 className="size-3" aria-hidden="true" /></button>
      </li>)}
    </ul>}
    {busy === 'loading' && items.length === 0 ? <p role="status" className="text-xs text-muted">{t('loading')}</p>
      : feeds.length === 0 ? <p className="rounded-xl border border-dashed border-subtle p-4 text-xs leading-relaxed text-muted" data-rss-empty>{t('rssEmpty')}</p>
      : items.length === 0 ? <p className="text-xs text-muted">{t('rssNoItems')}</p>
      : <ul className="space-y-2">{items.map(item => <li key={item.feedId + item.id} data-rss-item className="space-y-1.5 rounded-2xl border border-subtle bg-canvas p-4">
          <div className="flex items-start justify-between gap-3">
            <bdi className="text-sm font-bold leading-relaxed text-main">{item.title}</bdi>
            {item.date && <span className="shrink-0 text-[10px] text-muted">{date(item.date)}</span>}
          </div>
          {item.summary && <p dir="auto" className="text-xs leading-relaxed text-muted">{item.summary}</p>}
          <div className="flex items-center justify-between gap-2 border-t border-subtle/50 pt-2 text-[11px]">
            <bdi className="font-semibold text-pale-sky-500" data-rss-item-source>{item.feedTitle}</bdi>
            {item.link && <button type="button" onClick={() => void window.electronAPI.openExternal(item.link)} className="flex items-center gap-1 font-bold text-amber-500 hover:underline">
              <span>{t('onlineReadFullArticle')}</span><ExternalLink className="size-3 rtl:-scale-x-100" aria-hidden="true" />
            </button>}
          </div>
        </li>)}</ul>}
  </div>;
}
