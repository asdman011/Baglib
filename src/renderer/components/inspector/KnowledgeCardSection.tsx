'use client';

import React from 'react';
import { Sparkles, PlusCircle } from 'lucide-react';
import { SAMPLE_GLOSSARY_TERMS } from '../../data/mockData';

export const KnowledgeCardSection: React.FC = () => {
  const terms = SAMPLE_GLOSSARY_TERMS;

  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-main flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>بطاقات المفردات والمصطلحات</span>
        </h4>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-bold">
          معجم المصطلحات
        </span>
      </div>

      <div className="space-y-3">
        {terms.map((item, idx) => (
          <div key={idx} className="p-3.5 rounded-2xl bg-surface border border-subtle space-y-2 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold text-main text-sm font-sans">{item.term}</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-canvas border border-subtle text-muted">
                الجذر: {item.root}
              </span>
            </div>

            <p className="text-[11px] text-muted font-serif leading-relaxed">{item.definition}</p>

            <div className="pt-2 border-t border-subtle/50 flex items-center justify-between">
              <span className="text-[10px] text-amber-600 font-medium">{item.category}</span>
              <button
                title="إضافة بطاقة إلى نظام التكرار المتباعد SRS"
                className="flex items-center gap-1 text-[11px] font-semibold text-pale-sky-500 hover:text-pale-sky-600 transition-colors"
              >
                <PlusCircle className="w-3 h-3" />
                <span>إضافة كبطاقة حفظ</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
