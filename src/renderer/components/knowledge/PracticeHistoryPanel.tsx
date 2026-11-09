'use client';
import { useCallback, useEffect, useState } from 'react';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { useWorkspace } from '../context/WorkspaceContext';
import { checkMethodKey, resultKey, MISTAKE_CATEGORIES, mistakeKey, type PracticeAttempt, type JudgeAttemptInput } from '../../../shared/practice';
export function PracticeHistoryPanel() {
    const { t, books, openBookForReading } = useWorkspace();
    const [attempts, setAttempts] = useState<PracticeAttempt[]>([]);
    const [failed, setFailed] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [offset, setOffset] = useState(0);
    const load = useCallback(async () => { try {
        setAttempts(await window.electronAPI.knowledgeCards.listAttempts({ offset }));
        setFailed(false);
    }
    catch {
        setFailed(true);
    } }, [offset]);
    useEffect(() => { queueMicrotask(() => void load()); const update = () => void load(); window.addEventListener('baglib:practice-recorded', update); window.addEventListener('baglib:knowledge-card-saved', update); return () => { window.removeEventListener('baglib:practice-recorded', update); window.removeEventListener('baglib:knowledge-card-saved', update); }; }, [load]);
    const act = async (action: () => Promise<unknown>) => { setBusy(true); try {
        await action();
        await load();
        setFailed(false);
    }
    catch {
        setFailed(true);
    }
    finally {
        setBusy(false);
    } };
    return <section data-practice-history className="border-t border-subtle pt-3 space-y-3 min-w-0">
    <h3 className="font-bold">{t('practiceHistory')}</h3>
    {failed && <p role="alert">{t('srsFailed')}</p>}
    {attempts.map(a => <article key={a.id} className="rounded-lg border border-subtle p-3 space-y-2 min-w-0">
      <p dir="auto" className="leading-loose break-words">{a.deleted ? t('practiceDeletedQuestion') : a.question}</p>
      <p dir="auto" className="whitespace-pre-wrap break-words">{a.answerText}</p>
      <p>{t(resultKey(a.result))} · {t(a.checkMethod === 'judgment' && a.result !== 'pending' ? 'practiceJudged' : checkMethodKey(a.checkMethod))}</p>
      <p className="text-sm">{t('practiceConfidenceValue', { value: a.confidence ?? '—' })} · {t('practiceRevision', { value: a.cardRevision ?? '—' })}</p>
      {a.mistakeCategory && <p>{t(mistakeKey(a.mistakeCategory))}</p>}
      {a.sourceRef && <button data-practice-source className="underline text-sm" onClick={()=>void navigateStudyReference(a.sourceRef!,books,openBookForReading,(id,anchor)=>openStudyNote({id,anchor})).catch(()=>setFailed(true))}>{t('practiceOpenSource')}</button>}
      {a.result === 'pending' && <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void act(() => window.electronAPI.knowledgeCards.judgeAttempt({ id: a.id, result: data.get('result') as JudgeAttemptInput['result'], mistakeCategory: (data.get('mistake') || undefined) as JudgeAttemptInput['mistakeCategory'] })); }} className="flex flex-wrap gap-2">
        <select name="result" aria-label={t('practiceRate')} className="bg-canvas border border-subtle rounded p-2">{(['correct', 'partial', 'incorrect'] as const).map(r => <option value={r} key={r}>{t(resultKey(r))}</option>)}</select>
        <select name="mistake" aria-label={t('practiceMistake')} className="bg-canvas border border-subtle rounded p-2"><option value="">{t('practiceSkipMistake')}</option>{MISTAKE_CATEGORIES.map(m => <option key={m} value={m}>{t(mistakeKey(m))}</option>)}</select>
        <button disabled={busy} type="submit" className="rounded border border-subtle p-2">{t('practiceJudge')}</button>
      </form>}
    </article>)}
    <div className="flex flex-wrap gap-2"><button disabled={!offset || busy} onClick={() => setOffset(Math.max(0, offset - 100))}>{t('practicePrevious')}</button><button disabled={attempts.length < 100 || busy} onClick={() => setOffset(offset + 100)}>{t('practiceNext')}</button><button onClick={() => void load()}>{t('srsRefresh')}</button></div>
    {confirm ? <div role="alertdialog" aria-label={t('practiceClear')} className="rounded-lg border border-subtle p-3 space-y-2"><p>{t('practiceClearConfirm')}</p><button disabled={busy} onClick={() => void act(async () => { await window.electronAPI.knowledgeCards.clearPracticeHistory(true); setConfirm(false); setOffset(0); })} className="rounded border border-subtle p-2">{t('practiceClear')}</button><button disabled={busy} onClick={() => setConfirm(false)} className="rounded border border-subtle p-2">{t('practiceCancel')}</button></div> : <button disabled={busy} onClick={() => setConfirm(true)} className="rounded border border-subtle p-2">{t('practiceClear')}</button>}
  </section>;
}
