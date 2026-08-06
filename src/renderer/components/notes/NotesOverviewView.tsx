'use client';

import React from 'react';
import { FileText, BookOpen, Trash2, Highlighter, Calendar } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export const NotesOverviewView: React.FC = () => {
  const { bookNotes, deletePageNote, openBookForReading, books, setViewMode } = useWorkspace();

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas text-main overflow-hidden p-6 font-sans select-none" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-subtle mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg sm:text-xl text-main font-display">سجل الملاحظات الهامشية والتظليلات</h2>
            <p className="text-xs text-muted">تدويناتك العلمية والتفكرية عبر كتب ومصادر المكتبة ({bookNotes.length})</p>
          </div>
        </div>
      </div>

      {/* Notes Grid */}
      <div className="flex-1 overflow-y-auto">
        {bookNotes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bookNotes.map((note) => {
              const matchedBook = books.find((b) => b.id === note.bookId);

              return (
                <div
                  key={note.id}
                  className="p-5 rounded-2xl bg-surface border border-subtle flex flex-col justify-between gap-4 shadow-sm hover:border-amber-500/40 transition-all group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/20">
                        الصفحة {note.pageNumber}
                      </span>
                      <button
                        onClick={() => deletePageNote(note.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-canvas p-1.5 rounded-lg transition-all cursor-pointer"
                        title="حذف الملاحظة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {note.highlightedText && (
                      <div className="p-3 rounded-xl bg-canvas border-r-4 border-r-amber-500 text-xs text-muted font-serif italic leading-relaxed">
                        "{note.highlightedText}"
                      </div>
                    )}

                    <p className="text-sm text-main font-sans leading-relaxed">{note.content}</p>
                  </div>

                  <div className="pt-3 border-t border-subtle/50 flex items-center justify-between text-xs text-muted">
                    <div className="flex items-center gap-1.5 font-bold text-main truncate max-w-[200px]">
                      <BookOpen className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
                      <span className="truncate">{matchedBook?.title || 'كتاب محلي'}</span>
                    </div>

                    {matchedBook && (
                      <button
                        onClick={() => openBookForReading(matchedBook)}
                        className="px-2.5 py-1 rounded-lg bg-canvas hover:bg-surface border border-subtle text-[11px] font-bold text-amber-600 dark:text-amber-400 cursor-pointer"
                      >
                        فتح القارئ
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-surface border border-subtle flex items-center justify-center text-muted">
              <Highlighter className="w-8 h-8 text-amber-500" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-main font-display">لا توجد ملاحظات مدونة بعد</h3>
              <p className="text-xs text-muted max-w-sm">
                افتح أي كتاب من المكتبة واستخدم القارئ لتدوين حواشيك وملاحظاتك على صفحات الكتاب.
              </p>
            </div>
            <button
              onClick={() => setViewMode('library')}
              className="px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition-all cursor-pointer shadow-md"
            >
              الانتقال إلى المكتبة
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
