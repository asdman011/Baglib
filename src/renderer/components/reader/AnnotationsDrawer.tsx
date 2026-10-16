'use client';

import React, { useState, useMemo } from 'react';
import {
  Highlighter,
  MessageSquare,
  BookMarked,
  PenTool,
  Trash2,
  X,
  Search,
  Download,
  Filter,
  Palette,
  ExternalLink,
  Tag,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { AnnotationDTO, AnnotationType } from '../../../shared/types/annotation';
import type { BookBibliographicInfo, BookWithAnnotations } from '../../../shared/types/export';
import { HIGHLIGHT_COLORS } from '../../libs/reader/highlight-manager';
import { TranslationKey } from '../../translations';
import { ExportModal } from './ExportModal';

interface AnnotationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  annotations: AnnotationDTO[];
  currentPage: number;
  bookTitle: string;
  bookAuthor?: string;
  bookIsbn?: string;
  bookFormat?: string;
  activeBookInfo?: BookBibliographicInfo;
  allBooksWithNotes?: BookWithAnnotations[];
  onJumpToPage: (page: number) => void;
  onDeleteAnnotation: (id: string) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  direction?: 'rtl' | 'ltr';
}

type TabType = 'all' | 'highlight' | 'note' | 'bookmark' | 'ink';

export const AnnotationsDrawer: React.FC<AnnotationsDrawerProps> = ({
  isOpen,
  onClose,
  annotations,
  currentPage,
  bookTitle,
  bookAuthor,
  bookIsbn,
  bookFormat,
  activeBookInfo,
  allBooksWithNotes,
  onJumpToPage,
  onDeleteAnnotation,
  t,
  direction = 'ltr',
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'current'>('all');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Count items per category
  const counts = useMemo(() => {
    return {
      all: annotations.length,
      highlight: annotations.filter((a) => a.type === 'highlight' || a.type === 'underline').length,
      note: annotations.filter((a) => a.type === 'note').length,
      bookmark: annotations.filter((a) => a.type === 'bookmark').length,
      ink: annotations.filter((a) => a.type === 'ink').length,
    };
  }, [annotations]);

  // Filtered annotations
  const filteredAnnotations = useMemo(() => {
    return annotations.filter((annot) => {
      // Tab filter
      if (activeTab === 'highlight' && annot.type !== 'highlight' && annot.type !== 'underline') {
        return false;
      }
      if (activeTab === 'note' && annot.type !== 'note') return false;
      if (activeTab === 'bookmark' && annot.type !== 'bookmark') return false;
      if (activeTab === 'ink' && annot.type !== 'ink') return false;

      // Scope filter (current page vs all)
      if (scopeFilter === 'current') {
        const pageNum = parseInt(annot.locationCfiOrPage, 10);
        if (pageNum !== currentPage) return false;
      }

      // Color filter
      if (selectedColor !== 'all') {
        if (!annot.color || !annot.color.includes(selectedColor)) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const textMatch = annot.selectedText?.toLowerCase().includes(q);
        const noteMatch = annot.noteContent?.toLowerCase().includes(q);
        const tagMatch = annot.tags?.some((tag) => tag.toLowerCase().includes(q));
        const pageMatch = annot.locationCfiOrPage.includes(q);
        if (!textMatch && !noteMatch && !tagMatch && !pageMatch) return false;
      }

      return true;
    });
  }, [annotations, activeTab, scopeFilter, selectedColor, searchQuery, currentPage]);

  // Open Comprehensive Multi-Format Export Modal (KEY-138)
  const handleOpenExport = () => {
    setIsExportModalOpen(true);
  };

  if (!isOpen) return null;

  return (
    <>
      <aside
        dir={direction}
        className="absolute top-0 bottom-0 inset-inline-end-0 w-80 sm:w-96 bg-surface/95 backdrop-blur-md border-s border-subtle z-30 shadow-2xl flex flex-col font-sans animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="p-3.5 border-b border-subtle flex items-center justify-between bg-canvas/30 shrink-0">
          <div className="flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-pale-sky-500" />
            <h3 className="font-bold text-main text-xs sm:text-sm">
              {t('annotationsDrawerTitle')}
            </h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-400 font-bold">
              {annotations.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleOpenExport}
              title={t('exportAnnotationsTitle')}
              className="p-1.5 rounded-lg hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-subtle bg-canvas/40 p-1 gap-1 text-[11px] shrink-0 overflow-x-auto">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all text-center whitespace-nowrap cursor-pointer ${
            activeTab === 'all'
              ? 'bg-pale-sky-500 text-white shadow-sm'
              : 'text-muted hover:text-main'
          }`}
        >
          {t('allNotesTab' as any) || 'All'} ({counts.all})
        </button>
        <button
          onClick={() => setActiveTab('highlight')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
            activeTab === 'highlight'
              ? 'bg-pale-sky-500 text-white shadow-sm'
              : 'text-muted hover:text-main'
          }`}
        >
          <Highlighter className="w-3 h-3" />
          <span>{t('tabHighlights')}</span>
          <span className="opacity-75 text-[10px]">({counts.highlight})</span>
        </button>
        <button
          onClick={() => setActiveTab('note')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
            activeTab === 'note'
              ? 'bg-pale-sky-500 text-white shadow-sm'
              : 'text-muted hover:text-main'
          }`}
        >
          <MessageSquare className="w-3 h-3" />
          <span>{t('tabNotes')}</span>
          <span className="opacity-75 text-[10px]">({counts.note})</span>
        </button>
        <button
          onClick={() => setActiveTab('bookmark')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
            activeTab === 'bookmark'
              ? 'bg-pale-sky-500 text-white shadow-sm'
              : 'text-muted hover:text-main'
          }`}
        >
          <BookMarked className="w-3 h-3" />
          <span>{t('tabBookmarks')}</span>
          <span className="opacity-75 text-[10px]">({counts.bookmark})</span>
        </button>
        <button
          onClick={() => setActiveTab('ink')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
            activeTab === 'ink'
              ? 'bg-pale-sky-500 text-white shadow-sm'
              : 'text-muted hover:text-main'
          }`}
        >
          <PenTool className="w-3 h-3" />
          <span>{t('tabInk')}</span>
          <span className="opacity-75 text-[10px]">({counts.ink})</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-2.5 border-b border-subtle bg-canvas/20 space-y-2 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted absolute inset-inline-start-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchAnnotations')}
            className="w-full ps-8 pe-3 py-1.5 rounded-xl border border-subtle bg-surface text-main text-xs outline-none focus:ring-1 focus:ring-pale-sky-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-inline-end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-main p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Scope and Color Filter */}
        <div className="flex items-center justify-between gap-1 text-[11px]">
          {/* Scope: Current page vs All */}
          <div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-subtle">
            <button
              onClick={() => setScopeFilter('all')}
              className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                scopeFilter === 'all'
                  ? 'bg-pale-sky-500 text-white'
                  : 'text-muted hover:text-main'
              }`}
            >
              {t('allNotesTab' as any) || 'All Pages'}
            </button>
            <button
              onClick={() => setScopeFilter('current')}
              className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                scopeFilter === 'current'
                  ? 'bg-pale-sky-500 text-white'
                  : 'text-muted hover:text-main'
              }`}
            >
              {t('page')} {currentPage}
            </button>
          </div>

          {/* Color Selector */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedColor('all')}
              title={t('filterAllColors')}
              className={`w-5 h-5 rounded-full border text-[9px] flex items-center justify-center font-bold cursor-pointer ${
                selectedColor === 'all'
                  ? 'border-pale-sky-500 ring-2 ring-pale-sky-500/30'
                  : 'border-subtle bg-canvas text-muted'
              }`}
            >
              *
            </button>
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedColor(c.id)}
                title={c.label}
                className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${
                  selectedColor === c.id
                    ? 'ring-2 ring-offset-1 ring-pale-sky-500 scale-110'
                    : 'opacity-70 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Annotations List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredAnnotations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted space-y-2">
            <Sparkles className="w-8 h-8 opacity-40 text-pale-sky-500" />
            <p className="text-xs font-medium">{t('noAnnotationsFound')}</p>
          </div>
        ) : (
          filteredAnnotations.map((item) => {
            const pageNum = parseInt(item.locationCfiOrPage, 10) || 1;
            return (
              <div
                key={item.id}
                className="p-3 rounded-2xl bg-canvas border border-subtle hover:border-pale-sky-500/40 hover:shadow-sm transition-all text-xs group space-y-2 relative"
              >
                {/* Header: Page Badge, Type Icon, Jump Button, Delete */}
                <div className="flex items-center justify-between text-[11px] text-muted font-bold">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onJumpToPage(pageNum)}
                      className="px-2 py-0.5 rounded-full bg-surface border border-subtle hover:border-pale-sky-500 text-main flex items-center gap-1 cursor-pointer transition-colors"
                      title={t('goToPage' as any) || `Jump to page ${pageNum}`}
                    >
                      <span className="text-[10px]">{t('page')}</span>
                      <span>{pageNum}</span>
                      <ExternalLink className="w-2.5 h-2.5 text-pale-sky-500" />
                    </button>

                    {/* Color dot */}
                    {item.color && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            HIGHLIGHT_COLORS.find((c) => item.color?.includes(c.id))?.hex ||
                            item.color,
                        }}
                      />
                    )}

                    {/* Type indicator */}
                    <span className="text-[10px] text-muted uppercase font-mono">
                      {item.type}
                    </span>
                  </div>

                  <button
                    onClick={() => onDeleteAnnotation(item.id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-opacity p-1 cursor-pointer"
                    title={t('deleteNote')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Selected text / Quote */}
                {item.selectedText && (
                  <blockquote
                    onClick={() => onJumpToPage(pageNum)}
                    className="border-s-2 border-pale-sky-500 ps-2.5 italic text-muted text-[11px] font-serif bg-surface/50 p-1.5 rounded-lg cursor-pointer hover:text-main transition-colors"
                  >
                    "{item.selectedText}"
                  </blockquote>
                )}

                {/* Note / Margin content */}
                {item.noteContent && (
                  <p className="text-main font-medium leading-relaxed select-text text-start">
                    {item.noteContent}
                  </p>
                )}

                {/* Freehand Ink summary */}
                {item.type === 'ink' && item.strokeData && (
                  <div className="flex items-center gap-1.5 text-[10px] text-pale-sky-600 dark:text-pale-sky-400 font-mono">
                    <PenTool className="w-3 h-3" />
                    <span>{item.strokeData.length} strokes drawn</span>
                  </div>
                )}

                {/* Tags */}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {item.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-[9px] px-1.5 py-0.5 rounded-md bg-surface border border-subtle text-muted flex items-center gap-1"
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Timestamp */}
                <div className="flex items-center gap-1 text-[9px] text-muted/70 font-mono pt-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
      </aside>

      {/* Comprehensive Multi-Format Exporter & PKM Sync Modal (KEY-138) */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        activeBook={
          activeBookInfo || {
            title: bookTitle,
            author: bookAuthor,
            isbn: bookIsbn,
            format: bookFormat,
          }
        }
        annotations={annotations}
        allBooksWithNotes={allBooksWithNotes}
        t={t}
        direction={direction}
      />
    </>
  );
};
