/**
 * KEY-419 (WS-3): which tabs stay mounted. Up to 6 recently used tabs stay awake (ADR-018, Tab State spec).
 * A tab leaving that set saves first and only unmounts once its save succeeded; a failed save keeps it awake
 * (and counts as exempt) until the user comes back to it.
 */
import React from 'react';
import { awakeTabIds, type TabsState } from '../../../shared/workspace-tabs';

export interface KeepAlivePlan {
  /** Tabs to mount now. */
  wake: string[];
  /** Tabs that should save and then unmount. */
  sleep: string[];
}

/** The tabs on screen: the focused tab and the side-by-side tab. Only these wake a sleeping tab. */
const shownIds = (state: TabsState): string[] => [state.activeId, state.splitId].filter((id): id is string => !!id && state.tabs.some(tab => tab.id === id));

/**
 * What changes: wake a sleeping tab only when it is shown, and save-then-sleep the awake tabs that fell out of
 * the keep-alive set. A sleeping tab that is merely recent stays asleep (restored and background tabs don't
 * mount until the user opens them).
 */
export function planKeepAlive(state: TabsState, awake: ReadonlySet<string>, exempt: ReadonlySet<string>, failed: ReadonlySet<string>, keepAlive?: number): KeepAlivePlan {
  const open = new Set(state.tabs.map(tab => tab.id));
  const target = keepAliveTarget(state, awake, new Set([...exempt, ...failed].filter(id => open.has(id))), keepAlive);
  return {
    wake: shownIds(state).filter(id => !awake.has(id)),
    sleep: [...awake].filter(id => open.has(id) && !target.has(id)),
  };
}

/**
 * Which mounted tabs stay mounted: the keep-alive ranking (`awakeTabIds`) among the tabs that are mounted or on
 * screen. Sleeping tabs don't use up the budget, so a recent but unopened background tab can't push an open one
 * to sleep.
 */
function keepAliveTarget(state: TabsState, mounted: ReadonlySet<string>, exempt: ReadonlySet<string>, keepAlive?: number): Set<string> {
  const shown = shownIds(state);
  const candidates = { ...state, tabs: state.tabs.filter(tab => mounted.has(tab.id) || shown.includes(tab.id)) };
  return awakeTabIds(candidates, exempt, keepAlive);
}

const without = (set: ReadonlySet<string>, ids: Iterable<string>) => { const next = new Set(set); for (const id of ids) next.delete(id); return next; };

/**
 * The awake tab ids for rendering. `saveTab` runs the tab's snapshot save (WS-8 adds each view's own part)
 * and resolves to false when the save failed. Closed tabs drop out at once.
 *
 * Only the tabs that finished sleeping are kept as state; the awake set is derived from them on each render,
 * so a tab that becomes wanted again is shown in the same render that wants it.
 */
export function useTabKeepAlive(state: TabsState, exempt: ReadonlySet<string>, saveTab: (id: string) => Promise<boolean>, keepAlive?: number): ReadonlySet<string> {
  const open = new Set(state.tabs.map(tab => tab.id));
  const [failed, setFailed] = React.useState<ReadonlySet<string>>(() => new Set());
  const shown = shownIds(state);
  // Restored tabs start asleep: startup mounts only the tabs on screen.
  const [sleeping, setSleeping] = React.useState<ReadonlySet<string>>(() => new Set([...open].filter(id => !shown.includes(id))));
  // Tabs this hook has seen; a tab that appears later (Ctrl+T, a link, a duplicate) starts asleep unless shown.
  const [known, setKnown] = React.useState<ReadonlySet<string>>(() => open);
  const saving = React.useRef(new Set<string>());
  const saveRef = React.useRef(saveTab);
  React.useEffect(() => { saveRef.current = saveTab; });

  // Adjusting state while rendering (React's documented pattern): a new background tab starts asleep, a shown tab
  // is no longer asleep, and coming back to a tab whose save failed gives it another chance to sleep later.
  const arrived = [...open].filter(id => !known.has(id));
  if (arrived.length) {
    setKnown(new Set([...known].filter(id => open.has(id)).concat(arrived)));
    const background = arrived.filter(id => !shown.includes(id));
    if (background.length) setSleeping(new Set([...sleeping, ...background]));
  }
  const woken = shown.filter(id => sleeping.has(id));
  if (woken.length) setSleeping(without(sleeping, woken));
  if (state.activeId && failed.has(state.activeId)) setFailed(without(failed, [state.activeId]));

  const asleep = new Set([...sleeping, ...arrived.filter(id => !shown.includes(id))]);
  const awake = new Set([...open].filter(id => shown.includes(id) || !asleep.has(id)));
  const target = keepAliveTarget(state, awake, new Set([...exempt, ...failed].filter(id => open.has(id))), keepAlive);
  const toSleep = [...awake].filter(id => !target.has(id));
  const toSleepKey = toSleep.join('\n');

  React.useEffect(() => {
    for (const id of toSleepKey ? toSleepKey.split('\n') : []) {
      if (saving.current.has(id)) continue;
      saving.current.add(id);
      saveRef.current(id)
        .catch(() => false)
        .then(ok => {
          saving.current.delete(id);
          if (ok) setSleeping(previous => new Set(previous).add(id));
          else setFailed(previous => new Set(previous).add(id));
        });
    }
  }, [toSleepKey]);

  return awake;
}
