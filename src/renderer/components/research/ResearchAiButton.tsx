'use client';

import React, { useState } from 'react';
import { translations } from '../../translations';
import { Sparkles, X, Send, Bot } from 'lucide-react';

interface Props {
  language: 'ar' | 'en';
  documentTitle?: string;
}

export function ResearchAiButton({ language, documentTitle }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [chatLog, setChatLog] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const t = translations[language];

  const prompts = [
    { key: 'summarize', label: t.researchAiPromptSummarize },
    { key: 'citations', label: t.researchAiPromptCitations },
    { key: 'outline', label: t.researchAiPromptOutline },
    { key: 'review', label: t.researchAiPromptReview },
  ];

  const handleSendPrompt = (promptText: string) => {
    if (!promptText.trim()) return;
    const userMsg = promptText.trim();
    setQuery('');
    setChatLog(prev => [
      ...prev,
      { role: 'user', text: userMsg },
      {
        role: 'assistant',
        text: language === 'ar'
          ? `[نظام الذكاء الاصطناعي BYOK - RE-12]\nتم ربط هذا الطلب ببيانات المخطوط («${documentTitle || 'المستند الحالي'}»). محرك البحث المرجعي مستعد لتقديم التلخيص والتحقيق الأكاديمي بمجرد ربط مفتاح API الخاص بك في إعدادات BYOK.`
          : `[BYOK Research AI - RE-12]\nGrounded request received for "${documentTitle || 'Current Chapter'}". The research synthesis engine is ready to assist with scholarly citations and textual analysis using your configured BYOK provider.`,
      },
    ]);
  };

  return (
    <>
      {/* Floating circular AI button at bottom-right (AFFiNE style) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="research-ai-fab"
        title={t.researchAiButton}
        aria-label={t.researchAiButton}
        aria-expanded={isOpen}
      >
        <Sparkles className="w-5 h-5 text-white animate-pulse" />
      </button>

      {/* Slide-out Research AI Assistant Drawer / Panel */}
      {isOpen && (
        <aside
          className="research-ai-drawer animate-in slide-in-from-bottom-5 duration-200"
          role="dialog"
          aria-label={t.researchAiTitle}
        >
          {/* Header */}
          <div className="research-ai-drawer-header flex items-center justify-between p-4 border-b border-border-subtle bg-surface-panel">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-text-main">{t.researchAiTitle}</h3>
                <span className="text-[10px] text-text-muted flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  {t.researchAiSubtitle}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-text-muted hover:text-text-main hover:bg-surface-base transition-colors"
              aria-label={t.researchAiClose}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Prompt Suggestions */}
          <div className="p-3 bg-surface-base/60 border-b border-border-subtle flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-text-muted px-1">
              {language === 'ar' ? 'إجراءات بحثية سريعة:' : 'Quick research actions:'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {prompts.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handleSendPrompt(p.label)}
                  className="research-ai-prompt-chip text-xs px-2.5 py-1 rounded-md bg-surface-panel border border-border-subtle hover:border-primary/40 hover:text-primary transition-colors text-start"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Messages Log */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-[160px] max-h-[320px]">
            {chatLog.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-muted text-xs">
                <Bot className="w-8 h-8 mb-2 text-primary opacity-60" />
                <p className="max-w-[240px] leading-relaxed">
                  {t.researchAiPlaceholder}
                </p>
              </div>
            ) : (
              chatLog.map((msg, i) => (
                <div
                  key={i}
                  className={`research-ai-message flex flex-col text-xs rounded-xl p-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground ms-6'
                      : 'bg-surface-base border border-border-subtle text-text-main me-6'
                  }`}
                >
                  <span className="text-[10px] opacity-70 mb-1 font-semibold">
                    {msg.role === 'user' ? (language === 'ar' ? 'أنت' : 'You') : 'BYOK AI'}
                  </span>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                </div>
              ))
            )}
          </div>

          {/* Input Footer */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSendPrompt(query);
            }}
            className="p-3 border-t border-border-subtle bg-surface-panel flex items-center gap-2"
          >
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t.researchAiPlaceholder}
              className="flex-1 text-xs px-3 py-2 rounded-lg bg-surface-base border border-border-subtle text-text-main placeholder:text-text-muted focus:outline-hidden focus:border-primary transition-colors"
            />
            <button
              type="submit"
              disabled={!query.trim()}
              className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0"
              aria-label={t.researchAiSend}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
