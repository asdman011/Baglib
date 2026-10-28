'use client';
import { errorMessage } from '../../../shared/errors';


import React, { useState } from 'react';
import {
  Sparkles,
  ShieldCheck,
  BookA,
  FileText,
  UserCheck,
  Languages,
  MessageSquare,
  Send,
  Loader2,
  Copy,
  Check,
  BookmarkPlus,
  Settings,
  X,
  RefreshCw,
  Quote,
  ShieldAlert,
} from 'lucide-react';
import type {
  AIResearchToolType,
  AIResearchResult,
  AIResearchQueryPayload,
} from '../../../shared/types/ai';
import { TranslationKey } from '../../translations';

interface AIResearchAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bookId?: string;
  bookTitle: string;
  authorName?: string;
  currentPage: number;
  selectedText?: string;
  surroundingContext?: string;
  initialTool?: AIResearchToolType;
  onOpenSettings: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const AIResearchAssistantDrawer: React.FC<AIResearchAssistantDrawerProps> = ({
  isOpen,
  onClose,
  bookId,
  bookTitle,
  authorName,
  currentPage,
  selectedText,
  surroundingContext,
  initialTool = 'chat',
  onOpenSettings,
  t,
}) => {
  const [activeTool, setActiveTool] = useState<AIResearchToolType>(initialTool);
  const [userQuery, setUserQuery] = useState<string>('');
  const [targetLang, setTargetLang] = useState<string>('ar');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<AIResearchResult | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isSavedToNotes, setIsSavedToNotes] = useState<boolean>(false);

  const [previousResetInputs1, setPreviousResetInputs1] = useState<readonly unknown[] | null>(null);
  const resetInputs1 = [initialTool];
  if (previousResetInputs1 === null || resetInputs1.some((value, index) => !Object.is(value, previousResetInputs1[index]))) {
    setPreviousResetInputs1(resetInputs1);

    if (initialTool) {
      setActiveTool(initialTool);
    }

  }

  // Auto pre-fill input when selection changes
  const [previousResetInputs2, setPreviousResetInputs2] = useState<readonly unknown[] | null>(null);
  const resetInputs2 = [selectedText, activeTool];
  if (previousResetInputs2 === null || resetInputs2.some((value, index) => !Object.is(value, previousResetInputs2[index]))) {
    setPreviousResetInputs2(resetInputs2);

    if (selectedText) {
      if (activeTool === 'contextual_dictionary' || activeTool === 'biographical_tarajim') {
        setUserQuery(selectedText.trim());
      }
    }

  }

  const handleExecuteTool = async (forceSaveNote = false) => {
    setIsLoading(true);
    setIsSavedToNotes(false);
    setIsCopied(false);

    try {
      const windowAPI = (window).electronAPI;
      if (windowAPI?.ai?.executeTool) {
        const payload: AIResearchQueryPayload = {
          bookId,
          bookTitle,
          authorName,
          currentPage,
          selectedText: selectedText || userQuery || undefined,
          surroundingContext: surroundingContext || selectedText || undefined,
          tool: activeTool,
          userQuery: userQuery || undefined,
          targetLang: activeTool === 'inline_translation' ? targetLang : undefined,
          saveAsNote: forceSaveNote,
        };

        const res: AIResearchResult = await windowAPI.ai.executeTool(payload);
        setResult(res);
        if (forceSaveNote && res.savedNoteId) {
          setIsSavedToNotes(true);
        }
      } else {
        // Mock fallback for browser dev mode
        setResult({
          content: `[Mock AI Response for ${activeTool} on Page ${currentPage}]\n\nReflections on "${bookTitle}":\nThe arguments developed up to page ${currentPage} present foundational scholarly distinctions. Under the Anti-Spoiler RAG ceiling, future events and conclusions remain protected.`,
          tool: activeTool,
          spoilerPrevented: true,
          providerUsed: 'mock-llm',
          durationMs: 420,
        });
      }
    } catch (err: unknown) {
      setResult({
        content: `Error: ${errorMessage(err) || 'Execution failed'}`,
        tool: activeTool,
        spoilerPrevented: false,
        providerUsed: 'error',
        durationMs: 0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result?.content) return;
    navigator.clipboard.writeText(result.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSaveToNotes = async () => {
    if (!result?.content || !bookId) return;
    try {
      const windowAPI = (window).electronAPI;
      if (windowAPI?.saveAnnotation) {
        await windowAPI.saveAnnotation({
          bookId,
          type: 'note',
          locationCfiOrPage: String(currentPage),
          selectedText: selectedText || null,
          noteContent: result.content,
          color: '#4f46e5',
          tags: ['AI-Research', activeTool],
        });
        setIsSavedToNotes(true);
      }
    } catch (err) {
      console.warn('[AIResearchDrawer] Could not save note:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-y-0 end-0 z-50 w-full max-w-lg bg-white dark:bg-zinc-900 border-s border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col text-start animate-in slide-in-from-right duration-250"
      dir="auto"
    >
      {/* Top Header */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {t('aiAssistantTitle')}
              </h2>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
              {bookTitle} {authorName ? `· ${authorName}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenSettings}
            title={t('aiSettingsBtn')}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Anti-Spoiler Ceiling Status Badge */}
      <div className="px-4 py-2 border-b border-indigo-100 dark:border-indigo-950/40 bg-indigo-50/40 dark:bg-indigo-950/20 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-medium">
          <ShieldCheck className="w-4 h-4" />
          <span>{t('aiAntiSpoilerBadge', { page: currentPage })}</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono">
          Page {currentPage}
        </span>
      </div>

      {/* Tool Navigation Chips */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max">
          {[
            { id: 'chat', label: t('aiToolChat'), icon: MessageSquare },
            { id: 'contextual_dictionary', label: t('aiToolLexicon'), icon: BookA },
            { id: 'structured_summary', label: t('aiToolSummary'), icon: FileText },
            { id: 'biographical_tarajim', label: t('aiToolTarajim'), icon: UserCheck },
            { id: 'inline_translation', label: t('aiToolTranslation'), icon: Languages },
          ].map((tool) => {
            const Icon = tool.icon;
            const isSelected = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => {
                  setActiveTool(tool.id as AIResearchToolType);
                  setResult(null);
                  setIsSavedToNotes(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                  isSelected
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tool.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Body Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-zinc-800 dark:text-zinc-200">
        {/* Active Selection Quote (if any) */}
        {selectedText && (
          <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
              <Quote className="w-3 h-3 text-indigo-500" />
              <span>{t('aiSelectedTextHeader')}</span>
            </div>
            <p className="italic text-zinc-700 dark:text-zinc-300 line-clamp-3 leading-relaxed">
              &quot;{selectedText}&quot;
            </p>
          </div>
        )}

        {/* Input / Parameters for Active Tool */}
        <div className="space-y-2">
          {activeTool === 'chat' && (
            <textarea
              rows={3}
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder={t('aiChatQueryPlaceholder')}
              className="w-full p-3 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          )}

          {activeTool === 'contextual_dictionary' && (
            <div>
              <input
                type="text"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder={t('aiLexiconQueryPlaceholder')}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {activeTool === 'biographical_tarajim' && (
            <div>
              <input
                type="text"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder={t('aiTarajimQueryPlaceholder')}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {activeTool === 'inline_translation' && (
            <div className="flex items-center gap-2">
              <label className="text-zinc-600 dark:text-zinc-400 shrink-0 font-medium">
                {t('aiTargetLangLabel')}
              </label>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ar">{t('aiTargetLangAr')}</option>
                <option value="en">{t('aiTargetLangEn')}</option>
                <option value="fr">{t('aiTargetLangFr')}</option>
                <option value="de">{t('aiTargetLangDe')}</option>
                <option value="tr">{t('aiTargetLangTr')}</option>
              </select>
            </div>
          )}

          {/* Action Trigger Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExecuteTool(false)}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{isLoading ? t('aiAnalyzingStatus') : t('aiExecuteActionBtn')}</span>
            </button>

            {activeTool === 'structured_summary' && (
              <button
                onClick={() => handleExecuteTool(true)}
                disabled={isLoading}
                title={t('aiSaveToNotesBtn')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-indigo-300 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition disabled:opacity-50"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>{t('aiSaveToNotesBtn')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Results View */}
        {result && (
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
            {/* Result Header & Controls */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-500">
                {result.providerUsed} · {result.durationMs}ms
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition"
                  title={t('aiCopyOutputBtn')}
                >
                  {isCopied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                {bookId && !isSavedToNotes && (
                  <button
                    onClick={handleSaveToNotes}
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition"
                    title={t('aiSaveToNotesBtn')}
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Note Saved Confirmation */}
            {isSavedToNotes && (
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px] flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                <span>{t('aiSavedToNotesSuccess')}</span>
              </div>
            )}

            {/* Generated Content Body */}
            <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/30 whitespace-pre-wrap leading-relaxed font-sans text-xs select-text">
              {result.content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
