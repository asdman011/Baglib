'use client';

import React, { useState, useEffect } from 'react';
import {
  BookA,
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
import { TranslationKey } from '../../translations';

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
  const [activeWord, setActiveWord] = useState<string>(word);
  const [result, setResult] = useState<AggregateDictionaryLookupResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && word) {
      setActiveWord(word);
      performLookup(word);
    }
  }, [isOpen, word]);

  const performLookup = async (targetWord: string) => {
    const trimmed = targetWord.trim();
    if (!trimmed) return;

    setIsLoading(true);
    try {
      const windowAPI = (window as any).electronAPI;
      if (windowAPI?.dictionaryLookup) {
        const data = await windowAPI.dictionaryLookup(trimmed, {
          lang: bookLang,
          includeWikipedia: true,
        });
        setResult(data);
      } else {
        // Fallback for browser preview / mock mode
        const isArabic = /[\u0600-\u06FF]/.test(trimmed);
        setResult({
          query: trimmed,
          candidates: [
            { token: trimmed, type: 'exact', weight: 100 },
            { token: trimmed.replace(/[\u064B-\u065F\u0670]/g, ''), type: 'stripped_diacritics', weight: 80 },
          ],
          entries: [],
          wikipedia: {
            title: trimmed,
            displayTitle: trimmed,
            extract: isArabic
              ? `ملخص توضيحي من ويكيبيديا العربية حول مادة (${trimmed}) وسياق استخدامها التاريخي واللغوي.`
              : `Summary excerpt from Wikipedia regarding (${trimmed}) and its contextual usage.`,
            articleUrl: `https://${isArabic ? 'ar' : 'en'}.wikipedia.org/wiki/${encodeURIComponent(trimmed)}`,
            lang: isArabic ? 'ar' : 'en',
            dir: isArabic ? 'rtl' : 'ltr',
          },
          durationMs: 4.8,
        });
      }
    } catch (err) {
      console.warn('[DictionaryLookupModal] Lookup failed:', err);
    } finally {
      setIsLoading(false);
    }
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
      role="dialog"
      aria-modal="true"
      aria-label={t('dictionaryLookupTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-surface text-main border border-subtle w-full max-w-2xl max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-subtle bg-canvas/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-400 flex items-center justify-center border border-pale-sky-500/20">
              <BookA className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-main font-serif">
                  {activeWord}
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
            onClick={onClose}
            aria-label={t('dictionaryClose')}
            className="p-2 rounded-xl text-muted hover:text-main hover:bg-canvas transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted">
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
                      const isSelected = activeWord === c.token;
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            setActiveWord(c.token);
                            performLookup(c.token);
                          }}
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
              {result && result.entries && result.entries.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-muted border-b border-subtle pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-pale-sky-500" />
                      {t('dictionaryLocalDefinitions')}
                    </span>
                    <span className="text-[11px] font-mono">
                      {t('dictionaryEntriesCount', { count: result.entries.length })}
                    </span>
                  </div>

                  {result.entries.map((entry, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-canvas/60 border border-subtle space-y-2.5 transition-all hover:border-pale-sky-500/30"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-main font-serif text-sm">
                            {entry.headword}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg text-[10px] uppercase font-mono font-bold bg-surface border border-subtle text-muted">
                            {entry.dictTitle} ({entry.dictFormat})
                          </span>
                        </div>
                        <button
                          onClick={() => handleCopy(entry.definitionText, idx)}
                          title={t('dictionaryCopyDefinition')}
                          className="p-1 rounded-lg text-muted hover:text-main hover:bg-surface transition-colors cursor-pointer"
                        >
                          {copiedIndex === idx ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Render formatted definition HTML */}
                      <div
                        className="text-xs text-main leading-relaxed font-serif prose prose-sm dark:prose-invert max-w-none break-words"
                        dir={/[\u0600-\u06FF]/.test(entry.definitionText) ? 'rtl' : 'ltr'}
                        dangerouslySetInnerHTML={{ __html: entry.definitionHtml }}
                      />
                    </div>
                  ))}
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

                    <div className="pt-2 flex justify-end relative z-10">
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
      </div>
    </div>
  );
};
