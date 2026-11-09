'use client';
import { KnowledgeGraphButton } from './KnowledgeGraph';
import { BoardsWorkspace } from './BoardsWorkspace';
import { StudyAssistant } from './StudyAssistant';
import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, FileType, LayoutGrid, Sparkles, Search, Trash2, Pencil, Plus, X } from 'lucide-react';
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
import { DEFAULT_WORD_LAYOUT, wordLayout, type WordLayout } from '../../../shared/word-export';

const WORD_LAYOUT_KEY = 'baglib.wordLayout.v1';
const savedWordLayout = (): WordLayout => { try { return wordLayout(JSON.parse(localStorage.getItem(WORD_LAYOUT_KEY) || 'null')); } catch { return DEFAULT_WORD_LAYOUT; } };

export const NotesOverviewView: React.FC = () => {
  const { books, dir, t, lang, openBookForReading } = useWorkspace();
  const { notes, refresh, error, failedSources, loading } = useStudyNotes();
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
  // One-way Markdown export (S7) of the notes shown now: all of them, or the search/filter result.
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [exported, setExported] = useState<{ folder: string; count: number } | null>(null);
  const [wordExported, setWordExported] = useState<{ file: string; count: number } | null>(null);
  // Word options (table of contents, page size, margins) open before the save dialog and are remembered on this device.
  const [wordOptions, setWordOptions] = useState<WordLayout | null>(null);
  const [wordNoteId, setWordNoteId] = useState<string | null>(null);
  useEffect(() => {
    if (wordOptions && wordNoteId) document.querySelector('[data-word-options]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [wordOptions, wordNoteId]);
  const exportMarkdown = async (ids = shown.map(note => note.id)) => {
    setActionError(false); setExported(null); setWordExported(null);
    try {
      const result = await window.electronAPI.studyNotes.exportMarkdown(ids);
      if (result) setExported(result);
    } catch { setActionError(true); }
  };
  // Word export (S8) of the notes shown now, as one document.
  const exportWord = async (layout: WordLayout) => {
    setActionError(false); setWordExported(null); setExported(null); setWordOptions(null);
    try { localStorage.setItem(WORD_LAYOUT_KEY, JSON.stringify(layout)); } catch { /* remembered for this time only */ }
    try {
      const result = await window.electronAPI.studyNotes.exportWord(wordNoteId ? [wordNoteId] : shown.map(note => note.id), lang, layout);
      if (result) setWordExported(result);
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
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 font-display text-xl font-bold leading-relaxed"><FileText size={20} />{t('myNotesTitle')}</h1><p className="text-xs text-muted">{t('myNotesDesc')} · {notes.length}</p></div><div className="flex flex-wrap gap-2"><button type="button" data-notes-assistant onClick={() => setAssistantOpen(true)} className="flex items-center gap-2 rounded-lg border border-subtle bg-surface px-3 py-2 text-sm"><Sparkles size={15} />{t('assistantOpen')}</button><button type="button" data-notes-boards onClick={() => setBoardsOpen(true)} className="flex items-center gap-2 rounded-lg border border-subtle bg-surface px-3 py-2 text-sm"><LayoutGrid size={15} />{t('boardsOpen')}</button><button type="button" data-notes-export-word disabled={!shown.length} title={t('notesExportWordHint')} aria-expanded={Boolean(wordOptions)} onClick={() => { setWordNoteId(null); setWordOptions(current => (current ? null : savedWordLayout())); }} className="flex items-center gap-2 rounded-lg border border-subtle bg-surface px-3 py-2 text-sm disabled:opacity-40"><FileType size={15} />{t('notesExportWord', { count: shown.length })}</button><button type="button" data-notes-export-markdown disabled={!shown.length} title={t('notesExportMarkdownHint')} onClick={() => void exportMarkdown()} className="flex items-center gap-2 rounded-lg border border-subtle bg-surface px-3 py-2 text-sm disabled:opacity-40"><Download size={15} />{t('notesExportMarkdown', { count: shown.length })}</button><button type="button" onClick={() => setEditor({ content: '', key: Date.now() })} className="flex items-center gap-2 rounded-lg bg-amber-600 text-white px-3 py-2 text-sm"><Plus size={15} />{t('studyNewNote')}</button></div></header>
    {/* The notes shown start ticked when they are a small, chosen set (a search or one note), not the whole library. */}
    {assistantOpen && <StudyAssistant notes={notes} initialNotes={shown.length <= 10 && shown.length < notes.length ? shown.map(note => note.id) : []} onClose={() => setAssistantOpen(false)} />}
    {boardsOpen && <BoardsWorkspace notes={notes} onClose={() => setBoardsOpen(false)} />}
    {wordOptions && <form data-word-options aria-label={t('wordOptionsTitle')} data-word-note={wordNoteId || undefined} onSubmit={event => { event.preventDefault(); void exportWord(wordOptions); }} className="flex flex-wrap items-end gap-3 rounded-xl border border-subtle bg-surface p-3 text-sm">
      <strong className="basis-full text-xs">{t('wordOptionsTitle')}</strong>
      <label className="flex items-center gap-2"><input type="checkbox" data-word-contents checked={wordOptions.contents} onChange={event => setWordOptions({ ...wordOptions, contents: event.target.checked })} />{t('wordContents')}</label>
      <label className="flex flex-col gap-1 text-xs">{t('wordPageSize')}<select data-word-page value={wordOptions.pageSize} onChange={event => setWordOptions(wordLayout({ ...wordOptions, pageSize: event.target.value }))} className="rounded border border-subtle bg-canvas px-2 py-1 text-sm"><option value="a4">A4</option><option value="letter">{t('wordPageLetter')}</option><option value="a5">A5</option></select></label>
      <label className="flex flex-col gap-1 text-xs">{t('wordMargins')}<select data-word-margins value={wordOptions.margins} onChange={event => setWordOptions(wordLayout({ ...wordOptions, margins: event.target.value }))} className="rounded border border-subtle bg-canvas px-2 py-1 text-sm"><option value="normal">{t('wordMarginNormal')}</option><option value="narrow">{t('wordMarginNarrow')}</option><option value="wide">{t('wordMarginWide')}</option></select></label>
      <span className="ms-auto flex gap-2"><button type="button" onClick={() => setWordOptions(null)} className="rounded-lg border border-subtle px-3 py-1.5">{t('cancel')}</button><button type="submit" data-word-go className="rounded-lg bg-amber-600 px-3 py-1.5 text-white">{t('wordExportGo')}</button></span>
    </form>}
    {wordExported && <p role="status" data-notes-word-exported className="text-xs text-emerald-700 dark:text-emerald-300 leading-loose">{t('notesExportWordDone', { count: wordExported.count })} <bdi dir="ltr" className="break-all">{wordExported.file}</bdi></p>}
    {exported && <p role="status" data-notes-exported className="text-xs text-emerald-700 dark:text-emerald-300 leading-loose">{t('notesExportDone', { count: exported.count })} <bdi dir="ltr" className="break-all">{exported.folder}</bdi></p>}
    <label className="flex items-center gap-2 rounded-xl border border-subtle bg-surface px-3 py-2"><Search size={17} /><input type="search" aria-label={t('studySearchNotes')} placeholder={t('studySearchNotes')} value={query} onChange={event => { setQuery(event.target.value); setSelected(null); }} className="w-full min-w-0 bg-transparent outline-none text-sm leading-loose" /></label>
    <label className="block text-sm">{t('waveReadingLog')}<select data-reading-log-book aria-label={t('waveReadingLog')} value={readingWork} onChange={event=>setReadingWork(event.target.value)} className="w-full bg-surface border border-subtle rounded p-2"><option value="">{t('dashScratchpadAttachBook')}</option>{books.map(book=><option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
    {readingWork&&<ReadingLogPanel key={readingWork} workId={readingWork}/>}
    <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" data-notes-open-comments checked={onlyOpenComments} onChange={event => setOnlyOpenComments(event.target.checked)} />{t('commentsOnlyOpen', { count: Object.values(openComments).reduce((sum, count) => sum + count, 0) })}</label>
    {(selected || anchor) && <button type="button" onClick={() => { setSelected(null); setAnchor(null); }} className="text-xs flex items-center gap-1"><X size={14} />{t('studyLinkedNotes')}</button>}
    {error && <div role="alert" className="rounded-xl border border-amber-500/40 p-3 text-sm leading-loose space-y-2">
      <p>{t('studyLoadFailed')}</p>
      <p>{failedSources.map(source => t(source === 'notes' ? 'studyLoadPersonalSource' : 'studyLoadKnowledgeSource')).join(' · ')}</p>
      <button type="button" disabled={loading} onClick={() => void refresh()} className="rounded-lg border border-subtle px-3 py-1 hover:bg-surface disabled:opacity-50">{t('lookupRetry')}</button>
    </div>}
    {actionError && <p role="alert">{t('studyActionFailed')}</p>}
    {loading && <p role="status" className="text-sm text-muted">{t('studyLoadingNotes')}</p>}
    {editor && <div className="max-w-3xl"><div className="flex justify-end mb-1"><button type="button" aria-label={t('studyClose')} onClick={() => setEditor(null)}><X size={18} /></button></div><QuickNoteScratchpad key={editor.key} initialNote={editor.note} initialContent={editor.content} autoFocus onSaved={() => { setEditor(null); void refresh(); }} /></div>}
    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3 items-start">
      {shown.map(note => {
        const backlinks = studyBacklinks(notes, `note:${note.id}`);
        const refs = [...new Map(studyLinks(note.content).map(link => [link.target, link])).values()];
        const book = books.find(book => book.id === note.workId);
        return <article key={note.id} data-study-note={note.id} className="rounded-xl border border-subtle bg-surface p-4 space-y-3 min-w-0">
          <header className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 dir="auto" className="font-bold leading-loose break-words">{note.title || t('dashScratchpadGeneralNote')}</h2>{(openComments[note.id] ?? 0) > 0 && <span data-note-open-comments className="inline-flex items-center rounded-full bg-amber-500/15 px-2 text-[11px]">{t('commentsOpenCount', { count: openComments[note.id] })}</span>}{note.aliases.length > 0 && <p className="text-xs text-muted leading-loose" dir="auto">{note.aliases.join(' · ')}</p>}</div><div className="flex shrink-0 gap-1"><KnowledgeGraphButton noteId={note.id} notes={notes} /><button type="button" aria-label={t('studyEdit')} onClick={() => note.kind==='reading_reflection'?setReadingWork(note.workId || note.sourceRef?.replace(/^book:/u,'') || ''):setEditor({ note, key: Date.now() })} className="p-1.5"><Pencil size={15} /></button><button type="button" aria-label={t('deleteNote')} onClick={() => void remove(note)} className="p-1.5 text-red-500"><Trash2 size={15} /></button></div></header>
          <details data-note-export-menu className="text-xs border-t border-subtle pt-2">
            <summary className="cursor-pointer leading-loose">{t('noteExportMenu')}</summary>
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" data-note-export-markdown onClick={() => void exportMarkdown([note.id])} className="rounded-lg border border-subtle px-3 py-2 text-start leading-relaxed">{t('noteExportMarkdown')}</button>
              <button type="button" data-note-export-word onClick={() => { setWordNoteId(note.id); setWordOptions(savedWordLayout()); }} className="rounded-lg border border-subtle px-3 py-2 text-start leading-relaxed">{t('noteExportWord')}</button>
            </div>
          </details>
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
    {!shown.length && !error && !loading && <p className="py-8 text-center text-sm text-muted">{t('studyNoResults')}</p>}
    <KnowledgeTools />
    <SrsReviewPanel />
    <SavedCardsPanel />
  </section>;
};
