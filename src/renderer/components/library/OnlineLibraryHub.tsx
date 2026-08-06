'use client';

import React, { useState } from 'react';
import {
  Globe,
  Search,
  BookOpen,
  Rss,
  ExternalLink,
  Download,
  PlusCircle,
  X,
  Sparkles
} from 'lucide-react';
import { INITIAL_RSS_FEEDS } from '../../data/libraryMockData';
import { BookItem, RssFeedItem } from '../../types/library';

interface OnlineLibraryHubProps {
  isOpen: boolean;
  onClose: () => void;
  onImportBook: (newBook: Partial<BookItem>) => void;
}

export const OnlineLibraryHub: React.FC<OnlineLibraryHubProps> = ({
  isOpen,
  onClose,
  onImportBook,
}) => {
  if (!isOpen) return null;

  const [activeSource, setActiveSource] = useState<'Shamela' | 'Noor Library' | 'LibGen' | 'Anna Archive' | 'Inoreader'>('Shamela');
  const [searchQuery, setSearchQuery] = useState('');
  const [importedId, setImportedId] = useState<string | null>(null);

  const sources = [
    { id: 'Shamela', label: 'المكتبة الشاملة', color: 'text-amber-500', desc: 'تراث المصنفات والتفاسير' },
    { id: 'Noor Library', label: 'مكتبة نور', color: 'text-pale-sky-500', desc: 'الكتب العربية العامة والحديثة' },
    { id: 'LibGen', label: 'LibGen (Library Genesis)', color: 'text-evergreen-500', desc: 'الأوراق والأبحاث الأكاديمية العالمية' },
    { id: 'Anna Archive', label: 'Anna’s Archive (أرشيف آنا)', color: 'text-purple-500', desc: 'أرشيف الكتب العالمي المفتوح' },
    { id: 'Inoreader', label: 'Inoreader RSS Feed', color: 'text-orange-500', desc: 'تجميع المقالات والأخبار العلمية' },
  ];

  const onlineResults = [
    {
      id: 'on-1',
      title: 'زاد المعاد في هدي خير العباد',
      author: 'ابن قيم الجوزية',
      publisher: 'مؤسسة الرسالة',
      source: 'Shamela',
      format: 'PDF / Shamela',
      url: 'https://shamela.ws/book/21714',
    },
    {
      id: 'on-2',
      title: 'Principles of Neural Science (5th Ed)',
      author: 'Eric R. Kandel',
      publisher: 'McGraw Hill',
      source: 'LibGen',
      format: 'PDF',
      url: 'https://libgen.is/book/88912',
    },
    {
      id: 'on-3',
      title: 'دراسات في العقل العربي والمعرفة الإسلامية',
      author: 'د. محمد عابد الجابري',
      publisher: 'مركز دراسات الوحدة العربية',
      source: 'Noor Library',
      format: 'EPUB',
      url: 'https://noor-book.com/jabri',
    },
  ];

  const filteredResults = onlineResults.filter(
    (item) => item.source === activeSource || activeSource === 'Inoreader'
  );

  const handleImport = (item: any) => {
    onImportBook({
      title: item.title,
      author: item.author,
      publisher: item.publisher,
      digitalFormat: item.format.includes('EPUB') ? 'EPUB' : 'PDF',
      bookType: 'digital',
      onlineSource: item.source,
      language: item.title.match(/[a-zA-Z]/) ? 'English' : 'العربية',
      categories: ['مستورد من الإنترنت'],
      lendingHistory: [],
    });
    setImportedId(item.id);
    setTimeout(() => setImportedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-surface border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[85vh] font-sans" dir="rtl">
        {/* Header */}
        <div className="p-4 bg-canvas/80 border-b border-subtle flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pale-sky-500/10 border border-pale-sky-500/20 flex items-center justify-center text-pale-sky-500 font-bold">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-main text-base">المكتبات والمصادر المفتوحة عبر الإنترنت</h3>
              <p className="text-xs text-muted">البحث وجلب الكتب والمستندات من الشاملة، مكتبة نور، LibGen، Anna's Archive و Inoreader RSS</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Selector Bar */}
        <div className="p-3 bg-canvas border-b border-subtle flex items-center gap-2 overflow-x-auto no-scrollbar">
          {sources.map((src) => (
            <button
              key={src.id}
              onClick={() => setActiveSource(src.id as any)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                activeSource === src.id
                  ? 'bg-pale-sky-500 text-white shadow-sm'
                  : 'bg-surface border border-subtle text-muted hover:text-main hover:bg-canvas'
              }`}
            >
              <span>{src.label}</span>
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeSource !== 'Inoreader' ? (
            <>
              {/* Search Bar */}
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-canvas border border-subtle text-xs">
                <Search className="w-4 h-4 text-pale-sky-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`ابحث في ${sources.find((s) => s.id === activeSource)?.label} عن كتب، مؤلفين، أو عناوين...`}
                  className="flex-1 bg-transparent outline-none text-main placeholder:text-muted font-sans text-xs"
                />
              </div>

              {/* Online Results List */}
              <div className="space-y-3">
                {filteredResults.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-canvas border border-subtle flex items-center justify-between hover:border-pale-sky-500/40 transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-main text-sm">{item.title}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-pale-sky-500/10 text-pale-sky-500 font-bold">
                          {item.format}
                        </span>
                      </div>
                      <p className="text-xs text-muted">المؤلف: {item.author} • الناشر: {item.publisher}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-xl bg-surface border border-subtle text-muted hover:text-main text-xs flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleImport(item)}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition-all shadow-sm cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>{importedId === item.id ? 'تمت الإضافة للمكتبة!' : 'إضافة لمكتبتي الخاصة'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Inoreader RSS Stream View */
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs font-semibold flex items-center gap-2">
                <Rss className="w-4 h-4" />
                <span>تجميع خلاصة Inoreader والمجلات العلمية المتجددة</span>
              </div>

              {INITIAL_RSS_FEEDS.map((feed) => (
                <div key={feed.id} className="p-4 rounded-2xl bg-canvas border border-subtle space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-main text-sm">{feed.title}</span>
                    <span className="text-[10px] text-muted">{feed.date}</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">{feed.snippet}</p>
                  <div className="pt-2 flex items-center justify-between border-t border-subtle/50 text-[11px]">
                    <span className="text-pale-sky-500 font-semibold">{feed.source}</span>
                    <a
                      href={feed.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-500 font-bold hover:underline flex items-center gap-1"
                    >
                      <span>قراءة المقال الكامل</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-canvas border-t border-subtle flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-surface border border-subtle text-xs font-bold text-main hover:bg-canvas transition-all"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
