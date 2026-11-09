'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MISTAKE_CATEGORIES,mistakeKey,type MistakeCategory } from '../../../shared/practice';
import { PracticeAnswer } from './PracticeAnswer';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { useWorkspace } from '../context/WorkspaceContext';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import type { ReviewQueue, ReviewRating } from '../../../shared/srs';

export function SrsReviewPanel() {
  const { t, dir, lang, books, openBookForReading } = useWorkspace();
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [mistake,setMistake]=useState<MistakeCategory|undefined>();
  const [confidence,setConfidence]=useState(0);
  const [practiceDone,setPracticeDone]=useState(false);
  const [revealed, setRevealed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const started = useRef(0);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (locked.current) return;
    const request = ++generation.current;
    try {
      const value = await window.electronAPI.knowledgeCards.reviewQueue();
      if (request !== generation.current) return;
      setQueue(value); setRevealed(false);setConfidence(0);setMistake(undefined);setPracticeDone(false); setFailed(false); started.current = Date.now();
    } catch { if (request === generation.current) setFailed(true); }
  }, []);
  useEffect(() => {
    const pending = generation;
    const update = () => void refresh();
    update();
    window.addEventListener(KNOWLEDGE_CARD_SAVED, update);
    return () => { pending.current++; window.removeEventListener(KNOWLEDGE_CARD_SAVED, update); };
  }, [refresh]);
  useEffect(() => {
    if (!queue || queue.cards.length || !queue.nextDue) return;
    const delay = Math.min(2_147_483_647, Math.max(1000, Date.parse(queue.nextDue) - Date.now()));
    const timer = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(timer);
  }, [queue, refresh]);
  const card = queue?.cards[0];
  const grade = useCallback(async (rating: ReviewRating) => {
    if (!card || locked.current || !revealed) return;
    locked.current = true; setBusy(true); generation.current++;
    try {
      if ((card.questionKind??'recall')==='recall' && !practiceDone) {
        await window.electronAPI.knowledgeCards.recordAttempt({knowledgeId:card.id,cardRevision:card.cardRevision,answerText:'',confidence,checkMethod:'self',mistakeCategory:rating<=2?mistake:undefined,result:rating===1?'incorrect':rating===2?'partial':'correct',durationMs:Math.min(86_400_000,Math.max(0,Date.now()-started.current))});
        setPracticeDone(true); window.dispatchEvent(new CustomEvent('baglib:practice-recorded'));
      }
      const value = await window.electronAPI.knowledgeCards.gradeReview({ id: card.id, revision: card.revision, rating, durationMs: Math.min(86_400_000, Math.max(0, Date.now() - started.current)) });
      setQueue(value); setRevealed(false);setConfidence(0);setMistake(undefined);setPracticeDone(false); setFailed(false); started.current = Date.now();
      window.dispatchEvent(new CustomEvent('baglib:srs-reviewed'));
    } catch { setFailed(true); }
    finally { locked.current = false; setBusy(false); }
  }, [card, revealed,confidence,practiceDone,mistake]);
  return <section dir={dir} data-srs-review className="rounded-2xl border border-subtle bg-surface p-4 space-y-3 min-w-0">
    <header className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{t('srsTitle')}</h3><button type="button" disabled={busy} onClick={() => void refresh()} className="text-sm underline">{t('srsRefresh')}</button></header>
    {queue && <p className="text-sm text-muted" aria-live="polite">{t('srsCounts', { due: queue.due, reviewed: queue.reviewedToday })}</p>}
    {failed && <p role="alert" className="text-sm text-red-600">{t('srsFailed')}</p>}
    {!queue && !failed && <p role="status">{t('srsLoading')}</p>}
    {card ? <article key={card.id} className="space-y-3" data-srs-card={card.id}>
      <p dir="auto" className="font-reading text-lg leading-loose whitespace-pre-wrap break-words">{card.front}</p>
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
      {(card.questionKind??'recall')!=='recall'&&<PracticeAnswer key={`${card.id}-${card.cardRevision}`} card={card} onRecorded={()=>{setPracticeDone(true);setRevealed(true);}}/>}
      {(card.questionKind??'recall')==='recall'&&!revealed&&<fieldset><legend className="leading-loose">{t('practiceConfidence')}</legend><div className="flex flex-wrap gap-2">{[1,2,3,4].map(n=><label className="rounded border border-subtle p-2" key={n}><input type="radio" name="srs-confidence" value={n} checked={confidence===n} onChange={()=>setConfidence(n)}/> {n}</label>)}</div></fieldset>}
      {revealed ? <>
        {(card.questionKind??'recall')==='recall'&&<p dir="auto" data-srs-answer className="border-t border-subtle pt-3 leading-loose whitespace-pre-wrap break-words">{card.back || t('srsRecall')}</p>}
        {(card.questionKind??'recall')==='recall'&&<label className="block">{t('practiceMistake')}<select aria-label={t('practiceMistake')} value={mistake??''} onChange={e=>setMistake(e.target.value as MistakeCategory||undefined)} className="w-full min-w-0 bg-canvas rounded border border-subtle p-2"><option value="">{t('practiceSkipMistake')}</option>{MISTAKE_CATEGORIES.map(m=><option key={m} value={m}>{t(mistakeKey(m))}</option>)}</select></label>}
        <p className="text-sm">{t('practiceSrsSeparate')}</p>
        {(card.questionKind??'recall')==='recall'&&<p>{t('practiceCheckedSelf')}</p>}
        <div className="flex flex-wrap gap-2">{([1, 2, 3, 4] as const).map(rating => <button key={rating} type="button" data-srs-rating={rating} disabled={busy} onClick={() => void grade(rating)} className="rounded-lg border border-subtle px-3 py-2 disabled:opacity-50">{t((['srsAgain', 'srsHard', 'srsGood', 'srsEasy'] as const)[rating - 1])}</button>)}</div>
      </> : (card.questionKind??'recall')==='recall' && <button type="button" disabled={!confidence} data-srs-reveal onClick={() => setRevealed(true)} className="rounded-lg bg-emerald-700 text-white px-3 py-2">{t('srsReveal')}</button>}
    </article> : queue && <p role="status" className="text-sm text-muted">{t('srsEmpty')}{queue.nextDue && <> · {t('srsNext')} <time dateTime={queue.nextDue}>{new Date(queue.nextDue).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</time></>}</p>}
  </section>;
}
