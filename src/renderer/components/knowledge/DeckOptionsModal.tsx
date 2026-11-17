'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, Trash2, Settings2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { DeckTreeNode, SrsPreset } from '../../../shared/srs';

export interface DeckOptionsModalProps {
  open: boolean;
  deck: DeckTreeNode | null;
  onClose: () => void;
  onSaved: () => void;
}

export const DeckOptionsModal: React.FC<DeckOptionsModalProps> = ({
  open,
  deck,
  onClose,
  onSaved,
}) => {
  const { t, dir } = useWorkspace();
  const [presets, setPresets] = useState<SrsPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('default');
  const [useInherited, setUseInherited] = useState<boolean>(false);

  // Editable preset fields
  const [presetName, setPresetName] = useState('');
  const [learnStepsText, setLearnStepsText] = useState('1 10');
  const [relearnStepsText, setRelearnStepsText] = useState('10');
  const [newPerDay, setNewPerDay] = useState(20);
  const [reviewsPerDay, setReviewsPerDay] = useState(200);
  const [desiredRetention, setDesiredRetention] = useState(0.9);
  const [maximumInterval, setMaximumInterval] = useState(36500);
  const [newOrder, setNewOrder] = useState<'position' | 'random'>('position');
  const [buryNew, setBuryNew] = useState(false);
  const [buryReviews, setBuryReviews] = useState(false);
  const [buryInterday, setBuryInterday] = useState(false);
  const [leechThreshold, setLeechThreshold] = useState(8);
  const [leechAction, setLeechAction] = useState<'tag' | 'suspend'>('tag');
  const [rolloverHour, setRolloverHour] = useState<0 | 4>(4);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const populateForm = useCallback((p: SrsPreset) => {
    setPresetName(p.name);
    setLearnStepsText(p.learnSteps.join(' '));
    setRelearnStepsText(p.relearnSteps.join(' '));
    setNewPerDay(p.newPerDay);
    setReviewsPerDay(p.reviewsPerDay);
    setDesiredRetention(p.desiredRetention);
    setMaximumInterval(p.maximumInterval);
    setNewOrder(p.newOrder);
    setBuryNew(p.buryNew);
    setBuryReviews(p.buryReviews);
    setBuryInterday(p.buryInterday);
    setLeechThreshold(p.leechThreshold);
    setLeechAction(p.leechAction);
  }, []);

  const load = useCallback(async () => {
    if (!open) return;
    setError(null);
    try {
      const [list, hour] = await Promise.all([
        window.electronAPI.knowledgeCards.listPresets(),
        window.electronAPI.knowledgeCards.getRolloverHour(),
      ]);
      setPresets(list);
      setRolloverHour(hour);

      const targetId = deck?.presetId || deck?.effectivePresetId || 'default';
      setUseInherited(Boolean(deck && !deck.presetId && deck.parentId));
      setSelectedPresetId(targetId);
      const found = list.find(p => p.id === targetId) || list[0];
      if (found) populateForm(found);
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    }
  }, [open, deck, populateForm, t]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const handleSelectPreset = (id: string) => {
    if (id === '__inherit__') {
      setUseInherited(true);
      const effId = deck?.effectivePresetId || 'default';
      setSelectedPresetId(effId);
      const found = presets.find(p => p.id === effId);
      if (found) populateForm(found);
      return;
    }
    setUseInherited(false);
    setSelectedPresetId(id);
    const found = presets.find(p => p.id === id);
    if (found) populateForm(found);
  };

  const handleCreateNewPreset = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await window.electronAPI.knowledgeCards.savePreset({
        name: `${t('deckPresetNew')} ${presets.length + 1}`,
        learnSteps: [1, 10],
        relearnSteps: [10],
        newPerDay: 20,
        reviewsPerDay: 200,
        desiredRetention: 0.9,
        maximumInterval: 36500,
        buryNew: false,
        buryReviews: false,
        buryInterday: false,
        leechThreshold: 8,
        leechAction: 'tag',
        newOrder: 'position',
      });
      const updated = await window.electronAPI.knowledgeCards.listPresets();
      setPresets(updated);
      setUseInherited(false);
      setSelectedPresetId(created.id);
      populateForm(created);
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyPreset = async () => {
    setBusy(true);
    setError(null);
    try {
      const copied = await window.electronAPI.knowledgeCards.copyPreset(selectedPresetId);
      const updated = await window.electronAPI.knowledgeCards.listPresets();
      setPresets(updated);
      setUseInherited(false);
      setSelectedPresetId(copied.id);
      populateForm(copied);
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePreset = async () => {
    if (selectedPresetId === 'default') return;
    setBusy(true);
    setError(null);
    try {
      await window.electronAPI.knowledgeCards.deletePreset(selectedPresetId);
      const updated = await window.electronAPI.knowledgeCards.listPresets();
      setPresets(updated);
      setSelectedPresetId('default');
      const def = updated.find(p => p.id === 'default') || updated[0];
      if (def) populateForm(def);
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    } finally {
      setBusy(false);
    }
  };

  const parseSteps = (raw: string): number[] =>
    raw
      .split(/[\s,]+/u)
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const learnSteps = parseSteps(learnStepsText);
      const relearnSteps = parseSteps(relearnStepsText);

      const savedPreset = await window.electronAPI.knowledgeCards.savePreset({
        id: selectedPresetId,
        name: presetName.trim() || 'Default',
        learnSteps,
        relearnSteps,
        newPerDay: Number(newPerDay),
        reviewsPerDay: Number(reviewsPerDay),
        desiredRetention: Number(desiredRetention),
        maximumInterval: Number(maximumInterval),
        newOrder,
        buryNew,
        buryReviews,
        buryInterday,
        leechThreshold: Number(leechThreshold),
        leechAction,
      });

      await window.electronAPI.knowledgeCards.setRolloverHour(rolloverHour);

      if (deck && deck.kind === 'normal') {
        await window.electronAPI.knowledgeCards.assignPreset(
          deck.id,
          useInherited ? null : savedPreset.id
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('deckOptionsTitle')}>
      <form
        dir={dir}
        data-deck-options-modal
        onSubmit={e => void handleSave(e)}
        className="space-y-4 p-4 text-sm text-main max-h-[80vh] overflow-y-auto"
      >
        {deck && (
          <div className="flex items-center gap-2 rounded-xl bg-canvas border border-subtle px-3 py-2 text-xs text-muted">
            <Settings2 className="size-4 text-primary-text shrink-0" />
            <span dir="auto" className="font-semibold text-main">
              {deck.id === 'memorization' ? t('deckMemorizationBuiltIn') : deck.fullName}
            </span>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 border border-danger/30 p-2 text-xs text-danger">
            {error}
          </p>
        )}

        {/* Preset selector & management bar */}
        <div className="flex flex-wrap items-end gap-2 border-b border-subtle pb-3">
          <label className="flex-1 min-w-[180px] flex flex-col gap-1 text-xs">
            <span className="font-semibold">{t('deckPresetSelect')}</span>
            <select
              data-preset-select
              value={useInherited ? '__inherit__' : selectedPresetId}
              onChange={e => handleSelectPreset(e.target.value)}
              className="rounded-lg border border-subtle bg-canvas p-2 text-sm text-main"
            >
              {deck?.parentId && (
                <option value="__inherit__">{t('deckPresetInherit')}</option>
              )}
              {presets.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void handleCreateNewPreset()}
            icon={<Plus className="size-3.5" />}
            data-preset-new-btn
          >
            {t('deckPresetNew')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void handleCopyPreset()}
            icon={<Copy className="size-3.5" />}
            data-preset-copy-btn
          >
            {t('deckPresetCopy')}
          </Button>
          {selectedPresetId !== 'default' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void handleDeletePreset()}
              icon={<Trash2 className="size-3.5 text-danger" />}
              data-preset-delete-btn
            >
              {t('deckPresetDelete')}
            </Button>
          )}
        </div>

        {/* Preset Name */}
        <label className="block space-y-1 text-xs">
          <span className="font-semibold">{t('deckPresetName')}</span>
          <input
            dir="auto"
            data-preset-name-input
            value={presetName}
            onChange={e => setPresetName(e.target.value)}
            className="w-full rounded-lg border border-subtle bg-canvas p-2 text-sm text-main"
          />
        </label>

        {/* Steps & Daily Limits Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">{t('deckLearnSteps')}</span>
            <input
              dir="ltr"
              data-preset-learn-steps
              value={learnStepsText}
              onChange={e => setLearnStepsText(e.target.value)}
              className="rounded-lg border border-subtle bg-canvas p-2 text-sm text-main font-mono"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">{t('deckRelearnSteps')}</span>
            <input
              dir="ltr"
              data-preset-relearn-steps
              value={relearnStepsText}
              onChange={e => setRelearnStepsText(e.target.value)}
              className="rounded-lg border border-subtle bg-canvas p-2 text-sm text-main font-mono"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">{t('deckNewPerDay')}</span>
            <input
              type="number"
              min={0}
              max={9999}
              data-preset-new-per-day
              value={newPerDay}
              onChange={e => setNewPerDay(Number(e.target.value))}
              className="rounded-lg border border-subtle bg-canvas p-2 text-sm text-main"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">{t('deckReviewsPerDay')}</span>
            <input
              type="number"
              min={0}
              max={9999}
              data-preset-reviews-per-day
              value={reviewsPerDay}
              onChange={e => setReviewsPerDay(Number(e.target.value))}
              className="rounded-lg border border-subtle bg-canvas p-2 text-sm text-main"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">{t('deckDesiredRetention')}</span>
            <input
              type="number"
              step={0.01}
              min={0.7}
              max={0.99}
              data-preset-desired-retention
              value={desiredRetention}
              onChange={e => setDesiredRetention(Number(e.target.value))}
              className="rounded-lg border border-subtle bg-canvas p-2 text-sm text-main"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">{t('deckMaxInterval')}</span>
            <input
              type="number"
              min={1}
              max={365000}
              data-preset-max-interval
              value={maximumInterval}
              onChange={e => setMaximumInterval(Number(e.target.value))}
              className="rounded-lg border border-subtle bg-canvas p-2 text-sm text-main"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="font-semibold">{t('deckNewOrder')}</span>
            <select
              data-preset-new-order
              value={newOrder}
              onChange={e => setNewOrder(e.target.value as 'position' | 'random')}
              className="rounded-lg border border-subtle bg-canvas p-2 text-sm text-main"
            >
              <option value="position">{t('deckNewOrderPosition')}</option>
              <option value="random">{t('deckNewOrderRandom')}</option>
            </select>
          </label>
        </div>

        {/* Sibling Burying Switches */}
        <fieldset className="space-y-2 rounded-xl border border-subtle p-3">
          <legend className="px-1 text-xs font-bold text-main">{t('deckBurySection')}</legend>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              data-preset-bury-new
              checked={buryNew}
              onChange={e => setBuryNew(e.target.checked)}
            />
            <span>{t('deckBuryNew')}</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              data-preset-bury-reviews
              checked={buryReviews}
              onChange={e => setBuryReviews(e.target.checked)}
            />
            <span>{t('deckBuryReviews')}</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              data-preset-bury-interday
              checked={buryInterday}
              onChange={e => setBuryInterday(e.target.checked)}
            />
            <span>{t('deckBuryInterday')}</span>
          </label>
        </fieldset>

        {/* Leeches Section */}
        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-subtle p-3">
          <legend className="px-1 text-xs font-bold text-main">{t('deckLeechSection')}</legend>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">{t('deckLeechThreshold')}</span>
            <input
              type="number"
              min={1}
              max={999}
              data-preset-leech-threshold
              value={leechThreshold}
              onChange={e => setLeechThreshold(Number(e.target.value))}
              className="rounded-lg border border-subtle bg-canvas p-2 text-sm text-main"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">{t('deckLeechAction')}</span>
            <select
              data-preset-leech-action
              value={leechAction}
              onChange={e => setLeechAction(e.target.value as 'tag' | 'suspend')}
              className="rounded-lg border border-subtle bg-canvas p-2 text-sm text-main"
            >
              <option value="tag">{t('deckLeechTagOnly')}</option>
              <option value="suspend">{t('deckLeechSuspend')}</option>
            </select>
          </label>
        </fieldset>

        {/* Day Start Rollover */}
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold">{t('settingSrsRollover')}</span>
          <select
            data-preset-rollover-hour
            value={rolloverHour}
            onChange={e => setRolloverHour(Number(e.target.value) === 0 ? 0 : 4)}
            className="rounded-lg border border-subtle bg-canvas p-2 text-sm text-main"
          >
            <option value={4}>{t('srsRollover4Am')}</option>
            <option value={0}>{t('srsRolloverMidnight')}</option>
          </select>
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t border-subtle">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={busy} data-preset-save-btn>
            {t('save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
