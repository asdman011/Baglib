/**
 * KEY-427 (WS-12 spike): the payload that moves one tab from a BagLib window into another window, and the IPC
 * channel names. A tab travels as its history entries (view, study target, title, scroll, view snapshot). It never
 * carries document content: the receiving window opens the document again from the study target.
 */
import {
  parseTabs, sanitizeLocation, serializeTabs, TAB_LIMITS,
  type TabLocation, type TabsState, type WorkspaceTab,
} from './workspace-tabs';

export const WORKSPACE_WINDOWS_SETTING = 'workspace.tabs.v1.windows';
export const MAX_SAVED_SECONDARY_WINDOWS = 12;

export const WORKSPACE_WINDOW_CHANNELS = {
  /** Renderer to main (invoke): move a tab to a new window or an existing window under `position`. */
  moveTab: 'workspace:move-tab-to-new-window',
  /** Renderer to main (invoke): a window finished starting; resolves its role and any tab/state waiting for it. */
  windowReady: 'workspace:window-ready',
  /** Main to renderer (send): append and focus a tab dragged in from another window. */
  receiveTab: 'workspace:receive-tab',
  /** Renderer to main (invoke): persist a secondary window's current tabs. */
  saveWindowTabs: 'workspace:save-window-tabs',
  /** Main to primary renderer (send): prepend tabs from a secondary window closed by X to closedTabs. */
  appendClosedTabs: 'workspace:append-closed-tabs',
} as const;

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TabTransferPayload {
  version: 1;
  history: TabLocation[];
  index: number;
}

export interface TabMoveRequest extends TabTransferPayload {
  position?: ScreenPoint;
}

export interface SavedSecondaryWindow {
  windowKey: string;
  bounds?: WindowBounds;
  state: TabsState;
}

export interface WorkspaceWindowInfo {
  /** The first window owns the saved workspace; later windows save under `WORKSPACE_WINDOWS_SETTING`. */
  primary: boolean;
  /** Assigned key for a secondary window. */
  windowKey?: string;
  /** The tab a newly torn-off window was opened for, delivered once. */
  transfer?: TabTransferPayload;
  /** Saved tabs when a secondary window is reopened on app restart, delivered once. */
  savedTabs?: TabsState;
}

export interface MoveTabResult {
  ok: boolean;
  windowId?: number;
  target?: 'new' | 'existing';
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

function parsePoint(raw: unknown): ScreenPoint | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.x !== 'number' || !Number.isFinite(value.x)) return undefined;
  if (typeof value.y !== 'number' || !Number.isFinite(value.y)) return undefined;
  return { x: Math.round(value.x), y: Math.round(value.y) };
}

/** Validates a `moveTab` IPC payload including optional screen drop coordinates. */
export function parseTabMoveRequest(raw: unknown): { payload: TabTransferPayload; position?: ScreenPoint } | undefined {
  const payload = parseTabTransfer(raw);
  if (!payload) return undefined;
  const value = raw as Record<string, unknown>;
  const position = parsePoint(value.position);
  return position ? { payload, position } : { payload };
}

function parseBounds(raw: unknown): WindowBounds | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  const { x, y, width, height } = value;
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) return undefined;
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return undefined;
  if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return undefined;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** True when a screen point falls inside `bounds` (DIP coordinates). */
export function isPointInBounds(point: ScreenPoint, bounds: WindowBounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

/** True when the pointer is outside the browser window's outer screen rectangle. */
export function isOutsideWindowBounds(
  point: { screenX: number; screenY: number },
  bounds: { screenX: number; screenY: number; outerWidth: number; outerHeight: number },
): boolean {
  if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return false;
  if (bounds.outerWidth <= 0 || bounds.outerHeight <= 0) return false;
  return (
    point.screenX < bounds.screenX ||
    point.screenX > bounds.screenX + bounds.outerWidth ||
    point.screenY < bounds.screenY ||
    point.screenY > bounds.screenY + bounds.outerHeight
  );
}

/** Builds the receiving window's tab from a validated payload. */
export function transferToTab(payload: TabTransferPayload, id: string, now: number): WorkspaceTab {
  return { id, openedAt: now, lastActiveAt: now, history: payload.history, index: payload.index };
}

/** Parses saved secondary windows from `workspace.tabs.v1.windows`. Never throws. */
export function parseSavedSecondaryWindows(raw: unknown): SavedSecondaryWindow[] {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  const out: SavedSecondaryWindow[] = [];
  const seenKeys = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.windowKey !== 'string' || !record.windowKey || record.windowKey.length > 100) continue;
    if (seenKeys.has(record.windowKey)) continue;
    const state = parseTabs(record.state);
    if (state.tabs.length === 0) continue;
    seenKeys.add(record.windowKey);
    const bounds = parseBounds(record.bounds);
    out.push({ windowKey: record.windowKey, ...(bounds ? { bounds } : {}), state });
    if (out.length >= MAX_SAVED_SECONDARY_WINDOWS) break;
  }
  return out;
}

/** Serializes secondary windows for `workspace.tabs.v1.windows`. */
export function serializeSavedSecondaryWindows(windows: readonly SavedSecondaryWindow[]): SavedSecondaryWindow[] {
  const out: SavedSecondaryWindow[] = [];
  for (const entry of windows) {
    if (!entry.windowKey || entry.state.tabs.length === 0) continue;
    const bounds = entry.bounds ? parseBounds(entry.bounds) : undefined;
    out.push({
      windowKey: entry.windowKey,
      ...(bounds ? { bounds } : {}),
      state: serializeTabs(entry.state),
    });
    if (out.length >= MAX_SAVED_SECONDARY_WINDOWS) break;
  }
  return out;
}
