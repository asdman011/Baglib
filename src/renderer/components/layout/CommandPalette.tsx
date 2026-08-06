'use client';

import React, { useState, useEffect } from 'react';
import { Search, BookOpen, FileText, Hash, Bookmark, ArrowRight, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { SAMPLE_COMMAND_RESULTS } from '../../data/mockData';

export const CommandPalette: React.FC = () => {
  const { isCommandPaletteOpen, setCommandPaletteOpen, openBookForReading } = useWorkspace();
  const [query, setQuery] = useState('');

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCommandPaletteOpen(false);
    };
    if (isCommandPaletteOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen, setCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const quickResults = SAMPLE_COMMAND_RESULTS.map((item) => {
    let icon = BookOpen;
    if (item.type === 'hadith') icon = Hash;
    if (item.type === 'note') icon = FileText;
    if (item.type === 'book') icon = Bookmark;

    return {
      ...item,
      icon,
      action: () => {
        setCommandPaletteOpen(false);
      },
    };
  });

  const filtered = quickResults.filter(
    (item) => item.title.includes(query) || item.subtitle.includes(query) || item.tag.includes(query)
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 p-4">
      <div
        className="w-full max-w-2xl bg-surface border border-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all"
        dir="rtl"
      >
        {/* Search Header Input */}
        <div className="p-4 border-b border-subtle flex items-center gap-3 bg-canvas/50">
          <Search className="w-5 h-5 text-pale-sky-500 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في الكتب والملاحظات والصفحات..."
            className="flex-1 bg-transparent border-none outline-none text-main placeholder:text-muted font-sans text-base"
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="p-1 rounded-lg hover:bg-canvas text-muted hover:text-main"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filtered.length > 0 ? (
            filtered.map((item, idx) => {
              const IconComp = item.icon;
              return (
                <div
                  key={idx}
                  onClick={item.action}
                  className="p-3 rounded-xl hover:bg-canvas border border-transparent hover:border-subtle cursor-pointer flex items-center justify-between group transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-pale-sky-500/10 border border-pale-sky-500/20 flex items-center justify-center text-pale-sky-500 shrink-0">
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-main truncate font-sans">{item.title}</h4>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                          {item.tag}
                        </span>
                      </div>
                      <p className="text-xs text-muted truncate font-serif">{item.subtitle}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted group-hover:text-pale-sky-500 transition-colors shrink-0 rtl:rotate-180" />
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-muted font-sans text-sm">
              لم يتم العثور على نتائج تطابق البحث
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-3 bg-canvas/80 border-t border-subtle flex items-center justify-between text-xs text-muted font-sans">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-surface border border-subtle text-[10px]">↑↓</kbd>{' '}
              التنقل
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-surface border border-subtle text-[10px]">Enter</kbd>{' '}
              الاختيار
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-surface border border-subtle text-[10px]">Esc</kbd>{' '}
            إغلاق
          </span>
        </div>
      </div>
    </div>
  );
};
