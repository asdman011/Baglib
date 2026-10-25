'use client';

import React from 'react';
import type { RenderPdfPageResult } from '../../utils/pdf-page-renderer';
import { formatCoverUrl } from '../../utils/file-path-helper';
import type { TranslationKey } from '../../translations';

export function PdfCoverChoices({ pages, selected, onSelect, t }: {
  pages: RenderPdfPageResult[]; selected: number; onSelect: (page: RenderPdfPageResult) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  return <div className="space-y-2"><p className="text-xs text-muted leading-relaxed">{t('pdfCoverChoosePage')}</p><div role="group" aria-label={t('pdfCoverChoosePage')} className="grid grid-cols-5 gap-2">
    {pages.map(page => <button key={page.currentPage} type="button" aria-pressed={page.currentPage === selected} onClick={() => onSelect(page)}
      className={`min-w-0 rounded-lg border p-1 ${page.currentPage === selected ? 'border-pale-sky-500 bg-pale-sky-500/10' : 'border-subtle bg-surface'}`}>
      <img src={formatCoverUrl(page.coverUrl)} alt={t('pdfCoverPage', { page: page.currentPage })} className="w-full h-24 object-contain bg-white rounded" />
      <span className="block text-xs leading-relaxed text-main">{t('pdfCoverPage', { page: page.currentPage })}</span>
    </button>)}
  </div></div>;
}
