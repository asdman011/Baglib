'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Repeat2, Search, Sparkles, Trash2 } from 'lucide-react';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { useWorkspace } from '../context/WorkspaceContext';
import { CARD_HOVER_SETTING, cardHoverEnabled, KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import type { KnowledgeCard, PreservedKnowledge } from '../../../shared/types/knowledge-cards';
import { QuestionCardEditor } from './QuestionCardEditor';
import { PracticeAnswer } from './PracticeAnswer';
import { PracticeHistoryPanel } from './PracticeHistoryPanel';
import { NoteHistory } from '../notes/NoteHistory';
import { CardDecksPanel } from './CardDecksPanel';
import { DictionariesPanel } from './DictionariesPanel';
import { PersonalCommentary } from './PersonalCommentary';

export function SavedCardsPanel() {
  const { t, books, openBookForReading } = useWorkspace();
  const [editing,setEditing]=useState<string|null>(null);
  const [practicing,setPracticing]=useState<string|null>(null);
  const [creating,setCreating]=useState(false);
  const [cards, setCards] = useState<KnowledgeCard[]>([]);
  const [preserved, setPreserved] = useState<PreservedKnowledge[]>([]);
  const [search, setSearch] = useState('');
  const [hover, setHover] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setCards(await window.electronAPI.knowledgeCards.list({ search }));
      setPreserved(await window.electronAPI.knowledgeCards.listPreserved());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [search]);

  useEffect(() => {
    const load = () => void refresh();
    load();
    window.addEventListener(KNOWLEDGE_CARD_SAVED, load);
    return () => window.removeEventListener(KNOWLEDGE_CARD_SAVED, load);
  }, [refresh]);

  // localStorage exists only in the browser, so the saved choice is read after the first render.
  useEffect(() => { queueMicrotask(() => setHover(cardHoverEnabled())); }, []);

  const toggleHover = (enabled: boolean) => {
    setHover(enabled);
    try { localStorage.setItem(CARD_HOVER_SETTING, enabled ? 'on' : 'off'); } catch { /* The choice lasts for this session. */ }
  };
  const act = async (action: () => Promise<unknown>) => {
    try { await action(); window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED)); await refresh(); } catch { setFailed(true); }
  };

  return <section data-saved-cards className="rounded-2xl border border-subtle bg-surface p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 font-bold text-main"><Sparkles className="size-4 text-amber-500" />{t('savedCardsTitle')}</h3>
      <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={hover} onChange={event => toggleHover(event.target.checked)} />{t('savedCardsHover')}</label>
    </div>
    <label className="flex items-center gap-2 rounded-xl border border-subtle bg-canvas px-3 py-2">
      <Search className="size-4 text-muted" />
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('savedCardsSearch')} aria-label={t('savedCardsSearch')} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
    </label>
    {failed && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('knowledgeCardFailed')}</p>}
    {!failed && cards.length === 0 && <p className="text-sm text-muted">{t('savedCardsEmpty')}</p>}
    <button onClick={()=>setCreating(!creating)} className="rounded-lg border border-subtle p-2">{t('practiceNewQuestion')}</button>
    {creating&&<QuestionCardEditor onSaved={()=>{setCreating(false);void refresh();}}/>}
    <ul className="space-y-2">
      {cards.map(card => <li key={card.id} data-saved-card={card.id} className="rounded-xl border border-subtle p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p dir="auto" className="font-reading text-base leading-loose break-words">{card.front}</p>
            {card.sourceRef && (
              <button
                type="button"
                data-card-source={card.id}
                className="rounded border border-subtle p-2 text-sm underline"
                onClick={() => void navigateStudyReference(card.sourceRef!, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor })).catch(() => setFailed(true))}
              >
                {t('practiceOpenSource')}
              </button>
            )}
            {card.sourceLabel && <p dir="auto" className="text-xs text-muted">{card.sourceLabel}</p>}
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" aria-pressed={card.memorizing} onClick={() => void act(() => window.electronAPI.knowledgeCards.setMemorizing(card.id, !card.memorizing))} title={t(card.memorizing ? 'knowledgeCardMemorizing' : 'knowledgeCardMemorize')} aria-label={t(card.memorizing ? 'knowledgeCardMemorizing' : 'knowledgeCardMemorize')} className={`rounded-lg p-1.5 hover:bg-canvas ${card.memorizing ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}`}><Repeat2 className="size-4" /></button>
            <button type="button" onClick={() => void act(() => window.electronAPI.knowledgeCards.remove(card.id))} title={t('savedCardsDelete')} aria-label={t('savedCardsDelete')} className="rounded-lg p-1.5 text-muted hover:bg-canvas"><Trash2 className="size-4" /></button>
          </div>
        </div>
        {card.back && <p dir="auto" className="mt-2 border-t border-subtle pt-2 text-sm text-muted whitespace-pre-line line-clamp-4 break-words">{card.back}</p>}
        <div className="flex flex-wrap gap-2 mt-2">
          <button onClick={()=>setPracticing(practicing===card.id?null:card.id)} className="rounded border border-subtle p-2">{t('practiceStart')}</button>
          {!['quran','hadith','poetry'].includes(card.sourceKind)&&<button onClick={()=>setEditing(editing===card.id?null:card.id)} className="rounded border border-subtle p-2">{t('practiceEdit')}</button>}
        </div>
        {editing===card.id&&<QuestionCardEditor key={`${card.id}-${card.cardRevision}`} card={card} onSaved={()=>{setEditing(null);void refresh();}}/>}
        {practicing===card.id&&<PracticeAnswer key={`${card.id}-${card.cardRevision}`} card={card}/>}
        <NoteHistory id={card.id} onChanged={()=>void refresh()}/>
      </li>)}
    </ul>
    <PracticeHistoryPanel />
    <CardDecksPanel />
    <DictionariesPanel />
    <PersonalCommentary />
    {preserved.length > 0 && <details data-preserved-knowledge className="border-t border-subtle pt-3">
      <summary className="cursor-pointer text-sm font-semibold text-main">{t('savedCardsPreserved', { count: preserved.length })}</summary>
      <ul className="mt-2 space-y-2">
        {preserved.map(item => <li key={item.id} className="rounded-xl border border-subtle p-3">
          <p dir="auto" className="text-xs text-muted">{item.bookTitle}</p>
          <p dir="auto" className="mt-1 text-sm whitespace-pre-line break-words">{item.text}</p>
          <NoteHistory id={item.id} onChanged={()=>void refresh()}/>
        </li>)}
      </ul>
    </details>}
  </section>;
}
