'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Search, Trash2, Pencil, Plus, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { QuickNoteScratchpad } from '../dashboard/QuickNoteScratchpad';
import { StudyNoteContent } from './StudyNoteContent';
import { studyBacklinks, studyLinks, type StudyNote } from '../../../shared/study-notes';
import { matchesStudyQuery } from '../../../shared/study-notes';
import { consumeStudyNote, navigateStudyReference, STUDY_NOTE_OPEN } from '../../utils/study-navigation';

export const NotesOverviewView: React.FC = () => {
  const { books, dir, t, openBookForReading } = useWorkspace();
  const { notes, refresh, error } = useStudyNotes();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ note?: StudyNote; content?: string; key: number } | null>(null);
  const [actionError, setActionError] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  useEffect(() => {
    const consume = () => {
      const pending = consumeStudyNote();
      if (!pending) return;
      if (pending.id) { setSelected(pending.id); setQuery(''); }
      else {
        setEditor({ content: pending.content || '', key: Date.now() });
        setAnchor(studyLinks(pending.content || '')[0]?.target || null);
      }
    };
    consume(); window.addEventListener(STUDY_NOTE_OPEN, consume);
    return () => window.removeEventListener(STUDY_NOTE_OPEN, consume);
  }, []);
  const open = async (target: string) => {
    setActionError(false);
    try {
      await navigateStudyReference(target, books, openBookForReading, id => {
        if (!notes.some(note => note.id === id)) throw new Error('missing-note');
        setSelected(id); setQuery(''); setAnchor(null); setEditor(null);
      });
    } catch { setActionError(true); }
  };
  const shown = useMemo(() => notes.filter(note => (!selected || note.id === selected) && (!anchor || studyBacklinks([note], anchor).length) && matchesStudyQuery(`${note.title} ${note.content} ${note.aliases.join(' ')} ${note.tags.join(' ')} ${books.find(book => book.id === note.workId)?.title || ''}`, query)), [notes, selected, anchor, query, books]);
  const remove = async (note: StudyNote) => {
    try {
      if (note.workId || note.knowledgeId) await window.electronAPI.knowledge.delete(note.knowledgeId || note.id);
      await window.electronAPI.studyNotes.remove(note.id);
      window.dispatchEvent(new CustomEvent('baglib:notes-changed'));
      setSelected(null); await refresh();
    } catch { setActionError(true); }
  };
  return <section className="flex-1 min-h-0 overflow-y-auto bg-canvas p-4 sm:p-6 space-y-4" dir={dir} data-notes-overview>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 font-display text-xl font-bold leading-relaxed"><FileText size={20} />{t('myNotesTitle')}</h1><p className="text-xs text-muted">{t('myNotesDesc')} · {notes.length}</p></div><button type="button" onClick={() => setEditor({ content: '', key: Date.now() })} className="flex items-center gap-2 rounded-lg bg-amber-600 text-white px-3 py-2 text-sm"><Plus size={15} />{t('studyNewNote')}</button></header>
    <label className="flex items-center gap-2 rounded-xl border border-subtle bg-surface px-3 py-2"><Search size={17} /><input type="search" aria-label={t('studySearchNotes')} placeholder={t('studySearchNotes')} value={query} onChange={event => { setQuery(event.target.value); setSelected(null); }} className="w-full min-w-0 bg-transparent outline-none text-sm leading-loose" /></label>
    {(selected || anchor) && <button type="button" onClick={() => { setSelected(null); setAnchor(null); }} className="text-xs flex items-center gap-1"><X size={14} />{t('studyLinkedNotes')}</button>}
    {(error || actionError) && <p role="alert">{t('studyActionFailed')}</p>}
    {editor && <div className="max-w-3xl"><div className="flex justify-end mb-1"><button type="button" aria-label={t('studyClose')} onClick={() => setEditor(null)}><X size={18} /></button></div><QuickNoteScratchpad key={editor.key} initialNote={editor.note} initialContent={editor.content} onSaved={() => { setEditor(null); void refresh(); }} /></div>}
    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3 items-start">
      {shown.map(note => {
        const backlinks = studyBacklinks(notes, `note:${note.id}`);
        const refs = [...new Map(studyLinks(note.content).map(link => [link.target, link])).values()];
        const book = books.find(book => book.id === note.workId);
        return <article key={note.id} data-study-note={note.id} className="rounded-xl border border-subtle bg-surface p-4 space-y-3 min-w-0">
          <header className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 dir="auto" className="font-bold leading-loose break-words">{note.title || t('dashScratchpadGeneralNote')}</h2>{note.aliases.length > 0 && <p className="text-xs text-muted leading-loose" dir="auto">{note.aliases.join(' · ')}</p>}</div><div className="flex shrink-0 gap-1"><button type="button" aria-label={t('studyEdit')} onClick={() => setEditor({ note, key: Date.now() })} className="p-1.5"><Pencil size={15} /></button><button type="button" aria-label={t('deleteNote')} onClick={() => void remove(note)} className="p-1.5 text-red-500"><Trash2 size={15} /></button></div></header>
          <StudyNoteContent content={note.content} notes={notes} onOpen={target => void open(target)} t={t} />
          {book && <button type="button" dir="auto" className="text-xs text-emerald-700 dark:text-emerald-300 underline" onClick={() => openBookForReading(book)}>{book.title}</button>}
          {note.tags.length > 0 && <p className="text-xs text-muted" dir="auto">{note.tags.map(tag => `#${tag}`).join(' ')}</p>}
          {refs.length > 0 && <details className="text-xs border-t border-subtle pt-2"><summary>{t('studyReferences')} ({refs.length})</summary><div className="space-y-2 mt-2">{refs.map(link => <button type="button" key={link.target} dir="auto" className="block text-start underline leading-relaxed" onClick={() => void open(link.target)}>{link.label}</button>)}</div></details>}
          <details className="text-xs border-t border-subtle pt-2" open={!!selected}><summary>{t('studyBacklinks')} ({backlinks.length})</summary><div className="space-y-2 mt-2">{backlinks.map(backlink => <button type="button" key={backlink.id} dir="auto" className="block text-start underline leading-relaxed" onClick={() => void open(`note:${backlink.id}`)}>{backlink.title}</button>)}</div></details>
        </article>;
      })}
    </div>
    {!shown.length && <p className="py-8 text-center text-sm text-muted">{t('studyNoResults')}</p>}
  </section>;
};
