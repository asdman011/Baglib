'use client';

import React from 'react';
import { MANUSCRIPT_TEMPLATES, type ManuscriptTemplate } from '../../../shared/manuscript-templates';
import { translations } from '../../translations';
import { BookOpen, FileText, ScrollText, Library, X } from 'lucide-react';

interface Props {
  language: 'ar' | 'en';
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: ManuscriptTemplate) => void | Promise<void>;
}

const templateIcons: Record<string, React.ReactNode> = {
  'research-paper': <FileText className="w-6 h-6 text-primary" />,
  'book-chapter': <BookOpen className="w-6 h-6 text-primary" />,
  'thematic-study': <ScrollText className="w-6 h-6 text-primary" />,
  'critical-edition': <Library className="w-6 h-6 text-primary" />,
};

export function ResearchTemplateModal({ language, isOpen, onClose, onSelectTemplate }: Props) {
  if (!isOpen) return null;
  const t = translations[language];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={t.researchTemplates}>
      <div
        className="research-template-card w-full max-w-2xl bg-surface-panel border border-border-subtle rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="research-template-header flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <ScrollText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-main">{t.researchTemplates}</h2>
              <p className="text-xs text-text-muted">{t.researchTemplateResearchPaperDesc}</p>
            </div>
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

        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {MANUSCRIPT_TEMPLATES.map(template => {
            const title = t[template.titleKey as keyof typeof t] || template.defaultTitle[language];
            const desc = t[template.descKey as keyof typeof t] || '';

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  void onSelectTemplate(template);
                  onClose();
                }}
                className="research-template-item flex flex-col text-start p-4 rounded-xl border border-border-subtle bg-surface-base hover:border-primary/50 hover:bg-surface-panel hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-surface-panel border border-border-subtle group-hover:border-primary/30 transition-colors">
                    {templateIcons[template.id] || <FileText className="w-5 h-5 text-primary" />}
                  </div>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {template.chapters.length} {t.manuscriptChapters}
                  </span>
                </div>
                <h3 className="font-semibold text-sm text-text-main mb-1 group-hover:text-primary transition-colors">
                  {title}
                </h3>
                <p className="text-xs text-text-muted line-clamp-2 leading-relaxed mb-3">
                  {desc}
                </p>
                <div className="mt-auto pt-2 border-t border-border-subtle/50 flex flex-wrap gap-1">
                  {template.chapters.slice(0, 3).map((ch, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-panel text-text-muted truncate max-w-[140px]">
                      {ch[language]}
                    </span>
                  ))}
                  {template.chapters.length > 3 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-panel text-text-muted">
                      +{template.chapters.length - 3}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
