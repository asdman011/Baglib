'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Brain, LayoutGrid, Minus, Plus, Scale, Square, StickyNote, Trash2, X, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { BOARD_COLORS, edgeEndpoints, freeSpot, presetBoard, removeBoardItems, type Board, type BoardColor, type BoardEdge, type BoardItem, type BoardPreset, type BoardSummary } from '../../../shared/boards';
import { studyLinks, type StudyNote } from '../../../shared/study-notes';
import type { TranslationKey } from '../../translations';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';

const newId = () => crypto.randomUUID();
const swatch: Record<BoardColor, string> = {
  amber: 'bg-amber-100 border-amber-400 dark:bg-amber-950 dark:border-amber-500',
  sky: 'bg-sky-100 border-sky-400 dark:bg-sky-950 dark:border-sky-500',
  emerald: 'bg-emerald-100 border-emerald-400 dark:bg-emerald-950 dark:border-emerald-500',
  rose: 'bg-rose-100 border-rose-400 dark:bg-rose-950 dark:border-rose-500',
  violet: 'bg-violet-100 border-violet-400 dark:bg-violet-950 dark:border-violet-500',
  slate: 'bg-slate-100 border-slate-400 dark:bg-slate-800 dark:border-slate-500',
};
const colorKeys: Record<BoardColor, TranslationKey> = { amber: 'boardsColorAmber', sky: 'boardsColorSky', emerald: 'boardsColorEmerald', rose: 'boardsColorRose', violet: 'boardsColorViolet', slate: 'boardsColorSlate' };
const presetKeys: Record<BoardPreset, TranslationKey> = { blank: 'boardsPresetBlank', mind: 'boardsPresetMind', argument: 'boardsPresetArgument' };
type View = { x: number; y: number; zoom: number };
type Selection = { kind: 'item' | 'edge'; id: string } | null;
type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'conflict';

/** The board surface: cards, sticky notes and labelled arrows; pan by dragging the background, zoom with the wheel. */
function BoardCanvas({ initial, notes, onClose, onSaved }: { initial: Board; notes: StudyNote[]; onClose: () => void; onSaved: (board: Board) => void }) {
  const { t, books, openBookForReading } = useWorkspace();
  const [board, setBoard] = useState(initial);
  const revision = useRef(initial.revision);
  const [dirty, setDirty] = useState(false);
  const [save, setSave] = useState<SaveState>('idle');
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [selection, setSelection] = useState<Selection>(null);
  const [connectFrom, setConnectFrom] = useState<string | null | undefined>(undefined); // undefined: not connecting
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'pan' | 'move' | 'resize'; id?: string; x: number; y: number; start: { x: number; y: number; w: number; h: number } } | null>(null);
  const [linkText, setLinkText] = useState('');

  const change = useCallback((update: (current: Board) => Pick<Board, 'items' | 'edges'> & Partial<Pick<Board, 'title'>>) => {
    setBoard(current => ({ ...current, ...update(current) }));
    setDirty(true);
  }, []);
  // Autosave shortly after the last change; a save from another window wins and this one reloads.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      setDirty(false); setSave('saving');
      const { id, title, preset, items, edges } = board;
      window.electronAPI.boards.save({ id, title, preset, items, edges, expectedRevision: revision.current }).then(saved => {
        revision.current = saved.revision; setSave('saved'); onSaved(saved);
      }, async (error: unknown) => {
        if (String(error).includes('board-conflict')) {
          const fresh = await window.electronAPI.boards.get(id).catch(() => null);
          if (fresh) { revision.current = fresh.revision; setBoard(fresh); }
          setSave('conflict');
        } else setSave('failed');
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [board, dirty, onSaved]);

  // Centre the board's content in view when it opens.
  const fit = useCallback(() => {
    const element = surface.current;
    if (!element) return;
    const width = element.clientWidth, height = element.clientHeight;
    if (!board.items.length) { setView({ x: width / 2, y: height / 2, zoom: 1 }); return; }
    const minX = Math.min(...board.items.map(item => item.x)), minY = Math.min(...board.items.map(item => item.y));
    const maxX = Math.max(...board.items.map(item => item.x + item.w)), maxY = Math.max(...board.items.map(item => item.y + item.h));
    const zoom = Math.min(1.25, Math.max(0.2, Math.min((width - 80) / (maxX - minX || 1), (height - 80) / (maxY - minY || 1))));
    setView({ zoom, x: width / 2 - ((minX + maxX) / 2) * zoom, y: height / 2 - ((minY + maxY) / 2) * zoom });
  }, [board.items]);
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    // Marked inside the frame: React's development double-run cancels the first frame, and the second must still fit.
    const frame = requestAnimationFrame(() => { fitted.current = true; fit(); });
    return () => cancelAnimationFrame(frame);
  }, [fit]);

  const toBoard = (clientX: number, clientY: number) => {
    const rect = surface.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - view.x) / view.zoom, y: (clientY - rect.top - view.y) / view.zoom };
  };
  const centre = () => {
    const element = surface.current!;
    return { x: (element.clientWidth / 2 - view.x) / view.zoom, y: (element.clientHeight / 2 - view.y) / view.zoom };
  };
  const add = (kind: BoardItem['kind'], at = centre(), extra: Partial<BoardItem> = {}, exact = false) => {
    const size = { w: kind === 'sticky' ? 170 : 200, h: kind === 'sticky' ? 150 : 90 };
    const item: BoardItem = { id: newId(), kind, x: Math.round(at.x - size.w / 2), y: Math.round(at.y - size.h / 2), ...size, text: '', color: kind === 'sticky' ? 'amber' : 'sky', ...extra };
    change(current => {
      // A double-click places the box exactly there; toolbar buttons find a free spot near the middle of the view.
      const spot = exact ? { x: item.x, y: item.y } : freeSpot(current.items, { x: item.x, y: item.y }, size);
      return { items: [...current.items, { ...item, ...spot }], edges: current.edges };
    });
    setSelection({ kind: 'item', id: item.id });
    requestAnimationFrame(() => (document.querySelector(`[data-board-item="${item.id}"] textarea`) as HTMLTextAreaElement | null)?.focus());
  };
  const addLink = (target: string, label: string) => add('card', centre(), { target, label, color: 'violet' });
  const removeSelected = () => {
    if (!selection) return;
    change(current => removeBoardItems(current, new Set([selection.id])));
    setSelection(null);
  };
  const updateItem = (id: string, patch: Partial<BoardItem>) => change(current => ({ items: current.items.map(item => (item.id === id ? { ...item, ...patch } : item)), edges: current.edges }));
  const updateEdge = (id: string, patch: Partial<BoardEdge>) => change(current => ({ items: current.items, edges: current.edges.map(edge => (edge.id === id ? { ...edge, ...patch } : edge)) }));
  const clickItem = (id: string) => {
    if (connectFrom === undefined) { setSelection({ kind: 'item', id }); return; }
    if (connectFrom === null) { setConnectFrom(id); return; }
    if (connectFrom !== id && !board.edges.some(edge => edge.from === connectFrom && edge.to === id)) {
      const edge: BoardEdge = { id: newId(), from: connectFrom, to: id, label: '' };
      change(current => ({ items: current.items, edges: [...current.edges, edge] }));
      setSelection({ kind: 'edge', id: edge.id });
    }
    setConnectFrom(undefined);
  };
  const zoomBy = (factor: number, clientX?: number, clientY?: number) => {
    const rect = surface.current!.getBoundingClientRect();
    const px = clientX === undefined ? rect.width / 2 : clientX - rect.left, py = clientY === undefined ? rect.height / 2 : clientY - rect.top;
    setView(current => {
      const zoom = Math.min(3, Math.max(0.15, current.zoom * factor));
      return { zoom, x: px - ((px - current.x) / current.zoom) * zoom, y: py - ((py - current.y) / current.zoom) * zoom };
    });
  };
  // Keyboard: Delete removes the selection, arrows nudge a box, Escape ends arrow drawing.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement)?.closest?.('textarea,input,select');
      if (event.key === 'Escape') { if (connectFrom !== undefined) setConnectFrom(undefined); else if (!typing) onClose(); return; }
      if (typing || !selection) return;
      if (event.key === 'Delete') { event.preventDefault(); removeSelected(); return; }
      const step = event.shiftKey ? 50 : 10;
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      if (move && selection.kind === 'item') {
        event.preventDefault();
        const item = board.items.find(entry => entry.id === selection.id);
        if (item) updateItem(item.id, { x: item.x + move[0], y: item.y + move[1] });
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const byId = useMemo(() => new Map(board.items.map(item => [item.id, item])), [board.items]);
  const selectedItem = selection?.kind === 'item' ? byId.get(selection.id) : undefined;
  const selectedEdge = selection?.kind === 'edge' ? board.edges.find(edge => edge.id === selection.id) : undefined;
  const control = 'inline-flex items-center gap-1 rounded-lg border border-subtle bg-surface px-2 py-1.5 text-xs hover:bg-canvas disabled:opacity-40';
  const saveText = { idle: '', saving: t('boardsSaving'), saved: t('boardsSaved'), failed: t('boardsFailed'), conflict: t('boardsConflict') }[save];

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-3 py-2">
      <input data-board-title aria-label={t('boardsTitleLabel')} value={board.title} maxLength={200} dir="auto" placeholder={t('boardsUntitled')}
        onChange={event => { const title = event.target.value; setBoard(current => ({ ...current, title })); setDirty(true); }}
        className="min-w-0 flex-1 basis-40 rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm font-bold" />
      <button type="button" data-board-add="card" className={control} onClick={() => add('card')}><Square size={14} />{t('boardsAddCard')}</button>
      <button type="button" data-board-add="sticky" className={control} onClick={() => add('sticky')}><StickyNote size={14} />{t('boardsAddSticky')}</button>
      <button type="button" data-board-connect aria-pressed={connectFrom !== undefined} title={t('boardsConnectHint')} className={`${control} ${connectFrom !== undefined ? 'ring-2 ring-amber-500' : ''}`} onClick={() => setConnectFrom(connectFrom === undefined ? null : undefined)}><ArrowUpRight size={14} className="rtl:-scale-x-100" />{t('boardsConnect')}</button>
      <select data-board-note aria-label={t('boardsLinkNote')} value="" onChange={event => { const note = notes.find(entry => entry.id === event.target.value); if (note) addLink(`note:${note.id}`, note.title || note.content.slice(0, 60)); }} className="max-w-48 rounded-lg border border-subtle bg-surface px-2 py-1.5 text-xs">
        <option value="">{t('boardsLinkNote')}</option>
        {notes.map(note => <option key={note.id} value={note.id}>{note.title || note.content.slice(0, 60)}</option>)}
      </select>
      <input data-board-paste aria-label={t('boardsLinkPaste')} placeholder={t('boardsLinkPaste')} value={linkText} dir={linkText ? 'auto' : undefined} onChange={event => setLinkText(event.target.value)}
        onKeyDown={event => { if (event.key !== 'Enter') return; const link = studyLinks(linkText)[0]; if (link) { addLink(link.target, link.label); setLinkText(''); } }}
        className="w-44 rounded-lg border border-subtle bg-surface px-2 py-1.5 text-xs" />
      <span className="ms-auto flex items-center gap-1">
        <button type="button" aria-label={t('boardsZoomOut')} title={t('boardsZoomOut')} className={control} onClick={() => zoomBy(1 / 1.2)}><ZoomOut size={14} /></button>
        <span className="w-10 text-center text-xs tabular-nums" dir="ltr">{Math.round(view.zoom * 100)}%</span>
        <button type="button" aria-label={t('boardsZoomIn')} title={t('boardsZoomIn')} className={control} onClick={() => zoomBy(1.2)}><ZoomIn size={14} /></button>
        <button type="button" aria-label={t('boardsZoomReset')} title={t('boardsZoomReset')} className={control} onClick={fit}><Maximize size={14} /></button>
      </span>
    </div>
    {(selectedItem || selectedEdge) && <div data-board-selection className="flex flex-wrap items-center gap-2 border-b border-subtle px-3 py-1.5 text-xs">
      {selectedItem && <span className="flex items-center gap-1" role="group" aria-label={t('boardsColor')}>{BOARD_COLORS.map(color => <button key={color} type="button" data-board-color={color} aria-label={t(colorKeys[color])} title={t(colorKeys[color])} aria-pressed={selectedItem.color === color} onClick={() => updateItem(selectedItem.id, { color })} className={`size-5 rounded-full border-2 ${swatch[color]} ${selectedItem.color === color ? 'ring-2 ring-offset-1 ring-amber-600' : ''}`} />)}</span>}
      {selectedEdge && <label className="flex items-center gap-2">{t('boardsArrowLabel')}<input data-board-edge-label autoFocus value={selectedEdge.label} maxLength={200} dir="auto" onChange={event => updateEdge(selectedEdge.id, { label: event.target.value })} className="w-48 rounded border border-subtle bg-canvas px-2 py-1" /></label>}
      <button type="button" data-board-delete className={`${control} text-red-600`} onClick={removeSelected}><Trash2 size={13} />{t('boardsDelete')}</button>
    </div>}
    {connectFrom !== undefined && <p role="status" className="bg-amber-500/15 px-3 py-1 text-xs">{t(connectFrom ? 'boardsConnectTo' : 'boardsConnectHint')}</p>}
    {/* Board space is physical (x to the right), the same in both languages; text inside each box follows its own direction. */}
    <div ref={surface} data-board-surface role="application" aria-label={t('boardsCanvas')} dir="ltr" tabIndex={-1}
      className={`relative min-h-0 flex-1 touch-none overflow-hidden bg-canvas ${connectFrom !== undefined ? 'cursor-crosshair' : 'cursor-grab'}`}
      style={{ backgroundImage: 'radial-gradient(circle, rgb(128 128 128 / 0.25) 1px, transparent 1px)', backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onWheel={event => zoomBy(event.deltaY > 0 ? 1 / 1.1 : 1.1, event.clientX, event.clientY)}
      onDoubleClick={event => { if (event.target === event.currentTarget) add('sticky', toBoard(event.clientX, event.clientY), {}, true); }}
      onPointerDown={event => { if (event.target !== event.currentTarget) return; setSelection(null); drag.current = { mode: 'pan', x: event.clientX, y: event.clientY, start: { x: view.x, y: view.y, w: 0, h: 0 } }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current) return;
        const dx = event.clientX - current.x, dy = event.clientY - current.y;
        if (current.mode === 'pan') setView(previous => ({ ...previous, x: current.start.x + dx, y: current.start.y + dy }));
        else if (current.mode === 'move') updateItem(current.id!, { x: Math.round(current.start.x + dx / view.zoom), y: Math.round(current.start.y + dy / view.zoom) });
        else updateItem(current.id!, { w: Math.max(60, Math.round(current.start.w + dx / view.zoom)), h: Math.max(40, Math.round(current.start.h + dy / view.zoom)) });
      }}
      onPointerUp={() => { drag.current = null; }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
          <defs><marker id="board-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
          {board.edges.map(edge => {
            const from = byId.get(edge.from), to = byId.get(edge.to);
            if (!from || !to) return null;
            const { x1, y1, x2, y2 } = edgeEndpoints(from, to);
            const chosen = selection?.kind === 'edge' && selection.id === edge.id;
            return <g key={edge.id} className="pointer-events-auto cursor-pointer text-main" data-board-edge={edge.id} onPointerDown={event => event.stopPropagation()} onClick={() => setSelection({ kind: 'edge', id: edge.id })}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={chosen ? '#d97706' : 'currentColor'} strokeOpacity={chosen ? 1 : 0.6} strokeWidth={chosen ? 2.5 : 1.6} markerEnd="url(#board-arrow)" />
            </g>;
          })}
        </svg>
        {board.edges.map(edge => {
          const from = byId.get(edge.from), to = byId.get(edge.to);
          if (!from || !to || !edge.label) return null;
          const { x1, y1, x2, y2 } = edgeEndpoints(from, to);
          return <button key={edge.id} type="button" data-board-edge-text={edge.id} dir="auto" onPointerDown={event => event.stopPropagation()} onClick={() => setSelection({ kind: 'edge', id: edge.id })}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-subtle bg-surface px-2 py-0.5 text-xs text-main shadow-sm" style={{ left: (x1 + x2) / 2, top: (y1 + y2) / 2 }}>{edge.label}</button>;
        })}
        {board.items.map(item => {
          const chosen = selection?.kind === 'item' && selection.id === item.id;
          const source = connectFrom === item.id;
          return <div key={item.id} data-board-item={item.id} data-board-kind={item.kind}
            className={`absolute flex flex-col rounded-xl border-2 text-main shadow-sm ${swatch[item.color]} ${item.kind === 'sticky' ? 'rounded-sm shadow-md' : ''} ${chosen || source ? 'ring-2 ring-amber-600' : ''}`}
            style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
            onPointerDown={event => { event.stopPropagation(); if (connectFrom !== undefined) return; setSelection({ kind: 'item', id: item.id }); }}
            onClick={event => { if (connectFrom !== undefined) { event.preventDefault(); clickItem(item.id); } }}>
            {/* The strip on top moves the box; the text below stays selectable and editable. */}
            <div data-board-handle className="h-3 shrink-0 cursor-move rounded-t-lg bg-black/5 dark:bg-white/10"
              onPointerDown={event => { if (connectFrom !== undefined) return; event.stopPropagation(); setSelection({ kind: 'item', id: item.id }); drag.current = { mode: 'move', id: item.id, x: event.clientX, y: event.clientY, start: { x: item.x, y: item.y, w: item.w, h: item.h } }; surface.current?.setPointerCapture(event.pointerId); }} />
            {item.target && <div className="flex items-center gap-1 px-2 pt-1 text-xs font-bold" dir="auto">
              <span className="min-w-0 flex-1 truncate">{item.label || item.target}</span>
              <button type="button" data-board-open className="shrink-0 rounded bg-surface/80 px-1.5 underline" onPointerDown={event => event.stopPropagation()}
                onClick={() => { onClose(); void navigateStudyReference(item.target!, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor })).catch(() => {}); }}>{t('boardsOpenLink')}</button>
            </div>}
            <textarea aria-label={t('boardsItemText')} value={item.text} dir="auto" maxLength={4000} readOnly={connectFrom !== undefined}
              onFocus={() => setSelection({ kind: 'item', id: item.id })}
              onChange={event => updateItem(item.id, { text: event.target.value })}
              className="min-h-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-relaxed outline-none" />
            <div data-board-resize aria-hidden="true" className="absolute bottom-0 right-0 size-3 cursor-se-resize"
              onPointerDown={event => { event.stopPropagation(); drag.current = { mode: 'resize', id: item.id, x: event.clientX, y: event.clientY, start: { x: item.x, y: item.y, w: item.w, h: item.h } }; surface.current?.setPointerCapture(event.pointerId); }} />
          </div>;
        })}
      </div>
      {!board.items.length && <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-muted" dir="auto">{t('boardsEmpty')}</p>}
    </div>
    <p role="status" data-board-save={save} className="min-h-6 border-t border-subtle px-3 py-1 text-xs text-muted">{saveText}</p>
  </div>;
}

/** Boards (S6): a list of boards and the open one. Opened from Notes; Escape or the close button returns there. */
export function BoardsWorkspace({ notes, onClose }: { notes: StudyNote[]; onClose: () => void }) {
  const { t, dir } = useWorkspace();
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [open, setOpen] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => window.electronAPI.boards.list().then(setBoards, () => setFailed(true)), []);
  useEffect(() => {
    void load();
    return window.electronAPI.boards.onChanged(() => { void load(); });
  }, [load]);
  const create = async (preset: BoardPreset) => {
    setFailed(false);
    const words = { centre: t('boardsWordCentre'), branch: t('boardsWordBranch'), claim: t('boardsWordClaim'), reason: t('boardsWordReason'), objection: t('boardsWordObjection'), supports: t('boardsWordSupports'), opposes: t('boardsWordOpposes') };
    try {
      const board = await window.electronAPI.boards.save({ id: newId(), title: t(presetKeys[preset]), preset, ...presetBoard(preset, words, newId), expectedRevision: 0 });
      setOpen(board); void load();
    } catch { setFailed(true); }
  };
  const remove = async (id: string) => {
    if (!window.confirm(t('boardsDeleteConfirm'))) return;
    try { await window.electronAPI.boards.remove(id); if (open?.id === id) setOpen(null); void load(); } catch { setFailed(true); }
  };
  const onSaved = useCallback((board: Board) => setBoards(current => [ { id: board.id, title: board.title, preset: board.preset, items: board.items.length, updatedAt: board.updatedAt }, ...current.filter(entry => entry.id !== board.id)]), []);
  const presetIcon = { blank: <Plus size={14} />, mind: <Brain size={14} />, argument: <Scale size={14} /> };
  return <div className="fixed inset-0 z-[85] flex bg-black/40 p-2 sm:p-4" dir={dir}>
    <div role="dialog" aria-modal="true" aria-labelledby="boards-title" data-boards className="flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-subtle bg-surface text-main shadow-2xl">
      <header className="flex items-center gap-2 border-b border-subtle px-4 py-2">
        <LayoutGrid size={16} aria-hidden="true" />
        <h2 id="boards-title" className="text-sm font-bold">{t('boardsTitle')}</h2>
        {open && <button type="button" data-boards-back className="ms-2 inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1 text-xs" onClick={() => setOpen(null)}><Minus size={13} />{t('boardsAll')}</button>}
        <button type="button" aria-label={t('close')} title={t('close')} onClick={onClose} className="ms-auto rounded p-1 hover:bg-canvas"><X size={16} /></button>
      </header>
      {failed && <p role="alert" className="px-4 py-1 text-xs text-red-600">{t('boardsFailed')}</p>}
      {open ? <BoardCanvas key={open.id} initial={open} notes={notes} onClose={onClose} onSaved={onSaved} /> : <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap gap-2">{(['blank', 'mind', 'argument'] as const).map(preset => <button key={preset} type="button" data-boards-new={preset} onClick={() => void create(preset)} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm text-white">{presetIcon[preset]}{t(presetKeys[preset])}</button>)}</div>
        {!boards.length && <p className="text-sm text-muted">{t('boardsNone')}</p>}
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{boards.map(board => <li key={board.id} data-boards-entry={board.id} className="flex items-center gap-2 rounded-xl border border-subtle bg-canvas p-3">
          <button type="button" className="min-w-0 flex-1 text-start" onClick={() => void window.electronAPI.boards.get(board.id).then(found => { if (found) setOpen(found); }, () => setFailed(true))}>
            <span className="block truncate font-bold" dir="auto">{board.title || t('boardsUntitled')}</span>
            <span className="block text-xs text-muted">{t(presetKeys[board.preset])} · {t('boardsItems', { count: board.items })}</span>
          </button>
          <button type="button" aria-label={t('boardsDeleteBoard')} title={t('boardsDeleteBoard')} onClick={() => void remove(board.id)} className="rounded p-1 text-red-600 hover:bg-surface"><Trash2 size={15} /></button>
        </li>)}</ul>
      </div>}
    </div>
  </div>;
}
