/**
 * KEY-422 (WS-6): what the + panel shows. "Most used" ranks the destinations the user opens (with a 14-day decay,
 * the defaults until enough use is recorded); "Recent" lists opened items. Both are kept in settings
 * (`workspace.usage.v1`, `workspace.recent.v1`); the Quran, Sunnah and poetry "continue reading" places
 * (`islamic.continue.v1.*`) join the recents.
 */
import React from 'react';
import {
  WORKSPACE_RECENT_SETTING, WORKSPACE_USAGE_SETTING, currentLocation, findTab, parseRecent, parseUsage, pushRecent,
  rankDestinations, recordUsage, type RecentItem, type TabLocation, type TabsState, type UsageMap, type WorkspaceView,
} from '../../../shared/workspace-tabs';
import { CONTINUE_KEY, continueReading, loadQuranContinueReading, type ContinueKind } from '../islamic/continue-reading';
import { QUICK_OPEN_RECENT } from './QuickOpenPanel';

/** Views that count as destinations for "Most used". Home is where a new tab starts; the reader is reached from a book. */
const NOT_DESTINATIONS: readonly WorkspaceView[] = ['dashboard', 'reader', 'notes-editor'];
export const isDestination = (view: WorkspaceView): boolean => !NOT_DESTINATIONS.includes(view);

const CONTINUE_VIEW: Record<ContinueKind, WorkspaceView> = { quran: 'quran', sunnah: 'sunnah', poetry: 'bayan' };

/** A place with an item (book, note, ayah, hadith, poem, lecture moment) becomes a recent; a bare view does not. */
export function recentFor(location: TabLocation, now: number): RecentItem | null {
  if (!location.target) return null;
  return { view: location.view, target: location.target, title: location.title, openedAt: now };
}

/** The panel's recents: the user's own first, then the continue-reading places not already listed. */
export function mergeRecents(own: readonly RecentItem[], continues: readonly RecentItem[], limit: number = QUICK_OPEN_RECENT): RecentItem[] {
  const seen = new Set(own.map(item => item.target ?? `view:${item.view}`));
  return [...own, ...continues.filter(item => !seen.has(item.target ?? `view:${item.view}`))].slice(0, limit);
}

/** A key that changes when the focused tab moves to another view or item. */
const placeKey = (state: TabsState): string => {
  const tab = findTab(state, state.activeId);
  if (!tab) return '';
  const location = currentLocation(tab);
  return `${tab.id}|${location.view}|${location.target ?? ''}`;
};

async function loadContinues(): Promise<RecentItem[]> {
  const settings = window.electronAPI?.settings;
  if (!settings) return [];
  const out: RecentItem[] = [];
  const quran = await loadQuranContinueReading().catch(() => null);
  if (quran) out.push({ view: 'quran', target: quran.target, title: quran.label, openedAt: 0 });
  for (const kind of ['sunnah', 'poetry'] as const) {
    const entry = continueReading(await settings.get(`${CONTINUE_KEY}.${kind}`).catch(() => null), kind);
    if (entry) out.push({ view: CONTINUE_VIEW[kind], target: entry.target, title: entry.label, openedAt: 0 });
  }
  return out;
}

/**
 * Records each move of the focused tab to a destination or an item, and returns the panel's data. The tab the app
 * starts on is not counted.
 */
export function useQuickOpenData(state: TabsState, now: () => number = Date.now): { destinations: WorkspaceView[]; recent: RecentItem[] } {
  const [usage, setUsage] = React.useState<UsageMap>({});
  const [own, setOwn] = React.useState<RecentItem[]>([]);
  const [continues, setContinues] = React.useState<RecentItem[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [lastPlace, setLastPlace] = React.useState(() => placeKey(state));

  React.useEffect(() => {
    let alive = true;
    const settings = window.electronAPI?.settings;
    const load = async () => {
      const [savedUsage, savedRecent, places] = await Promise.all([
        settings ? settings.get(WORKSPACE_USAGE_SETTING).catch(() => null) : null,
        settings ? settings.get(WORKSPACE_RECENT_SETTING).catch(() => null) : null,
        loadContinues(),
      ]);
      if (!alive) return;
      // Anything recorded before the settings answered is kept on top of what was saved.
      setUsage(previous => Object.entries(previous).reduce((map, [view, entry]) => ({ ...map, [view]: { count: (map[view]?.count ?? 0) + entry.count, lastUsedAt: entry.lastUsedAt } }), parseUsage(savedUsage)));
      setOwn(previous => previous.reduceRight((list, item) => pushRecent(list, item), parseRecent(savedRecent)));
      setContinues(places);
      setLoaded(true);
    };
    void load();
    const refresh = () => { void loadContinues().then(places => { if (alive) setContinues(places); }); };
    window.addEventListener('baglib:continue-reading', refresh);
    return () => { alive = false; window.removeEventListener('baglib:continue-reading', refresh); };
  }, []);

  // Adjusted while rendering: the focused tab reached a new place.
  const place = placeKey(state);
  if (place !== lastPlace) {
    setLastPlace(place);
    const tab = findTab(state, state.activeId);
    if (tab) {
      const location = currentLocation(tab);
      const at = now();
      if (isDestination(location.view)) setUsage(previous => recordUsage(previous, location.view, at));
      const item = recentFor(location, at);
      if (item) setOwn(previous => pushRecent(previous, item));
    }
  }

  // Save after changes, once the saved values were read (so an early write can't wipe them).
  React.useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => {
      void window.electronAPI?.settings?.set(WORKSPACE_USAGE_SETTING, usage);
      void window.electronAPI?.settings?.set(WORKSPACE_RECENT_SETTING, own);
    }, 400);
    return () => clearTimeout(id);
  }, [usage, own, loaded]);

  return React.useMemo(() => ({
    destinations: rankDestinations(usage, now()),
    recent: mergeRecents(own, continues),
  }), [usage, own, continues, now]);
}
