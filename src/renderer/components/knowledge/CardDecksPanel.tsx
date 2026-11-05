'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, Layers } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import { DECK_SOURCES, type CardDeck, type DeckResult, type DeckSource } from '../../../shared/types/knowledge-cards';

const SOURCE_LABELS = { notes: 'cardDeckNotes', highlights: 'cardDeckHighlights', quran: 'cardDeckQuran', hadith: 'cardDeckHadith', poetry: 'cardDeckPoetry' } as const;

/** Builds decks from saved material and sends them to Anki. */
export function CardDecksPanel() {
  const { t } = useWorkspace();
  const [decks, setDecks] = useState<CardDeck[]>([]);
  const [name, setName] = useState('');
  const [sources, setSources] = useState<DeckSource[]>(['quran', 'hadith']);
  const [memorize, setMemorize] = useState(true);
  const [result, setResult] = useState<DeckResult | null>(null);
  const [exported, setExported] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setDecks(await window.electronAPI.knowledgeCards.decks()); setFailed(false); } catch { setFailed(true); }
  }, []);
  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);

  const generate = async () => {
    setBusy(true); setExported(false);
    try {
      setResult(await window.electronAPI.knowledgeCards.generateDeck({ name, sources, memorize }));
      setName('');
      await refresh();
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } catch { setFailed(true); } finally { setBusy(false); }
  };
  const exportDeck = async (id: string) => {
    setResult(null);
    try { setExported(await window.electronAPI.knowledgeCards.exportDeck(id)); setFailed(false); } catch { setFailed(true); }
  };

  return <details data-card-decks className="border-t border-subtle pt-3 text-sm">
    <summary className="flex cursor-pointer items-center gap-2 font-semibold text-main"><Layers className="size-4 text-muted" />{t('cardDecksTitle')}</summary>
    <div className="mt-2 space-y-2">
      <p className="text-xs leading-loose text-muted">{t('cardDecksHint')}</p>
      <label className="block">{t('cardDeckName')}<input dir="auto" value={name} onChange={event => setName(event.target.value)} className="w-full rounded border border-subtle bg-canvas p-2" /></label>
      <div className="flex flex-wrap gap-3">
        {DECK_SOURCES.map(source => <label key={source} className="flex items-center gap-2"><input type="checkbox" checked={sources.includes(source)} onChange={event => setSources(event.target.checked ? [...sources, source] : sources.filter(item => item !== source))} />{t(SOURCE_LABELS[source])}</label>)}
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={memorize} onChange={event => setMemorize(event.target.checked)} />{t('knowledgeCardMemorize')}</label>
      <button type="button" disabled={busy || !name.trim() || !sources.length} onClick={() => void generate()} className="rounded border border-subtle p-2 disabled:opacity-50">{t('cardDeckGenerate')}</button>
      {failed && <p role="alert" className="text-red-600 dark:text-red-400">{t('knowledgeCardFailed')}</p>}
      {result && <p role="status" className="text-muted">{t('cardDeckResult', { added: result.added, skipped: result.skipped })}</p>}
      {exported && <p role="status" className="text-muted">{t('cardDeckExported')}</p>}
      <ul className="space-y-1">
        {decks.map(deck => <li key={deck.id} data-card-deck={deck.id} className="flex items-center justify-between gap-2 rounded border border-subtle p-2">
          <span dir="auto" className="min-w-0 break-words">{deck.name} · {deck.cards}</span>
          <button type="button" onClick={() => void exportDeck(deck.id)} className="inline-flex shrink-0 items-center gap-1 rounded p-1 text-xs hover:bg-canvas"><Download className="size-3.5" />{t('cardDeckExport')}</button>
        </li>)}
      </ul>
    </div>
  </details>;
}
