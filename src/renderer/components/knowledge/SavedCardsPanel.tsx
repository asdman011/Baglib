'use client';
import { useUndoFeedback } from '../../hooks/useUndoFeedback';

import { ContextMenu } from '../ui/ContextMenu';
import { contextActions } from '../actions/context-actions';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Repeat2, Search, Sparkles, BookOpen, Layers } from 'lucide-react';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { useWorkspace } from '../context/WorkspaceContext';
import { CARD_HOVER_SETTING, cardHoverEnabled, KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import type { KnowledgeCard, PreservedKnowledge } from '../../../shared/types/knowledge-cards';
import { QuestionCardEditor } from './QuestionCardEditor';
import { PracticeAnswer } from './PracticeAnswer';
import { PracticeHistoryPanel } from './PracticeHistoryPanel';
import { NoteHistory } from '../notes/NoteHistory';
import { CardDecksPanel } from './CardDecksPanel';
import { DictionariesPanel } from './DictionariesPanel';
import { PersonalCommentary } from './PersonalCommentary';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';

export function SavedCardsPanel({ onStartReview }: { onStartReview?: () => void }) {
  const { t, dir, books, openBookForReading } = useWorkspace();
  const removeWithUndo = useUndoFeedback();
  const [editing, setEditing] = useState<string | null>(null);
  const [practicing, setPracticing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [cards, setCards] = useState<KnowledgeCard[]>([]);
  const [preserved, setPreserved] = useState<PreservedKnowledge[]>([]);
  const [search, setSearch] = useState('');
  const [hover, setHover] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);
  const [dueCount, setDueCount] = useState(0);

  const refresh = useCallback(async () => {
    const request = ++requestSequence.current;
    setLoading(true);
    try {
      const [cardList, presList, queue] = await Promise.all([
        window.electronAPI.knowledgeCards.list({ search }),
        window.electronAPI.knowledgeCards.listPreserved(),
        window.electronAPI.knowledgeCards.reviewQueue().catch(() => null),
      ]);
      if (request !== requestSequence.current) return;
      setCards(cardList);
      setPreserved(presList);
      if (queue) setDueCount(queue.due);
      setFailed(false);
    } catch {
      if (request === requestSequence.current) setFailed(true);
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const load = () => void refresh();
    load();
    const handleNewCard = () => setCreating(true);
    window.addEventListener('baglib:new-card', handleNewCard);
    window.addEventListener(KNOWLEDGE_CARD_SAVED, load);
    window.addEventListener('baglib:srs-reviewed', load);
    return () => {
      requestSequence.current++;
      window.removeEventListener('baglib:new-card', handleNewCard);
      window.removeEventListener(KNOWLEDGE_CARD_SAVED, load);
      window.removeEventListener('baglib:srs-reviewed', load);
    };
  }, [refresh]);

  useEffect(() => {
    queueMicrotask(() => setHover(cardHoverEnabled()));
  }, []);

  const toggleHover = (enabled: boolean) => {
    setHover(enabled);
    try {
      localStorage.setItem(CARD_HOVER_SETTING, enabled ? 'on' : 'off');
    } catch {}
  };

  const act = async (action: () => Promise<unknown>) => {
    try {
      await action();
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
      await refresh();
    } catch {
      setFailed(true);
    }
  };

  return (
    <section data-saved-cards className="rounded-2xl border border-subtle bg-surface p-4 sm:p-6 space-y-5" dir={dir}>
      {/* Top Banner with Due Count and Review Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-canvas border border-subtle">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
              {t('savedCardsTitle')}
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-subtle font-sans text-muted font-normal">
                {cards.length}
              </span>
            </h3>
            <p className="text-xs text-muted">
              {dueCount > 0 ? (
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  {t('srsReviewDue', { count: dueCount })}
                </span>
              ) : (
                t('srsCompletedToday')
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onStartReview && (
            <Button
              variant={dueCount > 0 ? 'primary' : 'secondary'}
              size="sm"
              onClick={onStartReview}
              icon={<Sparkles className="size-3.5" />}
              data-start-review-button
            >
              {dueCount > 0 ? t('srsReviewDue', { count: dueCount }) : t('srsStartReview')}
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCreating(!creating)}
            icon={<Plus className="size-3.5" />}
          >
            {t('practiceNewQuestion')}
          </Button>

          <label className="flex items-center gap-2 text-xs text-muted ms-2 select-none">
            <input
              type="checkbox"
              checked={hover}
              onChange={(e) => toggleHover(e.target.checked)}
              className="rounded border-subtle text-primary"
            />
            {t('savedCardsHover')}
          </label>
        </div>
      </div>

      {/* Search Input */}
      <label className="flex items-center gap-2.5 rounded-xl border border-subtle bg-canvas px-3.5 py-2.5">
        <Search className="size-4 text-muted shrink-0" />
        <input
          value={search}
          onChange={(event) => { requestSequence.current++; setSearch(event.target.value); }}
          placeholder={t('savedCardsSearch')}
          aria-label={t('savedCardsSearch')}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none text-main placeholder:text-muted"
        />
      </label>

      {/* Error state */}
      {failed && (
        <p role="alert" className="text-xs text-danger font-medium p-2 rounded-lg bg-danger/10 border border-danger/20">
          {t('knowledgeCardFailed')}
        </p>
      )}

      {/* New Question Form */}
      {creating && (
        <QuestionCardEditor
          onSaved={() => {
            setCreating(false);
            void refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* Cards List */}
      {loading && <div role="status" aria-label={t('loading')} className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
      {!failed && !loading && cards.length === 0 && !creating && (
        <EmptyState
          icon={<Layers className="size-8 text-muted" />}
          title={t('savedCardsEmpty')}
          action={
            <Button variant="primary" size="sm" onClick={() => setCreating(true)} icon={<Plus className="size-3.5" />}>
              {t('practiceNewQuestion')}
            </Button>
          }
        />
      )}

      {cards.length > 0 && (
        <ul className="space-y-3">
          {/* eslint-disable-next-line react-hooks/refs -- contextActions stores event callbacks without invoking them during render. */}
          {cards.map((card) => (
            <ContextMenu as="li" items={contextActions('card', {
              edit: ['quran', 'hadith', 'poetry'].includes(card.sourceKind) ? undefined : () => setEditing(card.id), review: () => setPracticing(card.id),
              copy: () => navigator.clipboard.writeText(card.front + '\n\n' + card.back),
              srs: () => act(() => window.electronAPI.knowledgeCards.setMemorizing(card.id,true)),
              delete: () => { if(window.confirm(t('markDeleteConfirm')))return act(() => removeWithUndo(card.id, () => window.electronAPI.knowledgeCards.remove(card.id), refresh)); },
            },t)}
              key={card.id}
              data-saved-card={card.id}
              className="rounded-xl border border-subtle bg-canvas/60 p-4 space-y-3 hover:border-subtle/80 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <p
                    dir="auto"
                    className="font-reading text-base sm:text-lg leading-[2.2] font-medium text-main break-words"
                    style={{ fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)" }}
                  >
                    {card.front}
                  </p>

                  {card.sourceRef && (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        data-card-source={card.id}
                        className="inline-flex items-center gap-1.5 text-primary-text hover:underline"
                        onClick={() =>
                          void navigateStudyReference(
                            card.sourceRef!,
                            books,
                            openBookForReading,
                            (id, anchor) => openStudyNote({ id, anchor })
                          ).catch(() => setFailed(true))
                        }
                      >
                        <BookOpen className="size-3" />
                        <span>{t('practiceOpenSource')}</span>
                      </button>
                      {card.sourceLabel && (
                        <span dir="auto" className="text-muted">
                          · {card.sourceLabel}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={card.memorizing}
                    onClick={() =>
                      void act(() =>
                        window.electronAPI.knowledgeCards.setMemorizing(card.id, !card.memorizing)
                      )
                    }
                    title={t(card.memorizing ? 'knowledgeCardMemorizing' : 'knowledgeCardMemorize')}
                    aria-label={t(card.memorizing ? 'knowledgeCardMemorizing' : 'knowledgeCardMemorize')}
                    className={`rounded-lg p-2 hover:bg-surface transition-colors ${
                      card.memorizing ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'
                    }`}
                  >
                    <Repeat2 className="size-4" />
                  </button>
                </div>
              </div>

              {card.back && (
                <div className="border-t border-subtle/80 pt-3">
                  <p
                    dir="auto"
                    className="font-reading text-sm sm:text-base leading-[2.2] text-muted whitespace-pre-line line-clamp-4 break-words"
                    style={{ fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)" }}
                  >
                    {card.back}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-subtle/60">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPracticing(practicing === card.id ? null : card.id)}
                >
                  {t('practiceStart')}
                </Button>
                {!['quran', 'hadith', 'poetry'].includes(card.sourceKind) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(editing === card.id ? null : card.id)}
                  >
                    {t('practiceEdit')}
                  </Button>
                )}
              </div>

              {editing === card.id && (
                <div className="mt-3">
                  <QuestionCardEditor
                    key={`${card.id}-${card.cardRevision}`}
                    card={card}
                    onSaved={() => {
                      setEditing(null);
                      void refresh();
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              )}

              {practicing === card.id && (
                <div className="mt-3 p-3 rounded-xl bg-surface border border-subtle">
                  <PracticeAnswer key={`${card.id}-${card.cardRevision}`} card={card} />
                </div>
              )}

              <NoteHistory id={card.id} onChanged={() => void refresh()} />
            </ContextMenu>
          ))}
        </ul>
      )}

      {/* Auxiliary Panels */}
      <PracticeHistoryPanel />
      <CardDecksPanel />
      <DictionariesPanel />
      <PersonalCommentary />

      {/* Preserved Knowledge from deleted books */}
      {preserved.length > 0 && (
        <details data-preserved-knowledge className="border-t border-subtle pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-main hover:text-primary-text">
            {t('savedCardsPreserved', { count: preserved.length })}
          </summary>
          <ul className="mt-3 space-y-2">
            {preserved.map((item) => (
              <li key={item.id} className="rounded-xl border border-subtle p-3 bg-canvas/40">
                <p dir="auto" className="text-xs text-muted font-medium">
                  {item.bookTitle}
                </p>
                <p dir="auto" className="mt-1 text-sm leading-[2] whitespace-pre-line break-words text-main">
                  {item.text}
                </p>
                <NoteHistory id={item.id} onChanged={() => void refresh()} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
