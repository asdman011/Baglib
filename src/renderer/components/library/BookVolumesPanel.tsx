'use client';

import React from 'react';
import { Layers, Plus } from 'lucide-react';
import type { BookItem } from '../../../shared/types/work';
import { bookVolumeIssue, nextBookVolume, relatedBookVolumes, volumeOrdinal } from '../../../shared/book-volumes';
import type { TranslationKey } from '../../translations';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function BookVolumeBadge({ book, t }: { book: BookItem; t: Translate }) {
  if (!String(book.volumeNumber ?? '').trim()) return null;
  return <span data-book-volume className="inline-block text-[10px] leading-relaxed rounded-md border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">{t(book.totalVolumes ? 'bookVolumeOfTotal' : 'bookVolumeLabel', { volume: String(book.volumeNumber), total: book.totalVolumes || '' })}</span>;
}

export function BookVolumesPanel({ book, books, t, saved, onChange, onOpen, onAdd }: { book: BookItem; books: BookItem[]; t: Translate; saved: boolean; onChange: (field: keyof BookItem, value: string | number | undefined) => void; onOpen?: (book: BookItem) => void; onAdd?: (book: BookItem) => void }) {
  const related = relatedBookVolumes(book, books);
  const issue = bookVolumeIssue(book);
  const next = nextBookVolume(book, books, '');
  const full = book.totalVolumes !== undefined && (volumeOrdinal(next.volumeNumber) || 1) > book.totalVolumes;
  const field = 'w-full min-w-0 p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none';
  return <section data-book-volumes className="sm:col-span-2 rounded-2xl border border-subtle p-4 space-y-3 min-w-0" aria-label={t('bookVolumesTitle')}>
    <h3 className="flex gap-2 items-center font-semibold"><Layers className="size-4" />{t('bookVolumesTitle')}</h3>
    <p className="text-xs text-muted leading-loose">{t('bookVolumesHint')}</p>
    <label className="block space-y-1 text-sm"><span>{t('bookVolumeSetTitle')}</span><input maxLength={300} value={book.seriesTitle || ''} onChange={event => onChange('seriesTitle', event.target.value)} className={field} /></label>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="block space-y-1 text-sm"><span>{t('bookVolumeNumber')}</span><input maxLength={40} value={book.volumeNumber ?? ''} onChange={event => onChange('volumeNumber', event.target.value)} className={field} /></label>
      <label className="block space-y-1 text-sm"><span>{t('bookVolumesTotal')}</span><input type="number" min={1} max={10000} step={1} value={book.totalVolumes ?? ''} onChange={event => onChange('totalVolumes', event.target.value ? Number(event.target.value) : undefined)} className={field} /></label>
    </div>
    {issue && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t(issue)}</p>}
    {related.length > 0 && <ul className="space-y-2 max-h-52 overflow-auto" aria-label={t('bookVolumesInLibrary')}>{related.map(volume => <li key={volume.id}><button type="button" disabled={volume.id === book.id || !onOpen} aria-current={volume.id === book.id ? 'true' : undefined} onClick={() => onOpen?.(volume)} className="w-full flex flex-wrap gap-2 items-center text-start rounded-lg border border-subtle p-2 text-sm hover:bg-canvas disabled:opacity-60"><BookVolumeBadge book={volume} t={t} /><span className="min-w-0 break-words">{volume.title}</span></button></li>)}</ul>}
    {onAdd && <button type="button" disabled={!saved || !!issue || !book.seriesTitle?.trim() || !String(book.volumeNumber ?? '').trim() || full} onClick={() => onAdd(nextBookVolume(book, books, crypto.randomUUID()))} className="inline-flex gap-2 items-center rounded-lg border border-subtle p-2 text-sm disabled:opacity-40"><Plus className="size-4" />{t('bookVolumeAdd')}</button>}
    {!saved && <p className="text-xs text-muted leading-relaxed">{t('bookVolumesSaveFirst')}</p>}
  </section>;
}
