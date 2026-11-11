'use client';
import { FeedbackSkeleton } from '../ui/FeedbackSkeleton';

import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { civilDate, type StudyTask } from '../../../shared/study-planner';
import { orderStudyTasks, type StudyInsights, type StudyPreferences, type WordFrequency } from '../../../shared/study-insights';
import { openStudyNote } from '../../utils/study-navigation';

const style = 'rounded-lg border border-subtle bg-surface p-2 text-sm min-w-0';

export function StudyInsightsModule() {
  const { t, lang, books, setViewMode } = useWorkspace();
  const [summary, setSummary] = useState<StudyInsights | null>(null);
  const [preferences, setPreferences] = useState<StudyPreferences>({ dailyMinutes: 0, dailyPages: 0, taskOrder: [] });
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [frequency, setFrequency] = useState<WordFrequency | null>(null);
  const [bookId, setBookId] = useState('');
  const [reviews, setReviews] = useState<{ due: number; reviewedToday: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const update = () => { void window.electronAPI?.knowledgeCards?.reviewQueue?.().then(value => { if (alive) setReviews(value); }).catch(() => {}); };
    update();
    window.addEventListener('baglib:srs-reviewed', update);
    window.addEventListener('baglib:knowledge-card-saved', update);
    return () => { alive = false; window.removeEventListener('baglib:srs-reviewed', update); window.removeEventListener('baglib:knowledge-card-saved', update); };
  }, []);
  useEffect(() => {
    let alive = true;
    const api = window.electronAPI;
    if (!api?.studyInsights) return;
    Promise.all([api.studyInsights.summary(), api.studyInsights.preferences(), api.planner.list()]).then(([data, saved, rows]) => {
      if (alive) { setSummary(data); setPreferences(saved); setTasks(rows.filter(task => task.status === 'open')); }
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);
  const ordered = orderStudyTasks(tasks, preferences.taskOrder);
  const save = async (value: StudyPreferences) => {
    setBusy(true); setError(false);
    try { setPreferences(await window.electronAPI.studyInsights.savePreferences(value)); } catch { setError(true); } finally { setBusy(false); }
  };
  const unavailable = t('studyUnavailable');
  const seconds = (value: number | null) => value === null ? unavailable : t('studySeconds', { count: Math.round(value) });
  const today = summary?.days.find(day => day.date === civilDate(new Date()));
  return <section data-study-insights className="border border-subtle rounded-xl bg-surface p-4 space-y-4 min-w-0">
    <h2 className="text-lg font-bold">{t('studyInsightsTitle')}</h2>
    {reviews && <button type="button" onClick={() => setViewMode('notes')} className="text-sm underline">{t('srsCounts', { due: reviews.due, reviewed: reviews.reviewedToday })}</button>}
    {error && <p role="alert">{t('plannerError')}</p>}
    {!summary ? (error ? <p>{unavailable}</p> : <FeedbackSkeleton />) : <>
      <p className="text-xs text-muted">{t(summary.timeSource === 'sessions' ? 'studySessionSource' : summary.timeSource === 'dwell' ? 'studyDwellSource' : 'studyNoTimeSource')}</p>
      {summary.partial && <p>{t('studyPartial')}</p>}
      <div className="grid grid-cols-2 @min-[40rem]:grid-cols-4 gap-3">
        <div>{t('studyTimeInvested')}<strong className="block">{(summary.seconds / 3600).toLocaleString(lang, { maximumFractionDigits: 2 })} {t('studyHours')}</strong></div>
        <div>{t('studyKnowledgeGrowth')}<strong className="block">{summary.knowledge.toLocaleString(lang)}</strong><small>{t('studyKnowledgeHint')}</small></div>
        <div>{t('studyIdeas')}<strong className="block">{summary.ideas.toLocaleString(lang)}</strong><small>{t('studyIdeasHint')}</small></div>
        <div>{t('studyResearchProgress')}<strong className="block">{summary.completedTasks} / {summary.totalTasks}</strong><small>{t('studyResearchHint')}</small></div>
        <div>{t('studyPerPage')}<strong className="block">{seconds(summary.secondsPerPage)}</strong></div>
        <div>{t('studyPerSession')}<strong className="block">{seconds(summary.secondsPerSession)}</strong></div>
      </div>
      <form onSubmit={event => { event.preventDefault(); void save(preferences); }} className="flex gap-3 flex-wrap items-end">
        <label className="text-sm">{t('studyDailyMinutes')}<input type="number" min={0} max={1440} className={`${style} block w-28`} value={preferences.dailyMinutes} onChange={event => setPreferences({ ...preferences, dailyMinutes: Number(event.target.value) })} /></label>
        <label className="text-sm">{t('studyDailyPages')}<input type="number" min={0} max={10000} className={`${style} block w-28`} value={preferences.dailyPages} onChange={event => setPreferences({ ...preferences, dailyPages: Number(event.target.value) })} /></label>
        <button disabled={busy} className={style}>{t('studySaveGoals')}</button>
        <p className="text-sm">{t('studyTodayProgress', { minutes: Math.floor((today?.seconds || 0) / 60), pages: today?.pages || 0 })}</p>
      </form>
      <p className="text-xs text-muted">{t('studyGoalHint')}</p>
      {preferences.dailyMinutes > 0 && <progress className="w-full" aria-label={t('studyDailyMinutes')} value={Math.min((today?.seconds || 0) / 60, preferences.dailyMinutes)} max={preferences.dailyMinutes} />}
      {preferences.dailyPages > 0 && <progress className="w-full" aria-label={t('studyDailyPages')} value={Math.min(today?.pages || 0, preferences.dailyPages)} max={preferences.dailyPages} />}
      <h3 className="font-bold">{t('studyWeek')}</h3>
      <div className="grid grid-cols-2 @min-[28rem]:grid-cols-4 @min-[52rem]:grid-cols-7 gap-2">{summary.days.map(day => <div key={day.date} className={style}><time>{day.date}</time><p>{t('studyTodayProgress', { minutes: Math.floor(day.seconds / 60), pages: day.pages })}</p></div>)}</div>
      <h3 className="font-bold">{t('studySubjects')}</h3>
      {!summary.subjects.length && <p>{unavailable}</p>}
      {summary.subjects.map((subject, index) => <p key={index} dir="auto">{(lang === 'ar' ? subject.ar : subject.en) || t('studyUncategorized')}: {(subject.seconds / 3600).toLocaleString(lang, { maximumFractionDigits: 2 })} {t('studyHours')}</p>)}
      <p className="text-sm text-muted">{t('studyUntrackedActivities')}</p>
      <h3 className="font-bold">{t('studyReadingOrder')}</h3>
      <p className="text-xs text-muted">{t('studyOrderHint')}</p>
      <button disabled={busy} className={style} onClick={() => void save({ ...preferences, taskOrder: [] })}>{t('studyResetOrder')}</button>
      {!ordered.length && <p>{t('plannerEmpty')}</p>}
      <ol className="space-y-2">{ordered.map((task, index) => <li key={task.id} className="flex gap-2 items-center min-w-0"><span className="flex-1 break-words" dir="auto">{task.title}</span><button className={style} disabled={busy || index === 0} onClick={() => { const ids = ordered.map(item => item.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; void save({ ...preferences, taskOrder: ids }); }}>{t('plannerMoveEarlier')}</button></li>)}</ol>
      <button className={style} onClick={() => setViewMode('planner')}>{t('plannerTitle')}</button>
      <div className="grid @min-[40rem]:grid-cols-2 gap-4">
        <div><h3 className="font-bold">{t('studyReflections')}</h3>{!summary.reflections.length && <p>{unavailable}</p>}{summary.reflections.map(note => <button key={note.id} className={`${style} block text-start w-full my-2 break-words`} dir="auto" onClick={() => openStudyNote({ id: note.id })}>{note.title || note.content}</button>)}</div>
        <div><h3 className="font-bold">{t('studyRecentEdits')}</h3><p className="text-xs text-muted">{t('studyEditsHint')}</p>{!summary.edits.length && <p>{unavailable}</p>}{summary.edits.map(item => <p key={item.id} className="text-sm break-words">{t('studyKnowledgeItem')} — {new Date(item.updatedAt).toLocaleDateString(lang)}</p>)}</div>
      </div>
      <h3 className="font-bold">{t('studyWordFrequency')}</h3>
      <div className="flex gap-2 flex-wrap"><select aria-label={t('studyWordScope')} className={`${style} max-w-full`} value={bookId} onChange={event => setBookId(event.target.value)}><option value="">{t('studyLibraryScope')}</option>{books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select><button disabled={busy} className={style} onClick={async () => { setBusy(true); setError(false); try { setFrequency(await window.electronAPI.studyInsights.words(bookId || undefined)); } catch { setError(true); } finally { setBusy(false); } }}>{t('studyCountWords')}</button></div>
      <p className="text-xs text-muted">{t('studyFrequencyHint')}</p>
      {frequency && <><p>{t('studyIndexedPages', { count: frequency.indexedPages })}</p>{frequency.partial && <p>{t('studyPartial')}</p>}{!frequency.words.length && <p>{unavailable}</p>}<div className="flex flex-wrap gap-3">{frequency.words.map(item => <span key={item.word} dir="auto">{item.word}: {item.count.toLocaleString(lang)}</span>)}</div></>}
    </>}
  </section>;
}
