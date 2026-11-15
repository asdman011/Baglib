'use client';
import {ExplainBack} from './ExplainBack';
import {bookStudyTarget} from '../../../shared/study-notes';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, BookOpenText, Check, Copy, FileText, Library, Loader2, MessageSquareQuote, NotebookPen, Send, Sparkles, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { answerAsNote, ASSISTANT_TASKS, cardSourceKind, type AssistantAnswer, type AssistantCard, type AssistantPassage, type AssistantTask } from '../../../shared/study-assistant';
import { searchCorpus, type CorpusOption } from '../../utils/corpus-lookup';
import { collectionKeys } from '../../utils/sunnah-collections';
import { parseBookTarget, matchesStudyQuery, type StudyNote } from '../../../shared/study-notes';
import type { QuranReaderCatalog } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';
import type { ReaderStudySource } from '../../../shared/reader-study-selection';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { Modal } from '../ui/Modal';

const taskKeys: Record<AssistantTask, TranslationKey> = {
  qa: 'assistantTaskQa', guide: 'assistantTaskGuide', questions: 'assistantTaskQuestions', terms: 'assistantTaskTerms', organise: 'assistantTaskOrganise', cards: 'assistantTaskCards',
};
const errorKeys: Record<string, TranslationKey> = {
  'ai-disabled': 'assistantErrorDisabled', 'permission-denied': 'assistantErrorRemote', 'invalid-output': 'assistantErrorUnchecked',
  'warsh-not-installed': 'assistantWarshMissing', 'invalid-resource': 'assistantInvalidResource', 'ambiguous-alignment': 'assistantAlignmentFailed',
  'missing-source': 'assistantMissingBookSource', 'missing-page': 'assistantMissingBookPage', 'no-text-layer': 'assistantNoTextLayer',
  busy: 'assistantErrorBusy', 'no-sources': 'assistantErrorNoSources', 'invalid-request': 'assistantErrorRequest',
  'provider-quota': 'aiErrorQuota', 'provider-busy': 'aiErrorBusy', 'provider-auth': 'aiErrorAuth',
};

/** One exchange in the conversation: what was asked, and the checked answer or the reason it failed. */
interface Turn { id: number; task: AssistantTask; question: string; answer?: AssistantAnswer; error?: { code: string; detail?: string; ocrTarget?: string } }

/**
 * The grounded study assistant (Wave 12), laid out as an AI chat: sources are ticked in the side panel, the
 * conversation runs in the middle, and the composer at the bottom picks the study mode and sends. Every answer shows
 * its checked quotes with links; it can be saved as an editable note, and drafted cards are approved one by one.
 */
export function StudyAssistant({ notes, initialNotes, readerSource, onClose }: { readerSource?: ReaderStudySource; notes: StudyNote[]; initialNotes: string[]; onClose: () => void }) {
  const { t, lang, dir, books, openBookForReading } = useWorkspace();
  const pdfBooks = useMemo(() => books.filter(book => book.filePath && /\.pdf$/iu.test(book.filePath)), [books]);
  const [picked, setPicked] = useState<Set<string>>(new Set(initialNotes));
  const [filter, setFilter] = useState('');
  const [book, setBook] = useState('');
  const [from, setFrom] = useState(1), [to, setTo] = useState(5);
  const [task, setTask] = useState<AssistantTask>('qa');
  const [question, setQuestion] = useState(readerSource ? t('readerStudyExplainPrompt') : '');
  const [allowRemote, setAllowRemote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [cards, setCards] = useState<Record<string, 'added' | 'skipped'>>({});
  const [passages, setPassages] = useState<AssistantPassage[]>([]);
  const [profile, setProfile] = useState<'hafs' | 'warsh'>('hafs');
  const [catalog, setCatalog] = useState<QuranReaderCatalog | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { let live = true; void window.electronAPI.quran.readerCatalog().then(result => { if (live && result.ok) setCatalog(result.data); }).catch(() => {}); return () => { live = false; }; }, []);
  const [corpusQuery, setCorpusQuery] = useState('');
  const [corpusFound, setCorpusFound] = useState<{ query: string; profile?: string; items: CorpusOption[] }>({ query: '', items: [] });
  const corpusResults = corpusQuery.trim().length >= 2 && corpusFound.query === corpusQuery.trim() && corpusFound.profile === profile ? corpusFound.items : [];
  useEffect(() => {
    // Ayahs by `2:255` or words, hadith by words: the same lookup as `[[` in the note editor.
    const query = corpusQuery.trim();
    if (query.length < 2) return;
    let live = true;
    const timer = setTimeout(() => { void searchCorpus(['quran', 'hadith'], query, id => t(collectionKeys[id]), 8, profile).then(found => { if (live) setCorpusFound({ query, profile, items: found }); }).catch(() => { if (live) setCorpusFound({ query, profile, items: [] }); }); }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [corpusQuery, t, profile]);
  useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: 'smooth' }); }, [turns, busy]);
  const addPassage = (option: CorpusOption) => setPassages(current => current.some(entry => entry.target === option.target) || current.length >= 20 ? current : [...current, { target: option.target, label: option.label }]);
  const listed = notes.filter(note => !filter || matchesStudyQuery(`${note.title} ${note.content}`, filter)).slice(0, 200);
  const toggle = (id: string) => setPicked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const hasSources = Boolean(readerSource) || picked.size > 0 || Boolean(book) || passages.length > 0;
  const sourceCount = (readerSource ? 1 : 0) + picked.size + (book ? 1 : 0) + passages.length;
  const canAsk = !busy && hasSources && (task !== 'qa' || Boolean(question.trim()));
  const latestError = [...turns].reverse().find(turn => turn.answer || turn.error)?.error;

  const ask = async () => {
    if (!canAsk) return;
    const id = Date.now();
    const asked = question.trim();
    setTurns(current => [...current, { id, task, question: asked }]);
    setBusy(true);
    const finish = (patch: Partial<Turn>) => setTurns(current => current.map(turn => turn.id === id ? { ...turn, ...patch } : turn));
    try {
      const result = await window.electronAPI.studyAssistant.ask({ task, question, language: lang === 'ar' ? 'ar' : 'en', allowRemote, notes: [...picked], books: book ? [{ id: book, sourceId: pdfBooks.find(entry => entry.id === book)?.sourceId, from, to: Math.max(from, Math.min(to, from + 49)) }] : [], passages, readerSource: readerSource ? { target: readerSource.target, label: readerSource.label } : undefined });
      // The question stays in the composer so it can be refined and asked again.
      if (result.ok) finish({ answer: result.data });
      else finish({ error: { code: result.error, detail: result.detail, ocrTarget: result.error === 'no-text-layer' ? result.target : undefined } });
    } catch { finish({ error: { code: 'engine-failed' } }); } finally { setBusy(false); }
  };
  const open = (target: string) => { onClose(); void navigateStudyReference(target, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor })).catch(() => {}); };
  const addCard = async (card: AssistantCard, key: string) => {
    try {
      const workId = parseBookTarget(card.target)?.id;
      await window.electronAPI.knowledgeCards.save({ front: card.front, back: card.back, sourceKind: cardSourceKind(card.target), sourceRef: card.target, sourceLabel: card.label, workId });
      window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'));
      setCards(current => ({ ...current, [key]: 'added' }));
    } catch { setTurns(current => [...current, { id: Date.now(), task: 'cards', question: '', error: { code: 'engine-failed' } }]); }
  };
  const [explainBack,setExplainBack]=useState(false);
  const explainTarget=readerSource?.target ?? (book ? bookStudyTarget({id:book,sourceId:pdfBooks.find(entry=>entry.id===book)?.sourceId},from) : passages.length===1?passages[0].target:undefined);
  const explainLabel=readerSource?.label ?? (book ? (pdfBooks.find(entry=>entry.id===book)?.title??'')+' · '+t('page')+' '+from : passages[0]?.label??'');

  const field = 'w-full rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none';
  const section = 'group rounded-xl border border-subtle bg-surface/60 open:bg-surface';
  const summary = 'flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-bold [&::-webkit-details-marker]:hidden';
  const badge = (count: number) => <span className={`ms-auto rounded-full px-2 py-0.5 text-[10px] tabular-nums ${count ? 'bg-primary/15 text-primary-text' : 'bg-canvas text-muted'}`}>{count}</span>;

  return <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-2 backdrop-blur-[2px] sm:p-4" dir={dir} onClick={onClose}>
    <Modal asChild open={true} onClose={onClose} label={t('assistantTitle')}><div role="dialog" aria-modal="true" aria-labelledby="assistant-title" data-study-assistant className="flex h-[min(88vh,820px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-subtle bg-canvas text-main shadow-2xl" onClick={event => event.stopPropagation()}>
      <header className="flex items-center gap-3 border-b border-subtle bg-surface px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm"><Sparkles size={16} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 id="assistant-title" className="text-sm font-bold leading-tight">{t('assistantTitle')}</h2>
          <p className="truncate text-[11px] text-muted">{t('assistantIntro')}</p>
        </div>
        <button type="button" autoFocus={Boolean(readerSource)} aria-label={t('close')} title={t('close')} onClick={onClose} className="ms-auto rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main"><X size={16} /></button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        {/* Sources */}
        <aside className="min-h-0 space-y-2.5 overflow-y-auto border-b border-subtle bg-surface/40 p-3 max-md:max-h-[34vh] md:border-b-0 md:border-e" aria-label={t('assistantSources')}>
          <div className="flex items-center gap-2 px-1 pb-1">
            <Library size={14} className="text-muted" aria-hidden="true" />
            <h3 className="text-xs font-bold">{t('assistantSources')}</h3>
            {badge(sourceCount)}
          </div>
          {readerSource && <section data-assistant-reader-source className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <h3 className="text-xs font-bold">{t('readerStudySelectionSource')}</h3>
            <button type="button" onClick={() => open(readerSource.target)} dir="auto" className="text-start text-primary-text underline-offset-2 hover:underline">{readerSource.label}</button>
            <blockquote dir="auto" className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-loose text-muted">{readerSource.text}</blockquote>
          </section>}

          <details className={section} open>
            <summary className={summary}><NotebookPen size={14} aria-hidden="true" />{t('assistantNotes', { count: picked.size })}{badge(picked.size)}</summary>
            <fieldset className="min-w-0 space-y-1.5 px-3 pb-3">
              <legend className="sr-only">{t('assistantNotes', { count: picked.size })}</legend>
              <input type="search" dir="auto" value={filter} onChange={event => setFilter(event.target.value)} placeholder={t('studySearchNotes')} aria-label={t('studySearchNotes')} className={field} />
              <ul className="max-h-52 space-y-0.5 overflow-y-auto text-sm">
                {listed.map(note => <li key={note.id}><label className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-canvas ${picked.has(note.id) ? 'bg-primary/10' : ''}`}><input type="checkbox" data-assistant-note={note.id} checked={picked.has(note.id)} onChange={() => toggle(note.id)} className="mt-1.5 accent-[var(--color-primary)]" /><span dir="auto" className="line-clamp-2 leading-relaxed">{note.title || note.content.slice(0, 60)}</span></label></li>)}
              </ul>
            </fieldset>
          </details>

          <details className={section} open={Boolean(book)}>
            <summary className={summary}><FileText size={14} aria-hidden="true" />{t('assistantBook')}{badge(book ? 1 : 0)}</summary>
            <fieldset className="min-w-0 space-y-2 px-3 pb-3">
              <legend className="sr-only">{t('assistantBook')}</legend>
              <select data-assistant-book value={book} onChange={event => setBook(event.target.value)} aria-label={t('assistantBook')} className={field}>
                <option value="">{t('assistantNoBook')}</option>
                {pdfBooks.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
              </select>
              {book && <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="space-y-1">{t('pdfAiFromPage')}<input type="number" min={1} value={from} onChange={event => setFrom(Math.max(1, Number(event.target.value) || 1))} className={field} /></label>
                <label className="space-y-1">{t('pdfAiToPage')}<input type="number" min={from} max={from + 49} value={to} onChange={event => setTo(Math.max(from, Number(event.target.value) || from))} className={field} /></label>
              </div>}
            </fieldset>
          </details>

          <details className={section} open={passages.length > 0} data-assistant-passages>
            <summary className={summary}><BookOpenText size={14} aria-hidden="true" />{t('assistantPassages', { count: passages.length })}{badge(passages.length)}</summary>
            <fieldset className="min-w-0 space-y-2 px-3 pb-3">
              <legend className="sr-only">{t('assistantPassages', { count: passages.length })}</legend>
              <label className="block space-y-1 text-xs">{t('assistantQuranProfile')}
                <select data-assistant-profile value={profile} onChange={event => { setProfile(event.target.value as 'hafs' | 'warsh'); setCorpusFound({ query: '', items: [] }); }} className={field}>
                  <option value="hafs">{t('assistantProfileHafs')}</option><option value="warsh">{t('assistantProfileWarsh')}</option>
                </select>
              </label>
              <input type="search" dir="auto" data-assistant-passage-search value={corpusQuery} onChange={event => setCorpusQuery(event.target.value)} placeholder={t('assistantPassageSearch')} aria-label={t('assistantPassageSearch')} className={field} />
              {corpusResults.length > 0 && <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-subtle bg-surface p-1 text-sm">
                {corpusResults.map(option => { const added = passages.some(entry => entry.target === option.target); return <li key={option.target}>
                  <button type="button" data-assistant-passage-option={option.target} disabled={added} onClick={() => addPassage(option)} className="flex w-full items-start gap-2 rounded p-1.5 text-start hover:bg-canvas disabled:opacity-50">
                    <BookOpenText size={14} aria-hidden="true" className="mt-1 shrink-0" />
                    <span className="min-w-0"><b dir="auto" className="block text-xs">{t(option.kind === 'quran' ? 'studyLinkKindAyah' : 'studyLinkKindHadith')} · {option.label}</b><span dir="auto" className="block truncate py-0.5 text-xs leading-loose text-muted">{option.snippet}</span></span>
                  </button>
                </li>; })}
              </ul>}
              {corpusQuery.trim().length >= 2 && corpusFound.query === corpusQuery.trim() && corpusFound.profile === profile && !corpusResults.length && <p className="text-xs text-muted">{t('assistantPassageNone')}</p>}
              {passages.length > 0 && <ul className="space-y-2">{passages.map(passage => <li key={passage.target} data-assistant-passage={passage.target} className="min-w-0 rounded-lg border border-subtle bg-canvas p-2 text-xs">
                <div className="flex items-start gap-1"><span dir="auto" className="min-w-0 flex-1 break-words leading-relaxed">{passage.target.startsWith('quran:') && <>{t(passage.target.startsWith('quran:warsh:') ? 'assistantProfileWarsh' : 'assistantProfileHafs')} · </>}{passage.label}</span>
                <button type="button" aria-label={t('assistantPassageRemove', { label: passage.label })} title={t('assistantPassageRemove', { label: passage.label })} onClick={() => setPassages(current => current.filter(entry => entry.target !== passage.target))} className="rounded-full p-0.5 hover:bg-surface"><X size={12} /></button></div>
                {passage.target.startsWith('quran:') && <div className="mt-2 space-y-2">{(['tafsir', 'translation'] as const).map(kind => <label key={kind} className="block leading-relaxed">{t(kind === 'tafsir' ? 'assistantAddTafsir' : 'assistantAddTranslation')}
                  <select data-assistant-extra={kind} value={passage[kind] || ''} className={`${field} min-w-0 max-w-full`} onChange={event => setPassages(current => current.map(entry => entry.target === passage.target ? { ...entry, [kind]: event.target.value || undefined } : entry))}>
                    <option value="">{t('assistantNoExtraSource')}</option>
                    {catalog?.presets.filter(source => source.installed && (source.kind === kind || kind === 'translation' && source.kind === 'word-translation')).map(source => <option key={source.id} value={source.id}>{source.title}</option>)}
                  </select>
                  {passage[kind] && <span data-assistant-numbering dir="auto" className="block break-words py-1 text-muted">{catalog?.presets.find(source => source.id === passage[kind])?.title} · {t('assistantHafsNumbering')}</span>}
                </label>)}</div>}
              </li>)}</ul>}
            </fieldset>
          </details>
        </aside>

        {/* Conversation */}
        <section className="flex min-h-0 min-w-0 flex-col">
          <div ref={thread} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
            {turns.length === 0 && <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Bot size={24} aria-hidden="true" /></span>
              <p className="max-w-md text-sm leading-relaxed text-muted">{t('assistantEmpty')}</p>
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {ASSISTANT_TASKS.map(name => <button key={name} type="button" onClick={() => { setTask(name); composer.current?.focus(); }} className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${task === name ? 'border-primary bg-primary/10 text-primary-text' : 'border-subtle hover:border-primary/50'}`}>{t(taskKeys[name])}</button>)}
              </div>
            </div>}

            {turns.map((turn, index) => <div key={turn.id} className="space-y-3" data-assistant-turn data-assistant-latest={index === turns.length - 1 ? '' : undefined} data-assistant-pending={!turn.answer && !turn.error ? '' : undefined}>
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-ee-md bg-primary px-4 py-2.5 text-sm text-white shadow-sm">
                  <span className="mb-0.5 block text-[10px] font-semibold opacity-80">{t(taskKeys[turn.task])}</span>
                  {turn.question && <p dir="auto" className="whitespace-pre-wrap leading-relaxed">{turn.question}</p>}
                </div>
              </div>

              {!turn.answer && !turn.error && <div data-assistant-busy className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" />{t('assistantWorking')}</div>}

              {turn.error && <div role="alert" data-assistant-error={turn.error.code} className="max-w-[90%] rounded-2xl rounded-es-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                <p className="leading-relaxed">{t(errorKeys[turn.error.code] ?? 'assistantErrorEngine')}</p>
                {turn.error.detail && <p dir="auto" className="mt-1 break-words text-[11px] opacity-80">{t('aiErrorDetail').replace('{detail}', turn.error.detail)}</p>}
                {turn.error.ocrTarget && <button type="button" data-assistant-ocr onClick={() => open(turn.error!.ocrTarget!)} className="mt-2 rounded-lg border border-current/30 px-3 py-1.5 text-start text-xs">{t('assistantOpenForOcr')}</button>}
              </div>}

              {turn.answer && <article className="max-w-[92%] space-y-3 rounded-2xl rounded-es-md border border-subtle bg-surface px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-muted"><Sparkles size={12} className="text-primary" aria-hidden="true" />{t('researchAiAssistant')}</div>
                {turn.answer.abstained && <p data-assistant-abstained className="rounded-lg bg-amber-500/10 p-2 text-sm">{t('assistantAbstained')}</p>}
                {turn.answer.limited && <p className="text-xs text-muted">{t('assistantLimited')}</p>}
                {turn.answer.answer && <div data-assistant-answer dir="auto" className="whitespace-pre-wrap text-sm leading-loose">{turn.answer.answer}</div>}
                {turn.answer.citations.length > 0 && <div className="border-t border-subtle pt-2.5">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-muted"><MessageSquareQuote size={12} aria-hidden="true" />{t('assistantSources')}</h3>
                  <ol className="space-y-1.5">{turn.answer.citations.map((citation, index) => <li key={index}>
                    <button type="button" data-assistant-citation={citation.target} onClick={() => open(citation.target)} className="flex w-full gap-2 rounded-lg border border-subtle bg-canvas p-2 text-start text-xs transition-colors hover:border-primary/40">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold tabular-nums text-primary-text">{index + 1}</span>
                      <span className="min-w-0"><b dir="auto" className="block leading-relaxed text-primary-text">{citation.label}</b><span dir="auto" className="line-clamp-3 block leading-relaxed text-muted">«{citation.quote}»</span></span>
                    </button>
                  </li>)}</ol>
                </div>}
                {turn.answer.cards.length > 0 && <div data-assistant-cards className="border-t border-subtle pt-2.5">
                  <h3 className="mb-1.5 text-[11px] font-bold text-muted">{t('assistantCardsTitle')}</h3>
                  <ul className="grid gap-2 sm:grid-cols-2">{turn.answer.cards.map((card, index) => { const key = `${turn.id}:${index}`; return <li key={index} data-assistant-card={index} className="flex flex-col rounded-xl border border-subtle bg-canvas p-3 text-sm">
                    <p dir="auto" className="font-semibold leading-relaxed">{card.front}</p>
                    <p dir="auto" className="mt-1 leading-relaxed text-muted">{card.back}</p>
                    <p dir="auto" className="mt-2 text-[11px] text-muted">{card.label}: «{card.quote}»</p>
                    <div className="mt-auto flex gap-2 pt-2 text-xs">
                      {cards[key] ? <span data-assistant-card-state={cards[key]} className="font-semibold">{t(cards[key] === 'added' ? 'assistantCardAdded' : 'assistantCardSkipped')}</span> : <>
                        <button type="button" data-assistant-card-add onClick={() => void addCard(card, key)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500 px-2 py-1 text-emerald-700 dark:text-emerald-300"><Check size={12} />{t('assistantCardAdd')}</button>
                        <button type="button" data-assistant-card-skip onClick={() => setCards(current => ({ ...current, [key]: 'skipped' }))} className="rounded-lg border border-subtle px-2 py-1">{t('assistantCardSkip')}</button>
                      </>}
                    </div>
                  </li>; })}</ul>
                </div>}
                {!turn.answer.abstained && turn.answer.answer && <div className="flex flex-wrap gap-2 border-t border-subtle pt-2.5 text-xs">
                  <button type="button" data-assistant-save onClick={() => { onClose(); openStudyNote({ content: answerAsNote(turn.answer!, { sources: t('assistantSources'), question: t('assistantQuestion') }, turn.question) }); }}
                    className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2.5 py-1.5 hover:border-primary/40"><NotebookPen size={12} />{t('assistantSaveNote')}</button>
                  <button type="button" onClick={() => void navigator.clipboard?.writeText(answerAsNote(turn.answer!, { sources: t('assistantSources'), question: t('assistantQuestion') }, turn.question))}
                    className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2.5 py-1.5 hover:border-primary/40"><Copy size={12} />{t('researchAiCopy')}</button>
                </div>}
              </article>}
            </div>)}
          </div>

          {/* Composer */}
          <div className="border-t border-subtle bg-surface p-3">
            <div className={`rounded-2xl border bg-canvas p-2 shadow-sm transition-colors focus-within:border-primary ${latestError?.code === 'permission-denied' && !allowRemote ? 'border-amber-500' : 'border-subtle'}`}>
              <textarea
                ref={composer}
                data-assistant-question
                dir="auto"
                rows={2}
                value={question}
                maxLength={2000}
                onChange={event => setQuestion(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }}
                placeholder={hasSources ? t(task === 'qa' ? 'assistantQuestion' : 'assistantFocus') : t('assistantIntro')}
                aria-label={t(task === 'qa' ? 'assistantQuestion' : 'assistantFocus')}
                className="max-h-40 min-h-12 w-full resize-y bg-transparent px-2 py-1 text-sm leading-relaxed placeholder:text-muted focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <select data-assistant-task value={task} onChange={event => setTask(event.target.value as AssistantTask)} aria-label={t('assistantTask')} title={t('assistantTask')} className="rounded-full border border-subtle bg-surface px-3 py-1 text-xs focus:border-primary focus:outline-none">
                  {ASSISTANT_TASKS.map(name => <option key={name} value={name}>{t(taskKeys[name])}</option>)}
                </select>
                <button type="button" data-assistant-explain-back disabled={busy||!explainTarget} onClick={()=>setExplainBack(true)} title={t('explainBackChoose')} className="rounded-full border border-subtle px-3 py-1 text-xs hover:border-primary/40 disabled:opacity-40">{t('explainBackTitle')}</button>
                <label className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-[11px] leading-snug text-muted">
                  <input type="checkbox" data-assistant-remote checked={allowRemote} onChange={event => setAllowRemote(event.target.checked)} className="accent-[var(--color-primary)]" />
                  <span>{t('assistantAllowRemote')}</span>
                </label>
                <button type="button" data-assistant-ask disabled={!canAsk} onClick={() => void ask()} aria-label={busy ? t('assistantWorking') : t('assistantAsk')} title={busy ? t('assistantWorking') : t('assistantAsk')} className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity disabled:opacity-40">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} className="rtl:-scale-x-100" />}{busy ? t('assistantWorking') : t('assistantAsk')}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
      {explainBack && explainTarget && <ExplainBack target={explainTarget} label={explainLabel} onClose={() => setExplainBack(false)} onOpen={open} />}
    </div></Modal>
  </div>;
}
