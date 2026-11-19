'use client';

/**
 * KEY-419 (WS-3): the workspace tab bar. Presentational: it gets the tabs and reports what the user does, so
 * it doesn't depend on the workspace context and can sit in the titlebar once the tab providers exist.
 *
 * - Click focuses a tab; middle-click or × closes it; + opens a new tab.
 * - Dragging a tab along the bar reorders it (the others make room while it moves). The order follows the
 *   language: in Arabic the first tab is on the right.
 * - Keyboard: arrows move between tabs (mirrored in Arabic), Home/End, Delete closes,
 *   Ctrl+Shift+PageUp/PageDown move the focused tab.
 * - Too many tabs scroll sideways; the mouse wheel scrolls the bar.
 */
import React from 'react';
import { Columns2, Plus, Volume2, X } from 'lucide-react';
import type { TranslationKey } from '../../translations';
import { currentLocation, type TabGroup, type TabGroupColor, type WorkspaceTab } from '../../../shared/workspace-tabs';
import { isOutsideWindowBounds } from '../../../shared/workspace-window-transfer';
import { ContextMenu } from '../ui/ContextMenu';
import type { MenuItemProps } from '../ui/Menu';
import { DRAG_THRESHOLD_PX, dropIndex, tabIcon, tabLabel, type TabSpan } from './tab-bar-model';
import { edgeZone } from './split-model';

export interface TabBarProps {
  tabs: WorkspaceTab[];
  activeId: string | null;
  dir: 'rtl' | 'ltr';
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
  onNew: () => void;
  /** Tabs that are asleep (unmounted after saving), shown slightly dimmed. */
  asleep?: ReadonlySet<string>;
  /** Tabs playing audio or video, shown with a speaker icon (they never sleep). */
  playing?: ReadonlySet<string>;
  /** Room after the + button. */
  endSlot?: React.ReactNode;
  /**
   * KEY-422 (WS-6): the quick-open panel. Hovering the + button, or focusing it and pressing ↓, shows it;
   * clicking + still opens a new Home tab.
   */
  renderQuickOpen?: (props: { close: () => void; autoFocus: boolean }) => React.ReactNode;
  /**
   * KEY-425 (WS-9): a tab dragged down out of the bar and dropped near a side edge of the window opens side by
   * side. `end` is the second pane's side (right in English, left in Arabic).
   */
  onDropToEdge?: (id: string, side: 'start' | 'end') => void;
  /** KEY-425 (WS-9): opens a tab side by side from its right-click menu. */
  onOpenBeside?: (id: string) => void;
  /** KEY-428 (WS-10): multi-select and full tab right-click menu. */
  selectedIds?: ReadonlySet<string>;
  onTabClick?: (id: string, modifiers: { ctrl: boolean; shift: boolean }) => void;
  onClearSelection?: () => void;
  onExtendSelection?: (step: 1 | -1) => void;
  getTabMenuItems?: (id: string) => MenuItemProps[];
  onMoveSelection?: (ids: string[], toIndex: number) => void;
  /** KEY-426 (WS-11): tab groups UI. */
  groups?: TabGroup[];
  onToggleGroupCollapse?: (groupId: string) => void;
  getGroupMenuItems?: (groupId: string) => MenuItemProps[];
  onMoveGroup?: (groupId: string, toIndex: number) => void;
  /** KEY-427 (WS-12): dragging a tab outside window bounds detaches it to a new or target window. */
  onDetachTab?: (id: string, position: { x: number; y: number }) => void;
}

export const GROUP_COLOR_STYLES: Record<TabGroupColor, { chip: string; line: string; swatch: string }> = {
  grey:   { chip: 'border-zinc-500/50 bg-zinc-500/15 text-main',       line: 'border-b-2 border-b-zinc-400',    swatch: 'bg-zinc-400' },
  blue:   { chip: 'border-blue-500/50 bg-blue-500/15 text-main',       line: 'border-b-2 border-b-blue-400',    swatch: 'bg-blue-400' },
  red:    { chip: 'border-red-500/50 bg-red-500/15 text-main',         line: 'border-b-2 border-b-red-400',     swatch: 'bg-red-400' },
  yellow: { chip: 'border-amber-500/50 bg-amber-500/15 text-main',     line: 'border-b-2 border-b-amber-400',   swatch: 'bg-amber-400' },
  green:  { chip: 'border-emerald-500/50 bg-emerald-500/15 text-main', line: 'border-b-2 border-b-emerald-400', swatch: 'bg-emerald-400' },
  pink:   { chip: 'border-pink-500/50 bg-pink-500/15 text-main',       line: 'border-b-2 border-b-pink-400',    swatch: 'bg-pink-400' },
  purple: { chip: 'border-purple-500/50 bg-purple-500/15 text-main',   line: 'border-b-2 border-b-purple-400',  swatch: 'bg-purple-400' },
  cyan:   { chip: 'border-cyan-500/50 bg-cyan-500/15 text-main',       line: 'border-b-2 border-b-cyan-400',    swatch: 'bg-cyan-400' },
};

/** How far below the bar the pointer must go before a dragged tab counts as pulled out of it. */
const PULL_OUT_PX = 30;

/** Hover delays for the + panel, so passing over the button doesn't flash it. */
const QUICK_OPEN_DELAY_MS = 250;
const QUICK_OPEN_CLOSE_MS = 200;

interface DragState { id: string; groupId?: string; startX: number; spans: TabSpan[]; target: number; moved: boolean; out?: boolean; edge?: 'start' | 'end' | null }

/** The order shown while a tab is dragged: the dragged tab already at its landing index. */
function previewOrder(tabs: WorkspaceTab[], drag: DragState | null): WorkspaceTab[] {
  if (!drag?.moved || drag.out) return tabs;
  const dragged = tabs.find(tab => tab.id === drag.id);
  if (!dragged) return tabs;
  const rest = tabs.filter(tab => tab.id !== drag.id);
  return [...rest.slice(0, drag.target), dragged, ...rest.slice(drag.target)];
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs, activeId, dir, t, onActivate, onClose, onMove, onNew, asleep, playing, endSlot,
  renderQuickOpen, onDropToEdge, onOpenBeside, selectedIds, onTabClick, onClearSelection,
  onExtendSelection, getTabMenuItems, onMoveSelection, groups, onToggleGroupCollapse,
  getGroupMenuItems, onMoveGroup, onDetachTab,
}) => {
  const listRef = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const suppressClick = React.useRef(false);
  const [announcement, setAnnouncement] = React.useState('');
  const [quickOpen, setQuickOpen] = React.useState<null | 'hover' | 'keyboard'>(null);
  // Whether the pointer rests on the + button; the panel follows it after a short delay.
  const [hovering, setHovering] = React.useState(false);
  React.useEffect(() => {
    if (!renderQuickOpen) return;
    if (hovering && !quickOpen) { const id = setTimeout(() => setQuickOpen('hover'), QUICK_OPEN_DELAY_MS); return () => clearTimeout(id); }
    if (!hovering && quickOpen === 'hover') { const id = setTimeout(() => setQuickOpen(null), QUICK_OPEN_CLOSE_MS); return () => clearTimeout(id); }
  }, [hovering, quickOpen, renderQuickOpen]);
  // Closing also forgets the hover, so the panel doesn't reopen until the pointer comes back.
  const closeQuickOpen = () => { setHovering(false); setQuickOpen(null); };

  const setDragState = (next: DragState | null) => { dragRef.current = next; setDrag(next); };

  // Keep the focused tab in view when it changes or tabs overflow.
  React.useEffect(() => {
    if (!activeId) return;
    const element = listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeId)}"]`);
    element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeId, tabs.length]);

  const spansNow = (): TabSpan[] => [...(listRef.current?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? [])]
    .map(element => { const rect = element.getBoundingClientRect(); return { id: element.dataset.tabId!, start: rect.left, width: rect.width }; });

  const finishMove = (id: string, toIndex: number) => {
    const from = tabs.findIndex(tab => tab.id === id);
    if (from < 0 || from === toIndex) return;
    if (onMoveSelection && selectedIds && selectedIds.size > 1 && selectedIds.has(id)) {
      const group = tabs.filter(tab => selectedIds.has(tab.id)).map(tab => tab.id);
      onMoveSelection(group, toIndex);
    } else {
      onMove(id, toIndex);
    }
    setAnnouncement(t('workspaceTabMoved', { position: toIndex + 1, count: tabs.length }));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0) return;
    suppressClick.current = false;
    const index = tabs.findIndex(tab => tab.id === id);
    setDragState({ id, startX: event.clientX, spans: spansNow(), target: Math.max(0, index), moved: false });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onGroupPointerDown = (event: React.PointerEvent<HTMLElement>, groupId: string) => {
    if (event.button !== 0 || !onMoveGroup) return;
    suppressClick.current = false;
    const index = tabs.findIndex(tab => tab.groupId === groupId);
    if (index < 0) return;
    setDragState({ id: tabs[index].id, groupId, startX: event.clientX, spans: spansNow(), target: index, moved: false });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const isDetachedPointer = (event: React.PointerEvent<HTMLElement>): boolean => {
    if (typeof window === 'undefined') return false;
    const inViewport =
      event.clientX >= 0 &&
      event.clientX <= window.innerWidth &&
      event.clientY >= 0 &&
      event.clientY <= window.innerHeight;
    if (inViewport) return false;
    return isOutsideWindowBounds({ screenX: event.screenX, screenY: event.screenY }, window);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    if (!current) return;
    // Dragged outside the browser window: ready to detach into a new or existing window on release.
    if (!current.groupId && onDetachTab && isDetachedPointer(event)) {
      if (!current.out || current.edge !== null) setDragState({ ...current, moved: true, out: true, edge: null });
      return;
    }
    // Pulled down out of the bar: a drop near a side edge opens the tab side by side.
    const barBottom = listRef.current?.getBoundingClientRect().bottom ?? 0;
    if (!current.groupId && onDropToEdge && barBottom > 0 && event.clientY > barBottom + PULL_OUT_PX) {
      const edge = edgeZone(event.clientX, { left: 0, width: window.innerWidth }, dir);
      if (!current.out || edge !== current.edge) setDragState({ ...current, moved: true, out: true, edge });
      return;
    }
    const moved = current.moved || Math.abs(event.clientX - current.startX) >= DRAG_THRESHOLD_PX;
    if (!moved) return;
    const target = dropIndex(event.clientX, current.spans, current.id, dir);
    if (moved !== current.moved || target !== current.target || current.out) setDragState({ ...current, moved, target, out: false, edge: null });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragState(null);
    if (current && !current.groupId && onDetachTab && isDetachedPointer(event)) {
      suppressClick.current = true;
      onDetachTab(current.id, { x: event.screenX, y: event.screenY });
      return;
    }
    if (current?.out) {
      suppressClick.current = true;
      if (current.edge) onDropToEdge?.(current.id, current.edge);
      return;
    }
    if (current?.moved) {
      suppressClick.current = true;
      if (current.groupId) onMoveGroup?.(current.groupId, current.target);
      else finishMove(current.id, current.target);
    }
  };

  const focusTab = (id: string) => {
    onActivate(id);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`)?.focus());
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>, id: string) => {
    const at = tabs.findIndex(tab => tab.id === id);
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if (event.ctrlKey && event.shiftKey && (event.key === 'PageDown' || event.key === 'PageUp')) {
      event.preventDefault();
      const to = Math.max(0, Math.min(tabs.length - 1, at + (event.key === 'PageDown' ? 1 : -1)));
      finishMove(id, to);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && onExtendSelection) {
      event.preventDefault();
      onExtendSelection(event.key === forward ? 1 : -1);
      return;
    }
    if (event.key === 'Escape' && onClearSelection && (selectedIds?.size ?? 0) > 1) {
      event.preventDefault();
      onClearSelection();
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    let next: number | null = null;
    if (event.key === forward) next = (at + 1) % tabs.length;
    else if (event.key === backward) next = (at - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else if (event.key === 'Delete') { event.preventDefault(); onClose(id); return; }
    if (next === null) return;
    event.preventDefault();
    focusTab(tabs[next].id);
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const list = listRef.current;
    if (!list || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    list.scrollLeft += dir === 'rtl' ? -event.deltaY : event.deltaY;
  };

  const shown = previewOrder(tabs, drag);
  const groupById = new Map((groups ?? []).map(group => [group.id, group]));

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1" dir={dir} data-workspace-tabbar>
      <div
        ref={listRef}
        role="tablist"
        aria-label={t('workspaceTabsLabel')}
        aria-orientation="horizontal"
        onWheel={onWheel}
        className="flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
      >
        {shown.map((tab, index) => {
          const group = tab.groupId ? groupById.get(tab.groupId) : undefined;
          const groupStart = !!group && (index === 0 || shown[index - 1]?.groupId !== group.id);
          const style = group ? GROUP_COLOR_STYLES[group.color] : undefined;
          const groupChip = groupStart && group && style ? (
            <ContextMenu
              as="button"
              key={`group-${group.id}`}
              type="button"
              onOpenMenu={() => (getGroupMenuItems ? getGroupMenuItems(group.id) : [])}
              data-group-id={group.id}
              data-group-color={group.color}
              data-group-collapsed={group.collapsed ? '' : undefined}
              aria-expanded={!group.collapsed}
              title={group.name || t('workspaceGroupUntitled')}
              onPointerDown={event => onGroupPointerDown(event, group.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => setDragState(null)}
              onClick={() => {
                if (suppressClick.current) { suppressClick.current = false; return; }
                onToggleGroupCollapse?.(group.id);
              }}
              className={`flex h-7 max-w-[10rem] shrink-0 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-focus ${style.chip}`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${style.swatch}`} aria-hidden="true" />
              <span className="truncate" dir="auto">{group.name || t('workspaceGroupUntitled')}</span>
            </ContextMenu>
          ) : null;
          if (group?.collapsed) return groupChip;

          const location = currentLocation(tab);
          const Icon = tabIcon(location.view);
          const label = tabLabel(tab, t);
          const active = tab.id === activeId;
          const selected = selectedIds ? selectedIds.has(tab.id) : active;
          const dragging = drag?.moved && drag.id === tab.id;
          const tabMenuItems = (): MenuItemProps[] => {
            if (getTabMenuItems) return getTabMenuItems(tab.id);
            if (!onOpenBeside || tabs.length < 2) return [];
            return [{
              id: 'open-beside',
              label: t('workspaceTabOpenBeside'),
              icon: <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />,
              onClick: () => onOpenBeside(tab.id),
            }];
          };
          return (
            <React.Fragment key={tab.id}>
              {groupChip}
              <ContextMenu
                as="div"
                onOpenMenu={tabMenuItems}
              role="tab"
              data-tab-id={tab.id}
              data-tab-view={location.view}
              data-selected={selected ? '' : undefined}
              data-asleep={asleep?.has(tab.id) ? '' : undefined}
              data-dragging={dragging ? '' : undefined}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={label}
              onPointerDown={event => onPointerDown(event, tab.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => setDragState(null)}
              onClick={event => {
                if (suppressClick.current) { suppressClick.current = false; return; }
                if (onTabClick) onTabClick(tab.id, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey });
                else onActivate(tab.id);
              }}
              onMouseDown={event => { if (event.button === 1) event.preventDefault(); }}
              onAuxClick={event => { if (event.button === 1) { event.preventDefault(); onClose(tab.id); } }}
              onKeyDown={event => onKeyDown(event, tab.id)}
              className={[
                'group flex h-8 min-w-[7.5rem] max-w-[13.75rem] shrink-0 cursor-default items-center gap-1.5 rounded-lg border ps-2.5 pe-1 text-xs leading-normal transition-colors',
                'focus-visible:outline-2 focus-visible:outline-focus touch-none',
                active ? 'border-primary/40 bg-primary/10 text-main' : selected ? 'border-primary/35 bg-primary/5 text-main' : 'border-transparent text-muted hover:bg-canvas hover:text-main',
                style ? style.line : '',
                asleep?.has(tab.id) ? 'opacity-75' : '',
                dragging ? 'z-10 shadow-md ring-1 ring-primary/40' : '',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate py-0.5 text-start" dir="auto">{label}</span>
              {playing?.has(tab.id) && <Volume2 className="h-3 w-3 shrink-0 text-primary" role="img" aria-label={t('workspaceTabPlaying')} data-tab-playing />}
              <button
                type="button"
                tabIndex={-1}
                aria-label={`${t('workspaceTabClose')}: ${label}`}
                title={t('workspaceTabClose')}
                data-tab-close={tab.id}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => { event.stopPropagation(); onClose(tab.id); }}
                className={`shrink-0 rounded p-0.5 text-muted hover:bg-canvas hover:text-main ${active ? '' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
              </ContextMenu>
            </React.Fragment>
          );
        })}
      </div>
      <div
        className="relative shrink-0"
        data-quick-open-anchor
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <button
          type="button"
          onClick={() => { closeQuickOpen(); onNew(); }}
          onKeyDown={event => { if (event.key === 'ArrowDown' && renderQuickOpen) { event.preventDefault(); setQuickOpen('keyboard'); } }}
          aria-label={t('workspaceTabNew')}
          title={t('workspaceTabNew')}
          aria-haspopup={renderQuickOpen ? 'menu' : undefined}
          aria-expanded={renderQuickOpen ? !!quickOpen : undefined}
          data-tab-new
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-main focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        {quickOpen && renderQuickOpen && (
          <div className="absolute top-full z-50 pt-1 [inset-inline-end:0]">
            {renderQuickOpen({ close: closeQuickOpen, autoFocus: quickOpen === 'keyboard' })}
          </div>
        )}
      </div>
      {endSlot}
      <span className="sr-only" aria-live="polite">{announcement}</span>
      {drag?.out && drag.edge && (
        // Where the tab will go: the half of the window on that side.
        <div aria-hidden="true" data-split-drop={drag.edge} className={`pointer-events-none fixed inset-y-0 z-[70] w-1/2 border-2 border-dashed border-primary/60 bg-primary/10 ${drag.edge === 'end' ? '[inset-inline-end:0]' : '[inset-inline-start:0]'}`} />
      )}
    </div>
  );
};
