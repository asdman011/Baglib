'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Eye,
  FileEdit,
  FolderMinus,
  MoreVertical,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Save,
  Sparkles,
  Tag,
  Trash2,
  X,
  Download,
  FileType,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { Button, IconButton } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Menu } from '../ui/Menu';
import { StudyNoteEditor, type StudyNoteEditorHandle } from './StudyNoteEditor';
import { StudyNoteContent } from './StudyNoteContent';
import { KnowledgeGraphButton } from './KnowledgeGraph';
import { detectTextDirection } from '../dashboard/QuickNoteScratchpad';
import { calculateHijriDate } from '../../../shared/athan-calculator';
import { relationLabels } from '../../utils/relation-labels';
import { searchCorpus } from '../../utils/corpus-lookup';
import { collectionKeys } from '../../utils/sunnah-collections';
import type { StudyNote } from '../../../shared/study-notes';

export interface NoteEditorPaneProps {
  note?: StudyNote | null;
  notes?: StudyNote[];
  initialContent?: string;
  onSaved?: (note?: StudyNote) => void;
  onDelete?: (note: StudyNote) => void;
  onMemorize?: (note: StudyNote) => void;
  onOpenAssistant?: () => void;
  onExportMarkdown?: () => void;
  onExportWord?: () => void;
  onBack?: () => void;
  showBack?: boolean;
  isPanelOpen?: boolean;
  onTogglePanel?: () => void;
  draftKey?: string;
}

const DRAFT_KEY = 'dashboard.scratchpad.draft.v1';

export const NoteEditorPane: React.FC<NoteEditorPaneProps> = ({
  note,
  notes: propNotes,
  initialContent,
  onSaved,
  onDelete,
  onMemorize,
  onOpenAssistant,
  onExportMarkdown,
  onExportWord,
  onBack,
  showBack = false,
  isPanelOpen = true,
  onTogglePanel,
  draftKey: ownDraftKey,
}) => {
  const { books, dir, t, lang, openBookForReading, refreshTags } = useWorkspace();
  const { notes: hookNotes } = useStudyNotes();
  const notes = propNotes || hookNotes;

  const draftKey = ownDraftKey ?? (initialContent !== undefined ? 'study.capture.draft.v1' : DRAFT_KEY);

  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || initialContent || '');
  const [tagsInput, setTagsInput] = useState(note?.tags.join(', ') || '');
  const [aliasesInput, setAliasesInput] = useState(note?.aliases.join(', ') || '');
  const [workId, setWorkId] = useState(note?.workId || '');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagVal, setNewTagVal] = useState('');

  const editorRef = useRef<StudyNoteEditorHandle>(null);
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Load draft if starting fresh without a saved note
  useEffect(() => {
    let alive = true;
    if (note) return;
    void (async () => {
      const saved = await window.electronAPI?.settings?.get(draftKey);
      if (!alive) return;
      if (saved && typeof saved === 'object') {
        const draft = saved as {
          title?: string;
          content?: string;
          tagsInput?: string;
          aliasesInput?: string;
          workId?: string;
        };
        setTitle(draft.title || '');
        setContent(
          initialContent && !draft.content?.includes(initialContent.trim())
            ? [draft.content, initialContent].filter(Boolean).join('\n\n')
            : draft.content || initialContent || ''
        );
        setTagsInput(draft.tagsInput || '');
        setAliasesInput(draft.aliasesInput || '');
        setWorkId(draft.workId || '');
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [note, initialContent, draftKey]);

  // Save draft on unmount if unsaved
  useEffect(() => {
    return () => {
      if (!note && isDirty) {
        void window.electronAPI?.settings
          ?.set(draftKey, {
            title,
            content: contentRef.current,
            tagsInput,
            aliasesInput,
            workId,
            updatedAt: Date.now(),
          })
          .catch(() => {});
      }
    };
  }, [note, isDirty, title, tagsInput, aliasesInput, workId, draftKey]);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const currentContent = contentRef.current;
    if (!trimmedTitle && !currentContent.trim()) return;

    setSaving(true);
    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const aliases = aliasesInput
      .split(',')
      .map((alias) => alias.trim())
      .filter(Boolean);

    try {
      const targetId = note?.id || crypto.randomUUID();

      // If attached to a work, save via knowledge contract too
      if (workId) {
        await window.electronAPI.knowledge.save({
          id: note?.knowledgeId || targetId,
          workId,
          type: 'note',
          data: {
            content: currentContent,
            color: 'amber',
            tags,
          },
        });
      }

      const savedNote = await window.electronAPI.studyNotes.save({
        id: targetId,
        title: trimmedTitle,
        content: currentContent,
        tags,
        aliases,
        workId: workId || undefined,
      });

      if (!note) {
        await window.electronAPI?.settings?.set(draftKey, null).catch(() => {});
      }

      setIsDirty(false);
      refreshTags();
      window.dispatchEvent(new CustomEvent('baglib:notes-changed'));
      onSaved?.(savedNote);
    } catch (e) {
      console.error('Failed to save study note:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTag = () => {
    const trimmed = newTagVal.trim().replace(/^#/u, '');
    if (!trimmed) {
      setAddingTag(false);
      return;
    }
    const current = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (!current.includes(trimmed)) {
      const next = [...current, trimmed].join(', ');
      setTagsInput(next);
      setIsDirty(true);
    }
    setNewTagVal('');
    setAddingTag(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const current = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const next = current.filter((t) => t !== tagToRemove).join(', ');
    setTagsInput(next);
    setIsDirty(true);
  };

  const currentBook = books.find((b) => b.id === workId);
  const tagsList = tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const effectiveDir = detectTextDirection(content, dir);
  const isRtl = dir === 'rtl';
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const PanelToggleIcon = isPanelOpen ? PanelRightClose : PanelRightOpen;

  const slashLabels = {
    link: t('slashLink'),
    card: t('slashCard'),
    quran: t('slashQuran'),
    hadith: t('slashHadith'),
    poem: t('slashPoem'),
    heading: t('studyHeading'),
    quote: t('studyQuote'),
    list: t('studyList'),
    date: t('slashDate'),
    salla: t('slashSalla'),
    azza: t('slashAzza'),
    subhanahu: t('slashSubhanahu'),
    radiyaHu: t('slashRadiyaHu'),
    radiyaHa: t('slashRadiyaHa'),
    rahimahu: t('slashRahimahu'),
  };

  const kindLabels = {
    note: t('studyLinkKindNote'),
    book: t('studyLinkKindBook'),
    quran: t('studyLinkKindAyah'),
    hadith: t('studyLinkKindHadith'),
    poem: t('studyLinkKindPoem'),
    paragraph: t('studyLinkKindParagraph'),
  };

  const menuItems = [
    ...(onOpenAssistant
      ? [
          {
            label: t('assistantOpen'),
            icon: <Sparkles className="size-4 text-amber-500" />,
            onClick: onOpenAssistant,
          },
        ]
      : []),
    ...(note && onMemorize
      ? [
          {
            label: t('srsFromNote'),
            icon: <BookOpen className="size-4 text-emerald-600" />,
            onClick: () => onMemorize(note),
          },
        ]
      : []),
    ...(note && onExportMarkdown
      ? [
          {
            label: t('noteExportMarkdown'),
            icon: <Download className="size-4" />,
            onClick: onExportMarkdown,
          },
        ]
      : []),
    ...(note && onExportWord
      ? [
          {
            label: t('noteExportWord'),
            icon: <FileType className="size-4" />,
            onClick: onExportWord,
          },
        ]
      : []),
    ...(note && onDelete
      ? [
          {
            label: t('deleteNote'),
            icon: <Trash2 className="size-4 text-danger" />,
            onClick: () => {
              if (window.confirm(t('notesDeleteConfirm'))) {
                onDelete(note);
              }
            },
            danger: true,
          },
        ]
      : []),
  ];

  return (
    <div
      data-note-editor-pane
      className="flex-1 min-w-0 min-h-0 flex flex-col bg-surface border-subtle select-text overflow-hidden"
      dir={dir}
    >
      {/* Editor Header Bar */}
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-subtle bg-surface">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showBack && onBack && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onBack}
              icon={<BackIcon className="size-4" />}
              data-notes-back-button
              className="shrink-0"
             aria-label={t('notesBackToList')}>
              <span className="hidden sm:inline">{t('notesBackToList')}</span>
            </Button>
          )}

          <input
            type="text"
            value={title}
            dir="auto"
            placeholder={t('dashScratchpadGeneralNote')}
            onChange={(e) => {
              setTitle(e.target.value);
              setIsDirty(true);
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                void handleSave();
              }
            }}
            className="flex-1 min-w-0 font-display font-bold text-base sm:text-lg text-main bg-transparent outline-none truncate placeholder:text-muted"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Save Status pill */}
          <span className="text-[11px] font-sans px-2 py-0.5 rounded-full bg-canvas border border-subtle text-muted tabular-nums">
            {saving ? t('notesSaving') : isDirty ? t('notesUnsaved') : t('notesSaved')}
          </span>

          {/* Quick Save Button */}
          <Button
            variant="primary"
            size="sm"
            disabled={saving || (!title.trim() && !content.trim())}
            loading={saving}
            onClick={() => void handleSave()}
            icon={<Save className="size-3.5" />}
          >
            {t('save')}
          </Button>

          {/* Per-note Knowledge Graph Button */}
          {note && <KnowledgeGraphButton noteId={note.id} notes={notes} />}

          {/* Preview Toggle */}
          <IconButton
            size="sm"
            label={preview ? t('dashScratchpadEdit') : t('dashScratchpadPreview')}
            onClick={() => setPreview(!preview)}
          >
            {preview ? <FileEdit className="size-3.5" /> : <Eye className="size-3.5" />}
          </IconButton>

          {/* Collapsible Panel Toggle */}
          {onTogglePanel && (
            <IconButton
              size="sm"
              label={t('notesTogglePanel')}
              onClick={onTogglePanel}
            >
              <PanelToggleIcon className="size-3.5" />
            </IconButton>
          )}

          {/* Editor Header Action Menu */}
          {menuItems.length > 0 && (
            <Menu
              align="end"
              trigger={({ onClick, ref, ...props }) => (
                <IconButton
                  ref={ref}
                  size="sm"
                  label={t('noteExportMenu')}
                  onClick={onClick}
                  {...props}
                >
                  <MoreVertical className="size-4" />
                </IconButton>
              )}
              items={menuItems}
            />
          )}
        </div>
      </header>

      {/* Metadata Chips Bar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-subtle/80 bg-canvas/50 text-xs">
        {/* Work / Source Attachment Chip */}
        {currentBook ? (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface border border-subtle text-primary-text shadow-xs">
            <BookOpen className="size-3.5 text-primary-text shrink-0" />
            <button
              type="button"
              onClick={() => openBookForReading(currentBook)}
              dir="auto"
              className="font-medium truncate max-w-[200px] hover:underline cursor-pointer"
            >
              {currentBook.title}
            </button>
            <button
              type="button"
              onClick={() => {
                setWorkId('');
                setIsDirty(true);
              }}
              title={t('notesDetachSource')}
              aria-label={t('notesDetachSource')}
              className="p-0.5 text-muted hover:text-danger rounded hover:bg-canvas transition-colors"
            >
              <FolderMinus className="size-3" />
            </button>
          </div>
        ) : (
          <label className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-dashed border-subtle text-muted hover:border-border text-xs cursor-pointer">
            <BookOpen className="size-3 text-muted" />
            <select
              aria-label={t('notesSourceAttached')}
              value={workId}
              onChange={(e) => {
                setWorkId(e.target.value);
                setIsDirty(true);
              }}
              className="bg-transparent text-xs text-muted outline-none cursor-pointer max-w-[140px] truncate"
            >
              <option value="">{t('dashScratchpadAttachBook')}</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Tags Chips */}
        {tagsList.map((tag) => (
          <Chip
            key={tag}
            label={`#${tag}`}
            removable
            onRemove={() => handleRemoveTag(tag)}
            icon={<Tag className="size-3" />}
          />
        ))}

        {/* Add Tag inline form */}
        {addingTag ? (
          <span className="inline-flex items-center gap-1 bg-surface border border-subtle rounded-lg px-2 py-0.5">
            <input
              type="text"
              autoFocus
              value={newTagVal}
              onChange={(e) => setNewTagVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                } else if (e.key === 'Escape') {
                  setAddingTag(false);
                  setNewTagVal('');
                }
              }}
              placeholder={t('addTagPlaceholder')}
              className="w-16 bg-transparent text-xs text-main outline-none"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="text-xs text-primary-text font-bold"
             aria-label={t('bulkAddTagsBtn')}>
              ✓
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingTag(false);
                setNewTagVal('');
              }}
              className="text-muted"
             aria-label={t('cancel')}>
              <X className="size-3" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAddingTag(true)}
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-main px-2 py-1 rounded-lg hover:bg-surface border border-transparent hover:border-subtle transition-colors"
          >
            <Plus className="size-3" />
            <span>{t('tagsTab')}</span>
          </button>
        )}

        {/* Aliases if any */}
        {note?.aliases && note.aliases.length > 0 && (
          <span className="text-[11px] text-muted ms-auto truncate max-w-[180px]" dir="auto">
            {note.aliases.join(' · ')}
          </span>
        )}
      </div>

      {/* Editor Body */}
      <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-surface">
        {preview ? (
          <div className="max-w-3xl mx-auto py-2">
            <StudyNoteContent
              content={content}
              notes={notes}
              onOpen={(target) => {
                const parts = target.split(':');
                if (parts[0] === 'book') {
                  const b = books.find((book) => book.id === parts[1]);
                  if (b) openBookForReading(b);
                }
              }}
              t={t}
            />
          </div>
        ) : (
          <div
            className="max-w-3xl mx-auto min-h-full"
            style={{
              fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)",
            }}
          >
            <StudyNoteEditor
              ref={editorRef}
              value={content}
              onChange={(newVal) => {
                contentRef.current = newVal;
                setContent(newVal);
                setIsDirty(true);
              }}
              dir={effectiveDir}
              ariaLabel={title || t('dashScratchpadGeneralNote')}
              placeholder={t('dashScratchpadPlaceholder')}
              notes={notes}
              books={books}
              kindLabels={kindLabels}
              relationLabels={relationLabels(t)}
              currentNoteId={note?.id}
              slashLabels={slashLabels}
              searchCorpus={(kinds, q) => searchCorpus(kinds, q, (id) => t(collectionKeys[id]))}
              dateText={() => {
                const today = new Date();
                const hijri = calculateHijriDate(today);
                return `${today.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
                  dateStyle: 'long',
                })} — ${lang === 'ar' ? hijri.formattedAr : hijri.formattedEn}`;
              }}
              onSave={() => void handleSave()}
            />
          </div>
        )}
      </main>
    </div>
  );
};
