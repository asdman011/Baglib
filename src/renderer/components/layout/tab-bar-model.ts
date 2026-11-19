/**
 * KEY-419 (WS-3): the tab bar's pure rules. Keyboard shortcuts, the tab next to the focused one, where a
 * dragged tab lands, and each tab's label and icon. No React, so it is unit-tested directly.
 */
import type { LucideIcon } from 'lucide-react';
import { FileQuestion } from 'lucide-react';
import { NAV_ITEMS } from './nav-model';
import type { TranslationKey } from '../../translations';
import { currentLocation, type TabLocation, type TabsState, type WorkspaceTab, type WorkspaceView } from '../../../shared/workspace-tabs';

export type TabCommand =
  | { type: 'new' }
  | { type: 'close' }
  | { type: 'reopen' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'index'; index: number }
  | { type: 'last' };

interface KeyLike { key: string; code?: string; ctrlKey: boolean; metaKey?: boolean; shiftKey: boolean; altKey: boolean }

/**
 * Ctrl+T new, Ctrl+W (or Ctrl+F4) close, Ctrl+Shift+T reopen, Ctrl+Tab / Ctrl+PageDown next,
 * Ctrl+Shift+Tab / Ctrl+PageUp previous, Ctrl+1…8 a tab, Ctrl+9 the last tab. Cmd works like Ctrl.
 * Keys are read from `code` when present so Arabic keyboard layouts work the same.
 */
export function tabShortcut(event: KeyLike): TabCommand | null {
  const ctrl = event.ctrlKey || !!event.metaKey;
  if (!ctrl || event.altKey) return null;
  const code = event.code ?? '';
  const key = event.key.toLowerCase();
  if (code === 'Tab' || key === 'tab') return event.shiftKey ? { type: 'previous' } : { type: 'next' };
  if (code === 'PageDown' || key === 'pagedown') return event.shiftKey ? null : { type: 'next' };
  if (code === 'PageUp' || key === 'pageup') return event.shiftKey ? null : { type: 'previous' };
  if (code === 'KeyT' || (!code && key === 't')) return event.shiftKey ? { type: 'reopen' } : { type: 'new' };
  if (event.shiftKey) return null;
  if (code === 'KeyW' || code === 'F4' || (!code && (key === 'w' || key === 'f4'))) return { type: 'close' };
  const digit = /^Digit([1-9])$/u.exec(code)?.[1] ?? (!code && /^[1-9]$/u.test(key) ? key : undefined);
  if (digit) return digit === '9' ? { type: 'last' } : { type: 'index', index: Number(digit) - 1 };
  return null;
}

/** The tab a shortcut moves to (wrapping around), or null when it stays put. */
export function shortcutTarget(state: TabsState, command: TabCommand): string | null {
  const { tabs } = state;
  if (tabs.length === 0) return null;
  const at = Math.max(0, tabs.findIndex(tab => tab.id === state.activeId));
  switch (command.type) {
    case 'next': return tabs.length > 1 ? tabs[(at + 1) % tabs.length].id : null;
    case 'previous': return tabs.length > 1 ? tabs[(at - 1 + tabs.length) % tabs.length].id : null;
    case 'index': return tabs[command.index]?.id ?? null;
    case 'last': return tabs[tabs.length - 1].id;
    default: return null;
  }
}

/** A tab's box along the bar, in screen pixels. */
export interface TabSpan { id: string; start: number; width: number }

/**
 * Where a dragged tab lands: the index among the other tabs, from the pointer's x and the boxes of the tabs
 * as laid out. In RTL the bar runs right to left, so the first tab is the rightmost.
 */
export function dropIndex(pointerX: number, spans: TabSpan[], draggedId: string, dir: 'rtl' | 'ltr'): number {
  const others = spans.filter(span => span.id !== draggedId);
  let index = 0;
  for (const span of others) {
    const middle = span.start + span.width / 2;
    if (dir === 'ltr' ? pointerX > middle : pointerX < middle) index += 1;
  }
  return index;
}

/** A pointer that moved less than this is a click, not a drag. */
export const DRAG_THRESHOLD_PX = 5;

/** The navigation item that names a view, for its label and icon. */
function navItemFor(view: WorkspaceView) {
  return Object.values(NAV_ITEMS).find(item => item.viewMode === view);
}

export function tabIcon(view: WorkspaceView): LucideIcon {
  return navItemFor(view)?.icon ?? FileQuestion;
}

/** A place's own title (a book, surah, hadith, note…), or the name of its view. */
export function locationLabel(location: Pick<TabLocation, 'view' | 'title'>, t: (key: TranslationKey) => string): string {
  const title = location.title.trim();
  if (title) return title;
  const key = navItemFor(location.view)?.labelKey;
  return key ? t(key) : t('workspaceTabUntitled');
}

/** The tab's own title, or the name of its view. */
export function tabLabel(tab: WorkspaceTab, t: (key: TranslationKey) => string): string {
  return locationLabel(currentLocation(tab), t);
}

// KEY-420 (WS-4): back and forward inside a tab.

export type HistoryCommand = 'back' | 'forward';

/**
 * Alt+Left / Alt+Right. The arrows follow what the user sees: in Arabic the back arrow points right, so
 * Alt+Right goes back. The BrowserBack / BrowserForward keys work in both languages.
 */
export function historyShortcut(event: KeyLike, dir: 'rtl' | 'ltr'): HistoryCommand | null {
  if (event.key === 'BrowserBack') return 'back';
  if (event.key === 'BrowserForward') return 'forward';
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const left = event.key === 'ArrowLeft' || event.code === 'ArrowLeft';
  const right = event.key === 'ArrowRight' || event.code === 'ArrowRight';
  if (!left && !right) return null;
  return (left === (dir === 'ltr')) ? 'back' : 'forward';
}

/** The mouse's back (button 3) and forward (button 4) buttons. */
export function mouseHistoryButton(button: number): HistoryCommand | null {
  if (button === 3) return 'back';
  if (button === 4) return 'forward';
  return null;
}

/** Pressing an arrow this long opens its history list, as a right-click does. */
export const HISTORY_HOLD_MS = 450;
