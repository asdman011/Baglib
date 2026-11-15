'use client';

import React from 'react';
import type { Manuscript, ManuscriptDocument } from '../../../shared/manuscripts';
import { calculateDocumentStats } from '../../../shared/manuscript-headings';
import { translations } from '../../translations';
import { Info, X, Calendar, Layers } from 'lucide-react';

interface Props {
  language: 'ar' | 'en';
  isOpen: boolean;
  onClose: () => void;
  document?: ManuscriptDocument;
  manuscript?: Manuscript;
}

export function ResearchInfoDrawer({ language, isOpen, onClose, document, manuscript }: Props) {
  if (!isOpen || !document) return null;
  const t = translations[language];
  const stats = calculateDocumentStats(document.plain_text, document.snapshot);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-150" onClick={onClose} role="dialog" aria-modal="true" aria-label={t.researchDocInfoTitle}>
      <aside
        className="research-info-drawer w-full max-w-sm h-full bg-surface-panel border-s border-border-subtle shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="research-info-header flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <Info className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-base text-text-main">{t.researchDocInfoTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-base transition-colors"
            aria-label={t.researchAiClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-6 text-sm">
          <div>
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider block mb-1">
              {t.manuscriptName}
            </span>
            <p className="font-medium text-text-main">{document.title}</p>
            {manuscript && (
              <p className="text-xs text-text-muted mt-0.5">
                {manuscript.title} · {manuscript.kind === 'research' ? t.manuscriptResearch : t.manuscriptBook}
              </p>
            )}
          </div>

          <div className="border-t border-border-subtle pt-4">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider block mb-3">
              {t.researchDocInfoTitle}
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-surface-base border border-border-subtle">
                <span className="text-xs text-text-muted block mb-1">{t.researchWordsCount}</span>
                <span className="text-lg font-bold text-text-main">{stats.words}</span>
              </div>
              <div className="p-3 rounded-lg bg-surface-base border border-border-subtle">
                <span className="text-xs text-text-muted block mb-1">{t.researchCharsCount}</span>
                <span className="text-lg font-bold text-text-main">{stats.chars}</span>
              </div>
              <div className="p-3 rounded-lg bg-surface-base border border-border-subtle">
                <span className="text-xs text-text-muted block mb-1">{t.researchTocTitle}</span>
                <span className="text-lg font-bold text-text-main">{stats.headings}</span>
              </div>
              <div className="p-3 rounded-lg bg-surface-base border border-border-subtle">
                <span className="text-xs text-text-muted block mb-1">{t.researchBlocksCount}</span>
                <span className="text-lg font-bold text-text-main">{stats.paragraphs}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-border-subtle pt-4 space-y-3">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider block mb-2">
              {t.reSettings || 'Details'}
            </span>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> {t.researchPageMode}</span>
              <span className="font-medium text-text-main">
                {document.primary_mode === 'edgeless' ? t.researchEdgelessMode : t.researchPageMode}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {t.researchUpdatedAt}</span>
              <span className="font-medium text-text-main">
                {new Date(document.updated_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
              </span>
            </div>
            {manuscript && (
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {t.researchCreatedAt}</span>
                <span className="font-medium text-text-main">
                  {new Date(manuscript.created_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                </span>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
