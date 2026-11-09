'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenText, Check, Sparkles, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { answerAsNote, ASSISTANT_TASKS, cardSourceKind, type AssistantAnswer, type AssistantCard, type AssistantPassage, type AssistantTask } from '../../../shared/study-assistant';
import { searchCorpus, type CorpusOption } from '../../utils/corpus-lookup';
import { collectionKeys } from '../../utils/sunnah-collections';
import { parseBookTarget, matchesStudyQuery, type StudyNote } from '../../../shared/study-notes';
import type { QuranReaderCatalog } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';

const taskKeys: Record<AssistantTask, TranslationKey> = {
  qa: 'assistantTaskQa', guide: 'assistantTaskGuide', questions: 'assistantTaskQuestions', terms: 'assistantTaskTerms', organise: 'assistantTaskOrganise', cards: 'assistantTaskCards',
};
const errorKeys: Record<string, TranslationKey> = {
  'ai-disabled': 'assistantErrorDisabled', 'permission-denied': 'assistantErrorRemote', 'invalid-output': 'assistantErrorUnchecked',
  'warsh-not-installed': 'assistantWarshMissing', 'invalid-resource': 'assistantInvalidResource', 'ambiguous-alignment': 'assistantAlignmentFailed',
  busy: 'assistantErrorBusy', 'no-sources': 'assistantErrorNoSources', 'invalid-request': 'assistantErrorRequest',
};

/**
 * The grounded study assistant (Wave 12): tick sources (notes, PDF book pages), pick a study prompt, ask. The answer
 * shows its quotes with links; it can be saved as an editable note, and drafted cards are approved one by one.
 */
export function StudyAssistant({ notes, initialNotes, onClose }: { notes: StudyNote[]; initialNotes: string[]; onClose: () => void }) {
  const { t, lang, dir, books, openBookForReading } = useWorkspace();
  const pdfBooks = useMemo(() => books.filter(book => book.filePath && /\.pdf$/iu.test(book.filePath)), [books]);
  const [picked, setPicked] = useState<Set<string>>(new Set(initialNotes));
  const [filter, setFilter] = useState('');
  const [book, setBook] = useState('');
  const [from, setFrom] = useState(1), [to, setTo] = useState(5);
  const [task, setTask] = useState<AssistantTask>('qa');
  const [question, setQuestion] = useState('');
  const [allowRemote, setAllowRemote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [cards, setCards] = useState<Record<number, 'added' | 'skipped'>>({});
  const [passages, setPassages] = useState<AssistantPassage[]>([]);
  const [profile, setProfile] = useState<'hafs' | 'warsh'>('hafs');
  const [catalog, setCatalog] = useState<QuranReaderCatalog | null>(null);
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
  const addPassage = (option: CorpusOption) => setPassages(current => current.some(entry => entry.target === option.target) || current.length >= 20 ? current : [...current, { target: option.target, label: option.label }]);
  const listed = notes.filter(note => !filter || matchesStudyQuery(`${note.title} ${note.content}`, filter)).slice(0, 200);
  const toggle = (id: string) => setPicked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const hasSources = picked.size > 0 || Boolean(book) || passages.length > 0;
  const ask = async () => {
    setBusy(true); setError(null); setAnswer(null); setCards({});
    try {
      const result = await window.electronAPI.studyAssistant.ask({ task, question, language: lang === 'ar' ? 'ar' : 'en', allowRemote, notes: [...picked], books: book ? [{ id: book, from, to: Math.max(from, Math.min(to, from + 49)) }] : [], passages });
      if (result.ok) setAnswer(result.data); else setError(result.error);
    } catch { setError('engine-failed'); } finally { setBusy(false); }
  };
  const open = (target: string) => { onClose(); void navigateStudyReference(target, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor })).catch(() => {}); };
  const addCard = async (card: AssistantCard, index: number) => {
    try {
      const workId = parseBookTarget(card.target)?.id;
      await window.electronAPI.knowledgeCards.save({ front: card.front, back: card.back, sourceKind: cardSourceKind(card.target), sourceRef: card.target, sourceLabel: card.label, workId });
      window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'));
      setCards(current => ({ ...current, [index]: 'added' }));
    } catch { setError('engine-failed'); }
  };
  const field = 'w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm';
  return <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-2 sm:p-4" dir={dir} onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="assistant-title" data-study-assistant className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-subtle bg-surface text-main shadow-2xl" onClick={event => event.stopPropagation()}>
      <header className="flex items-center gap-2 border-b border-subtle px-4 py-2">
        <Sparkles size={16} aria-hidden="true" />
        <h2 id="assistant-title" className="text-sm font-bold">{t('assistantTitle')}</h2>
        <button type="button" aria-label={t('close')} title={t('close')} onClick={onClose} className="ms-auto rounded p-1 hover:bg-canvas"><X size={16} /></button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="space-y-3 border-subtle p-4 md:border-e">
          <p className="text-xs leading-relaxed text-muted">{t('assistantIntro')}</p>
          <fieldset className="min-w-0 space-y-1.5">
            <legend className="text-xs font-bold">{t('assistantNotes', { count: picked.size })}</legend>
            <input type="search" dir="auto" value={filter} onChange={event => setFilter(event.target.value)} placeholder={t('studySearchNotes')} aria-label={t('studySearchNotes')} className={field} />
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-subtle p-2 text-sm">
              {listed.map(note => <li key={note.id}><label className="flex items-start gap-2"><input type="checkbox" data-assistant-note={note.id} checked={picked.has(note.id)} onChange={() => toggle(note.id)} className="mt-1.5" /><span dir="auto" className="leading-relaxed">{note.title || note.content.slice(0, 60)}</span></label></li>)}
            </ul>
          </fieldset>
          <fieldset className="min-w-0 space-y-1.5">
            <legend className="text-xs font-bold">{t('assistantBook')}</legend>
            <select data-assistant-book value={book} onChange={event => setBook(event.target.value)} aria-label={t('assistantBook')} className={field}>
              <option value="">{t('assistantNoBook')}</option>
              {pdfBooks.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
            </select>
            {book && <div className="grid grid-cols-2 gap-2 text-xs">
              <label>{t('pdfAiFromPage')}<input type="number" min={1} value={from} onChange={event => setFrom(Math.max(1, Number(event.target.value) || 1))} className={field} /></label>
              <label>{t('pdfAiToPage')}<input type="number" min={from} max={from + 49} value={to} onChange={event => setTo(Math.max(from, Number(event.target.value) || from))} className={field} /></label>
            </div>}
          </fieldset>
          <fieldset className="min-w-0 space-y-1.5" data-assistant-passages>
            <legend className="text-xs font-bold">{t('assistantPassages', { count: passages.length })}</legend>
            <label className="block text-xs">{t('assistantQuranProfile')}
              <select data-assistant-profile value={profile} onChange={event => { setProfile(event.target.value as 'hafs' | 'warsh'); setCorpusFound({ query: '', items: [] }); }} className={field}>
                <option value="hafs">{t('assistantProfileHafs')}</option><option value="warsh">{t('assistantProfileWarsh')}</option>
              </select>
            </label>
            <input type="search" dir="auto" data-assistant-passage-search value={corpusQuery} onChange={event => setCorpusQuery(event.target.value)} placeholder={t('assistantPassageSearch')} aria-label={t('assistantPassageSearch')} className={field} />
            {corpusResults.length > 0 && <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-subtle p-1 text-sm">
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
          <label className="block text-xs font-bold">{t('assistantTask')}
            <select data-assistant-task value={task} onChange={event => setTask(event.target.value as AssistantTask)} className={`${field} mt-1 font-normal`}>
              {ASSISTANT_TASKS.map(name => <option key={name} value={name}>{t(taskKeys[name])}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold">{t(task === 'qa' ? 'assistantQuestion' : 'assistantFocus')}
            <textarea data-assistant-question dir="auto" value={question} maxLength={2000} onChange={event => setQuestion(event.target.value)} className={`${field} mt-1 min-h-20 font-normal leading-relaxed`} />
          </label>
          <label className="flex items-start gap-2 text-xs leading-relaxed"><input type="checkbox" data-assistant-remote checked={allowRemote} onChange={event => setAllowRemote(event.target.checked)} className="mt-1" />{t('assistantAllowRemote')}</label>
          <button type="button" data-assistant-ask disabled={busy || !hasSources || (task === 'qa' && !question.trim())} onClick={() => void ask()} className="w-full rounded-lg bg-amber-600 py-2 text-sm text-white disabled:opacity-40">{busy ? t('assistantWorking') : t('assistantAsk')}</button>
        </section>
        <section className="min-h-0 min-w-0 space-y-3 p-4 break-words" aria-live="polite">
          {error && <p role="alert" data-assistant-error={error} className="rounded-lg bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">{t(errorKeys[error] ?? 'assistantErrorEngine')}</p>}
          {!answer && !error && <p className="text-sm text-muted">{t('assistantEmpty')}</p>}
          {answer && <>
            {answer.abstained && <p data-assistant-abstained className="rounded-lg bg-amber-500/10 p-2 text-sm">{t('assistantAbstained')}</p>}
            {answer.limited && <p className="text-xs text-muted">{t('assistantLimited')}</p>}
            {answer.answer && <div data-assistant-answer dir="auto" className="whitespace-pre-wrap rounded-lg border border-subtle bg-canvas p-3 text-sm leading-loose">{answer.answer}</div>}
            {answer.citations.length > 0 && <div>
              <h3 className="mb-1 text-xs font-bold">{t('assistantSources')}</h3>
              <ul className="space-y-1.5">{answer.citations.map((citation, index) => <li key={index}>
                <button type="button" data-assistant-citation={citation.target} onClick={() => open(citation.target)} className="w-full rounded-lg border border-subtle p-2 text-start text-xs hover:bg-canvas">
                  <b dir="auto" className="block leading-relaxed">{citation.label}</b><span dir="auto" className="block leading-relaxed text-muted">«{citation.quote}»</span>
                </button>
              </li>)}</ul>
            </div>}
            {answer.cards.length > 0 && <div data-assistant-cards>
              <h3 className="mb-1 text-xs font-bold">{t('assistantCardsTitle')}</h3>
              <ul className="space-y-2">{answer.cards.map((card, index) => <li key={index} data-assistant-card={index} className="rounded-lg border border-subtle p-2 text-sm">
                <p dir="auto" className="font-semibold">{card.front}</p>
                <p dir="auto" className="text-muted">{card.back}</p>
                <p dir="auto" className="mt-1 text-[11px] text-muted">{card.label}: «{card.quote}»</p>
                <div className="mt-2 flex gap-2 text-xs">
                  {cards[index] ? <span data-assistant-card-state={cards[index]} className="font-semibold">{t(cards[index] === 'added' ? 'assistantCardAdded' : 'assistantCardSkipped')}</span> : <>
                    <button type="button" data-assistant-card-add onClick={() => void addCard(card, index)} className="inline-flex items-center gap-1 rounded border border-emerald-500 px-2 py-1 text-emerald-700 dark:text-emerald-300"><Check size={12} />{t('assistantCardAdd')}</button>
                    <button type="button" data-assistant-card-skip onClick={() => setCards(current => ({ ...current, [index]: 'skipped' }))} className="rounded border border-subtle px-2 py-1">{t('assistantCardSkip')}</button>
                  </>}
                </div>
              </li>)}</ul>
            </div>}
            {!answer.abstained && answer.answer && <button type="button" data-assistant-save onClick={() => { onClose(); openStudyNote({ content: answerAsNote(answer, { sources: t('assistantSources'), question: t('assistantQuestion') }, question.trim()) }); }}
              className="rounded-lg border border-subtle px-3 py-1.5 text-sm">{t('assistantSaveNote')}</button>}
          </>}
        </section>
      </div>
    </div>
  </div>;
}
