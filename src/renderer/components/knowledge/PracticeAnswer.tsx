'use client';
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { KnowledgeCard } from '../../../shared/types/knowledge-cards';
import { checkAnswer, checkMethodKey, MISTAKE_CATEGORIES, mistakeKey, resultKey, type PracticeAttempt, type PracticeResult, type MistakeCategory } from '../../../shared/practice';
/** One answer, confidence before reveal, then an immutable saved attempt. */
export function PracticeAnswer({ card, onRecorded }: {
    card: KnowledgeCard;
    onRecorded?: () => void;
}) {
    const { t } = useWorkspace();
    const [answer, setAnswer] = useState('');
    const [confidence, setConfidence] = useState(0);
    const [revealed, setRevealed] = useState(false);
    const [result, setResult] = useState<PracticeResult>('pending');
    const [mistake, setMistake] = useState<MistakeCategory | undefined>();
    const [saved, setSaved] = useState<PracticeAttempt | null>(null);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const started = useRef(0);
    useEffect(() => { started.current = Date.now(); }, []);
    const kind = card.questionKind ?? 'recall', payload = card.payload;
    const automatic = kind === 'choice' || kind === 'numeric';
    const reveal = () => { try {
        setResult(automatic ? checkAnswer(kind, payload ?? null, answer) : 'pending');
        setRevealed(true);
        setFailed(false);
    }
    catch {
        setFailed(true);
    } };
    const save = async () => {
        if (lock.current)
            return;
        lock.current = true;
        setBusy(true);
        try {
            const value = await window.electronAPI.knowledgeCards.recordAttempt({ knowledgeId: card.id, cardRevision: card.cardRevision, answerText: answer, confidence, durationMs: Math.min(86400000, Math.max(0, Date.now() - started.current)), checkMethod: automatic ? 'auto' : result === 'pending' ? 'judgment' : 'self', result, mistakeCategory: result === 'incorrect' || result === 'partial' ? mistake : undefined });
            setSaved(value);
            setFailed(false);
            onRecorded?.();
            window.dispatchEvent(new CustomEvent('baglib:practice-recorded'));
        }
        catch {
            setFailed(true);
        }
        finally {
            lock.current = false;
            setBusy(false);
        }
    };
    const field = 'w-full min-w-0 rounded-lg border border-subtle bg-canvas p-2 leading-loose';
    return <div data-practice-answer className="space-y-3 min-w-0">
    {!revealed && <>
      {kind === 'choice' && payload && 'options' in payload ? <fieldset className="space-y-2"><legend>{t('practiceAnswer')}</legend>{payload.options.map((option, i) => <label key={i} className="flex gap-2 items-start leading-loose"><input type="radio" name={`choice-${card.id}`} value={i} checked={answer === String(i)} onChange={() => setAnswer(String(i))}/><span dir="auto" className="break-words min-w-0">{option}</span></label>)}</fieldset> : kind !== 'recall' && <label className="block">{t('practiceAnswer')}{kind === 'numeric' && payload && 'unit' in payload && <span dir="auto"> · {payload.unit}</span>}<textarea aria-label={t('practiceAnswer')} dir="auto" maxLength={20000} value={answer} onChange={e => setAnswer(e.target.value)} className={field}/></label>}
      <fieldset><legend className="leading-loose">{t('practiceConfidence')}</legend><div className="flex flex-wrap gap-2">{[1, 2, 3, 4].map(n => <label key={n} className="rounded border border-subtle p-2"><input type="radio" name={`confidence-${card.id}`} value={n} checked={confidence === n} onChange={() => setConfidence(n)}/> {n}</label>)}</div></fieldset>
      <button type="button" data-practice-reveal disabled={!confidence || (kind !== 'recall' && !answer.trim())} onClick={reveal} className="rounded-lg bg-emerald-700 px-3 py-2 text-white disabled:opacity-50">{t('srsReveal')}</button>
    </>}
    {revealed && <>
      {kind === 'choice' && payload && 'options' in payload && <p dir="auto" className="leading-loose break-words">{payload.options[payload.correctIndex]}</p>}
      {kind === 'numeric' && payload && 'answer' in payload && <p dir="auto" className="leading-loose break-words">{payload.answer} {payload.unit}</p>}
      {!(kind === 'choice' && payload && 'options' in payload && payload.options[payload.correctIndex] === card.back) && <p data-practice-model dir="auto" className="leading-loose whitespace-pre-wrap break-words">{payload && 'modelAnswer' in payload ? payload.modelAnswer : card.back}</p>}
      {automatic && !saved && <p role="status">{t(resultKey(result))} · {t('practiceCheckedAuto')}</p>}
      {!automatic && !saved && <label className="block">{t('practiceRate')}<select aria-label={t('practiceRate')} value={result} onChange={e => { setResult(e.target.value as PracticeResult); setMistake(undefined); }} className={field}>{(['pending', 'correct', 'partial', 'incorrect'] as const).map(r => <option key={r} value={r}>{t(resultKey(r))}</option>)}</select></label>}
      {!saved && (result === 'incorrect' || result === 'partial') && <label className="block">{t('practiceMistake')}<select aria-label={t('practiceMistake')} value={mistake ?? ''} onChange={e => setMistake(e.target.value as MistakeCategory || undefined)} className={field}><option value="">{t('practiceSkipMistake')}</option>{MISTAKE_CATEGORIES.map(m => <option key={m} value={m}>{t(mistakeKey(m))}</option>)}</select></label>}
      {saved ? <p data-practice-saved role="status">{t(resultKey(saved.result))} · {t(checkMethodKey(saved.checkMethod))}</p> : <button type="button" data-practice-save disabled={busy} onClick={() => void save()} className="rounded-lg border border-subtle px-3 py-2">{t('practiceSaveAttempt')}</button>}
    </>}
    {failed && <p role="alert">{t('srsFailed')}</p>}
  </div>;
}
