'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Pin, PinOff, X, ListTree, Bookmark, Search, LayoutGrid, ChevronRight, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { TOCItem } from '../../libs/reader/types';
import type { TranslationKey } from '../../translations';

interface ZenTocDrawerProps {
  isOpen: boolean;
  isPinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  toc: TOCItem[];
  tocPageMap: Map<string | number, number>;
  onJumpToTOC: (item: TOCItem) => void;
  readingPage: number;
  totalPages?: number;
  bookmarkedPages: number[];
  onJumpToPage: (page: number) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  pdfDoc?: import('../../libs/reader/pdf-view-document').PdfViewDocument | null;
  paginatedPages?: Array<{ pageNumber: number; text?: string; html?: string }>;
}

export const ZenTocDrawer: React.FC<ZenTocDrawerProps> = ({
  isOpen,
  isPinned,
  onTogglePin,
  onClose,
  onMouseEnter,
  onMouseLeave,
  toc,
  tocPageMap,
  onJumpToTOC,
  readingPage,
  totalPages = 1,
  bookmarkedPages,
  onJumpToPage,
  t,
  pdfDoc,
  paginatedPages,
}) => {
  const [activeTab, setActiveTab] = useState<'toc' | 'thumbnails' | 'bookmarks'>('toc');
  const [searchFilter, setSearchFilter] = useState('');
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());

  // Background lightweight thumbnail generation for PDF pages (scale = 0.2)
  useEffect(() => {
    if (activeTab !== 'thumbnails' || !pdfDoc) return;

    let isCancelled = false;
    const controller = new AbortController();

    const generateThumbnails = async () => {
      const pageCount = Math.min(pdfDoc.numPages || totalPages, totalPages || 100);

      for (let pNum = 1; pNum <= pageCount; pNum++) {
        if (isCancelled) break;
        if (thumbnails.has(pNum)) continue;

        try {
          const bitmap = await pdfDoc.render(pNum, 0.2, 1, controller.signal);
          if (!bitmap) break;
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext('2d', { alpha: false })?.drawImage(bitmap, 0, 0);
          bitmap.close();
          if (isCancelled) break;
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setThumbnails((prev) => {
            const next = new Map(prev);
            next.set(pNum, dataUrl);
            return next;
          });
        } catch (e) {
          console.warn(`[ZenTocDrawer] Failed generating thumbnail for page ${pNum}:`, e);
        }

        // Keep UI thread responsive
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
    };

    generateThumbnails();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [activeTab, pdfDoc, totalPages]);

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Collect all parent chapter IDs that have subitems
  const allParentIds = useMemo(() => {
    const ids: string[] = [];
    const traverse = (items: TOCItem[]) => {
      for (const it of items) {
        if (it.subitems && it.subitems.length > 0) {
          ids.push(String(it.id));
          traverse(it.subitems);
        }
      }
    };
    traverse(toc || []);
    return ids;
  }, [toc]);

  const isAllCollapsed = allParentIds.length > 0 && allParentIds.every((id) => collapsedItems.has(id));

  const handleToggleExpandCollapseAll = () => {
    if (isAllCollapsed) {
      setCollapsedItems(new Set());
    } else {
      setCollapsedItems(new Set(allParentIds));
    }
  };

  const filteredTOC = (toc || []).filter((item) => {
    if (!searchFilter.trim()) return true;
    return item.label.toLowerCase().includes(searchFilter.toLowerCase());
  });

  // Recursive TOC Item Renderer supporting nested hierarchies
  const renderTocItem = (item: TOCItem, depth = 0): React.ReactNode => {
    const targetPage =
      tocPageMap.get(item.id) ||
      tocPageMap.get(item.href) ||
      (item.index >= 0 ? item.index + 1 : 1);
    const isCurrent = readingPage === targetPage;
    const hasSubitems = item.subitems && item.subitems.length > 0;
    const isCollapsed = collapsedItems.has(String(item.id));

    return (
      <div key={item.id} className="flex flex-col">
        <div
          onClick={() => onJumpToTOC(item)}
          className={`w-full text-start p-2 rounded-xl text-xs font-sans transition-all flex items-center justify-between group cursor-pointer ${
            isCurrent
              ? 'bg-pale-sky-500 text-white font-bold shadow-xs'
              : 'text-main hover:bg-canvas'
          }`}
          style={{
            paddingInlineStart: `${Math.max(8, depth * 16 + 8)}px`,
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1 pe-2">
            {hasSubitems ? (
              <button
                type="button"
                onClick={(e) => toggleCollapse(String(item.id), e)}
                className="p-0.5 rounded hover:bg-black/10 text-muted hover:text-main"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3 rtl:rotate-180" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            ) : (
              <span className="w-3 h-3 shrink-0" />
            )}
            <span className="truncate font-serif text-[12.5px]">{item.label}</span>
          </div>

          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
              isCurrent ? 'bg-white/20 text-white' : 'text-muted group-hover:text-main'
            }`}
          >
            {targetPage}
          </span>
        </div>

        {hasSubitems && !isCollapsed && (
          <div className="flex flex-col">
            {item.subitems!.map((sub) => renderTocItem(sub, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      role="complementary"
      aria-label={t('tableOfContents')}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`fixed top-14 bottom-0 inset-inline-start-0 w-80 sm:w-88 backdrop-blur-2xl bg-surface/95 border-e border-subtle/70 z-40 flex flex-col shadow-2xl transition-all duration-300 select-none ${
        isOpen
          ? 'opacity-100 translate-x-0 pointer-events-auto'
          : 'opacity-0 rtl:translate-x-full ltr:-translate-x-full pointer-events-none'
      }`}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* Header with Tabs & Pin Button */}
      <div className="h-12 border-b border-subtle/60 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('toc')}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'toc'
                ? 'bg-pale-sky-500 text-white shadow-xs'
                : 'text-muted hover:text-main'
            }`}
          >
            <ListTree className="w-3.5 h-3.5" />
            <span>{t('tableOfContents')}</span>
          </button>
          <button
            onClick={() => setActiveTab('thumbnails')}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'thumbnails'
                ? 'bg-pale-sky-500 text-white shadow-xs'
                : 'text-muted hover:text-main'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>الصفحات</span>
          </button>
          <button
            onClick={() => setActiveTab('bookmarks')}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'bookmarks'
                ? 'bg-pale-sky-500 text-white shadow-xs'
                : 'text-muted hover:text-main'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>{t('bookmarksTitle') || 'Bookmarks'}</span>
            {bookmarkedPages.length > 0 && (
              <span className="text-[10px] px-1 rounded-full bg-white/20 font-mono">
                {bookmarkedPages.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onTogglePin}
            title={isPinned ? t('unpinDrawer') : t('pinDrawer')}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isPinned
                ? 'bg-pale-sky-500/15 border-pale-sky-500/30 text-pale-sky-600'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            {isPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-main hover:bg-canvas cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tab 1: TOC */}
      {activeTab === 'toc' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* TOC Search Input & Expand/Collapse Toggle */}
          <div className="p-3 border-b border-subtle/50 shrink-0 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute inset-inline-start-2.5 top-2.5 text-muted pointer-events-none" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder={t('searchTocPlaceholder') || 'البحث في الفهرس...'}
                className="w-full ps-8 pe-3 py-1.5 rounded-xl bg-canvas border border-subtle text-xs text-main outline-none focus:border-pale-sky-500 font-sans"
              />
            </div>
            {allParentIds.length > 0 && (
              <button
                type="button"
                onClick={handleToggleExpandCollapseAll}
                title={isAllCollapsed ? t('expandAll') : t('collapseAll')}
                aria-label={isAllCollapsed ? t('expandAll') : t('collapseAll')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-canvas hover:bg-surface border border-subtle text-xs font-sans text-muted hover:text-main shrink-0 transition-colors cursor-pointer"
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium hidden sm:inline">
                  {isAllCollapsed ? t('expandAll') : t('collapseAll')}
                </span>
              </button>
            )}
          </div>

          {/* Chapters List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {filteredTOC.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs text-muted">
                {t('noTocAvailable') || 'No chapters found'}
              </div>
            ) : (
              filteredTOC.map((item) => renderTocItem(item))
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Page Thumbnails Grid Navigation */}
      {activeTab === 'thumbnails' && (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => {
              const isCurrent = readingPage === pg;
              const isBookmarked = bookmarkedPages.includes(pg);
              const thumbUrl = thumbnails.get(pg);
              const textSnippet = paginatedPages?.[pg - 1]?.text;

              return (
                <button
                  key={pg}
                  type="button"
                  onClick={() => onJumpToPage(pg)}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-between gap-1.5 transition-all cursor-pointer relative overflow-hidden group ${
                    isCurrent
                      ? 'bg-pale-sky-500 text-white border-pale-sky-500 shadow-md ring-2 ring-pale-sky-500/50 scale-102 font-bold'
                      : 'bg-canvas border-subtle hover:border-pale-sky-500/40 text-main hover:bg-surface'
                  }`}
                >
                  {isBookmarked && (
                    <Bookmark className="w-3.5 h-3.5 text-amber-500 fill-current absolute top-1.5 end-1.5 z-10 drop-shadow-xs" />
                  )}

                  <div className={`w-full aspect-[1/1.414] rounded-md border overflow-hidden flex items-center justify-center relative shadow-2xs transition-colors ${
                    isCurrent ? 'border-white/50 bg-white/20' : 'border-subtle/60 bg-surface/60'
                  }`}>
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={`Page ${pg}`}
                        className="w-full h-full object-cover object-top select-none pointer-events-none"
                        loading="lazy"
                      />
                    ) : textSnippet ? (
                      <div className="w-full h-full p-1 text-[6.5px] text-muted overflow-hidden select-none font-serif leading-tight opacity-75">
                        {textSnippet.slice(0, 100)}
                      </div>
                    ) : (
                      <span className={`text-[10px] font-mono ${isCurrent ? 'text-white/80' : 'text-muted'}`}>{pg}</span>
                    )}
                  </div>

                  <span className={`text-[11px] font-mono shrink-0 ${isCurrent ? 'text-white font-bold' : 'text-muted group-hover:text-main'}`}>
                    {pg}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Bookmarks */}
      {activeTab === 'bookmarks' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {bookmarkedPages.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center text-muted text-xs space-y-1">
              <Bookmark className="w-8 h-8 opacity-30 text-amber-500" />
              <span>لا توجد إشارات مرجعية محفوظة</span>
            </div>
          ) : (
            bookmarkedPages.map((pg) => (
              <button
                key={pg}
                onClick={() => onJumpToPage(pg)}
                className={`w-full text-start p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                  readingPage === pg
                    ? 'bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-300 font-bold'
                    : 'bg-canvas border-subtle hover:bg-surface text-main'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Bookmark className="w-3.5 h-3.5 text-amber-500 fill-current" />
                  <span className="font-serif text-xs">إشارة مرجعية في الصفحة {pg}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted rtl:rotate-180" />
              </button>
            ))
          )}
        </div>
      )}
    </aside>
  );
};
