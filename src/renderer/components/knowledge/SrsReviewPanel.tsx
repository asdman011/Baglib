'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import type { ReviewQueue, ReviewRating } from '../../../shared/srs';

export function SrsReviewPanel() {
  const { t, dir, lang } = useWorkspace();
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const started = useRef(0);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (locked.current) return;
    const request = ++generation.current;
    try {
      const value = await window.electronAPI.knowledgeCards.reviewQueue();
      if (request !== generation.current) return;
      setQueue(value); setRevealed(false); setFailed(false); started.current = Date.now();
    } catch { if (request === generation.current) setFailed(true); }
  }, []);
  useEffect(() => {
    const pending = generation;
    const update = () => void refresh();
    update();
    window.addEventListener(KNOWLEDGE_CARD_SAVED, update);
    return () => { pending.current++; window.removeEventListener(KNOWLEDGE_CARD_SAVED, update); };
  }, [refresh]);
  useEffect(() => {
    if (!queue || queue.cards.length || !queue.nextDue) return;
    const delay = Math.min(2_147_483_647, Math.max(1000, Date.parse(queue.nextDue) - Date.now()));
    const timer = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(timer);
  }, [queue, refresh]);
  const card = queue?.cards[0];
  const grade = useCallback(async (rating: ReviewRating) => {
    if (!card || locked.current || !revealed) return;
    locked.current = true; setBusy(true); generation.current++;
    try {
      const value = await window.electronAPI.knowledgeCards.gradeReview({ id: card.id, revision: card.revision, rating, durationMs: Math.min(86_400_000, Math.max(0, Date.now() - started.current)) });
      setQueue(value); setRevealed(false); setFailed(false); started.current = Date.now();
      window.dispatchEvent(new CustomEvent('baglib:srs-reviewed'));
    } catch { setFailed(true); }
    finally { locked.current = false; setBusy(false); }
  }, [card, revealed]);
  return <section dir={dir} data-srs-review className="rounded-2xl border border-subtle bg-surface p-4 space-y-3 min-w-0">
    <header className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{t('srsTitle')}</h3><button type="button" disabled={busy} onClick={() => void refresh()} className="text-sm underline">{t('srsRefresh')}</button></header>
    {queue && <p className="text-sm text-muted" aria-live="polite">{t('srsCounts', { due: queue.due, reviewed: queue.reviewedToday })}</p>}
    {failed && <p role="alert" className="text-sm text-red-600">{t('srsFailed')}</p>}
    {!queue && !failed && <p role="status">{t('srsLoading')}</p>}
    {card ? <article key={card.id} className="space-y-3" data-srs-card={card.id}>
      <p dir="auto" className="font-reading text-lg leading-loose whitespace-pre-wrap break-words">{card.front}</p>
      {card.sourceLabel && <p dir="auto" className="text-xs text-muted">{card.sourceLabel}</p>}
      {revealed ? <>
        <p dir="auto" data-srs-answer className="border-t border-subtle pt-3 leading-loose whitespace-pre-wrap break-words">{card.back || t('srsRecall')}</p>
        <div className="flex flex-wrap gap-2">{([1, 2, 3, 4] as const).map(rating => <button key={rating} type="button" data-srs-rating={rating} disabled={busy} onClick={() => void grade(rating)} className="rounded-lg border border-subtle px-3 py-2 disabled:opacity-50">{t((['srsAgain', 'srsHard', 'srsGood', 'srsEasy'] as const)[rating - 1])}</button>)}</div>
      </> : <button type="button" data-srs-reveal onClick={() => setRevealed(true)} className="rounded-lg bg-emerald-700 text-white px-3 py-2">{t('srsReveal')}</button>}
    </article> : queue && <p role="status" className="text-sm text-muted">{t('srsEmpty')}{queue.nextDue && <> · {t('srsNext')} <time dateTime={queue.nextDue}>{new Date(queue.nextDue).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</time></>}</p>}
  </section>;
}
