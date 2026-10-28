'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, BookOpen, FileText, ArrowRight, X, Globe } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { matchesStudyQuery } from '../../../shared/study-notes';
import { openStudyNote } from '../../utils/study-navigation';

export const CommandPalette: React.FC = () => {
  const { isCommandPaletteOpen, setCommandPaletteOpen, setSearchHubOpen, openBookForReading, books, t, dir } = useWorkspace();
  const { notes } = useStudyNotes();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const scope = /^\/(notes|books)\b\s*/iu.exec(query)?.[1].toLowerCase();
  const keyword = query.replace(/^\/(notes|books)\b\s*/iu, '').trim();
  useEffect(() => {
    if (!isCommandPaletteOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setCommandPaletteOpen(false); };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('keydown', escape); if (previous?.isConnected) previous.focus(); };
  }, [isCommandPaletteOpen, setCommandPaletteOpen]);
  const results = useMemo(() => {
    const items: { id: string; title: string; subtitle: string; icon: typeof BookOpen; action: () => void }[] = [];
    if (scope !== 'notes') for (const book of books) if (matchesStudyQuery(`${book.title} ${book.author}`, keyword)) items.push({ id: `book:${book.id}`, title: book.title, subtitle: book.author, icon: BookOpen, action: () => openBookForReading(book) });
    if (scope !== 'books') for (const note of notes) if (matchesStudyQuery(`${note.title} ${note.content} ${note.aliases.join(' ')} ${note.tags.join(' ')}`, keyword)) items.push({ id: `note:${note.id}`, title: note.title || note.content.slice(0, 70), subtitle: note.aliases.join(' · ') || t('navNotes'), icon: FileText, action: () => openStudyNote({ id: note.id }) });
    if (!scope && keyword) items.push({ id: 'discovery', title: t('studyOnlineSearch', { query: keyword }), subtitle: t('navSearch'), icon: Globe, action: () => setSearchHubOpen(true) });
    return items.slice(0, 20);
  }, [books, notes, scope, keyword, t, openBookForReading, setSearchHubOpen]);
  if (!isCommandPaletteOpen) return null;
  const choose = (index: number) => { results[index]?.action(); setCommandPaletteOpen(false); };
  return <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-16 p-3" onPointerDown={event => { if (event.target === event.currentTarget) setCommandPaletteOpen(false); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={t('navSearch')} dir={dir} className="w-full max-w-2xl rounded-2xl border border-subtle bg-surface shadow-xl overflow-hidden" onKeyDown={event => {
      if (event.key === 'Tab') {
        const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('input,button') || [])];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="flex items-center gap-3 border-b border-subtle p-4"><Search size={19} /><input ref={input} type="search" value={query} aria-label={t('studyCommandSearch')} placeholder={t('studyCommandSearch')} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(1, results.length)) % Math.max(1, results.length)); }
        if (event.key === 'Enter') { event.preventDefault(); choose(active); }
      }} className="flex-1 min-w-0 bg-transparent outline-none text-sm leading-loose" /><button type="button" aria-label={t('studyClose')} onClick={() => setCommandPaletteOpen(false)}><X size={18} /></button></div>
      <div className="max-h-96 overflow-y-auto p-2 space-y-1">{results.map((item, index) => <button key={item.id} type="button" onClick={() => choose(index)} className={`w-full flex items-center gap-3 text-start rounded-xl p-3 ${index === active ? 'bg-canvas' : 'hover:bg-canvas'}`}><item.icon size={18} /><span className="min-w-0 flex-1"><span dir="auto" className="block truncate font-bold text-sm leading-relaxed">{item.title}</span><span dir="auto" className="block truncate text-xs text-muted leading-relaxed">{item.subtitle}</span></span><ArrowRight size={16} className="rtl:rotate-180" /></button>)}{!results.length && <p className="text-center p-6 text-muted text-sm">{t('studyNoResults')}</p>}</div>
      <p className="px-4 py-3 border-t border-subtle text-xs text-muted" dir="ltr">/notes · /books</p>
    </div>
  </div>;
};
