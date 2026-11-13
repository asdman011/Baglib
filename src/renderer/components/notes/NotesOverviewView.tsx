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
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { StudyAssistant } from './StudyAssistant';
import { BoardsWorkspace } from './BoardsWorkspace';
import { SavedCardsPanel } from '../knowledge/SavedCardsPanel';
import { SrsReviewScreen } from '../knowledge/SrsReviewScreen';
import { NoteEditorPane } from './NoteEditorPane';
import { NotesFolderTree, folderName } from './NotesFolderTree';
import { folderCounts, folderLabels, noteFolders, notePosition, notesInFolder, childFolders, targetFolder } from '../../../shared/notes-tree';
import { NoteDetailsPane } from './NoteDetailsPane';
import { KnowledgeTools } from './KnowledgeTools';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
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

const NOTES_FOLDER_KEY = 'baglib.notes.folder';
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
  // KEY-338: folder navigation (the user's mock-up). null = all notes. Remembered between visits.
  const [folder, setFolderState] = useState<string | null>(() => { try { return localStorage.getItem(NOTES_FOLDER_KEY) || null; } catch { return null; } });
  const setFolder = (next: string | null) => { setFolderState(next); try { if (next) localStorage.setItem(NOTES_FOLDER_KEY, next); else localStorage.removeItem(NOTES_FOLDER_KEY); } catch { /* remembered for this session only */ } };
  const [showEmpty, setShowEmpty] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');

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
  const [openExportIds, setOpenExportIds] = useState<string[] | null>(null);
  const [openFormat, setOpenFormat] = useState<'markdown' | 'csv' | 'latex'>('markdown');
  const [formatBusy, setFormatBusy] = useState(false);
  const [imported, setImported] = useState<number | null>(null);

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
  const folderNoteCounts = useMemo(() => folderCounts(notes), [notes]);
  const folderNames = useMemo(() => folderLabels(notes), [notes]);
  const noteBooks = (note: { id: string; content: string; workId?: string; sourceRef?: string }) => noteFolders(note).filter(path => path.startsWith('library/')).map(path => books.find(book => book.id === path.slice(8))).filter((book): book is NonNullable<typeof book> => !!book);
  const filteredNotes = useMemo(() => {
    const scoped = notesInFolder(notes, folder);
    return scoped
      .filter((note) => {
        if (tagFilter && !note.tags.includes(tagFilter)) return false;
        if (subjectFilter && !noteBooks(note).some(book => [...(book.categories ?? []), book.primaryCategory?.nameAr, book.primaryCategory?.nameEn].includes(subjectFilter))) return false;
        if (authorFilter && !noteBooks(note).some(book => book.author === authorFilter)) return false;
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
        // KEY-338: ids are random UUIDs, so date order uses the edit time. Inside a surah, poem or lecture the
        // default order follows the text (ayah, verse, moment), as in the mock-up.
        if (sortOrder === 'oldest') {
          return a.updatedAt.localeCompare(b.updatedAt);
        }
        if (folder && folder.includes('/')) {
          const position = notePosition(a, folder) - notePosition(b, folder);
          if (position) return position;
        }
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, folder, tagFilter, subjectFilter, authorFilter, filterMode, readingWork, anchor, query, books, openComments, sortOrder, lang]);
  const allTags = useMemo(() => [...new Set(notesInFolder(notes, folder).flatMap(note => note.tags))].sort(), [notes, folder]);
  const folderBooks = useMemo(() => [...new Map(notesInFolder(notes, folder).flatMap(noteBooks).map(book => [book.id, book])).values()],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, folder, books]);
  const allSubjects = useMemo(() => [...new Set(folderBooks.flatMap(book => [...(book.categories ?? []), (lang === 'ar' ? book.primaryCategory?.nameAr : book.primaryCategory?.nameEn) ?? ''].filter(Boolean)))].sort(), [folderBooks, lang]);
  const allAuthors = useMemo(() => [...new Set(folderBooks.map(book => book.author).filter(Boolean))].sort(), [folderBooks]);
  const folderTitle = folder ? folderName(folder, t, lang, folderNames, books) : t('notesFolderAll');
  const crumbs = folder ? folder.split('/').map((_, index, parts) => parts.slice(0, index + 1).join('/')) : [];

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

  const exportMarkdown = (ids = filteredNotes.map((n) => n.id)) => {
    setActionError(false);
    setOpenFormat('markdown');
    setOpenExportIds(ids);
  };

  const exportOpenFormat = async () => {
    if (!openExportIds || formatBusy) return;
    setFormatBusy(true);
    setActionError(false);
    setExported(null);
    setWordExported(null);
    try {
      const result = await window.electronAPI.studyNotes.exportOpenFormat(openExportIds, openFormat);
      if (result) { setExported(result); setOpenExportIds(null); }
    } catch {
      setActionError(true);
    } finally {
      setFormatBusy(false);
    }
  };

  const importMarkdown = async () => {
    if (formatBusy) return;
    setFormatBusy(true);
    setActionError(false);
    setImported(null);
    try {
      const result = await window.electronAPI.studyNotes.importMarkdown();
      if (result) { setImported(result.count); await refresh(); }
    } catch {
      setActionError(true);
    } finally {
      setFormatBusy(false);
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
                <Button variant="ghost" size="sm" data-notes-import-markdown disabled={formatBusy} onClick={() => void importMarkdown()} title={t('notesImportMarkdown')}>
                  {t('notesImportMarkdown')}
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

      <Modal open={openExportIds !== null} onClose={() => { if (!formatBusy) setOpenExportIds(null); }} title={t('notesOpenFormats')}>
        <div className="space-y-4 p-4 text-sm leading-relaxed" data-notes-format-options>
          <label className="flex flex-col gap-2">
            {t('notesExportFormat')}
            <select data-notes-format value={openFormat} disabled={formatBusy} onChange={event => setOpenFormat(event.target.value as typeof openFormat)} className="rounded-lg border border-subtle bg-surface p-2 text-start">
              <option value="markdown">{t('notesFormatMarkdown')}</option>
              <option value="csv">{t('notesFormatCsv')}</option>
              <option value="latex">{t('notesFormatLatex')}</option>
            </select>
          </label>
          <p data-notes-format-loss>{t(openFormat === 'markdown' ? 'notesMarkdownLoss' : openFormat === 'csv' ? 'notesCsvLoss' : 'notesLatexLoss')}</p>
          <p>{t('notesAllFormatsLoss')}</p>
          {actionError && <p role="alert" className="text-danger">{t('studyActionFailed')}</p>}
          <Button variant="primary" disabled={formatBusy} onClick={() => void exportOpenFormat()} data-notes-format-go>{t('wordExportGo')}</Button>
        </div>
      </Modal>
      {imported !== null && <p role="status" data-notes-imported className="mx-4 mt-2 text-sm leading-relaxed">{t('notesImportDone', { count: imported })}</p>}
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
          {/* KEY-338: folder tree (desktop); on narrow screens the breadcrumb and sub-folder chips drill down instead. */}
          <aside data-notes-tree-pane className="hidden lg:flex w-64 shrink-0 flex-col border-e border-subtle bg-surface min-h-0 select-none">
            <div className="flex items-center justify-between gap-2 border-b border-subtle px-3 py-2.5">
              <h3 className="text-sm font-bold">{t('notesFoldersLabel')}</h3>
            </div>
            <NotesFolderTree counts={folderNoteCounts} labels={folderNames} books={books} folder={folder} onSelect={next => { setFolder(next); setTagFilter(''); setSubjectFilter(''); setAuthorFilter(''); }} showEmpty={showEmpty} t={t} lang={lang} />
          </aside>
          {/* PANE 1: NOTES LIST (Visible if desktop or mobileScreen === 'list') */}
          <aside
            data-notes-list-pane
            className={`w-full md:w-72 lg:w-80 shrink-0 border-e border-subtle bg-surface flex flex-col min-h-0 select-none ${
              mobileScreen === 'editor' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Search and Filters Header */}
            <div className="p-3 border-b border-subtle space-y-2.5 bg-canvas/40">
              {/* KEY-338: breadcrumb (Notes › Quran › 2. Al-Baqarah) with a back arrow, as in the mock-up. */}
              <nav data-notes-breadcrumb aria-label={t('notesFoldersLabel')} className="flex min-w-0 items-center gap-1 text-xs">
                {folder && <button type="button" data-notes-folder-up onClick={() => setFolder(crumbs.length > 1 ? crumbs[crumbs.length - 2] : null)} aria-label={t('bayanBack')} title={t('bayanBack')} className="shrink-0 rounded p-1 text-amber-700 hover:bg-surface dark:text-amber-300"><ArrowLeft className="size-3.5 rtl:rotate-180" /></button>}
                <button type="button" onClick={() => setFolder(null)} className={`shrink-0 ${folder ? 'text-amber-700 hover:underline dark:text-amber-300' : 'font-bold text-main'}`}>{t('notesFolderAll')}</button>
                {crumbs.map((path, index) => <React.Fragment key={path}><ChevronRight className="size-3 shrink-0 text-muted rtl:rotate-180" aria-hidden="true" />
                  <button type="button" onClick={() => setFolder(path)} dir="auto" className={`min-w-0 truncate ${index === crumbs.length - 1 ? 'font-bold text-main' : 'text-amber-700 hover:underline dark:text-amber-300'}`}>{folderName(path, t, lang, folderNames, books)}</button></React.Fragment>)}
              </nav>
              {/* Narrow screens: the sub-folders of the current folder, so the tree can be walked without the side pane. */}
              {(() => { const kids = folder ? (folder === 'other' ? [] : childFolders(folderNoteCounts, folder)) : (['quran', 'sunnah', 'library', 'poetry', 'lectures', 'other'] as const).filter(root => folderNoteCounts.get(root)); return kids.length ? <div data-notes-subfolders className="flex gap-1.5 overflow-x-auto pb-0.5 lg:hidden">{kids.map(path => <button key={path} type="button" data-notes-folder={path} onClick={() => setFolder(path)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-subtle bg-surface px-2.5 py-1 text-xs"><span dir="auto" className="max-w-40 truncate">{folderName(path, t, lang, folderNames, books)}</span><span className="text-muted tabular-nums">{(folderNoteCounts.get(path) ?? 0).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</span></button>)}</div> : null; })()}
              <label className="flex items-center gap-2 rounded-xl border border-subtle bg-surface px-3 py-1.5 text-xs">
                <Search className="size-3.5 text-muted shrink-0" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={folder ? t('notesFolderSearch', { folder: folderTitle }) : t('studySearchNotes')}
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

              {/* KEY-338: filter chips (Tag, Subject, Author) for the current folder, and "Show empty folders". */}
              <div data-notes-filter-chips className="flex flex-wrap items-center gap-1.5 text-xs">
                {([['tag', tagFilter, setTagFilter, allTags, 'notesFilterTag'], ['subject', subjectFilter, setSubjectFilter, allSubjects, 'notesFilterSubject'], ['author', authorFilter, setAuthorFilter, allAuthors, 'notesFilterAuthor']] as const).map(([id, value, set, options, label]) => (options.length > 0 || value) && (
                  value ? <span key={id} data-notes-chip={id} className="inline-flex items-center gap-1 rounded-full bg-emerald-600/15 px-2.5 py-1 font-medium text-emerald-800 dark:text-emerald-200"><bdi>{t(label)}: {value}</bdi><button type="button" onClick={() => set('')} aria-label={t('notesFilterClear')} title={t('notesFilterClear')}><X className="size-3" /></button></span>
                    : <label key={id} data-notes-chip={id} className="inline-flex items-center rounded-full border border-subtle bg-surface px-2.5 py-1 text-muted"><span className="sr-only">{t(label)}</span><select value="" onChange={event => set(event.target.value)} aria-label={t(label)} className="max-w-32 bg-transparent outline-none"><option value="">{t(label)}</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
                ))}
                <label className="ms-auto inline-flex cursor-pointer items-center gap-1.5 text-muted"><input type="checkbox" data-notes-show-empty checked={showEmpty} onChange={event => setShowEmpty(event.target.checked)} className="accent-amber-600" />{t('notesShowEmpty')}</label>
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

            {/* KEY-324: a capture with a link narrows the list to notes linking the same target; show it and let it be cleared. */}
            {anchor && (
              <div data-notes-anchor-filter className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-subtle bg-canvas px-2 py-1 text-xs text-muted">
                <span className="min-w-0 flex-1 truncate">{t('studyLinkedNotes')}: <bdi dir="auto" className="text-main">{anchor}</bdi></span>
                <button type="button" data-notes-anchor-clear onClick={() => setAnchor(null)} aria-label={t('searchClearQuery')} title={t('searchClearQuery')} className="shrink-0 rounded p-0.5 hover:bg-surface">
                  <X className="size-3.5" />
                </button>
              </div>
            )}

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
                      {/* KEY-338: the passage the note is about (e.g. "البقرة ٢٥٥"), as a small badge. */}
                      {(() => { const passage = studyLinks(note.content).find(link => targetFolder(link.target)); return passage ? <span data-note-reference className="inline-block max-w-full truncate rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200" dir="auto">{passage.label}</span> : null; })()}
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
                        <span data-note-edited className="ms-auto">{t('notesEdited', { date: (() => { try { return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' }).format(new Date(note.updatedAt)); } catch { return ''; } })() })}</span>
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
