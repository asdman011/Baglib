'use client';

import React, { useState } from 'react';
import {
  MessageSquare,
  Quote,
  HelpCircle,
  Tag,
  Copy,
  BookA,
  Library,
  Sparkles,
  Headphones,
  X,
  Check,
  BookmarkCheck,
  Underline,
  Strikethrough,
} from 'lucide-react';
import type { TranslationKey } from '../../translations';
import { HIGHLIGHT_COLORS } from '../../libs/reader/highlight-manager';

export interface ZenSelectionMenuProps {
  studyActions?: React.ReactNode;
  selectedText: string;
  readingPage: number;
  bookTitle: string;
  bookAuthor?: string;
  bookPublisher?: string;
  onApplyHighlight: (colorId: string) => void;
  onApplyUnderline?: () => void;
  onApplyStrike?: () => void;
  onSaveNote: (content: string) => void;
  onSaveQuote: (contextNote?: string) => void;
  onSaveQuestion: (questionText: string) => void;
  onOpenDictionary: () => void;
  onOpenKnowledgeCard: () => void;
  onOpenAI: () => void;
  onPlayTTS: () => void;
  onClose: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const ZenSelectionMenu: React.FC<ZenSelectionMenuProps> = ({
  selectedText,
  studyActions,
  readingPage,
  bookTitle,
  bookAuthor,
  bookPublisher,
  onApplyHighlight,
  onApplyUnderline,
  onApplyStrike,
  onSaveNote,
  onSaveQuote,
  onSaveQuestion,
  onOpenDictionary,
  onOpenKnowledgeCard,
  onOpenAI,
  onPlayTTS,
  onClose,
  t,
}) => {
  const [activeTab, setActiveTab] = useState<'toolbar' | 'note' | 'quote' | 'question'>('toolbar');
  const [noteContent, setNoteContent] = useState('');
  const [quoteContextNote, setQuoteContextNote] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [copiedCitation, setCopiedCitation] = useState(false);

  if (!selectedText.trim()) return null;

  const handleCopyCitation = () => {
    const citation = `[${bookTitle} - ${bookAuthor || 'مؤلف غير معروف'}، ${bookPublisher || 'طبعة خاصة'}، ص ${readingPage}]`;
    navigator.clipboard.writeText(citation).then(() => {
      setCopiedCitation(true);
      setTimeout(() => setCopiedCitation(false), 2000);
    });
  };

  return (
    <div
      style={{
        top: 'max(4rem, calc(var(--reader-toolbar-bottom, 0px) + 0.75rem))',
        maxHeight: 'calc(100dvh - max(4rem, calc(var(--reader-toolbar-bottom, 0px) + 0.75rem)) - 1rem)',
        overflowY: 'auto',
      }}
      role="dialog"
      aria-label={t('readerStudyActions')}
      onMouseDown={(e) => {
        // Prevent action menu mousedown from bubbling to reader containers and stealing focus/selection
        e.stopPropagation();
        e.preventDefault();
      }}
      className="fixed top-16 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 z-50 animate-in fade-in zoom-in-95 duration-150 select-none max-w-lg w-full px-4"
    >
      <div className="bg-surface/95 backdrop-blur-xl border border-subtle shadow-2xl rounded-2xl p-2.5 text-xs text-main">
        {studyActions}
        {/* Default Pill Toolbar */}
        {activeTab === 'toolbar' && (
          <div className="flex flex-wrap items-center gap-1.5 justify-between">
            {/* Snippet preview */}
            <span className="font-serif text-muted italic max-w-[140px] sm:max-w-xs truncate px-2 border-s-2 border-pale-sky-500">
              &quot;{selectedText}&quot;
            </span>

            {/* 5 Semantic Highlight Colors */}
            <div className="flex items-center gap-1 px-1 border-s border-e border-subtle/50">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onApplyHighlight(c.id);
                  }}
                  title={`Highlight (${c.label})`}
                  className="w-5 h-5 rounded-full hover:scale-125 transition-transform cursor-pointer shadow-xs border border-white/20"
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>

            {/* Actions: Underline, Strike, Note, Quote, Question, Dictionary, AI, TTS, Copy */}
            <div className="flex items-center gap-0.5">
              {onApplyUnderline && (
                <button
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onApplyUnderline();
                  }}
                  title={t('markupToolUnderline')}
                  className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>
              )}

              {onApplyStrike && (
                <button
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onApplyStrike();
                  }}
                  title={t('markupToolStrike')}
                  className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Add Margin Note */}
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('note');
                }}
                title={t('addNoteAction')}
                className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>

              {/* Save as Scholarly Quote */}
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('quote');
                }}
                title={t('saveQuoteAction')}
                className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>

              {/* Ask Research Question */}
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('question');
                }}
                title={t('askQuestionAction')}
                className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>

              {/* Dictionary Lookup */}
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDictionary();
                }}
                title={t('dictionaryLookupBtn')}
                className="p-1.5 rounded-xl hover:bg-canvas text-pale-sky-600 dark:text-pale-sky-400 hover:text-pale-sky-700 transition-colors cursor-pointer"
              >
                <BookA className="w-3.5 h-3.5" />
              </button>

              {/* Knowledge Card */}
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenKnowledgeCard();
                }}
                title={t('knowledgeCardOpen')}
                className="p-1.5 rounded-xl hover:bg-canvas text-amber-600 dark:text-amber-400 transition-colors"
              >
                <Library className="w-3.5 h-3.5" />
              </button>

              {/* AI Research Assistant */}
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAI();
                }}
                title={t('aiAssistantTitle')}
                className="p-1.5 rounded-xl hover:bg-canvas text-indigo-500 hover:text-indigo-600 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>

              {/* TTS Read Aloud */}
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayTTS();
                }}
                title={t('ttsReadAloudSelection')}
                className="p-1.5 rounded-xl hover:bg-canvas text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 transition-colors cursor-pointer"
              >
                <Headphones className="w-3.5 h-3.5" />
              </button>

              {/* Copy Scholarly Citation */}
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyCitation();
                }}
                title={t('copyScholarlyCitation')}
                className="p-1.5 rounded-xl hover:bg-canvas text-amber-600 dark:text-amber-400 hover:text-amber-700 transition-colors cursor-pointer"
              >
                {copiedCitation ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              <div className="h-4 w-px bg-subtle/50 mx-0.5" />

              {/* Close */}
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1 rounded-lg text-muted hover:text-main hover:bg-canvas cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Add Note Sub-Card */}
        {activeTab === 'note' && (
          <div className="space-y-2 p-1">
            <div className="flex items-center justify-between font-bold text-xs">
              <span className="flex items-center gap-1.5 text-pale-sky-600">
                <MessageSquare className="w-3.5 h-3.5" />
                {t('addNoteAction')} (p. {readingPage})
              </span>
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={() => setActiveTab('toolbar')}
                className="text-muted hover:text-main cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              autoFocus
              onMouseDown={(e) => e.stopPropagation()}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="اكتب ملاحظتك البحثية هنا..."
              className="w-full h-20 p-2 rounded-xl bg-canvas border border-subtle text-main text-xs outline-none focus:border-pale-sky-500 font-sans resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={() => setActiveTab('toolbar')}
                className="px-3 py-1 rounded-lg border border-subtle text-muted hover:text-main font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                disabled={!noteContent.trim()}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={() => {
                  onSaveNote(noteContent);
                  setActiveTab('toolbar');
                  onClose();
                }}
                className="px-3 py-1 rounded-lg bg-pale-sky-500 text-white font-bold hover:bg-pale-sky-600 disabled:opacity-40 cursor-pointer"
              >
                حفظ الملاحظة
              </button>
            </div>
          </div>
        )}

        {/* Save Quote Sub-Card with Scholarly Citation */}
        {activeTab === 'quote' && (
          <div className="space-y-2 p-1">
            <div className="flex items-center justify-between font-bold text-xs">
              <span className="flex items-center gap-1.5 text-amber-600">
                <Quote className="w-3.5 h-3.5" />
                {t('saveQuoteAction')}
              </span>
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={() => setActiveTab('toolbar')}
                className="text-muted hover:text-main cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-muted text-[11px] font-serif border-s-2 border-amber-500/50 ps-2 line-clamp-2">
              &quot;{selectedText}&quot;
            </p>
            <input
              type="text"
              onMouseDown={(e) => e.stopPropagation()}
              value={quoteContextNote}
              onChange={(e) => setQuoteContextNote(e.target.value)}
              placeholder="سياق الاقتباس أو تعليق إضافي (اختياري)..."
              className="w-full p-2 rounded-xl bg-canvas border border-subtle text-main text-xs outline-none focus:border-amber-500 font-sans"
            />
            <div className="flex items-center justify-between pt-1">
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={handleCopyCitation}
                className="flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-700 font-bold cursor-pointer"
              >
                {copiedCitation ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>{t('copyScholarlyCitation')}</span>
              </button>
              <div className="flex gap-2">
                <button
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={() => setActiveTab('toolbar')}
                  className="px-3 py-1 rounded-lg border border-subtle text-muted hover:text-main font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={() => {
                    onSaveQuote(quoteContextNote);
                    setActiveTab('toolbar');
                    onClose();
                  }}
                  className="px-3 py-1 rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600 cursor-pointer"
                >
                  حفظ الاقتباس
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Ask Question Sub-Card */}
        {activeTab === 'question' && (
          <div className="space-y-2 p-1">
            <div className="flex items-center justify-between font-bold text-xs">
              <span className="flex items-center gap-1.5 text-indigo-600">
                <HelpCircle className="w-3.5 h-3.5" />
                {t('askQuestionAction')}
              </span>
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={() => setActiveTab('toolbar')}
                className="text-muted hover:text-main cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              autoFocus
              onMouseDown={(e) => e.stopPropagation()}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="ما السؤال البحثي أو الإشكال الذي يثيره هذا النص؟"
              className="w-full h-20 p-2 rounded-xl bg-canvas border border-subtle text-main text-xs outline-none focus:border-indigo-500 font-sans resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={() => setActiveTab('toolbar')}
                className="px-3 py-1 rounded-lg border border-subtle text-muted hover:text-main font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                disabled={!questionText.trim()}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={() => {
                  onSaveQuestion(questionText);
                  setActiveTab('toolbar');
                  onClose();
                }}
                className="px-3 py-1 rounded-lg bg-indigo-500 text-white font-bold hover:bg-indigo-600 disabled:opacity-40 cursor-pointer"
              >
                حفظ السؤال
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
