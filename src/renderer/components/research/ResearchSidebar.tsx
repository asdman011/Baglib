'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Manuscript, ManuscriptDocument, ManuscriptKind, ManuscriptsAPI } from '../../../shared/manuscripts';
import { translations } from '../../translations';
import {
  Folder,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Star,
  FileText,
  LayoutTemplate,
  Trash2,
  Pencil,
  ArrowUp,
  ArrowDown,
  X,
  ScrollText,
  Upload,
  RotateCcw,
  PanelLeftClose,
} from 'lucide-react';

interface Props {
  language: 'ar' | 'en';
  api: ManuscriptsAPI;
  activeManuscriptId?: string;
  activeDocumentId?: string;
  onOpenDocument?: (document: ManuscriptDocument) => void | Promise<void>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  favourites: string[];
  onToggleFavourite: (id: string) => void;
  onOpenTemplates: () => void;
}

export function ResearchSidebar({
  language,
  api,
  activeManuscriptId,
  activeDocumentId,
  onOpenDocument,
  isCollapsed,
  onToggleCollapse,
  favourites,
  onToggleFavourite,
  onOpenTemplates,
}: Props) {
  const t = translations[language];
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [documents, setDocuments] = useState<ManuscriptDocument[]>([]);
  const [trashedDocs, setTrashedDocs] = useState<ManuscriptDocument[]>([]);
  const [expandedManuscripts, setExpandedManuscripts] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [showAllDocs, setShowAllDocs] = useState(false);
  const [favouritesOpen, setFavouritesOpen] = useState(true);
  const [organizeOpen, setOrganizeOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // New manuscript inline form
  const [isCreatingManuscript, setIsCreatingManuscript] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<ManuscriptKind>('research');

  // Edit / rename state
  const [editingItem, setEditingItem] = useState<{ id: string; isDoc: boolean; title: string } | null>(null);

  // New chapter inline state
  const [creatingChapterUnder, setCreatingChapterUnder] = useState<{ manuscriptId: string; parentId: string | null } | null>(null);
  const [newChapterTitle, setNewChapterTitle] = useState('');

  const reload = useCallback(async () => {
    try {
      const list = await api.list(showTrash);
      setManuscripts(list);

      // Load documents for all active manuscripts so tree/search/all docs work seamlessly
      const docsPromises = list.map(m => api.documents(m.id, showTrash));
      const docsResults = await Promise.all(docsPromises);
      const allFetchedDocs = docsResults.flat();
      if (showTrash) {
        setTrashedDocs(allFetchedDocs);
      } else {
        setDocuments(allFetchedDocs);
      }
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [api, showTrash]);

  const [prevActiveManuscriptId, setPrevActiveManuscriptId] = useState<string | undefined>(activeManuscriptId);
  if (activeManuscriptId && activeManuscriptId !== prevActiveManuscriptId) {
    setPrevActiveManuscriptId(activeManuscriptId);
    setExpandedManuscripts(prev => new Set([...prev, activeManuscriptId]));
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      await reload();
    });
    return () => { cancelled = true; };
  }, [reload]);

  const toggleManuscriptExpand = (id: string) => {
    setExpandedManuscripts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runOp = async (op: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await op();
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const handleCreateManuscript = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await runOp(async () => {
      const created = await api.create(newTitle.trim(), newKind);
      setNewTitle('');
      setIsCreatingManuscript(false);
      setExpandedManuscripts(prev => new Set([...prev, created.id]));
    });
  };

  const handleCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatingChapterUnder || !newChapterTitle.trim()) return;
    const { manuscriptId, parentId } = creatingChapterUnder;
    await runOp(async () => {
      const doc = await api.createDocument(manuscriptId, newChapterTitle.trim(), parentId);
      setNewChapterTitle('');
      setCreatingChapterUnder(null);
      await onOpenDocument?.(doc);
    });
  };

  // Filtered items
  const query = searchQuery.trim().toLowerCase();
  const filteredManuscripts = manuscripts.filter(m =>
    m.title.toLowerCase().includes(query) ||
    documents.some(d => d.manuscript_id === m.id && d.title.toLowerCase().includes(query))
  );

  const favouriteManuscripts = manuscripts.filter(m => favourites.includes(m.id));
  const favouriteDocuments = documents.filter(d => favourites.includes(d.id));

  // Render chapters tree for a manuscript
  const renderChapterTree = (manuscriptId: string, parentId: string | null = null, level = 1) => {
    const siblings = documents
      .filter(d => d.manuscript_id === manuscriptId && d.parent_id === parentId)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

    if (siblings.length === 0) return null;

    return (
      <ul className="research-sidebar-tree" style={{ paddingInlineStart: level > 1 ? '14px' : '0' }}>
        {siblings.map((doc, idx) => {
          const isActive = activeDocumentId === doc.id;
          const isFav = favourites.includes(doc.id);
          const hasChildren = documents.some(d => d.parent_id === doc.id);

          return (
            <li key={doc.id} className="research-sidebar-tree-node">
              <div
                className={`research-sidebar-tree-row ${isActive ? 'active' : ''}`}
                onClick={() => void onOpenDocument?.(doc)}
              >
                <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-text-muted'}`} />
                <span className="truncate flex-1 text-xs">{doc.title}</span>

                <div className="research-sidebar-row-actions" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => onToggleFavourite(doc.id)}
                    className={`p-1 rounded hover:bg-surface-base text-text-muted ${isFav ? 'text-amber-500 fill-amber-500' : ''}`}
                    title={isFav ? t.researchRemoveFromFavourites : t.researchAddToFavourites}
                    aria-label={isFav ? t.researchRemoveFromFavourites : t.researchAddToFavourites}
                  >
                    <Star className={`w-3 h-3 ${isFav ? 'fill-amber-500 text-amber-500' : ''}`} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreatingChapterUnder({ manuscriptId, parentId: doc.id })}
                    className="p-1 rounded hover:bg-surface-base text-text-muted hover:text-primary"
                    title={t.researchNewChapter}
                    aria-label={t.researchNewChapter}
                  >
                    <Plus className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingItem({ id: doc.id, isDoc: true, title: doc.title })}
                    className="p-1 rounded hover:bg-surface-base text-text-muted hover:text-text-main"
                    title={t.manuscriptRename}
                    aria-label={t.manuscriptRename}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => void runOp(() => api.moveDocument(doc.id, parentId, siblings[idx - 1].position))}
                    className="p-1 rounded hover:bg-surface-base text-text-muted hover:text-text-main disabled:opacity-20"
                    title={t.manuscriptUp}
                    aria-label={t.manuscriptUp}
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    disabled={idx === siblings.length - 1}
                    onClick={() => void runOp(() => api.moveDocument(doc.id, parentId, siblings[idx + 1].position))}
                    className="p-1 rounded hover:bg-surface-base text-text-muted hover:text-text-main disabled:opacity-20"
                    title={t.manuscriptDown}
                    aria-label={t.manuscriptDown}
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void runOp(() => api.trashDocument(doc.id))}
                    className="p-1 rounded hover:bg-surface-base text-text-muted hover:text-rose-500"
                    title={t.manuscriptTrash}
                    aria-label={t.manuscriptTrash}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Inline Sub-chapter creation */}
              {creatingChapterUnder?.manuscriptId === manuscriptId && creatingChapterUnder?.parentId === doc.id && (
                <form onSubmit={handleCreateChapter} className="p-1.5 ms-4 my-1 flex items-center gap-1.5 bg-surface-base rounded-lg border border-primary/40">
                  <input
                    autoFocus
                    type="text"
                    value={newChapterTitle}
                    onChange={e => setNewChapterTitle(e.target.value)}
                    placeholder={t.manuscriptChapterNew}
                    className="flex-1 text-xs px-2 py-1 bg-transparent text-text-main focus:outline-hidden"
                  />
                  <button type="submit" disabled={!newChapterTitle.trim()} className="text-[11px] px-2 py-0.5 rounded bg-primary text-primary-foreground">
                    {t.manuscriptChapterCreate}
                  </button>
                  <button type="button" onClick={() => setCreatingChapterUnder(null)} className="p-1 text-text-muted hover:text-text-main" aria-label={t.manuscriptCancel}>
                    <X className="w-3 h-3" />
                  </button>
                </form>
              )}

              {hasChildren && renderChapterTree(manuscriptId, doc.id, level + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  if (isCollapsed) return null;

  return (
    <aside className="research-sidebar" role="navigation" aria-label={t.researchSidebarTitle}>
      {/* Workspace Header (AFFiNE style) */}
      <div className="research-sidebar-header">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ScrollText className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-xs text-text-main truncate">
            {t.researchSidebarTitle}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsCreatingManuscript(true)}
            className="p-1 rounded-md text-text-muted hover:text-text-main hover:bg-surface-panel transition-colors"
            title={t.researchNewManuscript}
            aria-label={t.researchNewManuscript}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded-md text-text-muted hover:text-text-main hover:bg-surface-panel transition-colors"
            title={t.researchToggleSidebar}
            aria-label={t.researchToggleSidebar}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      <fieldset disabled={busy} className="contents">

      {/* Quick Search Input */}
      <div className="research-sidebar-search">
        <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t.researchSearchDocs}
          className="research-sidebar-search-input"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="p-0.5 rounded text-text-muted hover:text-text-main"
            aria-label={t.manuscriptCancel}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Inline Create Manuscript Form */}
      {isCreatingManuscript && (
        <form onSubmit={handleCreateManuscript} className="p-3 m-2 rounded-xl bg-surface-panel border border-primary/30 flex flex-col gap-2 shadow-xs">
          <input
            autoFocus
            type="text"
            required
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder={t.manuscriptNew}
            className="text-xs px-2.5 py-1.5 rounded bg-surface-base border border-border-subtle text-text-main focus:outline-hidden focus:border-primary"
            maxLength={1000}
          />
          <div className="flex items-center justify-between gap-2">
            <select
              value={newKind}
              onChange={e => setNewKind(e.target.value as ManuscriptKind)}
              className="text-xs px-2 py-1 rounded bg-surface-base border border-border-subtle text-text-main"
              aria-label={t.manuscriptKind}
            >
              <option value="research">{t.manuscriptResearch}</option>
              <option value="book">{t.manuscriptBook}</option>
            </select>
            <div className="flex items-center gap-1.5">
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
              >
                {t.manuscriptCreate}
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingManuscript(false)}
                className="p-1 rounded text-text-muted hover:text-text-main"
                aria-label={t.manuscriptCancel}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Main Navigation Items */}
      <div className="research-sidebar-scrollable flex-1 overflow-y-auto">
        {/* All Docs */}
        <button
          type="button"
          onClick={() => setShowAllDocs(!showAllDocs)}
          className={`research-sidebar-item ${showAllDocs ? 'active' : ''}`}
        >
          <FileText className="w-4 h-4 text-text-muted" />
          <span className="flex-1 text-start">{t.researchAllDocs}</span>
          <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-surface-panel">
            {documents.length}
          </span>
        </button>

        {/* Favourites Section */}
        <div className="research-sidebar-section">
          <button
            type="button"
            onClick={() => setFavouritesOpen(!favouritesOpen)}
            className="research-sidebar-section-toggle"
          >
            {favouritesOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            <span className="flex-1 text-start font-medium text-xs">{t.researchFavourites}</span>
          </button>

          {favouritesOpen && (
            <div className="research-sidebar-section-content">
              {favouriteManuscripts.length === 0 && favouriteDocuments.length === 0 ? (
                <div className="text-[11px] text-text-muted px-4 py-1.5 italic">
                  {t.researchNoFavourites}
                </div>
              ) : (
                <>
                  {favouriteManuscripts.map(m => (
                    <div
                      key={`fav-m-${m.id}`}
                      className="research-sidebar-item"
                      onClick={() => toggleManuscriptExpand(m.id)}
                    >
                      <Folder className="w-3.5 h-3.5 text-amber-500" />
                      <span className="truncate flex-1 text-xs">{m.title}</span>
                    </div>
                  ))}
                  {favouriteDocuments.map(d => (
                    <div
                      key={`fav-d-${d.id}`}
                      className={`research-sidebar-item ${activeDocumentId === d.id ? 'active' : ''}`}
                      onClick={() => void onOpenDocument?.(d)}
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-500" />
                      <span className="truncate flex-1 text-xs">{d.title}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Organize / Folders Section */}
        <div className="research-sidebar-section">
          <button
            type="button"
            onClick={() => setOrganizeOpen(!organizeOpen)}
            className="research-sidebar-section-toggle"
          >
            {organizeOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <Folder className="w-3.5 h-3.5 text-text-muted" />
            <span className="flex-1 text-start font-medium text-xs">{t.researchOrganize}</span>
            <span className="text-[10px] text-text-muted">({filteredManuscripts.length})</span>
          </button>

          {organizeOpen && (
            <div className="research-sidebar-section-content">
              {filteredManuscripts.length === 0 && !loading && (
                <div className="text-[11px] text-text-muted px-4 py-2 italic">
                  {t.manuscriptEmpty}
                </div>
              )}

              {filteredManuscripts.map(m => {
                const isExpanded = expandedManuscripts.has(m.id);
                const isFav = favourites.includes(m.id);

                return (
                  <div key={m.id} className="research-sidebar-manuscript-group">
                    <div
                      className="research-sidebar-manuscript-row"
                      onClick={() => toggleManuscriptExpand(m.id)}
                    >
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          toggleManuscriptExpand(m.id);
                        }}
                        className="p-0.5 text-text-muted hover:text-text-main"
                        aria-label={isExpanded ? t.manuscriptCollapse : t.manuscriptExpand}
                      >
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>

                      <Folder className="w-3.5 h-3.5 text-primary/80 shrink-0" />
                      <span className="truncate flex-1 text-xs font-medium text-text-main">{m.title}</span>

                      <div className="research-sidebar-row-actions" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onToggleFavourite(m.id)}
                          className={`p-1 rounded hover:bg-surface-base text-text-muted ${isFav ? 'text-amber-500 fill-amber-500' : ''}`}
                          title={isFav ? t.researchRemoveFromFavourites : t.researchAddToFavourites}
                          aria-label={isFav ? t.researchRemoveFromFavourites : t.researchAddToFavourites}
                        >
                          <Star className={`w-3 h-3 ${isFav ? 'fill-amber-500 text-amber-500' : ''}`} />
                        </button>

                        <button
                          type="button"
                          onClick={() => setCreatingChapterUnder({ manuscriptId: m.id, parentId: null })}
                          className="p-1 rounded hover:bg-surface-base text-text-muted hover:text-primary"
                          title={t.researchNewChapter}
                          aria-label={t.researchNewChapter}
                        >
                          <Plus className="w-3 h-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingItem({ id: m.id, isDoc: false, title: m.title })}
                          className="p-1 rounded hover:bg-surface-base text-text-muted hover:text-text-main"
                          title={t.manuscriptRename}
                          aria-label={t.manuscriptRename}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() => void runOp(() => api.trash(m.id))}
                          className="p-1 rounded hover:bg-surface-base text-text-muted hover:text-rose-500"
                          title={t.manuscriptTrash}
                          aria-label={t.manuscriptTrash}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Inline chapter creator directly under manuscript */}
                    {creatingChapterUnder?.manuscriptId === m.id && creatingChapterUnder?.parentId === null && (
                      <form onSubmit={handleCreateChapter} className="p-1.5 ms-6 my-1 flex items-center gap-1.5 bg-surface-base rounded-lg border border-primary/40">
                        <input
                          autoFocus
                          type="text"
                          value={newChapterTitle}
                          onChange={e => setNewChapterTitle(e.target.value)}
                          placeholder={t.manuscriptChapterNew}
                          className="flex-1 text-xs px-2 py-1 bg-transparent text-text-main focus:outline-hidden"
                        />
                        <button type="submit" disabled={!newChapterTitle.trim()} className="text-[11px] px-2 py-0.5 rounded bg-primary text-primary-foreground">
                          {t.manuscriptChapterCreate}
                        </button>
                        <button type="button" onClick={() => setCreatingChapterUnder(null)} className="p-1 text-text-muted hover:text-text-main" aria-label={t.manuscriptCancel}>
                          <X className="w-3 h-3" />
                        </button>
                      </form>
                    )}

                    {/* Render child chapters if expanded */}
                    {isExpanded && renderChapterTree(m.id, null)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Scholarly Templates */}
        <button
          type="button"
          onClick={onOpenTemplates}
          className="research-sidebar-item"
        >
          <LayoutTemplate className="w-4 h-4 text-text-muted" />
          <span className="flex-1 text-start">{t.researchTemplates}</span>
        </button>

        {/* Import */}
        <button
          type="button"
          className="research-sidebar-item"
          title={t.researchImport}
        >
          <Upload className="w-4 h-4 text-text-muted" />
          <span className="flex-1 text-start">{t.researchImport}</span>
        </button>

        {/* Trash Section */}
        <button
          type="button"
          onClick={() => setShowTrash(!showTrash)}
          className={`research-sidebar-item ${showTrash ? 'active text-rose-500' : ''}`}
        >
          <Trash2 className="w-4 h-4 text-text-muted" />
          <span className="flex-1 text-start">{t.researchTrash}</span>
        </button>

        {showTrash && (
          <div className="p-2 my-1 rounded-lg bg-surface-base border border-rose-500/20 space-y-1">
            <span className="text-[10px] text-text-muted px-2 block">{t.manuscriptDeletedChapters}</span>
            {trashedDocs.length === 0 && manuscripts.filter(m => m.deleted_at).length === 0 ? (
              <span className="text-[11px] text-text-muted px-2 italic block">{t.manuscriptEmpty}</span>
            ) : (
              <>
                {manuscripts.filter(m => m.deleted_at).map(m => (
                  <div key={`trash-m-${m.id}`} className="flex items-center justify-between p-1.5 rounded hover:bg-surface-panel text-xs">
                    <span className="truncate text-text-muted">{m.title}</span>
                    <button
                      type="button"
                      onClick={() => void runOp(() => api.restore(m.id))}
                      className="p-1 text-primary hover:bg-primary/10 rounded"
                      title={t.manuscriptRestore}
                      aria-label={t.manuscriptRestore}
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {trashedDocs.map(d => (
                  <div key={`trash-d-${d.id}`} className="flex items-center justify-between p-1.5 rounded hover:bg-surface-panel text-xs">
                    <span className="truncate text-text-muted">{d.title}</span>
                    <button
                      type="button"
                      onClick={() => void runOp(() => api.restoreDocument(d.id))}
                      className="p-1 text-primary hover:bg-primary/10 rounded"
                      title={t.manuscriptRestore}
                      aria-label={t.manuscriptRestore}
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Editing / Renaming Modal or Inline Sheet */}
      {editingItem && (
        <div className="p-3 border-t border-border-subtle bg-surface-panel animate-in slide-in-from-bottom-2 duration-150">
          <form
            onSubmit={async e => {
              e.preventDefault();
              await runOp(async () => {
                if (editingItem.isDoc) {
                  await api.renameDocument(editingItem.id, editingItem.title);
                } else {
                  await api.rename(editingItem.id, editingItem.title);
                }
                setEditingItem(null);
              });
            }}
            className="flex flex-col gap-2"
          >
            <span className="text-[11px] font-semibold text-text-muted">{t.manuscriptRename}</span>
            <input
              autoFocus
              type="text"
              value={editingItem.title}
              onChange={e => setEditingItem({ ...editingItem, title: e.target.value })}
              className="text-xs px-2.5 py-1.5 rounded bg-surface-base border border-border-subtle text-text-main"
            />
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-xs px-2.5 py-1 rounded border border-border-subtle text-text-muted hover:text-text-main"
              >
                {t.manuscriptCancel}
              </button>
              <button
                type="submit"
                className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
              >
                {t.manuscriptSaveName}
              </button>
            </div>
          </form>
        </div>
      )}
      </fieldset>
    </aside>
  );
}
