/**
 * Pure state machine and helper logic for the Pin-or-Peek side navigation rail (KEY-310).
 *
 * Supports:
 * - Pinned mode: Rail docks in normal flow and pushes main content.
 * - Unpinned mode: Rail is hidden, giving full width to content.
 * - Peek overlay: When unpinned, hovering the start edge of the window (or menu button)
 *   reveals the rail as an overlay without shifting content.
 * - Auto-close delay: Leaving hover targets hides peek after ~300ms unless cursor re-enters.
 * - Keyboard navigation: Ctrl+B / Cmd+B toggles pinned; Enter on menu button opens peek; Esc closes peek.
 */

import type { WorkspaceViewMode } from '../context/WorkspaceContext';

export const NAV_PINNED_SETTINGS_KEY = 'shell.navPinned.v1';
export const NAV_PEEK_LEAVE_DELAY_MS = 300;

export interface NavPinState {
  isPinned: boolean;
  isPeekOpen: boolean;
  isHoveringEdge: boolean;
  isHoveringRail: boolean;
  isHoveringButton: boolean;
}

export const INITIAL_NAV_PIN_STATE: NavPinState = {
  isPinned: true,
  isPeekOpen: false,
  isHoveringEdge: false,
  isHoveringRail: false,
  isHoveringButton: false,
};

/**
 * Navigation shell collapse and rail state model (KEY-379).
 *
 * Requirements:
 * 1. When entering any workspace tab (via sidebar, command palette, shortcut, or API),
 *    the main sidebar automatically collapses to its rail (`isSidebarCollapsed = true`).
 * 2. The user can expand the sidebar by hand (`isSidebarCollapsed = false`).
 * 3. Pin setting is strictly respected: a pinned sidebar (`isNavPinned = true`)
 *    stays docked in the layout as a rail, never automatically unpinning into peek mode.
 * 4. Unpinned sidebar closes peek overlay on navigation while keeping `isNavPinned = false`.
 * 5. Re-entering the active tab collapses the sidebar if it was expanded by hand.
 */
export interface NavShellState {
  viewMode: WorkspaceViewMode;
  isSidebarCollapsed: boolean;
  isNavPinned: boolean;
  isNavPeekOpen: boolean;
}

export const INITIAL_NAV_SHELL_STATE: NavShellState = {
  viewMode: 'dashboard',
  isSidebarCollapsed: true,
  isNavPinned: true,
  isNavPeekOpen: false,
};

/**
 * Pure state machine transition for entering any workspace tab (KEY-379).
 * Collapses the sidebar to its rail (`isSidebarCollapsed = true`), closes peek overlay,
 * and preserves the user's pin setting.
 */
export function onNavigateWorkspaceTab<T extends { isSidebarCollapsed: boolean; isNavPinned: boolean; isNavPeekOpen: boolean }>(
  current: T,
  newViewMode?: WorkspaceViewMode,
  options?: { manualExpand?: boolean }
): T & { viewMode?: WorkspaceViewMode } {
  return {
    ...current,
    ...(newViewMode !== undefined ? { viewMode: newViewMode } : {}),
    isSidebarCollapsed: options?.manualExpand ? false : true,
    isNavPeekOpen: false,
    isNavPinned: current.isNavPinned,
  };
}

/**
 * Pure state machine transition for toggling sidebar between expanded and collapsed rail.
 */
export function toggleSidebarCollapsed<T extends { isSidebarCollapsed: boolean }>(current: T): T {
  return {
    ...current,
    isSidebarCollapsed: !current.isSidebarCollapsed,
  };
}

/**
 * Pure state machine transition for explicitly setting sidebar collapsed state.
 */
export function setSidebarCollapsed<T extends { isSidebarCollapsed: boolean }>(
  current: T,
  collapsed: boolean
): T {
  return {
    ...current,
    isSidebarCollapsed: collapsed,
  };
}

/**
 * Toggles pinned state. If pinning, peek is automatically deactivated.
 */
export function toggleNavPinned(current: NavPinState): NavPinState {
  const nextPinned = !current.isPinned;
  return {
    ...current,
    isPinned: nextPinned,
    isPeekOpen: false, // Unpinned starts closed; pinned docks in flow
  };
}

/**
 * Explicitly sets pinned state.
 */
export function setNavPinned(current: NavPinState, isPinned: boolean): NavPinState {
  return {
    ...current,
    isPinned,
    isPeekOpen: false,
  };
}

/**
 * Opens peek overlay when unpinned.
 */
export function openNavPeek(current: NavPinState): NavPinState {
  if (current.isPinned) return current;
  return {
    ...current,
    isPeekOpen: true,
  };
}

/**
 * Closes peek overlay when unpinned.
 */
export function closeNavPeek(current: NavPinState): NavPinState {
  if (!current.isPeekOpen) return current;
  return {
    ...current,
    isPeekOpen: false,
  };
}

/**
 * Calculates whether peek should remain open or schedule close.
 * If any of edge, rail, or button is still hovered, peek stays active.
 */
export function shouldKeepPeekOpen(state: NavPinState): boolean {
  if (state.isPinned) return false;
  return state.isHoveringEdge || state.isHoveringRail || state.isHoveringButton;
}

export type NavShortcutAction = 'togglePinned' | 'openPeek' | 'closePeek';

export interface ShortcutEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  defaultPrevented?: boolean;
}

/**
 * Evaluates keyboard events against navigation pin-and-peek rules.
 */
export function evaluateNavShortcut(
  event: ShortcutEventLike,
  currentState: NavPinState,
  options?: { isMenuButtonFocused?: boolean }
): { handled: boolean; action?: NavShortcutAction } {
  if (event.defaultPrevented) return { handled: false };

  const isBKey = event.key === 'b' || event.key === 'B' || event.key === 'لا';
  const hasModifier = Boolean(event.ctrlKey || event.metaKey);

  // Ctrl+B / Cmd+B toggles pinned
  if (hasModifier && !event.shiftKey && !event.altKey && isBKey) {
    return { handled: true, action: 'togglePinned' };
  }

  // Escape closes peek when open and unpinned
  if (event.key === 'Escape' && !currentState.isPinned && currentState.isPeekOpen) {
    return { handled: true, action: 'closePeek' };
  }

  // Enter or Space on focused menu button opens peek if unpinned and not yet open
  if (
    options?.isMenuButtonFocused &&
    (event.key === 'Enter' || event.key === ' ') &&
    !currentState.isPinned &&
    !currentState.isPeekOpen
  ) {
    return { handled: true, action: 'openPeek' };
  }

  return { handled: false };
}
