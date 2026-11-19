'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Manuscript, ManuscriptDocument, ManuscriptMode } from '../../../shared/manuscripts';
import { extractDocumentHeadings } from '../../../shared/manuscript-headings';
import type { ManuscriptTemplate } from '../../../shared/manuscript-templates';
import { createResearchSourceSearch } from './source-search';
import { researchSettings } from '../../../shared/research-editor-apparatus';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { translations } from '../../translations';
import { collectionKeys } from '../../utils/sunnah-collections';
import { useOptionalTab, useWorkspace } from '../context/WorkspaceContext';
import { createResearchEditorHost, shouldForwardEditorShortcut } from './editor-host';
import { registerEditorLeave } from './editor-leave';
import { registerCloseGuard } from '../../utils/close-guard';
import type { ResearchEditorBridge } from '../../../shared/research-editor';
import { ResearchSidebar } from './ResearchSidebar';
import { ResearchTopBar } from './ResearchTopBar';
import { ResearchEdgelessBar } from './ResearchEdgelessBar';
import { ResearchOutlineRail } from './ResearchOutlineRail';
import { useAssistant } from '../ai/AssistantContext';
import { ResearchInfoDrawer } from './ResearchInfoDrawer';
import { ResearchHistoryModal } from './ResearchHistoryModal';
import { ResearchTemplateModal } from './ResearchTemplateModal';
import { ResearchExportModal } from './ResearchExportModal';
import { ResearchImportModal } from './ResearchImportModal';
import type { BoardSummary } from '../../../shared/boards';
import { X, Plus } from 'lucide-react';
import './research-editor.css';
import { MANUSCRIPT_OPEN_EVENT, consumeOpenManuscriptDocument, setOpenManuscriptDocument } from '../../../shared/manuscript-transfer';

declare global {
  interface Window {
    __baglibResearchEditorBridge?: ResearchEditorBridge;
  }
}

const favouritesStorageKey = 'baglib_research_favourites';

function loadFavourites(): string[] {
  try {
    const raw = localStorage.getItem(favouritesStorageKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveFavourites(ids: string[]): void {
  try {
    localStorage.setItem(favouritesStorageKey, JSON.stringify(ids));
  } catch {}
}

export function ResearchEditorView() {
  const { lang, dir, theme, t, books, openBookForReading } = useWorkspace();
  // KEY-423 review: each manuscript tab registers its own leave guard, so closing a background tab can ask it.
  const tabId = useOptionalTab()?.id;
  const current = useRef({ books, lang, openBookForReading });
  useLayoutEffect(() => {
    current.current = { books, lang, openBookForReading };
  }, [books, lang, openBookForReading]);

  const [error, setError] = useState(false);
  const [opened, setOpened] = useState(false);
  const [activeDoc, setActiveDoc] = useState<ManuscriptDocument | undefined>(undefined);
  const [activeManuscript, setActiveManuscript] = useState<Manuscript | undefined>(undefined);
  const [docMode, setDocMode] = useState<ManuscriptMode>('page');
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  // Shell State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPresentation, setIsPresentation] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [favourites, setFavourites] = useState<string[]>(() => loadFavourites());

  // Study Board Picker State (from KEY-368)
  const [isBoardPickerOpen, setIsBoardPickerOpen] = useState(false);
  const [boards, setBoards] = useState<BoardSummary[]>([]);

  const toggleFavourite = (id: string) => {
    setFavourites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      saveFavourites(next);
      return next;
    });
  };

  const [host] = useState(() =>
    createResearchEditorHost(
      window.electronAPI.manuscripts,
      window.electronAPI.researchEditor.blobs,
      { lang, dir, theme, fontScale: 1 },
      () => setError(true)
    )
  );
  useEffect(() => { setOpenManuscriptDocument(activeDoc?.id, (kind, props) => host.insertSource(kind, props)); return () => setOpenManuscriptDocument(null); }, [activeDoc?.id, host]);
  // KEY-384: the app-wide assistant sees the open chapter, its selection, and can insert answers into it.
  const { registerPage } = useAssistant();
  const chapterId = ready && opened ? activeDoc?.id : undefined;
  const chapterTitle = activeDoc?.title ?? '';
  useEffect(() => {
    if (!chapterId) return;
    return registerPage({ label: chapterTitle, chapterId, selectedText: () => host.selectedText(), insert: text => host.insertParagraphs(text), flush: () => host.bridge.explicitSave() });
  }, [chapterId, chapterTitle, host, registerPage]);

  const listApi = useMemo(
    () => ({
      ...window.electronAPI.manuscripts,
      renameDocument: host.renameDocument,
      async trashDocument(id: string) {
        if (host.activeDocument()?.id === id) {
          await host.close();
          setOpened(false);
          setActiveDoc(undefined);
        }
        await window.electronAPI.manuscripts.trashDocument(id);
      },
      async trash(id: string) {
        if (host.activeDocument()?.manuscript_id === id) {
          await host.close();
          setOpened(false);
          setActiveDoc(undefined);
          setActiveManuscript(undefined);
        }
        await window.electronAPI.manuscripts.trash(id);
      },
    }),
    [host]
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    const update = () =>
      host.appearance({
        lang,
        dir,
        theme,
        fontScale: Number.parseFloat(getComputedStyle(root).fontSize) / 16 || 1,
      });
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['style', 'class'] });
    return () => observer.disconnect();
  }, [host, lang, dir, theme]);

  useLayoutEffect(() => {
    window.__baglibResearchEditorBridge = {
      ...host.bridge,
      settings: {
        async load(id) {
          const manuscript = (await window.electronAPI.manuscripts.list()).find(m => m.id === id);
          if (!manuscript) throw new Error('invalid-request');
          return researchSettings(JSON.parse(manuscript.settings_json));
        },
        save: (id, settings) => window.electronAPI.manuscripts.updateSettings(id, settings),
      },
      // KEY-372: live note embeds read the note from Notes; nothing is copied into the manuscript.
      notes: {
        async list() {
          return (await window.electronAPI.studyNotes.list()).map(note => ({ id: note.id, title: note.title, content: note.content }));
        },
        async get(id) {
          const note = (await window.electronAPI.studyNotes.list()).find(item => item.id === id);
          return note ? { id: note.id, title: note.title, content: note.content } : null;
        },
        async open(id) {
          await host.bridge.explicitSave();
          openStudyNote({ id });
        },
        subscribe(listener) {
          window.addEventListener('baglib:notes-changed', listener);
          return () => window.removeEventListener('baglib:notes-changed', listener);
        },
      },
      sources: createResearchSourceSearch(
        window.electronAPI,
        () => current.current.books,
        async url => {
          await host.bridge.explicitSave();
          await navigateStudyReference(
            url,
            current.current.books,
            book => current.current.openBookForReading(book),
            (id, anchor) => openStudyNote({ id, anchor })
          );
        },
        id => {
          const key = collectionKeys[id as keyof typeof collectionKeys];
          return key ? translations[current.current.lang][key] : id;
        }
      ),
      async connect(session) {
        await host.bridge.connect(session);
        setReady(true);
      },
    };

    const leave = async () => {
      try {
        await host.close();
        return true;
      } catch {
        setError(true);
        return false;
      }
    };

    const removeLeave = registerEditorLeave(leave, tabId);
    const removeClose = registerCloseGuard(async () => {
      window.electronAPI.appClose.hold();
      return leave();
    });

    return () => {
      removeLeave();
      removeClose();
      delete window.__baglibResearchEditorBridge;
      void host.close().then(() => host.dispose()).catch(() => setError(true));
    };
  }, [host, tabId]);

  useEffect(() => {
    const child = frame.current?.contentWindow;
    if (!ready || !child) return;
    const forward = (event: KeyboardEvent) => {
      if (!shouldForwardEditorShortcut(event)) return;
      const copy = new KeyboardEvent('keydown', {
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(copy);
      if (copy.defaultPrevented) event.preventDefault();
    };
    child.addEventListener('keydown', forward);
    return () => child.removeEventListener('keydown', forward);
  }, [ready]);

  const handleOpenDocument = async (value: ManuscriptDocument) => {
    setError(false);
    setActiveDoc(value);
    setDocMode(value.primary_mode || 'page');
    try {
      const list = await window.electronAPI.manuscripts.list();
      setActiveManuscript(list.find(m => m.id === value.manuscript_id));
    } catch {}
    await host.open(value);
    setOpened(true);
  };

  // KEY-372: a chapter requested from elsewhere (a note's "Used in manuscripts") opens once the editor is ready.
  useEffect(() => {
    if (!ready) return;
    const run = () => {
      const id = consumeOpenManuscriptDocument();
      if (!id) return;
      void window.electronAPI.manuscripts.document(id).then(handleOpenDocument).catch(() => setError(true));
    };
    run();
    window.addEventListener(MANUSCRIPT_OPEN_EVENT, run);
    return () => window.removeEventListener(MANUSCRIPT_OPEN_EVENT, run);
  }, [ready]);

  const handleModeChange = async (newMode: ManuscriptMode) => {
    setDocMode(newMode);
    await host.setMode(newMode);
  };

  const handleRenameDocument = async (title: string) => {
    if (!activeDoc) return;
    await host.renameDocument(activeDoc.id, title);
    const updated = await window.electronAPI.manuscripts.document(activeDoc.id);
    setActiveDoc(updated);
  };

  const handleDuplicateDocument = async () => {
    if (!activeDoc) return;
    const copy = await window.electronAPI.manuscripts.createDocument(
      activeDoc.manuscript_id,
      `${activeDoc.title} (Copy)`,
      activeDoc.parent_id
    );
    await window.electronAPI.manuscripts.save({
      id: copy.id,
      snapshot: activeDoc.snapshot,
      primary_mode: activeDoc.primary_mode,
    });
    const latest = await window.electronAPI.manuscripts.document(copy.id);
    await handleOpenDocument(latest);
  };

  const handleTrashActiveDoc = async () => {
    if (!activeDoc) return;
    await listApi.trashDocument(activeDoc.id);
  };

  const handleSetDefaultMode = async (mode: ManuscriptMode) => {
    if (!activeDoc) return;
    await window.electronAPI.manuscripts.save({
      id: activeDoc.id,
      snapshot: activeDoc.snapshot,
      primary_mode: mode,
    });
    setDocMode(mode);
    await host.setMode(mode);
    const latest = await window.electronAPI.manuscripts.document(activeDoc.id);
    setActiveDoc(latest);
  };

  const handleExportMarkdown = async () => {
    if (!activeDoc) return;
    try {
      const { markdown } = await host.exportSources();
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeDoc.title || 'manuscript'}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const handleExportHtml = async () => {
    if (!activeDoc) return;
    try {
      const { html } = await host.exportSources();
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeDoc.title || 'manuscript'}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const handleExportPdf = async () => {
    if (!activeManuscript) return;
    try {
      await window.electronAPI.manuscripts.export({
        manuscriptId: activeManuscript.id,
        documentId: activeDoc?.id,
        format: 'pdf',
        saveDialog: true,
      });
    } catch {}
  };

  const handleExportDocx = async () => {
    if (!activeManuscript) return;
    try {
      await window.electronAPI.manuscripts.export({
        manuscriptId: activeManuscript.id,
        documentId: activeDoc?.id,
        format: 'docx',
        saveDialog: true,
      });
    } catch {}
  };

  const handleSelectTemplate = async (template: ManuscriptTemplate) => {
    try {
      const m = await window.electronAPI.manuscripts.create(template.defaultTitle[lang], template.defaultKind);
      let firstDoc: ManuscriptDocument | null = null;
      for (const ch of template.chapters) {
        const doc = await window.electronAPI.manuscripts.createDocument(m.id, ch[lang]);
        if (!firstDoc) firstDoc = doc;
      }
      if (firstDoc) {
        await handleOpenDocument(firstDoc);
      }
    } catch {}
  };

  // Study Board Linking
  useEffect(() => {
    if (isBoardPickerOpen) {
      void window.electronAPI.boards.list().then(setBoards).catch(() => {});
    }
  }, [isBoardPickerOpen]);

  const handleLinkBoard = async (boardId: string | null) => {
    if (!activeManuscript) return;
    try {
      await window.electronAPI.manuscripts.updateSettings(activeManuscript.id, { linkedBoardId: boardId });
      const list = await window.electronAPI.manuscripts.list();
      setActiveManuscript(list.find(m => m.id === activeManuscript.id));
      setIsBoardPickerOpen(false);
    } catch {}
  };

  const headings = useMemo(() => {
    return activeDoc ? extractDocumentHeadings(activeDoc.snapshot) : [];
  }, [activeDoc]);

  return (
    <section
      className={`research-editor-view ${isPresentation ? 'presentation-mode' : ''}`}
      dir={dir}
      aria-label={t('navEditor')}
    >
      {/* 1. AFFiNE-style Editor Sidebar */}
      <ResearchSidebar
        language={lang}
        api={listApi}
        activeManuscriptId={activeDoc?.manuscript_id}
        activeDocumentId={activeDoc?.id}
        onOpenDocument={handleOpenDocument}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        favourites={favourites}
        onToggleFavourite={toggleFavourite}
        onOpenTemplates={() => setIsTemplatesOpen(true)}
        onOpenImport={() => setIsImportModalOpen(true)}
      />

      {/* Editor Document Area */}
      <div className="research-editor-document">
        {/* 2. AFFiNE Top Bar */}
        {opened && activeDoc && (
          <ResearchTopBar
            language={lang}
            document={activeDoc}
            manuscript={activeManuscript}
            mode={docMode}
            onModeChange={handleModeChange}
            onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            isSidebarCollapsed={isSidebarCollapsed}
            isFavourite={favourites.includes(activeDoc.id)}
            onToggleFavourite={() => toggleFavourite(activeDoc.id)}
            onOpenInfo={() => setIsInfoOpen(true)}
            onOpenToc={() => setIsTocOpen(!isTocOpen)}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onRename={handleRenameDocument}
            onDuplicate={handleDuplicateDocument}
            onTrash={handleTrashActiveDoc}
            onExportMarkdown={handleExportMarkdown}
            onExportHtml={handleExportHtml}
            onExportPdf={handleExportPdf}
            onExportDocx={handleExportDocx}
            onOpenExportModal={() => setIsExportModalOpen(true)}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onTogglePresentation={() => setIsPresentation(!isPresentation)}
            isPresentation={isPresentation}
            onToggleRightPanel={() => {
              setIsRightPanelOpen(!isRightPanelOpen);
              setIsTocOpen(!isRightPanelOpen);
            }}
            isRightPanelOpen={isRightPanelOpen}
            onSetDefaultMode={handleSetDefaultMode}
          />
        )}

        {error && <p role="alert">{t('manuscriptError')}</p>}
        {!ready && <p role="status">{t('manuscriptLoading')}</p>}
        {ready && !opened && <p>{t('editorSelectChapter')}</p>}

        {/* 3. AFFiNE Edgeless Floating Toolbar + Zoom Controls (Edgeless Mode) */}
        {ready && opened && activeDoc && docMode === 'edgeless' && (
          <ResearchEdgelessBar
            language={lang}
            onFitScreen={() => void host.fitToScreen()}
            onInsertKanban={() => host.insertKanban()}
            onArrangeSources={async () => {
              const res = await host.arrangeSources({ lang });
              if (res.arranged) setDocMode('edgeless');
              return res;
            }}
            onUndoArrange={async () => {
              const res = await host.undoArrange();
              if (res) setDocMode('page');
              return res;
            }}
            onLinkBoard={() => setIsBoardPickerOpen(true)}
            zoomLevel={zoomLevel}
            onZoomIn={() => setZoomLevel(z => Math.min(300, z + 20))}
            onZoomOut={() => setZoomLevel(z => Math.max(20, z - 20))}
          />
        )}

        {/* 4. Table of Contents Right-Edge Rail & Popover */}
        {ready && opened && activeDoc && (
          <ResearchOutlineRail
            language={lang}
            headings={headings}
            onSelectHeading={id => host.scrollToBlock(id)}
            isOpen={isTocOpen}
            onToggleOpen={() => setIsTocOpen(!isTocOpen)}
          />
        )}

        {/* 5. The AI assistant is app-wide (KEY-384); this view gives it the open chapter (see registerPage above). */}

        {/* BlockSuite Offline Editor Frame */}
        <iframe
          ref={frame}
          title={t('navEditor')}
          src="/research-editor/index.html"
          className={ready && opened ? 'research-editor-frame ready' : 'research-editor-frame'}
        />
      </div>

      {/* Auxiliary Drawers and Modals */}
      <ResearchInfoDrawer
        language={lang}
        isOpen={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
        document={activeDoc}
        manuscript={activeManuscript}
      />

      <ResearchHistoryModal
        language={lang}
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        document={activeDoc}
        api={window.electronAPI.manuscripts}
        onRestored={handleOpenDocument}
      />

      <ResearchTemplateModal
        language={lang}
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        onSelectTemplate={handleSelectTemplate}
      />

      {activeManuscript && (
        <ResearchExportModal
          language={lang}
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          manuscript={activeManuscript}
          currentDocument={activeDoc}
        />
      )}

      {activeManuscript && (
        <ResearchImportModal
          language={lang}
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          manuscript={activeManuscript}
          onImportSuccess={doc => {
            void handleOpenDocument(doc);
          }}
        />
      )}

      {/* Study Board Picker Modal */}
      {isBoardPickerOpen && (
        <div
          className="canvas-board-picker-backdrop"
          onClick={() => setIsBoardPickerOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="canvas-board-picker-card" onClick={e => e.stopPropagation()}>
            <div className="picker-header">
              <h3>{t('editorSelectBoardToLink')}</h3>
              <button
                type="button"
                className="picker-close-btn"
                onClick={() => setIsBoardPickerOpen(false)}
                aria-label={t('researchAiClose')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="picker-body">
              {boards.length === 0 ? (
                <p className="text-xs text-text-muted">{t('editorNoLinkedBoard')}</p>
              ) : (
                <ul className="picker-list">
                  {boards.map(b => (
                    <li key={b.id}>
                      <button
                        type="button"
                        className="picker-board-btn"
                        onClick={() => void handleLinkBoard(b.id)}
                      >
                        <span className="board-title">{b.title}</span>
                        <span className="board-items-count">
                          {b.items} {t('boardsItems', { count: b.items })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="picker-footer flex items-center justify-between">
              <button
                type="button"
                onClick={() => void handleLinkBoard(null)}
                className="text-xs text-rose-500 hover:underline"
              >
                {t('editorUnlinkBoard')}
              </button>
              <button
                type="button"
                className="picker-create-btn"
                onClick={async () => {
                  try {
                    const title = activeManuscript?.title ? `${activeManuscript.title} Board` : 'Study Board';
                    const newId = crypto.randomUUID();
                    await window.electronAPI.boards.save({
                      id: newId,
                      title,
                      preset: 'blank',
                      items: [],
                      edges: [],
                      expectedRevision: 0,
                    });
                    await handleLinkBoard(newId);
                  } catch {}
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('editorCreateAndLinkBoard')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
