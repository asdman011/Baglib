/**
 * KEY-428 (WS-10): selecting several tabs, and what the tab right-click menu acts on. Pure, so it is unit-tested
 * directly; the selection is UI state and is never saved.
 *
 * | Action        | Result                                                      |
 * |---------------|-------------------------------------------------------------|
 * | Click         | Selects and focuses that tab, and clears the selection      |
 * | Ctrl+click    | Adds or removes a tab                                       |
 * | Shift+click   | Selects every tab from the anchor to the clicked one        |
 * | Esc           | Clears the selection                                        |
 * | Ctrl+Shift+←/→| Extends the selection one tab (visual direction in Arabic) |
 *
 * The focused tab is always part of the selection. Ids are kept in the bar's order.
 */
import { formatDeepLink } from './deep-link';
import { canonicalItemRef, cleanItemLabel, type PersonalListItemKind } from './personal-lists';
import { currentLocation, type TabsState, type WorkspaceTab } from './workspace-tabs';

export interface TabSelection {
  /** The selected tab ids, in the bar's order. Always includes the focused tab. */
  ids: string[];
  /** Where a Shift+click range starts: the last tab clicked without Shift. */
  anchor: string | null;
}

/** The result of a selection gesture: the new selection and the tab to focus. */
export interface SelectionChange {
  selection: TabSelection;
  focus: string | null;
}

const inBarOrder = (state: TabsState, ids: Iterable<string>): string[] => {
  const wanted = new Set(ids);
  return state.tabs.filter(tab => wanted.has(tab.id)).map(tab => tab.id);
};

/** Only the focused tab: the resting state, and what Esc and a plain click leave. */
export function singleSelection(activeId: string | null): TabSelection {
  return { ids: activeId ? [activeId] : [], anchor: activeId };
}

/** Drops closed tabs and makes sure the focused tab is selected. */
export function normalizeSelection(state: TabsState, selection: TabSelection): TabSelection {
  const ids = inBarOrder(state, state.activeId ? [...selection.ids, state.activeId] : selection.ids);
  const anchor = selection.anchor && ids.includes(selection.anchor) ? selection.anchor : state.activeId;
  return { ids, anchor };
}

/** A plain click: select and focus that tab only. */
export function clickTab(id: string): SelectionChange {
  return { selection: { ids: [id], anchor: id }, focus: id };
}

/**
 * Ctrl+click: add the tab (and focus it), or remove it. Removing the focused tab moves focus to the nearest
 * selected tab; the last selected tab can't be removed.
 */
export function toggleTab(state: TabsState, selection: TabSelection, id: string): SelectionChange {
  const current = normalizeSelection(state, selection);
  if (!state.tabs.some(tab => tab.id === id)) return { selection: current, focus: state.activeId };
  if (!current.ids.includes(id)) {
    return { selection: { ids: inBarOrder(state, [...current.ids, id]), anchor: id }, focus: id };
  }
  if (current.ids.length === 1) return { selection: current, focus: state.activeId };
  const ids = current.ids.filter(other => other !== id);
  let focus = state.activeId;
  if (id === state.activeId) {
    const at = state.tabs.findIndex(tab => tab.id === id);
    const nearest = [...ids].sort((a, b) => Math.abs(state.tabs.findIndex(tab => tab.id === a) - at) - Math.abs(state.tabs.findIndex(tab => tab.id === b) - at));
    focus = nearest[0];
  }
  return { selection: { ids, anchor: current.anchor === id ? focus : current.anchor }, focus };
}

/** Shift+click: every tab from the anchor (else the focused tab) to the clicked one, which takes focus. */
export function rangeTo(state: TabsState, selection: TabSelection, id: string): SelectionChange {
  const to = state.tabs.findIndex(tab => tab.id === id);
  if (to < 0) return { selection: normalizeSelection(state, selection), focus: state.activeId };
  const anchorId = selection.anchor && state.tabs.some(tab => tab.id === selection.anchor) ? selection.anchor : state.activeId;
  const from = Math.max(0, state.tabs.findIndex(tab => tab.id === anchorId));
  const [start, end] = from <= to ? [from, to] : [to, from];
  return { selection: { ids: state.tabs.slice(start, end + 1).map(tab => tab.id), anchor: anchorId ?? id }, focus: id };
}

/**
 * Ctrl+Shift+←/→: move focus one tab in the bar's order and select the range from the anchor. `step` is +1
 * for the next tab and -1 for the previous one; the caller maps the arrow keys to it by the reading direction.
 */
export function extendSelection(state: TabsState, selection: TabSelection, step: 1 | -1): SelectionChange {
  const at = state.tabs.findIndex(tab => tab.id === state.activeId);
  const next = state.tabs[at + step];
  if (at < 0 || !next) return { selection: normalizeSelection(state, selection), focus: state.activeId };
  return rangeTo(state, normalizeSelection(state, selection), next.id);
}

/** Which tabs the right-click menu acts on: the selection when the pointer is on it, else that tab alone. */
export function menuTargets(state: TabsState, selection: TabSelection, pointerId: string): string[] {
  const current = normalizeSelection(state, selection);
  if (current.ids.length > 1 && current.ids.includes(pointerId)) return current.ids;
  return state.tabs.some(tab => tab.id === pointerId) ? [pointerId] : [];
}

/** "Close other tabs": every tab except the targets. */
export function otherTabIds(state: TabsState, targets: readonly string[]): string[] {
  const keep = new Set(targets);
  return state.tabs.filter(tab => !keep.has(tab.id)).map(tab => tab.id);
}

/**
 * "Close tabs to the right" (to the left in Arabic): every tab after the last target in the bar's order. The bar
 * runs with the reading direction, so the order is the same in both languages; only the menu label flips.
 */
export function tabIdsAfter(state: TabsState, targets: readonly string[]): string[] {
  const wanted = new Set(targets);
  let last = -1;
  state.tabs.forEach((tab, index) => { if (wanted.has(tab.id)) last = index; });
  return last < 0 ? [] : state.tabs.slice(last + 1).map(tab => tab.id);
}

/** The menu's "Open side by side" item is shown only for exactly two tabs. */
export const canOpenSideBySide = (targets: readonly string[]): boolean => targets.length === 2;

/**
 * "Copy links": one line per tab, its title and its `baglib:` link. A tab without an item (Home, Library…)
 * copies its title only. `label` names a tab that has no title of its own.
 */
export function copyLinksText(state: TabsState, targets: readonly string[], label: (tab: WorkspaceTab) => string): string {
  return inBarOrder(state, targets)
    .map(id => state.tabs.find(tab => tab.id === id)!)
    .map(tab => {
      const target = currentLocation(tab).target;
      const title = label(tab);
      return target ? `${title} ${formatDeepLink(target)}` : title;
    })
    .join('\n');
}

/** The tabs' items for "Add to list": tabs without an item are skipped, and the caller says how many. */
export function listableTargets(state: TabsState, targets: readonly string[]): { targets: string[]; skipped: number } {
  const out: string[] = [];
  let skipped = 0;
  for (const id of inBarOrder(state, targets)) {
    const target = currentLocation(state.tabs.find(tab => tab.id === id)!).target;
    if (target) { if (!out.includes(target)) out.push(target); } else skipped += 1;
  }
  return { targets: out, skipped };
}

/** Maps a tab's study target to a PersonalList item input, or null if unsupported. */
export function tabTargetToListItem(target: string, label: string): { itemKind: PersonalListItemKind; itemRef: string; label: string } | null {
  const cleaned = cleanItemLabel(label) || target;
  if (target.startsWith('book:')) {
    const page = canonicalItemRef('page', target);
    if (page) return { itemKind: 'page', itemRef: page, label: cleaned };
    const book = canonicalItemRef('book', target);
    return book ? { itemKind: 'book', itemRef: book, label: cleaned } : null;
  }
  if (target.startsWith('quran:')) {
    const ref = canonicalItemRef('ayah', target);
    return ref ? { itemKind: 'ayah', itemRef: ref, label: cleaned } : null;
  }
  if (target.startsWith('sunnah:')) {
    const ref = canonicalItemRef('hadith', target);
    return ref ? { itemKind: 'hadith', itemRef: ref, label: cleaned } : null;
  }
  if (target.startsWith('poetry:')) {
    const ref = canonicalItemRef('poem', target);
    return ref ? { itemKind: 'poem', itemRef: ref, label: cleaned } : null;
  }
  if (target.startsWith('media:')) {
    const ref = canonicalItemRef('lecture', target);
    return ref ? { itemKind: 'lecture', itemRef: ref, label: cleaned } : null;
  }
  if (target.startsWith('note:')) {
    const ref = canonicalItemRef('note', target);
    return ref ? { itemKind: 'note', itemRef: ref, label: cleaned } : null;
  }
  return null;
}
