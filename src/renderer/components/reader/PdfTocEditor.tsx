'use client';
import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Download,
  Upload,
  BookOpen,
  FolderTree,
  CornerDownRight,
  Layers,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export interface TocTreeNode {
  id: string;
  title: string;
  pageNumber: number;
  level: number;
}

export interface StirlingBookmarkItem {
  title: string;
  pageNumber: number;
  children?: StirlingBookmarkItem[];
}

export function flatToNestedBookmarks(items: TocTreeNode[]): StirlingBookmarkItem[] {
  const result: StirlingBookmarkItem[] = [];
  const stack: { node: StirlingBookmarkItem; level: number }[] = [];

  for (const item of items) {
    if (!item.title.trim()) continue;
    const node: StirlingBookmarkItem = {
      title: item.title.trim(),
      pageNumber: Math.max(1, Number(item.pageNumber) || 1),
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      result.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    }

    stack.push({ node, level: item.level });
  }

  return result;
}

export function nestedToFlatBookmarks(nodes: unknown[], level = 0): TocTreeNode[] {
  const result: TocTreeNode[] = [];
  const pending = nodes.map(node => ({ node, depth: level })).reverse();
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (depth < 0 || depth > 32 || result.length >= 2000 || !node || typeof node !== 'object') throw new Error('invalid-request');
    const n = node as Record<string, unknown>;
    if (typeof n.title !== 'string' || n.title.length > 1000 || !Number.isSafeInteger(n.pageNumber) || Number(n.pageNumber) < 1) throw new Error('invalid-request');
    if (n.children !== undefined && !Array.isArray(n.children)) throw new Error('invalid-request');
    result.push({
      id: `toc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: n.title,
      pageNumber: Number(n.pageNumber),
      level: depth,
    });
    if (Array.isArray(n.children) && n.children.length > 0) {
      if (pending.length + n.children.length + result.length > 2000) throw new Error('invalid-request');
      for (let index = n.children.length - 1; index >= 0; index--) pending.push({ node: n.children[index], depth: depth + 1 });
    }
  }
  return result;
}

export function PdfTocEditor({
  busy,
  totalPages,
  initialOutline,
  onApply,
}: {
  busy: boolean;
  totalPages?: number;
  initialOutline?: { level?: number; title: string; page: number }[];
  onApply: (payload: Record<string, unknown>) => void;
}) {
  const { t, dir } = useWorkspace();
  const [nodes, setNodes] = useState<TocTreeNode[]>(() => {
    if (initialOutline && initialOutline.length > 0) {
      return initialOutline.map((item, idx) => ({
        id: `toc-init-${idx}`,
        title: item.title || '',
        pageNumber: item.page || 1,
        level: item.level || 0,
      }));
    }
    return [{ id: 'toc-1', title: '', pageNumber: 1, level: 0 }];
  });
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState(false);

  const loadFromPdfOutline = () => {
    if (initialOutline && initialOutline.length > 0) {
      setNodes(
        initialOutline.map((item, idx) => ({
          id: `toc-loaded-${idx}-${Date.now()}`,
          title: item.title || '',
          pageNumber: item.page || 1,
          level: item.level || 0,
        }))
      );
    }
  };

  const addChapter = (atIndex?: number, asChild = false) => {
    const targetIdx = atIndex !== undefined ? atIndex + 1 : nodes.length;
    const parentLevel = atIndex !== undefined ? nodes[atIndex].level : 0;
    const newLevel = asChild ? Math.min(parentLevel + 1, 4) : parentLevel;

    const newNode: TocTreeNode = {
      id: `toc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: '',
      pageNumber: targetIdx > 0 && nodes[targetIdx - 1]?.pageNumber ? nodes[targetIdx - 1].pageNumber : 1,
      level: newLevel,
    };

    setNodes(prev => {
      const copy = [...prev];
      copy.splice(targetIdx, 0, newNode);
      return copy;
    });
  };

  const removeChapter = (index: number) => {
    setNodes(prev => prev.filter((_, i) => i !== index));
  };

  const moveChapter = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= nodes.length) return;
    setNodes(prev => {
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return copy;
    });
  };

  const changeLevel = (index: number, delta: number) => {
    setNodes(prev =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const maxLevel = i > 0 ? prev[i - 1].level + 1 : 0;
        const nextLevel = Math.max(0, Math.min(item.level + delta, maxLevel));
        return { ...item, level: nextLevel };
      })
    );
  };

  const downloadJson = () => {
    const nested = flatToNestedBookmarks(nodes);
    const blob = new Blob([JSON.stringify(nested, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'table-of-contents.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = () => {
    setImportError(false);
    try {
      if (importJsonText.length > 1024 * 1024) throw new Error('invalid-request');
      const parsed = JSON.parse(importJsonText);
      const raw = Array.isArray(parsed) ? parsed : Array.isArray(parsed.toc) ? parsed.toc : [parsed];
      const flat = nestedToFlatBookmarks(raw);
      if (!flat.length || flat.some(node => !node.title.trim() || (totalPages && node.pageNumber > totalPages))) throw new Error('invalid-request');
      if (flat.length > 0) {
        setNodes(flat);
        setShowImportModal(false);
        setImportJsonText('');
      }
    } catch {
      setImportError(true);
    }
  };

  const valid = nodes.length > 0 && nodes.length <= 2000 && nodes.every(node => node.title.trim().length > 0 && Number.isSafeInteger(node.pageNumber) && node.pageNumber >= 1 && (!totalPages || node.pageNumber <= totalPages));

  const handleApply = () => {
    if (!valid || busy) return;
    const nested = flatToNestedBookmarks(nodes);
    onApply({
      toc: nested,
      replaceExisting,
    });
  };

  return (
    <section data-pdf-toc-editor className="space-y-3 text-start">
      <div className="flex items-center justify-between border-b border-subtle pb-2">
        <div className="flex items-center gap-1.5 font-bold text-xs">
          <FolderTree size={15} className="text-emerald-500" />
          <span>{t('stirlingEditToc')}</span>
        </div>
        <div className="flex items-center gap-1">
          {initialOutline && initialOutline.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={loadFromPdfOutline}
              title={t('pdfTocLoadSource')}
              className="p-1 rounded-lg border border-subtle hover:bg-surface text-[11px] text-muted hover:text-main flex items-center gap-1 cursor-pointer"
            >
              <BookOpen size={12} />
              <span className="hidden sm:inline">{t('pdfTocLoadSourceShort')}</span>
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowImportModal(true)}
            title={t('pdfTocImportTitle')}
            className="p-1 rounded-lg border border-subtle hover:bg-surface text-[11px] text-muted hover:text-main flex items-center gap-1 cursor-pointer"
          >
            <Upload size={12} />
            <span className="hidden sm:inline">{t('pdfTocImportAction')}</span>
          </button>
          <button
            type="button"
            disabled={busy || !valid}
            onClick={downloadJson}
            title={t('pdfTocDownloadJson')}
            className="p-1 rounded-lg border border-subtle hover:bg-surface text-[11px] text-muted hover:text-main flex items-center gap-1 cursor-pointer"
          >
            <Download size={12} />
          </button>
        </div>
      </div>

      <p className="text-xs text-muted leading-relaxed">
        {t('pdfTocAppendNotice')}
      </p>

      {/* Chapters Tree List */}
      <div className="space-y-2 max-h-[420px] overflow-y-auto pe-1">
        {nodes.map((node, index) => {
          return (
            <div
              key={node.id}
              className={`rounded-xl border border-subtle bg-canvas/60 p-2 space-y-1.5 transition-all ${
                node.level > 0 ? 'ms-' + Math.min(node.level * 4, 12) : ''
              }`}
              style={{ marginInlineStart: `${node.level * 16}px` }}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 text-[10px] text-muted font-mono">
                  {node.level > 0 && <CornerDownRight size={12} className="text-emerald-500 shrink-0" />}
                  <span>#{index + 1}</span>
                  {node.level > 0 && (
                    <span className="px-1 rounded bg-surface border border-subtle">
                      L{node.level}
                    </span>
                  )}
                </div>

                {/* Level and Order Buttons */}
                <div className="flex items-center gap-0.5">
                  {/* Outdent (Left in LTR, Right in RTL) */}
                  <button
                    type="button"
                    disabled={busy || node.level <= 0}
                    onClick={() => changeLevel(index, -1)}
                    title={t('pdfTocOutdent')}
                    className="p-0.5 rounded hover:bg-surface disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowLeft size={11} className="rtl:rotate-180" />
                  </button>
                  {/* Indent (Right in LTR, Left in RTL) */}
                  <button
                    type="button"
                    disabled={busy || (index === 0 ? true : node.level >= nodes[index - 1].level + 1)}
                    onClick={() => changeLevel(index, 1)}
                    title={t('pdfTocIndent')}
                    className="p-0.5 rounded hover:bg-surface disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowRight size={11} className="rtl:rotate-180" />
                  </button>
                  {/* Move Up */}
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    onClick={() => moveChapter(index, index - 1)}
                    title={t('pdfTocMoveUp')}
                    className="p-0.5 rounded hover:bg-surface disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronUp size={12} />
                  </button>
                  {/* Move Down */}
                  <button
                    type="button"
                    disabled={busy || index === nodes.length - 1}
                    onClick={() => moveChapter(index, index + 1)}
                    title={t('pdfTocMoveDown')}
                    className="p-0.5 rounded hover:bg-surface disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronDown size={12} />
                  </button>
                  {/* Delete */}
                  <button
                    type="button"
                    disabled={busy || nodes.length <= 1}
                    onClick={() => removeChapter(index)}
                    title={t('pdfTocRemove')}
                    className="p-0.5 rounded hover:bg-red-500/10 text-red-500 disabled:opacity-30 cursor-pointer"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              {/* Title & Page Inputs */}
              <div className="grid grid-cols-[1fr_75px] gap-2 items-center">
                <input
                  type="text"
                  dir="auto"
                  placeholder={t('pdfTocEntryTitle')}
                  value={node.title}
                  maxLength={1000}
                  disabled={busy}
                  onChange={e =>
                    setNodes(prev =>
                      prev.map((item, i) => (i === index ? { ...item, title: e.target.value } : item))
                    )
                  }
                  className="w-full rounded-lg border border-subtle bg-canvas px-2.5 py-1 text-xs outline-none focus:border-emerald-500"
                />
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted">{t('page')}</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages || 99999}
                    value={node.pageNumber}
                    disabled={busy}
                    onChange={e =>
                      setNodes(prev =>
                        prev.map((item, i) =>
                          i === index ? { ...item, pageNumber: Math.max(1, Number(e.target.value) || 1) } : item
                        )
                      )
                    }
                    className="w-full rounded-lg border border-subtle bg-canvas px-1.5 py-1 text-xs text-center font-mono outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Add Sub-chapter shortcut */}
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => addChapter(index, true)}
                  className="text-[10px] text-emerald-500 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={10} />
                  <span>{t('pdfTocAddChild')}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Top-level Chapter */}
      <button
        type="button"
        disabled={busy || nodes.length >= 500}
        onClick={() => addChapter()}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-subtle hover:bg-surface text-xs font-semibold transition-colors cursor-pointer"
      >
        <Plus size={14} />
        <span>{t('pdfTocAdd')}</span>
      </button>

      {/* Replace Existing Option */}
      <label className="flex items-start gap-2 text-xs cursor-pointer select-none">
        <input
          type="checkbox"
          checked={replaceExisting}
          disabled={busy}
          onChange={e => setReplaceExisting(e.target.checked)}
          className="mt-0.5 rounded accent-emerald-600 cursor-pointer"
        />
        <span>{t('pdfTocReplace')}</span>
      </label>

      {/* Apply Button */}
      <button
        type="button"
        disabled={busy || !valid}
        onClick={handleApply}
        className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-40"
      >
        {t('pdfTocApply')}
      </button>

      {/* Import JSON Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-subtle bg-canvas p-4 space-y-3 shadow-2xl">
            <h4 className="font-bold text-sm">{t('pdfTocImportTitle')}</h4>
            <p className="text-xs text-muted">
              {t('pdfTocImportHelp')}
            </p>
            <textarea
              rows={8}
              value={importJsonText}
              maxLength={1024 * 1024}
              aria-label={t('pdfTocImportTitle')}
              aria-invalid={importError}
              onChange={e => { setImportJsonText(e.target.value); setImportError(false); }}
              placeholder={t('pdfTocJsonExample')}
              className="w-full rounded-xl border border-subtle bg-surface p-2 font-mono text-xs outline-none focus:border-emerald-500"
            />
            {importError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{t('pdfTocImportError')}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-3 py-1.5 rounded-lg border border-subtle text-xs hover:bg-surface cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={importJson}
                disabled={!importJsonText.trim()}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
              >
                {t('pdfTocImportAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
