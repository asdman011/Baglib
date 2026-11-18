'use client';

/**
 * Baglib — biography (tarajim) deck from the library's authors (KEY-401): one card per author,
 * for all authors or for the authors of one category's books. Making it again updates the cards
 * in place and keeps their schedules.
 */

import React, { useEffect, useState } from 'react';
import { UserRound, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import type { Category } from '../../../shared/types/category';

export function PersonDeckDialog({ onClose }: { onClose: () => void }) {
  const { t, dir, lang } = useWorkspace();
  const [name, setName] = useState(() => t('personDeckOpen'));
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.electronAPI.categories.getAll().then((list: Category[]) => setCategories(Array.isArray(list) ? list : []));
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await window.electronAPI.personDecks.authorDeck({ deckName: name.trim(), categoryId: categoryId || null, language: lang === 'ar' ? 'ar' : 'en' });
      if (!r.ok) return setError(t(r.error === 'no-people' ? 'personDeckNone' : 'personDeckFailed'));
      setMessage(t('personDeckCreated', { name: name.trim(), count: r.data.people, added: r.data.added }));
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="person-deck-title">
      <div dir={dir} data-person-deck-dialog className="w-full max-w-lg space-y-4 rounded-2xl border border-subtle bg-surface p-5 shadow-2xl">
        <header className="flex items-center justify-between gap-3">
          <h3 id="person-deck-title" className="font-bold text-main">{t('personDeckTitle')}</h3>
          <button type="button" onClick={onClose} aria-label={t('close')} data-close-person-deck className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main"><X className="size-4" /></button>
        </header>
        <p className="text-xs text-muted">{t('personDeckHint')}</p>
        <label className="block space-y-1 text-xs text-muted">
          <span>{t('sunnahDeckName')}</span>
          <input value={name} dir="auto" data-person-deck-name onChange={e => setName(e.target.value)} className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main" />
        </label>
        <label className="block space-y-1 text-xs text-muted">
          <span>{t('personDeckScope')}</span>
          <select value={categoryId} data-person-deck-category onChange={e => setCategoryId(e.target.value)} className="w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main">
            <option value="">{t('personDeckAll')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{lang === 'ar' ? c.nameAr || c.nameEn : c.nameEn || c.nameAr}</option>)}
          </select>
        </label>
        <Button type="button" disabled={busy || !name.trim()} data-person-deck-create onClick={() => void create()} icon={<UserRound className="size-4" />}>
          {t('personDeckCreate')}
        </Button>
        {message && <p role="status" data-person-deck-message className="text-sm text-main">{message}</p>}
        {error && <p role="alert" data-person-deck-error className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
