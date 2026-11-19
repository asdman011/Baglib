/**
 * KEY-417 (WS-1 of the multi-tab workspace, ADR-018): the pure tab model.
 *
 * Holds the tabs, each tab's back/forward history, which tabs stay awake, the snapshot rules, the workspace
 * preferences, the "most used" ranking, the recents list and the closed-tabs list. Nothing here touches React,
 * the DOM, IPC or storage: callers pass ids and the clock in, and persist what `serializeTabs` returns in the
 * `settings` store (no schema change, see ADR-018).
 */
import { validStudyTarget } from './study-notes';

/** The workspace's views. Mirrors `WorkspaceViewMode` in the renderer, kept here so the model stays shared. */
export const WORKSPACE_VIEWS = [
  'islamic', 'statistics', 'dashboard', 'planner', 'pathways', 'lectures', 'quran', 'sunnah', 'bayan',
  'library', 'categories', 'reader', 'notes', 'notes-editor', 'settings',
] as const;
export type WorkspaceView = typeof WORKSPACE_VIEWS[number];

/** Opening one of these again focuses the tab that already shows it. */
export const SINGLE_INSTANCE_VIEWS: readonly WorkspaceView[] = ['settings', 'statistics'];
/** A new tab, and "start fresh", open on this view. */
export const HOME_VIEW: WorkspaceView = 'dashboard';

export const WORKSPACE_TABS_SETTING = 'workspace.tabs.v1';
export const WORKSPACE_PREFS_SETTING = 'workspace.prefs.v1';
export const WORKSPACE_USAGE_SETTING = 'workspace.usage.v1';
export const WORKSPACE_RECENT_SETTING = 'workspace.recent.v1';
export const WORKSPACE_CLOSED_SETTING = 'workspace.closed.v1';

export const TAB_LIMITS = {
  /** Tabs saved for restore; the active tab is always kept. */
  maxSavedTabs: 30,
  /** Back/forward entries per tab. */
  maxHistory: 50,
  /** Non-exempt tabs kept mounted (the user's decision of 2026-11-19). */
  keepAlive: 6,
  /** One view snapshot, as JSON text (UTF-16 code units, a close bound for the settings value). */
  snapshotBytes: 16 * 1024,
  maxRecent: 30,
  maxClosed: 10,
  maxUsage: 20,
  maxTitle: 200,
} as const;

const isView = (value: unknown): value is WorkspaceView => typeof value === 'string' && (WORKSPACE_VIEWS as readonly string[]).includes(value);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finiteNumber = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const cleanTitle = (value: unknown): string => (typeof value === 'string' ? value.slice(0, TAB_LIMITS.maxTitle) : '');

// ---------------------------------------------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------------------------------------------

/** A view's own saved state (WS-8). Plain JSON, versioned per view; never document content. */
export interface ViewSnapshot {
  version: number;
  data: Record<string, unknown>;
}

/** Keeps only JSON values: drops functions, undefined, NaN/Infinity and non-plain objects. */
function jsonOnly(value: unknown, depth = 0): unknown {
  if (depth > 12) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) return value.map(item => jsonOnly(item, depth + 1)).filter(item => item !== undefined);
  if (isRecord(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const clean = jsonOnly(item, depth + 1);
      if (clean !== undefined) out[key] = clean;
    }
    return out;
  }
  return undefined;
}

const jsonLength = (value: unknown): number => JSON.stringify(value).length;

/**
 * Validates a snapshot from a view or from storage. Returns undefined for a snapshot that isn't one, drops
 * non-JSON fields, and drops the largest top-level fields until the snapshot fits the size cap. Never throws.
 */
export function sanitizeSnapshot(raw: unknown, maxBytes: number = TAB_LIMITS.snapshotBytes): ViewSnapshot | undefined {
  if (!isRecord(raw)) return undefined;
  const version = raw.version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) return undefined;
  const data = jsonOnly(raw.data);
  if (!isRecord(data)) return undefined;
  const snapshot: ViewSnapshot = { version, data };
  while (jsonLength(snapshot) > maxBytes) {
    const keys = Object.keys(snapshot.data);
    if (keys.length === 0) return undefined;
    const largest = keys.reduce((a, b) => (jsonLength(snapshot.data[a]) >= jsonLength(snapshot.data[b]) ? a : b));
    delete snapshot.data[largest];
  }
  return snapshot;
}

/** A field check for `readSnapshot`. */
export type SnapshotField = (value: unknown) => boolean;

/**
 * What a view reads back on restore: nothing if the snapshot is from another version, otherwise only the
 * fields whose check passes. An invalid or outdated field is dropped, never thrown (Tab State spec).
 */
export function readSnapshot<T extends Record<string, unknown>>(
  snapshot: ViewSnapshot | undefined,
  version: number,
  fields: { [K in keyof T]: SnapshotField },
): Partial<T> {
  if (!snapshot || snapshot.version !== version) return {};
  const out: Partial<T> = {};
  for (const key of Object.keys(fields) as (keyof T)[]) {
    const value = snapshot.data[key as string];
    if (value !== undefined && fields[key](value)) out[key] = value as T[keyof T];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Tabs and history
// ---------------------------------------------------------------------------------------------------------------

/** One place in a tab: a history entry. The generic part of the snapshot plus the view's own part. */
export interface TabLocation {
  view: WorkspaceView;
  /** A study-target string (`book:`, `quran:`, `sunnah:`, `poetry:`, `media:`, `note:`). */
  target?: string;
  title: string;
  /** The main scroll offset, in pixels. */
  scroll?: number;
  snapshot?: ViewSnapshot;
}

export interface WorkspaceTab {
  id: string;
  openedAt: number;
  lastActiveAt: number;
  /** Back/forward entries, oldest first. Never empty. */
  history: TabLocation[];
  /** The current entry in `history`. */
  index: number;
  /** KEY-426 (WS-11): the group this tab belongs to. A group's tabs always sit next to each other. */
  groupId?: string;
}

/** KEY-426 (WS-11): the 8 group colours; the renderer maps each to its theme tokens. */
export const TAB_GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'] as const;
export type TabGroupColor = typeof TAB_GROUP_COLORS[number];

/** A named, coloured group of tabs. A collapsed group shows only its label and its tabs sleep. */
export interface TabGroup {
  id: string;
  name: string;
  color: TabGroupColor;
  collapsed: boolean;
}

export interface TabsState {
  tabs: WorkspaceTab[];
  activeId: string | null;
  /** The tab in the second pane (WS-9), if two tabs are side by side. */
  splitId?: string;
  /** KEY-425: the first pane's share of the width while two tabs are side by side (0.2-0.8). */
  splitRatio?: number;
  /** KEY-425: the focused tab is the one in the second pane (focus moved between the panes; the panes stay put). */
  splitSwapped?: boolean;
  /** KEY-426 (WS-11): groups that have at least one tab. Absent when there are none. */
  groups?: TabGroup[];
}

export const EMPTY_TABS: TabsState = { tabs: [], activeId: null };

export const currentLocation = (tab: WorkspaceTab): TabLocation => tab.history[tab.index];
export const findTab = (state: TabsState, id: string | null | undefined): WorkspaceTab | undefined => (id ? state.tabs.find(tab => tab.id === id) : undefined);
export const activeTab = (state: TabsState): WorkspaceTab | undefined => findTab(state, state.activeId);
export const canGoBack = (tab: WorkspaceTab): boolean => tab.index > 0;
export const canGoForward = (tab: WorkspaceTab): boolean => tab.index < tab.history.length - 1;

/** The back list for the arrow's history menu, nearest first, with the history index to jump to. */
export const backEntries = (tab: WorkspaceTab): { index: number; location: TabLocation }[] =>
  tab.history.slice(0, tab.index).map((location, index) => ({ index, location })).reverse();
/** The forward list, nearest first. */
export const forwardEntries = (tab: WorkspaceTab): { index: number; location: TabLocation }[] =>
  tab.history.slice(tab.index + 1).map((location, offset) => ({ index: tab.index + 1 + offset, location }));

/** A different view or a different item makes a history entry; scrolling and page turns don't. */
export function isNewEntry(current: TabLocation, next: Pick<TabLocation, 'view' | 'target'>): boolean {
  return current.view !== next.view || (current.target ?? '') !== (next.target ?? '');
}

/** Validates a location: an unknown view drops it, an invalid target is cleared but the view is kept. */
export function sanitizeLocation(raw: unknown): TabLocation | undefined {
  if (!isRecord(raw) || !isView(raw.view)) return undefined;
  const location: TabLocation = { view: raw.view, title: cleanTitle(raw.title) };
  if (typeof raw.target === 'string' && validStudyTarget(raw.target)) location.target = raw.target;
  if (typeof raw.scroll === 'number' && Number.isFinite(raw.scroll) && raw.scroll >= 0) location.scroll = raw.scroll;
  const snapshot = sanitizeSnapshot(raw.snapshot);
  if (snapshot) location.snapshot = snapshot;
  return location;
}

/** Keeps at most `max` entries, dropping the ones farthest from the current entry. */
function capHistory(history: TabLocation[], index: number, max: number = TAB_LIMITS.maxHistory): { history: TabLocation[]; index: number } {
  if (history.length <= max) return { history, index };
  let start = Math.max(0, index - Math.floor(max / 2));
  start = Math.min(start, history.length - max);
  return { history: history.slice(start, start + max), index: index - start };
}

export function newTab(id: string, location: TabLocation, now: number): WorkspaceTab {
  return { id, openedAt: now, lastActiveAt: now, history: [location], index: 0 };
}

export const homeLocation = (title = ''): TabLocation => ({ view: HOME_VIEW, title });

export type TabsAction =
  /** Open a tab after `afterId` (default: after the active tab). A single-instance view focuses its tab. */
  | { type: 'open'; id: string; location: TabLocation; now: number; afterId?: string; background?: boolean }
  /** Close a tab. Closing the last tab leaves a new Home tab with `homeId`. */
  | { type: 'close'; id: string; homeId: string; now: number }
  | { type: 'activate'; id: string; now: number }
  | { type: 'move'; id: string; toIndex: number }
  | { type: 'duplicate'; id: string; newId: string; now: number }
  /** The tab's view or item changes: a new history entry, or the current one updated if nothing new. */
  | { type: 'navigate'; id: string; location: TabLocation; now: number }
  /** Update the current entry without making a history entry (title, scroll, snapshot). */
  | { type: 'update'; id: string; patch: Partial<Pick<TabLocation, 'title' | 'scroll' | 'snapshot'>> }
  | { type: 'back'; id: string; now: number }
  | { type: 'forward'; id: string; now: number }
  /** Jump to a history entry from the arrow's history menu. */
  | { type: 'go'; id: string; index: number; now: number }
  /** Bring back a closed tab (Ctrl+Shift+T) with its history, under a new id. */
  | { type: 'reopen'; tab: WorkspaceTab; id: string; now: number }
  | { type: 'openBeside'; id: string }
  | { type: 'closeSplit' }
  /** KEY-425: drag or keys on the divider between the two panes. */
  | { type: 'setSplitRatio'; ratio: number }
  /** KEY-426: put tabs in a new group, gathered where the first of them is. */
  | { type: 'group'; ids: string[]; groupId: string; name: string; color: TabGroupColor }
  /** Add tabs to an existing group, after its last tab. */
  | { type: 'addToGroup'; ids: string[]; groupId: string }
  /** Take tabs out of their groups; each lands just after its old group. */
  | { type: 'removeFromGroup'; ids: string[] }
  | { type: 'updateGroup'; groupId: string; patch: Partial<Pick<TabGroup, 'name' | 'color' | 'collapsed'>> }
  /** Dissolve a group; its tabs stay where they are. */
  | { type: 'ungroup'; groupId: string }
  /** Drag a group's label: move all its tabs to `toIndex` among the other tabs. */
  | { type: 'moveGroup'; groupId: string; toIndex: number };

function withoutGroup(tab: WorkspaceTab): WorkspaceTab {
  if (tab.groupId === undefined) return tab;
  const copy = { ...tab };
  delete copy.groupId;
  return copy;
}

/** Gathers each group's tabs where its first tab is, keeping their order, so a group is never split. */
function compactGroups(tabs: WorkspaceTab[]): WorkspaceTab[] {
  if (!tabs.some(tab => tab.groupId)) return tabs;
  const placed = new Set<string>();
  const out: WorkspaceTab[] = [];
  for (const tab of tabs) {
    if (!tab.groupId) { out.push(tab); continue; }
    if (placed.has(tab.groupId)) continue;
    placed.add(tab.groupId);
    out.push(...tabs.filter(other => other.groupId === tab.groupId));
  }
  return out;
}

/**
 * Builds a state from `base`'s groups. It keeps the state free of empty `splitId` and `groups` keys, so saved and
 * compared states stay identical; drops links to missing groups and groups left without tabs; keeps groups whole.
 */
function withSplit(base: TabsState, tabs: WorkspaceTab[], activeId: string | null, splitId: string | undefined): TabsState {
  const groups = base.groups ?? [];
  const live = new Set(groups.map(group => group.id));
  const cleaned = compactGroups(tabs.map(tab => (tab.groupId && !live.has(tab.groupId) ? withoutGroup(tab) : tab)));
  const used = new Set(cleaned.map(tab => tab.groupId).filter(Boolean));
  const kept = groups.filter(group => used.has(group.id));
  const out: TabsState = splitId ? { tabs: cleaned, activeId, splitId } : { tabs: cleaned, activeId };
  if (splitId && base.splitRatio !== undefined) out.splitRatio = base.splitRatio;
  if (splitId && base.splitSwapped) out.splitSwapped = true;
  if (kept.length) out.groups = kept;
  return out;
}

const rebuild = (state: TabsState, tabs: WorkspaceTab[] = state.tabs, groups: TabGroup[] | undefined = state.groups): TabsState =>
  withSplit({ ...state, groups }, tabs, state.activeId, state.splitId);

/**
 * After a tab lands at `index`: between two tabs of one group it joins that group; next to a tab of its own group
 * it stays; otherwise it leaves its group. This is how dragging a tab out of a group, or into one, works.
 */
function settleMembership(tabs: WorkspaceTab[], index: number): WorkspaceTab[] {
  const tab = tabs[index];
  if (!tab) return tabs;
  const left = tabs[index - 1]?.groupId, right = tabs[index + 1]?.groupId;
  let groupId: string | undefined;
  if (left && left === right) groupId = left;
  else if (tab.groupId && (left === tab.groupId || right === tab.groupId)) groupId = tab.groupId;
  if (groupId === tab.groupId) return tabs;
  const next = [...tabs];
  next[index] = groupId ? { ...tab, groupId } : withoutGroup(tab);
  return next;
}

/** The tabs of a group, in the bar's order (for "Close the group" and "Save the group as a list"). */
export const groupTabIds = (state: TabsState, groupId: string): string[] =>
  state.tabs.filter(tab => tab.groupId === groupId).map(tab => tab.id);

export const findGroup = (state: TabsState, groupId: string | undefined): TabGroup | undefined =>
  (groupId ? state.groups?.find(group => group.id === groupId) : undefined);

/** Whether a tab is hidden inside a collapsed group (it sleeps unless exempt). */
export const inCollapsedGroup = (state: TabsState, tab: WorkspaceTab): boolean => !!findGroup(state, tab.groupId)?.collapsed;

function replaceTab(state: TabsState, tab: WorkspaceTab): TabsState {
  return { ...state, tabs: state.tabs.map(item => (item.id === tab.id ? tab : item)) };
}

function touch(state: TabsState, id: string, now: number): TabsState {
  const tab = findTab(state, id);
  if (!tab) return state;
  const next = replaceTab(state, { ...tab, lastActiveAt: now });
  // Focusing a tab inside a collapsed group opens the group.
  const groups = next.groups?.map(group => (group.id === tab.groupId && group.collapsed ? { ...group, collapsed: false } : group));
  // Focusing the tab in the other pane moves the focus between the panes; the panes stay where they are.
  if (next.splitId === id && next.activeId) return withSplit({ ...next, groups, splitSwapped: !next.splitSwapped }, next.tabs, id, next.activeId);
  // Focusing a tab outside the pair ends side by side.
  return withSplit({ ...next, groups }, next.tabs, id, id === next.activeId ? next.splitId : undefined);
}

function insertAfter(tabs: WorkspaceTab[], tab: WorkspaceTab, afterId: string | null | undefined): WorkspaceTab[] {
  const at = afterId ? tabs.findIndex(item => item.id === afterId) : -1;
  if (at < 0) return [...tabs, tab];
  return [...tabs.slice(0, at + 1), tab, ...tabs.slice(at + 1)];
}

/** The tab already showing a single-instance view, if any (other than `exceptId`). */
function singleInstanceHolder(state: TabsState, view: WorkspaceView, exceptId?: string): WorkspaceTab | undefined {
  if (!SINGLE_INSTANCE_VIEWS.includes(view)) return undefined;
  return state.tabs.find(tab => tab.id !== exceptId && currentLocation(tab).view === view);
}

function moveInHistory(state: TabsState, id: string, index: number, now: number): TabsState {
  const tab = findTab(state, id);
  if (!tab || index < 0 || index >= tab.history.length || index === tab.index) return state;
  return replaceTab(state, { ...tab, index, lastActiveAt: now });
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'open': {
      const holder = singleInstanceHolder(state, action.location.view);
      if (holder) return touch(state, holder.id, action.now);
      if (findTab(state, action.id)) return state;
      const tab = newTab(action.id, action.location, action.now);
      // A tab opened inside a group (between two of its tabs) joins it.
      const inserted = insertAfter(state.tabs, tab, action.afterId ?? state.activeId);
      const tabs = settleMembership(inserted, inserted.indexOf(tab));
      if (action.background && state.activeId) return rebuild(state, tabs);
      // A new tab in front ends side by side.
      return withSplit(state, tabs, tab.id, undefined);
    }
    case 'close': {
      const at = state.tabs.findIndex(tab => tab.id === action.id);
      if (at < 0) return state;
      const tabs = state.tabs.filter(tab => tab.id !== action.id);
      const splitId = state.splitId === action.id ? undefined : state.splitId;
      if (tabs.length === 0) {
        return { tabs: [newTab(action.homeId, homeLocation(), action.now)], activeId: action.homeId };
      }
      if (state.activeId !== action.id) return withSplit(state, tabs, state.activeId, splitId);
      // Like a browser: the tab to the right takes focus, or the one to the left at the end. A split pane wins.
      const nextId = splitId ?? (tabs[at] ?? tabs[at - 1]).id;
      return touch(withSplit(state, tabs, state.activeId, splitId === nextId ? undefined : splitId), nextId, action.now);
    }
    case 'activate':
      return touch(state, action.id, action.now);
    case 'move': {
      const tab = findTab(state, action.id);
      if (!tab) return state;
      const rest = state.tabs.filter(item => item.id !== action.id);
      const to = Math.max(0, Math.min(rest.length, Math.trunc(action.toIndex)));
      return rebuild(state, settleMembership([...rest.slice(0, to), tab, ...rest.slice(to)], to));
    }
    case 'duplicate': {
      const tab = findTab(state, action.id);
      if (!tab || findTab(state, action.newId) || singleInstanceHolder(state, currentLocation(tab).view)) return state;
      // The copy sits next to the original, so it stays in the original's group.
      const copy: WorkspaceTab = { ...tab, id: action.newId, openedAt: action.now, lastActiveAt: action.now, history: tab.history.map(entry => ({ ...entry })) };
      return withSplit(state, insertAfter(state.tabs, copy, tab.id), copy.id, undefined);
    }
    case 'navigate': {
      const tab = findTab(state, action.id);
      if (!tab) return state;
      const holder = singleInstanceHolder(state, action.location.view, tab.id);
      if (holder) return touch(state, holder.id, action.now);
      const current = currentLocation(tab);
      if (!isNewEntry(current, action.location)) {
        const history = [...tab.history];
        history[tab.index] = { ...current, ...action.location };
        return replaceTab(state, { ...tab, history, lastActiveAt: action.now });
      }
      // A new entry drops everything forward of the current one, like a browser.
      const capped = capHistory([...tab.history.slice(0, tab.index + 1), action.location], tab.index + 1);
      return replaceTab(state, { ...tab, ...capped, lastActiveAt: action.now });
    }
    case 'update': {
      const tab = findTab(state, action.id);
      if (!tab) return state;
      const history = [...tab.history];
      history[tab.index] = { ...currentLocation(tab), ...action.patch };
      return replaceTab(state, { ...tab, history });
    }
    case 'back': {
      const tab = findTab(state, action.id);
      return tab ? moveInHistory(state, tab.id, tab.index - 1, action.now) : state;
    }
    case 'forward': {
      const tab = findTab(state, action.id);
      return tab ? moveInHistory(state, tab.id, tab.index + 1, action.now) : state;
    }
    case 'go':
      return moveInHistory(state, action.id, action.index, action.now);
    case 'reopen': {
      if (findTab(state, action.id) || action.tab.history.length === 0) return state;
      const holder = singleInstanceHolder(state, currentLocation(action.tab).view);
      if (holder) return touch(state, holder.id, action.now);
      // Its old group may be gone; it joins a group only if it lands inside one.
      const tab: WorkspaceTab = withoutGroup({ ...action.tab, id: action.id, lastActiveAt: action.now });
      const inserted = insertAfter(state.tabs, tab, state.activeId);
      return withSplit(state, settleMembership(inserted, inserted.indexOf(tab)), tab.id, undefined);
    }
    case 'openBeside':
      if (!findTab(state, action.id) || action.id === state.activeId) return state;
      return withSplit({ ...state, splitSwapped: false }, state.tabs, state.activeId, action.id);
    case 'closeSplit':
      return state.splitId ? withSplit(state, state.tabs, state.activeId, undefined) : state;
    case 'setSplitRatio': {
      if (!state.splitId || !Number.isFinite(action.ratio)) return state;
      return { ...state, splitRatio: Math.min(0.8, Math.max(0.2, action.ratio)) };
    }
    case 'group': {
      const ids = new Set(action.ids);
      const members = state.tabs.filter(tab => ids.has(tab.id));
      if (members.length === 0 || !action.groupId || findGroup(state, action.groupId)) return state;
      const group: TabGroup = { id: action.groupId, name: cleanTitle(action.name), color: TAB_GROUP_COLORS.includes(action.color) ? action.color : 'grey', collapsed: false };
      const first = state.tabs.findIndex(tab => ids.has(tab.id));
      const before = state.tabs.slice(0, first).filter(tab => !ids.has(tab.id));
      const after = state.tabs.slice(first).filter(tab => !ids.has(tab.id));
      const tabs = [...before, ...members.map(tab => ({ ...tab, groupId: group.id })), ...after];
      return rebuild(state, tabs, [...(state.groups ?? []), group]);
    }
    case 'addToGroup': {
      if (!findGroup(state, action.groupId)) return state;
      const ids = new Set(action.ids.filter(id => findTab(state, id)));
      if (ids.size === 0) return state;
      const moving = state.tabs.filter(tab => ids.has(tab.id)).map(tab => ({ ...tab, groupId: action.groupId }));
      const rest = state.tabs.filter(tab => !ids.has(tab.id));
      let end = -1;
      rest.forEach((tab, index) => { if (tab.groupId === action.groupId) end = index; });
      // The group may have no tabs left outside the moving ones; then they stay where the first one was.
      const at = end >= 0 ? end + 1 : state.tabs.findIndex(tab => ids.has(tab.id));
      return rebuild(state, [...rest.slice(0, at), ...moving, ...rest.slice(at)]);
    }
    case 'removeFromGroup': {
      const ids = new Set(action.ids);
      let tabs = state.tabs;
      for (const tab of state.tabs.filter(item => ids.has(item.id) && item.groupId)) {
        const rest = tabs.filter(item => item.id !== tab.id);
        let end = -1;
        rest.forEach((item, index) => { if (item.groupId === tab.groupId) end = index; });
        const at = end >= 0 ? end + 1 : tabs.findIndex(item => item.id === tab.id);
        tabs = [...rest.slice(0, at), withoutGroup(tab), ...rest.slice(at)];
      }
      return tabs === state.tabs ? state : rebuild(state, tabs);
    }
    case 'updateGroup': {
      const group = findGroup(state, action.groupId);
      if (!group) return state;
      const next: TabGroup = { ...group };
      if (typeof action.patch.name === 'string') next.name = cleanTitle(action.patch.name);
      if (action.patch.color && TAB_GROUP_COLORS.includes(action.patch.color)) next.color = action.patch.color;
      if (typeof action.patch.collapsed === 'boolean') next.collapsed = action.patch.collapsed;
      const groups = state.groups!.map(item => (item.id === group.id ? next : item));
      // Collapsing the group that holds the focused tab moves focus to the nearest tab outside it, like a browser.
      if (next.collapsed && findTab(state, state.activeId)?.groupId === group.id) {
        const at = state.tabs.findIndex(tab => tab.id === state.activeId);
        const outside = state.tabs.map((tab, index) => ({ tab, index })).filter(entry => entry.tab.groupId !== group.id)
          .sort((a, b) => Math.abs(a.index - at) - Math.abs(b.index - at) || b.index - a.index)[0];
        if (!outside) return state;
        return withSplit({ ...state, groups }, state.tabs, outside.tab.id, state.splitId === outside.tab.id ? undefined : state.splitId);
      }
      return rebuild(state, state.tabs, groups);
    }
    case 'ungroup':
      if (!findGroup(state, action.groupId)) return state;
      return rebuild(state, state.tabs.map(tab => (tab.groupId === action.groupId ? withoutGroup(tab) : tab)), state.groups!.filter(group => group.id !== action.groupId));
    case 'moveGroup': {
      if (!findGroup(state, action.groupId)) return state;
      const members = state.tabs.filter(tab => tab.groupId === action.groupId);
      const rest = state.tabs.filter(tab => tab.groupId !== action.groupId);
      let to = Math.max(0, Math.min(rest.length, Math.trunc(action.toIndex)));
      // Never drop a group inside another group: slide to that group's edge.
      while (to > 0 && to < rest.length && rest[to - 1].groupId && rest[to - 1].groupId === rest[to].groupId) to += 1;
      return rebuild(state, [...rest.slice(0, to), ...members, ...rest.slice(to)]);
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Sleep selection
// ---------------------------------------------------------------------------------------------------------------

/**
 * Which tabs stay mounted. The active tab and the split tab are always awake; exempt tabs (playing, an open
 * dialog, a failed save) are always awake and don't count. Otherwise the most recently used tabs stay awake
 * up to `keepAlive` non-exempt tabs, and the rest sleep.
 */
export function awakeTabIds(state: TabsState, exempt: ReadonlySet<string> = new Set(), keepAlive: number = TAB_LIMITS.keepAlive): Set<string> {
  const awake = new Set<string>();
  for (const tab of state.tabs) if (exempt.has(tab.id)) awake.add(tab.id);
  const pinned = [state.activeId, state.splitId].filter((id): id is string => !!id && !!findTab(state, id));
  let budget = keepAlive;
  for (const id of pinned) {
    if (awake.has(id)) continue;
    awake.add(id);
    budget -= 1;
  }
  // A collapsed group's tabs sleep (KEY-426); exemptions still apply above.
  const byRecent = state.tabs.filter(tab => !awake.has(tab.id) && !inCollapsedGroup(state, tab)).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  for (const tab of byRecent) {
    if (budget <= 0) break;
    awake.add(tab.id);
    budget -= 1;
  }
  return awake;
}

/** The tabs that must save their snapshot and unmount now: awake before, asleep after. */
export function tabsToSleep(previouslyAwake: ReadonlySet<string>, nowAwake: ReadonlySet<string>): string[] {
  return [...previouslyAwake].filter(id => !nowAwake.has(id));
}

// ---------------------------------------------------------------------------------------------------------------
// Persistence and restore
// ---------------------------------------------------------------------------------------------------------------

function sanitizeTab(raw: unknown): WorkspaceTab | undefined {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id || raw.id.length > 100 || !Array.isArray(raw.history)) return undefined;
  const rawIndex = Math.trunc(finiteNumber(raw.index, 0));
  const kept: TabLocation[] = [];
  let index = 0;
  raw.history.forEach((entry, at) => {
    const location = sanitizeLocation(entry);
    if (!location) return;
    if (at <= rawIndex) index = kept.length;
    kept.push(location);
  });
  if (kept.length === 0) return undefined;
  const capped = capHistory(kept, Math.min(index, kept.length - 1));
  const openedAt = finiteNumber(raw.openedAt, 0);
  const tab: WorkspaceTab = { id: raw.id, openedAt, lastActiveAt: finiteNumber(raw.lastActiveAt, openedAt), ...capped };
  if (typeof raw.groupId === 'string' && raw.groupId && raw.groupId.length <= 100) tab.groupId = raw.groupId;
  return tab;
}

function sanitizeGroups(raw: unknown): TabGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: TabGroup[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id || entry.id.length > 100 || out.some(group => group.id === entry.id)) continue;
    const color = TAB_GROUP_COLORS.find(item => item === entry.color) ?? 'grey';
    out.push({ id: entry.id, name: cleanTitle(entry.name), color, collapsed: entry.collapsed === true });
  }
  return out;
}

/**
 * Reads saved tabs. Unknown views and broken entries are dropped, invalid targets cleared, duplicate ids and
 * second copies of single-instance views removed, and the active tab fixed. Never throws.
 */
export function parseTabs(raw: unknown): TabsState {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return EMPTY_TABS; }
  }
  if (!isRecord(value) || !Array.isArray(value.tabs)) return EMPTY_TABS;
  const tabs: WorkspaceTab[] = [];
  const ids = new Set<string>();
  const singles = new Set<WorkspaceView>();
  for (const entry of value.tabs) {
    const tab = sanitizeTab(entry);
    if (!tab || ids.has(tab.id)) continue;
    const view = currentLocation(tab).view;
    if (SINGLE_INSTANCE_VIEWS.includes(view)) {
      if (singles.has(view)) continue;
      singles.add(view);
    }
    ids.add(tab.id);
    tabs.push(tab);
  }
  if (tabs.length === 0) return EMPTY_TABS;
  const activeId = typeof value.activeId === 'string' && ids.has(value.activeId) ? value.activeId : tabs[0].id;
  const splitId = typeof value.splitId === 'string' && ids.has(value.splitId) && value.splitId !== activeId ? value.splitId : undefined;
  const ratio = typeof value.splitRatio === 'number' && Number.isFinite(value.splitRatio) ? Math.min(0.8, Math.max(0.2, value.splitRatio)) : undefined;
  const parsed = withSplit({ tabs, activeId, groups: sanitizeGroups(value.groups), splitRatio: ratio, splitSwapped: value.splitSwapped === true }, tabs, activeId, splitId);
  // The focused tab is never hidden in a collapsed group.
  const holder = findGroup(parsed, findTab(parsed, activeId)?.groupId);
  if (holder?.collapsed) parsed.groups = parsed.groups!.map(group => (group.id === holder.id ? { ...group, collapsed: false } : group));
  return parsed;
}

/** What goes in `workspace.tabs.v1`: at most `maxSavedTabs` tabs (the active and split tabs always kept). */
export function serializeTabs(state: TabsState, maxTabs: number = TAB_LIMITS.maxSavedTabs): TabsState {
  let tabs = state.tabs;
  if (tabs.length > maxTabs) {
    const keep = new Set(
      [...tabs]
        .sort((a, b) => Number(b.id === state.activeId || b.id === state.splitId) - Number(a.id === state.activeId || a.id === state.splitId) || b.lastActiveAt - a.lastActiveAt)
        .slice(0, maxTabs)
        .map(tab => tab.id),
    );
    tabs = tabs.filter(tab => keep.has(tab.id));
  }
  tabs = tabs.map(tab => ({ ...tab, ...capHistory(tab.history, tab.index) }));
  // Groups ride along with their tabs; a group whose tabs were all dropped goes too.
  return withSplit(state, tabs, state.activeId, state.splitId);
}

// ---------------------------------------------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------------------------------------------

export interface WorkspacePrefs {
  /** "On startup": restore previous tabs (true, default) or start fresh. */
  restoreTabs: boolean;
  /** "After restoring, show": a new Home tab (default) or the last tab. Only applies when `restoreTabs`. */
  restoreFocus: 'new' | 'last';
  /** "Open links in": a new tab (default) or the same tab. */
  linkTarget: 'new' | 'same';
}

export const DEFAULT_WORKSPACE_PREFS: WorkspacePrefs = { restoreTabs: true, restoreFocus: 'new', linkTarget: 'new' };

export function parsePrefs(raw: unknown): WorkspacePrefs {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return { ...DEFAULT_WORKSPACE_PREFS }; }
  }
  if (!isRecord(value)) return { ...DEFAULT_WORKSPACE_PREFS };
  return {
    restoreTabs: typeof value.restoreTabs === 'boolean' ? value.restoreTabs : DEFAULT_WORKSPACE_PREFS.restoreTabs,
    restoreFocus: value.restoreFocus === 'last' || value.restoreFocus === 'new' ? value.restoreFocus : DEFAULT_WORKSPACE_PREFS.restoreFocus,
    linkTarget: value.linkTarget === 'same' || value.linkTarget === 'new' ? value.linkTarget : DEFAULT_WORKSPACE_PREFS.linkTarget,
  };
}

/** The second restore setting is greyed out unless restoring is on. */
export const restoreFocusEnabled = (prefs: WorkspacePrefs): boolean => prefs.restoreTabs;

/** Ctrl+click and middle-click do the opposite of the "Open links in" setting. */
export function linkOpensNewTab(prefs: WorkspacePrefs, modifiers: { ctrl?: boolean; meta?: boolean; middle?: boolean } = {}): boolean {
  const flipped = !!(modifiers.ctrl || modifiers.meta || modifiers.middle);
  return (prefs.linkTarget === 'new') !== flipped;
}

/**
 * The tabs at launch. Start fresh, or nothing saved: one Home tab. Restore: the saved tabs, plus a new focused
 * Home tab unless the user chose "the tab I was on last". Restored tabs start asleep (`awakeTabIds` with only
 * the focused tab mounted is up to the caller).
 */
export function startupTabs(saved: TabsState, prefs: WorkspacePrefs, homeId: string, now: number): TabsState {
  const fresh: TabsState = { tabs: [newTab(homeId, homeLocation(), now)], activeId: homeId };
  if (!prefs.restoreTabs || saved.tabs.length === 0) return fresh;
  if (prefs.restoreFocus === 'last' && findTab(saved, saved.activeId)) return saved;
  if (findTab(saved, homeId)) return saved;
  // A new Home tab in front; the saved split pair isn't shown beside it.
  return withSplit(saved, [...saved.tabs, newTab(homeId, homeLocation(), now)], homeId, undefined);
}

// ---------------------------------------------------------------------------------------------------------------
// "Most used" destinations
// ---------------------------------------------------------------------------------------------------------------

export type UsageMap = Record<string, { count: number; lastUsedAt: number }>;

/** Shown until enough use is recorded. */
export const DEFAULT_DESTINATIONS: readonly WorkspaceView[] = ['library', 'quran', 'sunnah'];
const MIN_RECORDED_USES = 5;
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;

const usageScore = (entry: { count: number; lastUsedAt: number }, now: number): number =>
  entry.count * Math.pow(0.5, Math.max(0, now - entry.lastUsedAt) / HALF_LIFE_MS);

export function parseUsage(raw: unknown): UsageMap {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  if (!isRecord(value)) return {};
  const out: UsageMap = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isView(key) || !isRecord(entry)) continue;
    const count = finiteNumber(entry.count, 0), lastUsedAt = finiteNumber(entry.lastUsedAt, 0);
    if (count > 0) out[key] = { count, lastUsedAt };
  }
  return out;
}

/** Counts one use of a destination, keeping the `maxUsage` highest-scoring ones. */
export function recordUsage(usage: UsageMap, destination: WorkspaceView, now: number): UsageMap {
  const previous = usage[destination];
  const next: UsageMap = { ...usage, [destination]: { count: (previous?.count ?? 0) + 1, lastUsedAt: now } };
  const keys = Object.keys(next);
  if (keys.length <= TAB_LIMITS.maxUsage) return next;
  const keep = keys.sort((a, b) => usageScore(next[b], now) - usageScore(next[a], now)).slice(0, TAB_LIMITS.maxUsage);
  return Object.fromEntries(keep.map(key => [key, next[key]]));
}

/** Destinations ranked by use with a 14-day half-life; the defaults until enough use is recorded. */
export function rankDestinations(usage: UsageMap, now: number, limit = 6): WorkspaceView[] {
  const total = Object.values(usage).reduce((sum, entry) => sum + entry.count, 0);
  if (total < MIN_RECORDED_USES) return DEFAULT_DESTINATIONS.slice(0, limit);
  return (Object.keys(usage) as WorkspaceView[])
    .filter(isView)
    .sort((a, b) => usageScore(usage[b], now) - usageScore(usage[a], now) || a.localeCompare(b))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------------------------------------------
// Recents and closed tabs
// ---------------------------------------------------------------------------------------------------------------

export interface RecentItem {
  view: WorkspaceView;
  target?: string;
  title: string;
  openedAt: number;
}

const recentKey = (item: Pick<RecentItem, 'view' | 'target'>): string => item.target ?? `view:${item.view}`;

function sanitizeRecent(raw: unknown): RecentItem | undefined {
  const location = sanitizeLocation(raw);
  if (!location || !isRecord(raw)) return undefined;
  const item: RecentItem = { view: location.view, title: location.title, openedAt: finiteNumber(raw.openedAt, 0) };
  if (location.target) item.target = location.target;
  return item;
}

export function parseRecent(raw: unknown): RecentItem[] {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: RecentItem[] = [];
  for (const entry of value) {
    const item = sanitizeRecent(entry);
    if (!item || seen.has(recentKey(item))) continue;
    seen.add(recentKey(item));
    out.push(item);
    if (out.length >= TAB_LIMITS.maxRecent) break;
  }
  return out;
}

/** Puts an item first, removing an older copy of the same item. */
export function pushRecent(list: RecentItem[], item: RecentItem): RecentItem[] {
  const key = recentKey(item);
  return [item, ...list.filter(entry => recentKey(entry) !== key)].slice(0, TAB_LIMITS.maxRecent);
}

/** The last closed tabs, newest first, for Ctrl+Shift+T. */
export function pushClosed(list: WorkspaceTab[], tab: WorkspaceTab): WorkspaceTab[] {
  return [{ ...tab, ...capHistory(tab.history, tab.index) }, ...list.filter(entry => entry.id !== tab.id)].slice(0, TAB_LIMITS.maxClosed);
}

export function parseClosed(raw: unknown): WorkspaceTab[] {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeTab).filter((tab): tab is WorkspaceTab => !!tab).slice(0, TAB_LIMITS.maxClosed);
}
