'use client';

import React, { useEffect, useState } from 'react';
import {
  Columns3,
  ExternalLink,
  FileText,
  Layers,
  LayoutGrid,
  Link2,
  Maximize,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import type { Manuscript, ManuscriptDocument, ManuscriptMode } from '../../../shared/manuscripts';
import type { BoardSummary } from '../../../shared/boards';
import { useWorkspace } from '../context/WorkspaceContext';

interface Props {
  document?: ManuscriptDocument;
  manuscript?: Manuscript;
  mode: ManuscriptMode;
  onModeChange: (mode: ManuscriptMode) => void | Promise<void>;
  onArrangeSources: (options?: { lang?: 'ar' | 'en' }) => Promise<{ arranged: boolean; counts: Record<string, number> }>;
  onUndoArrange: () => Promise<boolean>;
  onInsertKanban: () => Promise<string>;
  onManuscriptUpdate?: () => void | Promise<void>;
}

export function ResearchCanvasBar({
  manuscript,
  mode,
  onModeChange,
  onArrangeSources,
  onUndoArrange,
  onInsertKanban,
  onManuscriptUpdate,
}: Props) {
  const { t, lang, setViewMode } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showBoardPicker, setShowBoardPicker] = useState(false);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);

  // Parse linked board from manuscript settings_json
  let linkedBoardId: string | null = null;
  if (manuscript?.settings_json) {
    try {
      const parsed = JSON.parse(manuscript.settings_json) as { linkedBoardId?: string | null };
      if (typeof parsed.linkedBoardId === 'string') linkedBoardId = parsed.linkedBoardId;
    } catch {}
  }

  // Load boards when picker is opened or to find the linked board title
  useEffect(() => {
    let cancelled = false;
    void window.electronAPI.boards.list().then(list => {
      if (!cancelled) setBoards(list);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [linkedBoardId]);

  const linkedBoard = linkedBoardId ? boards.find(b => b.id === linkedBoardId) : null;

  const handleModeToggle = async (targetMode: ManuscriptMode) => {
    if (mode === targetMode || busy) return;
    setBusy(true);
    try {
      await onModeChange(targetMode);
    } finally {
      setBusy(false);
    }
  };

  const handleArrange = async () => {
    if (busy) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const result = await onArrangeSources({ lang });
      if (result.arranged) {
        setStatusMsg(t('editorArrangeSuccess'));
      } else {
        setStatusMsg(t('editorArrangeNoSources'));
      }
    } catch {
      setStatusMsg(t('manuscriptError'));
    } finally {
      setBusy(false);
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  const handleUndo = async () => {
    if (busy) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      await onUndoArrange();
    } catch {
      setStatusMsg(t('manuscriptError'));
    } finally {
      setBusy(false);
    }
  };

  const handleKanban = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onInsertKanban();
    } finally {
      setBusy(false);
    }
  };

  const handleOpenLinkedBoard = () => {
    if (!linkedBoardId) return;
    // Store requested board ID for BoardsWorkspace to open directly
    try {
      sessionStorage.setItem('baglib:active-board-id', linkedBoardId);
    } catch {}
    setViewMode('notes');
    try {
      window.dispatchEvent(new CustomEvent('baglib:open-boards'));
    } catch {}
  };

  const handleLinkBoard = async (boardId: string) => {
    if (!manuscript) return;
    setBusy(true);
    try {
      await window.electronAPI.manuscripts.updateSettings(manuscript.id, { linkedBoardId: boardId });
      setShowBoardPicker(false);
      await onManuscriptUpdate?.();
    } finally {
      setBusy(false);
    }
  };

  const handleUnlinkBoard = async () => {
    if (!manuscript) return;
    setBusy(true);
    try {
      await window.electronAPI.manuscripts.updateSettings(manuscript.id, { linkedBoardId: null });
      await onManuscriptUpdate?.();
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAndLinkBoard = async () => {
    if (!manuscript) return;
    setBusy(true);
    try {
      const boardTitle = `${manuscript.title} — ${t('navNotesBoards')}`;
      const newBoard = await window.electronAPI.boards.save({
        id: crypto.randomUUID(),
        title: boardTitle,
        preset: 'blank',
        items: [],
        edges: [],
        expectedRevision: 0,
      });
      await window.electronAPI.manuscripts.updateSettings(manuscript.id, { linkedBoardId: newBoard.id });
      setShowBoardPicker(false);
      await onManuscriptUpdate?.();
    } finally {
      setBusy(false);
    }
  };

  const openPicker = async () => {
    setLoadingBoards(true);
    setShowBoardPicker(true);
    try {
      const list = await window.electronAPI.boards.list();
      setBoards(list);
    } finally {
      setLoadingBoards(false);
    }
  };

  return (
    <div className="research-canvas-bar" role="toolbar" aria-label="Research Canvas Controls">
      {/* View Mode Toggle: Document / Canvas */}
      <div className="canvas-bar-group mode-toggle-group canvas-mode-toggle">
        <button
          type="button"
          data-action="mode-page" className={`canvas-bar-btn mode-btn ${mode === 'page' ? 'active' : ''}`}
          onClick={() => void handleModeToggle('page')}
          disabled={busy}
          aria-pressed={mode === 'page'}
          title={t('editorModeDocument')}
        >
          <FileText className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t('editorModeDocument')}</span>
        </button>
        <button
          type="button"
          data-action="mode-canvas" className={`canvas-bar-btn mode-btn ${mode === 'edgeless' ? 'active' : ''}`}
          onClick={() => void handleModeToggle('edgeless')}
          disabled={busy}
          aria-pressed={mode === 'edgeless'}
          title={t('editorModeCanvas')}
        >
          <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t('editorModeCanvas')}</span>
        </button>
      </div>

      <div className="canvas-bar-divider" />

      {/* Canvas Actions */}
      <div className="canvas-bar-group actions-group">
        <button
          type="button"
          data-action="arrange-sources" className="canvas-bar-btn action-btn arrange-btn"
          onClick={() => void handleArrange()}
          disabled={busy}
          title={t('editorArrangeSources')}
        >
          <Layers className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t('editorArrangeSources')}</span>
        </button>
        <button
          type="button"
          data-action="undo-arrange" className="canvas-bar-btn action-btn undo-btn"
          onClick={() => void handleUndo()}
          disabled={busy}
          title={t('editorUndoArrange')}
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t('editorUndoArrange')}</span>
        </button>
        {mode === 'edgeless' && (
          <button
            type="button"
            className="canvas-bar-btn action-btn fit-btn"
            onClick={() => {
              try {
                const iframe = typeof window !== 'undefined' ? window.document.querySelector('.research-editor-frame') as HTMLIFrameElement | null : null;
                const win = iframe?.contentWindow as { __baglibResearchEditor?: { fitToScreen?: () => void } } | null;
                win?.__baglibResearchEditor?.fitToScreen?.();
              } catch {}
            }}
            disabled={busy}
            title={t('editorFitToScreen')}
          >
            <Maximize className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('editorFitToScreen')}</span>
          </button>
        )}
        <button
          type="button"
          data-action="tasks-kanban" className="canvas-bar-btn action-btn kanban-btn"
          onClick={() => void handleKanban()}
          disabled={busy}
          title={t('editorInsertKanban')}
        >
          <Columns3 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t('editorInsertKanban')}</span>
        </button>
      </div>

      <div className="canvas-bar-divider" />

      {/* R6 Decision: Linked Study Board */}
      <div className="canvas-bar-group board-group">
        {linkedBoard ? (
          <div className="linked-board-badge" title={linkedBoard.title} aria-label={t('editorLinkedBoard')}>
            <Link2 className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
            <button
              type="button"
              data-action="open-linked-board" className="linked-board-open-btn open-board-link"
              onClick={handleOpenLinkedBoard}
              title={t('editorOpenLinkedBoard')}
            >
              <span className="linked-board-name">{linkedBoard.title}</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-action="unlink-board" className="linked-board-unlink-btn"
              onClick={() => void handleUnlinkBoard()}
              disabled={busy}
              title={t('editorUnlinkBoard')}
              aria-label={t('editorUnlinkBoard')}
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-action="link-board" className="canvas-bar-btn link-board-btn"
            onClick={() => void openPicker()}
            disabled={busy}
            title={t('editorLinkBoard')}
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('editorLinkBoard')}</span>
          </button>
        )}
      </div>

      {statusMsg && (
        <span className="canvas-bar-status" role="status" aria-live="polite">
          {statusMsg}
        </span>
      )}

      {/* Board Picker Modal / Dropdown */}
      {showBoardPicker && (
        <div className="canvas-board-picker-backdrop board-picker-modal" onClick={() => setShowBoardPicker(false)}>
          <div
            className="canvas-board-picker-card"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label={t('editorSelectBoardToLink')}
          >
            <div className="picker-header">
              <h3>{t('editorSelectBoardToLink')}</h3>
              <button
                type="button"
                className="picker-close-btn"
                onClick={() => setShowBoardPicker(false)}
                aria-label={t('cancel')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="picker-body">
              {loadingBoards ? (
                <p className="picker-loading">{t('loading')}</p>
              ) : boards.length === 0 ? (
                <p className="picker-empty">{t('editorNoLinkedBoard')}</p>
              ) : (
                <ul className="picker-list">
                  {boards.map(board => (
                    <li key={board.id} className="picker-item">
                      <button
                        type="button"
                        className="picker-board-btn"
                        onClick={() => void handleLinkBoard(board.id)}
                      >
                        <span className="board-title">{board.title}</span>
                        <span className="board-items-count">
                          {board.items} {t('plannerTasks')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="picker-footer">
              <button
                type="button"
                data-action="create-and-link-board" className="picker-create-btn"
                onClick={() => void handleCreateAndLinkBoard()}
                disabled={busy}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('editorCreateAndLinkBoard')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
