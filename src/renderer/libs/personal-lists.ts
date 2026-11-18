'use client';

/**
 * Baglib — renderer side of personal lists (KEY-386): a typed client over IPC and a shared store,
 * so every star, chip, filter and the hub stay in step after any change.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PERSONAL_LISTS_CHANGED,
  type ListFilterMode,
  type PersonalList,
  type PersonalListItem,
  type PersonalListItemKind,
  type PersonalListsAPI,
} from '../../shared/personal-lists';

type Action = Parameters<Window['electronAPI']['personalLists']['invoke']>[0];

async function call<T>(action: Action, ...args: unknown[]): Promise<T> {
  const api = typeof window !== 'undefined' ? window.electronAPI?.personalLists : undefined;
  if (!api) throw new Error('unavailable');
  const result = await api.invoke<T>(action, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const changed = () => window.dispatchEvent(new CustomEvent(PERSONAL_LISTS_CHANGED));
const mutate = async <T>(action: Action, ...args: unknown[]): Promise<T> => {
  const data = await call<T>(action, ...args);
  changed();
  return data;
};

export const personalLists: PersonalListsAPI = {
  all: () => call('all'),
  create: name => mutate('create', name),
  rename: (id, name) => mutate('rename', id, name),
  remove: id => mutate('remove', id),
  reorder: ids => mutate('reorder', ids),
  items: (listId, kind) => call('items', listId, kind ?? null),
  add: (listId, item) => mutate('add', listId, item),
  removeItem: (listId, kind, ref) => mutate('remove-item', listId, kind, ref),
  reorderItems: (listId, ids) => mutate('reorder-items', listId, ids),
  toggleStar: item => mutate('toggle-star', item),
  membership: (kind, refs) => call('membership', kind, refs),
  filter: (kind, ids, mode) => call('filter', kind, ids, mode),
};

/** Calls `load` now and after every list change anywhere in the app. */
function useOnListsChanged(load: () => void): void {
  useEffect(() => {
    load();
    window.addEventListener(PERSONAL_LISTS_CHANGED, load);
    return () => window.removeEventListener(PERSONAL_LISTS_CHANGED, load);
  }, [load]);
}

/** All lists (Starred first), refreshed on every change. */
export function usePersonalLists(): { lists: PersonalList[]; reload: () => void } {
  const [lists, setLists] = useState<PersonalList[]>([]);
  const reload = useCallback(() => {
    personalLists.all().then(setLists, () => setLists([]));
  }, []);
  useOnListsChanged(reload);
  return { lists, reload };
}

/** For the given references, the lists each belongs to (chips), refreshed on every change. */
export function useListMembership(kind: PersonalListItemKind, refs: readonly string[]): Record<string, string[]> {
  const [membership, setMembership] = useState<Record<string, string[]>>({});
  const key = refs.join('\n');
  const load = useCallback(() => {
    const wanted = key ? key.split('\n') : [];
    if (wanted.length === 0) return setMembership({});
    personalLists.membership(kind, wanted).then(setMembership, () => setMembership({}));
  }, [kind, key]);
  useOnListsChanged(load);
  return membership;
}

/** A section's list filter: the chosen lists, any/all, and the matching references (null = no filter). */
export function useListFilter(kind: PersonalListItemKind): {
  chosen: string[];
  mode: ListFilterMode;
  refs: Set<string> | null;
  toggle: (listId: string) => void;
  setMode: (mode: ListFilterMode) => void;
  clear: () => void;
  only: (listId: string) => void;
} {
  const [chosen, setChosen] = useState<string[]>([]);
  const [mode, setMode] = useState<ListFilterMode>('any');
  const [matches, setMatches] = useState<string[] | null>(null);
  const key = chosen.join(',');
  const load = useCallback(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) return setMatches(null);
    personalLists.filter(kind, ids, mode).then(setMatches, () => setMatches([]));
  }, [kind, key, mode]);
  useOnListsChanged(load);
  const refs = useMemo(() => (matches ? new Set(matches) : null), [matches]);
  return {
    chosen,
    mode,
    refs,
    setMode,
    toggle: listId => setChosen(current => (current.includes(listId) ? current.filter(id => id !== listId) : [...current, listId])),
    clear: () => setChosen([]),
    only: listId => setChosen([listId]),
  };
}

export type { PersonalList, PersonalListItem, PersonalListItemKind, ListFilterMode };
