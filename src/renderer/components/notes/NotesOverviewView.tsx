'use client';
import { useUndoFeedback } from '../../hooks/useUndoFeedback';

import { ContextMenu } from '../ui/ContextMenu';
import { contextActions } from '../actions/context-actions';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  FileType,
  Download,
  Filter,
  LayoutGrid,
  Plus,
  Search,
  Sparkles,
  X,
  BookOpen,
  ArrowUpDown,
  MessageSquare,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { StudyAssistant } from './StudyAssistant';
import { BoardsWorkspace } from './BoardsWorkspace';
import { SavedCardsPanel } from '../knowledge/SavedCardsPanel';
import { SrsReviewScreen } from '../knowledge/SrsReviewScreen';
import { NoteEditorPane } from './NoteEditorPane';
import { NoteDetailsPane } from './NoteDetailsPane';
import { KnowledgeTools } from './KnowledgeTools';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { ReadingLogPanel } from './ReadingLogPanel';
import {
  studyBacklinks,
  studyLinks,
  matchesStudyQuery,
  studyNoteExcerpt,
  type StudyNote,
} from '../../../shared/study-notes';
import {
  consumeStudyNote,
  navigateStudyReference,
  STUDY_NOTE_OPEN,
} from '../../utils/study-navigation';
import {
  DEFAULT_WORD_LAYOUT,
  wordLayout,
  type WordLayout,
} from '../../../shared/word-export';

const WORD_LAYOUT_KEY = 'baglib.wordLayout.v1';
const savedWordLayout = (): WordLayout => {
  try {
    return wordLayout(JSON.parse(localStorage.getItem(WORD_LAYOUT_KEY) || 'null'));
  } catch {
    return DEFAULT_WORD_LAYOUT;
  }
};

export type WorkspaceTab = 'notes' | 'cards' | 'boards' | 'review';
export type NoteSortOrder = 'recent' | 'title' | 'oldest';
export type NoteFilter = 'all' | 'comments' | 'questions' | 'book';

export const NotesOverviewView: React.FC = () => {
  const { books, dir, t, lang, openBookForReading } = useWorkspace();
  const { notes, refresh, error, failedSources, loading } = useStudyNotes();
  const removeWithUndo = useUndoFeedback();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('notes');
  const [mobileScreen, setMobileScreen] = useState<'list' | 'editor'>('list');
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<NoteSortOrder>('recent');
  const [filterMode, setFilterMode] = useState<NoteFilter>('all');
  const [readingWork, setReadingWork] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [editorDraft, setEditorDraft] = useState<{ content?: string; key: number } | null>(null);

  const [dueCardsCount, setDueCardsCount] = useState<number>(0);
  const [boardsCount, setBoardsCount] = useState<number>(0);
  const [openComments, setOpenComments] = useState<Record<string, number>>({});
  const [actionError, setActionError] = useState(false);

  // Anchor and paragraph focus for deep link scrolling
  const [anchor, setAnchor] = useState<string | null>(null);
  const [focusParagraph, setFocusParagraph] = useState<{ id: string; anchor: string; at: number } | null>(null);

  // Modals & Exports
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [exported, setExported] = useState<{ folder: string; count: number } | null>(null);
  const [wordExported, setWordExported] = useState<{ file: string; count: number } | null>(null);
  const [wordOptions, setWordOptions] = useState<WordLayout | null>(null);
  const [wordNoteId, setWordNoteId] = useState<string | null>(null);

  // Refresh counts (due cards, boards, comments)
  useEffect(() => {
    let alive = true;
    const loadCounts = async () => {
      try {
        const [counts, queue, boardList] = await Promise.all([
          window.electronAPI?.knowledgeHistory?.commentCounts?.().catch(() => ({})),
          window.electronAPI?.knowledgeCards?.reviewQueue?.().catch(() => null),
          window.electronAPI?.boards?.list?.().catch(() => []),
        ]);
        if (!alive) return;
        if (counts) setOpenComments(counts);
        if (queue) setDueCardsCount(queue.due);
        if (boardList) setBoardsCount(boardList.length);
      } catch {}
    };

    void loadCounts();
    const offStudy = window.electronAPI?.studyNotes?.onChanged?.(() => {
      void loadCounts();
    });
    const offBoards = window.electronAPI?.boards?.onChanged?.(() => {
      void loadCounts();
    });

    const handleSrsReview = () => void loadCounts();
    window.addEventListener('baglib:srs-reviewed', handleSrsReview);
    window.addEventListener('baglib:knowledge-card-saved', handleSrsReview);

    return () => {
      alive = false;
      offStudy?.();
      offBoards?.();
      window.removeEventListener('baglib:srs-reviewed', handleSrsReview);
      window.removeEventListener('baglib:knowledge-card-saved', handleSrsReview);
    };
  }, [notes]);

  // Handle cross-workspace events from navigation rail and elsewhere
  useEffect(() => {
    const handleOpenBoards = () => setActiveTab('boards');
    const handleOpenCards = () => setActiveTab('cards');
    const handleStartReview = () => setActiveTab('review');
    const handleNewNote = () => {
      setActiveTab('notes');
      setSelectedId(null);
      setCreatingNew(true);
      setEditorDraft({ content: '', key: Date.now() });
      setMobileScreen('editor');
    };
    const handleNewCard = () => {
      setActiveTab('cards');
    };

    window.addEventListener('baglib:open-boards', handleOpenBoards);
    window.addEventListener('baglib:open-cards', handleOpenCards);
    window.addEventListener('baglib:start-review', handleStartReview);
    window.addEventListener('baglib:new-note', handleNewNote);
    window.addEventListener('baglib:new-card', handleNewCard);

    return () => {
      window.removeEventListener('baglib:open-boards', handleOpenBoards);
      window.removeEventListener('baglib:open-cards', handleOpenCards);
      window.removeEventListener('baglib:start-review', handleStartReview);
      window.removeEventListener('baglib:new-note', handleNewNote);
      window.removeEventListener('baglib:new-card', handleNewCard);
    };
  }, []);

  // Handle deep links and external note targets
  useEffect(() => {
    const consume = () => {
      const pending = consumeStudyNote();
      if (!pending) return;
      setActiveTab('notes');
      setMobileScreen('editor');
      if (pending.id) {
        setSelectedId(pending.id);
        setCreatingNew(false);
        setEditorDraft(null);
        setQuery('');
        setFocusParagraph(pending.anchor ? { id: pending.id, anchor: pending.anchor, at: Date.now() } : null);
      } else {
        setSelectedId(null);
        setCreatingNew(true);
        setEditorDraft({ content: pending.content || '', key: Date.now() });
        setAnchor(studyLinks(pending.content || '')[0]?.target || null);
      }
    };
    consume();
    window.addEventListener(STUDY_NOTE_OPEN, consume);
    return () => window.removeEventListener(STUDY_NOTE_OPEN, consume);
  }, []);

  // Paragraph highlight animation
  useEffect(() => {
    if (!focusParagraph) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let element: Element | null = null;
    const clear = () => {
      element?.classList.remove('bg-amber-400/30');
      element?.removeAttribute('data-paragraph-focused');
    };
    // KEY-320: paragraphs render in the editor's preview, which may appear a few frames after the note is selected.
    let frame = 0;
    let tries = 0;
    const find = () => {
      element = document.querySelector(
        `[data-note-preview="${CSS.escape(focusParagraph.id)}"] [data-paragraph="${CSS.escape(focusParagraph.anchor)}"]`
      );
      if (!element) {
        if (++tries < 60) frame = requestAnimationFrame(find);
        return;
      }
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element.classList.add('bg-amber-400/30');
      element.setAttribute('data-paragraph-focused', 'true');
      timer = setTimeout(clear, 2200);
    };
    frame = requestAnimationFrame(find);
    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      clear();
    };
  }, [focusParagraph, notes]);

  // Navigate study references
  const openTarget = async (target: string) => {
    setActionError(false);
    try {
      await navigateStudyReference(target, books, openBookForReading, (id, paragraph) => {
        if (!notes.some((n) => n.id === id)) throw new Error('missing-note');
        setSelectedId(id);
        setCreatingNew(false);
        setEditorDraft(null);
        setQuery('');
        setAnchor(null);
        setMobileScreen('editor');
        setFocusParagraph(paragraph ? { id, anchor: paragraph, at: Date.now() } : null);
      });
    } catch {
      setActionError(true);
    }
  };

  // Filtered and sorted notes list
  const filteredNotes = useMemo(() => {
    return notes
      .filter((note) => {
        if (filterMode === 'comments' && (openComments[note.id] ?? 0) <= 0) {
          return false;
        }
        if (filterMode === 'book' && readingWork && note.workId !== readingWork) {
          return false;
        }
        if (anchor && !studyBacklinks([note], anchor).length) {
          return false;
        }
        if (query) {
          const bookTitle = books.find((b) => b.id === note.workId)?.title || '';
          const haystack = `${note.title} ${note.content} ${note.aliases.join(' ')} ${note.tags.join(' ')} ${bookTitle}`;
          return matchesStudyQuery(haystack, query);
        }
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === 'title') {
          return (a.title || '').localeCompare(b.title || '', lang === 'ar' ? 'ar' : 'en');
        }
        if (sortOrder === 'oldest') {
          return a.id.localeCompare(b.id);
        }
        // 'recent' by default (descending)
        return b.id.localeCompare(a.id);
      });
  }, [notes, filterMode, readingWork, anchor, query, books, openComments, sortOrder, lang]);

  // Select first note automatically if none selected on desktop
  const activeNote = useMemo(() => {
    if (creatingNew) return null;
    if (selectedId) {
      return notes.find((n) => n.id === selectedId) || null;
    }
    return filteredNotes[0] || null;
  }, [notes, selectedId, creatingNew, filteredNotes]);

  const handleSelectNote = (noteId: string) => {
    setSelectedId(noteId);
    setCreatingNew(false);
    setEditorDraft(null);
    setMobileScreen('editor');
  };

  const handleStartNewNote = () => {
    setSelectedId(null);
    setCreatingNew(true);
    setEditorDraft({ content: '', key: Date.now() });
    setMobileScreen('editor');
  };

  const handleRemoveNote = async (note: StudyNote) => {
    try {
      await removeWithUndo(note.knowledgeId || note.id, async () => {
        if (note.workId || note.knowledgeId) await window.electronAPI.knowledge.delete(note.knowledgeId || note.id);
        else await window.electronAPI.studyNotes.remove(note.id);
      }, refresh);
      window.dispatchEvent(new CustomEvent('baglib:notes-changed'));
      if (selectedId === note.id) {
        setSelectedId(null);
        setMobileScreen('list');
      }
      await refresh();
    } catch {
      setActionError(true);
    }
  };

  const handleMemorizeNote = async (note: StudyNote) => {
    try {
      const card = await window.electronAPI.knowledgeCards.save({
        front: note.title || note.content,
        back: note.content,
        sourceKind: 'note',
        sourceRef: `note:${note.id}`,
        sourceLabel: note.title,
        workId: note.workId,
      });
      await window.electronAPI.knowledgeCards.setMemorizing(card.id, true);
      window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'));
      setActionError(false);
    } catch {
      setActionError(true);
    }
  };

  const exportMarkdown = async (ids = filteredNotes.map((n) => n.id)) => {
    setActionError(false);
    setExported(null);
    setWordExported(null);
    try {
      const result = await window.electronAPI.studyNotes.exportMarkdown(ids);
      if (result) setExported(result);
    } catch {
      setActionError(true);
    }
  };

  const exportWord = async (layout: WordLayout) => {
    setActionError(false);
    setWordExported(null);
    setExported(null);
    setWordOptions(null);
    try {
      localStorage.setItem(WORD_LAYOUT_KEY, JSON.stringify(layout));
    } catch {}
    try {
      const ids = wordNoteId ? [wordNoteId] : filteredNotes.map((n) => n.id);
      const result = await window.electronAPI.studyNotes.exportWord(ids, lang, layout);
      if (result) setWordExported(result);
    } catch {
      setActionError(true);
    }
  };

  return (
    <section
      data-notes-overview
      aria-label={t('notesWorkspaceTitle')}
      className="flex-1 min-h-0 flex flex-col bg-canvas select-none overflow-hidden"
      dir={dir}
    >
      {/* Workspace Header Tabs Bar (hidden in focused Review mode) */}
      {activeTab !== 'review' && (
        <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-subtle bg-surface">
          <div className="flex items-center gap-1 sm:gap-2">
            <h1 className="sr-only" title={t('notesWorkspaceTitle')}>
              {t('myNotesTitle')} — {t('myNotesDesc')}
            </h1>
            {/* Notes Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('notes')}
              data-notes-tab="notes"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'notes'
                  ? 'bg-primary text-primary-contrast shadow-xs'
                  : 'text-muted hover:text-main hover:bg-canvas'
              }`}
            >
              <FileText className="size-4" />
              <span>{t('notesTabNotes')}</span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full tabular-nums ${
                  activeTab === 'notes'
                    ? 'bg-white/20 text-white'
                    : 'bg-canvas border border-subtle text-muted'
                }`}
              >
                {notes.length}
              </span>
            </button>

            {/* Knowledge Cards Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('cards')}
              data-notes-tab="cards"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'cards'
                  ? 'bg-primary text-primary-contrast shadow-xs'
                  : 'text-muted hover:text-main hover:bg-canvas'
              }`}
            >
              <Sparkles className="size-4" />
              <span>{t('notesTabCards')}</span>
              {dueCardsCount > 0 && (
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
                    activeTab === 'cards'
                      ? 'bg-amber-400 text-stone-900'
                      : 'bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {dueCardsCount}
                </span>
              )}
            </button>

            {/* Boards Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('boards')}
              data-notes-tab="boards"
              data-notes-boards
              aria-label={t('boardsOpen')}
              title={t('boardsOpen')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'boards'
                  ? 'bg-primary text-primary-contrast shadow-xs'
                  : 'text-muted hover:text-main hover:bg-canvas'
              }`}
            >
              <LayoutGrid className="size-4" />
              <span>{t('notesTabBoards')}</span>
              {boardsCount > 0 && (
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full tabular-nums ${
                    activeTab === 'boards'
                      ? 'bg-white/20 text-white'
                      : 'bg-canvas border border-subtle text-muted'
                  }`}
                >
                  {boardsCount}
                </span>
              )}
            </button>
          </div>

          {/* Quick Actions in Workspace Header */}
          <div className="flex items-center gap-2">
            {activeTab === 'notes' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  data-notes-export-word
                  disabled={!filteredNotes.length}
                  title={t('notesExportWordHint')}
                  aria-label={t('notesExportWord', { count: filteredNotes.length })}
                  aria-expanded={Boolean(wordOptions)}
                  onClick={() => {
                    setWordNoteId(null);
                    setWordOptions((current) => (current ? null : savedWordLayout()));
                  }}
                  icon={<FileType className="size-3.5" />}
                >
                  <span className="hidden lg:inline">{t('notesExportWord', { count: filteredNotes.length })}</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  data-notes-export-markdown
                  disabled={!filteredNotes.length}
                  title={t('notesExportMarkdownHint')}
                  aria-label={t('notesExportMarkdown', { count: filteredNotes.length })}
                  onClick={() => void exportMarkdown()}
                  icon={<Download className="size-3.5" />}
                >
                  <span className="hidden lg:inline">{t('notesExportMarkdown', { count: filteredNotes.length })}</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  data-notes-assistant
                  onClick={() => setAssistantOpen(true)}
                  icon={<Sparkles className="size-3.5 text-amber-500" />}
                 aria-label={t('assistantOpen')}>
                  <span className="hidden sm:inline">{t('assistantOpen')}</span>
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStartNewNote}
                  icon={<Plus className="size-3.5" />}
                  data-new-note-button
                >
                  {t('studyNewNote')}
                </Button>
              </>
            )}

            {activeTab === 'cards' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setActiveTab('review')}
                icon={<Sparkles className="size-3.5" />}
                data-start-review-header
              >
                {dueCardsCount > 0
                  ? t('srsReviewDue', { count: dueCardsCount })
                  : t('srsStartReview')}
              </Button>
            )}
          </div>
        </header>
      )}

      {/* Global Modals / Panels */}
      {assistantOpen && (
        <StudyAssistant
          notes={notes}
          initialNotes={
            filteredNotes.length <= 10 && filteredNotes.length < notes.length
              ? filteredNotes.map((n) => n.id)
              : []
          }
          onClose={() => setAssistantOpen(false)}
        />
      )}

      {/* Word Layout Options form */}
      {wordOptions && (
        <form
          data-word-options
          aria-label={t('wordOptionsTitle')}
          data-word-note={wordNoteId || undefined}
          onSubmit={(event) => {
            event.preventDefault();
            void exportWord(wordOptions);
          }}
          className="m-4 flex flex-wrap items-end gap-3 rounded-2xl border border-subtle bg-surface p-4 text-sm shadow-md"
        >
          <strong className="basis-full text-xs font-bold text-main">
            {t('wordOptionsTitle')}
          </strong>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              data-word-contents
              checked={wordOptions.contents}
              onChange={(e) => setWordOptions({ ...wordOptions, contents: e.target.checked })}
            />
            {t('wordContents')}
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t('wordPageSize')}
            <select
              data-word-page
              value={wordOptions.pageSize}
              onChange={(e) =>
                setWordOptions(wordLayout({ ...wordOptions, pageSize: e.target.value }))
              }
              className="rounded-lg border border-subtle bg-canvas px-2.5 py-1 text-sm outline-none"
            >
              <option value="a4">A4</option>
              <option value="letter">{t('wordPageLetter')}</option>
              <option value="a5">A5</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t('wordMargins')}
            <select
              data-word-margins
              value={wordOptions.margins}
              onChange={(e) =>
                setWordOptions(wordLayout({ ...wordOptions, margins: e.target.value }))
              }
              className="rounded-lg border border-subtle bg-canvas px-2.5 py-1 text-sm outline-none"
            >
              <option value="normal">{t('wordMarginNormal')}</option>
              <option value="narrow">{t('wordMarginNarrow')}</option>
              <option value="wide">{t('wordMarginWide')}</option>
            </select>
          </label>
          <span className="ms-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setWordOptions(null)}>
              {t('cancel')}
            </Button>
            <Button variant="primary" size="sm" type="submit" data-word-go>
              {t('wordExportGo')}
            </Button>
          </span>
        </form>
      )}

      {/* Export Notifications */}
      {wordExported && (
        <p
          role="status"
          data-notes-word-exported
          className="mx-4 mt-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed"
        >
          {t('notesExportWordDone', { count: wordExported.count })}{' '}
          <bdi dir="ltr" className="break-all font-mono">
            {wordExported.file}
          </bdi>
        </p>
      )}

      {exported && (
        <p
          role="status"
          data-notes-exported
          className="mx-4 mt-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed"
        >
          {t('notesExportDone', { count: exported.count })}{' '}
          <bdi dir="ltr" className="break-all font-mono">
            {exported.folder}
          </bdi>
        </p>
      )}

      {/* Load error banner */}
      {error && (
        <div role="alert" className="mx-4 mt-2 p-3 rounded-xl border border-amber-500/40 text-sm leading-loose space-y-2 bg-amber-500/10">
          <p>{t('studyLoadFailed')}</p>
          <p>{failedSources.map(source => t(source === 'notes' ? 'studyLoadPersonalSource' : 'studyLoadKnowledgeSource')).join(' · ')}</p>
          <button
            type="button"
            disabled={loading}
            onClick={() => void refresh()}
            className="rounded-lg border border-subtle px-3 py-1 hover:bg-surface disabled:opacity-50 text-xs"
          >
            {t('lookupRetry')}
          </button>
        </div>
      )}

      {/* Action error banner */}
      {actionError && (
        <p role="alert" className="mx-4 mt-2 p-2 rounded-lg bg-danger/10 text-danger text-xs">
          {t('studyActionFailed')}
        </p>
      )}

      {/* TAB 1: 3-PART NOTES WORKSPACE */}
      {activeTab === 'notes' && (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* PANE 1: NOTES LIST (Visible if desktop or mobileScreen === 'list') */}
          <aside
            data-notes-list-pane
            className={`w-full md:w-72 lg:w-80 shrink-0 border-e border-subtle bg-surface flex flex-col min-h-0 select-none ${
              mobileScreen === 'editor' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Search and Filters Header */}
            <div className="p-3 border-b border-subtle space-y-2.5 bg-canvas/40">
              <label className="flex items-center gap-2 rounded-xl border border-subtle bg-surface px-3 py-1.5 text-xs">
                <Search className="size-3.5 text-muted shrink-0" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('studySearchNotes')}
                  aria-label={t('studySearchNotes')}
                  className="w-full min-w-0 bg-transparent outline-none text-main placeholder:text-muted"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} className="text-muted" aria-label={t('searchClearQuery')}>
                    <X className="size-3" />
                  </button>
                )}
              </label>

              {/* Filters & Sort Controls */}
              <div className="flex items-center justify-between gap-2 text-xs">
                {/* Filter Selector */}
                <div className="flex items-center gap-1">
                  <Filter className="size-3 text-muted shrink-0" />
                  <select
                    value={filterMode}
                    onChange={(e) => setFilterMode(e.target.value as NoteFilter)}
                    className="bg-transparent text-xs text-muted outline-none cursor-pointer"
                  >
                    <option value="all">{t('notesFilterAll')}</option>
                    <option value="comments">{t('commentsOnlyOpen', { count: Object.values(openComments).reduce((sum, count) => sum + count, 0) })}</option>
                    <option value="questions">{t('waveQuestions')}</option>
                    <option value="book">{t('notesFilterBook')}</option>
                  </select>
                </div>

                {/* Sort Selector */}
                <div className="flex items-center gap-1">
                  <ArrowUpDown className="size-3 text-muted shrink-0" />
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as NoteSortOrder)}
                    className="bg-transparent text-xs text-muted outline-none cursor-pointer"
                  >
                    <option value="recent">{t('notesSortRecent')}</option>
                    <option value="title">{t('notesSortTitle')}</option>
                    <option value="oldest">{t('notesSortOldest')}</option>
                  </select>
                </div>
              </div>

              {/* Work Selector if Filter is 'book' */}
              {filterMode === 'book' && (
                <select
                  data-reading-log-book
                  aria-label={t('waveReadingLog')}
                  value={readingWork}
                  onChange={(e) => setReadingWork(e.target.value)}
                  className="w-full bg-surface border border-subtle rounded-lg px-2 py-1 text-xs outline-none"
                >
                  <option value="">{t('dashScratchpadAttachBook')}</option>
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Reading Log Panel if book selected */}
            {readingWork && <ReadingLogPanel key={readingWork} workId={readingWork} />}

            {/* Notes List Scroll Area */}
            {filterMode === 'questions' ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-3">
                <KnowledgeTools />
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                {loading && (
                  <div role="status" aria-label={t('studyLoadingNotes')} className="space-y-3 p-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
                )}

                {filteredNotes.length === 0 && !error && !loading && (
                  <div className="py-6 text-center space-y-3">
                    <EmptyState
                      icon={<FileText className="size-6 text-muted" />}
                      title={t('studyNoResults')}
                      description={t('notesEmptyDesc')}
                      action={
                        <Button variant="primary" size="sm" onClick={handleStartNewNote}>
                          {t('studyNewNote')}
                        </Button>
                      }
                      className="py-2"
                    />
                  </div>
                )}

                {filteredNotes.map((note) => {
                  const isSelected = (!creatingNew && activeNote?.id === note.id) || selectedId === note.id;
                  const book = books.find((b) => b.id === note.workId);
                  const commentsCount = openComments[note.id] ?? 0;

                  return (
                    <ContextMenu as="article" items={contextActions('note', {
                        open: () => handleSelectNote(note.id),
                        copy: () => navigator.clipboard.writeText(note.content),
                        export: () => exportMarkdown([note.id]),
                        srs: () => handleMemorizeNote(note),
                        delete: () => { if(window.confirm(t('markDeleteConfirm')))return handleRemoveNote(note); },
                      },t)}
                      key={note.id}
                      data-study-note={note.id}
                      onClick={() => handleSelectNote(note.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                        isSelected
                          ? 'bg-primary/10 border-primary-text/40 shadow-xs ring-1 ring-primary-text/20'
                          : 'bg-surface hover:bg-canvas border-subtle/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4
                          dir="auto"
                          className={`text-xs sm:text-sm font-bold truncate leading-tight ${
                            isSelected ? 'text-primary-text' : 'text-main'
                          }`}
                        >
                          {note.title || t('dashScratchpadGeneralNote')}
                        </h4>

                        {commentsCount > 0 && (
                          <span
                            data-note-open-comments
                            className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.2 text-[10px] text-amber-700 dark:text-amber-300 shrink-0 font-medium"
                          >
                            <MessageSquare className="size-2.5" />
                            <span>{commentsCount}</span>
                          </span>
                        )}
                      </div>

                      <p
                        dir="auto"
                        className="text-xs text-muted line-clamp-2 leading-relaxed"
                        style={{
                          fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)",
                        }}
                      >
                        {studyNoteExcerpt(note.content) || '...'}
                      </p>

                      <div className="flex flex-wrap items-center gap-1 pt-1 text-[10px] text-muted">
                        {book && (
                          <span className="inline-flex items-center gap-1 bg-canvas px-1.5 py-0.5 rounded border border-subtle truncate max-w-[140px]">
                            <BookOpen className="size-2.5 text-primary-text" />
                            <span className="truncate">{book.title}</span>
                          </span>
                        )}
                        {note.tags.slice(0, 2).map((tg) => (
                          <span key={tg} className="bg-canvas px-1 py-0.5 rounded text-muted">
                            #{tg}
                          </span>
                        ))}
                      </div>
                    </ContextMenu>
                  );
                })}
              </div>
            )}
          </aside>

          {/* PANE 2: NOTE EDITOR (Visible if desktop or mobileScreen === 'editor') */}
          <main
            className={`flex-1 min-w-0 min-h-0 flex flex-col bg-surface ${
              mobileScreen === 'list' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {activeNote || creatingNew ? (
              <NoteEditorPane
                key={activeNote ? activeNote.id : `new-${editorDraft?.key ?? 0}`}
                note={activeNote}
                notes={notes}
                onOpenTarget={(target) => void openTarget(target)}
                focusAnchor={activeNote && focusParagraph?.id === activeNote.id ? focusParagraph : null}
                initialContent={editorDraft?.content}
                showBack={mobileScreen === 'editor'}
                onBack={() => setMobileScreen('list')}
                isPanelOpen={isPanelOpen}
                onTogglePanel={() => setIsPanelOpen(!isPanelOpen)}
                onSaved={(saved) => {
                  if (saved) setSelectedId(saved.id);
                  setCreatingNew(false);
                  void refresh();
                }}
                onDelete={handleRemoveNote}
                onMemorize={handleMemorizeNote}
                onOpenAssistant={() => setAssistantOpen(true)}
                onExportMarkdown={() => void exportMarkdown(activeNote ? [activeNote.id] : [])}
                onExportWord={() => {
                  if (activeNote) setWordNoteId(activeNote.id);
                  setWordOptions(savedWordLayout());
                }}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-8">
                <EmptyState
                  icon={<FileText className="size-10 text-muted" />}
                  title={t('notesSelectPrompt')}
                  action={
                    <Button variant="primary" size="md" onClick={handleStartNewNote}>
                      {t('studyNewNote')}
                    </Button>
                  }
                />
              </div>
            )}
          </main>

          {/* PANE 3: COLLAPSIBLE BACKLINKS & HISTORY PANEL (Desktop only when open, and note active) */}
          {isPanelOpen && activeNote && (
            <div className="hidden lg:flex min-h-0">
              <NoteDetailsPane
                note={activeNote}
                notes={notes}
                onOpenTarget={openTarget}
                onRefresh={() => void refresh()}
                onClose={() => setIsPanelOpen(false)}
              />
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SAVED KNOWLEDGE CARDS */}
      {activeTab === 'cards' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <SavedCardsPanel onStartReview={() => setActiveTab('review')} />
        </div>
      )}

      {/* TAB 3: DEDICATED REVIEW SCREEN */}
      {activeTab === 'review' && (
        <SrsReviewScreen
          onClose={() => setActiveTab('cards')}
          onNavigateSource={openTarget}
        />
      )}

      {/* TAB 4: BOARDS WORKSPACE (First-class view) */}
      {activeTab === 'boards' && (
        <BoardsWorkspace
          notes={notes}
          onClose={() => setActiveTab('notes')}
        />
      )}
    </section>
  );
};
