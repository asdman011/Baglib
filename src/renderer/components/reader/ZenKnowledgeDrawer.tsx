'use client';

import React, { useState } from 'react';
import {
  Pin,
  PinOff,
  X,
  Highlighter,
  SlidersHorizontal,
  FileText,
  Quote,
  HelpCircle,
  Bookmark,
  Trash2,
  Search,
  ExternalLink,
  Palette,
  Type,
  Sun,
  Moon,
  Coffee,
} from 'lucide-react';
import type { KnowledgeItemDTO } from '../../../shared/types/knowledge';
import type { ReaderTheme } from '../../libs/reader/types';
import type { TranslationKey } from '../../translations';
import { HIGHLIGHT_COLORS } from '../../libs/reader/highlight-manager';

interface ZenKnowledgeDrawerProps {
  isOpen: boolean;
  isPinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  knowledgeItems: KnowledgeItemDTO[];
  onDeleteKnowledge: (id: string) => void;
  onJumpToLocation: (location: string) => void;
  readingPage: number;
  readerTheme: ReaderTheme;
  setReaderTheme: (theme: ReaderTheme) => void;
  fontFamily: string;
  setFontFamily: (font: string) => void;
  readerFontSize: number;
  setReaderFontSize: (size: number) => void;
  lineSpacing: number;
  setLineSpacing: (spacing: number) => void;
  paragraphSpacing: number;
  setParagraphSpacing: (spacing: number) => void;
  margin: number;
  setMargin: (m: number) => void;
  brightness: number;
  setBrightness: (b: number) => void;
  contrast: number;
  setContrast: (c: number) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const ZenKnowledgeDrawer: React.FC<ZenKnowledgeDrawerProps> = ({
  isOpen,
  isPinned,
  onTogglePin,
  onClose,
  onMouseEnter,
  onMouseLeave,
  knowledgeItems,
  onDeleteKnowledge,
  onJumpToLocation,
  readingPage,
  readerTheme,
  setReaderTheme,
  fontFamily,
  setFontFamily,
  readerFontSize,
  setReaderFontSize,
  lineSpacing,
  setLineSpacing,
  paragraphSpacing,
  setParagraphSpacing,
  margin,
  setMargin,
  brightness,
  setBrightness,
  contrast,
  setContrast,
  t,
}) => {
  const [activeTab, setActiveTab] = useState<'knowledge' | 'typography'>('knowledge');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageFilter, setPageFilter] = useState<'all' | 'current'>('all');

  const filteredKnowledge = knowledgeItems.filter((item) => {
    if (pageFilter === 'current' && item.location !== String(readingPage)) {
      return false;
    }
    if (filterType !== 'all' && item.knowledgeType !== filterType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText =
        (item.quotedText || '').toLowerCase().includes(q) ||
        (item.noteContent || '').toLowerCase().includes(q) ||
        (item.contextNote || '').toLowerCase().includes(q) ||
        (item.questionText || '').toLowerCase().includes(q);
      if (!matchText) return false;
    }
    return true;
  });

  return (
    <aside
      role="complementary"
      aria-label={t('knowledgeDrawer')}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`fixed top-14 bottom-0 inset-inline-end-0 w-80 sm:w-96 backdrop-blur-2xl bg-surface/95 border-s border-subtle/70 z-40 flex flex-col shadow-2xl transition-all duration-300 select-none ${
        isOpen
          ? 'opacity-100 translate-x-0 pointer-events-auto'
          : 'opacity-0 rtl:-translate-x-full ltr:translate-x-full pointer-events-none'
      }`}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* Header with Tabs & Pin toggle */}
      <div className="h-12 border-b border-subtle/60 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('knowledge')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'knowledge'
                ? 'bg-pale-sky-500 text-white shadow-xs'
                : 'text-muted hover:text-main'
            }`}
          >
            <Highlighter className="w-3.5 h-3.5" />
            <span>{t('knowledgeDrawer')}</span>
            {knowledgeItems.length > 0 && (
              <span className="text-[10px] px-1.5 rounded-full bg-white/20 font-mono">
                {knowledgeItems.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('typography')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'typography'
                ? 'bg-pale-sky-500 text-white shadow-xs'
                : 'text-muted hover:text-main'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{t('typographySettings')}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Pin/Unpin Drawer */}
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

      {/* Tab 1: Knowledge & Research Items */}
      {activeTab === 'knowledge' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Filters & Search */}
          <div className="p-3 border-b border-subtle/50 space-y-2 shrink-0">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute inset-inline-start-2.5 top-2.5 text-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="البحث في الملاحظات والاقتباسات..."
                className="w-full ps-8 pe-3 py-1.5 rounded-xl bg-canvas border border-subtle text-xs text-main outline-none focus:border-pale-sky-500"
              />
            </div>

            {/* Type Filter Pills */}
            <div className="flex items-center justify-between text-[11px] text-muted">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {['all', 'highlight', 'note', 'quote', 'question', 'bookmark'].map((tp) => (
                  <button
                    key={tp}
                    onClick={() => setFilterType(tp)}
                    className={`px-2 py-0.5 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                      filterType === tp
                        ? 'bg-surface border border-pale-sky-500 text-pale-sky-600 dark:text-pale-sky-300'
                        : 'hover:text-main'
                    }`}
                  >
                    {tp}
                  </button>
                ))}
              </div>

              {/* Page filter (Current vs All) */}
              <button
                onClick={() => setPageFilter(pageFilter === 'all' ? 'current' : 'all')}
                className="font-mono text-[10px] px-2 py-0.5 rounded border border-subtle hover:bg-canvas cursor-pointer shrink-0"
              >
                {pageFilter === 'current' ? `ص ${readingPage}` : 'الكل'}
              </button>
            </div>
          </div>

          {/* List of Knowledge Items */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {filteredKnowledge.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center text-muted text-xs space-y-1">
                <FileText className="w-8 h-8 opacity-30" />
                <span>{t('noNotesYet')}</span>
              </div>
            ) : (
              filteredKnowledge.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-canvas/70 border border-subtle hover:border-pale-sky-500/50 transition-all text-xs space-y-1.5 group"
                >
                  <div className="flex items-center justify-between text-[10px] text-muted font-mono">
                    <span className="flex items-center gap-1">
                      {item.knowledgeType === 'highlight' && <Highlighter className="w-3 h-3 text-amber-500" />}
                      {item.knowledgeType === 'note' && <FileText className="w-3 h-3 text-pale-sky-500" />}
                      {item.knowledgeType === 'quote' && <Quote className="w-3 h-3 text-amber-600" />}
                      {item.knowledgeType === 'question' && <HelpCircle className="w-3 h-3 text-indigo-500" />}
                      {item.knowledgeType === 'bookmark' && <Bookmark className="w-3 h-3 text-rose-500" />}
                      <span className="capitalize font-bold">{item.knowledgeType}</span>
                    </span>
                    <button
                      onClick={() => onJumpToLocation(item.location)}
                      className="hover:text-main hover:underline flex items-center gap-0.5"
                    >
                      <span>ص {item.location}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  {item.quotedText && (
                    <blockquote
                      className="border-s-2 ps-2 font-serif text-[11px] text-main/90 italic line-clamp-3"
                      style={{
                        borderColor:
                          item.color === 'emerald' ? '#10b981' :
                          item.color === 'rose' ? '#f43f5e' :
                          item.color === 'sky' ? '#0ea5e9' :
                          item.color === 'violet' ? '#8b5cf6' : '#f59e0b'
                      }}
                    >
                      &quot;{item.quotedText}&quot;
                    </blockquote>
                  )}

                  {item.noteContent && (
                    <p className="text-main leading-relaxed font-sans">{item.noteContent}</p>
                  )}
                  {item.contextNote && (
                    <p className="text-muted text-[11px] leading-relaxed font-sans">{item.contextNote}</p>
                  )}
                  {item.questionText && (
                    <p className="text-indigo-600 dark:text-indigo-300 font-bold leading-relaxed">
                      {item.questionText}
                    </p>
                  )}
                  {item.label && (
                    <p className="text-muted text-[11px]">{item.label}</p>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-subtle/30 text-[10px] text-muted">
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                    <button
                      onClick={() => onDeleteKnowledge(item.id)}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-500 p-0.5 transition-all cursor-pointer"
                      title={t('delete')}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Typography & Calibrated Reading Themes */}
      {activeTab === 'typography' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
          {/* Calibrated Themes (Paper, Sepia, Dusk, Midnight) */}
          <div className="space-y-2">
            <span className="font-bold text-main flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-pale-sky-500" />
              أنماط القراءة المعايرة (Themes)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setReaderTheme('paper')}
                className={`p-2.5 rounded-xl border text-start transition-all cursor-pointer flex flex-col gap-1 ${
                  readerTheme === 'paper' || readerTheme === 'light'
                    ? 'border-pale-sky-500 ring-2 ring-pale-sky-500/20'
                    : 'border-subtle hover:border-subtle/80'
                }`}
                style={{ backgroundColor: '#FAF8F5', color: '#1C1B18' }}
              >
                <span className="font-bold">{t('themePaper')}</span>
                <span className="text-[10px] opacity-70">Ivory & Ink</span>
              </button>

              <button
                onClick={() => setReaderTheme('sepia')}
                className={`p-2.5 rounded-xl border text-start transition-all cursor-pointer flex flex-col gap-1 ${
                  readerTheme === 'sepia'
                    ? 'border-amber-600 ring-2 ring-amber-600/20'
                    : 'border-subtle hover:border-subtle/80'
                }`}
                style={{ backgroundColor: '#F4ECD8', color: '#2B2118' }}
              >
                <span className="font-bold">{t('themeSepia')}</span>
                <span className="text-[10px] opacity-70">Parchment</span>
              </button>

              <button
                onClick={() => setReaderTheme('dusk')}
                className={`p-2.5 rounded-xl border text-start transition-all cursor-pointer flex flex-col gap-1 ${
                  readerTheme === 'dusk' || readerTheme === 'dark'
                    ? 'border-pale-sky-500 ring-2 ring-pale-sky-500/20'
                    : 'border-subtle hover:border-subtle/80'
                }`}
                style={{ backgroundColor: '#1E222A', color: '#D8DEE9' }}
              >
                <span className="font-bold">{t('themeDusk')}</span>
                <span className="text-[10px] opacity-70">Slate Dim</span>
              </button>

              <button
                onClick={() => setReaderTheme('midnight')}
                className={`p-2.5 rounded-xl border text-start transition-all cursor-pointer flex flex-col gap-1 ${
                  readerTheme === 'midnight' || readerTheme === 'night'
                    ? 'border-pale-sky-500 ring-2 ring-pale-sky-500/20'
                    : 'border-subtle hover:border-subtle/80'
                }`}
                style={{ backgroundColor: '#0B0C0E', color: '#B8C0CC' }}
              >
                <span className="font-bold">{t('themeMidnight')}</span>
                <span className="text-[10px] opacity-70">OLED Pure Black</span>
              </button>
            </div>
          </div>

          {/* Curated Font Stacks */}
          <div className="space-y-2">
            <span className="font-bold text-main flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-pale-sky-500" />
              {t('fontFamily') || 'Font Family'}
            </span>
            <div className="space-y-1">
              <div className="text-[11px] text-muted font-bold pt-1">Classical Arabic</div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'amiri', name: 'Amiri (الأميري)' },
                  { id: 'scheherazade', name: 'Scheherazade New' },
                  { id: 'noto_naskh', name: 'Noto Naskh Arabic' },
                  { id: 'cairo', name: 'Cairo (القاهرة)' },
                  { id: 'ibm_plex', name: 'IBM Plex Arabic' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFontFamily(f.id)}
                    className={`p-2 rounded-xl border text-start text-xs font-bold transition-all cursor-pointer ${
                      fontFamily === f.id
                        ? 'bg-pale-sky-500 text-white border-pale-sky-500 shadow-xs'
                        : 'bg-canvas border-subtle hover:bg-surface text-muted hover:text-main'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>

              <div className="text-[11px] text-muted font-bold pt-2">English Academic</div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'literata', name: 'Literata' },
                  { id: 'merriweather', name: 'Merriweather' },
                  { id: 'charter', name: 'Charter' },
                  { id: 'inter', name: 'Inter Sans' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFontFamily(f.id)}
                    className={`p-2 rounded-xl border text-start text-xs font-bold transition-all cursor-pointer ${
                      fontFamily === f.id
                        ? 'bg-pale-sky-500 text-white border-pale-sky-500 shadow-xs'
                        : 'bg-canvas border-subtle hover:bg-surface text-muted hover:text-main'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Font Size Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-main">{t('fontSize')}</span>
              <span className="font-mono text-muted">{readerFontSize}px</span>
            </div>
            <input
              type="range"
              min={12}
              max={38}
              value={readerFontSize}
              onChange={(e) => setReaderFontSize(Number(e.target.value))}
              className="w-full h-1.5 bg-subtle/50 rounded-lg appearance-none cursor-pointer accent-pale-sky-500"
            />
          </div>

          {/* Line Spacing Slider (Tashkeel Protection) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-main">{t('lineSpacing')}</span>
              <span className="font-mono text-muted">{lineSpacing.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={1.4}
              max={2.5}
              step={0.05}
              value={lineSpacing}
              onChange={(e) => setLineSpacing(Number(e.target.value))}
              className="w-full h-1.5 bg-subtle/50 rounded-lg appearance-none cursor-pointer accent-pale-sky-500"
            />
          </div>

          {/* Margins */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-main">{t('margin')}</span>
              <span className="font-mono text-muted">{margin}px</span>
            </div>
            <input
              type="range"
              min={12}
              max={72}
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
              className="w-full h-1.5 bg-subtle/50 rounded-lg appearance-none cursor-pointer accent-pale-sky-500"
            />
          </div>

          {/* Brightness & Contrast */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-main">{t('brightness')}</span>
              <span className="font-mono text-muted">{brightness}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={150}
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-full h-1.5 bg-subtle/50 rounded-lg appearance-none cursor-pointer accent-pale-sky-500"
            />
          </div>
        </div>
      )}
    </aside>
  );
};
