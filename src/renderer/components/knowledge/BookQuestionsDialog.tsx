'use client';

/**
 * Baglib — AI revision questions from a book's highlights and comments (KEY-398).
 * The AI's suggestions are shown here only; nothing is saved until the user accepts questions
 * (ADR-013). Every suggestion is labelled as AI-generated, and shows the book's own text verbatim
 * with its page.
 */

import React, { useEffect, useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';
import { useRemoteConsent } from '../ai/useRemoteConsent';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import type { BookQuestionSuggestion } from '../../../shared/book-questions';
import type { TranslationKey } from '../../translations';

type Choice = 'accept' | 'reject' | null;

const ERRORS: Record<string, TranslationKey> = {
  'no-annotations': 'bookQuestionsNoAnnotations',
  'ai-disabled': 'bookQuestionsAiDisabled',
  'permission-denied': 'bookQuestionsNeedConsent',
  'invalid-output': 'bookQuestionsBadOutput',
  busy: 'bookQuestionsBusy',
};

export function BookQuestionsDialog({ workId, title, onClose }: { workId: string; title: string; onClose: () => void }) {
  const { t, dir, lang } = useWorkspace();
  const consent = useRemoteConsent();
  const [allowRemote, setAllowRemote] = useState<boolean | null>(null);
  const [kinds, setKinds] = useState<Array<'qa' | 'choice'>>(['qa', 'choice']);
  const [available, setAvailable] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<BookQuestionSuggestion[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remoteOk = consent.local || (allowRemote ?? consent.allowed);

  useEffect(() => {
    let live = true;
    void window.electronAPI.bookRevision.sources(workId).then(r => {
      if (live) setAvailable(r.ok ? r.data.count : 0);
    });
    return () => {
      live = false;
    };
  }, [workId]);

  const fail = (code: string) => setError(t(ERRORS[code] ?? 'bookQuestionsFailed'));

  const generate = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const fresh = await consent.check();
      const allowed = fresh.local || remoteOk;
      if (!fresh.local && !allowed) return fail('permission-denied');
      const r = await window.electronAPI.bookRevision.generate({ workId, language: lang === 'ar' ? 'ar' : 'en', allowRemote: !fresh.local && allowed, kinds });
      if (!r.ok) return fail(r.error);
      setSuggestions(r.data.suggestions);
      setChoices(r.data.suggestions.map(() => null));
      if (!r.data.suggestions.length) setError(t('bookQuestionsNone'));
    } finally {
      setBusy(false);
    }
  };

  const accepted = suggestions.filter((_, i) => choices[i] === 'accept');
  const save = async () => {
    if (!accepted.length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await window.electronAPI.bookRevision.accept({
        workId,
        language: lang === 'ar' ? 'ar' : 'en',
        questions: accepted.map(({ annotationId, kind, question, answer, options, correctIndex }) => ({ annotationId, kind, question, answer, ...(kind === 'choice' ? { options, correctIndex } : {}) })),
      });
      if (!r.ok) return fail(r.error);
      setMessage(t('bookQuestionsAdded', { count: r.data.added }));
      // Accepted ones are saved; rejected ones are dropped. What's left undecided stays on screen.
      const keep = suggestions.map((s, i) => ({ s, c: choices[i] })).filter(x => x.c === null);
      setSuggestions(keep.map(x => x.s));
      setChoices(keep.map(() => null));
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } finally {
      setBusy(false);
    }
  };

  const toggleKind = (kind: 'qa' | 'choice') => setKinds(k => (k.includes(kind) ? k.filter(x => x !== kind) : [...k, kind]));
  const setChoice = (i: number, c: Choice) => setChoices(list => list.map((v, j) => (j === i ? (v === c ? null : c) : v)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="book-questions-title">
      <div dir={dir} data-book-questions-dialog className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-2xl border border-subtle bg-surface p-5 shadow-2xl">
        <header className="flex items-center justify-between gap-3">
          <h3 id="book-questions-title" className="font-bold text-main">{t('bookQuestionsTitle')}</h3>
          <button type="button" onClick={onClose} aria-label={t('close')} data-close-book-questions className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main">
            <X className="size-4" />
          </button>
        </header>
        <p dir="auto" className="rounded-lg bg-canvas px-3 py-2 text-sm text-main">{title}</p>
        <p className="text-xs text-muted">{available === null ? '…' : t('bookQuestionsAvailable', { count: available })}</p>

        <fieldset className="flex flex-wrap gap-4 text-sm text-main">
          <legend className="sr-only">{t('bookQuestionsKinds')}</legend>
          <label className="flex items-center gap-2"><input type="checkbox" data-book-questions-kind="qa" checked={kinds.includes('qa')} onChange={() => toggleKind('qa')} />{t('bookQuestionsKindQa')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" data-book-questions-kind="choice" checked={kinds.includes('choice')} onChange={() => toggleKind('choice')} />{t('bookQuestionsKindChoice')}</label>
        </fieldset>
        {!consent.local && (
          <label className="flex items-start gap-2 text-sm text-main">
            <input type="checkbox" className="mt-1.5" checked={remoteOk} onChange={e => { setAllowRemote(e.target.checked); void (e.target.checked ? consent.allow() : consent.revoke()); }} />
            {t('assistantAllowRemote')}
          </label>
        )}
        <Button type="button" disabled={busy || !kinds.length || !available} data-book-questions-generate onClick={() => void generate()} icon={<Sparkles className="size-4" />}>
          {busy && !suggestions.length ? t('bookQuestionsGenerating') : t('bookQuestionsGenerate')}
        </Button>

        {suggestions.length > 0 && (
          <ol className="space-y-3" data-book-questions-list>
            {suggestions.map((s, i) => (
              <li key={`${s.annotationId}-${i}`} data-book-question={i} data-choice={choices[i] ?? ''} className={`space-y-2 rounded-xl border p-3 ${choices[i] === 'accept' ? 'border-primary/60 bg-primary/5' : choices[i] === 'reject' ? 'border-subtle opacity-50' : 'border-subtle'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">{t('bookQuestionsAiBadge')} · {t(s.kind === 'choice' ? 'bookQuestionsKindChoice' : 'bookQuestionsKindQa')}</span>
                  <div className="flex gap-1">
                    <button type="button" data-book-question-accept={i} aria-pressed={choices[i] === 'accept'} onClick={() => setChoice(i, 'accept')} className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1 text-xs aria-pressed:bg-primary aria-pressed:text-primary-contrast"><Check className="size-3" />{t('bookQuestionsAccept')}</button>
                    <button type="button" data-book-question-reject={i} aria-pressed={choices[i] === 'reject'} onClick={() => setChoice(i, 'reject')} className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1 text-xs aria-pressed:bg-canvas"><X className="size-3" />{t('bookQuestionsReject')}</button>
                  </div>
                </div>
                <p dir="auto" className="font-semibold text-main">{s.question}</p>
                {s.kind === 'choice' && s.options && (
                  <ol className="list-inside list-decimal text-sm text-main">
                    {s.options.map((o, j) => <li key={j} dir="auto" className={j === s.correctIndex ? 'font-semibold text-primary-text' : ''}>{o}</li>)}
                  </ol>
                )}
                <p dir="auto" className="text-sm text-main">{s.answer}</p>
                {s.quote && (
                  <blockquote dir="auto" className="border-s-2 border-subtle ps-3 text-sm text-muted">
                    {s.quote}
                    {s.page !== null && <span className="ms-2 text-xs">({t('bookQuestionPage', { page: s.page })})</span>}
                  </blockquote>
                )}
              </li>
            ))}
          </ol>
        )}
        {suggestions.length > 0 && (
          <Button type="button" disabled={busy || !accepted.length} data-book-questions-save onClick={() => void save()} icon={<Check className="size-4" />}>
            {t('bookQuestionsSave', { count: accepted.length })}
          </Button>
        )}
        {message && <p role="status" data-book-questions-message className="text-sm text-main">{message}</p>}
        {error && <p role="alert" data-book-questions-error className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
