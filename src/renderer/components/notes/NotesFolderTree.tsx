'use client';
/**
 * KEY-338: the Notes tab's folder tree (the user's mock-up): Quran › surah, Sunnah › collection › chapter,
 * Library › book, Poetry › poem, Lectures › lecture, Other. Folders without notes are hidden unless "Show empty folders".
 */
import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import type { TranslationKey } from '../../translations';
import { NOTES_ROOTS, childFolders, type NotesRoot } from '../../../shared/notes-tree';
import { SURAH_NAMES_AR, SURAH_NAMES_EN } from '../../../shared/quran-wird';
import { SUNNAH_COLLECTION_IDS, type SunnahCollectionId } from '../../../shared/types/sunnah';
import { collectionKeys } from '../../utils/sunnah-collections';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;
export const ROOT_LABELS: Record<NotesRoot, TranslationKey> = { quran: 'notesFolderQuran', sunnah: 'notesFolderSunnah', library: 'notesFolderLibrary', poetry: 'notesFolderPoetry', lectures: 'notesFolderLectures', other: 'notesFolderOther' };

/** The display name of any folder path, in the interface language. */
export function folderName(path: string, t: Translate, lang: string, labels: Map<string, string>, books: { id: string; title: string }[]): string {
  const parts = path.split('/');
  const root = parts[0] as NotesRoot;
  if (parts.length === 1) return t(ROOT_LABELS[root] ?? 'notesFolderOther');
  if (root === 'quran') {
    const surah = Number(parts[1]);
    const ar = SURAH_NAMES_AR[surah - 1] ?? '', en = SURAH_NAMES_EN[surah - 1] ?? '';
    return lang === 'ar' ? `${surah.toLocaleString('ar-EG')}. ${ar}` : `${surah}. ${en}${ar ? ` (${ar})` : ''}`;
  }
  if (root === 'sunnah') {
    const key = collectionKeys[parts[1] as SunnahCollectionId];
    if (parts.length === 2) return key ? t(key) : parts[1];
    return labels.get(path) || t('notesChapter', { number: Number(parts[2]).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US') });
  }
  if (root === 'library') return books.find(book => book.id === parts[1])?.title || labels.get(path) || t('notesFolderLibrary');
  return labels.get(path) || parts[1];
}

export function NotesFolderTree({ counts, labels, books, folder, onSelect, showEmpty, t, lang }: {
  counts: Map<string, number>; labels: Map<string, string>; books: { id: string; title: string }[];
  folder: string | null; onSelect: (path: string | null) => void; showEmpty: boolean; t: Translate; lang: string;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(folder ? folder.split('/').map((_, index, parts) => parts.slice(0, index + 1).join('/')) : []));
  const toggle = (path: string) => setOpen(current => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  // With "Show empty folders", the known sources are listed even before any note is written about them.
  const children = (path: string): string[] => {
    const found = childFolders(counts, path);
    if (!showEmpty) return found;
    const known = path === 'quran' ? Array.from({ length: 114 }, (_, index) => `quran/${index + 1}`)
      : path === 'sunnah' ? SUNNAH_COLLECTION_IDS.map(id => `sunnah/${id}`)
        : path === 'library' ? books.map(book => `library/${book.id}`) : [];
    return [...new Set([...known, ...found])].sort((a, b) => {
      const x = Number(a.split('/').pop()), y = Number(b.split('/').pop());
      return Number.isFinite(x) && Number.isFinite(y) ? x - y : 0;
    });
  };
  const number = (value: number) => value.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US');
  const row = (path: string, depth: number): React.ReactNode => {
    const count = counts.get(path) ?? 0;
    if (!count && !showEmpty) return null;
    const kids = depth < 3 && path !== 'other' ? children(path) : [];
    const expandable = kids.length > 0 || (showEmpty && ['quran', 'sunnah', 'library'].includes(path));
    const expanded = open.has(path);
    const selected = folder === path;
    const Icon = path.startsWith('library/') ? BookOpen : expanded ? FolderOpen : Folder;
    return <li key={path} role="treeitem" aria-level={depth} aria-expanded={expandable ? expanded : undefined} aria-selected={selected}>
      <div className={`flex items-center gap-1 rounded-lg pe-2 text-sm transition-colors ${selected ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200' : 'hover:bg-canvas'}`} style={{ paddingInlineStart: `${(depth - 1) * 14 + 4}px` }}>
        {expandable ? <button type="button" onClick={() => toggle(path)} aria-label={t(expanded ? 'notesFolderCollapse' : 'notesFolderExpand')} className="shrink-0 rounded p-0.5 text-muted hover:text-main">
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5 rtl:rotate-180" />}
        </button> : <span className="w-[18px] shrink-0" aria-hidden="true" />}
        <button type="button" data-notes-folder={path} onClick={() => { onSelect(path); if (expandable && !expanded) toggle(path); }} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-start">
          <Icon className={`size-4 shrink-0 ${selected ? 'text-amber-600' : depth === 1 ? 'text-muted' : 'text-emerald-600/80'}`} aria-hidden="true" />
          <span dir="auto" className="min-w-0 flex-1 truncate">{folderName(path, t, lang, labels, books)}</span>
          {count > 0 && <span className="shrink-0 text-xs tabular-nums text-muted">{number(count)}</span>}
        </button>
      </div>
      {expandable && expanded && <ul role="group">{kids.map(kid => row(kid, depth + 1))}</ul>}
    </li>;
  };
  return <nav aria-label={t('notesFoldersLabel')} data-notes-folder-tree className="min-h-0 flex-1 overflow-y-auto p-2">
    <button type="button" data-notes-folder="" onClick={() => onSelect(null)} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${folder === null ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200' : 'hover:bg-canvas'}`}>
      <FolderOpen className="size-4 shrink-0 text-muted" aria-hidden="true" /><span className="flex-1 text-start">{t('notesFolderAll')}</span>
    </button>
    <ul role="tree" aria-label={t('notesFoldersLabel')}>{NOTES_ROOTS.map(root => row(root, 1))}</ul>
  </nav>;
}
