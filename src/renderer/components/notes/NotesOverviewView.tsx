'use client';
import { KnowledgeGraphButton } from './KnowledgeGraph';
import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Search, Trash2, Pencil, Plus, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { QuickNoteScratchpad } from '../dashboard/QuickNoteScratchpad';
import { StudyNoteContent } from './StudyNoteContent';
import { SavedCardsPanel } from '../knowledge/SavedCardsPanel';
import { SrsReviewPanel } from '../knowledge/SrsReviewPanel';
import { NoteHistory } from './NoteHistory';
import { KnowledgeTools } from './KnowledgeTools';
import { ReadingLogPanel } from './ReadingLogPanel';
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
  const [readingWork,setReadingWork]=useState('');
  const [anchor, setAnchor] = useState<string | null>(null);
  // A paragraph link scrolls to its paragraph and highlights it briefly; without that paragraph, the note stays at its top.
  const [focusParagraph, setFocusParagraph] = useState<{ id: string; anchor: string; at: number } | null>(null);
  useEffect(() => {
    if (!focusParagraph) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let element: Element | null = null;
    const clear = () => { element?.classList.remove('bg-amber-400/30'); element?.removeAttribute('data-paragraph-focused'); };
    const frame = requestAnimationFrame(() => {
      element = document.querySelector(`[data-study-note="${CSS.escape(focusParagraph.id)}"] [data-paragraph="${CSS.escape(focusParagraph.anchor)}"]`);
      if (!element) return;
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element.classList.add('bg-amber-400/30');
      element.setAttribute('data-paragraph-focused', 'true');
      timer = setTimeout(clear, 2200);
    });
    // A new navigation (or leaving) ends the highlight at once, instead of leaving it on.
    return () => { cancelAnimationFrame(frame); if (timer) clearTimeout(timer); clear(); };
  }, [focusParagraph, notes]);
  const [openComments, setOpenComments] = useState<Record<string, number>>({});
  const [onlyOpenComments, setOnlyOpenComments] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => window.electronAPI?.knowledgeHistory?.commentCounts?.().then(counts => { if (alive) setOpenComments(counts); }, () => {});
    void load();
    const off = window.electronAPI?.studyNotes?.onChanged?.(() => { void load(); });
    return () => { alive = false; off?.(); };
  }, [notes]);
  useEffect(() => {
    const consume = () => {
      const pending = consumeStudyNote();
      if (!pending) return;
      if (pending.id) { setSelected(pending.id); setQuery(''); setFocusParagraph(pending.anchor ? { id: pending.id, anchor: pending.anchor, at: Date.now() } : null); }
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
      await navigateStudyReference(target, books, openBookForReading, (id, paragraph) => {
        if (!notes.some(note => note.id === id)) throw new Error('missing-note');
        setSelected(id); setQuery(''); setAnchor(null); setEditor(null);
        setFocusParagraph(paragraph ? { id, anchor: paragraph, at: Date.now() } : null);
      });
    } catch { setActionError(true); }
  };
  const shown = useMemo(() => notes.filter(note => (!selected || note.id === selected) && (!onlyOpenComments || (openComments[note.id] ?? 0) > 0) && (!anchor || studyBacklinks([note], anchor).length) && matchesStudyQuery(`${note.title} ${note.content} ${note.aliases.join(' ')} ${note.tags.join(' ')} ${books.find(book => book.id === note.workId)?.title || ''}`, query)), [notes, selected, anchor, query, books, onlyOpenComments, openComments]);
  const remove = async (note: StudyNote) => {
    try {
      if (note.workId || note.knowledgeId) await window.electronAPI.knowledge.delete(note.knowledgeId || note.id);
      await window.electronAPI.studyNotes.remove(note.id);
      window.dispatchEvent(new CustomEvent('baglib:notes-changed'));
      setSelected(null); await refresh();
    } catch { setActionError(true); }
  };
  const memorize = async (note: StudyNote) => {
    try {
      const card = await window.electronAPI.knowledgeCards.save({ front: note.title || note.content, back: note.content, sourceKind: 'note', sourceRef: `note:${note.id}`, sourceLabel: note.title, workId: note.workId });
      await window.electronAPI.knowledgeCards.setMemorizing(card.id, true);
      window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'));
      setActionError(false);
    } catch { setActionError(true); }
  };
  return <section className="flex-1 min-h-0 overflow-y-auto bg-canvas p-4 sm:p-6 space-y-4" dir={dir} data-notes-overview>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 font-display text-xl font-bold leading-relaxed"><FileText size={20} />{t('myNotesTitle')}</h1><p className="text-xs text-muted">{t('myNotesDesc')} · {notes.length}</p></div><button type="button" onClick={() => setEditor({ content: '', key: Date.now() })} className="flex items-center gap-2 rounded-lg bg-amber-600 text-white px-3 py-2 text-sm"><Plus size={15} />{t('studyNewNote')}</button></header>
    <label className="flex items-center gap-2 rounded-xl border border-subtle bg-surface px-3 py-2"><Search size={17} /><input type="search" aria-label={t('studySearchNotes')} placeholder={t('studySearchNotes')} value={query} onChange={event => { setQuery(event.target.value); setSelected(null); }} className="w-full min-w-0 bg-transparent outline-none text-sm leading-loose" /></label>
    <label className="block text-sm">{t('waveReadingLog')}<select data-reading-log-book aria-label={t('waveReadingLog')} value={readingWork} onChange={event=>setReadingWork(event.target.value)} className="w-full bg-surface border border-subtle rounded p-2"><option value="">{t('dashScratchpadAttachBook')}</option>{books.map(book=><option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
    {readingWork&&<ReadingLogPanel key={readingWork} workId={readingWork}/>}
    <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" data-notes-open-comments checked={onlyOpenComments} onChange={event => setOnlyOpenComments(event.target.checked)} />{t('commentsOnlyOpen', { count: Object.values(openComments).reduce((sum, count) => sum + count, 0) })}</label>
    {(selected || anchor) && <button type="button" onClick={() => { setSelected(null); setAnchor(null); }} className="text-xs flex items-center gap-1"><X size={14} />{t('studyLinkedNotes')}</button>}
    {(error || actionError) && <p role="alert">{t('studyActionFailed')}</p>}
    {editor && <div className="max-w-3xl"><div className="flex justify-end mb-1"><button type="button" aria-label={t('studyClose')} onClick={() => setEditor(null)}><X size={18} /></button></div><QuickNoteScratchpad key={editor.key} initialNote={editor.note} initialContent={editor.content} autoFocus onSaved={() => { setEditor(null); void refresh(); }} /></div>}
    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3 items-start">
      {shown.map(note => {
        const backlinks = studyBacklinks(notes, `note:${note.id}`);
        const refs = [...new Map(studyLinks(note.content).map(link => [link.target, link])).values()];
        const book = books.find(book => book.id === note.workId);
        return <article key={note.id} data-study-note={note.id} className="rounded-xl border border-subtle bg-surface p-4 space-y-3 min-w-0">
          <header className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 dir="auto" className="font-bold leading-loose break-words">{note.title || t('dashScratchpadGeneralNote')}</h2>{(openComments[note.id] ?? 0) > 0 && <span data-note-open-comments className="inline-flex items-center rounded-full bg-amber-500/15 px-2 text-[11px]">{t('commentsOpenCount', { count: openComments[note.id] })}</span>}{note.aliases.length > 0 && <p className="text-xs text-muted leading-loose" dir="auto">{note.aliases.join(' · ')}</p>}</div><div className="flex shrink-0 gap-1"><KnowledgeGraphButton noteId={note.id} notes={notes} /><button type="button" aria-label={t('studyEdit')} onClick={() => note.kind==='reading_reflection'?setReadingWork(note.workId || note.sourceRef?.replace(/^book:/u,'') || ''):setEditor({ note, key: Date.now() })} className="p-1.5"><Pencil size={15} /></button><button type="button" aria-label={t('deleteNote')} onClick={() => void remove(note)} className="p-1.5 text-red-500"><Trash2 size={15} /></button></div></header>
          <StudyNoteContent content={note.content} notes={notes} onOpen={target => void open(target)} t={t} />
          <NoteHistory id={note.id} onChanged={()=>void refresh()}/>
          <button type="button" onClick={() => void memorize(note)} className="text-xs underline">{t('srsFromNote')}</button>
          {book && <button type="button" dir="auto" className="text-xs text-emerald-700 dark:text-emerald-300 underline" onClick={() => openBookForReading(book)}>{book.title}</button>}
          {note.tags.length > 0 && <p className="text-xs text-muted" dir="auto">{note.tags.map(tag => `#${tag}`).join(' ')}</p>}
          {refs.length > 0 && <details className="text-xs border-t border-subtle pt-2"><summary>{t('studyReferences')} ({refs.length})</summary><div className="space-y-2 mt-2">{refs.map(link => <button type="button" key={link.target} dir="auto" className="block text-start underline leading-relaxed" onClick={() => void open(link.target)}>{link.label}</button>)}</div></details>}
          <details className="text-xs border-t border-subtle pt-2" open={!!selected}><summary>{t('studyBacklinks')} ({backlinks.length})</summary><div className="space-y-2 mt-2">{backlinks.map(backlink => <button type="button" key={backlink.id} dir="auto" className="block text-start underline leading-relaxed" onClick={() => void open(`note:${backlink.id}`)}>{backlink.title}</button>)}</div></details>
        </article>;
      })}
    </div>
    {!shown.length && <p className="py-8 text-center text-sm text-muted">{t('studyNoResults')}</p>}
    <KnowledgeTools />
    <SrsReviewPanel />
    <SavedCardsPanel />
  </section>;
};
