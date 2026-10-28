'use client';

import React, { useEffect, useState } from 'react';
import type { SunnahCollectionId, SunnahSearchHit } from '../../../shared/types/sunnah';
import { collectionKeys } from '../../utils/sunnah-collections';
import type { SunnahTranslate } from './SunnahChapterView';
import { normalizeSunnahSearch } from '../../libs/sunnah/text';

export type SunnahSearchScope = 'all' | 'collection' | 'chapter';
export interface SunnahSearchTarget { collection: SunnahCollectionId; chapter: number; hadith: string }

export function SunnahSearch({ query, scope, collection, chapter, t, onOpen }: {
  query: string; scope: SunnahSearchScope; collection?: SunnahCollectionId; chapter?: number;
  t: SunnahTranslate; onOpen: (target: SunnahSearchTarget) => void;
}) {
  const [state, setState] = useState<{ key: string; loading: boolean; failed: boolean; limited: boolean; hits: SunnahSearchHit[] }>({ key: '', loading: false, failed: false, limited: false, hits: [] });
  const key = JSON.stringify([query, scope, collection, chapter]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const search = async () => {
        const terms = normalizeSunnahSearch(query).split(' ').filter(Boolean);
        if (!terms.length) { setState({ key, loading: false, failed: false, limited: false, hits: [] }); return; }
        setState({ key, loading: true, failed: false, limited: false, hits: [] });
        const catalog = await window.electronAPI.sunnah.catalog();
        if (!catalog.ok || !catalog.data) throw new Error('Corpus unavailable');
        if (catalog.data.research && window.electronAPI.sunnah.search) {
          const result = await window.electronAPI.sunnah.search({ text: query, collection: scope === 'all' ? undefined : collection, chapter: scope === 'chapter' ? chapter : undefined });
          if (!result.ok) throw new Error('Search unavailable');
          if (!cancelled) setState({ key, loading: false, failed: false, limited: result.data.length > 200, hits: result.data.slice(0, 200) });
          return;
        }
        const hits: SunnahSearchHit[] = [];
        for (const selected of catalog.data.collections) {
          if (scope !== 'all' && selected.id !== collection) continue;
          for (const summary of selected.chapters) {
            if (cancelled) return;
            if (scope === 'chapter' && summary.number !== chapter) continue;
            const response = await window.electronAPI.sunnah.chapter(selected.id, summary.number);
            if (!response.ok) throw new Error('Chapter unavailable');
            for (const hadith of response.data.hadiths) {
              const text = normalizeSunnahSearch([hadith.number, hadith.text.ar.full, hadith.text.ar.isnad, hadith.text.ar.matn, hadith.text.en.full, hadith.text.en.isnad, hadith.text.en.matn, hadith.section.title.ar, hadith.section.title.en].join(' '));
              if (terms.every(term => text.includes(term))) hits.push({ chapter: response.data, hadith });
              if (hits.length > 200) break;
            }
            if (hits.length > 200) break;
          }
          if (hits.length > 200) break;
        }
        if (!cancelled) setState({ key, loading: false, failed: false, limited: hits.length > 200, hits: hits.slice(0, 200) });
      };
      void search().catch(() => { if (!cancelled) setState({ key, loading: false, failed: true, limited: false, hits: [] }); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, query, scope, collection, chapter]);
  if (!query.trim()) return null;
  if (state.key !== key || state.loading) return <p role="status" className="p-4">{t('sunnahLoading')}</p>;
  if (state.failed) return <p role="alert" className="p-4">{t('sunnahReadError')}</p>;
  return <div className="p-4 space-y-3">
    <p role="status">{state.limited ? t('sunnahSearchLimit') : t('sunnahSearchCount', { count: state.hits.length })}</p>
    {state.hits.map(hit => <button key={hit.hadith.id} className="block w-full text-start p-4 rounded-xl border border-subtle bg-surface" onClick={() => onOpen({ collection: hit.chapter.collection, chapter: hit.chapter.number, hadith: hit.hadith.id })}>
      <span className="block text-xs text-muted mb-2">{t(collectionKeys[hit.chapter.collection])} · {hit.chapter.number} · {hit.chapter.title.ar} · {t('sunnahHadithNumber', { number: hit.hadith.number })}</span>
      <span className="block font-reading text-xl leading-loose" dir="rtl" lang="ar">{(hit.hadith.text.ar.matn || hit.hadith.text.ar.full).slice(0, 260)}</span>
      <span className="block text-sm leading-relaxed" dir="ltr" lang="en">{(hit.hadith.text.en.matn || hit.hadith.text.en.full).slice(0, 200)}</span>
    </button>)}
  </div>;
}
