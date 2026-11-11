'use client';

import { colorKeys } from './ReaderMarkupBar';
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
  NotebookPen,
} from 'lucide-react';
import type { AnnotationDTO, AnnotationType } from '../../../shared/types/annotation';
import type { BookBibliographicInfo, BookWithAnnotations } from '../../../shared/types/export';
import { HIGHLIGHT_COLORS } from '../../libs/reader/highlight-manager';
import { TranslationKey } from '../../translations';
import { ExportModal } from './ExportModal';
import { annotationPage } from '../../../shared/annotation-location';
import { normalizeArabicText } from '../../../shared/utils/text-normalizer';
import { annotationsToNote } from '../../../shared/annotation-note';
import { openStudyNote } from '../../utils/study-navigation';

interface AnnotationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  annotations: AnnotationDTO[];
  currentPage: number;
  bookTitle: string;
  sourceId?: string;
  bookAuthor?: string;
  bookIsbn?: string;
  bookFormat?: string;
  activeBookInfo?: BookBibliographicInfo;
  allBooksWithNotes?: BookWithAnnotations[];
  onJumpToPage: (page: number) => void;
  onDeleteAnnotation: (id: string) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  direction?: 'rtl' | 'ltr';
  embedded?: boolean;
}

type TabType = 'all' | 'highlight' | 'note' | 'bookmark' | 'ink';

export const AnnotationsDrawer: React.FC<AnnotationsDrawerProps> = ({
  isOpen,
  onClose,
  annotations,
  currentPage,
  bookTitle,
  sourceId,
  bookAuthor,
  bookIsbn,
  bookFormat,
  activeBookInfo,
  allBooksWithNotes,
  onJumpToPage,
  onDeleteAnnotation,
  t,
  direction = 'ltr',
  embedded = false,
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
        const pageNum = annotationPage(annot.locationCfiOrPage);
        if (pageNum !== currentPage) return false;
      }

      // Color filter
      if (selectedColor !== 'all') {
        if (!annot.color || !annot.color.includes(selectedColor)) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const normalize = (value: unknown) => normalizeArabicText(value, { normalizeTaaMarbuta: false });
        const q = normalize(searchQuery).trim();
        const textMatch = normalize(annot.selectedText).includes(q);
        const noteMatch = normalize(annot.noteContent).includes(q);
        const tagMatch = annot.tags?.some(tag => normalize(tag).includes(q));
        const pageMatch = String(annotationPage(annot.locationCfiOrPage) ?? '').includes(q);
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
        data-reader-annotations
        dir={direction}
        className={embedded ? 'flex min-h-0 h-full w-full flex-col overflow-hidden rounded-xl bg-surface font-sans' : 'absolute top-0 bottom-0 end-0 w-80 sm:w-96 bg-surface/95 backdrop-blur-md border-s border-subtle z-30 shadow-2xl flex flex-col font-sans animate-in duration-200'}
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
              type="button"
              data-annotations-to-note
              disabled={filteredAnnotations.length === 0}
              onClick={() => openStudyNote({ content: annotationsToNote(filteredAnnotations, { id: filteredAnnotations[0].bookId, title: bookTitle, sourceId }) })}
              title={t('annotationsToNote')}
              aria-label={t('annotationsToNote')}
              className="p-1.5 rounded-lg hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer disabled:opacity-40"
            >
              <NotebookPen className="w-4 h-4" />
            </button>
            <button
              onClick={handleOpenExport}
              title={t('exportAnnotationsTitle')}
              className="p-1.5 rounded-lg hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
             aria-label={t('exportAnnotationsTitle')}>
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              aria-label={t('close')}
              className="p-1.5 rounded-lg hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

      {/* Tabs */}
      <div data-annotation-tabs className={`${embedded ? 'grid grid-cols-5' : 'flex items-center overflow-x-auto'} border-b border-subtle bg-canvas/40 p-1 gap-1 text-[11px] shrink-0`}>
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 min-w-0 py-1.5 ${embedded ? 'px-1' : 'px-2'} rounded-lg font-bold transition-all text-center whitespace-nowrap cursor-pointer ${
            activeTab === 'all'
              ? 'bg-pale-sky-500 text-white shadow-sm'
              : 'text-muted hover:text-main'
          }`}
        >
          {t('allNotesTab')} ({counts.all})
        </button>
        <button
          onClick={() => setActiveTab('highlight')}
          title={t('tabHighlights')}
          className={`flex-1 min-w-0 py-1.5 ${embedded ? 'px-1' : 'px-2'} rounded-lg font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
            activeTab === 'highlight'
              ? 'bg-pale-sky-500 text-white shadow-sm'
              : 'text-muted hover:text-main'
          }`}
         aria-label={t('tabHighlights')}>
          <Highlighter className="w-3 h-3" />
          <span className={embedded ? 'sr-only' : undefined}>{t('tabHighlights')}</span>
          <span className="opacity-75 text-[10px]">({counts.highlight})</span>
        </button>
        <button
          onClick={() => setActiveTab('note')}
          title={t('tabNotes')}
          className={`flex-1 min-w-0 py-1.5 ${embedded ? 'px-1' : 'px-2'} rounded-lg font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
            activeTab === 'note'
              ? 'bg-pale-sky-500 text-white shadow-sm'
              : 'text-muted hover:text-main'
          }`}
         aria-label={t('tabNotes')}>
          <MessageSquare className="w-3 h-3" />
          <span className={embedded ? 'sr-only' : undefined}>{t('tabNotes')}</span>
          <span className="opacity-75 text-[10px]">({counts.note})</span>
        </button>
        <button
          onClick={() => setActiveTab('bookmark')}
          title={t('tabBookmarks')}
          className={`flex-1 min-w-0 py-1.5 ${embedded ? 'px-1' : 'px-2'} rounded-lg font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
            activeTab === 'bookmark'
              ? 'bg-pale-sky-500 text-white shadow-sm'
              : 'text-muted hover:text-main'
          }`}
         aria-label={t('tabBookmarks')}>
          <BookMarked className="w-3 h-3" />
          <span className={embedded ? 'sr-only' : undefined}>{t('tabBookmarks')}</span>
          <span className="opacity-75 text-[10px]">({counts.bookmark})</span>
        </button>
        <button
          onClick={() => setActiveTab('ink')}
          title={t('tabInk')}
          className={`flex-1 min-w-0 py-1.5 ${embedded ? 'px-1' : 'px-2'} rounded-lg font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
            activeTab === 'ink'
              ? 'bg-pale-sky-500 text-white shadow-sm'
              : 'text-muted hover:text-main'
          }`}
         aria-label={t('tabInk')}>
          <PenTool className="w-3 h-3" />
          <span className={embedded ? 'sr-only' : undefined}>{t('tabInk')}</span>
          <span className="opacity-75 text-[10px]">({counts.ink})</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-2.5 border-b border-subtle bg-canvas/20 space-y-2 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted absolute start-2.5 top-1/2 -translate-y-1/2" />
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
              aria-label={t('close')}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-main p-0.5"
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
              {t('allNotesTab') || 'All Pages'}
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
             aria-label={t('filterAllColors')}>
              *
            </button>
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedColor(c.id)}
                title={t(colorKeys[c.id])}
                  aria-label={t(colorKeys[c.id])}
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
            const pageNum = annotationPage(item.locationCfiOrPage) || 1;
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
                      title={t('goToPage', { page: pageNum })}
                     aria-label={t('goToPage', { page: pageNum })}>
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
                      {t(item.type === 'highlight' || item.type === 'underline' ? 'tabHighlights' : item.type === 'note' ? 'tabNotes' : item.type === 'bookmark' ? 'tabBookmarks' : 'tabInk')}
                    </span>
                  </div>

                  <button
                    onClick={() => onDeleteAnnotation(item.id)}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-rose-500 transition-opacity p-1 cursor-pointer"
                    title={t('deleteNote')}
                   aria-label={t('deleteNote')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Selected text / Quote */}
                {item.selectedText && (
                  <blockquote
                    onClick={() => onJumpToPage(pageNum)}
                    className="border-s-2 border-pale-sky-500 ps-2.5 italic text-muted text-[11px] font-serif bg-surface/50 p-1.5 rounded-lg cursor-pointer hover:text-main transition-colors"
                  >
                    &quot;{item.selectedText}&quot;
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
