'use client';
import { markAiGenerated } from '../../../shared/ai-principles';
/**
 * KEY-384: the app-wide AI assistant: a floating button on every tab and a chat panel that keeps its conversation
 * while the user moves around. It talks naturally, uses what the user attaches (notes, ayahs, hadith, book pages)
 * and the open chapter in the editor, and cites them. Quick actions adapt to the page; flashcards keep the checked
 * study-assistant pipeline with approval, and the full study tools stay one click away.
 */
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenText, Bot, Check, Copy, FilePlus2, FileText, Loader2, NotebookPen, Plus, RotateCcw, Send, Settings, Sparkles, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAssistant, type AssistantMessage } from './AssistantContext';
import { useRemoteConsent } from './useRemoteConsent';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { answerForInsert } from '../../../shared/research-ai';
import { cardSourceKind, passageKind, type AssistantCard } from '../../../shared/study-assistant';
import type { ChatAction, ChatSourceRef } from '../../../shared/assistant-chat';
import { matchesStudyQuery, parseBookTarget } from '../../../shared/study-notes';
import { searchCorpus, type CorpusOption } from '../../utils/corpus-lookup';
import { collectionKeys } from '../../utils/sunnah-collections';
import { openStudyNote } from '../../utils/study-navigation';
import { useOpenStudyLink } from '../../utils/use-study-link';
import { ContextMenu } from '../ui/ContextMenu';
import type { TranslationKey } from '../../translations';

const AISettingsModal = React.lazy(() => import('./AISettingsModal').then(module => ({ default: module.AISettingsModal })));
const StudyAssistant = React.lazy(() => import('../notes/StudyAssistant').then(module => ({ default: module.StudyAssistant })));
const ExplainBack = React.lazy(() => import('../notes/ExplainBack').then(module => ({ default: module.ExplainBack })));

type QuickAction = ChatAction | 'cards';
const chapterActions: [QuickAction, TranslationKey][] = [['summarize', 'researchAiPromptSummarize'], ['rewrite', 'researchAiPromptRewrite'], ['translate', 'researchAiPromptTranslate'], ['outline', 'researchAiPromptOutline'], ['review', 'researchAiPromptReview']];
const studyActions: [QuickAction, TranslationKey][] = [['summarize', 'assistantActionSummarize'], ['explain', 'assistantActionExplain'], ['guide', 'assistantTaskGuide'], ['questions', 'assistantTaskQuestions'], ['terms', 'assistantTaskTerms'], ['cards', 'assistantTaskCards']];
type CardsMessage = { id: number; role: 'cards'; cards: AssistantCard[]; state: Record<number, 'added' | 'skipped'> };
type Message = AssistantMessage | CardsMessage;

export function GlobalAssistant() {
  const { t, lang, dir, books, openBookForReading } = useWorkspace();
  const assistant = useAssistant();
  const { open, setOpen, sources, setSources, page, draft, setDraft } = assistant;
  const messages = assistant.messages as Message[];
  const setMessages = assistant.setMessages as React.Dispatch<React.SetStateAction<Message[]>>;
  const consent = useRemoteConsent();
  const { notes } = useStudyNotes();
  const [busy, setBusy] = useState(false);
  const [usePage, setUsePage] = useState(true);
  const [consentFor, setConsentFor] = useState<{ text: string; action?: QuickAction; label: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ query: string; items: CorpusOption[] }>({ query: '', items: [] });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [studyTools, setStudyTools] = useState(false);
  const [explain, setExplain] = useState<ChatSourceRef | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const chapter = usePage && page?.chapterId ? page : null;
  const actions = chapter ? chapterActions : studyActions;

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages, busy, open]);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    let live = true;
    const timer = setTimeout(() => { void searchCorpus(['quran', 'hadith'], term, id => t(collectionKeys[id]), 6).then(items => { if (live) setFound({ query: term, items }); }).catch(() => { if (live) setFound({ query: term, items: [] }); }); }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query, t]);
  const noteHits = useMemo(() => (query.trim().length < 2 ? notes.slice(0, 6) : notes.filter(note => matchesStudyQuery(`${note.title} ${note.content}`, query)).slice(0, 6)), [notes, query]);
  const corpusHits = query.trim().length >= 2 && found.query === query.trim() ? found.items : [];
  const attach = (ref: ChatSourceRef) => setSources(current => (current.some(item => item.target === ref.target) || current.length >= 20 ? current : [...current, ref]));
  const push = (message: Message) => setMessages(current => [...current, message]);
  const id = () => ++nextId.current;
  const errorText = (code: string, detail?: string) => {
    const keys: Record<string, TranslationKey> = {
      'not-configured': 'researchAiNotConfigured', 'needs-selection': 'researchAiNeedsSelection', 'ai-disabled': 'assistantErrorDisabled', busy: 'assistantErrorBusy',
      'provider-quota': 'aiErrorQuota', 'provider-busy': 'aiErrorBusy', 'provider-auth': 'aiErrorAuth', 'provider-too-large': 'aiErrorTooLarge', 'provider-model': 'aiErrorModel', 'provider-terms': 'aiErrorTerms', 'no-sources': 'assistantCardsNeedSources', 'invalid-output': 'assistantErrorUnchecked',
    };
    const base = keys[code] ? t(keys[code]) : t('researchAiProviderError').replace('{message}', detail || code);
    return detail && keys[code] && code.startsWith('provider') ? `${base}\n${t('aiErrorDetail').replace('{detail}', detail)}` : base;
  };

  /** Sends a message or a quick action; the provider is checked first and a remote one is asked about once. */
  const send = async (text: string, action?: QuickAction, label?: string) => {
    if (busy || (!action && !text.trim())) return;
    const status = await consent.check().catch(() => ({ local: false, allowed: false, ready: false }));
    if (!status.ready) { push({ id: id(), role: 'error', text: t('researchAiNotConfigured'), settings: true }); return; }
    if (!status.local && !status.allowed) { setConsentFor({ text, action, label: label ?? text }); return; }
    setConsentFor(null);
    void run(text, action, label ?? text, status.allowed);
  };
  const allowAndSend = async () => {
    if (!consentFor) return;
    const pending = consentFor;
    await consent.allow();
    setConsentFor(null);
    void run(pending.text, pending.action, pending.label, true);
  };

  const run = async (text: string, action: QuickAction | undefined, label: string, allowRemote: boolean) => {
    const selection = chapter?.selectedText?.() || undefined;
    push({ id: id(), role: 'user', text: action ? (text.trim() ? `${label}\n${text.trim()}` : label) + (selection && action !== 'outline' ? `\n«${selection.length > 140 ? selection.slice(0, 140) + '…' : selection}»` : '') : text.trim() });
    if (!action) setDraft('');
    setBusy(true);
    try {
      await chapter?.flush?.();
      if (action === 'cards') {
        const passages = sources.filter(ref => !ref.target.startsWith('note:') && passageKind(ref.target)).map(ref => ({ target: ref.target, label: ref.label }));
        const noteIds = sources.filter(ref => ref.target.startsWith('note:')).map(ref => ref.target.slice(5).split('#')[0]);
        if (!noteIds.length && !passages.length) { push({ id: id(), role: 'error', text: t('assistantCardsNeedSources') }); return; }
        const result = await window.electronAPI.studyAssistant.ask({ task: 'cards', question: text.trim(), language: lang === 'ar' ? 'ar' : 'en', allowRemote, notes: noteIds, books: [], passages });
        if (result.ok && result.data.cards.length) push({ id: id(), role: 'cards', cards: result.data.cards, state: {} });
        else push({ id: id(), role: 'error', text: result.ok ? t('assistantErrorUnchecked') : errorText(result.error, result.detail) });
        return;
      }
      const history = messages.filter((message): message is Extract<Message, { role: 'user' | 'assistant' }> => message.role === 'user' || message.role === 'assistant').map(message => ({ role: message.role, text: message.text }));
      const result = await window.electronAPI.studyAssistant.chat({
        messages: [...history, ...(text.trim() ? [{ role: 'user' as const, text: text.trim() }] : [])],
        sources, chapterId: chapter?.chapterId, selection, action, lang: lang === 'ar' ? 'ar' : 'en', allowRemote,
      });
      if (result.ok) push({ id: id(), role: 'assistant', text: result.text, citations: result.citations, sourceCount: result.sourceCount });
      else push({ id: id(), role: 'error', text: errorText(result.error, result.detail), settings: ['not-configured', 'provider-quota', 'provider-busy', 'provider-auth', 'provider-too-large', 'provider-model', 'provider-terms', 'ai-disabled'].includes(result.error) });
    } catch (error) {
      push({ id: id(), role: 'error', text: errorText('engine-failed', error instanceof Error ? error.message : String(error)) });
    } finally {
      setBusy(false);
    }
  };

  const { openLink, linkHandlers, linkMenuItems } = useOpenStudyLink();
  const openSource = (target: string) => void openLink(target).catch(() => {});
  const asNote = (message: Extract<Message, { role: 'assistant' }>) => [t('aiGeneratedMarker'), '', message.text, ...(message.citations.length ? ['', `## ${t('assistantSources')}`, ...message.citations.map(citation => `- [${citation.n}] [[${citation.ref}|${citation.label.replace(/[[\]|\r\n]/gu, ' ')}]]`)] : [])].join('\n') + '\n';
  const insert = async (message: Extract<Message, { role: 'assistant' }>) => {
    if (!chapter?.insert) return;
    await chapter.insert(markAiGenerated(answerForInsert(message.text, message.citations), t('aiGeneratedMarker')));
    setMessages(current => current.map(item => (item.id === message.id && item.role === 'assistant' ? { ...item, inserted: true } : item)));
  };
  const addCard = async (message: CardsMessage, index: number) => {
    const card = message.cards[index];
    await window.electronAPI.knowledgeCards.save({ front: card.front, back: markAiGenerated(card.back, t('aiGeneratedMarker')), sourceKind: cardSourceKind(card.target), sourceRef: card.target, sourceLabel: card.label, workId: parseBookTarget(card.target)?.id });
    window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'));
    setMessages(current => current.map(item => (item.id === message.id && item.role === 'cards' ? { ...item, state: { ...item.state, [index]: 'added' } } : item)));
  };
  const explainable = sources.filter(ref => passageKind(ref.target));

  return <>
    <button type="button" onClick={() => setOpen(!open)} data-assistant-fab data-research-ai-fab aria-expanded={open} aria-label={t('researchAiButton')} title={t('researchAiButton')}
      className="fixed bottom-12 end-5 z-[45] flex size-12 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-blue-500 to-violet-500 text-white shadow-lg shadow-blue-500/30 transition-transform hover:scale-105 active:scale-95">
      {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
    </button>

    {open && <aside role="dialog" aria-label={t('researchAiTitle')} data-assistant-panel data-research-ai-panel dir={dir}
      className="fixed bottom-28 end-5 z-[45] flex h-[min(74vh,660px)] w-[min(27rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-subtle bg-surface text-main shadow-2xl">
      <header className="flex items-center gap-2.5 border-b border-subtle px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-white"><Sparkles className="size-4" /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight">{t('researchAiTitle')}</h3>
          <p className="truncate text-[10px] text-muted">{t('researchAiSubtitle')}</p>
        </div>
        <div className="ms-auto flex items-center gap-0.5">
          <button type="button" data-assistant-new-chat onClick={() => { setMessages([]); setConsentFor(null); }} disabled={busy || !messages.length} aria-label={t('assistantNewChat')} title={t('assistantNewChat')} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-main disabled:opacity-30"><RotateCcw className="size-4" /></button>
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label={t('researchAiOpenSettings')} title={t('researchAiOpenSettings')} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-main"><Settings className="size-4" /></button>
          <button type="button" onClick={() => setOpen(false)} aria-label={t('researchAiClose')} title={t('researchAiClose')} className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-main"><X className="size-4" /></button>
        </div>
      </header>

      {/* What the assistant can see: the page's context and the attached sources */}
      <div className="relative flex flex-wrap items-center gap-1.5 border-b border-subtle bg-canvas/50 px-3 py-2">
        {page && <button type="button" data-assistant-page-context onClick={() => setUsePage(!usePage)} aria-pressed={usePage} title={page.label}
          className={`inline-flex max-w-[14rem] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${usePage ? 'border-primary/50 bg-primary/10 text-primary-text' : 'border-subtle text-muted line-through'}`}>
          <FileText className="size-3 shrink-0" /><span className="truncate" dir="auto">{t('assistantPageContext', { label: page.label })}</span>
        </button>}
        {sources.map(ref => <span key={ref.target} data-assistant-source={ref.target} className="inline-flex max-w-[12rem] items-center gap-1 rounded-full border border-subtle bg-surface px-2 py-0.5 text-[11px]">
          {ref.target.startsWith('note:') ? <NotebookPen className="size-3 shrink-0" /> : <BookOpenText className="size-3 shrink-0" />}
          <span className="truncate" dir="auto">{ref.label}</span>
          <button type="button" onClick={() => setSources(current => current.filter(item => item.target !== ref.target))} aria-label={t('assistantRemoveSource', { label: ref.label })} className="rounded-full hover:text-main"><X className="size-3" /></button>
        </span>)}
        <button type="button" data-assistant-add-source onClick={() => setPicker(!picker)} aria-expanded={picker} className="inline-flex items-center gap-1 rounded-full border border-dashed border-subtle px-2 py-0.5 text-[11px] text-muted hover:border-primary/50 hover:text-main">
          <Plus className="size-3" />{t('assistantAddSource')}
        </button>
        {picker && <div className="absolute inset-x-3 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-xl border border-subtle bg-surface p-2 shadow-xl">
          <input type="search" autoFocus dir="auto" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('assistantSourceSearch')} aria-label={t('assistantSourceSearch')} data-assistant-source-search
            className="mb-1.5 w-full rounded-lg border border-subtle bg-canvas px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none" />
          <ul className="space-y-0.5 text-xs">
            {noteHits.map(note => <li key={note.id}><button type="button" data-assistant-pick={`note:${note.id}`} onClick={() => { attach({ target: `note:${note.id}`, label: note.title || note.content.slice(0, 60) }); setPicker(false); setQuery(''); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-canvas">
              <NotebookPen className="size-3.5 shrink-0 text-muted" /><span dir="auto" className="truncate">{note.title || note.content.slice(0, 60)}</span>
            </button></li>)}
            {corpusHits.map(option => <li key={option.target}><button type="button" data-assistant-pick={option.target} onClick={() => { attach({ target: option.target, label: option.label }); setPicker(false); setQuery(''); }} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-canvas">
              <BookOpenText className="mt-0.5 size-3.5 shrink-0 text-muted" /><span className="min-w-0"><b dir="auto" className="block">{t(option.kind === 'quran' ? 'studyLinkKindAyah' : 'studyLinkKindHadith')} · {option.label}</b><span dir="auto" className="block truncate text-muted">{option.snippet}</span></span>
            </button></li>)}
          </ul>
        </div>}
      </div>

      {/* Conversation */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.length === 0 && !busy && <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted">
          <Bot className="size-8 text-primary opacity-70" />
          <p className="max-w-[260px] leading-relaxed">{chapter ? t('researchAiSelectionHint') : t('assistantChatEmpty')}</p>
        </div>}
        {messages.map(message => {
          if (message.role === 'cards') return <div key={message.id} data-research-ai-message="cards" className="me-4 space-y-2 rounded-xl border border-subtle bg-canvas p-3 text-xs">
            <span className="text-[10px] font-semibold text-muted">{t('assistantCardsTitle')}</span>
            {message.cards.map((card, index) => <div key={index} className="rounded-lg border border-subtle bg-surface p-2">
              <p dir="auto" className="font-semibold">{card.front}</p>
              <p dir="auto" className="text-muted">{card.back}</p>
              <p dir="auto" className="mt-1 text-[10px] text-muted">{card.label}: «{card.quote}»</p>
              <div className="mt-1.5 flex gap-1.5">
                {message.state[index] ? <span className="font-semibold">{t(message.state[index] === 'added' ? 'assistantCardAdded' : 'assistantCardSkipped')}</span> : <>
                  <button type="button" onClick={() => void addCard(message, index)} className="inline-flex items-center gap-1 rounded-md border border-emerald-500 px-2 py-0.5 text-emerald-700 dark:text-emerald-300"><Check className="size-3" />{t('assistantCardAdd')}</button>
                  <button type="button" onClick={() => setMessages(current => current.map(item => (item.id === message.id && item.role === 'cards' ? { ...item, state: { ...item.state, [index]: 'skipped' } } : item)))} className="rounded-md border border-subtle px-2 py-0.5">{t('assistantCardSkip')}</button>
                </>}
              </div>
            </div>)}
          </div>;
          return <div key={message.id} data-research-ai-message={message.role}
            className={`flex flex-col rounded-2xl px-3 py-2.5 text-xs ${message.role === 'user' ? 'ms-8 rounded-ee-md bg-primary text-white' : message.role === 'error' ? 'me-4 border border-red-500/40 bg-red-500/10' : 'me-4 rounded-es-md border border-subtle bg-canvas'}`}>
            {message.role !== 'user' && <span className="mb-1 text-[10px] font-semibold opacity-70">{t('researchAiAssistant')}</span>}
            <p dir="auto" className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
            {message.role === 'error' && message.settings && <button type="button" onClick={() => setSettingsOpen(true)} className="mt-2 self-start rounded-md border border-subtle px-2 py-1">{t('researchAiOpenSettings')}</button>}
            {message.role === 'assistant' && <>
              {message.citations.length > 0 && <ol className="mt-2 space-y-1 border-t border-subtle pt-2" aria-label={t('researchAiSources')} data-research-ai-citations>
                {message.citations.map(citation => <ContextMenu as="li" tabIndex={-1} key={citation.n} items={linkMenuItems(citation.ref, { title: citation.label })} className="flex gap-1.5">
                  <span className="tabular-nums text-muted">[{citation.n}]</span>
                  <button type="button" dir="auto" {...linkHandlers(citation.ref, { title: citation.label })} data-research-ai-citation={citation.ref} className="text-start font-medium text-primary-text underline-offset-2 hover:underline">{citation.label}</button>
                </ContextMenu>)}
              </ol>}
              <p data-ai-principles-notice className="mt-2 text-[11px] leading-loose text-muted">{t('aiGeneratedMarker')} · {t('aiPrinciplesNotice')}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chapter?.insert && <button type="button" disabled={message.inserted} onClick={() => void insert(message)} data-research-ai-insert className="inline-flex items-center gap-1 rounded-md border border-subtle px-2 py-1 hover:border-primary/40 disabled:opacity-60"><FilePlus2 className="size-3" />{message.inserted ? t('researchAiInserted') : t('researchAiInsert')}</button>}
                <button type="button" onClick={() => openStudyNote({ content: asNote(message) })} data-assistant-save-note className="inline-flex items-center gap-1 rounded-md border border-subtle px-2 py-1 hover:border-primary/40"><NotebookPen className="size-3" />{t('assistantSaveNote')}</button>
                <button type="button" onClick={() => void navigator.clipboard?.writeText(answerForInsert(message.text, message.citations))} className="inline-flex items-center gap-1 rounded-md border border-subtle px-2 py-1 hover:border-primary/40"><Copy className="size-3" />{t('researchAiCopy')}</button>
              </div>
            </>}
          </div>;
        })}
        {busy && <div data-research-ai-busy className="flex items-center gap-2 text-xs text-muted"><Loader2 className="size-3.5 animate-spin" />{t('researchAiThinking')}</div>}
        <div ref={end} />
      </div>

      <p data-ai-recall-nudge className="px-3 py-2 text-[11px] leading-loose text-muted">{t('aiRecallNudge')}</p>
      {/* Composer */}
      <div className="border-t border-subtle bg-surface p-2.5">
        {consentFor && <div data-assistant-consent role="alertdialog" className="mb-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-2 text-[11px] leading-relaxed">
          <p dir="auto">{t('assistantConsentAsk', { provider: (consent.customName ?? t(consent.providerLabel)) })}</p>
          <div className="mt-1.5 flex gap-1.5">
            <button type="button" data-assistant-consent-allow onClick={() => void allowAndSend()} className="rounded-full bg-primary px-3 py-1 font-semibold text-white">{t('assistantConsentAllow')}</button>
            <button type="button" data-assistant-consent-cancel onClick={() => setConsentFor(null)} className="rounded-full border border-subtle px-3 py-1">{t('assistantConsentCancel')}</button>
          </div>
        </div>}
        <div className="mb-1.5 flex flex-wrap gap-1" role="group" aria-label={t('researchAiQuickActions')}>
          {actions.map(([key, labelKey]) => <button key={key} type="button" disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => void send(draft, key, t(labelKey))} data-research-ai-action={key}
            className="rounded-full border border-subtle bg-canvas px-2.5 py-0.5 text-[11px] transition-colors hover:border-primary/50 hover:text-primary-text disabled:opacity-40">{t(labelKey)}</button>)}
        </div>
        <form onSubmit={event => { event.preventDefault(); void send(draft); }} className="flex items-end gap-2 rounded-xl border border-subtle bg-canvas p-1.5 focus-within:border-primary">
          <textarea rows={1} dir="auto" value={draft} onChange={event => setDraft(event.target.value)} data-research-ai-input
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); } }}
            placeholder={t('researchAiPlaceholder')} aria-label={t('researchAiPlaceholder')}
            className="max-h-32 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1 text-xs leading-relaxed placeholder:text-muted focus:outline-none" />
          <button type="submit" disabled={!draft.trim() || busy} aria-label={t('researchAiSend')} className="shrink-0 rounded-lg bg-primary p-2 text-white disabled:opacity-40"><Send className="size-3.5 rtl:-scale-x-100" /></button>
        </form>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-muted">
          {consent.ready && <span data-assistant-provider className="inline-flex min-w-0 items-center gap-1">
            <span className={`size-1.5 shrink-0 rounded-full ${consent.local || consent.allowed ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
            <span className="truncate" dir="auto">{consent.local ? t('assistantRunsLocally') : t(consent.allowed ? 'assistantSendingTo' : 'assistantAsksFirst', { provider: (consent.customName ?? t(consent.providerLabel)) })}</span>
            {!consent.local && consent.allowed && <button type="button" onClick={() => void consent.revoke()} className="underline-offset-2 hover:text-main hover:underline">{t('assistantConsentRevoke')}</button>}
          </span>}
          {explainable.length === 1 && <button type="button" onClick={() => setExplain(explainable[0])} className="hover:text-main hover:underline">{t('explainBackTitle')}</button>}
          <button type="button" data-assistant-study-tools onClick={() => setStudyTools(true)} className="ms-auto hover:text-main hover:underline">{t('assistantStudyTools')}</button>
        </div>
      </div>
    </aside>}

    <Suspense fallback={null}>
      {settingsOpen && <AISettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} t={t} />}
      {studyTools && <StudyAssistant notes={notes} initialNotes={sources.filter(ref => ref.target.startsWith('note:')).map(ref => ref.target.slice(5).split('#')[0])} onClose={() => setStudyTools(false)} />}
      {explain && <ExplainBack target={explain.target} label={explain.label} onClose={() => setExplain(null)} onOpen={target => { setExplain(null); openSource(target); }} />}
    </Suspense>
  </>;
}
