'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, Flame, Plus, Target } from 'lucide-react';
import type { KhatmahConfig, KhatmahPlan } from '../../../shared/types/khatmah';
import type { QuranReaderCatalog, QuranReaderSource } from '../../../shared/types/quran';
import { addDays, khatmahReadingDwell, khatmahStats, khatmahTargetDate, localDate, pageRanges } from '../../../shared/khatmah';
import type { TranslationKey } from '../../translations';
import { useWorkspace } from '../context/WorkspaceContext';
import { openQuranPage } from '../../utils/quran-navigation';
import { useKhatmah } from './useKhatmah';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;
const field = 'min-w-0 w-full rounded-xl border border-subtle bg-surface px-3 py-2.5';

export function KhatmahCard({ plan, today, t, lang, busy, available, onRead, onMark, onEdit, onPause, onDelete }: {
  plan: KhatmahPlan; today: string; t: Translate; lang: 'ar' | 'en'; busy: boolean; available: boolean;
  onRead: () => void; onMark: (pages: number[]) => void; onEdit: () => void; onPause: () => void; onDelete: () => void;
}) {
  const stats = khatmahStats(plan, today);
  const number = (value: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`));
  return <article data-khatmah-card className="rounded-3xl border border-emerald-600/20 bg-surface p-5 sm:p-6 space-y-4 min-w-0 shadow-sm">
    <header className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-display text-xl leading-relaxed font-semibold break-words">{plan.title}</h2><p className="text-xs text-muted leading-relaxed">{t(plan.binding.profile === 'warsh' ? 'quranProfileWarsh' : 'quranProfileHafs')}{plan.binding.adapted && ` · ${t('khatmahAdapted')}`}</p></div><Target className="size-6 shrink-0 text-emerald-600 dark:text-emerald-400" /></header>
    <div role="progressbar" aria-label={t('khatmahProgress')} aria-valuemin={0} aria-valuemax={604} aria-valuenow={stats.completed} aria-valuetext={t('khatmahProgressValue', { pages: number(stats.completed), percent: number(stats.percent) })} className="h-2.5 rounded-full bg-emerald-500/10 overflow-hidden"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${stats.percent}%` }} /></div>
    <div className="flex flex-wrap justify-between gap-2 text-sm"><span>{t('khatmahProgressValue', { pages: number(stats.completed), percent: number(stats.percent) })}</span><span className="inline-flex items-center gap-1"><Flame className="size-4 text-amber-500" />{t('khatmahStreak', { days: number(stats.streak) })}</span></div>
    <div className="rounded-2xl bg-emerald-500/5 p-4 space-y-2"><h3 className="font-medium">{t('khatmahToday')}</h3><p className="leading-loose">{stats.completed === 604 ? t('khatmahCompleted') : plan.paused ? t('khatmahPaused') : stats.future ? t('khatmahStarts', { date: date(plan.startDate) }) : stats.todayPages.length ? t('khatmahPages', { pages: `\u2066${pageRanges(stats.todayPages)}\u2069` }) : t('khatmahTodayDone')}</p>
      {!available && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{t('khatmahMissingSources')}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !available || !stats.todayPages.length} onClick={onRead} className="rounded-xl bg-emerald-700 text-white px-4 py-2 inline-flex gap-2 items-center disabled:opacity-40"><BookOpen className="size-4" />{t('khatmahReadToday')}</button><button type="button" disabled={busy || !stats.todayPages.length} onClick={() => onMark(stats.todayPages)} className="rounded-xl border border-subtle px-3 py-2 inline-flex gap-2 items-center disabled:opacity-40"><Check className="size-4" />{t('khatmahMarkToday')}</button></div>
    </div>
    <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted">{t('khatmahTargetDate')}</dt><dd className="leading-loose">{date(stats.targetDate)}</dd></div><div><dt className="text-muted">{t('khatmahForecast')}</dt><dd className="leading-loose">{date(stats.forecastDate)}</dd></div></dl>
    {stats.completed < 604 && !plan.paused && !stats.future && <p className="text-sm text-muted">{t(stats.schedule === 'ahead' ? 'khatmahAhead' : stats.schedule === 'behind' ? 'khatmahBehind' : 'khatmahOnTrack')}</p>}
    <footer className="flex flex-wrap gap-2 text-sm"><button type="button" disabled={busy} onClick={onEdit} className="rounded-lg border border-subtle px-3 py-2">{t('khatmahEdit')}</button><button type="button" disabled={busy} onClick={onPause} className="rounded-lg border border-subtle px-3 py-2">{t(plan.paused ? 'khatmahResume' : 'khatmahPause')}</button><button type="button" disabled={busy} onClick={onDelete} className="rounded-lg border border-subtle px-3 py-2 text-red-700 dark:text-red-300">{t('khatmahDelete')}</button></footer>
  </article>;
}

export function KhatmahForm({ initial, sources, t, lang, supported, busy, onSave, onCancel }: { initial?: KhatmahPlan; sources: QuranReaderSource[]; t: Translate; lang: 'ar' | 'en'; supported: boolean; busy: boolean; onSave: (config: KhatmahConfig) => Promise<boolean>; onCancel: () => void }) {
  const firstScript = sources.find(source => source.kind === 'script');
  const [config, setConfig] = useState<KhatmahConfig>(() => initial || { title: '', script: firstScript?.id || '', layout: sources.find(source => source.kind === 'mushaf-layout')?.id || '', startDate: localDate(), mode: 'duration', durationDays: 30, targetDate: addDays(localDate(), 29), pagesPerSession: 2, sessionsPerDay: 5, juzPerDay: 1, automatic: false, reminder: { enabled: false, time: '06:00', language: lang } });
  const [invalid, setInvalid] = useState(false);
  const script = sources.find(source => source.id === config.script);
  const layouts = sources.filter(source => source.kind === 'mushaf-layout' || (source.kind === 'glyph-layout' && script?.profile === 'hafs' && source.profile === script.profile));
  const set = <Key extends keyof KhatmahConfig>(key: Key, value: KhatmahConfig[Key]) => setConfig(previous => ({ ...previous, [key]: value }));
  let targetDate = '';
  try { targetDate = khatmahTargetDate(config); } catch {}
  return <form data-khatmah-form onSubmit={event => { event.preventDefault(); if (!targetDate) { setInvalid(true); return; } void onSave({ ...config, reminder: { ...config.reminder, language: lang } }); }} className="rounded-3xl border border-subtle bg-surface p-5 sm:p-6 space-y-4">
    <h2 className="font-display text-xl leading-relaxed font-semibold">{t(initial ? 'khatmahEdit' : 'khatmahNew')}</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="space-y-1"><span>{t('khatmahName')}</span><input required maxLength={80} value={config.title} onChange={event => set('title', event.target.value)} className={field} /></label>
      <label className="space-y-1"><span>{t('khatmahStartDate')}</span><input type="date" required min="2000-01-01" max="2200-01-01" value={config.startDate} onChange={event => set('startDate', event.target.value)} className={field} /></label>
      <label className="space-y-1"><span>{t('quranScriptChoice')}</span><select required disabled={!!initial} value={config.script} onChange={event => setConfig(previous => ({ ...previous, script: event.target.value, layout: sources.find(source => source.kind === 'mushaf-layout')?.id || '', mode: 'duration' }))} className={field}>{sources.filter(source => source.kind === 'script').map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
      <label className="space-y-1"><span>{t('quranCatLayout')}</span><select required disabled={!!initial} value={config.layout} onChange={event => set('layout', event.target.value)} className={field}>{layouts.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
      <label className="space-y-1"><span>{t('khatmahPlanBy')}</span><select value={config.mode} onChange={event => set('mode', event.target.value as KhatmahConfig['mode'])} className={field}>{(['duration', 'date', 'pages', 'juz'] as const).filter(mode => mode !== 'juz' || script?.profile === 'hafs').map(mode => <option key={mode} value={mode}>{t({ duration: 'khatmahDuration', date: 'khatmahTargetDate', pages: 'khatmahPagePace', juz: 'khatmahJuzPace' }[mode] as TranslationKey)}</option>)}</select></label>
      {config.mode === 'duration' && <label className="space-y-1"><span>{t('khatmahDuration')}</span><select value={[7, 15, 30, 60, 180, 365].includes(config.durationDays) ? config.durationDays : 0} onChange={event => set('durationDays', Number(event.target.value) || 45)} className={field}>{[7, 15, 30, 60, 180, 365].map(days => <option key={days} value={days}>{t('khatmahDays', { days })}</option>)}<option value={0}>{t('khatmahCustomDuration')}</option></select>{![7, 15, 30, 60, 180, 365].includes(config.durationDays) && <input type="number" aria-label={t('khatmahCustomDuration')} min={1} max={3660} required value={config.durationDays} onChange={event => set('durationDays', Number(event.target.value))} className={field} />}</label>}
      {config.mode === 'date' && <label className="space-y-1"><span>{t('khatmahTargetDate')}</span><input required type="date" min={config.startDate} max="2200-01-01" value={config.targetDate} onChange={event => set('targetDate', event.target.value)} className={field} /></label>}
      {config.mode === 'pages' && <><label className="space-y-1"><span>{t('khatmahPagesSession')}</span><input required type="number" min={1} max={604} value={config.pagesPerSession} onChange={event => set('pagesPerSession', Number(event.target.value))} className={field} /></label><label className="space-y-1"><span>{t('khatmahSessionsDay')}</span><input required type="number" min={1} max={24} value={config.sessionsPerDay} onChange={event => set('sessionsPerDay', Number(event.target.value))} className={field} /></label></>}
      {config.mode === 'juz' && <label className="space-y-1"><span>{t('khatmahJuzPace')}</span><input required type="number" min={1} max={30} value={config.juzPerDay} onChange={event => set('juzPerDay', Number(event.target.value))} className={field} /></label>}
    </div>
    {targetDate && <p className="text-sm text-muted">{t('khatmahCalculatedDate', { date: targetDate })}</p>}
    {script?.profile === 'warsh' && <p className="text-sm text-muted leading-loose">{t('khatmahWarshNotice')}</p>}
    {config.mode === 'juz' && <p className="text-sm text-muted leading-loose">{t('khatmahJuzNotice')}</p>}
    <label className="flex items-start gap-2 leading-relaxed"><input type="checkbox" checked={config.automatic} onChange={event => set('automatic', event.target.checked)} className="mt-1.5" /><span>{t('khatmahAutomatic')}</span></label>
    <label className="flex items-center gap-2"><input type="checkbox" disabled={!supported} checked={config.reminder.enabled} onChange={event => set('reminder', { ...config.reminder, enabled: event.target.checked })} />{t('khatmahReminder')}</label>
    {config.reminder.enabled && <label className="flex items-center gap-3">{t('khatmahReminderTime')}<input type="time" required value={config.reminder.time} onChange={event => set('reminder', { ...config.reminder, time: event.target.value })} className={field} /></label>}
    <p className="text-xs text-muted leading-loose">{t(supported ? 'khatmahReminderNotice' : 'khatmahReminderUnsupported')}</p>
    {invalid && <p role="alert">{t('khatmahInvalid')}</p>}
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || !config.script || !config.layout} className="rounded-xl bg-emerald-700 text-white px-5 py-2.5 disabled:opacity-40">{t('khatmahSave')}</button><button type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-subtle px-4 py-2.5">{t('khatmahCancel')}</button></div>
  </form>;
}

export function QuranKhatmah() {
  const { t, dir, lang } = useWorkspace();
  const khatmah = useKhatmah();
  const [catalog, setCatalog] = useState<QuranReaderCatalog>({ sources: [], presets: [] });
  const [editing, setEditing] = useState<KhatmahPlan | 'new' | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  useEffect(() => {
    let alive = true;
    const client = typeof window !== "undefined" ? window.electronAPI?.quran : undefined;
    if (!client) return;
    const load = () => { void client.readerCatalog().then(result => { if (!alive) return; if (result.ok) { setCatalog(result.data); setCatalogError(false); } else setCatalogError(true); }).catch(() => { if (alive) setCatalogError(true); }); };
    load(); const unsubscribe = client.onChanged(load);
    return () => { alive = false; unsubscribe?.(); };
  }, []);
  return <section dir={dir} aria-label={t('khatmahTitle')} className="flex-1 min-h-0 min-w-0 overflow-auto text-main bg-canvas p-4 sm:p-6 space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display text-2xl leading-relaxed font-bold">{t('khatmahTitle')}</h1><p className="text-sm text-muted leading-loose">{t('khatmahSubtitle')}</p></div><button type="button" disabled={khatmah.busy || khatmah.plans.length >= 20} onClick={() => setEditing('new')} className="inline-flex gap-2 items-center bg-emerald-700 text-white px-4 py-2.5 rounded-xl disabled:opacity-40"><Plus className="size-4" />{t('khatmahNew')}</button></header>
    {(khatmah.error || catalogError) && <p role="alert" className="rounded-xl bg-red-500/10 border border-red-500/30 p-3">{t(khatmah.error || 'quranReaderError')}</p>}
    {editing && <KhatmahForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} sources={catalog.sources} t={t} lang={lang} supported={khatmah.notificationsSupported} busy={khatmah.busy} onSave={async config => { const success = await khatmah.mutate(editing === 'new' ? { action: 'create', config } : { action: 'edit', id: editing.id, config }); if (success) setEditing(null); return success; }} onCancel={() => setEditing(null)} />}
    {khatmah.loading ? <p role="status">{t('quranLoading')}</p> : !khatmah.plans.length && <p className="rounded-3xl border border-dashed border-emerald-600/30 p-8 leading-loose text-muted">{t('khatmahEmpty')}</p>}
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">{khatmah.plans.map(plan => {
      const stats = khatmahStats(plan, khatmah.today);
      return <KhatmahCard key={plan.id} plan={plan} today={khatmah.today} t={t} lang={lang} busy={khatmah.busy} available={[plan.script, plan.layout].every(id => catalog.sources.some(source => source.id === id))} onRead={() => { if (stats.todayPages[0]) openQuranPage({ script: plan.script, layout: plan.layout, page: stats.todayPages[0], khatmah: plan.id }); }} onMark={pages => { if (window.confirm(t('khatmahMarkConfirm', { pages: pageRanges(pages) }))) void khatmah.mutate({ action: 'mark', id: plan.id, script: plan.script, layout: plan.layout, pages, read: true }); }} onEdit={() => setEditing(plan)} onPause={() => { void khatmah.mutate({ action: 'pause', id: plan.id, paused: !plan.paused }); }} onDelete={() => { if (window.confirm(t('khatmahDeleteConfirm'))) void khatmah.mutate({ action: 'delete', id: plan.id }); }} />;
    })}</div>
  </section>;
}

export function QuranKhatmahDock({ script, layout, page, visible, targetPlan }: { script: string; layout: string; page: number; visible: boolean; targetPlan?: string }) {
  const { t } = useWorkspace();
  const khatmah = useKhatmah();
  const [selected, setSelected] = useState(targetPlan || '');
  const { mutate } = khatmah;
  const element = useRef<HTMLDivElement>(null);
  const matching = khatmah.plans.filter(plan => plan.script === script && plan.layout === layout && !plan.paused);
  const plan = matching.find(plan => plan.id === selected) || matching[0];
  const read = !!plan?.reads.some(read => read.page === page);
  const automatic = !!plan?.automatic && !read && khatmah.today >= plan.startDate;
  const id = plan?.id;
  useEffect(() => {
    if (!visible || !automatic || !id || !element.current) return;
    let inView = false;
    const dwell = khatmahReadingDwell(() => { void mutate({ action: 'mark', id, script, layout, pages: [page], read: true }); });
    const restart = () => {
      dwell.update(inView && !document.hidden && document.hasFocus());
    };
    const observer = new IntersectionObserver(entries => { inView = entries[0]?.isIntersecting || false; restart(); });
    observer.observe(element.current);
    document.addEventListener('visibilitychange', restart); window.addEventListener('focus', restart); window.addEventListener('blur', restart);
    return () => { observer.disconnect(); dwell.dispose(); document.removeEventListener('visibilitychange', restart); window.removeEventListener('focus', restart); window.removeEventListener('blur', restart); };
  }, [visible, automatic, id, script, layout, page, mutate]);
  if (!plan) return null;
  return <div ref={element} data-khatmah-dock className="quran-side-controls absolute start-0 bottom-16 z-30 max-w-[min(18rem,85%)] rounded-e-2xl border border-subtle bg-surface/95 p-3 shadow-lg text-xs space-y-2">
    <label className="block">{t('khatmahTitle')}<select aria-label={t('khatmahActive')} value={plan.id} onChange={event => setSelected(event.target.value)} className="mt-1 w-full bg-surface border border-subtle rounded-lg p-2">{matching.map(plan => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select></label>
    <button type="button" disabled={khatmah.busy || khatmah.today < plan.startDate} onClick={() => { void khatmah.mutate({ action: 'mark', id: plan.id, script, layout, pages: [page], read: !read }); }} className="w-full rounded-lg border border-emerald-500/40 px-3 py-2 text-start disabled:opacity-40">{t(read ? 'khatmahUnmarkPage' : 'khatmahMarkPage', { page })}</button>
    {automatic && <p className="text-muted leading-relaxed">{t('khatmahAutoHint')}</p>}
    {khatmah.error && <p role="alert">{t(khatmah.error)}</p>}
  </div>;
}
