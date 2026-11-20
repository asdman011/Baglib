'use client';

import { shortcutForEvent } from '../actions/shortcuts';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, ArrowLeft, ArrowRight, Sparkles, RotateCw, ExternalLink, MoreHorizontal, AlertTriangle } from 'lucide-react';
import { useTabKeysActive, useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ReviseNextList } from './ReviseNextList';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import { MISTAKE_CATEGORIES, kindKey, mistakeKey, type MistakeCategory } from '../../../shared/practice';
import { PracticeAnswer } from './PracticeAnswer';
import { SafeCardRenderer, isTemplateHtml } from './SafeCardRenderer';
import { renderTemplate, contextClozeCardFields, DEFAULT_CONTEXT_CLOZE_TEMPLATE, cardSearchTerm } from '../../../shared/revision/template-engine';
import type { CardNote, CardNoteType, CardNoteTemplate } from '../../../shared/types/card-notes';
import type { ReviewQueue, ReviewRating } from '../../../shared/srs';

export interface SrsReviewScreenProps {
  deckId?: string | null;
  onClose: () => void;
  onCompareSimilar?: (term: string) => void;
  onNavigateSource?: (target: string) => void;
}

/** The scheduler's next interval (minutes) in the reader's language, with locale units, digits and plurals. */
export function formatInterval(minutes: number | undefined, lang: string): string {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return '';
  const [value, unit] = minutes < 60 ? [Math.round(minutes), 'minute']
    : minutes < 1440 ? [Math.round(minutes / 60), 'hour']
    : minutes < 43200 ? [Math.round(minutes / 1440), 'day']
    : minutes < 525600 ? [Math.round(minutes / 43200), 'month']
    : [Math.round(minutes / 52560) / 10, 'year'];
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { style: 'unit', unit, unitDisplay: 'short' }).format(value);
}

const playCardTts = async (text: string, ttsLang: string) => {
  const pocketLang = ttsLang.startsWith('en') ? 'english'
    : ttsLang.startsWith('fr') ? 'french'
    : ttsLang.startsWith('de') ? 'german'
    : ttsLang.startsWith('es') ? 'spanish'
    : ttsLang.startsWith('it') ? 'italian'
    : ttsLang.startsWith('pt') ? 'portuguese'
    : ttsLang.startsWith('nl') ? 'dutch'
    : undefined;

  if (pocketLang) {
    try {
      const ttsApi = window.electronAPI?.audio?.tts;
      if (ttsApi) {
        const status = await ttsApi.getStatus().catch(() => null);
        if (status?.isLoaded) {
          await ttsApi.synthesize({ text, voiceId: status.currentVoice || 'default', language: pocketLang });
          return;
        }
      }
    } catch {}
  }

  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (ttsLang) u.lang = ttsLang;
      window.speechSynthesis.speak(u);
    }
  } catch {}
};

export const SrsReviewScreen: React.FC<SrsReviewScreenProps> = ({
  deckId,
  onClose,
  onCompareSimilar,
  onNavigateSource,
}) => {
  const { t, dir, lang, books, openBookForReading } = useWorkspace();
  const keysActive = useTabKeysActive();
  const ioStrings = useMemo(() => ({ toggleMasks: t('ioToggleMasks'), noImage: t('ioNoImage') }), [t]);
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [mistake, setMistake] = useState<MistakeCategory | undefined>();
  const [confidence, setConfidence] = useState(0);
  const [practiceDone, setPracticeDone] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<CardNote | null>(null);
  const [noteType, setNoteType] = useState<CardNoteType | null>(null);
  const [typedAnswers, setTypedAnswers] = useState<Record<string, string>>({});
  const [dueDaysInput, setDueDaysInput] = useState<number>(3);
  const [showDueInput, setShowDueInput] = useState<boolean>(false);

  const locked = useRef(false);
  const started = useRef(0);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (locked.current) return;
    const request = ++generation.current;
    try {
      const value = await window.electronAPI.knowledgeCards.reviewQueue(deckId ?? undefined);
      if (request !== generation.current) return;
      setQueue(value);
      setRevealed(false);
      setConfidence(0);
      setMistake(undefined);
      setPracticeDone(false);
      setFailed(false);
      setShowDueInput(false);
      started.current = Date.now();
    } catch {
      if (request === generation.current) setFailed(true);
    }
  }, [deckId]);

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
    // A scheduled queue refresh must not keep a Node renderer/test host alive.
    // Browser timers are numeric; mounted screens still refresh and clean up normally.
    timer.unref?.();
    return () => clearTimeout(timer);
  }, [queue, refresh]);

  const card = queue?.cards[0];
  const typedAnswer = (card ? typedAnswers[card.id] : undefined) ?? '';
  const needsConfidence = !!card && (card.questionKind ?? 'recall') === 'recall' && !practiceDone;
  const canReveal = !needsConfidence || confidence > 0;

  useEffect(() => {
    let active = true;
    if (!card?.noteId) return;

    window.electronAPI.cardNotes.getNote(card.noteId)
      .then(async (fetchedNote) => {
        if (!active) return;
        setNote(fetchedNote);
        if (fetchedNote) {
          const fetchedType = await window.electronAPI.cardNotes.getType(fetchedNote.noteTypeId);
          if (!active) return;
          setNoteType(fetchedType);
        }
      })
      .catch(() => {});

    return () => { active = false; };
  }, [card?.noteId]);

  const renderedContent = useMemo(() => {
    if (!card) return { front: '', back: '', css: '' };

    const currentNote = note && note.id === card.noteId ? note : null;
    const currentNoteType = currentNote && noteType && noteType.id === currentNote.noteTypeId ? noteType : null;

    if (currentNote && currentNoteType) {
      try {
        const cardOrd = card.ord ?? 0;
        let template: Pick<CardNoteTemplate, 'ord' | 'name' | 'front' | 'back'> | undefined = currentNoteType.templates[cardOrd];
        let clozeNum = cardOrd + 1;

        if (currentNoteType.kind === 'cloze') {
          template = currentNoteType.templates[0] || { ord: 0, name: 'Cloze', front: '{{cloze:Text}}', back: '{{cloze:Text}}<br>{{Back Extra}}' };
        } else if (currentNoteType.kind === 'context_cloze') {
          template = currentNoteType.templates[0] || DEFAULT_CONTEXT_CLOZE_TEMPLATE;
        }

        if (template) {
          let fields = { ...currentNote.fields };
          if (currentNoteType.kind === 'context_cloze') {
            const cardFields = contextClozeCardFields(fields, cardOrd);
            if (cardFields) {
              fields = cardFields;
              clozeNum = 1;
            }
          }

          const frontHtml = renderTemplate(template.front, { fields, cardOrd, clozeNum }, 'front');
          const backHtml = renderTemplate(template.back, { fields, cardOrd, clozeNum, frontRendered: frontHtml, typedAnswer }, 'back');
          return { front: frontHtml, back: backHtml, css: currentNoteType.css };
        }
      } catch (err) {
        console.warn('Failed to render note template:', err);
      }
    }

    return {
      front: card.front,
      back: card.back || card.front,
      css: '',
    };
  }, [card, note, noteType, typedAnswer]);

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
          ...(deckId ? { deckId } : {}),
        });
        setQueue(value);
        setRevealed(false);
        setConfidence(0);
        setMistake(undefined);
        setPracticeDone(false);
        setFailed(false);
        setShowDueInput(false);
        started.current = Date.now();
        window.dispatchEvent(new CustomEvent('baglib:srs-reviewed'));
      } catch {
        setFailed(true);
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [card, revealed, confidence, practiceDone, mistake, deckId]
  );

  const runCardAction = async (fn: () => Promise<ReviewQueue>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    generation.current++;
    try {
      const value = await fn();
      setQueue(value);
      setRevealed(false);
      setConfidence(0);
      setMistake(undefined);
      setPracticeDone(false);
      setFailed(false);
      setShowDueInput(false);
      started.current = Date.now();
      window.dispatchEvent(new CustomEvent('baglib:srs-reviewed'));
    } catch {
      setFailed(true);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  // Global keyboard shortcuts: Space to reveal, 1-4 to rate, Esc to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!keysActive.current) return;
      // Don't intercept if user is typing in a text field
      const shortcut = shortcutForEvent(event, 'review');
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
        // Before Reveal, 1-4 choose how sure you are; they never grade.
        const chosen = shortcut?.id?.startsWith('review-grade-') ? Number(shortcut.id.slice(-1)) : 0;
        if (chosen >= 1 && chosen <= 4 && needsConfidence) {
          event.preventDefault();
          setConfidence(chosen);
        } else if (shortcut?.id === 'review-reveal') {
          event.preventDefault();
          if (canReveal) setRevealed(true);
        }
      } else {
        if (shortcut?.id === 'review-grade-1') {
          event.preventDefault();
          void grade(1);
        } else if (shortcut?.id === 'review-grade-2') {
          event.preventDefault();
          void grade(2);
        } else if (shortcut?.id === 'review-grade-3') {
          event.preventDefault();
          void grade(3);
        } else if (shortcut?.id === 'review-grade-4') {
          event.preventDefault();
          void grade(4);
        } else if (!event.ctrlKey && !event.metaKey && !event.altKey && (event.key === 'm' || event.key === 'M')) {
          // Image occlusion: M toggles the masks on the answer side, as in Anki (KEY-391).
          document
            .querySelectorAll<HTMLIFrameElement>('[data-srs-review-screen] iframe[data-card-frame]')
            .forEach(frame => frame.contentWindow?.postMessage({ type: 'baglib-io-toggle' }, '*'));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [card, revealed, grade, onClose, needsConfidence, canReveal]);

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
            <h2 className="font-display font-bold text-sm text-main">
              {t('srsTitle')}
              {queue?.deckName && (
                <span data-srs-deck-name className="ms-2 text-xs font-normal text-muted">
                  ({queue.deckId === 'memorization' ? t('deckMemorizationBuiltIn') : queue.deckName})
                </span>
              )}
            </h2>
          </div>
        </div>

        {queue && (
          <div className="flex flex-wrap items-center gap-3">
            {/* New / Learning / Due Counts */}
            <span
              data-srs-queue-counts
              className="text-xs px-2.5 py-1 rounded-full bg-canvas border border-subtle tabular-nums"
              title={t('deckCountsBadge', {
                newCount: queue.newCount ?? 0,
                learningCount: queue.learningCount ?? 0,
                dueCount: queue.dueCount ?? queue.due,
              })}
            >
              <span data-srs-new-count className="text-blue-600 dark:text-blue-400 font-semibold">
                {queue.newCount ?? 0}
              </span>
              {' / '}
              <span data-srs-learning-count className="text-amber-600 dark:text-amber-400 font-semibold">
                {queue.learningCount ?? 0}
              </span>
              {' / '}
              <span data-srs-due-count className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {queue.dueCount ?? queue.due}
              </span>
            </span>

            {(queue.buriedCount ?? 0) > 0 && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                data-srs-unbury
                onClick={() => void runCardAction(() => window.electronAPI.knowledgeCards.unbury(deckId ?? undefined))}
              >
                {t('deckUnburyBtn', { count: queue.buriedCount ?? 0 })}
              </Button>
            )}

            <span
              className="text-xs text-muted tabular-nums"
              title={t('srsProgressCounter', { current: Math.min(totalToday, queue.reviewedToday + (card ? 1 : 0)), total: totalToday })}
            >
              {t('srsCounts', { due: queue.due, reviewed: queue.reviewedToday })}
            </span>

            {/* Card Actions Menu (Bury, Suspend, Forget, Set Due Date) */}
            {card && (
              <details data-srs-card-menu className="relative">
                <summary
                  data-srs-card-menu-trigger
                  aria-label={t('srsCardActionsMenu')}
                  title={t('srsCardActionsMenu')}
                  className="list-none cursor-pointer rounded-lg border border-subtle bg-canvas p-1.5 text-muted hover:text-main hover:bg-surface"
                >
                  <MoreHorizontal className="size-4" />
                </summary>
                <div className="absolute end-0 mt-1 w-56 rounded-xl border border-subtle bg-surface p-1.5 shadow-lg z-30 space-y-1 text-xs">
                  <button
                    type="button"
                    data-srs-bury-card
                    disabled={busy}
                    onClick={e => {
                      const d = e.currentTarget.closest('details');
                      if (d) d.open = false;
                      void runCardAction(() => window.electronAPI.knowledgeCards.buryCard(card.id, deckId ?? undefined));
                    }}
                    className="w-full rounded-lg px-2.5 py-1.5 text-start hover:bg-canvas cursor-pointer"
                  >
                    {t('srsBuryCard')}
                  </button>
                  {card.noteId && (
                    <button
                      type="button"
                      data-srs-bury-siblings
                      disabled={busy}
                      onClick={e => {
                        const d = e.currentTarget.closest('details');
                        if (d) d.open = false;
                        void runCardAction(() => window.electronAPI.knowledgeCards.buryNoteSiblings(card.id, deckId ?? undefined));
                      }}
                      className="w-full rounded-lg px-2.5 py-1.5 text-start hover:bg-canvas cursor-pointer"
                    >
                      {t('srsBurySiblings')}
                    </button>
                  )}
                  <button
                    type="button"
                    data-srs-suspend-card
                    disabled={busy}
                    onClick={e => {
                      const d = e.currentTarget.closest('details');
                      if (d) d.open = false;
                      void runCardAction(() => window.electronAPI.knowledgeCards.suspendCard(card.id, true, deckId ?? undefined));
                    }}
                    className="w-full rounded-lg px-2.5 py-1.5 text-start hover:bg-canvas cursor-pointer"
                  >
                    {t('srsSuspendCard')}
                  </button>
                  <button
                    type="button"
                    data-srs-forget-card
                    disabled={busy}
                    onClick={e => {
                      const d = e.currentTarget.closest('details');
                      if (d) d.open = false;
                      void runCardAction(() => window.electronAPI.knowledgeCards.forgetCard(card.id, deckId ?? undefined));
                    }}
                    className="w-full rounded-lg px-2.5 py-1.5 text-start hover:bg-canvas cursor-pointer"
                  >
                    {t('srsForgetCard')}
                  </button>
                  <button
                    type="button"
                    data-srs-set-due-date
                    disabled={busy}
                    onClick={() => setShowDueInput(!showDueInput)}
                    className="w-full rounded-lg px-2.5 py-1.5 text-start hover:bg-canvas cursor-pointer"
                  >
                    {t('srsSetDueDate')}
                  </button>
                  {showDueInput && (
                    <div className="flex items-center gap-1.5 px-2 py-1 border-t border-subtle pt-1.5">
                      <input
                        type="number"
                        min={0}
                        max={36500}
                        data-srs-set-due-days
                        aria-label={t('srsSetDueDaysPrompt')}
                        value={dueDaysInput}
                        onChange={e => setDueDaysInput(Number(e.target.value))}
                        className="w-20 rounded border border-subtle bg-canvas px-2 py-1 text-xs text-main"
                      />
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        data-srs-set-due-apply
                        onClick={e => {
                          const d = e.currentTarget.closest('details');
                          if (d) d.open = false;
                          void runCardAction(() =>
                            window.electronAPI.knowledgeCards.setDueDate(card.id, dueDaysInput, deckId ?? undefined)
                          );
                        }}
                      >
                        {t('save')}
                      </Button>
                    </div>
                  )}
                </div>
              </details>
            )}

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
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {failed && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm max-w-lg w-full text-center"
          >
            {t('srsFailed')}
          </div>
        )}

        {queue?.leechAlert && (
          <div
            role="status"
            data-srs-leech-alert
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200 max-w-2xl w-full"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{t('srsLeechNotice', { lapses: queue.leechAlert.lapses })}</span>
            </div>
            <button
              type="button"
              data-srs-compare-similar
              onClick={() => {
                if (onCompareSimilar) {
                  onCompareSimilar(cardSearchTerm(queue.leechAlert!.front));
                } else {
                  onClose();
                }
              }}
              className="font-semibold underline hover:no-underline cursor-pointer"
            >
              {t('srsCompareSimilar')}
            </button>
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
                  <span data-srs-question-kind className={`text-muted ${dir === 'rtl' ? 'text-xs' : 'uppercase tracking-wider font-mono text-[10px]'}`}>
                    {t(kindKey(card.questionKind ?? 'recall'))}
                  </span>
                  {card.sourceLabel && (
                    <span dir="auto" className="truncate max-w-[240px]">
                      {card.sourceLabel}
                    </span>
                  )}
                </div>

                <div className="w-full my-2">
                  <SafeCardRenderer
                    html={revealed ? renderedContent.back : renderedContent.front}
                    css={renderedContent.css}
                    side={revealed ? 'back' : 'front'}
                    rtl={dir === 'rtl'}
                    onTypedAnswerChange={(val) => {
                      if (card) setTypedAnswers((prev) => ({ ...prev, [card.id]: val }));
                    }}
                    onPlayTts={playCardTts}
                    ioStrings={ioStrings}
                  />
                </div>

                <p
                  dir="auto"
                  className="font-reading text-xl sm:text-2xl leading-[2.2] font-medium text-main text-center whitespace-pre-wrap break-words py-2 sr-only"
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
                  {/* Cards rendered from a note template show their answer inside the card frame; their stored back is HTML. */}
                  {(card.questionKind ?? 'recall') === 'recall' && !isTemplateHtml(card.back) && (
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
                    disabled={!canReveal}
                    title={canReveal ? undefined : t('practiceConfidence')}
                    onClick={() => { if (canReveal) setRevealed(true); }}
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
                      <span className="text-xs opacity-80 tabular-nums" title={t('srsNextReviewIn', { interval: formatInterval(card?.intervals?.[1], lang) })}>{formatInterval(card?.intervals?.[1], lang)}</span>
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
                      <span className="text-xs text-muted tabular-nums" title={t('srsNextReviewIn', { interval: formatInterval(card?.intervals?.[2], lang) })}>{formatInterval(card?.intervals?.[2], lang)}</span>
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
                      <span className="text-xs opacity-85 tabular-nums" title={t('srsNextReviewIn', { interval: formatInterval(card?.intervals?.[3], lang) })}>{formatInterval(card?.intervals?.[3], lang)}</span>
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
                      <span className="text-xs opacity-85 tabular-nums" title={t('srsNextReviewIn', { interval: formatInterval(card?.intervals?.[4], lang) })}>{formatInterval(card?.intervals?.[4], lang)}</span>
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
        {queue && !card && !busy && (
          <div className="mx-auto mt-6 w-full max-w-2xl px-4">
            <ReviseNextList hideWhenEmpty />
          </div>
        )}
      </div>
    </div>
  );
};
