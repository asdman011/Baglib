'use client';

import React, { useId, useState } from 'react';
import type { BookItem } from '../../../shared/types/work';
import { editionYearFallback } from '../../../shared/utils/edition';
import type { TranslationKey } from '../../translations';

export function EditionInput({ book, onChange, t }: {
  book: Pick<BookItem, 'edition' | 'publicationYear'>;
  onChange: (value: string) => void;
  t: (key: TranslationKey) => string;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const fallback = editionYearFallback(book);
  return <div className="space-y-1">
    <label htmlFor={id} className="font-bold text-main">{t('bookEditionLabel')}</label>
    <input id={id} type="text" dir="auto" value={editing ? book.edition || '' : book.edition?.trim() ? book.edition : fallback}
      placeholder={fallback || t('bookEditionPlaceholder')} aria-describedby={fallback ? `${id}-hint` : undefined}
      onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} onChange={event => onChange(event.target.value)}
      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none" />
    {fallback && <p id={`${id}-hint`} className="text-xs text-muted leading-relaxed">{t('editionYearFallbackHint')}</p>}
  </div>;
}
