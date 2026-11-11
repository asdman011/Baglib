'use client';

import React from 'react';
import { Database, FileText } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useReadiness } from '../../hooks/useReadiness';
import { useStudyNotes } from '../../hooks/useStudyNotes';

export const StatusBar: React.FC = () => {
  const { t, lang, setViewMode, setCommandPaletteOpen, toggleZenMode } = useWorkspace();
  const { notes, loading, error } = useStudyNotes();
  const readiness = useReadiness();
  const checking = Object.values(readiness).some(value => value === null);
  const issues = [!readiness.database && t('feedbackDatabaseUnavailable'), !readiness.index && t('feedbackIndexUnavailable'), !readiness.pdf && t('feedbackPdfUnavailable')].filter(Boolean).join(' \u00b7 ');
  const ready = !checking && !issues;
  const status = t(checking ? 'feedbackChecking' : ready ? 'feedbackReady' : 'feedbackLimited');
  const detail = checking ? status : ready ? t('feedbackReadyDetail') : issues;

  return (
    <footer className="min-h-7 bg-surface border-t border-subtle flex items-center justify-between gap-2 px-3 text-[11px] leading-relaxed text-muted select-none z-20 shrink-0 font-sans">
      {/* Left Items */}
      <div className="flex min-w-0 items-center gap-3">
        {/* Total Book Notes Count */}
        <button type="button" onClick={() => setViewMode('notes')} title={t('navNotes')} className="flex shrink-0 items-center gap-1 rounded py-1 hover:text-main focus-visible:outline-2 focus-visible:outline-focus" aria-label={t('navNotes')}>
          <FileText className="w-3 h-3 text-primary-text" />
          <span>{loading ? t('studyLoadingNotes') : error ? t('studyNotesUnavailable') : `${notes.length.toLocaleString(lang)} ${t('recordedNotes')}`}</span>
        </button>

        <span className="hidden sm:inline text-subtle" aria-hidden="true">•</span>

        {/* Local Indexing Status */}
        <div data-readiness={checking ? 'checking' : ready ? 'ready' : 'limited'} className="flex min-w-0 items-center gap-1.5" title={detail} aria-label={`${status} \u00b7 ${detail}`}>
          <Database className={`w-3 h-3 shrink-0 ${ready ? 'text-success' : 'text-muted'}`} />
          <span className="truncate">{t('localLibraryStorage')} · {status}</span>
        </div>
      </div>

      {/* Right Items */}
      <div className="flex items-center gap-4">
        {/* Active Shortcuts Quick Help */}
        <div className="hidden md:flex items-center gap-2 text-[10px] text-muted">
          <button type="button" onClick={() => setCommandPaletteOpen(true)} className="flex items-center gap-1 rounded hover:text-main focus-visible:outline-2 focus-visible:outline-focus">
            <kbd dir="ltr" className="px-1 py-0.2 rounded bg-canvas border border-subtle font-mono">Ctrl+K</kbd>{' '}
            {t('globalSearch')}
          </button>
          <span>•</span>
          <button type="button" onClick={toggleZenMode} className="flex items-center gap-1 rounded hover:text-main focus-visible:outline-2 focus-visible:outline-focus">
            <kbd dir="ltr" className="px-1 py-0.2 rounded bg-canvas border border-subtle font-mono">F11</kbd>{' '}
            {t('zenModeShort')}
          </button>
        </div>
      </div>
    </footer>
  );
};
