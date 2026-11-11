'use client';
import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import { HAFS_SURAH_AYAH_COUNTS, SURAH_NAMES_AR, SURAH_NAMES_EN } from '../../../shared/quran-wird';
import type { TranslationKey } from '../../translations';

// KEY-319: a memorization deck straight from the Quran reader, starting at the ayah the menu was opened on.
// It uses the same IPC as the deck panel, so the cards (and their exact text) are the same.
export function QuranAyahDeckDialog({ reference, lang, t, onClose }: {
  reference: { surah: number; ayah: number };
  lang: 'ar' | 'en';
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  onClose: () => void;
}) {
  const last = HAFS_SURAH_AYAH_COUNTS[reference.surah - 1] ?? reference.ayah;
  const surahName = (lang === 'ar' ? SURAH_NAMES_AR : SURAH_NAMES_EN)[reference.surah - 1] ?? String(reference.surah);
  const [from, setFrom] = useState(reference.ayah);
  const [to, setTo] = useState(Math.min(reference.ayah + 2, last));
  const [name, setName] = useState(`${surahName} ${reference.surah}:${reference.ayah}-${Math.min(reference.ayah + 2, last)}`);
  const [memorize, setMemorize] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'missing' | 'failed' | null>(null);
  const { showToast } = useToast();
  const valid = !!name.trim() && Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from && to <= last;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await window.electronAPI.knowledgeCards.generateAyahDeck({ name: name.trim(), surah: reference.surah, from, to, memorize });
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
      showToast({ message: t('cardDeckResult', { added: result.added, skipped: result.skipped }) });
      onClose();
    } catch (cause) {
      setError(String((cause as Error)?.message).includes('quran-not-installed') ? 'missing' : 'failed');
    } finally { setBusy(false); }
  };
  return <Modal open onClose={onClose} title={t('quranMakeDeck')} size="sm">
    <form data-quran-deck-dialog onSubmit={event => void submit(event)} className="space-y-3 text-sm">
      <label className="block space-y-1">{t('cardDeckName')}<input data-quran-deck-name dir="auto" value={name} maxLength={200} onChange={event => setName(event.target.value)} className="w-full rounded border border-subtle bg-canvas p-2" /></label>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex w-24 flex-col gap-1">{t('cardDeckFromAyah')}<input data-quran-deck-from type="number" min={1} max={last} value={from} onChange={event => setFrom(Number(event.target.value))} className="rounded border border-subtle bg-canvas p-2" /></label>
        <label className="flex w-24 flex-col gap-1">{t('cardDeckToAyah')}<input data-quran-deck-to type="number" min={from} max={last} value={to} onChange={event => setTo(Number(event.target.value))} className="rounded border border-subtle bg-canvas p-2" /></label>
      </div>
      <p className="text-xs leading-loose text-muted">{t('cardDeckAyahHint', { count: last })}</p>
      <label className="flex items-center gap-2"><input type="checkbox" checked={memorize} onChange={event => setMemorize(event.target.checked)} />{t('knowledgeCardMemorize')}</label>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{t(error === 'missing' ? 'cardDeckQuranMissing' : 'knowledgeCardFailed')}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" disabled={!valid || busy} data-quran-deck-create>{t('cardDeckFromAyahs')}</Button>
      </div>
    </form>
  </Modal>;
}
