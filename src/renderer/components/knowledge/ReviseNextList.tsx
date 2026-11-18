'use client';

/**
 * Baglib — "Revise next" (KEY-412): the rule-based suggestions, on the Dashboard and on the
 * empty review screen. Each item says why it is there and offers one action; it can be hidden
 * for a week. Everything is worked out locally by the main process.
 */

import React, { useEffect, useState } from 'react';
import { BookOpenCheck, Layers, Repeat, Sparkles, Users, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import { requestRevisionIntent } from '../../libs/revision-intent';
import { requestBookRevision } from './BookRevisionHost';
import type { Recommendation } from '../../../shared/revision-recommendations';
import type { TranslationKey } from '../../translations';

interface ReviseNextListProps {
  /** Inside the Notes view, review a deck in place instead of navigating. */
  onReviewDeck?: (deckId: string | null) => void;
  /** Show nothing at all when there are no suggestions (the review screen). */
  hideWhenEmpty?: boolean;
}

export function ReviseNextList({ onReviewDeck, hideWhenEmpty = false }: ReviseNextListProps) {
  const { t, dir, setViewMode } = useWorkspace();
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const api = window.electronAPI?.revisionRecommendations;
      if (!api) return;
      void api.list().then(
        result => {
          if (!alive) return;
          if (result.ok) {
            setItems(result.data);
            setError(false);
          } else {
            setError(true);
          }
        },
        () => { if (alive) setError(true); }
      );
    };
    load();
    window.addEventListener('baglib:srs-reviewed', load);
    window.addEventListener(KNOWLEDGE_CARD_SAVED, load);
    return () => {
      alive = false;
      window.removeEventListener('baglib:srs-reviewed', load);
      window.removeEventListener(KNOWLEDGE_CARD_SAVED, load);
    };
  }, []);

  const review = (deckId: string | null) => {
    if (onReviewDeck) return onReviewDeck(deckId);
    setViewMode('notes');
    requestRevisionIntent({ kind: 'review', deckId });
  };

  const dismiss = async (id: string) => {
    setItems(current => current?.filter(item => item.id !== id) ?? null);
    await window.electronAPI.revisionRecommendations.dismiss(id).catch(() => null);
  };

  if (hideWhenEmpty && (!items || !items.length)) return null;

  const deck = (item: Recommendation) => item.deckName || t('reviseNextAllDecks');
  const describe = (item: Recommendation): string => {
    switch (item.kind) {
      case 'backlog':
        return item.weak
          ? t('reviseNextBacklogWeak', { deck: deck(item), count: item.count, weak: item.weak, suggested: item.suggested ?? item.count })
          : t('reviseNextBacklog', { deck: deck(item), count: item.count, suggested: item.suggested ?? item.count });
      case 'leeches':
        return t('reviseNextLeeches', { count: item.count });
      case 'finished-book':
        return t('reviseNextFinished', { title: item.title ?? '', count: item.count });
      case 'narrators':
        return t('reviseNextNarrators', { count: item.count });
      case 'book-questions':
        return t('reviseNextQuestions', { title: item.title ?? '', count: item.count });
      case 'new-waiting':
        return t('reviseNextNewWaiting', { deck: deck(item), count: item.count });
    }
  };

  const action = (item: Recommendation): { label: TranslationKey; icon: React.ReactNode; run: () => void } => {
    switch (item.kind) {
      case 'finished-book':
        return { label: 'reviseNextMakeDeck', icon: <BookOpenCheck className="size-3.5" />, run: () => requestBookRevision({ mode: 'deck', workId: item.workId }) };
      case 'book-questions':
        return { label: 'reviseNextAskAi', icon: <Sparkles className="size-3.5" />, run: () => requestBookRevision({ mode: 'questions', workId: item.workId, title: item.title }) };
      case 'narrators':
        return {
          label: 'reviseNextNarratorDeck',
          icon: <Users className="size-3.5" />,
          run: () => {
            setViewMode('notes');
            requestRevisionIntent({ kind: 'narrators' });
          },
        };
      default:
        return { label: 'reviseNextReview', icon: item.kind === 'new-waiting' ? <Layers className="size-3.5" /> : <Repeat className="size-3.5" />, run: () => review(item.deckId ?? null) };
    }
  };

  return (
    <section dir={dir} data-revise-next className="min-w-0 space-y-3 rounded-xl border border-subtle bg-surface p-4 text-start">
      <header className="space-y-0.5">
        <h2 className="text-lg font-bold text-main">{t('reviseNextTitle')}</h2>
        <p className="text-xs text-muted">{t('reviseNextHint')}</p>
      </header>
      {error && <p role="alert" className="text-sm text-danger">{t('reviseNextError')}</p>}
      {items && !items.length && !error && <p role="status" className="text-sm text-muted">{t('reviseNextEmpty')}</p>}
      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map(item => {
            const act = action(item);
            return (
              <li key={item.id} data-revise-next-item={item.kind} data-revise-next-id={item.id} className="flex min-w-0 items-start gap-2 rounded-lg border border-subtle bg-canvas p-2.5">
                <p className="min-w-0 flex-1 break-words text-sm leading-relaxed text-main">
                  {describe(item)}
                </p>
                <Button type="button" variant="secondary" size="sm" data-revise-next-action onClick={act.run} icon={act.icon}>
                  {t(act.label)}
                </Button>
                <button
                  type="button"
                  data-revise-next-dismiss
                  onClick={() => void dismiss(item.id)}
                  aria-label={t('reviseNextDismiss')}
                  title={t('reviseNextDismiss')}
                  className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-main"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
