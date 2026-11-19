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

/** What changes: wake the newly wanted tabs at once, save-then-sleep the ones no longer wanted. */
export function planKeepAlive(state: TabsState, awake: ReadonlySet<string>, exempt: ReadonlySet<string>, failed: ReadonlySet<string>, keepAlive?: number): KeepAlivePlan {
  const open = new Set(state.tabs.map(tab => tab.id));
  const target = awakeTabIds(state, new Set([...exempt, ...failed].filter(id => open.has(id))), keepAlive);
  return {
    wake: [...target].filter(id => !awake.has(id)),
    sleep: [...awake].filter(id => open.has(id) && !target.has(id)),
  };
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
  const target = awakeTabIds(state, new Set([...exempt, ...failed].filter(id => open.has(id))), keepAlive);
  // Restored tabs start asleep except the ones that are wanted now (startup mounts at most 6).
  const [sleeping, setSleeping] = React.useState<ReadonlySet<string>>(() => new Set([...open].filter(id => !target.has(id))));
  const saving = React.useRef(new Set<string>());
  const saveRef = React.useRef(saveTab);
  React.useEffect(() => { saveRef.current = saveTab; });

  // Adjusting state while rendering (React's documented pattern): a woken tab is no longer asleep, and coming
  // back to a tab whose save failed gives it another chance to sleep later.
  const woken = [...target].filter(id => sleeping.has(id));
  if (woken.length) setSleeping(without(sleeping, woken));
  if (state.activeId && failed.has(state.activeId)) setFailed(without(failed, [state.activeId]));

  const awake = new Set([...open].filter(id => target.has(id) || !sleeping.has(id)));
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
