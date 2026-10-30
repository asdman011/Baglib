'use client';
import React, { useEffect, useState } from 'react';
import type { PoetSummary } from '../../../shared/types/poetry';
import { useWorkspace } from '../context/WorkspaceContext';

export function PoetBrowser({ language, era, onPoet }: { language: 'ar' | 'en'; era: string; onPoet: (id: number) => void }) {
  const { t, lang } = useWorkspace();
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{ items: PoetSummary[]; total: number; offset: number }>({ items: [], total: 0, offset: 0 });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void window.electronAPI.poetry.poets({ language, era: era || undefined, query, offset }).then(response => {
        if (!alive) return;
        if (response.ok) { setResult(response.data); setFailed(false); } else setFailed(true);
      }).catch(() => { if (alive) setFailed(true); });
    }, 100);
    return () => { alive = false; clearTimeout(timer); };
  }, [language, era, query, offset]);
  return <aside aria-label={t('bayanPoets')} className="rounded-xl border border-subtle bg-surface p-3">
    <input type="search" dir="auto" aria-label={t('bayanPoetSearch')} placeholder={t('bayanPoetSearch')} value={query} onChange={event => { setQuery(event.target.value); setOffset(0); }} className="mb-3 w-full rounded border border-subtle bg-canvas p-2" />
    {failed && <p role="alert">{t('bayanUnavailable')}</p>}
    <div key={query} className="h-64 overflow-y-auto" onScroll={event => setOffset(Math.max(0, Math.floor(event.currentTarget.scrollTop / 64) - 3))}>
      <div className="relative" style={{ height: result.total * 64 }}>
        {result.items.map((poet, index) => <button type="button" key={poet.id} onClick={() => onPoet(poet.id)} className="absolute w-full overflow-hidden border-b border-subtle px-3 text-start" style={{ top: (result.offset + index) * 64, height: 64, insetInlineStart: 0 }}>
          <span dir="auto" className="block truncate leading-relaxed">{poet.name}</span><span className="block truncate text-xs text-muted">{poet.era} · {poet.poemCount.toLocaleString(lang)}</span>
        </button>)}
      </div>
    </div>
  </aside>;
}
