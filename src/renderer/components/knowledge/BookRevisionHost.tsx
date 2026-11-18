'use client';

/**
 * Baglib — book revision host (KEY-398), mounted once in the app layout.
 * - "Time to revise!": when a book is marked finished, a small prompt offers to make a revision
 *   deck from its highlights and comments. It can be dismissed or turned off.
 * - Opens the book/category deck dialog and the AI questions dialog on a `baglib:book-revision`
 *   window event ({ mode: 'deck' | 'questions', workId?, title? }), from the library menu and the
 *   deck manager.
 */

import React, { useEffect, useState } from 'react';
import { BookOpenCheck, Layers, Sparkles, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import { BookQuestionsDialog } from './BookQuestionsDialog';
import type { Category } from '../../../shared/types/category';

export const BOOK_REVISION_EVENT = 'baglib:book-revision';
export type BookRevisionRequest = { mode: 'deck' | 'questions'; workId?: string; title?: string };

export function requestBookRevision(detail: BookRevisionRequest): void {
  window.dispatchEvent(new CustomEvent(BOOK_REVISION_EVENT, { detail }));
}

function BookDeckDialog({ initialWorkId, onClose, onQuestions }: { initialWorkId?: string; onClose: () => void; onQuestions: (workId: string, title: string) => void }) {
  const { t, dir, lang, books } = useWorkspace();
  const [mode, setMode] = useState<'book' | 'category'>('book');
  const [workId, setWorkId] = useState(initialWorkId ?? '');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ workId: string; title: string } | null>(null);

  useEffect(() => {
    void window.electronAPI.categories.getAll().then((list: Category[]) => setCategories(Array.isArray(list) ? list : []));
  }, []);

  const titleOf = (id: string) => books.find(b => b.id === id)?.title ?? '';
  const create = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === 'book') {
        const r = await window.electronAPI.bookRevision.bookDeck(workId);
        if (!r.ok) return setError(t('bookDeckFailed'));
        setMessage(t('bookDeckCreated', { title: titleOf(workId), count: r.data.added }));
        setMade({ workId, title: titleOf(workId) });
      } else {
        const r = await window.electronAPI.bookRevision.categoryDeck(categoryId, lang === 'ar' ? 'ar' : 'en');
        if (!r.ok) return setError(t(r.error === 'no-books' ? 'bookDeckNoBooks' : 'bookDeckFailed'));
        setMessage(t('categoryDeckCreated', { books: r.data.books, count: r.data.added }));
      }
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } finally {
      setBusy(false);
    }
  };

  const tab = (value: 'book' | 'category', label: string) => (
    <button type="button" role="tab" aria-selected={mode === value} data-book-deck-mode={value} onClick={() => setMode(value)} className={`rounded-lg px-3 py-1.5 text-sm ${mode === value ? 'bg-primary font-semibold text-primary-contrast' : 'text-muted hover:text-main'}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="book-deck-title">
      <div dir={dir} data-book-deck-dialog className="w-full max-w-lg space-y-4 rounded-2xl border border-subtle bg-surface p-5 shadow-2xl">
        <header className="flex items-center justify-between gap-3">
          <h3 id="book-deck-title" className="font-bold text-main">{t('bookDeckTitle')}</h3>
          <button type="button" onClick={onClose} aria-label={t('close')} data-close-book-deck className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main"><X className="size-4" /></button>
        </header>
        <div role="tablist" className="inline-flex gap-1 rounded-xl border border-subtle p-1">
          {tab('book', t('bookDeckModeBook'))}
          {tab('category', t('bookDeckModeCategory'))}
        </div>
        {mode === 'book' ? (
          <label className="block space-y-1 text-xs text-muted">
            <span>{t('bookDeckPickBook')}</span>
            <select value={workId} data-book-deck-book onChange={e => setWorkId(e.target.value)} className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main">
              <option value="">—</option>
              {books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </label>
        ) : (
          <label className="block space-y-1 text-xs text-muted">
            <span>{t('bookDeckPickCategory')}</span>
            <select value={categoryId} data-book-deck-category onChange={e => setCategoryId(e.target.value)} className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main">
              <option value="">—</option>
              {categories.map(c => <option key={c.id} value={c.id}>{lang === 'ar' ? c.nameAr || c.nameEn : c.nameEn || c.nameAr}</option>)}
            </select>
            <span className="block">{t('bookDeckCategoryHint')}</span>
          </label>
        )}
        <p className="text-xs text-muted">{t('bookDeckHint')}</p>
        <Button type="button" disabled={busy || (mode === 'book' ? !workId : !categoryId)} data-book-deck-create onClick={() => void create()} icon={<Layers className="size-4" />}>
          {t('bookDeckCreate')}
        </Button>
        {message && <p role="status" data-book-deck-message className="text-sm text-main">{message}</p>}
        {made && (
          <Button type="button" variant="secondary" data-book-deck-questions onClick={() => onQuestions(made.workId, made.title)} icon={<Sparkles className="size-4" />}>
            {t('bookQuestionsOpen')}
          </Button>
        )}
        {error && <p role="alert" data-book-deck-error className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}

export function BookRevisionHost() {
  const { t, dir } = useWorkspace();
  const [finished, setFinished] = useState<{ workId: string; title: string } | null>(null);
  const [finishedState, setFinishedState] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  const [deckDialog, setDeckDialog] = useState<{ workId?: string } | null>(null);
  const [questions, setQuestions] = useState<{ workId: string; title: string } | null>(null);

  useEffect(() => {
    const off = window.electronAPI?.bookRevision?.onBookFinished(event => {
      setFinished(event);
      setFinishedState({ busy: false, message: null });
    });
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<BookRevisionRequest>).detail;
      if (!detail) return;
      if (detail.mode === 'questions' && detail.workId) setQuestions({ workId: detail.workId, title: detail.title ?? '' });
      else setDeckDialog({ workId: detail.workId });
    };
    window.addEventListener(BOOK_REVISION_EVENT, onRequest);
    return () => {
      off?.();
      window.removeEventListener(BOOK_REVISION_EVENT, onRequest);
    };
  }, []);

  const makeDeck = async () => {
    if (!finished) return;
    setFinishedState({ busy: true, message: null });
    const r = await window.electronAPI.bookRevision.bookDeck(finished.workId);
    setFinishedState({ busy: false, message: r.ok ? t('bookDeckCreated', { title: finished.title, count: r.data.added }) : t('bookDeckFailed') });
    if (r.ok) window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
  };

  return (
    <>
      {finished && (
        <div dir={dir} role="status" data-book-finished-prompt className="fixed bottom-14 end-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)] space-y-2 rounded-2xl border border-subtle bg-surface-raised p-4 text-sm shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-start gap-2 font-semibold text-main"><BookOpenCheck className="mt-0.5 size-4 shrink-0 text-primary-text" /><span dir="auto">{t('bookFinishedPrompt', { title: finished.title })}</span></p>
            <button type="button" aria-label={t('close')} data-book-finished-close onClick={() => setFinished(null)} className="rounded p-1 text-muted hover:text-main"><X className="size-3.5" /></button>
          </div>
          <p className="text-xs text-muted">{t('bookFinishedHint')}</p>
          {finishedState.message ? (
            <>
              <p data-book-finished-message className="text-xs text-main">{finishedState.message}</p>
              <button type="button" data-book-finished-questions onClick={() => { setQuestions(finished); setFinished(null); }} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-text hover:underline"><Sparkles className="size-3.5" />{t('bookQuestionsOpen')}</button>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={finishedState.busy} data-book-finished-deck onClick={() => void makeDeck()} icon={<Layers className="size-3.5" />}>{t('bookFinishedMakeDeck')}</Button>
              <button type="button" data-book-finished-later onClick={() => setFinished(null)} className="text-xs text-muted hover:text-main">{t('bookFinishedLater')}</button>
              <button type="button" data-book-finished-off onClick={() => { void window.electronAPI.bookRevision.finishedPrompt(false); setFinished(null); }} className="text-xs text-muted hover:text-main">{t('bookFinishedOff')}</button>
            </div>
          )}
        </div>
      )}
      {deckDialog && <BookDeckDialog initialWorkId={deckDialog.workId} onClose={() => setDeckDialog(null)} onQuestions={(workId, title) => { setDeckDialog(null); setQuestions({ workId, title }); }} />}
      {questions && <BookQuestionsDialog workId={questions.workId} title={questions.title} onClose={() => setQuestions(null)} />}
    </>
  );
}
