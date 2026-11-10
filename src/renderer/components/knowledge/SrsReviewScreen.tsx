'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, ArrowLeft, ArrowRight, Sparkles, RotateCw, ExternalLink } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import { MISTAKE_CATEGORIES, mistakeKey, type MistakeCategory } from '../../../shared/practice';
import { PracticeAnswer } from './PracticeAnswer';
import type { ReviewQueue, ReviewRating } from '../../../shared/srs';

export interface SrsReviewScreenProps {
  onClose: () => void;
  onNavigateSource?: (target: string) => void;
}

export function formatInterval(rating: ReviewRating, lang: string): string {
  if (lang === 'ar') {
    switch (rating) {
      case 1: return '< ١٠ د';
      case 2: return '١ يوم';
      case 3: return '٣ أيام';
      case 4: return '٧ أيام';
    }
  }
  switch (rating) {
    case 1: return '< 10 min';
    case 2: return '1 day';
    case 3: return '3 days';
    case 4: return '7 days';
  }
}

export const SrsReviewScreen: React.FC<SrsReviewScreenProps> = ({ onClose, onNavigateSource }) => {
  const { t, dir, lang, books, openBookForReading } = useWorkspace();
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [mistake, setMistake] = useState<MistakeCategory | undefined>();
  const [confidence, setConfidence] = useState(0);
  const [practiceDone, setPracticeDone] = useState(false);
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
      setQueue(value);
      setRevealed(false);
      setConfidence(0);
      setMistake(undefined);
      setPracticeDone(false);
      setFailed(false);
      started.current = Date.now();
    } catch {
      if (request === generation.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    const pending = generation;
    const update = () => void refresh();
    update();
    window.addEventListener(KNOWLEDGE_CARD_SAVED, update);
    return () => {
      pending.current++;
      window.removeEventListener(KNOWLEDGE_CARD_SAVED, update);
    };
  }, [refresh]);

  useEffect(() => {
    if (!queue || queue.cards.length || !queue.nextDue) return;
    const delay = Math.min(2_147_483_647, Math.max(1000, Date.parse(queue.nextDue) - Date.now()));
    const timer = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(timer);
  }, [queue, refresh]);

  const card = queue?.cards[0];

  const grade = useCallback(
    async (rating: ReviewRating) => {
      if (!card || locked.current || !revealed) return;
      locked.current = true;
      setBusy(true);
      generation.current++;
      try {
        if ((card.questionKind ?? 'recall') === 'recall' && !practiceDone) {
          try {
            await window.electronAPI.knowledgeCards.recordAttempt({
              knowledgeId: card.id,
              cardRevision: card.cardRevision,
              answerText: '',
              confidence,
              checkMethod: 'self',
              mistakeCategory: rating <= 2 ? mistake : undefined,
              result: rating === 1 ? 'incorrect' : rating === 2 ? 'partial' : 'correct',
              durationMs: Math.min(86_400_000, Math.max(0, Date.now() - started.current)),
            });
            setPracticeDone(true);
            window.dispatchEvent(new CustomEvent('baglib:practice-recorded'));
          } catch {}
        }
        const value = await window.electronAPI.knowledgeCards.gradeReview({
          id: card.id,
          revision: card.revision,
          rating,
          durationMs: Math.min(86_400_000, Math.max(0, Date.now() - started.current)),
        });
        setQueue(value);
        setRevealed(false);
        setConfidence(0);
        setMistake(undefined);
        setPracticeDone(false);
        setFailed(false);
        started.current = Date.now();
        window.dispatchEvent(new CustomEvent('baglib:srs-reviewed'));
      } catch {
        setFailed(true);
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [card, revealed, confidence, practiceDone, mistake]
  );

  // Global keyboard shortcuts: Space to reveal, 1-4 to rate, Esc to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't intercept if user is typing in a text field
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') &&
        !(target instanceof HTMLInputElement && (target.type === 'radio' || target.type === 'checkbox'))
      ) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (!card) return;

      if (!revealed) {
        if (event.key === ' ' || event.code === 'Space') {
          event.preventDefault();
          setRevealed(true);
        }
      } else {
        if (event.key === '1' || event.code === 'Digit1' || event.code === 'Numpad1') {
          event.preventDefault();
          void grade(1);
        } else if (event.key === '2' || event.code === 'Digit2' || event.code === 'Numpad2') {
          event.preventDefault();
          void grade(2);
        } else if (event.key === '3' || event.code === 'Digit3' || event.code === 'Numpad3') {
          event.preventDefault();
          void grade(3);
        } else if (event.key === '4' || event.code === 'Digit4' || event.code === 'Numpad4') {
          event.preventDefault();
          void grade(4);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [card, revealed, grade, onClose]);

  const handleOpenSource = () => {
    if (!card?.sourceRef) return;
    if (onNavigateSource) {
      onNavigateSource(card.sourceRef);
    } else {
      const parts = card.sourceRef.split(':');
      if (parts[0] === 'book') {
        const book = books.find((b) => b.id === parts[1]);
        if (book) openBookForReading(book);
      }
    }
  };

  const totalToday = (queue?.reviewedToday ?? 0) + (queue?.due ?? 0);
  const progressPercent = totalToday > 0 ? Math.min(100, Math.round(((queue?.reviewedToday ?? 0) / totalToday) * 100)) : 100;
  const isRtl = dir === 'rtl';
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  return (
    <div
      dir={dir}
      data-srs-review
      data-srs-review-screen
      className="flex-1 min-h-0 flex flex-col bg-canvas select-none overflow-hidden"
    >
      {/* Review Screen Header */}
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-subtle bg-surface">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            icon={<BackIcon className="size-4" />}
            data-srs-exit-button
          >
            {t('srsExitReview')}
          </Button>
          <div className="h-4 w-px bg-subtle" />
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-amber-500" />
            <h2 className="font-display font-bold text-sm text-main">{t('srsTitle')}</h2>
          </div>
        </div>

        {queue && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted tabular-nums">
              {t('srsCounts', { due: queue.due, reviewed: queue.reviewedToday })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void refresh()}
              icon={<RotateCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} />}
              aria-label={t('srsRefresh')}
            />
          </div>
        )}
      </header>

      {/* Progress Bar */}
      <div
        className="w-full bg-border/40 h-1.5 shrink-0 overflow-hidden"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('srsProgressBar', { current: queue?.reviewedToday ?? 0, total: totalToday })}
      >
        <div
          className="bg-primary h-full transition-[width] duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main Review Stage */}
      <main className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {failed && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm max-w-lg w-full text-center"
          >
            {t('srsFailed')}
          </div>
        )}

        {!queue && !failed && (
          <div className="flex flex-col items-center justify-center gap-3 text-muted" role="status">
            <RotateCw className="size-6 animate-spin" />
            <p className="text-sm">{t('srsLoading')}</p>
          </div>
        )}

        {/* When a Card is Present */}
        {card && (
          <div className="w-full max-w-2xl flex flex-col items-center gap-6" data-srs-card={card.id}>
            {/* The Centered Card Container */}
            <article
              className="w-full bg-surface border border-subtle rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col justify-between min-h-[260px] sm:min-h-[300px] transition-all"
            >
              {/* Question / Front */}
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span className="uppercase tracking-wider font-mono text-[10px] text-muted">
                    {card.questionKind ?? 'recall'}
                  </span>
                  {card.sourceLabel && (
                    <span dir="auto" className="truncate max-w-[240px]">
                      {card.sourceLabel}
                    </span>
                  )}
                </div>

                <p
                  dir="auto"
                  className="font-reading text-xl sm:text-2xl leading-[2.2] font-medium text-main text-center whitespace-pre-wrap break-words py-2"
                  style={{ fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)" }}
                >
                  {card.front}
                </p>

                {card.sourceRef && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      data-card-source={card.id}
                      onClick={handleOpenSource}
                      className="inline-flex items-center gap-1.5 text-xs text-primary-text hover:underline focus-visible:outline-focus"
                    >
                      <ExternalLink className="size-3" />
                      <span>{t('practiceOpenSource')}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Middle interactive area (Practice answer if not recall) */}
              {(card.questionKind ?? 'recall') !== 'recall' && (
                <div className="my-4">
                  <PracticeAnswer
                    key={`${card.id}-${card.cardRevision}`}
                    card={card}
                    onRecorded={() => {
                      setPracticeDone(true);
                      setRevealed(true);
                    }}
                  />
                </div>
              )}

              {/* Confidence Rating (for recall, when unrevealed) */}
              {(card.questionKind ?? 'recall') === 'recall' && !revealed && (
                <div className="mt-6 flex flex-col items-center gap-2">
                  <span className="text-xs text-muted">{t('practiceConfidence')}</span>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4].map((n) => (
                      <label
                        key={n}
                        className={`size-8 rounded-lg border flex items-center justify-center text-xs font-semibold cursor-pointer transition-colors ${
                          confidence === n
                            ? 'bg-primary text-primary-contrast border-primary'
                            : 'border-subtle bg-canvas text-text hover:bg-surface'
                        }`}
                      >
                        <input
                          type="radio"
                          name="srs-confidence-screen"
                          value={n}
                          checked={confidence === n}
                          onChange={() => setConfidence(n)}
                          className="sr-only"
                        />
                        {n}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Revealed Answer Content */}
              {revealed && (
                <div className="mt-6 border-t border-subtle pt-6 space-y-4 animate-in fade-in duration-200">
                  {(card.questionKind ?? 'recall') === 'recall' && (
                    <p
                      dir="auto"
                      data-srs-answer
                      className="font-reading text-lg sm:text-xl leading-[2.2] text-main text-center whitespace-pre-wrap break-words"
                      style={{ fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)" }}
                    >
                      {card.back || t('srsRecall')}
                    </p>
                  )}

                  {(card.questionKind ?? 'recall') === 'recall' && (
                    <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted pt-2">
                      <span className="bg-canvas px-2.5 py-1 rounded-md border border-subtle">
                        {t('practiceCheckedSelf')}
                      </span>
                      <label className="flex items-center gap-1.5">
                        <span>{t('practiceMistake')}</span>
                        <select
                          aria-label={t('practiceMistake')}
                          value={mistake ?? ''}
                          onChange={(e) => setMistake((e.target.value as MistakeCategory) || undefined)}
                          className="bg-canvas rounded-lg border border-subtle px-2 py-1 text-xs text-text outline-none"
                        >
                          <option value="">{t('practiceSkipMistake')}</option>
                          {MISTAKE_CATEGORIES.map((m) => (
                            <option key={m} value={m}>
                              {t(mistakeKey(m))}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </article>

            {/* Answer / Action Buttons Bar */}
            <div className="w-full">
              {!revealed ? (
                <div className="flex flex-col items-center gap-2">
                  <Button
                    variant="primary"
                    size="md"
                    data-srs-reveal
                    onClick={() => setRevealed(true)}
                    className="w-full max-w-sm h-12 text-base shadow-sm"
                  >
                    <span>{t('srsReveal')}</span>
                    <kbd className="ms-2 px-1.5 py-0.5 text-xs rounded bg-white/20 dark:bg-black/20 font-mono">
                      Space
                    </kbd>
                  </Button>
                  <span className="text-[11px] text-muted">{t('srsSpaceToReveal')}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 w-full">
                    {/* Rating 1: Again */}
                    <button
                      type="button"
                      data-srs-rating={1}
                      disabled={busy}
                      onClick={() => void grade(1)}
                      className="group p-3 sm:p-4 rounded-xl border border-danger/30 bg-danger/5 hover:bg-danger/10 text-danger flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-danger cursor-pointer shadow-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-danger/10 border border-danger/20">
                          1
                        </kbd>
                        <span className="font-bold text-sm sm:text-base">{t('srsAgain')}</span>
                      </div>
                      <span className="text-xs opacity-80 tabular-nums">{formatInterval(1, lang)}</span>
                    </button>

                    {/* Rating 2: Hard */}
                    <button
                      type="button"
                      data-srs-rating={2}
                      disabled={busy}
                      onClick={() => void grade(2)}
                      className="group p-3 sm:p-4 rounded-xl border border-subtle bg-surface hover:bg-canvas text-text flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-focus cursor-pointer shadow-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-canvas border border-subtle">
                          2
                        </kbd>
                        <span className="font-bold text-sm sm:text-base">{t('srsHard')}</span>
                      </div>
                      <span className="text-xs text-muted tabular-nums">{formatInterval(2, lang)}</span>
                    </button>

                    {/* Rating 3: Good */}
                    <button
                      type="button"
                      data-srs-rating={3}
                      disabled={busy}
                      onClick={() => void grade(3)}
                      className="group p-3 sm:p-4 rounded-xl border border-success/40 bg-success/5 hover:bg-success/15 text-success flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-success cursor-pointer shadow-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-success/15 border border-success/25">
                          3
                        </kbd>
                        <span className="font-bold text-sm sm:text-base">{t('srsGood')}</span>
                      </div>
                      <span className="text-xs opacity-85 tabular-nums">{formatInterval(3, lang)}</span>
                    </button>

                    {/* Rating 4: Easy */}
                    <button
                      type="button"
                      data-srs-rating={4}
                      disabled={busy}
                      onClick={() => void grade(4)}
                      className="group p-3 sm:p-4 rounded-xl border border-focus/40 bg-focus/5 hover:bg-focus/15 text-focus flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-focus cursor-pointer shadow-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-focus/15 border border-focus/25">
                          4
                        </kbd>
                        <span className="font-bold text-sm sm:text-base">{t('srsEasy')}</span>
                      </div>
                      <span className="text-xs opacity-85 tabular-nums">{formatInterval(4, lang)}</span>
                    </button>
                  </div>
                  <p className="text-center text-[11px] text-muted">{t('srsKeysHint')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty State when queue is empty */}
        {queue && !card && !busy && (
          <EmptyState
            icon={<CheckCircle className="size-8 text-success" />}
            title={t('srsCompletedToday')}
            description={
              queue.nextDue ? (
                <>
                  {t('srsCompletedDesc')}
                  <br />
                  <span className="mt-2 inline-block font-medium text-main">
                    {t('srsNext')}{' '}
                    <time dateTime={queue.nextDue}>
                      {new Date(queue.nextDue).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')}
                    </time>
                  </span>
                </>
              ) : (
                t('srsCompletedDesc')
              )
            }
            action={
              <Button variant="primary" size="md" onClick={onClose} data-srs-return-button>
                {t('srsReturnToCards')}
              </Button>
            }
          />
        )}
      </main>
    </div>
  );
};
