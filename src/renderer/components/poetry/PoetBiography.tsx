'use client';
import React, { useEffect, useRef, useState } from 'react';
import type { PoetryDetail, PoetrySummary } from '../../../shared/types/poetry';
import { useWorkspace } from '../context/WorkspaceContext';
import { openPoetryReference } from '../../utils/poetry-navigation';

export function PoetBiography({ poem, onClose, onPoet }: { poem: PoetryDetail; onClose: () => void; onPoet?: (id: number) => void }) {
  const { t } = useWorkspace();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [after, setAfter] = useState(0);
  const [previous, setPrevious] = useState<number[]>([]);
  const [items, setItems] = useState<PoetrySummary[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => { closeButton.current?.focus(); }, []);
  useEffect(() => {
    let alive = true;
    void window.electronAPI.poetry.search({ language: poem.language, poetId: poem.poet_id, after, limit: 40 }).then(result => {
      if (!alive) return;
      if (result.ok) { setItems(result.data.items.filter(item => item.id !== poem.id)); setNext(result.data.next); setFailed(false); }
      else setFailed(true);
      setLoading(false);
    }).catch(() => { if (alive) { setFailed(true); setLoading(false); } });
    return () => { alive = false; };
  }, [poem.id, poem.poet_id, poem.language, after]);
  return <aside role="dialog" aria-modal="false" aria-label={t('bayanBiography')} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }} className="absolute bottom-4 end-4 top-20 z-30 flex w-[min(28rem,calc(100%-2rem))] flex-col rounded-xl border border-subtle bg-surface p-4 shadow-xl">
    <header className="mb-3 flex items-start justify-between gap-3"><h2 dir="auto" className="font-semibold leading-loose">{poem.poet_name}</h2><button ref={closeButton} type="button" onClick={onClose}>{t('bayanClose')}</button></header>
    <div className="min-h-0 flex-1 overflow-y-auto leading-loose">
      <p dir="auto">{[poem.poet_era, poem.poet_location].filter(Boolean).join(' · ')}</p><p dir="auto" className="whitespace-pre-wrap break-words">{poem.poet_bio}</p>
      <h3 className="mt-5 font-semibold">{t('bayanOtherPoems')}</h3>
      {loading && <p role="status">{t('bayanLoading')}</p>}{failed && <p role="alert">{t('bayanUnavailable')}</p>}
      <ul aria-busy={loading}>{items.map(item => <li key={item.id} className="border-b border-subtle"><button type="button" disabled={loading} dir="auto" className="w-full p-2 text-start" onClick={() => openPoetryReference({ poemId: item.id, from: 0, to: 0 })}>{item.title || item.poetName}<span className="block text-xs text-muted">{[item.meter, item.theme].filter(Boolean).join(' · ')}</span></button></li>)}</ul>
      <div className="mt-3 flex justify-between gap-3"><button type="button" disabled={loading || !previous.length} onClick={() => { setLoading(true); setAfter(previous.at(-1)!); setPrevious(values => values.slice(0, -1)); }}>{t('bayanPrevious')}</button><button type="button" disabled={loading || next === null} onClick={() => { setLoading(true); setPrevious(values => [...values, after]); setAfter(next!); }}>{t('bayanNext')}</button></div>
      {onPoet && <button type="button" className="mt-3 underline" onClick={() => onPoet(poem.poet_id)}>{t('bayanPoetPoems')}</button>}
    </div>
  </aside>;
}
