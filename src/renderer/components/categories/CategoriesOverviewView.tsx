'use client';

import React, { useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Layers, Book } from 'lucide-react';

export const CategoriesOverviewView: React.FC = () => {
  const { books, setViewMode } = useWorkspace();

  const categories = useMemo(() => {
    const map = new Map<string, typeof books>();
    books.forEach(b => {
      if (!b.categories || b.categories.length === 0) return;
      b.categories.forEach(c => {
        if (!map.has(c)) map.set(c, []);
        map.get(c)!.push(b);
      });
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [books]);

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas/30 overflow-y-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-pale-sky-500/10 text-pale-sky-500 flex items-center justify-center shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-display text-main">إدارة التصنيفات</h1>
          <p className="text-xs text-muted font-sans mt-1">تصفح الكتب والمواد حسب تصنيفاتها الرئيسية</p>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted text-sm font-sans">
          لا توجد تصنيفات حالياً
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map(([category, catBooks]) => (
            <div 
              key={category} 
              className="bg-surface border border-subtle hover:border-pale-sky-500/50 transition-colors rounded-2xl p-4 flex flex-col gap-3 group cursor-pointer"
              onClick={() => {
                // In a future update this could filter the library to this specific category
                setViewMode('library');
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-bold text-main font-display text-sm line-clamp-1">{category}</h3>
                  <p className="text-xs text-muted font-sans mt-1">
                    {catBooks.length} {catBooks.length === 1 ? 'كتاب' : 'كتب'}
                  </p>
                </div>
                <div className="w-8 h-8 rounded-full bg-subtle/30 text-muted group-hover:bg-pale-sky-500/10 group-hover:text-pale-sky-500 transition-colors flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="pt-3 border-t border-subtle/50 flex flex-col gap-1.5">
                {catBooks.slice(0, 3).map(b => (
                  <div key={b.id} className="flex items-center gap-2 text-xs text-muted truncate">
                    <Book className="w-3 h-3 shrink-0 opacity-50" />
                    <span className="truncate">{b.title}</span>
                  </div>
                ))}
                {catBooks.length > 3 && (
                  <span className="text-[10px] text-pale-sky-500 font-bold mt-1 px-1">
                    +{catBooks.length - 3} إضافي...
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
