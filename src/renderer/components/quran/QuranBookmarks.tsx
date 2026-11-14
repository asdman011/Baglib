'use client';
import React from 'react';
import { Bookmark } from 'lucide-react';
import type { TranslationKey } from '../../translations';
import type { QuranBookmark } from '../../utils/quran-bookmarks';
import { quranReferenceLabel } from '../../utils/quran-reference-label';

export function QuranBookmarks({ bookmarks, failed, lang, t, onNavigate }: {
  bookmarks: QuranBookmark[]; failed: boolean; lang: 'ar' | 'en';
  t: (key: TranslationKey) => string;
  onNavigate: (reference: { surah: number; ayah: number }) => void;
}) {
  return <details data-quran-bookmarks className="shrink-0 border-b border-subtle bg-surface px-4 py-1 text-sm">
    <summary className="flex w-fit cursor-pointer items-center gap-2 py-1 leading-loose"><Bookmark className="size-4" aria-hidden="true" />{t('quranBookmarks')}<span>{bookmarks.length.toLocaleString(lang)}</span></summary>
    {failed ? <p role="alert" className="py-2 leading-loose">{t('quranStorageError')}</p> : bookmarks.length ? <ul className="flex max-h-32 flex-wrap gap-2 overflow-auto py-2">{bookmarks.map(bookmark => <li key={bookmark.target}><button type="button" data-quran-bookmark={bookmark.target} onClick={() => onNavigate(bookmark)} className="rounded-lg border border-subtle px-3 py-1 text-start leading-loose hover:bg-amber-500/10"><bdi>{quranReferenceLabel({ surah: bookmark.surah, from: bookmark.ayah, to: bookmark.ayah }, lang)}</bdi></button></li>)}</ul> : <p className="py-2 text-muted leading-loose">{t('quranBookmarksEmpty')}</p>}
  </details>;
}
