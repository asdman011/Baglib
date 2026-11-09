'use client';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  RotateCw,
  RotateCcw,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Eye,
  Plus,
  Scissors,
  CheckSquare,
  Square,
  RotateCcw as ResetIcon,
  Check,
  FilePlus,
  Save,
  Layers,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react';
import type { PdfSession } from '../../../shared/types/pdf-editor';
import {
  buildOrganizerDraft,
  organizerDraftKey,
  resolveOrganizerDraftForSession,
} from '../../../shared/pdf-organizer-draft';
import type { PdfViewDocument } from '../../libs/reader/pdf-view-document';
import { useWorkspace } from '../context/WorkspaceContext';
import { PdfPageThumbnail } from './PdfPageThumbnail';

export interface PagePlanItem {
  id: string;
  page?: number;
  sessionId?: string;
  filename?: string;
  blank?: boolean;
  rotation?: number; // 0, 90, 180, 270
  splitAfter?: boolean;
}

export function parsePageSelectionSyntax(syntax: string, totalPages: number): number[] {
  if (!Number.isSafeInteger(totalPages) || totalPages < 1) return [];
  const selected = new Set<number>();
  const normalized = syntax.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/[\u200e\u200f\u061c]/g, '').replace(/[–—]/g, '-');
  const tokens = normalized.split(/[,;،؛\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);

  for (const token of tokens) {
    if (token === 'all' || token === 'الكل') {
      for (let i = 1; i <= totalPages; i++) selected.add(i);
      continue;
    }
    if (token === '2n' || token === 'even' || token === 'زوجي') {
      for (let i = 2; i <= totalPages; i += 2) selected.add(i);
      continue;
    }
    if (token === '2n+1' || token === '2n-1' || token === 'odd' || token === 'فردي') {
      for (let i = 1; i <= totalPages; i += 2) selected.add(i);
      continue;
    }
    const rangeMatch = /^(\d+)(?:-|\.\.)(\d+)$/.exec(token);
    if (rangeMatch) {
      const start = Math.min(Number(rangeMatch[1]), Number(rangeMatch[2]));
      const end = Math.max(Number(rangeMatch[1]), Number(rangeMatch[2]));
      for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) {
        selected.add(i);
      }
      continue;
    }
    const num = Number(token);
    if (/^\d+$/.test(token) && Number.isSafeInteger(num) && num >= 1 && num <= totalPages) {
      selected.add(num);
    }
  }

  return Array.from(selected).sort((a, b) => a - b);
}

export function selectPagePlanPositions(items: readonly PagePlanItem[], syntax: string): Set<string> {
  const positions = new Set(parsePageSelectionSyntax(syntax, items.length));
  return new Set(items.filter((_, index) => positions.has(index + 1)).map(item => item.id));
}

interface PdfPageEditorProps {
  session: PdfSession;
  totalPages: number;
  thumbnails: Record<string, string>;
  document?: PdfViewDocument | null;
  onApply: (plan: PagePlanItem[]) => void;
  onViewPage?: (page: number) => void;
  busy?: boolean;
  theme?: 'dark' | 'light' | 'sepia';
}

export interface PdfPageEditorHandle {
  sessionId: string;
  appendPages: (pages: Omit<PagePlanItem, 'id'>[]) => void;
  getPages: () => PagePlanItem[];
}

export const PdfPageEditor = forwardRef<PdfPageEditorHandle, PdfPageEditorProps>(function PdfPageEditor({
  session,
  totalPages,
  thumbnails,
  document = null,
  onApply,
  onViewPage,
  busy = false,
  theme = 'dark',
}: PdfPageEditorProps, ref) {
  const { t, dir } = useWorkspace();
  const draftSourceId = session.sourceId || session.workId || null;
  const draftKey = organizerDraftKey(draftSourceId);
  const [items, setItems] = useState<PagePlanItem[]>(() =>
    Array.from({ length: totalPages || 1 }, (_, i) => ({
      id: `${session.id}-p-${i + 1}`,
      page: i + 1,
      sessionId: session.id,
      filename: session.filename,
      rotation: 0,
    }))
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syntaxInput, setSyntaxInput] = useState('');
  const [splitBoundaries, setSplitBoundaries] = useState<Set<string>>(new Set());
  const [thumbSize, setThumbSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [history, setHistory] = useState<PagePlanItem[][]>(() => [items]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [draftBanner, setDraftBanner] = useState<'restored' | 'discarded' | null>(null);
  const draftLoadedForKeyRef = useRef<string | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPlanRef = useRef<{ items: PagePlanItem[]; splitBoundaries: Set<string> }>({
    items,
    splitBoundaries,
  });

  useEffect(() => {
    latestPlanRef.current = { items, splitBoundaries };
  }, [items, splitBoundaries]);

  const deleteStoredDraft = useCallback(async (key: string | null) => {
    if (!key || typeof window === 'undefined') return;
    if (window.electronAPI?.settings?.delete) {
      await window.electronAPI.settings.delete(key);
    } else if (window.electronAPI?.settings?.set) {
      await window.electronAPI.settings.set(key, null);
    }
  }, []);

  const persistDraftState = useCallback(
    async (nextItems: readonly PagePlanItem[], nextSplits: ReadonlySet<string>) => {
      if (!draftKey || !draftSourceId || typeof window === 'undefined') return;
      const nextDraft = buildOrganizerDraft({
        sourceId: draftSourceId,
        sha256: session.sha256,
        totalPages,
        items: nextItems,
        splitBoundaries: nextSplits,
        currentSessionId: session.id,
      });
      if (nextDraft) {
        await window.electronAPI?.settings?.set?.(draftKey, nextDraft);
      } else {
        await deleteStoredDraft(draftKey);
      }
    },
    [deleteStoredDraft, draftKey, draftSourceId, session.id, session.sha256, totalPages]
  );

  // Restore or discard saved draft when source + totalPages are ready
  useEffect(() => {
    const loadSignature = `${draftKey ?? 'none'}:${session.sha256}:${totalPages}`;
    if (!draftKey || !draftSourceId || totalPages < 1) return;
    if (draftLoadedForKeyRef.current === loadSignature) return;
    let cancelled = false;
    void (async () => {
      try {
        const raw = await window.electronAPI?.settings?.get?.(draftKey);
        if (cancelled) return;
        const resolution = resolveOrganizerDraftForSession(raw, {
          id: session.id,
          sourceId: draftSourceId,
          filename: session.filename,
          sha256: session.sha256,
          totalPages,
        });
        draftLoadedForKeyRef.current = loadSignature;
        if (resolution.status === 'restored') {
          setItems(resolution.items);
          setSplitBoundaries(resolution.splitBoundaries);
          setHistory([resolution.items]);
          setHistoryIndex(0);
          setSelectedIds(new Set());
          setDraftBanner('restored');
        } else if (resolution.status === 'discarded-changed') {
          await deleteStoredDraft(draftKey);
          if (cancelled) return;
          const fresh = Array.from({ length: totalPages || 1 }, (_, i) => ({
            id: `${session.id}-p-${i + 1}`,
            page: i + 1,
            sessionId: session.id,
            filename: session.filename,
            rotation: 0,
          }));
          setItems(fresh);
          setSplitBoundaries(new Set());
          setHistory([fresh]);
          setHistoryIndex(0);
          setSelectedIds(new Set());
          setDraftBanner('discarded');
        }
      } catch {
        draftLoadedForKeyRef.current = loadSignature;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deleteStoredDraft, draftKey, draftSourceId, session.filename, session.id, session.sha256, totalPages]);

  // Debounced auto-save of draft when items or splitBoundaries change
  useEffect(() => {
    const loadSignature = `${draftKey ?? 'none'}:${session.sha256}:${totalPages}`;
    if (!draftKey || draftLoadedForKeyRef.current !== loadSignature) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      draftTimerRef.current = null;
      void persistDraftState(items, splitBoundaries);
    }, 120);
    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, [draftKey, items, persistDraftState, session.sha256, splitBoundaries, totalPages]);

  // Flush any pending draft on unmount so closing the book immediately preserves the latest edit
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
        void persistDraftState(latestPlanRef.current.items, latestPlanRef.current.splitBoundaries);
      }
    };
  }, [persistDraftState]);

  const clearStoredDraft = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    setDraftBanner(null);
    void deleteStoredDraft(draftKey);
  }, [deleteStoredDraft, draftKey]);

  const pushHistory = (newItems: PagePlanItem[]) => {
    setHistory(prev => [...prev.slice(0, historyIndex + 1), newItems]);
    setHistoryIndex(prev => prev + 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setItems(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setItems(history[historyIndex + 1]);
    }
  };

  const updateItemsWithHistory = (updater: (prev: PagePlanItem[]) => PagePlanItem[]) => {
    const next = updater(items);
    setItems(next);
    pushHistory(next);
  };

  useImperativeHandle(ref, () => ({
    sessionId: session.id,
    getPages: () => items.map(item => ({ ...item, splitAfter: splitBoundaries.has(item.id) })),
    appendPages: pages => {
      if (!pages.length) return;
      if (busy) throw new Error('busy');
      updateItemsWithHistory(previous => [...previous, ...pages.map(item => ({ ...item, id: `merged-${crypto.randomUUID()}` }))]);
    },
  }));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(it => it.id)));
    }
  };

  const applySyntaxSelection = () => {
    if (!syntaxInput.trim()) return;
    setSelectedIds(selectPagePlanPositions(items, syntaxInput));
  };

  const rotateItem = (index: number, degrees: number) => {
    updateItemsWithHistory(prev =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const currentRot = it.rotation || 0;
        const newRot = (((currentRot + degrees) % 360) + 360) % 360;
        return { ...it, rotation: newRot };
      })
    );
  };

  const moveItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= items.length) return;
    updateItemsWithHistory(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  const deleteItem = (index: number) => {
    updateItemsWithHistory(prev => prev.filter((_, i) => i !== index));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (items[index]) next.delete(items[index].id);
      return next;
    });
  };

  const insertBlankPageAt = (index: number) => {
    const newItem: PagePlanItem = {
      id: `blank-${crypto.randomUUID()}`,
      blank: true,
      rotation: 0,
    };
    updateItemsWithHistory(prev => {
      const updated = [...prev];
      updated.splice(index, 0, newItem);
      return updated;
    });
  };

  // Batch actions
  const batchRotate = (degrees: number) => {
    if (selectedIds.size === 0) return;
    updateItemsWithHistory(prev =>
      prev.map(it => {
        if (!selectedIds.has(it.id)) return it;
        const currentRot = it.rotation || 0;
        const newRot = (((currentRot + degrees) % 360) + 360) % 360;
        return { ...it, rotation: newRot };
      })
    );
  };

  const batchDelete = () => {
    if (selectedIds.size === 0) return;
    updateItemsWithHistory(prev => prev.filter(it => !selectedIds.has(it.id)));
    setSelectedIds(new Set());
  };

  const insertBlankAfterSelected = () => {
    if (selectedIds.size === 0) return;
    updateItemsWithHistory(prev => {
      const next: PagePlanItem[] = [];
      for (const item of prev) {
        next.push(item);
        if (selectedIds.has(item.id)) {
          next.push({
            id: `blank-${crypto.randomUUID()}`,
            blank: true,
            rotation: 0,
          });
        }
      }
      return next;
    });
  };

  const toggleSplitAfterSelected = () => {
    if (selectedIds.size === 0) return;
    setSplitBoundaries(prev => {
      const next = new Set(prev);
      for (const id of selectedIds) {
        if (items.at(-1)?.id === id) continue;
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const resetAll = () => {
    clearStoredDraft();
    const fresh = Array.from({ length: totalPages || 1 }, (_, i) => ({
      id: `${session.id}-p-${i + 1}`,
      page: i + 1,
      sessionId: session.id,
      filename: session.filename,
      rotation: 0,
    }));
    updateItemsWithHistory(() => fresh);
    setSelectedIds(new Set());
    setSplitBoundaries(new Set());
  };

  const applyPlanChanges = () => {
    clearStoredDraft();
    onApply(items.map(item => ({ ...item, splitAfter: splitBoundaries.has(item.id) })));
  };

  const isDark = theme === 'dark';

  return (
    <div
      dir={dir}
      data-pdf-page-editor
      data-editor-theme={theme}
      data-total-pages={totalPages}
      data-busy={busy || undefined}
      className={`flex flex-col h-full w-full overflow-hidden ${
        isDark ? 'bg-[#0e1014] text-[#e1e4ea]' : 'bg-[#f8f9fa] text-[#111827]'
      }`}
    >
      {/* Top Batch & Selection Toolbar */}
      <div
        data-page-editor-toolbar
        className={`p-2 sm:p-3 border-b flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0 ${
          isDark ? 'border-[#222631] bg-[#14161c]' : 'border-[#e2e8f0] bg-white'
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          {/* Select All */}
          <button
            type="button"
            onClick={selectAll}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
              selectedIds.size > 0 && selectedIds.size === items.length
                ? 'bg-emerald-600 text-white border-emerald-600'
                : isDark
                ? 'border-[#2b303d] hover:bg-[#1f222b] text-[#a0a6b7]'
                : 'border-[#cbd5e1] hover:bg-[#f1f5f9] text-[#475569]'
            }`}
          >
            {selectedIds.size === items.length ? <CheckSquare size={14} /> : <Square size={14} />}
            <span>{selectedIds.size === items.length ? (t('pdfPageEditorDeselectAll')) : (t('pdfSelectAll'))}</span>
            <span className="font-mono text-[10px] opacity-75">({selectedIds.size}/{items.length})</span>
          </button>

          {/* Syntax input */}
          <button type="button" disabled={busy} onClick={() => setSelectedIds(selectPagePlanPositions(items, 'even'))} className="text-xs px-2 py-1 rounded-lg border border-subtle">{t('stirlingSelectEven')}</button>
          <button type="button" disabled={busy} onClick={() => setSelectedIds(selectPagePlanPositions(items, 'odd'))} className="text-xs px-2 py-1 rounded-lg border border-subtle">{t('stirlingSelectOdd')}</button>
          <div className="flex items-center gap-1 min-w-0">
            <input
              type="text"
              placeholder={t('pdfPageEditorSelectionExample')}
              aria-label={t('pdfPageRangeSelection')}
              title={t('pdfPageRangeSelectionHint')}
              value={syntaxInput}
              onChange={e => setSyntaxInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') applySyntaxSelection(); }}
              className={`px-2 py-1 text-xs rounded-lg border font-mono outline-none w-24 sm:w-36 min-w-0 ${
                isDark ? 'bg-[#181a20] border-[#2b303d] text-white focus:border-emerald-500' : 'bg-[#f1f5f9] border-[#cbd5e1] text-[#0f172a] focus:border-emerald-500'
              }`}
            />
            <button
              type="button"
              onClick={applySyntaxSelection}
              aria-label={t('pdfPageRangeSelection')}
              className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer shrink-0"
            >
              <Check size={13} />
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          {/* Undo / Redo */}
          <div className="flex items-center gap-1 border-e border-subtle pe-2">
            <button
              type="button"
              disabled={historyIndex <= 0}
              onClick={undo}
              title={t('pdfUndo')}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer disabled:opacity-30 ${
                isDark ? 'border-[#2b303d] hover:bg-[#1f222b]' : 'border-[#cbd5e1] hover:bg-[#f1f5f9]'
              }`}
            >
              <Undo size={13} />
            </button>
            <button
              type="button"
              disabled={historyIndex >= history.length - 1}
              onClick={redo}
              title={t('pdfPageEditorRedo')}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer disabled:opacity-30 ${
                isDark ? 'border-[#2b303d] hover:bg-[#1f222b]' : 'border-[#cbd5e1] hover:bg-[#f1f5f9]'
              }`}
            >
              <Redo size={13} />
            </button>
          </div>

          {/* Rotate Batch */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={selectedIds.size === 0 || busy}
              onClick={() => batchRotate(-90)}
              title={t('pdfPageEditorRotateSelectedLeft90')}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer disabled:opacity-40 ${
                isDark ? 'border-[#2b303d] hover:bg-[#1f222b]' : 'border-[#cbd5e1] hover:bg-[#f1f5f9]'
              }`}
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0 || busy}
              onClick={() => batchRotate(90)}
              title={t('pdfPageEditorRotateSelectedRight90')}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer disabled:opacity-40 ${
                isDark ? 'border-[#2b303d] hover:bg-[#1f222b]' : 'border-[#cbd5e1] hover:bg-[#f1f5f9]'
              }`}
            >
              <RotateCw size={14} />
            </button>
          </div>

          {/* Delete Batch */}
          <button
            type="button"
            disabled={selectedIds.size === 0 || busy}
            onClick={batchDelete}
            title={t('pdfPageEditorDeleteSelected', { count: selectedIds.size })}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40"
          >
            <Trash2 size={13} />
            <span className="hidden sm:inline">{t('delete')}</span>
            {selectedIds.size > 0 && <span className="font-mono">({selectedIds.size})</span>}
          </button>

          {/* Insert Blank After Selected */}
          <button
            type="button"
            disabled={selectedIds.size === 0 || busy}
            onClick={insertBlankAfterSelected}
            title={t('pdfPageEditorInsertBlankPagesAfterSelected')}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 ${
              isDark ? 'border-[#2b303d] hover:bg-[#1f222b] text-[#a0a6b7]' : 'border-[#cbd5e1] hover:bg-[#f1f5f9] text-[#475569]'
            }`}
          >
            <Plus size={13} />
            <span className="hidden md:inline">{t('pdfPageEditorBlankAfter')}</span>
          </button>

          {/* Split After Selected */}
          <button
            type="button"
            disabled={selectedIds.size === 0 || busy}
            onClick={toggleSplitAfterSelected}
            title={t('pdfPageEditorSplitAfterSelectedPages')}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 ${
              isDark ? 'border-[#2b303d] hover:bg-[#1f222b] text-[#a0a6b7]' : 'border-[#cbd5e1] hover:bg-[#f1f5f9] text-[#475569]'
            }`}
          >
            <Scissors size={13} />
            <span className="hidden md:inline">{t('pdfPageEditorSplitAfter')}</span>
          </button>

          {/* Thumbnail Zoom */}
          <div className="flex items-center gap-1 border-s border-subtle ps-2">
            <button
              type="button"
              onClick={() => setThumbSize(s => s === 'lg' ? 'md' : s === 'md' ? 'sm' : 'sm')}
              title={t('pdfPageEditorZoomOut')}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                isDark ? 'border-[#2b303d] hover:bg-[#1f222b]' : 'border-[#cbd5e1] hover:bg-[#f1f5f9]'
              }`}
            >
              <ZoomOut size={13} />
            </button>
            <button
              type="button"
              onClick={() => setThumbSize(s => s === 'sm' ? 'md' : s === 'md' ? 'lg' : 'lg')}
              title={t('pdfPageEditorZoomIn')}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                isDark ? 'border-[#2b303d] hover:bg-[#1f222b]' : 'border-[#cbd5e1] hover:bg-[#f1f5f9]'
              }`}
            >
              <ZoomIn size={13} />
            </button>
          </div>

          {/* Reset */}
          <button
            type="button"
            disabled={busy}
            onClick={resetAll}
            title={t('pdfPageEditorResetAll')}
            className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
              isDark ? 'border-[#2b303d] hover:bg-[#1f222b] text-[#8b92a5]' : 'border-[#cbd5e1] hover:bg-[#f1f5f9] text-[#64748b]'
            }`}
          >
            <ResetIcon size={14} />
          </button>

          {/* Apply Changes */}
          <button type="button" disabled={busy || selectedIds.size === 0} onClick={() => onApply(items.filter(item => selectedIds.has(item.id)))} className="text-xs px-2 py-1.5 rounded-lg border border-subtle disabled:opacity-40">{t('stirlingExtractSelected')}</button>
          <button
            type="button"
            disabled={busy || items.length === 0}
            onClick={applyPlanChanges}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-40"
          >
            <Save size={14} />
            <span>{t('pdfPageEditorApplyChanges')}</span>
          </button>
        </div>
      </div>

      {/* Draft Status Banner */}
      {draftBanner && (
        <div
          role="status"
          data-organizer-draft-banner={draftBanner}
          className={`px-3 py-2 border-b flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 ${
            draftBanner === 'restored'
              ? isDark
                ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-200'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : isDark
              ? 'bg-amber-950/50 border-amber-800/60 text-amber-200'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <span className="font-medium leading-relaxed">
            {draftBanner === 'restored'
              ? t('pdfOrganizerDraftRestored')
              : t('pdfOrganizerDraftDiscardedChanged')}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {draftBanner === 'restored' ? (
              <button
                type="button"
                data-organizer-draft-discard
                disabled={busy}
                onClick={resetAll}
                className={`px-2.5 py-1 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                  isDark
                    ? 'border-emerald-700/70 bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-100'
                    : 'border-emerald-300 bg-white hover:bg-emerald-100 text-emerald-800'
                }`}
              >
                {t('pdfOrganizerDraftDiscard')}
              </button>
            ) : (
              <button
                type="button"
                data-organizer-draft-dismiss
                onClick={() => setDraftBanner(null)}
                aria-label={t('close')}
                className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid of Page Thumbnails */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 sm:p-4 md:p-6">
        <div
          className={`grid gap-3 sm:gap-4 ${
            thumbSize === 'sm'
              ? 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2.5'
              : thumbSize === 'lg'
              ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5'
              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4'
          }`}
        >
          {items.map((item, index) => {
            const isSelected = selectedIds.has(item.id);
            const isSplitAfter = splitBoundaries.has(item.id);
            const thumbUrl = item.page ? (thumbnails[`current:${item.page}`] || thumbnails[item.page]) : null;
            const rot = item.rotation || 0;

            return (
              <div key={item.id} className="relative min-w-0">
                {/* Insertion Divider Before Card on hover */}
                <div
                  data-page-editor-divider
                  role="group"
                  tabIndex={0}
                  aria-label={t('pdfPageEditorInsertionTools')}
                  className="absolute inset-y-0 -start-3 w-6 group/divider flex items-center justify-center z-20"
                >
                    <div className="absolute inset-y-0 w-16 opacity-0 pointer-events-none group-hover/divider:opacity-100 group-hover/divider:pointer-events-auto group-focus-within/divider:opacity-100 group-focus-within/divider:pointer-events-auto flex items-center justify-center gap-1 bg-canvas/90 backdrop-blur-xs rounded-lg border border-subtle shadow-md p-1">
                      <button
                        type="button"
                        onClick={() => insertBlankPageAt(index)}
                        title={t('pdfPageEditorInsertBlankPageHere')}
                        className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                      >
                        <Plus size={11} />
                      </button>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => {
                          setSplitBoundaries(prev => {
                            const next = new Set(prev);
                            if (index > 0 && items[index - 1]) {
                              const targetId = items[index - 1].id;
                              if (next.has(targetId)) next.delete(targetId);
                              else next.add(targetId);
                            }
                            return next;
                          });
                        }}
                        title={t('pdfPageEditorSplitHere')}
                        className="p-1 rounded bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                      >
                        <Scissors size={11} />
                      </button>
                    </div>
                </div>

                {/* Page Card */}
                <div
                  data-page-editor-card
                  data-selected={isSelected || undefined}
                  className={`group relative rounded-xl border p-2 flex flex-col transition-all cursor-pointer select-none ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500/15 shadow-md shadow-emerald-500/20'
                      : isDark
                      ? 'border-[#222631] bg-[#15171e] hover:border-[#383e4f] hover:bg-[#1a1d26]'
                      : 'border-[#e2e8f0] bg-white hover:border-[#cbd5e1] hover:bg-[#f8fafc] shadow-xs'
                  }`}
                  onClick={() => toggleSelect(item.id)}
                >
                  {/* Card Header: Checkbox & Index */}
                  <div className="flex items-center justify-between pb-1.5 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        onClick={e => e.stopPropagation()}
                        className="rounded accent-emerald-600 cursor-pointer"
                      />
                      <span className="font-mono font-bold text-muted">{index + 1}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {isSplitAfter && (
                        <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-500 font-bold flex items-center gap-0.5">
                          <Scissors size={9} />
                          {t('pdfPageEditorSplit')}
                        </span>
                      )}
                      {rot !== 0 && (
                        <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold">
                          {rot}°
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Thumbnail Container */}
                  <div className="relative aspect-[3/4] rounded-lg bg-neutral-900/10 dark:bg-black/30 border border-subtle overflow-hidden flex items-center justify-center">
                    {item.blank ? (
                      <div className="text-center p-2 text-muted">
                        <FilePlus size={22} className="mx-auto mb-1 opacity-40" />
                        <span className="text-[10px] block font-medium">{t('pdfPageEditorBlankPage')}</span>
                      </div>
                    ) : (
                      <PdfPageThumbnail
                        document={document}
                        page={item.page!}
                        image={thumbUrl}
                        alt={`${t('page')} ${item.page}`}
                        rotation={rot}
                        fallback={(
                          <div className="text-center text-muted">
                            <Layers size={22} className="mx-auto mb-1 opacity-30" />
                            <span className="font-mono text-xs">{item.page}</span>
                          </div>
                        )}
                      />
                    )}

                    {/* Hover Actions Overlay */}
                    <div
                      data-page-editor-actions
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex flex-col justify-between p-1.5 z-10"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveItem(index, index - 1)}
                          title={t('pdfPageEditorMoveLeft')}
                          className="p-1 rounded bg-black/60 hover:bg-black/90 text-white disabled:opacity-20 cursor-pointer"
                        >
                          <ArrowLeft size={12} className="rtl:rotate-180" />
                        </button>
                        <button
                          type="button"
                          disabled={index === items.length - 1}
                          onClick={() => moveItem(index, index + 1)}
                          title={t('pdfPageEditorMoveRight')}
                          className="p-1 rounded bg-black/60 hover:bg-black/90 text-white disabled:opacity-20 cursor-pointer"
                        >
                          <ArrowRight size={12} className="rtl:rotate-180" />
                        </button>
                      </div>

                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => rotateItem(index, -90)}
                          title={t('pdfPageEditorRotateLeft')}
                          className="p-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white cursor-pointer"
                        >
                          <RotateCcw size={13} />
                        </button>
                        {item.page && onViewPage && (
                          <button
                            type="button"
                            onClick={() => onViewPage(item.page!)}
                            title={t('pdfPageEditorView')}
                            className="p-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white cursor-pointer"
                          >
                            <Eye size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => rotateItem(index, 90)}
                          title={t('pdfPageEditorRotateRight')}
                          className="p-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white cursor-pointer"
                        >
                          <RotateCw size={13} />
                        </button>
                      </div>

                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => deleteItem(index)}
                          title={t('pdfPageEditorDeletePage')}
                          className="p-1 rounded bg-red-600/80 hover:bg-red-600 text-white cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
