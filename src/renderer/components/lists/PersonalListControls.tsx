'use client';

/**
 * Baglib — personal list controls shared by every section (KEY-386):
 *   ListStarButton   the star (adds to or removes from Starred)
 *   AddToListButton  a menu of every list with a check for each, plus "New list…"
 *   ListChips        small chips naming the lists an item is in; a click filters, × removes
 *   ListFilterBar    a section's "in list" filter (lists holding that kind), any/all, and the matches
 *   listMenuItems    the same choices for right-click menus
 *   ItemListButtons  star and add-to-list for one item, loading its own membership (notes; KEY-415)
 *   addPlaceToList   "Add this moment / page to a list": a dialog for a place that keeps moving,
 *                    such as a lecture's playback time or the reader's page (KEY-415)
 */

import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, BookText, Clapperboard, Feather, FileText, ListPlus, ScrollText, Star, StickyNote, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { MenuItemProps } from '../ui/Menu';
import type { TranslationKey } from '../../translations';
import { STARRED_LIST_ID, type PersonalList, type PersonalListItem, type PersonalListItemKind } from '../../../shared/personal-lists';
import { personalLists, useListFilter, useListMembership, usePersonalLists } from '../../libs/personal-lists';
import { ContextMenu } from '../ui/ContextMenu';

export interface ListItemInput {
  kind: PersonalListItemKind;
  itemRef: string;
  label: string;
}

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

export const KIND_ICON: Record<PersonalListItemKind, React.ComponentType<{ className?: string; size?: number }>> = {
  book: BookOpen,
  ayah: BookText,
  hadith: ScrollText,
  poem: Feather,
  lecture: Clapperboard,
  note: StickyNote,
  page: FileText,
};

export const KIND_LABEL: Record<PersonalListItemKind, TranslationKey> = {
  book: 'listsKindBook',
  ayah: 'listsKindAyah',
  hadith: 'listsKindHadith',
  poem: 'listsKindPoem',
  lecture: 'listsKindLecture',
  note: 'listsKindNote',
  page: 'listsKindPage',
};

export const listName = (list: Pick<PersonalList, 'kind' | 'name'>, t: T) => (list.kind === 'starred' ? t('listsStarred') : list.name);

const toInput = (item: ListItemInput) => ({ itemKind: item.kind, itemRef: item.itemRef, label: item.label });

export async function toggleInList(listId: string, item: ListItemInput, inList: boolean): Promise<void> {
  if (inList) await personalLists.removeItem(listId, item.kind, item.itemRef);
  else await personalLists.add(listId, toInput(item));
}

const NEW_LIST_EVENT = 'baglib:personal-list-new';
const ADD_PLACE_EVENT = 'baglib:personal-list-add-place';

/** Opens the "New list" dialog (mounted once by NewListDialogHost); the item, if any, goes into the new list. */
export function createListWith(item: ListItemInput | null): void {
  window.dispatchEvent(new CustomEvent(NEW_LIST_EVENT, { detail: item }));
}

/**
 * Opens the "Add to list" dialog for a place read at the moment of the click (a lecture moment, a
 * book page). Its reference changes as the user plays or reads, so no membership is shown.
 */
export function addPlaceToList(item: ListItemInput): void {
  window.dispatchEvent(new CustomEvent(ADD_PLACE_EVENT, { detail: item }));
}

/** Star and add-to-list for one item whose reference is stable (a note), with its own membership. */
export function ItemListButtons({ item, className = '' }: { item: ListItemInput; className?: string }) {
  const { lists } = usePersonalLists();
  const membership = useListMembership(item.kind, [item.itemRef]);
  const heldBy = membership[item.itemRef] ?? [];
  return (
    <span className={`inline-flex items-center ${className}`} data-list-controls={item.itemRef}>
      <ListStarButton item={item} heldBy={heldBy} />
      <AddToListButton item={item} heldBy={heldBy} lists={lists} />
    </span>
  );
}

function AddPlaceDialog({ item, onClose }: { item: ListItemInput; onClose: () => void }) {
  const { t, dir } = useWorkspace();
  const { lists } = usePersonalLists();
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const add = async (listId: string) => {
    setError(false);
    try {
      await personalLists.add(listId, toInput(item));
      setAdded(current => [...current, listId]);
    } catch {
      setError(true);
    }
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="add-place-title" onMouseDown={onClose}>
      <div dir={dir} data-add-place-dialog={item.kind} onMouseDown={event => event.stopPropagation()} onKeyDown={event => event.key === 'Escape' && onClose()} className="w-full max-w-sm space-y-3 rounded-2xl border border-subtle bg-surface p-4 shadow-2xl">
        <h3 id="add-place-title" className="font-bold text-main">{t('listsAddTo')}</h3>
        <p className="text-sm text-muted" dir="auto" data-add-place-label>{item.label}</p>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {lists.map(l => {
            const done = added.includes(l.id);
            return (
              <li key={l.id}>
                <button type="button" autoFocus={l.kind === 'starred'} disabled={done} data-add-place-list={l.id} onClick={() => void add(l.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm text-main hover:bg-canvas disabled:opacity-70">
                  {l.kind === 'starred' ? <Star className="size-4 shrink-0 text-amber-500" fill="currentColor" /> : <ListPlus className="size-4 shrink-0 text-muted" />}
                  <span className="min-w-0 flex-1 truncate" dir="auto">{listName(l, t)}</span>
                  {done && <span className="text-xs text-success" data-add-place-added>{t('listsAdded')}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {error && <p role="alert" className="text-xs text-danger">{t('listsActionFailed')}</p>}
        <div className="flex justify-between gap-2">
          <button type="button" data-add-place-new onClick={() => { onClose(); createListWith(item); }} className="rounded-lg px-3 py-1.5 text-sm text-accent hover:bg-canvas">{t('listsNew')}</button>
          <button type="button" data-add-place-close onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-canvas">{t('close')}</button>
        </div>
      </div>
    </div>
  );
}

/** Hosts the "Add this moment / page to a list" dialog; mounted once with the "New list" dialog. */
function AddPlaceDialogHost() {
  const [item, setItem] = useState<ListItemInput | null>(null);
  useEffect(() => {
    const open = (event: Event) => setItem(((event as CustomEvent).detail as ListItemInput | null) ?? null);
    window.addEventListener(ADD_PLACE_EVENT, open);
    return () => window.removeEventListener(ADD_PLACE_EVENT, open);
  }, []);
  return item ? <AddPlaceDialog key={item.itemRef} item={item} onClose={() => setItem(null)} /> : null;
}

/** The one "New list" dialog, plus the "Add this moment / page" dialog. */
export function NewListDialogHost() {
  return (
    <>
      <NewListDialog />
      <AddPlaceDialogHost />
    </>
  );
}

/** The "New list" dialog. Electron has no window.prompt, so this asks for the name. */
function NewListDialog() {
  const { t, dir } = useWorkspace();
  const [pending, setPending] = useState<{ item: ListItemInput | null } | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    const open = (event: Event) => {
      setPending({ item: ((event as CustomEvent).detail as ListItemInput | null) ?? null });
      setName('');
      setError(false);
    };
    window.addEventListener(NEW_LIST_EVENT, open);
    return () => window.removeEventListener(NEW_LIST_EVENT, open);
  }, []);
  if (!pending) return null;
  const submit = async () => {
    if (!name.trim()) return;
    try {
      const list = await personalLists.create(name);
      if (pending.item) await personalLists.add(list.id, toInput(pending.item));
      setPending(null);
    } catch {
      setError(true);
    }
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="new-list-title" onMouseDown={() => setPending(null)}>
      <form dir={dir} data-new-list-dialog onMouseDown={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); void submit(); }} className="w-full max-w-sm space-y-3 rounded-2xl border border-subtle bg-surface p-4 shadow-2xl">
        <h3 id="new-list-title" className="font-bold text-main">{t('listsNew')}</h3>
        <input autoFocus dir="auto" value={name} maxLength={120} data-new-list-name placeholder={t('listsNewPrompt')} aria-label={t('listsNewPrompt')} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Escape' && setPending(null)} className="w-full rounded-lg border border-subtle bg-canvas px-3 py-2 text-sm text-main" />
        {error && <p role="alert" className="text-xs text-danger">{t('listsActionFailed')}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setPending(null)} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-canvas">{t('cancel')}</button>
          <button type="submit" data-new-list-create disabled={!name.trim()} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{t('listsCreate')}</button>
        </div>
      </form>
    </div>
  );
}

/** Right-click menu entries: Star / Unstar, and "Add to list" with a check per list. */
export function listMenuItems(item: ListItemInput, lists: PersonalList[], heldBy: readonly string[], t: T): MenuItemProps[] {
  const starred = heldBy.includes(STARRED_LIST_ID);
  return [
    { id: 'list-star', label: t(starred ? 'listsUnstar' : 'listsStar'), icon: <Star className="size-4" />, onClick: () => personalLists.toggleStar(toInput(item)) },
    {
      id: 'list-add',
      label: t('listsAddTo'),
      icon: <ListPlus className="size-4" />,
      children: [
        ...lists.filter(l => l.kind === 'custom').map(l => ({
          id: `list-${l.id}`,
          label: `${heldBy.includes(l.id) ? '✓ ' : ''}${l.name}`,
          onClick: () => toggleInList(l.id, item, heldBy.includes(l.id)),
        })),
        { id: 'list-new', label: t('listsNew'), onClick: () => createListWith(item) },
      ],
    },
  ];
}

export function ListStarButton({ item, heldBy, className = '' }: { item: ListItemInput; heldBy: readonly string[]; className?: string }) {
  const { t } = useWorkspace();
  const starred = heldBy.includes(STARRED_LIST_ID);
  return (
    <button
      type="button"
      data-list-star={item.itemRef}
      aria-pressed={starred}
      title={t(starred ? 'listsUnstar' : 'listsStar')}
      aria-label={t(starred ? 'listsUnstar' : 'listsStar')}
      onClick={event => {
        event.stopPropagation();
        void personalLists.toggleStar(toInput(item));
      }}
      className={`rounded-lg p-1.5 hover:bg-canvas ${starred ? 'text-amber-500' : 'text-muted hover:text-main'} ${className}`}
    >
      <Star className="size-4" fill={starred ? 'currentColor' : 'none'} />
    </button>
  );
}

export function AddToListButton({ item, heldBy, lists, className = '' }: { item: ListItemInput; heldBy: readonly string[]; lists: PersonalList[]; className?: string }) {
  const { t, dir } = useWorkspace();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const custom = lists.filter(l => l.kind === 'custom');
  return (
    <div ref={root} className={`relative inline-block ${className}`}>
      <button
        type="button"
        data-list-add={item.itemRef}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('listsAddTo')}
        aria-label={t('listsAddTo')}
        onClick={event => {
          event.stopPropagation();
          setOpen(v => !v);
        }}
        className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main"
      >
        <ListPlus className="size-4" />
      </button>
      {open && (
        <div dir={dir} role="menu" data-list-menu className="absolute end-0 top-full z-50 mt-1 w-56 rounded-xl border border-subtle bg-surface p-1 text-sm shadow-xl" onClick={event => event.stopPropagation()}>
          {custom.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">{t('listsNoneYet')}</p>}
          {custom.map(l => {
            const held = heldBy.includes(l.id);
            return (
              <label key={l.id} role="menuitemcheckbox" aria-checked={held} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-main hover:bg-canvas">
                <input type="checkbox" checked={held} data-list-menu-item={l.id} onChange={() => void toggleInList(l.id, item, held)} />
                <span className="truncate" dir="auto">{l.name}</span>
              </label>
            );
          })}
          <button type="button" data-list-menu-new onClick={() => { setOpen(false); createListWith(item); }} className="mt-1 w-full rounded-lg px-2 py-1.5 text-start text-accent hover:bg-canvas">
            {t('listsNew')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Star, add-to-list and chips together, for an item header. */
export function ListItemControls({ item, heldBy, lists, onFilter, className = '' }: { item: ListItemInput; heldBy: readonly string[]; lists: PersonalList[]; onFilter?: (listId: string) => void; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`} data-list-controls={item.itemRef}>
      <ListStarButton item={item} heldBy={heldBy} />
      <AddToListButton item={item} heldBy={heldBy} lists={lists} />
      <ListChips item={item} heldBy={heldBy} lists={lists} onFilter={onFilter} />
    </span>
  );
}

export function ListChips({ item, heldBy, lists, onFilter }: { item: ListItemInput; heldBy: readonly string[]; lists: PersonalList[]; onFilter?: (listId: string) => void }) {
  const { t } = useWorkspace();
  const shown = lists.filter(l => l.kind === 'custom' && heldBy.includes(l.id));
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map(l => (
        <span key={l.id} data-list-chip={l.id} className="inline-flex max-w-[12rem] items-center gap-0.5 rounded-full border border-subtle bg-canvas ps-2 pe-0.5 text-[11px] text-muted">
          <button type="button" className="truncate hover:text-main" dir="auto" title={t('listsFilterBy', { name: l.name })} onClick={event => { event.stopPropagation(); onFilter?.(l.id); }}>
            {l.name}
          </button>
          <button type="button" data-list-chip-remove={l.id} aria-label={t('listsRemoveFrom', { name: l.name })} title={t('listsRemoveFrom', { name: l.name })} className="rounded-full p-0.5 hover:bg-surface hover:text-main" onClick={event => { event.stopPropagation(); void personalLists.removeItem(l.id, item.kind, item.itemRef); }}>
            <X className="size-3" />
          </button>
        </span>
      ))}
    </>
  );
}

type Filter = ReturnType<typeof useListFilter>;

/**
 * A section's "in list" filter: only lists that hold this kind (plus any already chosen), any/all
 * when two or more are chosen. With `items`, the matching items are listed and open on click.
 */
export function ListFilterBar({ kind, lists, filter, onOpen, className = '' }: { kind: PersonalListItemKind; lists: PersonalList[]; filter: Filter; onOpen?: (item: PersonalListItem) => void; className?: string }) {
  const { t } = useWorkspace();
  const offered = lists.filter(l => l.counts[kind] > 0 || filter.chosen.includes(l.id));
  const [items, setItems] = useState<PersonalListItem[]>([]);
  const refsKey = filter.refs ? [...filter.refs].join('\n') : '';
  const listed = !!onOpen;
  const filtering = filter.refs !== null;
  useEffect(() => {
    if (!listed || !filtering) return;
    let alive = true;
    const wanted = new Set(refsKey ? refsKey.split('\n') : []);
    Promise.all(filter.chosen.map(id => personalLists.items(id, kind))).then(groups => {
      if (!alive) return;
      const seen = new Map<string, PersonalListItem>();
      for (const item of groups.flat()) if (wanted.has(item.itemRef) && !seen.has(item.itemRef)) seen.set(item.itemRef, item);
      setItems([...wanted].map(ref => seen.get(ref)).filter((x): x is PersonalListItem => !!x));
    }, () => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [listed, filtering, refsKey, filter.chosen, kind]);
  if (offered.length === 0) return null;
  const shownItems = filtering ? items : [];
  const Icon = KIND_ICON[kind];
  return (
    <div className={`space-y-2 ${className}`} data-list-filter={kind}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted">{t('listsFilterLabel')}</span>
        {offered.map(l => {
          const on = filter.chosen.includes(l.id);
          return (
            <button key={l.id} type="button" data-list-filter-option={l.id} aria-pressed={on} onClick={() => filter.toggle(l.id)} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${on ? 'border-accent bg-accent/10 text-main' : 'border-subtle text-muted hover:text-main'}`}>
              {l.kind === 'starred' && <Star className="size-3" fill={on ? 'currentColor' : 'none'} />}
              <span dir="auto">{listName(l, t)}</span>
              <span className="opacity-60">{l.counts[kind]}</span>
            </button>
          );
        })}
        {filter.chosen.length > 1 && (
          <select value={filter.mode} data-list-filter-mode aria-label={t('listsFilterMode')} onChange={e => filter.setMode(e.target.value as 'any' | 'all')} className="rounded-lg border border-subtle bg-canvas px-1.5 py-0.5 text-xs text-main">
            <option value="any">{t('listsFilterAny')}</option>
            <option value="all">{t('listsFilterAll')}</option>
          </select>
        )}
        {filter.chosen.length > 0 && (
          <button type="button" data-list-filter-clear onClick={filter.clear} className="rounded-full px-2 py-0.5 text-muted hover:text-main">
            {t('listsFilterClear')}
          </button>
        )}
      </div>
      {onOpen && filter.refs && (
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-subtle bg-surface p-1.5" data-list-filter-results={kind}>
          {shownItems.length === 0 && <li className="px-2 py-1.5 text-xs text-muted">{t('listsFilterEmpty')}</li>}
          {shownItems.map(item => (
            <li key={item.itemRef}>
              <button type="button" data-list-filter-result={item.itemRef} onClick={() => onOpen(item)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm text-main hover:bg-canvas">
                <Icon className="size-4 shrink-0 text-muted" />
                <span className="line-clamp-2" dir="auto">{item.label || item.itemRef}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Wraps a search hit so its right-click menu offers Star and "Add to list". */
export function ListContextMenu({ item, children, className }: { item: ListItemInput; children: React.ReactNode; className?: string }) {
  const { t } = useWorkspace();
  const { lists } = usePersonalLists();
  const membership = useListMembership(item.kind, [item.itemRef]);
  return (
    <ContextMenu items={listMenuItems(item, lists, membership[item.itemRef] ?? [], t)} tabIndex={-1} className={className} data-list-context={item.itemRef}>
      {children}
    </ContextMenu>
  );
}
