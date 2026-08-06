'use client';

import React, { useState } from 'react';
import { BookOpen, Copy, Check } from 'lucide-react';
import { SAMPLE_CITATIONS } from '../../data/mockData';

export const CitationSection: React.FC = () => {
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  const citationData = SAMPLE_CITATIONS;

  const copyCitation = (format: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Zotero Metadata Card */}
      <div className="p-3.5 rounded-2xl bg-surface border border-subtle space-y-2 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-pale-sky-500 bg-pale-sky-500/10 px-2 py-0.5 rounded border border-pale-sky-500/20 font-sans">
            مُعَرّف زوتيرو #{citationData.itemNumber}
          </span>
          <span className="text-[10px] text-evergreen-600 font-bold">بيانات BibTeX صالحة</span>
        </div>

        <h4 className="font-bold text-main text-sm font-sans leading-snug">{citationData.title}</h4>
        <p className="text-muted text-xs font-serif">{citationData.author}</p>

        <div className="pt-2 border-t border-subtle/60 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-muted block text-[10px]">الناشر:</span>
            <span className="font-semibold text-main">{citationData.publisher}</span>
          </div>
          <div>
            <span className="text-muted block text-[10px]">سنة النشر:</span>
            <span className="font-semibold text-main">{citationData.year}</span>
          </div>
          <div>
            <span className="text-muted block text-[10px]">الصفحات:</span>
            <span className="font-semibold text-main">{citationData.pages}</span>
          </div>
          <div>
            <span className="text-muted block text-[10px]">المُعرّف الرقمي DOI:</span>
            <span className="font-mono text-pale-sky-500 truncate block">{citationData.doi}</span>
          </div>
        </div>
      </div>

      {/* Copy Citation Formats */}
      <div className="space-y-2">
        <h5 className="font-bold text-main text-xs uppercase tracking-wider">أنماط الاستشهاد الأكاديمي</h5>
        
        {/* APA Style */}
        <div className="p-3 rounded-xl bg-canvas border border-subtle space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-main text-[11px]">التوثيق المعياري APA 7</span>
            <button
              onClick={() => copyCitation('APA', `${citationData.author}. (${citationData.year}). ${citationData.title}. ${citationData.publisher}.`)}
              className="p-1 rounded hover:bg-surface text-muted hover:text-pale-sky-500 transition-colors"
            >
              {copiedFormat === 'APA' ? <Check className="w-3.5 h-3.5 text-evergreen-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[11px] text-muted font-serif text-right">
            {citationData.author}. ({citationData.year}). {citationData.title}. {citationData.publisher}.
          </p>
        </div>

        {/* BibTeX Code Snippet */}
        <div className="p-3 rounded-xl bg-canvas border border-subtle space-y-1 font-mono text-[10px]">
          <div className="flex items-center justify-between font-sans text-xs">
            <span className="font-bold text-amber-500">شفرة BibTeX المرجعية</span>
            <button
              onClick={() => copyCitation('BibTeX', citationData.bibtex)}
              className="p-1 rounded hover:bg-surface text-muted hover:text-amber-500 transition-colors"
            >
              {copiedFormat === 'BibTeX' ? <Check className="w-3.5 h-3.5 text-evergreen-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <pre className="text-muted overflow-x-auto p-2 bg-surface rounded-lg border border-subtle/50 font-mono">
            {citationData.bibtex}
          </pre>
        </div>
      </div>
    </div>
  );
};
