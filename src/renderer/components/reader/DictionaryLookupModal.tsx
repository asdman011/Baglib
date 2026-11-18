'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  BookA,
  BookOpenText,
  History,
  Trash2,
  Globe,
  X,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  Sparkles,
  BookOpen,
  Layers,
  Search,
} from 'lucide-react';
import type {
  AggregateDictionaryLookupResult,
  DictionaryLookupCandidate,
} from '../../../shared/types/dictionary';
import type { DeckTreeNode } from '../../../shared/srs';
import { TranslationKey } from '../../translations';
import { Modal } from '../ui/Modal';
import {
  OPEN_READING_PAD_EVENT,
  revisionMeaning,
  splitLookupWords,
  type LookupHistoryEntry,
} from '../../../shared/dictionary-features';

const SUGGEST_DELAY_MS = 150;
const lookupLang = (word: string, bookLang: string) => (bookLang === 'العربية' || bookLang === 'ar' || /[\u0600-\u06FF]/.test(word) ? 'ar' : 'en');
const uiLanguage = (): 'ar' | 'en' => (typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'ar');
const EMPTY_RESULT = (word: string): AggregateDictionaryLookupResult => ({ query: word, candidates: [], entries: [], wikipedia: null, durationMs: 0 });

interface DictionaryLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  word: string;
  bookLang?: string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const DictionaryLookupModal: React.FC<DictionaryLookupModalProps> = ({
  isOpen,
  onClose,
  word,
  bookLang = 'ar',
  t,
}) => {
  // KEY-414: several words at once (one tab each), suggestions while typing, dictionary chips,
  // and the lookup history when the search is empty.
  const [query, setQuery] = useState<string>(word);
  const [tabs, setTabs] = useState<string[]>(() => splitLookupWords(word));
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<Record<string, AggregateDictionaryLookupResult>>({});
  const [dictFilter, setDictFilter] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestActive, setSuggestActive] = useState(-1);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [history, setHistory] = useState<LookupHistoryEntry[]>([]);
  const pending = useRef(new Set<string>());
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const currentWord = tabs[active] ?? '';
  const result = currentWord ? results[currentWord] ?? null : null;
  const isLoading = Boolean(currentWord) && !result;
  // KEY-401: make a revision card from the Wikipedia summary.
  const [wikiCard, setWikiCard] = useState<{ busy: boolean; message: string | null; failed: boolean }>({ busy: false, message: null, failed: false });
  const makeWikipediaCard = async (title: string, lang: string) => {
    setWikiCard({ busy: true, message: null, failed: false });
    const uiLang = typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar' : 'en';
    try {
      const r = await window.electronAPI.personDecks.wikipediaCard({ title, lang, language: uiLang });
      if (!r.ok) throw new Error(r.error);
      setWikiCard({ busy: false, message: t(r.data.created ? 'wikipediaCardCreated' : 'wikipediaCardExists', { title: r.data.title }), failed: false });
      window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'));
    } catch {
      setWikiCard({ busy: false, message: t('wikipediaCardFailed'), failed: true });
    }
  };
  // KEY-400: quick-add word ↔ meaning from dictionary or lookup to a chosen revision deck (remembers last deck).
  const [decks, setDecks] = useState<Array<{ id: string; fullName: string }>>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [quickAddStatus, setQuickAddStatus] = useState<Record<string, { busy: boolean; message: string | null; duplicate?: boolean; failed?: boolean }>>({});

  useEffect(() => {
    if (!isOpen || !window.electronAPI?.knowledgeCards?.deckTree) return;
    let alive = true;
    void Promise.all([
      window.electronAPI.knowledgeCards.deckTree().catch(() => []),
      window.electronAPI.lexiconDecks?.lastDeck().catch(() => null),
    ]).then(([tree, lastRes]) => {
      if (!alive) return;
      const flat: Array<{ id: string; fullName: string }> = [];
      const walk = (list: DeckTreeNode[]) => {
        for (const n of list) {
          if (n.kind === 'normal') {
            flat.push({ id: n.id, fullName: n.fullName });
            walk(n.children);
          }
        }
      };
      if (Array.isArray(tree)) walk(tree);
      setDecks(flat);
      const lastId = lastRes && lastRes.ok ? lastRes.data : null;
      if (lastId && flat.some(d => d.id === lastId)) {
        setSelectedDeckId(lastId);
      } else if (flat[0]) {
        setSelectedDeckId(prev => (prev && flat.some(d => d.id === prev) ? prev : flat[0].id));
      }
    });
    return () => {
      alive = false;
    };
  }, [isOpen]);

  const handleQuickAdd = async (key: string, targetWord: string, meaningText: string, sourceTitle: string) => {
    setQuickAddStatus(prev => ({ ...prev, [key]: { busy: true, message: null } }));
    const uiLang = typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar' : 'en';
    try {
      const r = await window.electronAPI.lexiconDecks.quickAdd({
        word: targetWord,
        meaning: revisionMeaning(meaningText),
        source: sourceTitle,
        kind: 'dictionary',
        deckId: selectedDeckId || null,
        reversed: true,
        language: uiLang,
      });
      if (!r.ok) throw new Error(r.error);
      setSelectedDeckId(r.data.deckId);
      setQuickAddStatus(prev => ({
        ...prev,
        [key]: {
          busy: false,
          duplicate: r.data.duplicate,
          message: t(r.data.duplicate ? 'quickAddAlreadyInDeck' : 'quickAddSavedToDeck', { deck: r.data.deckName }),
        },
      }));
      window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'));
    } catch {
      setQuickAddStatus(prev => ({
        ...prev,
        [key]: { busy: false, failed: true, message: t('lexiconDeckFailed') },
      }));
    }
  };
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const [previousLookupWord, setPreviousLookupWord] = useState<readonly unknown[] | null>(null);
  const inputsLookupWord = [isOpen, word];
  if (previousLookupWord === null || inputsLookupWord.some((value, index) => !Object.is(value, previousLookupWord[index]))) {
    setPreviousLookupWord(inputsLookupWord);
    if (isOpen) {
      setQuery(word);
      setTabs(splitLookupWords(word));
      setActive(0);
      setDictFilter(null);
    }
  }

  /** Looks up the active tab's word once; the result is kept while the window is open. */
  useEffect(() => {
    if (!isOpen || !currentWord || results[currentWord] || pending.current.has(currentWord)) return;
    const target = currentWord;
    pending.current.add(target);
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    const lookup = api?.dictionaryLookup
      ? api.dictionaryLookup(target, { lang: lookupLang(target, bookLang), uiLang: uiLanguage(), includeWikipedia: true })
      : Promise.resolve(EMPTY_RESULT(target));
    void lookup
      .then(data => {
        setResults(previous => ({ ...previous, [target]: data ?? EMPTY_RESULT(target) }));
        const first = data?.entries?.[0]?.dictTitle;
        return api?.dictionaryFeatures?.addHistory({ word: target, ...(first ? { dictionary: first } : {}) });
      })
      .then(saved => { if (saved && saved.ok) setHistory(saved.data); })
      .catch(error => {
        console.warn('[DictionaryLookupModal] Lookup failed:', error);
        setResults(previous => ({ ...previous, [target]: EMPTY_RESULT(target) }));
      })
      .finally(() => pending.current.delete(target));
  }, [isOpen, currentWord, results, bookLang]);

  useEffect(() => {
    if (!isOpen || !window.electronAPI?.dictionaryFeatures) return;
    let alive = true;
    void window.electronAPI.dictionaryFeatures.history().then(r => { if (alive && r.ok) setHistory(r.data); }).catch(() => undefined);
    return () => { alive = false; };
  }, [isOpen]);

  /** Suggestions for the word being typed (the last one), about 150 ms after typing stops. */
  useEffect(() => {
    if (!isOpen || !suggestOpen) return;
    const last = query.split(/[\s,،;؛]+/u).pop()?.trim() ?? '';
    const timer = setTimeout(() => {
      if (!last || !window.electronAPI?.dictionaryFeatures) { setSuggestions([]); return; }
      void window.electronAPI.dictionaryFeatures.suggest(last).then(r => {
        setSuggestions(r.ok ? r.data : []);
        setSuggestActive(-1);
      }).catch(() => setSuggestions([]));
    }, SUGGEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isOpen, query, suggestOpen]);

  /** Starts a new search: each word gets a tab. */
  function search(text: string) {
    setQuery(text);
    setTabs(splitLookupWords(text));
    setActive(0);
    setDictFilter(null);
    setSuggestOpen(false);
    setSuggestions([]);
  }

  /** Opens a word in a tab of its own (root family, candidates), or switches to it if it is open. */
  function openTab(target: string) {
    const clean = splitLookupWords(target)[0];
    if (!clean) return;
    const at = tabs.indexOf(clean);
    setDictFilter(null);
    if (at >= 0) { setActive(at); return; }
    const next = [...tabs, clean].slice(-12);
    setTabs(next);
    setActive(next.length - 1);
  }

  const pickSuggestion = (picked: string) => {
    const parts = query.split(/([\s,،;؛]+)/u);
    parts[parts.length - 1] = picked;
    search(parts.join(''));
  };

  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    // The tab bar's direction (the UI's), not the tab's: an Arabic word makes its own tab dir=rtl.
    const rtl = getComputedStyle(event.currentTarget.parentElement ?? event.currentTarget).direction === 'rtl';
    const forward = (event.key === 'ArrowRight') !== rtl;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (forward ? 1 : -1) + tabs.length) % tabs.length;
    setActive(next);
    setDictFilter(null);
    tabRefs.current[next]?.focus();
  };

  const removeHistory = (target: string) => {
    void window.electronAPI?.dictionaryFeatures?.removeHistory(target).then(r => { if (r.ok) setHistory(r.data); });
  };
  const clearHistory = () => {
    void window.electronAPI?.dictionaryFeatures?.clearHistory().then(r => { if (r.ok) setHistory(r.data); });
  };

  if (!isOpen) return null;

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // ignore
    }
  };

  const getCandidateTypeBadge = (type: DictionaryLookupCandidate['type']) => {
    switch (type) {
      case 'arabic_root':
        return { label: t('dictionaryArabicRoot'), bg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' };
      case 'stem':
        return { label: t('dictionaryStem'), bg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30' };
      case 'stripped_diacritics':
        return { label: t('dictionaryDiacriticsStripped'), bg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' };
      case 'exact':
        return { label: t('dictionaryExact'), bg: 'bg-pale-sky-500/15 text-pale-sky-600 dark:text-pale-sky-400 border-pale-sky-500/30' };
      default:
        return { label: type, bg: 'bg-surface border-subtle text-muted' };
    }
  };

  return (
    <div



      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <Modal asChild open={true} onClose={onClose} label={t('dictionaryLookupTitle')}><div data-dictionary-lookup-modal className="bg-surface text-main border border-subtle w-full max-w-2xl max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-subtle bg-canvas/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-400 flex items-center justify-center border border-pale-sky-500/20">
              <BookA className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-main font-serif" dir="auto">
                  {currentWord || t('dictionaryLookupTitle')}
                </h2>
                {result && result.durationMs !== undefined && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    {t('dictionarySub10ms', { ms: result.durationMs })}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                {t('dictionaryLookupTitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            data-open-reading-pad
            onClick={() => { onClose(); window.dispatchEvent(new CustomEvent(OPEN_READING_PAD_EVENT)); }}
            title={t('readingPadOpen')}
            className="ms-auto me-1 inline-flex items-center gap-1.5 rounded-xl border border-subtle px-2.5 py-1.5 text-xs font-semibold text-main hover:bg-canvas cursor-pointer"
          >
            <BookOpenText className="w-3.5 h-3.5" />
            <span>{t('readingPadTitle')}</span>
          </button>
          <button
            type="button"
            data-dictionary-close
            onClick={onClose}
            aria-label={t('dictionaryClose')}
            className="p-2 rounded-xl text-muted hover:text-main hover:bg-canvas transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input Bar: several words make several tabs; suggestions while typing (KEY-414) */}
        <form
          onSubmit={e => {
            e.preventDefault();
            if (suggestOpen && suggestActive >= 0 && suggestions[suggestActive]) pickSuggestion(suggestions[suggestActive]);
            else search(query);
          }}
          className="relative flex items-center gap-2 px-4 py-2.5 border-b border-subtle bg-canvas/30"
        >
          <Search className="size-4 text-muted shrink-0" />
          <input
            type="text"
            dir="auto"
            data-dictionary-search-input
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestOpen && suggestions.length > 0}
            aria-controls="dictionary-suggestions"
            aria-activedescendant={suggestOpen && suggestActive >= 0 ? `dictionary-suggestion-${suggestActive}` : undefined}
            value={query}
            onChange={e => { setQuery(e.target.value); setSuggestOpen(true); }}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
            onKeyDown={e => {
              if (!suggestOpen || suggestions.length === 0) return;
              if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestActive(i => (i + 1) % suggestions.length); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestActive(i => (i <= 0 ? suggestions.length - 1 : i - 1)); }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setSuggestOpen(false); }
            }}
            placeholder={t('dictionaryMultiWordPlaceholder')}
            aria-label={t('dictionaryLookupTitle')}
            className="flex-1 bg-transparent text-xs text-main outline-none"
          />
          <button
            type="submit"
            data-dictionary-search-btn
            className="rounded-lg border border-subtle bg-surface px-2.5 py-1 text-xs font-medium text-main hover:bg-canvas cursor-pointer"
          >
            {t('search')}
          </button>
          {suggestOpen && suggestions.length > 0 && (
            <ul id="dictionary-suggestions" role="listbox" aria-label={t('dictionarySuggestions')} data-dictionary-suggestions className="absolute inset-x-4 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-subtle bg-surface p-1 shadow-xl">
              {suggestions.map((item, index) => (
                <li
                  key={item}
                  id={`dictionary-suggestion-${index}`}
                  role="option"
                  aria-selected={index === suggestActive}
                  data-dictionary-suggestion={item}
                  dir="auto"
                  onMouseDown={e => { e.preventDefault(); pickSuggestion(item); }}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-reading ${index === suggestActive ? 'bg-pale-sky-500/15 text-main' : 'text-main hover:bg-canvas'}`}
                >
                  {item}
                </li>
              ))}
            </ul>
          )}
        </form>

        {tabs.length > 1 && (
          <div role="tablist" aria-label={t('dictionaryWordTabs')} data-dictionary-tabs className="flex gap-1 overflow-x-auto border-b border-subtle bg-canvas/20 px-4 py-2">
            {tabs.map((tab, index) => (
              <button
                key={tab}
                ref={el => { tabRefs.current[index] = el; }}
                type="button"
                role="tab"
                aria-selected={index === active}
                tabIndex={index === active ? 0 : -1}
                data-dictionary-tab={tab}
                dir="auto"
                onClick={() => { setActive(index); setDictFilter(null); }}
                onKeyDown={e => onTabKey(e, index)}
                className={`shrink-0 rounded-xl border px-3 py-1 text-sm font-reading ${index === active ? 'border-pale-sky-500 bg-pale-sky-500/15 text-main font-bold' : 'border-subtle text-muted hover:text-main'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!currentWord ? (
            <section data-dictionary-history className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted">
                <span className="flex items-center gap-1.5"><History className="w-3.5 h-3.5 text-pale-sky-500" />{t('dictionaryHistory')}</span>
                {history.length > 0 && <button type="button" data-dictionary-history-clear onClick={clearHistory} className="rounded-lg px-2 py-0.5 font-medium text-muted hover:text-main hover:bg-canvas cursor-pointer">{t('dictionaryHistoryClear')}</button>}
              </div>
              {history.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted">{t('dictionaryHistoryEmpty')}</p>
              ) : (
                <ul className="space-y-1">
                  {history.map(item => (
                    <li key={item.word} data-dictionary-history-item={item.word} className="group flex items-center gap-2 rounded-xl border border-subtle bg-canvas/50 px-3 py-1.5">
                      <button type="button" data-dictionary-history-open={item.word} onClick={() => search(item.word)} className="min-w-0 flex-1 text-start cursor-pointer">
                        <span dir="auto" className="font-reading text-sm font-bold text-main">{item.word}</span>
                        {item.dictionary && <span dir="auto" className="ms-2 text-[11px] text-muted">{item.dictionary}</span>}
                      </button>
                      <time dateTime={item.at} className="shrink-0 text-[11px] text-muted">{new Date(item.at).toLocaleString(uiLanguage(), { dateStyle: 'short', timeStyle: 'short' })}</time>
                      <button type="button" data-dictionary-history-remove={item.word} onClick={() => removeHistory(item.word)} aria-label={t('dictionaryHistoryRemove', { word: item.word })} title={t('dictionaryHistoryRemove', { word: item.word })} className="shrink-0 rounded-lg p-1 text-muted opacity-0 hover:text-main group-hover:opacity-100 focus:opacity-100 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted" role="status">
              <Loader2 className="w-8 h-8 animate-spin text-pale-sky-500" />
              <p className="text-xs font-medium">{t('dictionarySearching')}</p>
            </div>
          ) : (
            <>
              {/* Morphology Candidates & Arabic Roots */}
              {result && result.candidates && result.candidates.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted">
                    <Layers className="w-3.5 h-3.5 text-pale-sky-500" />
                    <span>{t('dictionaryCandidates')}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.candidates.slice(0, 7).map((c, i) => {
                      const badge = getCandidateTypeBadge(c.type);
                      const isSelected = currentWord === c.token;
                      return (
                        <button
                          key={i}
                          onClick={() => openTab(c.token)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 cursor-pointer ${
                            isSelected
                              ? 'bg-pale-sky-500 text-white border-pale-sky-600 shadow-xs scale-105'
                              : `${badge.bg} hover:scale-102`
                          }`}
                        >
                          <span className="font-serif">{c.token}</span>
                          <span className="text-[10px] opacity-75">({badge.label})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Local Dictionary Entries */}
              {decks.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-subtle bg-canvas/50 px-3 py-2 text-xs">
                  <span className="font-semibold text-muted">{t('quickAddTargetDeck')}:</span>
                  <select
                    value={selectedDeckId}
                    data-quick-add-deck-select
                    aria-label={t('quickAddTargetDeck')}
                    onChange={e => setSelectedDeckId(e.target.value)}
                    className="rounded-lg border border-subtle bg-surface px-2 py-1 text-xs text-main"
                  >
                    {decks.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {result && result.entries && result.entries.length > 1 && (
                <div role="group" aria-label={t('dictionaryQuickSwitch')} data-dictionary-chips className="flex flex-wrap gap-1.5">
                  <button type="button" data-dictionary-chip="" aria-pressed={dictFilter === null} onClick={() => setDictFilter(null)} className={`rounded-full border px-2.5 py-0.5 text-xs ${dictFilter === null ? 'border-pale-sky-500 bg-pale-sky-500/15 text-main' : 'border-subtle text-muted hover:text-main'}`}>
                    {t('dictionaryAllDictionaries')}
                  </button>
                  {[...new Map(result.entries.map(entry => [entry.dictId, entry.dictTitle])).entries()].map(([id, title]) => (
                    <button key={id} type="button" data-dictionary-chip={id} aria-pressed={dictFilter === id} onClick={() => setDictFilter(id)} dir="auto" className={`rounded-full border px-2.5 py-0.5 text-xs ${dictFilter === id ? 'border-pale-sky-500 bg-pale-sky-500/15 text-main' : 'border-subtle text-muted hover:text-main'}`}>
                      {title}
                    </button>
                  ))}
                </div>
              )}
              {result && result.entries && result.entries.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-muted border-b border-subtle pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-pale-sky-500" />
                      {t('dictionaryLocalDefinitions')}
                    </span>
                    <span className="text-[11px] font-mono">
                      {t('dictionaryEntriesCount', { count: result.entries.filter(entry => !dictFilter || entry.dictId === dictFilter).length })}
                    </span>
                  </div>

                  {result.entries.map((entry, idx) => {
                    if (dictFilter && entry.dictId !== dictFilter) return null;
                    const entryKey = `${currentWord}:entry-${idx}`;
                    const qStatus = quickAddStatus[entryKey];
                    const fullSourceTitle = entry.attribution
                      ? `${entry.dictTitle}, ${entry.attribution}`
                      : entry.dictTitle;
                    return (
                    <div
                      key={idx}
                      data-dictionary-entry={entry.dictId}
                      className="p-4 rounded-2xl bg-canvas/60 border border-subtle space-y-2.5 transition-all hover:border-pale-sky-500/30"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              dir="auto"
                              className="font-bold text-main font-reading text-base leading-relaxed"
                              style={{ fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)" }}
                            >
                              {entry.headword}
                            </span>
                            <span
                              dir="auto"
                              data-entry-dict-title={entry.dictId}
                              className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-surface border border-subtle text-muted"
                            >
                              {fullSourceTitle}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            data-dictionary-quick-add={idx}
                            disabled={qStatus?.busy}
                            onClick={() => void handleQuickAdd(entryKey, entry.headword, entry.definitionText || entry.definitionHtml, entry.dictTitle)}
                            className="inline-flex items-center gap-1 rounded-lg border border-subtle bg-surface px-2 py-1 text-xs font-semibold text-main hover:bg-canvas disabled:opacity-50 cursor-pointer"
                          >
                            <Layers className="w-3 h-3" />
                            <span>{t('quickAddToRevision')}</span>
                          </button>
                          <button
                            onClick={() => handleCopy(entry.definitionText, idx)}
                            title={t('dictionaryCopyDefinition')}
                            className="p-1 rounded-lg text-muted hover:text-main hover:bg-surface transition-colors cursor-pointer"
                           aria-label={t('dictionaryCopyDefinition')}>
                            {copiedIndex === idx ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {qStatus?.message && (
                        <p
                          role={qStatus.failed ? 'alert' : 'status'}
                          data-dictionary-quick-add-status={idx}
                          className={`text-xs ${qStatus.failed ? 'text-danger' : 'text-emerald-600 dark:text-emerald-400'}`}
                        >
                          {qStatus.message}
                        </p>
                      )}

                      {/* Render formatted definition HTML */}
                      <div
                        className="text-sm text-main leading-[2.1] font-reading prose prose-sm dark:prose-invert max-w-none break-words"
                        style={{ fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)" }}
                        dir={entry.dictId === 'arlex-direct' || entry.dictId === 'arlex-hanswehr' || entry.dictId === 'arlex-lane' ? 'auto' : /[\u0600-\u06FF]/.test(entry.definitionText) ? 'rtl' : 'ltr'}
                        dangerouslySetInnerHTML={{ __html: entry.definitionHtml }}
                      />

                      {/* Root family ("Other words from this root") for Hans Wehr, Lane, and al-Ghani */}
                      {entry.rootFamily && entry.rootFamily.members.length > 1 && (
                        <details
                          data-entry-root-family={entry.dictId}
                          className="pt-2 border-t border-subtle/70 space-y-1.5"
                        >
                          <summary className="cursor-pointer text-[11px] font-semibold text-muted">
                            {t('arlexOtherWordsFromRoot', {
                              root: entry.rootFamily.rootWord || entry.headword,
                            })}
                          </summary>
                          <div className="flex flex-wrap gap-1.5 pt-1.5">
                            {entry.rootFamily.members.slice(0, 24).map((member) => (
                              <button
                                key={`${member.id}-${member.word}`}
                                type="button"
                                data-root-family-word={member.word}
                                onClick={() => openTab(member.word)}
                                className={`px-2 py-0.5 rounded-lg text-xs border transition-colors cursor-pointer ${
                                  member.isRoot
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-bold'
                                    : 'bg-surface border-subtle text-main hover:bg-canvas'
                                }`}
                                dir="rtl"
                                lang="ar"
                                style={{ fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)" }}
                              >
                                {member.word}
                              </button>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                  })}
                </div>
              ) : (
                <div className="py-4 px-3 rounded-2xl bg-canvas/40 border border-subtle text-center text-xs text-muted">
                  {t('dictionaryNoMatches')}
                </div>
              )}

              {/* Online Wikipedia Summary Card */}
              {result?.wikipedia && (
                <div className="space-y-2 pt-2 border-t border-subtle">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted">
                    <Globe className="w-3.5 h-3.5 text-pale-sky-500" />
                    <span>{t('dictionaryWikipediaCard')}</span>
                  </div>

                  <div
                    className="rounded-2xl border border-subtle bg-canvas/80 p-4 space-y-2 relative overflow-hidden"
                    dir={result.wikipedia.dir}
                  >
                    {result.wikipedia.thumbnailUrl && (
                      <div
                        className="absolute inset-0 opacity-10 bg-cover bg-center pointer-events-none"
                        style={{ backgroundImage: `url("${result.wikipedia.thumbnailUrl}")` }}
                      />
                    )}

                    <div className="flex items-start justify-between gap-3 relative z-10">
                      <div>
                        <h3 className="font-bold text-sm text-main font-serif">
                          {result.wikipedia.displayTitle}
                        </h3>
                        {result.wikipedia.description && (
                          <p className="text-[11px] text-muted font-medium">
                            {result.wikipedia.description}
                          </p>
                        )}
                      </div>
                      {result.wikipedia.thumbnailUrl && (
                        <img
                          src={result.wikipedia.thumbnailUrl}
                          alt={result.wikipedia.title}
                          className="w-14 h-14 object-cover rounded-xl border border-subtle shrink-0 shadow-xs"
                        />
                      )}
                    </div>

                    <p className="text-xs text-main leading-relaxed relative z-10">
                      {result.wikipedia.extract}
                    </p>

                    <div className="pt-2 flex flex-wrap items-center justify-between gap-2 relative z-10">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          data-wikipedia-make-card
                          disabled={wikiCard.busy}
                          onClick={() => void makeWikipediaCard(result.wikipedia!.title, result.wikipedia!.lang)}
                          className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1 text-xs font-semibold text-main hover:bg-canvas disabled:opacity-50 cursor-pointer"
                        >
                          <Layers className="w-3 h-3" />
                          <span>{t('wikipediaMakeCard')}</span>
                        </button>
                        <button
                          type="button"
                          data-wikipedia-quick-add
                          disabled={quickAddStatus['wiki']?.busy}
                          onClick={() => void handleQuickAdd('wiki', result.wikipedia!.title, result.wikipedia!.extract, `${t('dictionaryWikipediaCard')} (${result.wikipedia!.lang})`)}
                          className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1 text-xs font-semibold text-main hover:bg-canvas disabled:opacity-50 cursor-pointer"
                        >
                          <Layers className="w-3 h-3" />
                          <span>{t('quickAddToRevision')}</span>
                        </button>
                      </div>
                      <a
                        href={result.wikipedia.articleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-pale-sky-600 dark:text-pale-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>{t('dictionaryReadOnWikipedia')}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    {wikiCard.message && <p role={wikiCard.failed ? 'alert' : 'status'} data-wikipedia-card-message className={`text-xs relative z-10 ${wikiCard.failed ? 'text-danger' : 'text-main'}`}>{wikiCard.message}</p>}
                    {quickAddStatus['wiki']?.message && <p role={quickAddStatus['wiki']?.failed ? 'alert' : 'status'} data-wikipedia-quick-add-message className={`text-xs relative z-10 ${quickAddStatus['wiki']?.failed ? 'text-danger' : 'text-main'}`}>{quickAddStatus['wiki']?.message}</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-subtle bg-canvas/50 flex items-center justify-between text-xs">
          <span className="text-[11px] text-muted flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5 text-pale-sky-500" />
            {t('dictionarySelectFormat')}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-pale-sky-500 text-white font-bold hover:bg-pale-sky-600 transition-colors cursor-pointer text-xs"
          >
            {t('dictionaryClose')}
          </button>
        </div>
      </div></Modal>
    </div>
  );
};
