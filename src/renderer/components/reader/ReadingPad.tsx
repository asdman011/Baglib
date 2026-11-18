'use client';

/**
 * Baglib — Reading pad ("لوح القراءة", KEY-414): paste Arabic or English text and read it with every
 * word clickable. A click shows the word's top dictionary results with "Add to revision"; Ctrl/Alt
 * (or ⌘) + click, or the popover button, highlights the word everywhere in the text. Lines made of
 * two hemistichs are laid out as a qasidah, two columns per verse. Only the current text and its
 * highlights are kept (app setting `dictionary.readingPad.v1`, at most 50,000 characters).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookA, BookOpenText, Highlighter, Layers, Loader2, Pencil, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Modal } from '../ui/Modal';
import type { AggregateDictionaryLookupResult } from '../../../shared/types/dictionary';
import {
  MAX_PAD_TEXT,
  OPEN_DICTIONARY_EVENT,
  cleanPad,
  layoutPad,
  padTokens,
  revisionMeaning,
  suggestionKey,
  toggleHighlight,
  type ReadingPadState,
} from '../../../shared/dictionary-features';

const SAVE_DELAY_MS = 500;
const isArabic = (text: string) => /[؀-ۿ]/u.test(text);

interface Popover {
  word: string;
  x: number;
  y: number;
  result: AggregateDictionaryLookupResult | null;
  status: string | null;
  failed: boolean;
}

export function ReadingPad({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, dir, lang } = useWorkspace();
  const [pad, setPad] = useState<ReadingPadState>({ text: '', highlights: [] });
  const [editing, setEditing] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void window.electronAPI?.dictionaryFeatures?.pad().then(r => {
      if (!alive) return;
      const state = r.ok ? r.data : { text: '', highlights: [] };
      setPad(state);
      setEditing(!state.text.trim());
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const persist = (next: ReadingPadState, delay: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void window.electronAPI?.dictionaryFeatures?.savePad(next).then(r => setSaveFailed(!r.ok)).catch(() => setSaveFailed(true));
    }, delay);
  };
  const update = (next: ReadingPadState, delay = SAVE_DELAY_MS) => {
    const clean = cleanPad(next);
    setPad(clean);
    persist(clean, delay);
  };

  const layout = useMemo(() => layoutPad(pad.text), [pad.text]);
  const highlighted = useMemo(() => new Set(pad.highlights), [pad.highlights]);

  const lookUp = (word: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const state: Popover = { word, x: rect.left + rect.width / 2, y: rect.bottom + 6, result: null, status: null, failed: false };
    setPopover(state);
    const api = window.electronAPI;
    if (!api?.dictionaryLookup) return;
    void api
      .dictionaryLookup(word, { lang: isArabic(word) ? 'ar' : 'en', uiLang: lang === 'en' ? 'en' : 'ar', includeWikipedia: false })
      .then(result => setPopover(current => (current && current.word === word ? { ...current, result } : current)))
      .catch(() => setPopover(current => (current && current.word === word ? { ...current, result: { query: word, candidates: [], entries: [], durationMs: 0 } } : current)));
    void api.dictionaryFeatures?.addHistory({ word }).catch(() => undefined);
  };

  const onWord = (event: React.MouseEvent<HTMLElement>, word: string) => {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      update(toggleHighlight(pad, word), 0);
      return;
    }
    lookUp(word, event.currentTarget);
  };

  const addToRevision = async () => {
    const entry = popover?.result?.entries[0];
    if (!popover || !entry) return;
    try {
      const r = await window.electronAPI.lexiconDecks.quickAdd({ word: entry.headword || popover.word, meaning: revisionMeaning(entry.definitionText || entry.definitionHtml), source: entry.dictTitle, kind: 'dictionary', deckId: null, reversed: true, language: lang === 'en' ? 'en' : 'ar' });
      if (!r.ok) throw new Error(r.error);
      window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'));
      setPopover(current => (current ? { ...current, status: t(r.data.duplicate ? 'quickAddAlreadyInDeck' : 'quickAddSavedToDeck', { deck: r.data.deckName }), failed: false } : current));
    } catch {
      setPopover(current => (current ? { ...current, status: t('lexiconDeckFailed'), failed: true } : current));
    }
  };

  const words = (text: string) =>
    padTokens(text).map((token, index) =>
      token.word ? (
        <span
          key={index}
          role="button"
          tabIndex={0}
          data-pad-word={token.text}
          data-pad-highlighted={highlighted.has(suggestionKey(token.text)) || undefined}
          onClick={event => onWord(event, token.text)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              lookUp(token.text, event.currentTarget);
            }
          }}
          className={`cursor-pointer rounded px-0.5 hover:bg-pale-sky-500/15 focus-visible:outline-2 focus-visible:outline-pale-sky-500 ${highlighted.has(suggestionKey(token.text)) ? 'bg-amber-400/40 text-main' : ''}`}
        >
          {token.text}
        </span>
      ) : (
        <React.Fragment key={index}>{token.text}</React.Fragment>
      )
    );

  if (!open) return null;
  const textDir = isArabic(pad.text) ? 'rtl' : 'ltr';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Modal asChild open onClose={onClose} label={t('readingPadTitle')}>
        <div dir={dir} data-reading-pad className="flex h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-subtle bg-surface text-main shadow-2xl">
          <header className="flex items-center gap-3 border-b border-subtle bg-canvas/50 p-4">
            <BookOpenText className="size-5 text-pale-sky-500" />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">{t('readingPadTitle')}</h2>
              <p className="text-xs text-muted">{t('readingPadHint')}</p>
            </div>
            <button type="button" data-reading-pad-mode onClick={() => { setEditing(v => !v); setPopover(null); }} disabled={!pad.text.trim() && editing} className="inline-flex items-center gap-1.5 rounded-xl border border-subtle px-3 py-1.5 text-xs font-semibold hover:bg-canvas disabled:opacity-50">
              {editing ? <BookOpenText className="size-3.5" /> : <Pencil className="size-3.5" />}
              <span>{t(editing ? 'readingPadRead' : 'readingPadEdit')}</span>
            </button>
            <button type="button" data-reading-pad-close onClick={onClose} aria-label={t('dictionaryClose')} className="rounded-xl p-2 text-muted hover:bg-canvas hover:text-main">
              <X className="size-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5" onScroll={() => setPopover(null)}>
            {!loaded ? (
              <p role="status" className="text-sm text-muted">{t('dictionarySearching')}</p>
            ) : editing ? (
              <div className="flex h-full flex-col gap-2">
                <textarea
                  dir="auto"
                  data-reading-pad-text
                  value={pad.text}
                  maxLength={MAX_PAD_TEXT}
                  onChange={event => update({ ...pad, text: event.target.value })}
                  placeholder={t('readingPadPlaceholder')}
                  aria-label={t('readingPadTitle')}
                  className="min-h-0 flex-1 resize-none rounded-2xl border border-subtle bg-canvas p-4 font-reading text-lg leading-loose text-main"
                />
                <p className="text-end text-[11px] text-muted" data-reading-pad-count>
                  {t('readingPadCount', { count: pad.text.length.toLocaleString(lang), max: MAX_PAD_TEXT.toLocaleString(lang) })}
                </p>
              </div>
            ) : (
              <article dir={textDir} lang={textDir === 'rtl' ? 'ar' : 'en'} data-reading-pad-view data-qasidah={layout.qasidah || undefined} className="mx-auto max-w-3xl select-text font-reading text-xl leading-[2.4]">
                {layout.lines.map((line, index) =>
                  line.kind === 'blank' ? (
                    <div key={index} className="h-4" />
                  ) : line.kind === 'verse' && layout.qasidah ? (
                    <div key={index} data-reading-pad-verse className="grid grid-cols-2 gap-x-10 py-1">
                      <p data-hemistich="sadr" className="text-justify [text-align-last:justify]">{words(line.sadr)}</p>
                      <p data-hemistich="ajuz" className="text-justify [text-align-last:justify]">{words(line.ajuz)}</p>
                    </div>
                  ) : (
                    <p key={index} className="py-1">{words(line.kind === 'verse' ? `${line.sadr} ${line.ajuz}` : line.text)}</p>
                  )
                )}
              </article>
            )}
            {saveFailed && <p role="alert" className="mt-2 text-xs text-danger">{t('readingPadSaveFailed')}</p>}
          </div>

          {popover && !editing && (
            <div
              role="dialog"
              aria-label={popover.word}
              data-reading-pad-popover={popover.word}
              style={{ insetInlineStart: 'auto', left: Math.max(16, Math.min(popover.x - 176, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 368)), top: Math.min(popover.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 300) }}
              className="fixed z-[60] max-h-72 w-88 overflow-y-auto rounded-2xl border border-subtle bg-surface p-3 text-sm shadow-2xl"
            >
              <div className="mb-2 flex items-center gap-2">
                <span dir="auto" className="flex-1 font-reading text-lg font-bold">{popover.word}</span>
                <button type="button" data-reading-pad-highlight onClick={() => update(toggleHighlight(pad, popover.word), 0)} aria-pressed={highlighted.has(suggestionKey(popover.word))} title={t('readingPadHighlight')} aria-label={t('readingPadHighlight')} className={`rounded-lg p-1.5 hover:bg-canvas ${highlighted.has(suggestionKey(popover.word)) ? 'text-amber-500' : 'text-muted'}`}>
                  <Highlighter className="size-4" />
                </button>
                <button type="button" data-reading-pad-open-dictionary onClick={() => { const word = popover.word; setPopover(null); window.dispatchEvent(new CustomEvent(OPEN_DICTIONARY_EVENT, { detail: word })); }} title={t('readingPadOpenDictionary')} aria-label={t('readingPadOpenDictionary')} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main">
                  <BookA className="size-4" />
                </button>
                <button type="button" onClick={() => setPopover(null)} aria-label={t('dictionaryClose')} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main">
                  <X className="size-4" />
                </button>
              </div>
              {!popover.result ? (
                <p role="status" className="flex items-center gap-2 text-xs text-muted"><Loader2 className="size-3.5 animate-spin" />{t('dictionarySearching')}</p>
              ) : popover.result.entries.length === 0 ? (
                <p className="text-xs text-muted">{t('dictionaryNoMatches')}</p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {popover.result.entries.slice(0, 3).map((entry, index) => (
                      <li key={index} data-reading-pad-result={entry.dictId} className="rounded-xl border border-subtle bg-canvas/60 p-2">
                        <p className="mb-1 text-[11px] font-semibold text-muted" dir="auto">{entry.headword} · {entry.dictTitle}</p>
                        <p dir="auto" className="line-clamp-4 text-xs leading-relaxed">{entry.definitionText}</p>
                      </li>
                    ))}
                  </ul>
                  <button type="button" data-reading-pad-add onClick={() => void addToRevision()} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1 text-xs font-semibold hover:bg-canvas">
                    <Layers className="size-3" />
                    <span>{t('quickAddToRevision')}</span>
                  </button>
                </>
              )}
              {popover.status && <p role={popover.failed ? 'alert' : 'status'} data-reading-pad-status className={`mt-2 text-xs ${popover.failed ? 'text-danger' : 'text-emerald-600 dark:text-emerald-400'}`}>{popover.status}</p>}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
