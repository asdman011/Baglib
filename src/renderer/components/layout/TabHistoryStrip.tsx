'use client';

/**
 * KEY-420 (WS-4): the back and forward arrows under the tab bar, for the focused tab's own history.
 *
 * - Click goes one step. Pressing and holding an arrow, or right-clicking it, opens that direction's history
 *   list (nearest first, an icon and a title per entry), as Edge does; clicking an entry jumps there.
 * - In Arabic the strip is mirrored: back is on the right and points right.
 * - Presentational: the workspace wires `onGo` to the tab reducer's `go` action.
 */
import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { TranslationKey } from '../../translations';
import { backEntries, canGoBack, canGoForward, forwardEntries, type WorkspaceTab } from '../../../shared/workspace-tabs';
import { HISTORY_HOLD_MS, locationLabel, tabIcon, type HistoryCommand } from './tab-bar-model';

export interface TabHistoryStripProps {
  tab: WorkspaceTab | undefined;
  dir: 'rtl' | 'ltr';
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  /** Jump to an entry of the tab's history. Back and forward are `index - 1` and `index + 1`. */
  onGo: (index: number) => void;
  /** Room after the arrows (WS-9 puts the split controls here). */
  children?: React.ReactNode;
}

export const TabHistoryStrip: React.FC<TabHistoryStripProps> = ({ tab, dir, t, onGo, children }) => {
  const [open, setOpen] = React.useState<HistoryCommand | null>(null);
  const holdTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldOpen = React.useRef(false);
  const stripRef = React.useRef<HTMLDivElement>(null);

  const clearHold = () => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; } };
  React.useEffect(() => clearHold, []);

  // Close the list on Escape or a click elsewhere.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(null); };
    const onDown = (event: PointerEvent) => { if (!stripRef.current?.contains(event.target as Node)) setOpen(null); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open]);

  // A different tab, or a step, closes the list.
  const position = tab ? `${tab.id}:${tab.index}` : '';
  const [shownFor, setShownFor] = React.useState(position);
  if (shownFor !== position) { setShownFor(position); if (open) setOpen(null); }

  const entries = (command: HistoryCommand) => (tab ? (command === 'back' ? backEntries(tab) : forwardEntries(tab)) : []);
  const enabled = (command: HistoryCommand) => !!tab && (command === 'back' ? canGoBack(tab) : canGoForward(tab));

  const step = (command: HistoryCommand) => {
    if (!tab || !enabled(command)) return;
    onGo(command === 'back' ? tab.index - 1 : tab.index + 1);
  };

  const arrow = (command: HistoryCommand) => {
    const isBack = command === 'back';
    // The back arrow points toward where the user came from: left in English, right in Arabic.
    const Icon = (isBack === (dir === 'ltr')) ? ArrowLeft : ArrowRight;
    const label = t(isBack ? 'workspaceTabBack' : 'workspaceTabForward');
    const disabled = !enabled(command);
    return (
      <div className="relative">
        <button
          type="button"
          data-history={command}
          disabled={disabled}
          aria-label={label}
          title={label}
          aria-haspopup="menu"
          aria-expanded={open === command}
          onPointerDown={event => {
            if (event.button !== 0 || disabled) return;
            heldOpen.current = false;
            clearHold();
            holdTimer.current = setTimeout(() => { heldOpen.current = true; setOpen(command); }, HISTORY_HOLD_MS);
          }}
          onPointerUp={clearHold}
          onPointerLeave={clearHold}
          onClick={() => { if (heldOpen.current) { heldOpen.current = false; return; } step(command); }}
          onContextMenu={event => { event.preventDefault(); if (!disabled) setOpen(command); }}
          onKeyDown={event => { if (event.key === 'ArrowDown' && !disabled) { event.preventDefault(); setOpen(command); } }}
          className="rounded-md p-1 text-muted transition-colors hover:bg-canvas hover:text-main focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
        {open === command && (
          <HistoryList
            label={t(isBack ? 'workspaceTabBackList' : 'workspaceTabForwardList')}
            items={entries(command).map(entry => ({ index: entry.index, label: locationLabel(entry.location, t), Icon: tabIcon(entry.location.view) }))}
            onPick={index => { setOpen(null); onGo(index); }}
          />
        )}
      </div>
    );
  };

  return (
    <div ref={stripRef} dir={dir} data-tab-history-strip className="flex items-center gap-0.5">
      {arrow('back')}
      {arrow('forward')}
      {children}
    </div>
  );
};

interface HistoryListProps {
  label: string;
  items: { index: number; label: string; Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }> }[];
  onPick: (index: number) => void;
}

/** The history list under an arrow; arrow keys move, Enter picks, Escape closes (handled by the strip). */
const HistoryList: React.FC<HistoryListProps> = ({ label, items, onPick }) => {
  const listRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(); }, []);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const all = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    all[(at + (event.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
  };
  return (
    <div
      ref={listRef}
      role="menu"
      aria-label={label}
      data-history-list
      onKeyDown={onKeyDown}
      className="absolute top-full z-50 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-subtle bg-surface p-1 shadow-lg [inset-inline-start:0]"
    >
      {items.map(item => (
        <button
          key={item.index}
          type="button"
          role="menuitem"
          data-history-index={item.index}
          onClick={() => onPick(item.index)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs leading-normal text-main hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none"
        >
          <item.Icon className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate" dir="auto">{item.label}</span>
        </button>
      ))}
    </div>
  );
};
