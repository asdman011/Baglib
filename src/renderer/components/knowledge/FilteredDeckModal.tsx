'use client';

import React, { useState } from 'react';
import { Filter } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { FilteredDeckOrder } from '../../../shared/srs';

export interface FilteredDeckModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (deckId: string) => void;
}

export const FilteredDeckModal: React.FC<FilteredDeckModalProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const { t, dir } = useWorkspace();
  const [name, setName] = useState('');
  const [filterSearch, setFilterSearch] = useState('prop:r<0.85');
  const [filterLimit, setFilterLimit] = useState(100);
  const [filterOrder, setFilterOrder] = useState<FilteredDeckOrder>('due');
  const [filterReschedule, setFilterReschedule] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = (presetName: string, query: string, order: FilteredDeckOrder) => {
    if (!name.trim()) setName(presetName);
    setFilterSearch(query);
    setFilterOrder(order);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !filterSearch.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await window.electronAPI.knowledgeCards.createFilteredDeck({
        name: name.trim(),
        filterSearch: filterSearch.trim(),
        filterLimit: Number(filterLimit) || 100,
        filterOrder,
        filterReschedule,
      });
      setName('');
      onCreated(created.id);
      onClose();
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('filteredDeckTitle')}>
      <form
        dir={dir}
        data-filtered-deck-modal
        onSubmit={e => void handleSubmit(e)}
        className="space-y-4 p-4 text-sm text-main"
      >
        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 border border-danger/30 p-2 text-xs text-danger">
            {error}
          </p>
        )}

        {/* Quick Search Presets */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-filtered-preset="weakest"
            onClick={() => applyPreset(t('filteredPresetWeakest'), 'prop:r<0.85', 'retrievability_asc')}
            className="inline-flex items-center gap-1.5 rounded-full border border-subtle bg-canvas px-3 py-1 text-xs hover:bg-surface cursor-pointer"
          >
            <Filter className="size-3 text-amber-500" />
            <span>{t('filteredPresetWeakest')}</span>
          </button>
          <button
            type="button"
            data-filtered-preset="lapsed"
            onClick={() => applyPreset(t('filteredPresetLapsed'), 'is:lapsed', 'lapses_desc')}
            className="inline-flex items-center gap-1.5 rounded-full border border-subtle bg-canvas px-3 py-1 text-xs hover:bg-surface cursor-pointer"
          >
            <Filter className="size-3 text-danger" />
            <span>{t('filteredPresetLapsed')}</span>
          </button>
          <button
            type="button"
            data-filtered-preset="sunnah"
            onClick={() => applyPreset(t('filteredPresetSunnahDue'), 'is:due source:sunnah', 'due')}
            className="inline-flex items-center gap-1.5 rounded-full border border-subtle bg-canvas px-3 py-1 text-xs hover:bg-surface cursor-pointer"
          >
            <Filter className="size-3 text-emerald-500" />
            <span>{t('filteredPresetSunnahDue')}</span>
          </button>
        </div>

        <label className="block space-y-1 text-xs">
          <span className="font-semibold">{t('cardDeckName')}</span>
          <input
            dir="auto"
            data-filtered-deck-name
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full rounded-lg border border-subtle bg-canvas p-2 text-sm text-main"
            required
          />
        </label>

        <label className="block space-y-1 text-xs">
          <span className="font-semibold">{t('filteredDeckSearch')}</span>
          <input
            dir="ltr"
            data-filtered-deck-search
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            placeholder="prop:r<0.85 source:sunnah"
            className="w-full rounded-lg border border-subtle bg-canvas p-2 text-sm text-main font-mono"
            required
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">{t('filteredDeckLimit')}</span>
            <input
              type="number"
              min={1}
              max={9999}
              data-filtered-deck-limit
              value={filterLimit}
              onChange={e => setFilterLimit(Number(e.target.value))}
              className="rounded-lg border border-subtle bg-canvas p-2 text-sm text-main"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">{t('filteredDeckOrder')}</span>
            <select
              data-filtered-deck-order
              value={filterOrder}
              onChange={e => setFilterOrder(e.target.value as FilteredDeckOrder)}
              className="rounded-lg border border-subtle bg-canvas p-2 text-sm text-main"
            >
              <option value="due">{t('filteredDeckOrderDue')}</option>
              <option value="retrievability_asc">{t('filteredDeckOrderRetrievability')}</option>
              <option value="lapses_desc">{t('filteredDeckOrderLapses')}</option>
              <option value="added">{t('filteredDeckOrderAdded')}</option>
              <option value="random">{t('deckNewOrderRandom')}</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            data-filtered-deck-reschedule
            checked={filterReschedule}
            onChange={e => setFilterReschedule(e.target.checked)}
          />
          <span>{t('filteredDeckReschedule')}</span>
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t border-subtle">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={busy || !name.trim() || !filterSearch.trim()}
            data-filtered-deck-submit
          >
            {t('deckCreateFiltered')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
