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
import { Plus, X } from 'lucide-react';
import type { TranslationKey } from '../../translations';
import { currentLocation, type WorkspaceTab } from '../../../shared/workspace-tabs';
import { DRAG_THRESHOLD_PX, dropIndex, tabIcon, tabLabel, type TabSpan } from './tab-bar-model';

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
  /** Room after the + button, for the quick-open panel (WS-6). */
  endSlot?: React.ReactNode;
}

interface DragState { id: string; startX: number; spans: TabSpan[]; target: number; moved: boolean }

/** The order shown while a tab is dragged: the dragged tab already at its landing index. */
function previewOrder(tabs: WorkspaceTab[], drag: DragState | null): WorkspaceTab[] {
  if (!drag?.moved) return tabs;
  const dragged = tabs.find(tab => tab.id === drag.id);
  if (!dragged) return tabs;
  const rest = tabs.filter(tab => tab.id !== drag.id);
  return [...rest.slice(0, drag.target), dragged, ...rest.slice(drag.target)];
}

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeId, dir, t, onActivate, onClose, onMove, onNew, asleep, endSlot }) => {
  const listRef = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const suppressClick = React.useRef(false);
  const [announcement, setAnnouncement] = React.useState('');

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
    onMove(id, toIndex);
    setAnnouncement(t('workspaceTabMoved', { position: toIndex + 1, count: tabs.length }));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0) return;
    const index = tabs.findIndex(tab => tab.id === id);
    setDragState({ id, startX: event.clientX, spans: spansNow(), target: Math.max(0, index), moved: false });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    if (!current) return;
    const moved = current.moved || Math.abs(event.clientX - current.startX) >= DRAG_THRESHOLD_PX;
    if (!moved) return;
    const target = dropIndex(event.clientX, current.spans, current.id, dir);
    if (moved !== current.moved || target !== current.target) setDragState({ ...current, moved, target });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragState(null);
    if (current?.moved) {
      suppressClick.current = true;
      finishMove(current.id, current.target);
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
        {shown.map(tab => {
          const location = currentLocation(tab);
          const Icon = tabIcon(location.view);
          const label = tabLabel(tab, t);
          const active = tab.id === activeId;
          const dragging = drag?.moved && drag.id === tab.id;
          return (
            <div
              key={tab.id}
              role="tab"
              data-tab-id={tab.id}
              data-tab-view={location.view}
              data-asleep={asleep?.has(tab.id) ? '' : undefined}
              data-dragging={dragging ? '' : undefined}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={label}
              onPointerDown={event => onPointerDown(event, tab.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => setDragState(null)}
              onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onActivate(tab.id); }}
              onMouseDown={event => { if (event.button === 1) event.preventDefault(); }}
              onAuxClick={event => { if (event.button === 1) { event.preventDefault(); onClose(tab.id); } }}
              onKeyDown={event => onKeyDown(event, tab.id)}
              className={[
                'group flex h-8 min-w-[7.5rem] max-w-[13.75rem] shrink-0 cursor-default items-center gap-1.5 rounded-lg border ps-2.5 pe-1 text-xs leading-normal transition-colors',
                'focus-visible:outline-2 focus-visible:outline-focus touch-none',
                active ? 'border-primary/40 bg-primary/10 text-main' : 'border-transparent text-muted hover:bg-canvas hover:text-main',
                asleep?.has(tab.id) ? 'opacity-75' : '',
                dragging ? 'z-10 shadow-md ring-1 ring-primary/40' : '',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate py-0.5 text-start" dir="auto">{label}</span>
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
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onNew}
        aria-label={t('workspaceTabNew')}
        title={t('workspaceTabNew')}
        data-tab-new
        className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-main focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
      {endSlot}
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </div>
  );
};
