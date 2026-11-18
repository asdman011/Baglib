'use client';

/**
 * Baglib — Lexicon vocabulary, translation cards, Quranic root decks, and tafsir cards dialog (KEY-400).
 *
 * - Tab 1 ("lexicon"): Make a vocabulary deck from an installed dictionary (with prefix or pasted
 *   word list filter, max count up to 5000, new or existing deck, and automatic Basic (and reversed)
 *   translation cards when source_lang !== target_lang).
 * - Tab 2 ("roots"): Make a Quranic root deck (ishtiqaq) for a sura or the N most frequent roots.
 * - Tab 3 ("tafsir"): Make a tafsir deck from the user's highlights and comments in tafsir texts.
 */

import React, { useEffect, useState } from 'react';
import { BookA, BookOpen, GitBranch, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import type { DictionaryItem } from '../../../shared/types/dictionary';
import type { DeckTreeNode } from '../../../shared/srs';
import { SURAH_NAMES_AR, SURAH_NAMES_EN } from '../../../shared/quran-wird';

export type LexiconDialogMode = 'lexicon' | 'roots' | 'tafsir';

interface TafsirWorkOption {
  id: string;
  title: string;
  annotationCount: number;
  isTafsirCategory: boolean;
}

export function LexiconDeckDialog({
  initialMode = 'lexicon',
  initialSurah = 0,
  onClose,
}: {
  initialMode?: LexiconDialogMode;
  initialSurah?: number;
  onClose: () => void;
}) {
  const { t, dir, lang } = useWorkspace();
  const uiLang: 'ar' | 'en' = lang === 'ar' ? 'ar' : 'en';

  const [mode, setMode] = useState<LexiconDialogMode>(initialMode);
  const [dicts, setDicts] = useState<DictionaryItem[]>([]);
  const [decks, setDecks] = useState<Array<{ id: string; fullName: string }>>([]);
  const [tafsirWorks, setTafsirWorks] = useState<TafsirWorkOption[]>([]);

  // Lexicon tab state
  const [dictId, setDictId] = useState('');
  const [filterMode, setFilterMode] = useState<'prefix' | 'list'>('prefix');
  const [prefix, setPrefix] = useState('');
  const [wordListText, setWordListText] = useState('');
  const [limit, setLimit] = useState(200);
  const [targetDeckMode, setTargetDeckMode] = useState<'new' | 'existing'>('new');
  const [newDeckName, setNewDeckName] = useState(() => t('lexiconDefaultDeckName'));
  const [existingDeckId, setExistingDeckId] = useState('');
  const [reversedOverride, setReversedOverride] = useState<boolean | null>(null);

  // Roots tab state
  const [rootDeckName, setRootDeckName] = useState(() => t('quranRootDefaultDeckName'));
  const [rootSurah, setRootSurah] = useState<number>(initialSurah);
  const [rootLimit, setRootLimit] = useState<number>(30);

  // Tafsir tab state
  const [tafsirDeckName, setTafsirDeckName] = useState(() => t('tafsirDefaultDeckName'));
  const [tafsirWorkId, setTafsirWorkId] = useState<string>('');
  const [includeQuranAnnotations, setIncludeQuranAnnotations] = useState<boolean>(true);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.electronAPI.dictionaryList().then((list: DictionaryItem[]) => {
      const items = Array.isArray(list) ? list : [];
      setDicts(items);
      if (items[0]) {
        setDictId(items[0].id);
        setNewDeckName(items[0].title);
      }
    });
    void window.electronAPI.knowledgeCards.deckTree().then((nodes: DeckTreeNode[]) => {
      const flat: Array<{ id: string; fullName: string }> = [];
      const walk = (list: DeckTreeNode[]) => {
        for (const n of list) {
          if (n.kind === 'normal') {
            flat.push({ id: n.id, fullName: n.fullName });
            walk(n.children);
          }
        }
      };
      if (Array.isArray(nodes)) walk(nodes);
      setDecks(flat);
      if (flat[0]) setExistingDeckId(flat[0].id);
    });
    void window.electronAPI.lexiconDecks?.tafsirWorks().then(res => {
      if (res?.ok) setTafsirWorks(res.data);
    });
  }, []);

  const selectedDict = dicts.find(d => d.id === dictId) ?? null;
  const autoReversed = Boolean(
    selectedDict?.sourceLang &&
      selectedDict?.targetLang &&
      selectedDict.sourceLang.trim().toLowerCase() !== selectedDict.targetLang.trim().toLowerCase()
  );
  const effectiveReversed = reversedOverride !== null ? reversedOverride : autoReversed;

  const handleImportLexicon = async () => {
    if (!dictId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const boundedLimit = Math.max(1, Math.min(5000, Number(limit) || 200));
      const r = await window.electronAPI.lexiconDecks.importDictionary({
        dictId,
        deckId: targetDeckMode === 'existing' ? existingDeckId || null : null,
        deckName: targetDeckMode === 'new' ? newDeckName.trim() || selectedDict?.title || t('lexiconDefaultDeckName') : null,
        filterMode,
        prefix: filterMode === 'prefix' ? prefix.trim() : '',
        wordList: filterMode === 'list' ? wordListText : [],
        limit: boundedLimit,
        reversed: effectiveReversed,
        language: uiLang,
      });
      if (!r.ok) {
        setError(
          t(
            r.error === 'no-entries'
              ? 'lexiconDeckNoEntries'
              : r.error === 'dictionary-not-found'
                ? 'lexiconDeckNoDicts'
                : 'lexiconDeckFailed'
          )
        );
        return;
      }
      setMessage(
        t('lexiconDeckCreated', {
          added: r.data.added,
          skipped: r.data.skipped,
          total: r.data.totalMatched,
        })
      );
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateRootDeck = async () => {
    if (!rootDeckName.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await window.electronAPI.lexiconDecks.rootDeck({
        deckName: rootDeckName.trim(),
        surah: rootSurah > 0 ? rootSurah : null,
        limit: Math.max(1, Math.min(500, Number(rootLimit) || 30)),
        language: uiLang,
      });
      if (!r.ok) {
        setError(t(r.error === 'no-roots' || r.error === 'missing-resource' ? 'quranRootDeckMissing' : 'lexiconDeckFailed'));
        return;
      }
      setMessage(
        t('quranRootDeckCreated', {
          name: rootDeckName.trim(),
          roots: r.data.roots,
          added: r.data.added,
        })
      );
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTafsirDeck = async () => {
    if (!tafsirDeckName.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await window.electronAPI.lexiconDecks.tafsirDeck({
        deckName: tafsirDeckName.trim(),
        workId: tafsirWorkId || null,
        includeQuranAnnotations,
        language: uiLang,
      });
      if (!r.ok) {
        setError(t(r.error === 'no-tafsir-highlights' ? 'tafsirDeckEmpty' : 'lexiconDeckFailed'));
        return;
      }
      setMessage(
        t('tafsirDeckCreated', {
          name: tafsirDeckName.trim(),
          total: r.data.total,
          added: r.data.added,
        })
      );
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } finally {
      setBusy(false);
    }
  };

  const tabButton = (id: LexiconDialogMode, label: string, Icon: React.ComponentType<{ className?: string }>) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === id}
      data-lexicon-tab={id}
      onClick={() => {
        setMode(id);
        setMessage(null);
        setError(null);
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
        mode === id ? 'bg-primary text-primary-contrast' : 'text-muted hover:text-main'
      }`}
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lexicon-deck-title"
    >
      <div
        dir={dir}
        data-lexicon-deck-dialog
        className="w-full max-w-lg space-y-4 rounded-2xl border border-subtle bg-surface p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <header className="flex items-center justify-between gap-3">
          <h3 id="lexicon-deck-title" className="font-bold text-main">
            {t('lexiconDeckTitle')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            data-close-lexicon-deck
            className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main"
          >
            <X className="size-4" />
          </button>
        </header>

        <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border border-subtle bg-canvas/50 p-1">
          {tabButton('lexicon', t('lexiconTabVocabulary'), BookA)}
          {tabButton('roots', t('lexiconTabRoots'), GitBranch)}
          {tabButton('tafsir', t('lexiconTabTafsir'), BookOpen)}
        </div>

        {mode === 'lexicon' && (
          <div className="space-y-3" data-lexicon-tab-panel="lexicon">
            <p className="text-xs text-muted">{t('lexiconDeckHint')}</p>

            {dicts.length === 0 ? (
              <p role="status" data-lexicon-no-dicts className="rounded-lg border border-subtle bg-canvas p-3 text-xs text-muted">
                {t('lexiconDeckNoDicts')}
              </p>
            ) : (
              <>
                <label className="block space-y-1 text-xs text-muted">
                  <span>{t('lexiconPickDictionary')}</span>
                  <select
                    value={dictId}
                    data-lexicon-dict-select
                    onChange={e => {
                      const nextId = e.target.value;
                      setDictId(nextId);
                      setReversedOverride(null);
                      const d = dicts.find(item => item.id === nextId);
                      if (d) setNewDeckName(d.title);
                    }}
                    className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main"
                  >
                    {dicts.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.title} ({d.entryCount})
                        {d.sourceLang && d.targetLang ? ` · ${d.sourceLang}→${d.targetLang}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1 text-xs text-muted">
                    <span>{t('lexiconFilterMode')}</span>
                    <select
                      value={filterMode}
                      data-lexicon-filter-mode
                      onChange={e => setFilterMode(e.target.value === 'list' ? 'list' : 'prefix')}
                      className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main"
                    >
                      <option value="prefix">{t('lexiconFilterPrefix')}</option>
                      <option value="list">{t('lexiconFilterWordList')}</option>
                    </select>
                  </label>

                  <label className="block space-y-1 text-xs text-muted">
                    <span>{t('lexiconMaxEntries')}</span>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={limit}
                      data-lexicon-limit-input
                      onChange={e => setLimit(Math.max(1, Math.min(5000, Number(e.target.value) || 200)))}
                      className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main"
                    />
                  </label>
                </div>

                {filterMode === 'prefix' ? (
                  <label className="block space-y-1 text-xs text-muted">
                    <span>{t('lexiconPrefixLabel')}</span>
                    <input
                      dir="auto"
                      value={prefix}
                      data-lexicon-prefix-input
                      onChange={e => setPrefix(e.target.value)}
                      placeholder={t('lexiconPrefixPlaceholder')}
                      className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main"
                    />
                  </label>
                ) : (
                  <label className="block space-y-1 text-xs text-muted">
                    <span>{t('lexiconWordListLabel')}</span>
                    <textarea
                      dir="auto"
                      rows={3}
                      value={wordListText}
                      data-lexicon-wordlist-input
                      onChange={e => setWordListText(e.target.value)}
                      placeholder={t('lexiconWordListPlaceholder')}
                      className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main"
                    />
                  </label>
                )}

                <div className="space-y-2 rounded-xl border border-subtle bg-canvas/50 p-3">
                  <div className="flex items-center gap-4 text-xs">
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="lexicon-target-deck"
                        checked={targetDeckMode === 'new'}
                        data-lexicon-target-new
                        onChange={() => setTargetDeckMode('new')}
                      />
                      <span>{t('lexiconTargetNewDeck')}</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="lexicon-target-deck"
                        checked={targetDeckMode === 'existing'}
                        data-lexicon-target-existing
                        onChange={() => setTargetDeckMode('existing')}
                      />
                      <span>{t('lexiconTargetExistingDeck')}</span>
                    </label>
                  </div>

                  {targetDeckMode === 'new' ? (
                    <input
                      dir="auto"
                      value={newDeckName}
                      data-lexicon-deck-name
                      onChange={e => setNewDeckName(e.target.value)}
                      placeholder={t('deckNamePlaceholder')}
                      className="w-full rounded-lg border border-subtle bg-surface px-2 py-1.5 text-sm text-main"
                    />
                  ) : (
                    <select
                      value={existingDeckId}
                      data-lexicon-existing-deck
                      onChange={e => setExistingDeckId(e.target.value)}
                      className="w-full rounded-lg border border-subtle bg-surface px-2 py-1.5 text-sm text-main"
                    >
                      {decks.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.fullName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <label className="flex items-center gap-2 text-xs text-main">
                  <input
                    type="checkbox"
                    checked={effectiveReversed}
                    data-lexicon-reversed-checkbox
                    onChange={e => setReversedOverride(e.target.checked)}
                  />
                  <span>{t('lexiconReversedCards')}</span>
                </label>

                <Button
                  type="button"
                  disabled={busy || !dictId || (targetDeckMode === 'new' ? !newDeckName.trim() : !existingDeckId)}
                  data-lexicon-import-submit
                  onClick={() => void handleImportLexicon()}
                  icon={<BookA className="size-4" />}
                >
                  {t('lexiconImportBtn')}
                </Button>
              </>
            )}
          </div>
        )}

        {mode === 'roots' && (
          <div className="space-y-3" data-lexicon-tab-panel="roots">
            <p className="text-xs text-muted">{t('quranRootDeckHint')}</p>

            <label className="block space-y-1 text-xs text-muted">
              <span>{t('sunnahDeckName')}</span>
              <input
                dir="auto"
                value={rootDeckName}
                data-root-deck-name
                onChange={e => setRootDeckName(e.target.value)}
                className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1 text-xs text-muted">
                <span>{t('quranFrequencySurah')}</span>
                <select
                  value={rootSurah}
                  data-root-deck-surah
                  onChange={e => setRootSurah(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main"
                >
                  <option value={0}>{t('quranFrequencyAll')}</option>
                  {(uiLang === 'ar' ? SURAH_NAMES_AR : SURAH_NAMES_EN).map((name, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {idx + 1}. {name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1 text-xs text-muted">
                <span>{t('quranRootDeckLimit')}</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={rootLimit}
                  data-root-deck-limit
                  onChange={e => setRootLimit(Math.max(1, Math.min(500, Number(e.target.value) || 30)))}
                  className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main"
                />
              </label>
            </div>

            <Button
              type="button"
              disabled={busy || !rootDeckName.trim()}
              data-root-deck-submit
              onClick={() => void handleCreateRootDeck()}
              icon={<GitBranch className="size-4" />}
            >
              {t('quranRootDeckCreateBtn')}
            </Button>
          </div>
        )}

        {mode === 'tafsir' && (
          <div className="space-y-3" data-lexicon-tab-panel="tafsir">
            <p className="text-xs text-muted">{t('tafsirDeckHint')}</p>

            <label className="block space-y-1 text-xs text-muted">
              <span>{t('sunnahDeckName')}</span>
              <input
                dir="auto"
                value={tafsirDeckName}
                data-tafsir-deck-name
                onChange={e => setTafsirDeckName(e.target.value)}
                className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main"
              />
            </label>

            <label className="block space-y-1 text-xs text-muted">
              <span>{t('tafsirPickSource')}</span>
              <select
                value={tafsirWorkId}
                data-tafsir-work-select
                onChange={e => setTafsirWorkId(e.target.value)}
                className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main"
              >
                <option value="">{t('tafsirAllWorks')}</option>
                {tafsirWorks.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.title} ({w.annotationCount})
                  </option>
                ))}
              </select>
            </label>

            {!tafsirWorkId && (
              <label className="flex items-center gap-2 text-xs text-main">
                <input
                  type="checkbox"
                  checked={includeQuranAnnotations}
                  data-tafsir-include-quran
                  onChange={e => setIncludeQuranAnnotations(e.target.checked)}
                />
                <span>{t('tafsirIncludeQuranNotes')}</span>
              </label>
            )}

            <Button
              type="button"
              disabled={busy || !tafsirDeckName.trim()}
              data-tafsir-deck-submit
              onClick={() => void handleCreateTafsirDeck()}
              icon={<BookOpen className="size-4" />}
            >
              {t('tafsirDeckCreateBtn')}
            </Button>
          </div>
        )}

        {message && (
          <p role="status" data-lexicon-deck-message className="text-sm text-main">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" data-lexicon-deck-error className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
