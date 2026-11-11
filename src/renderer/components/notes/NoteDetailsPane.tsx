'use client';

import React, { useState } from 'react';
import {
  CornerDownRight,
  History,
  Link as LinkIcon,
  HelpCircle,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { IconButton } from '../ui/Button';
import { NoteHistory } from './NoteHistory';
import { KnowledgeTools } from './KnowledgeTools';
import { studyBacklinks, studyLinks, studyNoteExcerpt, type StudyNote } from '../../../shared/study-notes';

export interface NoteDetailsPaneProps {
  note: StudyNote;
  notes: StudyNote[];
  onOpenTarget: (target: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}

export const NoteDetailsPane: React.FC<NoteDetailsPaneProps> = ({
  note,
  notes,
  onOpenTarget,
  onRefresh,
  onClose,
}) => {
  const { t, dir } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'links' | 'history' | 'questions'>('links');

  const backlinks = studyBacklinks(notes, `note:${note.id}`);
  const outgoingLinks = [...new Map(studyLinks(note.content).map((link) => [link.target, link])).values()];

  return (
    <aside
      data-note-details-pane
      className="w-72 lg:w-80 shrink-0 border-s border-subtle bg-surface flex flex-col min-h-0 select-text overflow-hidden"
      dir={dir}
    >
      {/* Pane Header */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-subtle bg-surface">
        <div className="flex items-center gap-2">
          <LinkIcon className="size-4 text-primary-text" />
          <h3 className="font-display font-bold text-sm text-main">{t('notesPanelDetails')}</h3>
        </div>

        <IconButton
          size="sm"
          label={t('close')}
          onClick={onClose}
        >
          <X className="size-4" />
        </IconButton>
      </div>

      {/* Internal Tabs */}
      <div className="shrink-0 flex border-b border-subtle bg-canvas/60 p-1 gap-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('links')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'links'
              ? 'bg-surface text-main shadow-xs'
              : 'text-muted hover:text-main'
          }`}
        >
          <LinkIcon className="size-3.5" />
          <span>{t('studyLinkedNotes')}</span>
          {(backlinks.length > 0 || outgoingLinks.length > 0) && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-canvas text-muted tabular-nums">
              {backlinks.length + outgoingLinks.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'history'
              ? 'bg-surface text-main shadow-xs'
              : 'text-muted hover:text-main'
          }`}
        >
          <History className="size-3.5" />
          <span>{t('waveHistory')}</span>
        </button>

        <button
          type="button"
          data-tab-questions
          onClick={() => setActiveTab('questions')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'questions'
              ? 'bg-surface text-main shadow-xs'
              : 'text-muted hover:text-main'
          }`}
        >
          <HelpCircle className="size-3.5" />
          <span>{t('waveQuestions')}</span>
        </button>
      </div>

      {/* Pane Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5 text-xs break-words">
        {activeTab === 'links' && (
          <>
            {/* Incoming Backlinks */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-main flex items-center gap-1.5">
                  <CornerDownRight className="size-3.5 text-primary-text rtl:-scale-x-100" />
                  <span>{t('studyBacklinks')}</span>
                </h4>
                <span className="text-muted tabular-nums text-[11px]">{backlinks.length}</span>
              </div>

              {backlinks.length === 0 ? (
                <p className="text-muted text-[11px] py-1">{t('notesNoLinks')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {backlinks.map((link) => (
                    <li key={link.id}>
                      <button
                        type="button"
                        onClick={() => onOpenTarget(`note:${link.id}`)}
                        dir="auto"
                        className="w-full text-start p-2 rounded-lg bg-canvas hover:bg-canvas/80 border border-subtle transition-colors group cursor-pointer block"
                      >
                        <span className="block font-medium text-main group-hover:text-primary-text truncate">
                          {link.title || t('dashScratchpadGeneralNote')}
                        </span>
                        <span className="block text-[11px] text-muted truncate mt-0.5 line-clamp-1">
                          {studyNoteExcerpt(link.content, 80)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Outgoing References */}
            <section className="space-y-2.5 border-t border-subtle/80 pt-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-main flex items-center gap-1.5">
                  <LinkIcon className="size-3.5 text-amber-500" />
                  <span>{t('studyReferences')}</span>
                </h4>
                <span className="text-muted tabular-nums text-[11px]">{outgoingLinks.length}</span>
              </div>

              {outgoingLinks.length === 0 ? (
                <p className="text-muted text-[11px] py-1">{t('notesNoLinks')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {outgoingLinks.map((link) => (
                    <li key={link.target}>
                      <button
                        type="button"
                        onClick={() => onOpenTarget(link.target)}
                        dir="auto"
                        className="w-full text-start p-2 rounded-lg bg-canvas hover:bg-canvas/80 border border-subtle transition-colors group cursor-pointer block"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-primary-text truncate group-hover:underline">
                            {link.label || link.target}
                          </span>
                        </div>
                        {link.relation && (
                          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary-text">
                            {link.relation}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <NoteHistory id={note.id} onChanged={onRefresh} />
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="space-y-4">
            <KnowledgeTools />
          </div>
        )}
      </div>
    </aside>
  );
};
