'use client';

import React, { useEffect, useState } from 'react';
import { Layers, Search, X, BookOpen, ExternalLink, ArrowRight, ArrowLeft } from 'lucide-react';
import type { QuranTopic } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const cleanHtml = (html: string): string => {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

export function QuranTopicDrawer({
  topics,
  activeTopic,
  onSelectTopic,
  onSelectAyah,
  onClose,
  t,
  lang,
  dir,
  onSearch,
}: {
  topics: QuranTopic[];
  activeTopic: QuranTopic | null;
  onSelectTopic: (topic: QuranTopic) => void;
  onSelectAyah: (surah: number, ayah: number) => void;
  onClose: () => void;
  t: Translate;
  lang: 'ar' | 'en';
  dir: 'rtl' | 'ltr';
  onSearch?: (query: string) => Promise<QuranTopic[]>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<QuranTopic[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [previousTopicQuery, setPreviousTopicQuery] = useState<readonly unknown[] | null>(null);
  const inputsTopicQuery = [searchQuery, onSearch];
  if (previousTopicQuery === null || inputsTopicQuery.some((value, index) => !Object.is(value, previousTopicQuery[index]))) {
    setPreviousTopicQuery(inputsTopicQuery);
    if (!searchQuery.trim() || !onSearch) { setSearchResults([]); setIsSearching(false); } else setIsSearching(true);
  }
  useEffect(() => {
    if (!searchQuery.trim() || !onSearch) {
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void onSearch(searchQuery.trim()).then(results => {
        if (alive) {
          setSearchResults(results);
          setIsSearching(false);
        }
      }).catch(() => {
        if (alive) setIsSearching(false);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [searchQuery, onSearch]);

  const displayTopic = activeTopic || (topics.length > 0 ? topics[0] : null);

  return (
    <aside
      aria-label={t('quranTopics')}
      className="fixed inset-y-0 end-0 z-50 w-full sm:w-96 md:w-[440px] bg-surface/95 backdrop-blur-md border-s border-subtle shadow-2xl flex flex-col transition-transform duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-subtle">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Layers className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('quranTopics')}</h2>
            <p className="text-xs text-muted">{displayTopic ? (lang === 'ar' ? displayTopic.arabicName || displayTopic.name : displayTopic.name) : t('quranTopics')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted hover:bg-pale-sky-500/10 transition-colors"
          title={t('quranClosePanel')}
          aria-label={t('quranClosePanel')}
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Search Bar */}
      {onSearch && (
        <div className="p-3 border-b border-subtle bg-surface-subtle/50">
          <div className="relative">
            <Search className="absolute start-3 top-2.5 size-4 text-muted pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('quranTopicSearch')}
              className="w-full rounded-xl border border-subtle bg-surface pe-3 ps-9 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      )}

      {/* Main Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* If search results are active */}
        {searchQuery.trim() ? (
          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              {t('quranSearchCount', { count: searchResults.length })}
            </h3>
            {searchResults.length === 0 && !isSearching && (
              <p className="text-xs text-muted py-4 text-center">{t('quranNoAyahs')}</p>
            )}
            <div className="space-y-2">
              {searchResults.map(topic => (
                <button
                  key={topic.topicId}
                  type="button"
                  onClick={() => {
                    onSelectTopic(topic);
                    setSearchQuery('');
                  }}
                  className="w-full text-start p-3 rounded-xl border border-subtle bg-surface hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all"
                >
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{topic.name}</span>
                    {topic.arabicName && (
                      <span dir="rtl" className="font-reading text-base text-emerald-600 dark:text-emerald-400">
                        {topic.arabicName}
                      </span>
                    )}
                  </div>
                  {topic.description && (
                    <p className="text-xs text-muted line-clamp-2 mt-1">{cleanHtml(topic.description)}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Multiple topics selector pills if more than 1 topic */}
            {topics.length > 1 && (
              <div className="flex flex-wrap gap-1.5 pb-2 border-b border-subtle">
                {topics.map(topic => {
                  const isActive = displayTopic?.topicId === topic.topicId;
                  return (
                    <button
                      key={topic.topicId}
                      type="button"
                      onClick={() => onSelectTopic(topic)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                        isActive
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-surface border-subtle text-foreground hover:bg-pale-sky-500/10'
                      }`}
                    >
                      {lang === 'ar' && topic.arabicName ? topic.arabicName : topic.name}
                    </button>
                  );
                })}
              </div>
            )}

            {displayTopic ? (
              <div className="space-y-4">
                {/* Topic Header Card */}
                <div className="rounded-xl border border-subtle bg-surface p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-foreground">{displayTopic.name}</h3>
                    {displayTopic.arabicName && (
                      <span dir="rtl" className="font-reading text-xl text-emerald-600 dark:text-emerald-400">
                        {displayTopic.arabicName}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {displayTopic.thematic && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium border border-amber-500/20">
                        Thematic
                      </span>
                    )}
                    {displayTopic.ontology && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 font-medium border border-blue-500/20">
                        Ontology
                      </span>
                    )}
                  </div>
                  {displayTopic.description && (
                    <p className="text-xs text-foreground/85 leading-relaxed pt-2 border-t border-subtle">
                      {cleanHtml(displayTopic.description)}
                    </p>
                  )}
                </div>

                {/* Related Ayahs List */}
                {displayTopic.ayahs.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                      {t('quranRelatedAyahs', { count: displayTopic.ayahs.length })}
                    </h4>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {displayTopic.ayahs.map(loc => (
                        <button
                          key={`${loc.surah}:${loc.ayah}`}
                          type="button"
                          onClick={() => onSelectAyah(loc.surah, loc.ayah)}
                          className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-subtle bg-surface hover:bg-emerald-500/10 hover:border-emerald-500/40 text-xs text-foreground transition-all"
                          title={t('quranJumpToAyah')}
                        >
                          <BookOpen className="size-3 text-muted" />
                          <span dir="ltr">{loc.surah}:{loc.ayah}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted py-6 text-center">{t('quranNoTopics')}</p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
