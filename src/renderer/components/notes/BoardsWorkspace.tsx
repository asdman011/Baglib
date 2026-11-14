'use client';
import { FeedbackSkeleton } from '../ui/FeedbackSkeleton';
import { useToast } from '../ui/Toast';

import { createBoardHistory, commitBoardChange, undoBoard, redoBoard, canUndoBoard, canRedoBoard } from '../../../shared/board-history';
import { itemsInMarquee, toggleSelection, selectionBounds, moveItems, duplicateSelection, alignItems, type Marquee } from '../../../shared/board-selection';
import { snapBoardRect, type SnapGuide } from '../../../shared/board-snap';
import { layoutBoardTree } from '../../../shared/board-layout';
import { boardEdgeGeometry, type EdgeShape } from '../../../shared/board-edge-path';
import { boardToNoteMarkdown } from '../../../shared/board-note';
import { BoardTools } from './BoardTools';
import { boardViewBends, alignmentForDirection, boardLayoutRoot, readBoardPreference, writeBoardPreference, exportBoardImage } from './board-ui';
import { ContextMenu } from '../ui/ContextMenu';
import { contextActions } from '../actions/context-actions';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Brain,
  LayoutGrid,
  Maximize,
  Plus,
  Scale,
  Square,
  StickyNote,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  BOARD_COLORS,
  freeSpot,
  presetBoard,
  removeBoardItems,
  type Board,
  type BoardColor,
  type BoardEdge,
  type BoardItem,
  type BoardPreset,
  type BoardSummary,
} from '../../../shared/boards';
import { studyLinks, type StudyNote } from '../../../shared/study-notes';
import type { TranslationKey } from '../../translations';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { Button, IconButton } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';

const newId = () => crypto.randomUUID();
const swatch: Record<BoardColor, string> = {
  amber: 'bg-amber-100 border-amber-400 dark:bg-amber-950 dark:border-amber-500',
  sky: 'bg-sky-100 border-sky-400 dark:bg-sky-950 dark:border-sky-500',
  emerald: 'bg-emerald-100 border-emerald-400 dark:bg-emerald-950 dark:border-emerald-500',
  rose: 'bg-rose-100 border-rose-400 dark:bg-rose-950 dark:border-rose-500',
  violet: 'bg-violet-100 border-violet-400 dark:bg-violet-950 dark:border-violet-500',
  slate: 'bg-slate-100 border-slate-400 dark:bg-slate-800 dark:border-slate-500',
};
const colorKeys: Record<BoardColor, TranslationKey> = {
  amber: 'boardsColorAmber',
  sky: 'boardsColorSky',
  emerald: 'boardsColorEmerald',
  rose: 'boardsColorRose',
  violet: 'boardsColorViolet',
  slate: 'boardsColorSlate',
};
const presetKeys: Record<BoardPreset, TranslationKey> = {
  blank: 'boardsPresetBlank',
  mind: 'boardsPresetMind',
  argument: 'boardsPresetArgument',
};
type View = { x: number; y: number; zoom: number };
type Selection = { kind: 'item' | 'edge'; id: string } | null;
type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'conflict';

function BoardItemContext({ item, onEdit, onRemove, ...props }: Omit<React.ComponentProps<typeof ContextMenu>, 'items'> & {
  item: BoardItem;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t, books, openBookForReading } = useWorkspace();
  return <ContextMenu {...props} items={contextActions('board', {
    open: item.target ? () => navigateStudyReference(item.target!, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor })) : undefined,
    copy: () => navigator.clipboard.writeText(item.text || item.label || ''),
    edit: onEdit,
    delete: onRemove,
  }, t)} />;
}

/** The board surface: cards, sticky notes and labelled arrows; pan by dragging the background, zoom with the wheel. */
function BoardCanvas({
  initial,
  notes,
  onBack,
  onSaved,
}: {
  initial: Board;
  notes: StudyNote[];
  onBack: () => void;
  onSaved: (board: Board) => void;
}) {
  const { t, dir, books, openBookForReading } = useWorkspace();
  const [board, setBoard] = useState(initial);
  const history = useRef(createBoardHistory(initial));
  const boardRef = useRef(initial);
  const [historyState, setHistoryState] = useState(() => createBoardHistory(initial));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [snapping, setSnapping] = useState<boolean>(() => readBoardPreference('snap', true));
  const [edgeShape, setEdgeShape] = useState<EdgeShape>(() => readBoardPreference(`shape.${initial.id}`, 'straight'));
  const [operation, setOperation] = useState(false);
  const [operationFailed, setOperationFailed] = useState(false);
  const saveQueue = useRef(Promise.resolve(true));
  const saveEpoch = useRef(0);
  const revision = useRef(initial.revision);
  const [dirty, setDirty] = useState(false);
  const [save, setSave] = useState<SaveState>('idle');
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [selection, setSelection] = useState<Selection>(null);
  const [connectFrom, setConnectFrom] = useState<string | null | undefined>(undefined);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: 'pan' | 'move' | 'resize' | 'marquee';
    tag: string;
    items: BoardItem[];
    ids: string[];
    id?: string;
    x: number;
    y: number;
    start: { x: number; y: number; w: number; h: number };
  } | null>(null);
  const [linkText, setLinkText] = useState('');

  const isRtl = dir === 'rtl';
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  const selectItem = (id: string, additive = false, preserve = false) => {
    const ids = preserve && selectedIds.includes(id) ? selectedIds : toggleSelection(selectedIds, id, additive);
    setSelectedIds(ids);
    setSelection(ids.length ? { kind: 'item', id: ids.at(-1)! } : null);
    return ids;
  };

  const change = useCallback(
    (update: (current: Board) => Pick<Board, 'items' | 'edges'> & Partial<Pick<Board, 'title'>>, tag?: string) => {
      const next = { ...boardRef.current, ...update(boardRef.current) };
      history.current = commitBoardChange(history.current, next, tag);
      setHistoryState(history.current);
      boardRef.current = next;
      setBoard(next);
      setDirty(true);
    }, []
  );

  const travelHistory = (redo: boolean) => {
    const previous = history.current;
    history.current = redo ? redoBoard(previous) : undoBoard(previous);
    setHistoryState(history.current);
    if (previous === history.current) return;
    const next = { ...boardRef.current, ...history.current.present };
    boardRef.current = next;
    setBoard(next);
    setSelectedIds(ids => ids.filter(id => next.items.some(item => item.id === id)));
    setDirty(true);
  };

  const persist = useCallback((snapshot: Board) => {
    const epoch = saveEpoch.current;
    saveQueue.current = saveQueue.current.then(async () => {
      if (epoch !== saveEpoch.current) return false;
      setSave('saving');
      const { id, title, preset, items, edges } = snapshot;
      try {
        const saved = await window.electronAPI.boards.save({ id, title, preset, items, edges, expectedRevision: revision.current });
        revision.current = saved.revision;
        setSave('saved');
        onSaved(saved);
        return true;
      } catch (error) {
        if (String(error).includes('board-conflict')) {
          saveEpoch.current++;
          const fresh = await window.electronAPI.boards.get(id).catch(() => null);
          if (fresh) {
            revision.current = fresh.revision;
            // Discard queued snapshots from this revision after an external edit.
            boardRef.current = fresh;
            history.current = createBoardHistory(fresh);
            setHistoryState(history.current);
            setBoard(fresh);
            setSelectedIds([]);
            setSelection(null);
            setDirty(false);
          }
          setSave('conflict');
        } else setSave('failed');
        return false;
      }
    });
    return saveQueue.current;
  }, [onSaved]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      setDirty(false);
      void persist(board);
    }, 500);
    return () => clearTimeout(timer);
  }, [board, dirty, persist]);

  const fit = useCallback(() => {
    const element = surface.current;
    if (!element) return;
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (!board.items.length) {
      setView({ x: width / 2, y: height / 2, zoom: 1 });
      return;
    }
    const minX = Math.min(...board.items.map((item) => item.x));
    const minY = Math.min(...board.items.map((item) => item.y));
    const maxX = Math.max(...board.items.map((item) => item.x + item.w));
    const maxY = Math.max(...board.items.map((item) => item.y + item.h));
    const zoom = Math.min(
      1.25,
      Math.max(0.2, Math.min((width - 80) / (maxX - minX || 1), (height - 80) / (maxY - minY || 1)))
    );
    setView({
      zoom,
      x: width / 2 - ((minX + maxX) / 2) * zoom,
      y: height / 2 - ((minY + maxY) / 2) * zoom,
    });
  }, [board.items]);

  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    const frame = requestAnimationFrame(() => {
      fitted.current = true;
      fit();
    });
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
    const item: BoardItem = {
      id: newId(),
      kind,
      x: Math.round(at.x - size.w / 2),
      y: Math.round(at.y - size.h / 2),
      ...size,
      text: '',
      color: kind === 'sticky' ? 'amber' : 'sky',
      ...extra,
    };
    change((current) => {
      const spot = exact ? { x: item.x, y: item.y } : freeSpot(current.items, { x: item.x, y: item.y }, size);
      return { items: [...current.items, { ...item, ...spot }], edges: current.edges };
    });
    setSelectedIds([item.id]);
    setSelection({ kind: 'item', id: item.id });
    requestAnimationFrame(() =>
      (document.querySelector(`[data-board-item="${item.id}"] textarea`) as HTMLTextAreaElement | null)?.focus()
    );
  };

  const addLink = (target: string, label: string) => add('card', centre(), { target, label, color: 'violet' });

  const updateItem = (id: string, patch: Partial<BoardItem>) =>
    change((current) => ({
      items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      edges: current.edges,
    }));

  const updateEdge = (id: string, patch: Partial<BoardEdge>) =>
    change((current) => ({
      items: current.items,
      edges: current.edges.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge)),
    }));

  const removeSelected = () => {
    if (!selection) return;
    if (selection.kind === 'item') {
      change((current) => removeBoardItems(current, new Set(selectedIds)));
    } else {
      change((current) => ({
        items: current.items,
        edges: current.edges.filter((edge) => edge.id !== selection.id),
      }));
    }
    setSelection(null);
    setSelectedIds([]);
  };

  const clickItem = (id: string) => {
    if (connectFrom === undefined) return;
    if (connectFrom === null) {
      setConnectFrom(id);
      return;
    }
    if (connectFrom === id) {
      setConnectFrom(undefined);
      return;
    }
    const edge = { id: newId(), from: connectFrom, to: id, label: '' };
    change((current) => ({
      items: current.items,
      edges: [...current.edges, edge],
    }));
    // KEY-322: the new arrow is selected so its label can be typed straight away.
    setSelectedIds([]);
    setSelection({ kind: 'edge', id: edge.id });
    setConnectFrom(undefined);
  };

  const zoomBy = (factor: number, clientX?: number, clientY?: number) => {
    const rect = surface.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX === undefined ? rect.width / 2 : clientX - rect.left;
    const py = clientY === undefined ? rect.height / 2 : clientY - rect.top;
    setView((current) => {
      const zoom = Math.min(3, Math.max(0.15, current.zoom * factor));
      return {
        zoom,
        x: px - ((px - current.x) / current.zoom) * zoom,
        y: py - ((py - current.y) / current.zoom) * zoom,
      };
    });
  };

  const duplicate = () => {
    const copied = duplicateSelection(boardRef.current, selectedIds, newId);
    change(() => copied.board);
    setSelectedIds(copied.newIds);
    setSelection(copied.newIds.length ? { kind: 'item', id: copied.newIds[0] } : null);
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement;
      if (target?.closest?.('input, textarea, select, [contenteditable=true], [role=menu]')) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        travelHistory(event.key.toLowerCase() === 'y' || event.shiftKey);
        return;
      }
      if (event.key === 'Escape') {
        setConnectFrom(undefined);
        setMarquee(null);
        return;
      }
      if (modifier && event.key.toLowerCase() === 'd' && selectedIds.length) {
        event.preventDefault();
        duplicate();
        return;
      }
      if (!selection) return;
      if (event.key === 'Delete') {
        event.preventDefault();
        removeSelected();
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      if (move && selectedIds.length) {
        event.preventDefault();
        change(current => ({ items: moveItems(current.items, selectedIds, move[0], move[1]), edges: current.edges }));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const runOperation = async (action: () => Promise<void>) => {
    setOperation(true);
    setOperationFailed(false);
    try { await action(); } catch { setOperationFailed(true); } finally { setOperation(false); }
  };
  const toNote = () => runOperation(async () => {
    if (!await persist(board)) throw new Error('board-save-failed');
    const content = boardToNoteMarkdown(board, { untitled: t('boardsUntitled'), connections: t('boardsConnections') }, selectedIds.length ? selectedIds : undefined);
    const note = await window.electronAPI.studyNotes.save({ title: board.title || t('boardsUntitled'), content, aliases: [], tags: [] });
    openStudyNote({ id: note.id });
  });
  const bends = useMemo(() => boardViewBends(board.edges), [board.edges]);
  const geometry = (edge: BoardEdge, from: BoardItem, to: BoardItem) =>
    boardEdgeGeometry(from, to, edgeShape, bends.get(edge.id) ?? 40);

  const byId = useMemo(() => new Map(board.items.map((item) => [item.id, item])), [board.items]);
  const selectedItem = selection?.kind === 'item' ? byId.get(selection.id) : undefined;
  const selectedEdge = selection?.kind === 'edge' ? board.edges.find((edge) => edge.id === selection.id) : undefined;

  const saveText = {
    idle: '',
    saving: t('boardsSaving'),
    saved: t('boardsSaved'),
    failed: t('boardsFailed'),
    conflict: t('boardsConflict'),
  }[save];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas select-none">
      {/* Modern U2 Primitives Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-subtle bg-surface px-4 py-2.5 shrink-0">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { void persist(board).then(saved => { if (saved) onBack(); }); }}
          icon={<BackIcon className="size-4" />}
          data-boards-back
        >
          {t('boardsAll')}
        </Button>

        <div className="h-4 w-px bg-subtle" />

        <input
          data-board-title
          aria-label={t('boardsTitleLabel')}
          value={board.title}
          maxLength={200}
          dir="auto"
          placeholder={t('boardsUntitled')}
          onChange={(event) => {
            const title = event.target.value;
            change(current => ({ ...current, title }));
          }}
          className="min-w-0 flex-1 basis-36 rounded-xl border border-subtle bg-canvas px-3 py-1.5 text-sm font-bold text-main outline-none focus-visible:outline-2 focus-visible:outline-focus"
        />

        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            data-board-add="card"
            onClick={() => add('card')}
            icon={<Square className="size-3.5" />}
          >
            {t('boardsAddCard')}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            data-board-add="sticky"
            onClick={() => add('sticky')}
            icon={<StickyNote className="size-3.5" />}
          >
            {t('boardsAddSticky')}
          </Button>

          <Button
            variant={connectFrom !== undefined ? 'primary' : 'secondary'}
            size="sm"
            data-board-connect
            aria-pressed={connectFrom !== undefined}
            title={t('boardsConnectHint')}
            onClick={() => setConnectFrom(connectFrom === undefined ? null : undefined)}
            icon={<ArrowUpRight className="size-3.5 rtl:-scale-x-100" />}
           aria-label={t('boardsConnectHint')}>
            {t('boardsConnect')}
          </Button>
        </div>

        <select
          data-board-note
          aria-label={t('boardsLinkNote')}
          value=""
          onChange={(event) => {
            const note = notes.find((entry) => entry.id === event.target.value);
            if (note) addLink(`note:${note.id}`, note.title || note.content.slice(0, 60));
          }}
          className="max-w-44 rounded-xl border border-subtle bg-canvas px-2.5 py-1.5 text-xs text-text outline-none"
        >
          <option value="">{t('boardsLinkNote')}</option>
          {notes.map((note) => (
            <option key={note.id} value={note.id}>
              {note.title || note.content.slice(0, 60)}
            </option>
          ))}
        </select>

        <input
          data-board-paste
          aria-label={t('boardsLinkPaste')}
          placeholder={t('boardsLinkPaste')}
          value={linkText}
          dir={linkText ? 'auto' : undefined}
          onChange={(event) => setLinkText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            const link = studyLinks(linkText)[0];
            if (link) {
              addLink(link.target, link.label);
              setLinkText('');
            }
          }}
          className="w-36 sm:w-44 rounded-xl border border-subtle bg-canvas px-2.5 py-1.5 text-xs text-text outline-none focus-visible:outline-focus"
        />

        {/* Zoom Controls built from U2 primitives */}
        <div className="ms-auto flex items-center gap-1 bg-canvas p-1 rounded-xl border border-subtle">
          <IconButton
            size="sm"
            label={t('boardsZoomOut')}
            onClick={() => zoomBy(1 / 1.2)}
          >
            <ZoomOut className="size-3.5" />
          </IconButton>
          <span
            className="w-11 text-center text-xs tabular-nums text-muted font-mono"
            dir="ltr"
            title={t('boardsZoomLevel')}
            aria-label={t('boardsZoomLevel')}
          >
            {Math.round(view.zoom * 100)}%
          </span>
          <IconButton
            size="sm"
            label={t('boardsZoomIn')}
            onClick={() => zoomBy(1.2)}
          >
            <ZoomIn className="size-3.5" />
          </IconButton>
          <IconButton
            size="sm"
            data-board-fit
            label={t('boardsZoomReset')}
            onClick={fit}
          >
            <Maximize className="size-3.5" />
          </IconButton>
        </div>
      </div>

      <BoardTools
        undoAvailable={canUndoBoard(historyState)}
        redoAvailable={canRedoBoard(historyState)}
        snapping={snapping}
        mindMap={board.preset === 'mind'}
        empty={!board.items.length}
        edgeShape={edgeShape}
        busy={operation}
        selectedCount={selectedIds.length}
        onUndo={() => travelHistory(false)}
        onRedo={() => travelHistory(true)}
        onToggleSnap={() => {
          setSnapping(!snapping);
          writeBoardPreference('snap', !snapping);
        }}
        onLayout={() => change(current => ({
          items: layoutBoardTree(current.items, current.edges, { rootId: boardLayoutRoot(current, selectedIds), direction: dir }),
          edges: current.edges,
        }))}
        onShape={shape => {
          setEdgeShape(shape);
          writeBoardPreference(`shape.${board.id}`, shape);
        }}
        onExport={format => void runOperation(() => exportBoardImage(board, format, selectedIds.length ? selectedIds : undefined, edgeShape))}
        onToNote={() => void toNote()}
        onAlign={mode => change(current => ({
          items: alignItems(current.items, selectedIds, alignmentForDirection(mode, dir)),
          edges: current.edges,
        }))}
        onDuplicate={duplicate}
      />
      {operationFailed && <p role="alert" className="px-3 py-1 text-xs text-danger">{t('boardsOperationFailed')}</p>}

      {/* Selection Sub-toolbar */}
      <div
          data-board-selection
          className="flex h-12 shrink-0 items-center gap-3 overflow-x-auto border-b border-subtle bg-canvas/80 px-4 py-2 text-xs [&>*]:shrink-0"
        >
          {selectedItem && (
            <span className="flex items-center gap-1.5" role="group" aria-label={t('boardsColor')}>
              {BOARD_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  data-board-color={color}
                  aria-label={t(colorKeys[color])}
                  title={t(colorKeys[color])}
                  aria-pressed={selectedItem.color === color}
                  onClick={() => updateItem(selectedItem.id, { color })}
                  className={`size-6 rounded-full border-2 cursor-pointer transition-transform ${swatch[color]} ${
                    selectedItem.color === color ? 'ring-2 ring-offset-1 ring-amber-600 scale-110' : ''
                  }`}
                />
              ))}
            </span>
          )}

          {selectedEdge && (
            <label className="flex items-center gap-2">
              <span className="text-muted">{t('boardsArrowLabel')}</span>
              <input
                data-board-edge-label
                autoFocus
                value={selectedEdge.label}
                maxLength={200}
                dir="auto"
                onChange={(event) => updateEdge(selectedEdge.id, { label: event.target.value })}
                className="w-48 rounded-lg border border-subtle bg-surface px-2.5 py-1 text-xs outline-none focus-visible:outline-focus"
              />
            </label>
          )}

          {(selectedItem || selectedEdge) && <Button
            variant="ghost"
            size="sm"
            data-board-delete
            onClick={removeSelected}
            className="text-danger hover:bg-danger/10 ms-auto"
            icon={<Trash2 className="size-3.5" />}
          >
            {t('boardsDelete')}
          </Button>}
        </div>

      {connectFrom !== undefined && (
        <p role="status" className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          {t(connectFrom ? 'boardsConnectTo' : 'boardsConnectHint')}
        </p>
      )}

      {/* Surface Canvas */}
      <div
        ref={surface}
        data-board-surface
        role="application"
        aria-label={t('boardsCanvas')}
        dir="ltr"
        tabIndex={0}
        className={`relative min-h-0 flex-1 touch-none overflow-hidden bg-canvas ${
          connectFrom !== undefined ? 'cursor-crosshair' : 'cursor-grab'
        }`}
        style={{
          backgroundImage: 'radial-gradient(circle, rgb(128 128 128 / 0.25) 1px, transparent 1px)',
          backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onWheel={(event) => zoomBy(event.deltaY > 0 ? 1 / 1.1 : 1.1, event.clientX, event.clientY)}
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) {
            add('sticky', toBoard(event.clientX, event.clientY), {}, true);
          }
        }}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          surface.current?.focus();
          setSelection(null);
          setSelectedIds([]);
          const point = toBoard(event.clientX, event.clientY);
          if (event.shiftKey) setMarquee({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
          drag.current = {
            mode: event.shiftKey ? 'marquee' : 'pan',
            tag: newId(), items: board.items, ids: [],
            x: event.clientX,
            y: event.clientY,
            start: { x: view.x, y: view.y, w: 0, h: 0 },
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          if (current.mode === 'pan') {
            setView((previous) => ({ ...previous, x: current.start.x + dx, y: current.start.y + dy }));
          } else if (current.mode === 'marquee') {
            const first = toBoard(current.x, current.y);
            const last = toBoard(event.clientX, event.clientY);
            const box = { x1: first.x, y1: first.y, x2: last.x, y2: last.y };
            setMarquee(box);
            const ids = itemsInMarquee(board.items, box, 'touch');
            setSelectedIds(ids);
            setSelection(ids.length ? { kind: 'item', id: ids[0] } : null);
          } else if (current.mode === 'move') {
            const bounds = selectionBounds(current.items, current.ids);
            if (!bounds) return;
            const moving = { ...bounds, x: bounds.x + dx / view.zoom, y: bounds.y + dy / view.zoom };
            const snapped = snapping && !event.altKey ? snapBoardRect(moving, current.items.filter(item => !current.ids.includes(item.id)), { threshold: 6 / view.zoom }) : { ...moving, guides: [] };
            setGuides(snapped.guides);
            change(previous => ({ items: moveItems(current.items, current.ids, snapped.x - bounds.x, snapped.y - bounds.y), edges: previous.edges }), current.tag);
          } else {
            change(previous => ({ items: previous.items.map(item => item.id === current.id ? { ...item, w: Math.max(60, Math.round(current.start.w + dx / view.zoom)), h: Math.max(40, Math.round(current.start.h + dy / view.zoom)) } : item), edges: previous.edges }), current.tag);
          }
        }}
        onPointerUp={() => {
          drag.current = null;
          setGuides([]);
          setMarquee(null);
        }}
        onLostPointerCapture={() => { drag.current = null; setGuides([]); setMarquee(null); }}
      >
        <div
          dir="ltr" className="absolute start-0 top-0"
          style={{ transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          <svg
            className="pointer-events-none absolute start-0 top-0 overflow-visible"
            width="1"
            height="1"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="board-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M0 0L10 5L0 10z" fill="currentColor" />
              </marker>
            </defs>
            {board.edges.map((edge) => {
              const from = byId.get(edge.from);
              const to = byId.get(edge.to);
              if (!from || !to) return null;
              const path = geometry(edge, from, to);
              const chosen = selection?.kind === 'edge' && selection.id === edge.id;
              return (
                <g
                  key={edge.id}
                  className="pointer-events-auto cursor-pointer text-main"
                  data-board-edge={edge.id}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => { setSelectedIds([]); setSelection({ kind: 'edge', id: edge.id }); }}
                >
                  <path d={path.d} fill="none" stroke="transparent" strokeWidth={14} />
                  <path
                    d={path.d}
                    data-board-path
                    data-end-angle={path.endAngle}
                    fill="none"
                    stroke={chosen ? '#d97706' : 'currentColor'}
                    strokeOpacity={chosen ? 1 : 0.6}
                    strokeWidth={chosen ? 2.5 : 1.6}
                    markerEnd="url(#board-arrow)"
                  />
                </g>
              );
            })}
          </svg>

          {board.edges.map((edge) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to || !edge.label) return null;
            const path = geometry(edge, from, to);
            return (
              <button
                key={edge.id}
                type="button"
                data-board-edge-text={edge.id}
                dir="auto"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => { setSelectedIds([]); setSelection({ kind: 'edge', id: edge.id }); }}
                className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-subtle bg-surface px-2.5 py-0.5 text-xs text-main shadow-xs"
                style={{ insetInlineStart: path.labelX, top: path.labelY }}
              >
                {edge.label}
              </button>
            );
          })}

          {marquee && <div data-board-marquee className="pointer-events-none absolute border border-primary-text bg-primary/10" style={{ insetInlineStart: Math.min(marquee.x1, marquee.x2), top: Math.min(marquee.y1, marquee.y2), width: Math.abs(marquee.x2 - marquee.x1), height: Math.abs(marquee.y2 - marquee.y1) }} />}
          <svg className="pointer-events-none absolute start-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
            {guides.map((guide, index) => <line key={index} data-board-guide x1={guide.axis === 'x' ? guide.position : guide.from} x2={guide.axis === 'x' ? guide.position : guide.to} y1={guide.axis === 'y' ? guide.position : guide.from} y2={guide.axis === 'y' ? guide.position : guide.to} stroke="#d97706" strokeWidth={1 / view.zoom} />)}
          </svg>
          {board.items.map((item) => {
            const chosen = selectedIds.includes(item.id);
            const source = connectFrom === item.id;
            return (
              <BoardItemContext item={item}
                onEdit={() => { selectItem(item.id); document.querySelector<HTMLTextAreaElement>(`[data-board-item="${item.id}"] textarea`)?.focus(); }}
                onRemove={() => change(current => removeBoardItems(current, new Set([item.id])))}
                key={item.id}
                data-board-item={item.id}
                data-board-kind={item.kind}
                className={`absolute flex flex-col rounded-xl border-2 text-main shadow-xs ${swatch[item.color]} ${
                  item.kind === 'sticky' ? 'rounded-sm shadow-sm' : ''
                } ${chosen || source ? 'ring-2 ring-amber-600' : ''}`}
                style={{ insetInlineStart: item.x, top: item.y, width: item.w, height: item.h }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (connectFrom !== undefined) return;
                  if (event.shiftKey || event.ctrlKey || event.metaKey) { event.preventDefault(); surface.current?.focus(); }
                  selectItem(item.id, event.shiftKey || event.ctrlKey || event.metaKey, !(event.shiftKey || event.ctrlKey || event.metaKey));
                }}
                onClick={(event) => {
                  if (connectFrom !== undefined) {
                    event.preventDefault();
                    clickItem(item.id);
                  }
                }}
              >
                <div
                  data-board-handle
                  className="h-3 shrink-0 cursor-move rounded-t-lg bg-black/5 dark:bg-white/10"
                  onPointerDown={(event) => {
                    if (connectFrom !== undefined) return;
                    event.stopPropagation();
                    const ids = selectItem(item.id, event.shiftKey || event.ctrlKey || event.metaKey, !(event.shiftKey || event.ctrlKey || event.metaKey));
                    surface.current?.focus();
                    drag.current = {
                      mode: 'move',
                      tag: newId(), items: board.items, ids,
                      id: item.id,
                      x: event.clientX,
                      y: event.clientY,
                      start: { x: item.x, y: item.y, w: item.w, h: item.h },
                    };
                    surface.current?.setPointerCapture(event.pointerId);
                  }}
                />
                {item.target && (
                  <div className="flex items-center gap-1 px-2 pt-1 text-xs font-bold" dir="auto">
                    <span className="min-w-0 flex-1 truncate">{item.label || item.target}</span>
                    <button
                      type="button"
                      data-board-open
                      className="shrink-0 rounded bg-surface/80 px-1.5 text-primary-text hover:underline"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => {
                        void navigateStudyReference(
                          item.target!,
                          books,
                          openBookForReading,
                          (id, anchor) => openStudyNote({ id, anchor })
                        ).catch(() => {});
                      }}
                    >
                      {t('boardsOpenLink')}
                    </button>
                  </div>
                )}
                <textarea
                  aria-label={t('boardsItemText')}
                  value={item.text}
                  dir="auto"
                  maxLength={4000}
                  readOnly={connectFrom !== undefined}
                  onFocus={() => { if (!selectedIds.includes(item.id)) selectItem(item.id); }}
                  onChange={(event) => updateItem(item.id, { text: event.target.value })}
                  className="min-h-0 flex-1 resize-none bg-transparent px-2.5 py-1 text-sm leading-[2] outline-none"
                  style={{ fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)" }}
                />
                <div
                  data-board-resize
                  aria-hidden="true"
                  className="absolute bottom-0 end-0 size-3 cursor-se-resize"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    drag.current = {
                      mode: 'resize',
                      tag: newId(), items: board.items, ids: [item.id],
                      id: item.id,
                      x: event.clientX,
                      y: event.clientY,
                      start: { x: item.x, y: item.y, w: item.w, h: item.h },
                    };
                    surface.current?.setPointerCapture(event.pointerId);
                  }}
                />
              </BoardItemContext>
            );
          })}
        </div>

        {/* Empty State when Canvas has 0 items */}
        {!board.items.length && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <EmptyState
              icon={<LayoutGrid className="size-8 text-muted" />}
              title={t('boardsEmptyCanvasDesc')}
              action={<Button size="sm" onClick={() => add('sticky')}>{t('boardsAddSticky')}</Button>}
              className="pointer-events-auto max-w-md"
            />
          </div>
        )}
      </div>

      {saveText && (
        <p role="status" data-board-save={save} className="min-h-6 border-t border-subtle px-4 py-1 text-xs text-muted">
          {saveText}
        </p>
      )}
    </div>
  );
}

/** Boards (S6): First-class view for boards in the workspace. */
export function BoardsWorkspace({
  notes,
  onClose,
}: {
  notes: StudyNote[];
  onClose?: () => void;
}) {
  const { t, dir } = useWorkspace();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [open, setOpen] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    () => { return window.electronAPI.boards.list().then(rows => { setBoards(rows); setFailed(false); }, () => setFailed(true)).finally(() => setLoading(false)); },
    []
  );

  useEffect(() => {
    void load();
    return window.electronAPI.boards.onChanged(() => {
      void load();
    });
  }, [load]);

  const create = async (preset: BoardPreset) => {
    setFailed(false);
    const words = {
      centre: t('boardsWordCentre'),
      branch: t('boardsWordBranch'),
      claim: t('boardsWordClaim'),
      reason: t('boardsWordReason'),
      objection: t('boardsWordObjection'),
      supports: t('boardsWordSupports'),
      opposes: t('boardsWordOpposes'),
    };
    try {
      const board = await window.electronAPI.boards.save({
        id: newId(),
        title: t(presetKeys[preset]),
        preset,
        ...presetBoard(preset, words, newId),
        expectedRevision: 0,
      });
      setOpen(board);
      void load();
    } catch {
      setFailed(true);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(t('boardsDeleteConfirm'))) return;
    try {
      const previous = await window.electronAPI.boards.get(id);
      await window.electronAPI.boards.remove(id);
      showToast({ message: t('feedbackRemoved'), duration: 8000, ...(previous ? { action: { label: t('undo'), onClick: async () => {
        await window.electronAPI.boards.save({ ...previous, expectedRevision: 0 });
        await load();
      } } } : {}) });
      if (open?.id === id) setOpen(null);
      void load();
    } catch {
      setFailed(true);
    }
  };

  const onSaved = useCallback((board: Board) => {
    setBoards((current) => [
      {
        id: board.id,
        title: board.title,
        preset: board.preset,
        items: board.items.length,
        updatedAt: board.updatedAt,
      },
      ...current.filter((entry) => entry.id !== board.id),
    ]);
  }, []);

  const presetIcon = {
    blank: <Plus className="size-4" />,
    mind: <Brain className="size-4" />,
    argument: <Scale className="size-4" />,
  };

  return (
    <div
      data-boards
      className="flex-1 min-h-0 flex flex-col bg-canvas text-main w-full h-full overflow-hidden"
      dir={dir}
    >
      {failed && (
        <p role="alert" className="px-4 py-2 text-xs text-danger bg-danger/10 border-b border-danger/20">
          {t('boardsFailed')} <button type="button" className="underline" onClick={() => { setLoading(true); void load(); }}>{t('lookupRetry')}</button>
        </p>
      )}

      {open ? (
        <BoardCanvas
          key={open.id}
          initial={open}
          notes={notes}
          onBack={() => setOpen(null)}
          onSaved={onSaved}
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Header & Create Preset Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-surface border border-subtle">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/10 border border-primary-text/20 flex items-center justify-center text-primary-text">
                <LayoutGrid className="size-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-main">{t('boardsTitle')}</h3>
                <p className="text-xs text-muted">{t('boardsAll')} · {boards.length}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['blank', 'mind', 'argument'] as const).map((preset) => (
                <Button
                  key={preset}
                  variant={preset === 'blank' ? 'primary' : 'secondary'}
                  size="sm"
                  data-boards-new={preset}
                  onClick={() => void create(preset)}
                  icon={presetIcon[preset]}
                >
                  {t(presetKeys[preset])}
                </Button>
              ))}
              {onClose && (
                <IconButton
                  size="sm"
                  label={t('close')}
                  onClick={onClose}
                >
                  <X className="size-4" />
                </IconButton>
              )}
            </div>
          </div>

          {/* Boards List or Empty State */}
          {loading ? <FeedbackSkeleton /> : !boards.length && !failed ? (
            <EmptyState
              icon={<LayoutGrid className="size-8 text-muted" />}
              title={t('boardsNone')}
              action={<Button variant="primary" size="sm" onClick={() => void create('blank')}>{t('boardsPresetBlank')}</Button>}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {boards.map((board) => (
                <li
                  key={board.id}
                  data-boards-entry={board.id}
                  className="group flex flex-col justify-between rounded-2xl border border-subtle bg-surface p-4 hover:border-primary-text/30 hover:shadow-sm transition-all"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-start space-y-2 cursor-pointer"
                    onClick={() =>
                      void window.electronAPI.boards.get(board.id).then(
                        (found) => {
                          if (found) setOpen(found);
                        },
                        () => setFailed(true)
                      )
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-lg bg-canvas text-muted group-hover:text-primary-text transition-colors">
                        {presetIcon[board.preset] || <LayoutGrid className="size-4" />}
                      </span>
                      <span className="block truncate font-bold text-main" dir="auto">
                        {board.title || t('boardsUntitled')}
                      </span>
                    </div>
                    <span className="block text-xs text-muted">
                      {t(presetKeys[board.preset])} · {t('boardsItems', { count: board.items })}
                    </span>
                  </button>

                  <div className="mt-3 flex items-center justify-between border-t border-subtle/80 pt-2 text-xs text-muted">
                    <span className="text-[11px] tabular-nums">
                      {new Date(board.updatedAt).toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-GB')}
                    </span>
                    <button
                      type="button"
                      aria-label={t('boardsDeleteBoard')}
                      title={t('boardsDeleteBoard')}
                      onClick={() => void remove(board.id)}
                      className="rounded-lg p-1 text-muted hover:text-danger hover:bg-canvas transition-colors"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
