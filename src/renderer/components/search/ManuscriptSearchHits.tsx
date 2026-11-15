'use client';
/** KEY-372 (RE-11): manuscripts in BagLib's global search, through manuscript_document_fts (RE-3). */
import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import type { ManuscriptDocument } from '../../../shared/manuscripts';
import { requestOpenManuscriptDocument } from '../../../shared/manuscript-transfer';

export function ManuscriptSearchHits({ query, title, onOpen }: { query: string; title: string; onOpen: () => void }) {
  const [hits, setHits] = useState<ManuscriptDocument[]>([]);
  useEffect(() => {
    const term = query.trim();
    let live = true;
    const timer = setTimeout(() => {
      if (!term || !window.electronAPI?.manuscripts?.search) { setHits([]); return; }
      void window.electronAPI.manuscripts.search(term).then(list => { if (live) setHits(list.slice(0, 6)); }).catch(() => { if (live) setHits([]); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);
  if (!hits.length) return null;
  return <section data-search-manuscripts className="mb-4 space-y-2">
    <h3 className="flex items-center gap-1.5 text-xs font-bold text-muted"><FileText className="w-3.5 h-3.5" />{title}</h3>
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {hits.map(hit => <li key={hit.id}>
        <button type="button" dir="auto" data-search-manuscript={hit.id} onClick={() => { onOpen(); requestOpenManuscriptDocument(hit.id); }} className="w-full text-start rounded-xl border border-subtle bg-surface p-3 hover:bg-canvas">
          <span className="block font-medium text-main truncate">{hit.title}</span>
          <span className="block text-xs text-muted line-clamp-2 mt-1">{hit.plain_text.slice(0, 160)}</span>
        </button>
      </li>)}
    </ul>
  </section>;
}
