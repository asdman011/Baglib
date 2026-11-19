/**
 * KEY-427 (WS-12 spike): the payload that moves one tab from a BagLib window into another window, and the IPC
 * channel names. A tab travels as its history entries (view, study target, title, scroll, view snapshot). It never
 * carries document content: the receiving window opens the document again from the study target.
 */
import { sanitizeLocation, TAB_LIMITS, type TabLocation, type WorkspaceTab } from './workspace-tabs';

export const WORKSPACE_WINDOW_CHANNELS = {
  /** Renderer to main (invoke): open a new window holding this tab. Resolves `{ ok, windowId? }`. */
  moveTab: 'workspace:move-tab-to-new-window',
  /** Renderer to main (invoke): a window finished starting; resolves its role and any tab waiting for it. */
  windowReady: 'workspace:window-ready',
} as const;

export interface TabTransferPayload {
  version: 1;
  history: TabLocation[];
  index: number;
}

export interface WorkspaceWindowInfo {
  /** The first window owns the saved workspace; later windows do not read or write it. */
  primary: boolean;
  /** The tab this window was opened for, delivered once. */
  transfer?: TabTransferPayload;
}

export interface MoveTabResult {
  ok: boolean;
  windowId?: number;
}

/** The part of a tab that crosses windows. Ids, group and activity times stay behind. */
export function buildTabTransfer(tab: Pick<WorkspaceTab, 'history' | 'index'>): TabTransferPayload {
  return { version: 1, history: tab.history, index: tab.index };
}

/** Validates a payload from IPC: returns undefined for anything that isn't a well-formed transfer. Never throws. */
export function parseTabTransfer(raw: unknown): TabTransferPayload | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || !Array.isArray(value.history) || typeof value.index !== 'number') return undefined;
  if (value.history.length === 0 || value.history.length > TAB_LIMITS.maxHistory) return undefined;
  const history: TabLocation[] = [];
  for (const entry of value.history) {
    const location = sanitizeLocation(entry);
    if (!location) return undefined;
    history.push(location);
  }
  if (!Number.isInteger(value.index) || value.index < 0 || value.index >= history.length) return undefined;
  return { version: 1, history, index: value.index };
}

/** Builds the receiving window's tab from a validated payload. */
export function transferToTab(payload: TabTransferPayload, id: string, now: number): WorkspaceTab {
  return { id, openedAt: now, lastActiveAt: now, history: payload.history, index: payload.index };
}
