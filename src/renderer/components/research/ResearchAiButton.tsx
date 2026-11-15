'use client';
/**
 * KEY-373 (RE-12): the research AI panel (bottom-right button). Summarise, rewrite, translate, outline, review
 * or ask, grounded in the open chapter and the sources it cites, through the user's own provider (BYOK).
 * Answers carry numbered citations that open the BagLib source.
 */
import React, { Suspense, useRef, useState } from 'react';
import { Sparkles, X, Send, Bot, Loader2, Copy, FilePlus2, Settings } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { answerForInsert, type ResearchAiAction, type ResearchAiCitation } from '../../../shared/research-ai';

const AISettingsModal = React.lazy(() => import('../ai/AISettingsModal').then(module => ({ default: module.AISettingsModal })));

interface Props {
  language: 'ar' | 'en';
  documentId?: string;
  /** Saves the open chapter so the request reads its latest text. */
  flush(): Promise<void>;
  selectedText(): string;
  insertParagraphs(text: string): Promise<number>;
  openSource(url: string): void;
}

type Message =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; citations: ResearchAiCitation[]; sourceCount: number; inserted?: boolean }
  | { role: 'error'; text: string; settings?: boolean };

export function ResearchAiButton({ language, documentId, flush, selectedText, insertParagraphs, openSource }: Props) {
  const { t } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [log, setLog] = useState<Message[]>([]);
  const end = useRef<HTMLDivElement>(null);

  const actions: { key: Exclude<ResearchAiAction, 'ask'>; label: string }[] = [
    { key: 'summarize', label: t('researchAiPromptSummarize') },
    { key: 'rewrite', label: t('researchAiPromptRewrite') },
    { key: 'translate', label: t('researchAiPromptTranslate') },
    { key: 'outline', label: t('researchAiPromptOutline') },
    { key: 'review', label: t('researchAiPromptReview') },
  ];

  const push = (message: Message) => {
    setLog(prev => [...prev, message]);
    requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' }));
  };

  const run = async (action: ResearchAiAction, label: string, question?: string) => {
    if (busy || !documentId) return;
    const selection = action === 'outline' || action === 'ask' && !question ? '' : selectedText();
    push({ role: 'user', text: selection && action !== 'ask' ? `${label}\n«${selection.length > 160 ? selection.slice(0, 160) + '…' : selection}»` : label });
    setBusy(true);
    try {
      await flush();
      const result = await window.electronAPI.ai.researchEditor({
        documentId, action, question, selection: selection || undefined, lang: language,
        targetLang: action === 'translate' ? (language === 'ar' ? 'en' : 'ar') : undefined,
      });
      if (result.ok) {
        push({ role: 'assistant', text: result.text, citations: result.citations, sourceCount: result.sourceCount });
      } else if (result.error === 'not-configured') {
        push({ role: 'error', text: t('researchAiNotConfigured'), settings: true });
      } else if (result.error === 'needs-selection') {
        push({ role: 'error', text: t('researchAiNeedsSelection') });
      } else {
        push({ role: 'error', text: t('researchAiProviderError').replace('{message}', result.message ?? result.error) });
      }
    } catch (error) {
      push({ role: 'error', text: t('researchAiProviderError').replace('{message}', error instanceof Error ? error.message : String(error)) });
    } finally {
      setBusy(false);
    }
  };

  const insert = async (index: number) => {
    const message = log[index];
    if (message?.role !== 'assistant') return;
    await insertParagraphs(answerForInsert(message.text, message.citations));
    setLog(prev => prev.map((item, i) => (i === index && item.role === 'assistant' ? { ...item, inserted: true } : item)));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="research-ai-fab"
        title={t('researchAiButton')}
        aria-label={t('researchAiButton')}
        aria-expanded={isOpen}
        data-research-ai-fab
      >
        <Sparkles className="w-5 h-5 text-white" />
      </button>

      {isOpen && (
        <aside className="research-ai-drawer animate-in slide-in-from-bottom-5 duration-200" role="dialog" aria-label={t('researchAiTitle')} data-research-ai-panel>
          <div className="research-ai-drawer-header flex items-center justify-between p-4 border-b border-border-subtle bg-surface-panel">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Sparkles className="w-4 h-4" /></div>
              <div>
                <h3 className="font-semibold text-sm text-text-main">{t('researchAiTitle')}</h3>
                <span className="text-[10px] text-text-muted">{t('researchAiSubtitle')}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setSettingsOpen(true)} className="p-1 rounded-md text-text-muted hover:text-text-main hover:bg-surface-base" aria-label={t('researchAiOpenSettings')} title={t('researchAiOpenSettings')}>
                <Settings className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setIsOpen(false)} className="p-1 rounded-md text-text-muted hover:text-text-main hover:bg-surface-base" aria-label={t('researchAiClose')}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-3 bg-surface-base/60 border-b border-border-subtle flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-text-muted px-1">{t('researchAiQuickActions')}</span>
            <div className="flex flex-wrap gap-1.5">
              {actions.map(action => (
                <button
                  key={action.key}
                  type="button"
                  disabled={busy}
                  // Keep the editor selection: the iframe keeps it, and mousedown here does not clear it.
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => void run(action.key, action.label)}
                  data-research-ai-action={action.key}
                  className="research-ai-prompt-chip text-xs px-2.5 py-1 rounded-md bg-surface-panel border border-border-subtle hover:border-primary/40 hover:text-primary transition-colors text-start disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-text-muted px-1">{t('researchAiSelectionHint')}</span>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-[160px] max-h-[360px]" aria-live="polite">
            {log.length === 0 && !busy ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-muted text-xs">
                <Bot className="w-8 h-8 mb-2 text-primary opacity-60" />
                <p className="max-w-[240px] leading-relaxed">{t('researchAiPlaceholder')}</p>
              </div>
            ) : (
              log.map((message, index) => (
                <div
                  key={index}
                  data-research-ai-message={message.role}
                  className={`research-ai-message flex flex-col text-xs rounded-xl p-3 ${
                    message.role === 'user' ? 'bg-primary text-primary-foreground ms-6'
                      : message.role === 'error' ? 'bg-surface-base border border-red-500/40 text-text-main me-6'
                        : 'bg-surface-base border border-border-subtle text-text-main me-6'
                  }`}
                >
                  <span className="text-[10px] opacity-70 mb-1 font-semibold">{message.role === 'user' ? t('researchAiYou') : t('researchAiAssistant')}</span>
                  <p dir="auto" className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                  {message.role === 'error' && message.settings && (
                    <button type="button" onClick={() => setSettingsOpen(true)} className="mt-2 self-start rounded-md border border-border-subtle px-2 py-1 hover:border-primary/40">{t('researchAiOpenSettings')}</button>
                  )}
                  {message.role === 'assistant' && (
                    <>
                      {message.citations.length > 0 && (
                        <ol className="mt-2 pt-2 border-t border-border-subtle space-y-1" aria-label={t('researchAiSources')} data-research-ai-citations>
                          {message.citations.map(citation => (
                            <li key={citation.n} className="flex gap-1.5">
                              <span className="tabular-nums text-text-muted">[{citation.n}]</span>
                              <button type="button" dir="auto" onClick={() => openSource(citation.ref)} className="text-start font-medium text-primary-text underline-offset-2 hover:underline" data-research-ai-citation={citation.ref}>{citation.label}</button>
                            </li>
                          ))}
                        </ol>
                      )}
                      <span className="mt-2 text-[10px] text-text-muted">{t('researchAiContextNote').replace('{count}', message.sourceCount.toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US'))}</span>
                      <div className="mt-2 flex gap-1.5">
                        <button type="button" disabled={message.inserted} onClick={() => void insert(index)} data-research-ai-insert className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 hover:border-primary/40 disabled:opacity-60">
                          <FilePlus2 className="w-3 h-3" />{message.inserted ? t('researchAiInserted') : t('researchAiInsert')}
                        </button>
                        <button type="button" onClick={() => void navigator.clipboard?.writeText(answerForInsert(message.text, message.citations))} className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 hover:border-primary/40">
                          <Copy className="w-3 h-3" />{t('researchAiCopy')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-text-muted" data-research-ai-busy>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />{t('researchAiThinking')}
              </div>
            )}
            <div ref={end} />
          </div>

          <form
            onSubmit={event => {
              event.preventDefault();
              const question = query.trim();
              if (!question) return;
              setQuery('');
              void run('ask', question, question);
            }}
            className="p-3 border-t border-border-subtle bg-surface-panel flex items-center gap-2"
          >
            <input
              type="text"
              dir="auto"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('researchAiPlaceholder')}
              aria-label={t('researchAiPlaceholder')}
              data-research-ai-input
              className="flex-1 text-xs px-3 py-2 rounded-lg bg-surface-base border border-border-subtle text-text-main placeholder:text-text-muted focus:outline-hidden focus:border-primary transition-colors"
            />
            <button type="submit" disabled={!query.trim() || busy} className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0" aria-label={t('researchAiSend')}>
              <Send className="w-3.5 h-3.5 rtl:-scale-x-100" />
            </button>
          </form>
        </aside>
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
          <AISettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} t={t} />
        </Suspense>
      )}
    </>
  );
}
