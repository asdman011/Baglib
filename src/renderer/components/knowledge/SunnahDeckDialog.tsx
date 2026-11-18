'use client';

/**
 * Baglib — make a revision deck from Sunnah content (KEY-396).
 * - Hadith deck: follows a Sunnah book (kitab), bab or collection (live sync); the user picks which
 *   cards each hadith gets: bab → isnad and matn (default), bab → matn, isnad → matn.
 * - Narrator deck: the narrators in the chains of that book or bab, or of the hadiths the user has
 *   mastered; the user chooses which narrator details go on the cards.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Layers, Users, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import { DeckSourcePicker } from './DeckSourcePicker';
import type { TranslationKey } from '../../translations';

export type SunnahDeckSource = { kind: 'sunnah_book' | 'sunnah_bab' | 'hadith_collection'; ref: string; label: string };
type HadithCard = 'full' | 'matn' | 'isnad';
type NarratorField = 'kunya' | 'nasab' | 'laqab' | 'tabaqah' | 'death' | 'grade' | 'teachers' | 'students';

const CARDS: Array<{ id: HadithCard; key: TranslationKey }> = [
  { id: 'full', key: 'sunnahDeckCardFull' },
  { id: 'matn', key: 'sunnahDeckCardMatn' },
  { id: 'isnad', key: 'sunnahDeckCardIsnad' },
];
const NARRATOR_FIELDS: Array<{ id: NarratorField; key: TranslationKey }> = [
  { id: 'kunya', key: 'narratorFieldKunya' },
  { id: 'nasab', key: 'narratorFieldNasab' },
  { id: 'laqab', key: 'narratorFieldLaqab' },
  { id: 'tabaqah', key: 'narratorFieldTabaqah' },
  { id: 'death', key: 'narratorFieldDeath' },
  { id: 'grade', key: 'narratorFieldGrade' },
  { id: 'teachers', key: 'narratorFieldTeachers' },
  { id: 'students', key: 'narratorFieldStudents' },
];

export function SunnahDeckDialog({
  open,
  source,
  initialMode = 'hadith',
  onClose,
}: {
  open: boolean;
  source: SunnahDeckSource | null;
  initialMode?: 'hadith' | 'narrator';
  onClose: () => void;
}) {
  const { t, dir } = useWorkspace();
  const [mode, setMode] = useState<'hadith' | 'narrator'>(initialMode);
  const [name, setName] = useState('');
  const [cards, setCards] = useState<HadithCard[]>(['full']);
  const [policy, setPolicy] = useState<'toast' | 'silent'>('toast');
  const [narratorSource, setNarratorSource] = useState<'source' | 'mastered' | 'pick'>(source ? 'source' : 'mastered');
  const [pickKind, setPickKind] = useState<'sunnah_book' | 'sunnah_bab'>('sunnah_book');
  const [pickedRef, setPickedRef] = useState('');
  const [fields, setFields] = useState<NarratorField[]>(['kunya', 'nasab', 'tabaqah', 'death', 'grade']);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const narratorAllowed = source?.kind !== 'hadith_collection';
  const onPicked = useCallback((ref: string) => setPickedRef(ref), []);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setMode(narratorAllowed ? initialMode : 'hadith');
      setName(source?.label ?? '');
      setNarratorSource(source && narratorAllowed ? 'source' : 'mastered');
      setMessage(null);
      setError(null);
    });
  }, [open, source, initialMode, narratorAllowed]);

  if (!open) return null;

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  const fail = (err: unknown) => {
    const msg = (err as Error)?.message ?? '';
    setError(
      msg.includes('no-mastered-hadith')
        ? t('narratorDeckNoMastered')
        : msg.includes('narrators-unavailable')
          ? t('narratorDeckUnavailable')
          : msg.includes('UNIQUE') || msg.includes('exists')
            ? t('sunnahDeckNameTaken')
            : t('deckSyncFailed')
    );
  };

  const createHadithDeck = async () => {
    if (!source || !name.trim() || !cards.length) return;
    setBusy(true);
    setError(null);
    try {
      const deck = await window.electronAPI.knowledgeCards.createDeck({ name: name.trim() });
      const { result } = await window.electronAPI.deckSync.subscribe({ deckId: deck.id, sourceKind: source.kind, sourceRef: source.ref, newItems: policy, cards });
      setMessage(t('sunnahDeckCreated', { count: result.added + result.linked, name: name.trim() }));
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const createNarratorDeck = async () => {
    if (!name.trim()) return;
    const from =
      narratorSource === 'mastered'
        ? ({ kind: 'mastered' } as const)
        : narratorSource === 'source' && source && source.kind !== 'hadith_collection'
          ? { kind: source.kind, ref: source.ref }
          : pickedRef
            ? { kind: pickKind, ref: pickedRef }
            : null;
    if (!from) return;
    setBusy(true);
    setError(null);
    try {
      const r = await window.electronAPI.deckSync.generateNarratorDeck({ deckName: name.trim(), source: from, fields });
      setMessage(t('narratorDeckCreated', { count: r.narrators, added: r.added, name: name.trim() }));
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const tab = (value: 'hadith' | 'narrator', label: string, icon: React.ReactNode, disabled = false) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      disabled={disabled}
      data-sunnah-deck-mode={value}
      onClick={() => setMode(value)}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${mode === value ? 'bg-primary text-primary-contrast font-semibold' : 'text-muted hover:text-main'} disabled:opacity-40`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="sunnah-deck-title">
      <div dir={dir} data-sunnah-deck-dialog className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-subtle bg-surface p-5 shadow-2xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <h3 id="sunnah-deck-title" className="font-bold text-main">{t('sunnahDeckTitle')}</h3>
          <button type="button" onClick={onClose} aria-label={t('close')} data-close-sunnah-deck className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main">
            <X className="size-4" />
          </button>
        </header>
        {source && (
          <p dir="auto" className="rounded-lg bg-canvas px-3 py-2 text-sm text-main">
            {source.label}
          </p>
        )}
        <div role="tablist" className="inline-flex gap-1 rounded-xl border border-subtle p-1">
          {tab('hadith', t('sunnahDeckModeHadith'), <Layers className="size-4" />, !source)}
          {tab('narrator', t('sunnahDeckModeNarrator'), <Users className="size-4" />, !narratorAllowed)}
        </div>

        <label className="block space-y-1 text-xs text-muted">
          <span>{t('sunnahDeckName')}</span>
          <input value={name} dir="auto" data-sunnah-deck-name onChange={e => setName(e.target.value)} className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main" />
        </label>

        {mode === 'hadith' ? (
          <>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold text-muted">{t('sunnahDeckCards')}</legend>
              {CARDS.map(card => (
                <label key={card.id} className="flex items-center gap-2 text-sm text-main">
                  <input type="checkbox" data-sunnah-deck-card={card.id} checked={cards.includes(card.id)} onChange={() => setCards(c => toggle(c, card.id))} />
                  {t(card.key)}
                </label>
              ))}
              <p className="text-xs text-muted">{t('sunnahDeckCardsHint')}</p>
            </fieldset>
            <label className="flex items-center gap-2 text-xs text-muted">
              {t('deckSyncPolicy')}
              <select value={policy} onChange={e => setPolicy(e.target.value as 'toast' | 'silent')} className="rounded-lg border border-subtle bg-canvas px-2 py-1 text-xs text-main">
                <option value="toast">{t('deckSyncPolicyToast')}</option>
                <option value="silent">{t('deckSyncPolicySilent')}</option>
              </select>
            </label>
            <Button type="button" disabled={busy || !name.trim() || !cards.length || !source} data-sunnah-deck-create onClick={() => void createHadithDeck()} icon={<Layers className="size-4" />}>
              {t('sunnahDeckCreate')}
            </Button>
          </>
        ) : (
          <>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold text-muted">{t('narratorDeckFrom')}</legend>
              {source && narratorAllowed && (
                <label className="flex items-center gap-2 text-sm text-main">
                  <input type="radio" name="narrator-source" data-narrator-source="source" checked={narratorSource === 'source'} onChange={() => setNarratorSource('source')} />
                  {t('narratorDeckFromSource')}
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-main">
                <input type="radio" name="narrator-source" data-narrator-source="mastered" checked={narratorSource === 'mastered'} onChange={() => setNarratorSource('mastered')} />
                {t('narratorDeckFromMastered')}
              </label>
              {!source && (
                <label className="flex items-center gap-2 text-sm text-main">
                  <input type="radio" name="narrator-source" data-narrator-source="pick" checked={narratorSource === 'pick'} onChange={() => setNarratorSource('pick')} />
                  {t('narratorDeckFromPick')}
                </label>
              )}
            </fieldset>
            {narratorSource === 'pick' && (
              <div className="space-y-2 rounded-xl border border-dashed border-subtle p-3">
                <select value={pickKind} onChange={e => setPickKind(e.target.value as 'sunnah_book' | 'sunnah_bab')} className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main">
                  <option value="sunnah_book">{t('deckSyncKindSunnahBook')}</option>
                  <option value="sunnah_bab">{t('deckSyncKindSunnahBab')}</option>
                </select>
                <DeckSourcePicker key={pickKind} kind={pickKind} onChange={onPicked} />
              </div>
            )}
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold text-muted">{t('narratorDeckFields')}</legend>
              <p className="text-xs text-muted">{t('narratorDeckFieldsHint')}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {NARRATOR_FIELDS.map(field => (
                  <label key={field.id} className="flex items-center gap-2 text-sm text-main">
                    <input type="checkbox" data-narrator-field={field.id} checked={fields.includes(field.id)} onChange={() => setFields(f => toggle(f, field.id))} />
                    {t(field.key)}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button
              type="button"
              disabled={busy || !name.trim() || (narratorSource === 'pick' && !pickedRef)}
              data-narrator-deck-create
              onClick={() => void createNarratorDeck()}
              icon={<Users className="size-4" />}
            >
              {t('narratorDeckCreate')}
            </Button>
          </>
        )}

        {message && (
          <p role="status" data-sunnah-deck-message className="text-sm text-main">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" data-sunnah-deck-error className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
