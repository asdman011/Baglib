'use client';

import React, { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { CourseSnapshot } from '../../../shared/courses';

const control = 'rounded-lg border border-subtle bg-surface p-2 text-sm text-main min-w-0 w-full';
const button = 'inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-2 text-sm disabled:opacity-50';

/** KEY-257: Coursera progress through an organisation's API app. */
export function OnlineCoursesPanel() {
  const { t, lang } = useWorkspace();
  const api = window.electronAPI.courses;
  const [account, setAccount] = useState({ organizationId: '', learner: '', key: '', secret: '' });
  const [state, setState] = useState<{ saved: boolean; secureStorage: boolean } | null>(null);
  const [snapshot, setSnapshot] = useState<CourseSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api.account().then(saved => { setState(saved); setAccount(current => ({ ...current, organizationId: saved.organizationId, learner: saved.learner })); }).catch(() => setError('coursera-unavailable'));
    void api.snapshot().then(setSnapshot).catch(() => {});
  }, [api]);
  const fail = (cause: unknown) => setError(String(cause instanceof Error ? cause.message : cause).match(/coursera-denied|secure-storage-unavailable/u)?.[0] ?? 'coursera-unavailable');
  const save = async () => {
    setError(null);
    try { await api.saveAccount(account); setState(current => current && { ...current, saved: true }); setAccount(current => ({ ...current, key: '', secret: '' })); }
    catch (cause) { fail(cause); }
  };
  const run = async () => {
    setBusy(true); setError(null);
    try { setSnapshot(await api.importProgress()); } catch (cause) { fail(cause); } finally { setBusy(false); }
  };
  const field = (name: keyof typeof account, label: Parameters<typeof t>[0], secret = false) => <input className={control} type={secret ? 'password' : 'text'} autoComplete="off" dir="ltr" value={account[name]} onChange={event => setAccount(current => ({ ...current, [name]: event.target.value }))} placeholder={t(label)} aria-label={t(label)} />;
  const date = (value: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' }).format(new Date(value));

  return <details className="rounded-xl border border-subtle p-3" data-online-courses>
    <summary className="cursor-pointer text-sm font-bold">{t('coursesTitle')}</summary>
    <div className="space-y-2 pt-3">
      <p className="text-xs text-muted leading-relaxed">{t('coursesNotice')}</p>
      {state && !state.secureStorage && <p role="alert" className="text-xs">{t('coursesNoSecureStorage')}</p>}
      {field('organizationId', 'coursesOrganization')}
      {field('learner', 'coursesLearner')}
      {field('key', 'coursesKey', true)}
      {field('secret', 'coursesSecret', true)}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={!state?.secureStorage || !account.organizationId || !account.learner || !account.key || !account.secret} onClick={() => void save()}>{t('coursesSave')}</button>
        <button type="button" className={button} disabled={!state?.saved || busy} onClick={() => void run()}><RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />{t('coursesImport')}</button>
        {state?.saved && <button type="button" className={button} onClick={() => void api.forget().then(() => setState(current => current && { ...current, saved: false }))}>{t('coursesForget')}</button>}
      </div>
      {state?.saved && <p className="text-xs text-muted">{t('coursesSaved')}</p>}
      {error && <p role="alert" className="text-xs leading-relaxed">{t(error === 'coursera-denied' ? 'coursesDenied' : error === 'secure-storage-unavailable' ? 'coursesNoSecureStorage' : 'coursesUnavailable')}</p>}
      {snapshot && <>
        <p className="text-xs text-muted">{t('coursesImportedAt', { date: date(snapshot.importedAt), count: snapshot.courses.length })}</p>
        <ul className="space-y-2">{snapshot.courses.map(course => <li key={course.id} className="space-y-1 rounded-lg border border-subtle p-2">
          <div className="flex items-start justify-between gap-2"><span dir="auto" className="text-sm font-bold break-words">{course.name}</span>{course.url && <button type="button" className="shrink-0" aria-label={t('coursesOpen')} title={t('coursesOpen')} onClick={() => void window.electronAPI.openExternal(course.url!)}><ExternalLink className="size-4 rtl:-scale-x-100" /></button>}</div>
          <div className="h-1.5 rounded-full bg-subtle overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={course.progress} aria-label={course.name}><div className="h-full bg-emerald-600" style={{ width: `${course.progress}%` }} /></div>
          <p className="text-xs text-muted"><bdi>{course.progress}%</bdi>{course.completed && ` · ${t('coursesCompleted')}`}{course.program && <> · <span dir="auto">{course.program}</span></>}</p>
        </li>)}</ul>
      </>}
    </div>
  </details>;
}
