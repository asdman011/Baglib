'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Filter,
  FolderInput,
  PauseCircle,
  PlayCircle,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { TranslationKey } from '../../translations';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import {
  REVISION_SAVED_SEARCHES_SETTING,
  REVISION_SORT_FIELDS,
  REVISION_SOURCE_FILTERS,
  buildFilteredDeckSearch,
  parseSavedSearches,
  type RevisionBrowseQuery,
  type RevisionBrowseResult,
  type RevisionSortBy,
  type RevisionSortDir,
  type RevisionSourceFilter,
  type RevisionStateFilter,
  type SavedRevisionSearch,
} from '../../../shared/revision-browser';
import type { DeckTreeNode } from '../../../shared/srs';
import { Button } from '../ui/Button';

const SOURCE_LABELS: Record<RevisionSourceFilter, TranslationKey> = {
  all: 'revisionSourceAll',
  sunnah: 'revisionSourceSunnah',
  narrators: 'revisionSourceNarrators',
  poetry: 'revisionSourcePoetry',
  book: 'revisionSourceBook',
  note: 'revisionSourceNote',
  lexicon: 'revisionSourceLexicon',
  person: 'revisionSourcePerson',
  tafsir: 'revisionSourceTafsir',
  quran: 'revisionSourceQuran',
};

const SORT_LABELS: Record<RevisionSortBy, TranslationKey> = {
  due: 'revisionSortDue',
  retrievability: 'revisionSortRetrievability',
  difficulty: 'revisionSortDifficulty',
  lapses: 'revisionSortLapses',
  created: 'revisionSortCreated',
  source: 'revisionSortSource',
};

const STATE_OPTIONS: { value: RevisionStateFilter; label: TranslationKey }[] = [
  { value: 'all', label: 'revisionStateAll' },
  { value: 'new', label: 'revisionStateNew' },
  { value: 'learning', label: 'revisionStateLearning' },
  { value: 'review', label: 'revisionStateReview' },
  { value: 'relearning', label: 'revisionStateRelearning' },
  { value: 'suspended', label: 'revisionStateSuspended' },
];

function flattenDecks(nodes: DeckTreeNode[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const walk = (list: DeckTreeNode[]) => {
    for (const n of list) {
      if (n.kind === 'normal') {
        out.push({ id: n.id, name: n.name });
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

export const RevisionBrowserPanel: React.FC = () => {
  const { t, dir, lang } = useWorkspace();
  const [query, setQuery] = useState<RevisionBrowseQuery>({
    search: '',
    sourceType: 'all',
    science: null,
    listIds: [],
    listMatch: 'any',
    state: 'all',
    sortBy: 'due',
    sortDir: 'asc',
    limit: 100,
    offset: 0,
  });
  const [result, setResult] = useState<RevisionBrowseResult>({
    items: [],
    total: 0,
    facets: { sciences: [], lists: [] },
  });
  const [decks, setDecks] = useState<{ id: string; name: string }[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedRevisionSearch[]>([]);
  const [saveName, setSaveName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rescheduleDays, setRescheduleDays] = useState(3);
  const [moveDeckId, setMoveDeckId] = useState('');
  const [bulkTag, setBulkTag] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, tree] = await Promise.all([
        window.electronAPI.knowledgeCards.browse(query),
        window.electronAPI.knowledgeCards.deckTree().catch(() => [] as DeckTreeNode[]),
      ]);
      setResult(res);
      const flat = flattenDecks(tree);
      setDecks(flat);
      if (!moveDeckId && flat.length > 0) setMoveDeckId(flat[0].id);
      setError(null);
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    } finally {
      setLoading(false);
    }
  }, [query, moveDeckId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onChanged = () => void load();
    window.addEventListener(KNOWLEDGE_CARD_SAVED, onChanged);
    return () => window.removeEventListener(KNOWLEDGE_CARD_SAVED, onChanged);
  }, [load]);

  useEffect(() => {
    let alive = true;
    void window.electronAPI.settings
      .get(REVISION_SAVED_SEARCHES_SETTING)
      .then(raw => {
        if (alive) setSavedSearches(parseSavedSearches(raw));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const persistSavedSearches = async (next: SavedRevisionSearch[]) => {
    setSavedSearches(next);
    await window.electronAPI.settings.set(REVISION_SAVED_SEARCHES_SETTING, next);
  };

  const handleSaveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = saveName.trim();
    if (!clean) return;
    const entry: SavedRevisionSearch = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: clean,
      query: { ...query, offset: 0 },
      createdAt: new Date().toISOString(),
    };
    await persistSavedSearches([entry, ...savedSearches.filter(s => s.name !== clean)].slice(0, 100));
    setSaveName('');
  };

  const handleCreateFilteredDeck = async (saved: SavedRevisionSearch) => {
    try {
      await window.electronAPI.knowledgeCards.createFilteredDeck({
        name: saved.name,
        filterSearch: buildFilteredDeckSearch(saved.query),
        filterLimit: 100,
        filterOrder: saved.query.sortBy === 'retrievability' ? 'retrievability_asc' : saved.query.sortBy === 'lapses' ? 'lapses_desc' : 'due',
        filterReschedule: true,
      });
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === result.items.length && result.items.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(result.items.map(i => i.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const runBulk = async (action: Parameters<typeof window.electronAPI.knowledgeCards.bulkAction>[0]) => {
    try {
      await window.electronAPI.knowledgeCards.bulkAction(action);
      setSelectedIds(new Set());
      setConfirmDelete(false);
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
      await load();
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    }
  };

  const toggleListFilter = (listId: string) => {
    const current = query.listIds ?? [];
    const next = current.includes(listId) ? current.filter(id => id !== listId) : [...current, listId];
    setQuery(q => ({ ...q, listIds: next, offset: 0 }));
  };

  const ids = [...selectedIds];
  const numberFmt = new Intl.NumberFormat(lang);

  return (
    <div dir={dir} data-revision-browser className="space-y-4">
      {/* Filter & Search Bar */}
      <div className="rounded-xl border border-subtle bg-surface p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              dir="auto"
              data-revision-search
              value={query.search ?? ''}
              onChange={e => setQuery(q => ({ ...q, search: e.target.value, offset: 0 }))}
              placeholder={t('revisionBrowserSearch')}
              aria-label={t('revisionBrowserSearch')}
              className="w-full rounded-lg border border-subtle bg-canvas py-1.5 pe-3 ps-8 text-sm text-main"
            />
          </label>

          <select
            data-revision-source
            aria-label={t('revisionFilterSource')}
            value={query.sourceType ?? 'all'}
            onChange={e => setQuery(q => ({ ...q, sourceType: e.target.value as RevisionSourceFilter, offset: 0 }))}
            className="rounded-lg border border-subtle bg-canvas px-2.5 py-1.5 text-xs text-main"
          >
            {REVISION_SOURCE_FILTERS.map(src => (
              <option key={src} value={src}>{t(SOURCE_LABELS[src])}</option>
            ))}
          </select>

          <select
            data-revision-science
            aria-label={t('revisionFilterScience')}
            value={query.science ?? ''}
            onChange={e => setQuery(q => ({ ...q, science: e.target.value || null, offset: 0 }))}
            className="rounded-lg border border-subtle bg-canvas px-2.5 py-1.5 text-xs text-main"
          >
            <option value="">{t('revisionScienceAll')}</option>
            {result.facets.sciences.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>

          <select
            data-revision-state
            aria-label={t('revisionFilterState')}
            value={query.state ?? 'all'}
            onChange={e => setQuery(q => ({ ...q, state: e.target.value as RevisionStateFilter, offset: 0 }))}
            className="rounded-lg border border-subtle bg-canvas px-2.5 py-1.5 text-xs text-main"
          >
            {STATE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{t(opt.label)}</option>
            ))}
          </select>

          <select
            data-revision-sort-by
            aria-label={t('revisionSortBy')}
            value={query.sortBy ?? 'due'}
            onChange={e => setQuery(q => ({ ...q, sortBy: e.target.value as RevisionSortBy, offset: 0 }))}
            className="rounded-lg border border-subtle bg-canvas px-2.5 py-1.5 text-xs text-main"
          >
            {REVISION_SORT_FIELDS.map(f => (
              <option key={f} value={f}>{t(SORT_LABELS[f])}</option>
            ))}
          </select>

          <button
            type="button"
            data-revision-sort-dir
            onClick={() => setQuery(q => ({ ...q, sortDir: (q.sortDir ?? 'asc') === 'asc' ? 'desc' : 'asc', offset: 0 }))}
            aria-label={t('revisionSortBy')}
            className="rounded-lg border border-subtle bg-canvas p-1.5 text-muted hover:text-main"
          >
            {(query.sortDir ?? 'asc') === 'asc' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
          </button>
        </div>

        {/* Lists filter row */}
        {result.facets.lists.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted font-medium">{t('revisionFilterLists')}:</span>
            {result.facets.lists.map(list => {
              const active = (query.listIds ?? []).includes(list.id);
              return (
                <button
                  key={list.id}
                  type="button"
                  data-revision-list={list.id}
                  aria-pressed={active}
                  onClick={() => toggleListFilter(list.id)}
                  className={`rounded-full border px-2.5 py-0.5 transition-colors ${active ? 'border-primary bg-primary text-primary-contrast' : 'border-subtle bg-canvas text-main hover:bg-surface'}`}
                >
                  {list.name}
                </button>
              );
            })}
            {(query.listIds?.length ?? 0) > 1 && (
              <button
                type="button"
                data-revision-list-match
                onClick={() => setQuery(q => ({ ...q, listMatch: q.listMatch === 'all' ? 'any' : 'all', offset: 0 }))}
                className="ms-2 rounded-lg border border-subtle bg-canvas px-2 py-0.5 text-xs font-medium text-main"
              >
                {query.listMatch === 'all' ? t('revisionListMatchAll') : t('revisionListMatchAny')}
              </button>
            )}
          </div>
        )}

        {/* Saved searches bar */}
        <div className="flex flex-wrap items-center gap-2 border-t border-subtle pt-2.5 text-xs">
          <form onSubmit={e => void handleSaveSearch(e)} className="flex items-center gap-1.5">
            <input
              dir="auto"
              data-revision-save-search-name
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder={t('revisionSaveSearchPlaceholder')}
              aria-label={t('revisionSaveSearchPlaceholder')}
              className="rounded-lg border border-subtle bg-canvas px-2.5 py-1 text-xs text-main"
            />
            <Button type="submit" size="sm" variant="secondary" data-revision-save-search icon={<Bookmark className="size-3.5" />}>
              {t('revisionSaveSearch')}
            </Button>
          </form>

          {savedSearches.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted">{t('revisionSavedSearches')}:</span>
              {savedSearches.map(saved => (
                <span key={saved.id} data-revision-saved-search={saved.id} className="inline-flex items-center gap-1 rounded-full border border-subtle bg-canvas px-2 py-0.5">
                  <button type="button" onClick={() => setQuery({ ...saved.query, offset: 0 })} className="font-medium text-main hover:underline">
                    {saved.name}
                  </button>
                  <button
                    type="button"
                    data-revision-filtered-deck={saved.id}
                    onClick={() => void handleCreateFilteredDeck(saved)}
                    title={t('revisionCreateFilteredDeck')}
                    aria-label={t('revisionCreateFilteredDeck')}
                    className="text-muted hover:text-primary"
                  >
                    <Filter className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void persistSavedSearches(savedSearches.filter(s => s.id !== saved.id))}
                    aria-label={t('revisionBulkDelete')}
                    className="text-muted hover:text-danger"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bulk actions bar */}
      {ids.length > 0 && (
        <div data-revision-bulk-bar className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 p-2.5 text-xs">
          <span className="font-semibold text-main">{t('revisionBulkSelected', { count: ids.length })}</span>
          <Button size="sm" variant="secondary" data-revision-bulk-suspend onClick={() => void runBulk({ action: 'suspend', cardIds: ids })} icon={<PauseCircle className="size-3.5" />}>
            {t('revisionBulkSuspend')}
          </Button>
          <Button size="sm" variant="secondary" data-revision-bulk-unsuspend onClick={() => void runBulk({ action: 'unsuspend', cardIds: ids })} icon={<PlayCircle className="size-3.5" />}>
            {t('revisionBulkUnsuspend')}
          </Button>
          <div className="inline-flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={36500}
              value={rescheduleDays}
              onChange={e => setRescheduleDays(Number(e.target.value) || 0)}
              className="w-16 rounded-lg border border-subtle bg-canvas px-2 py-1 text-xs text-main"
            />
            <Button size="sm" variant="secondary" data-revision-bulk-reschedule onClick={() => void runBulk({ action: 'reschedule', cardIds: ids, days: rescheduleDays })}>
              {t('revisionBulkReschedule')}
            </Button>
          </div>
          {decks.length > 0 && (
            <div className="inline-flex items-center gap-1">
              <select value={moveDeckId} onChange={e => setMoveDeckId(e.target.value)} className="rounded-lg border border-subtle bg-canvas px-2 py-1 text-xs text-main">
                {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <Button size="sm" variant="secondary" data-revision-bulk-move onClick={() => void runBulk({ action: 'moveDeck', cardIds: ids, deckId: moveDeckId })} icon={<FolderInput className="size-3.5" />}>
                {t('revisionBulkMoveDeck')}
              </Button>
            </div>
          )}
          <div className="inline-flex items-center gap-1">
            <input
              dir="auto"
              value={bulkTag}
              onChange={e => setBulkTag(e.target.value)}
              placeholder={t('revisionBulkTag')}
              className="w-28 rounded-lg border border-subtle bg-canvas px-2 py-1 text-xs text-main"
            />
            <Button size="sm" variant="secondary" data-revision-bulk-tag onClick={() => bulkTag.trim() && void runBulk({ action: 'tag', cardIds: ids, tag: bulkTag.trim() })} icon={<Tag className="size-3.5" />}>
              {t('revisionBulkTag')}
            </Button>
          </div>
          {!confirmDelete ? (
            <Button size="sm" variant="danger" data-revision-bulk-delete onClick={() => setConfirmDelete(true)} icon={<Trash2 className="size-3.5" />}>
              {t('revisionBulkDelete')}
            </Button>
          ) : (
            <Button size="sm" variant="danger" data-revision-bulk-delete-confirm onClick={() => void runBulk({ action: 'delete', cardIds: ids, confirmed: true })}>
              {t('revisionBulkDeleteConfirm', { count: ids.length })}
            </Button>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-xs text-danger">{error}</p>}

      {/* Results count & table */}
      <div className="flex items-center justify-between text-xs text-muted px-1">
        <span data-revision-total>{t('revisionBrowserCount', { count: numberFmt.format(result.total) })}</span>
        {loading && <span>{t('loading')}</span>}
      </div>

      {result.items.length === 0 && !loading ? (
        <p className="rounded-xl border border-subtle bg-surface p-6 text-center text-sm text-muted">
          {t('revisionBrowserEmpty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-subtle bg-surface">
          <table className="w-full border-collapse text-start text-xs">
            <thead>
              <tr className="border-b border-subtle bg-canvas text-muted">
                <th className="p-2 text-start w-8">
                  <input
                    type="checkbox"
                    aria-label={t('revisionSelectAll')}
                    checked={result.items.length > 0 && selectedIds.size === result.items.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-2 text-start">{t('revisionColFront')}</th>
                <th className="p-2 text-start">{t('revisionFilterSource')}</th>
                <th className="p-2 text-start">{t('revisionColDeck')}</th>
                <th className="p-2 text-start">{t('revisionColDue')}</th>
                <th className="p-2 text-start">{t('revisionColRetrievability')}</th>
                <th className="p-2 text-start">{t('revisionColLapses')}</th>
                <th className="p-2 text-start">{t('revisionFilterState')}</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map(row => (
                <tr key={row.id} data-revision-row={row.id} className="border-b border-subtle/60 hover:bg-canvas/60">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleSelectOne(row.id)}
                    />
                  </td>
                  <td className="p-2 max-w-xs truncate font-medium text-main" dir="auto">{row.front}</td>
                  <td className="p-2 text-muted">{row.sourceLabel || row.sourceKind}</td>
                  <td className="p-2 text-muted">{row.deckNames.join(', ') || '—'}</td>
                  <td className="p-2 tabular-nums text-muted">{row.dueAt ? row.dueAt.slice(0, 10) : '—'}</td>
                  <td className="p-2 tabular-nums text-muted">
                    {row.retrievability !== null ? `${Math.round(row.retrievability * 100)}%` : '—'}
                  </td>
                  <td className="p-2 tabular-nums text-muted">{numberFmt.format(row.lapses)}</td>
                  <td className="p-2 text-muted">{row.state ?? 'new'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
