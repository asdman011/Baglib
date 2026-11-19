'use client';

/**
 * Baglib — the personal lists hub (KEY-386, placement "both"): every list across all kinds in one
 * place, in the Notes workspace. Each section (Library, Quran, Sunnah, Poetry) also filters by its
 * own share of every list.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Layers, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { ContextMenu } from '../ui/ContextMenu';
import { ListDeckDialog } from './ListDeckDialog';
import type { PersonalList } from '../../../shared/personal-lists';
import { useWorkspace } from '../context/WorkspaceContext';
import { useOpenStudyLink } from '../../utils/use-study-link';
import { PERSONAL_LIST_KINDS, STARRED_LIST_ID, matchListName, type PersonalListItem, type PersonalListItemKind } from '../../../shared/personal-lists';
import { personalLists, usePersonalLists } from '../../libs/personal-lists';
import { KIND_ICON, KIND_LABEL, createListWith, listName } from './PersonalListControls';

const total = (counts: Record<PersonalListItemKind, number>) => PERSONAL_LIST_KINDS.reduce((sum, kind) => sum + counts[kind], 0);

export function PersonalListsHub() {
  const { t, dir } = useWorkspace();
  const { linkHandlers, linkMenuItems } = useOpenStudyLink();
  const { lists } = usePersonalLists();
  const [selected, setSelected] = useState<string>(STARRED_LIST_ID);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<PersonalListItemKind | 'all'>('all');
  const [items, setItems] = useState<PersonalListItem[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // KEY-399: "Revise this list".
  const [revising, setRevising] = useState<PersonalList | null>(null);

  const current = lists.find(l => l.id === selected) ?? lists[0];
  const shownLists = useMemo(() => lists.filter(l => l.kind === 'starred' || matchListName(l, query)), [lists, query]);
  const custom = lists.filter(l => l.kind === 'custom');

  useEffect(() => {
    if (!current) return;
    let alive = true;
    const load = () => personalLists.items(current.id).then(rows => alive && setItems(rows), () => alive && setItems([]));
    load();
    window.addEventListener('baglib:personal-lists-changed', load);
    return () => {
      alive = false;
      window.removeEventListener('baglib:personal-lists-changed', load);
    };
  }, [current]);

  const guard = (action: Promise<unknown>) => {
    setFailed(false);
    action.catch(() => setFailed(true));
  };
  const visible = kind === 'all' ? items : items.filter(i => i.itemKind === kind);
  const moveList = (id: string, by: -1 | 1) => {
    const ids = custom.map(l => l.id);
    const at = ids.indexOf(id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    guard(personalLists.reorder(ids));
  };
  const moveItem = (id: string, by: -1 | 1) => {
    if (!current) return;
    const ids = items.map(i => i.id);
    const at = ids.indexOf(id);
    // Within a kind filter, step past hidden items to the next visible neighbour.
    let to = at + by;
    while (kind !== 'all' && to >= 0 && to < items.length && items[to].itemKind !== kind) to += by;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    guard(personalLists.reorderItems(current.id, ids));
  };
  const saveName = (id: string) => {
    if (draft.trim()) guard(personalLists.rename(id, draft));
    setRenaming(null);
  };

  return (
    <div dir={dir} data-personal-lists-hub className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 md:flex-row">
      <aside className="flex min-h-0 w-full shrink-0 flex-col gap-2 md:w-72">
        <div className="flex items-center gap-2">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input dir="auto" value={query} data-lists-search placeholder={t('listsSearch')} aria-label={t('listsSearch')} onChange={e => setQuery(e.target.value)} className="w-full rounded-lg border border-subtle bg-canvas py-1.5 pe-2 ps-7 text-sm text-main" />
          </label>
          <button type="button" data-lists-new onClick={() => createListWith(null)} title={t('listsNew')} aria-label={t('listsNew')} className="rounded-lg border border-subtle p-1.5 text-muted hover:bg-canvas hover:text-main">
            <Plus className="size-4" />
          </button>
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto" data-lists-index>
          {shownLists.map(l => {
            const active = current?.id === l.id;
            const position = custom.findIndex(c => c.id === l.id);
            return (
              <ContextMenu as="li" key={l.id} data-lists-row={l.id} tabIndex={-1} items={[{ id: 'revise-list', label: t('listDeckRevise'), icon: <Layers className="size-4" />, onClick: () => setRevising(l) }]} className={`group rounded-xl border ${active ? 'border-accent bg-accent/5' : 'border-transparent hover:bg-surface'}`}>
                {renaming === l.id ? (
                  <form className="flex items-center gap-1 p-1.5" onSubmit={e => { e.preventDefault(); saveName(l.id); }}>
                    <input autoFocus dir="auto" value={draft} maxLength={120} data-lists-rename-input aria-label={t('listsRename')} onChange={e => setDraft(e.target.value)} onBlur={() => saveName(l.id)} onKeyDown={e => e.key === 'Escape' && setRenaming(null)} className="min-w-0 flex-1 rounded-lg border border-subtle bg-canvas px-2 py-1 text-sm text-main" />
                  </form>
                ) : (
                  <div className="flex items-center gap-1 p-1.5">
                    <button type="button" data-lists-open={l.id} onClick={() => { setSelected(l.id); setConfirmDelete(null); }} className="flex min-w-0 flex-1 items-center gap-2 text-start text-sm text-main">
                      {l.kind === 'starred' && <Star className="size-4 shrink-0 text-amber-500" fill="currentColor" />}
                      <span className="truncate font-medium" dir="auto">{listName(l, t)}</span>
                      <span className="ms-auto text-xs tabular-nums text-muted">{total(l.counts)}</span>
                    </button>
                    {l.kind === 'custom' && (
                      <span className="flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                        <button type="button" disabled={position <= 0} onClick={() => moveList(l.id, -1)} aria-label={t('listsMoveUp')} title={t('listsMoveUp')} className="rounded p-1 text-muted hover:text-main disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                        <button type="button" disabled={position >= custom.length - 1} onClick={() => moveList(l.id, 1)} aria-label={t('listsMoveDown')} title={t('listsMoveDown')} className="rounded p-1 text-muted hover:text-main disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                        <button type="button" data-lists-rename={l.id} onClick={() => { setRenaming(l.id); setDraft(l.name); }} aria-label={t('listsRename')} title={t('listsRename')} className="rounded p-1 text-muted hover:text-main"><Pencil className="size-3.5" /></button>
                        <button type="button" data-lists-delete={l.id} onClick={() => setConfirmDelete(l.id)} aria-label={t('listsDelete')} title={t('listsDelete')} className="rounded p-1 text-muted hover:text-danger"><Trash2 className="size-3.5" /></button>
                      </span>
                    )}
                  </div>
                )}
                {confirmDelete === l.id && (
                  <div className="flex items-center gap-2 px-2 pb-2 text-xs" role="alert">
                    <span className="flex-1 text-muted">{t('listsDeleteConfirm', { name: l.name })}</span>
                    <button type="button" data-lists-delete-confirm onClick={() => { setConfirmDelete(null); if (selected === l.id) setSelected(STARRED_LIST_ID); guard(personalLists.remove(l.id)); }} className="rounded-lg bg-danger px-2 py-0.5 font-semibold text-white">{t('listsDelete')}</button>
                    <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-lg px-2 py-0.5 text-muted hover:bg-canvas">{t('cancel')}</button>
                  </div>
                )}
              </ContextMenu>
            );
          })}
          {shownLists.length <= 1 && custom.length === 0 && <li className="px-2 py-3 text-xs leading-relaxed text-muted">{t('listsHubEmpty')}</li>}
        </ul>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-2xl border border-subtle bg-surface p-3" data-lists-detail={current?.id}>
        {current && (
          <>
            <header className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-main" dir="auto">{listName(current, t)}</h2>
              <button type="button" data-lists-revise={current.id} onClick={() => setRevising(current)} className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1 text-xs font-semibold text-main hover:bg-canvas">
                <Layers className="size-3.5" />{t('listDeckRevise')}
              </button>
              <div className="ms-auto flex flex-wrap gap-1 text-xs" role="tablist" aria-label={t('listsKindFilter')}>
                {(['all', ...PERSONAL_LIST_KINDS] as const).map(k => {
                  const count = k === 'all' ? total(current.counts) : current.counts[k];
                  return (
                    <button key={k} type="button" role="tab" aria-selected={kind === k} data-lists-kind={k} onClick={() => setKind(k)} className={`rounded-full border px-2 py-0.5 ${kind === k ? 'border-accent bg-accent/10 text-main' : 'border-subtle text-muted hover:text-main'}`}>
                      {k === 'all' ? t('listsKindAll') : t(KIND_LABEL[k])} <span className="opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
            </header>
            {failed && <p role="alert" className="text-xs text-danger">{t('listsActionFailed')}</p>}
            <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto" data-lists-items>
              {visible.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">{t(current.kind === 'starred' ? 'listsStarredEmpty' : 'listsEmpty')}</li>}
              {visible.map((item, index) => {
                const Icon = KIND_ICON[item.itemKind];
                const onError = () => setFailed(true);
                return (
                  <ContextMenu as="li" tabIndex={-1} key={item.id} data-lists-item={item.itemRef} items={linkMenuItems(item.itemRef, { title: item.label, onError })} className="group flex items-center gap-2 rounded-xl border border-subtle bg-canvas px-2 py-1.5">
                    <Icon className="size-4 shrink-0 text-muted" aria-label={t(KIND_LABEL[item.itemKind])} />
                    <button type="button" data-lists-item-open={item.itemRef} {...linkHandlers(item.itemRef, { title: item.label, onError })} className="min-w-0 flex-1 text-start text-sm text-main hover:underline" title={t('listsOpenItem')}>
                      <span className="line-clamp-2" dir="auto">{item.label || item.itemRef}</span>
                    </button>
                    <span className="flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                      <button type="button" disabled={index === 0} onClick={() => moveItem(item.id, -1)} aria-label={t('listsMoveUp')} title={t('listsMoveUp')} className="rounded p-1 text-muted hover:text-main disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                      <button type="button" disabled={index === visible.length - 1} onClick={() => moveItem(item.id, 1)} aria-label={t('listsMoveDown')} title={t('listsMoveDown')} className="rounded p-1 text-muted hover:text-main disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                      <button type="button" data-lists-item-remove={item.itemRef} onClick={() => guard(personalLists.removeItem(current.id, item.itemKind, item.itemRef))} aria-label={t('listsRemoveItem')} title={t('listsRemoveItem')} className="rounded p-1 text-muted hover:text-danger"><X className="size-3.5" /></button>
                    </span>
                  </ContextMenu>
                );
              })}
            </ol>
          </>
        )}
      </section>
      {revising && <ListDeckDialog list={revising} onClose={() => setRevising(null)} />}
    </div>
  );
}
