'use client';
import { NOTIFICATION_SNOOZE_EVENT } from '../layout/NotificationCenter';
import { FeedbackSkeleton } from '../ui/FeedbackSkeleton';

import React, { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { DEFAULT_STUDY_RHYTHM, RHYTHM_CHANGED_EVENT, RHYTHM_SETTINGS_KEY, STUDY_PAUSE_EVENT, rhythmWindow, validateRhythm, type StudyRhythm } from '../../../shared/study-rhythm';
import type { PrayerStatusSnapshot } from '../../../shared/types/athan';
import { translations } from '../../translations';

const field = 'border border-subtle bg-surface text-main rounded-lg p-2 min-w-0';
const defaults: StudyRhythm = { ...DEFAULT_STUDY_RHYTHM, intentionAr: translations.ar.rhythmApprovedIntention, intentionEn: translations.en.rhythmApprovedIntention };

export function StudyRhythmSettings({ defaultOpen = false }: { defaultOpen?: boolean } = {}) {
  const { t } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<StudyRhythm>(defaults);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => window.electronAPI?.settings?.get?.(RHYTHM_SETTINGS_KEY, defaults).then(raw => { if (alive) setSettings(validateRhythm(raw)); }).catch(() => { if (alive) setError(true); }).finally(() => { if (alive) setLoading(false); });
    void load();
    window.addEventListener(RHYTHM_CHANGED_EVENT, load);
    return () => { alive = false; window.removeEventListener(RHYTHM_CHANGED_EVENT, load); };
  }, []);
  if (loading) return <FeedbackSkeleton />;
  return <details open={defaultOpen || undefined} className="border border-subtle rounded-xl p-4 bg-surface">
    <summary className="font-bold cursor-pointer">{t('rhythmSettings')}</summary>
    <form className="space-y-3 pt-3" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(false);
      try {
        const valid = validateRhythm(settings);
        await window.electronAPI.settings.set(RHYTHM_SETTINGS_KEY, valid);
        window.dispatchEvent(new Event(RHYTHM_CHANGED_EVENT));
      } catch { setError(true); } finally { setBusy(false); }
    }}>
      <label className="block"><input type="checkbox" checked={settings.enabled} onChange={event => setSettings({ ...settings, enabled: event.target.checked })} /> {t('rhythmEnabled')}</label>
      <label className="block"><input type="checkbox" checked={settings.prayers} onChange={event => setSettings({ ...settings, prayers: event.target.checked })} /> {t('rhythmPrayers')}</label>
      <label className="block">{t('rhythmMinutes')} <input className={field} type="number" min={1} max={120} value={settings.minutes} onChange={event => setSettings({ ...settings, minutes: Number(event.target.value) })} /></label>
      <div className="flex flex-wrap gap-3"><label>{t('rhythmZikr')} <input type="time" className={field} value={settings.zikr} onChange={event => setSettings({ ...settings, zikr: event.target.value })} /></label><label>{t('rhythmWird')} <input type="time" className={field} value={settings.wird} onChange={event => setSettings({ ...settings, wird: event.target.value })} /></label></div>
      <p className="text-sm text-muted">{t('rhythmTimeHint')}</p>
      <label className="block">{t('rhythmIntentionAr')}<textarea dir="rtl" maxLength={2000} className={`${field} block w-full`} value={settings.intentionAr} onChange={event => setSettings({ ...settings, intentionAr: event.target.value })} /></label>
      <label className="block">{t('rhythmIntentionEn')}<textarea dir="ltr" maxLength={2000} className={`${field} block w-full`} value={settings.intentionEn} onChange={event => setSettings({ ...settings, intentionEn: event.target.value })} /></label>
      <label className="block"><input type="checkbox" disabled={!settings.intentionAr.trim() || !settings.intentionEn.trim()} checked={settings.launch} onChange={event => setSettings({ ...settings, launch: event.target.checked })} /> {t('rhythmLaunch')}</label>
      {error && <p role="alert">{t('plannerError')}</p>}
      <button disabled={busy} className={field}>{t('rhythmSaveApprove')}</button>
    </form>
  </details>;
}

export function StudyRhythmLayer({ snapshot }: { snapshot: PrayerStatusSnapshot }) {
  const { t, lang, dir } = useWorkspace();
  const [settings, setSettings] = useState<StudyRhythm>(defaults);
  const [notificationPauseUntil, setNotificationPauseUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [skipped, setSkipped] = useState<string | null>(null);
  const [intention, setIntention] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const launchShown = useRef(false);
  const resumeButton = useRef<HTMLButtonElement>(null);
  const retainedWindow = useRef<ReturnType<typeof rhythmWindow>>(null);
  const retainedSettings = useRef(settings);
  const [active, setActive] = useState<ReturnType<typeof rhythmWindow>>(null);
  useEffect(() => {
    if (retainedSettings.current !== settings) retainedWindow.current = null;
    retainedSettings.current = settings;
    const candidate = saved ? rhythmWindow(snapshot, settings, new Date(now)) : null;
    const retained = settings.enabled && retainedWindow.current && retainedWindow.current.endsAt > now ? retainedWindow.current : null;
    retainedWindow.current = candidate || retained;
    setActive(previous => previous?.key === retainedWindow.current?.key ? previous : retainedWindow.current);
  }, [snapshot, settings, now, saved]);
  useEffect(() => {
    const snooze = () => setNotificationPauseUntil(Date.now() + 10 * 60_000);
    window.addEventListener(NOTIFICATION_SNOOZE_EVENT, snooze);
    return () => window.removeEventListener(NOTIFICATION_SNOOZE_EVENT, snooze);
  }, []);
  const paused = (!!active && active.key !== skipped) || notificationPauseUntil > now;
  const activeKey = active?.key || null;
  useEffect(() => {
    let alive = true;
    const load = () => window.electronAPI?.settings?.get?.(RHYTHM_SETTINGS_KEY, defaults).then(raw => {
      if (!alive) return;
      const value = validateRhythm(raw);
      setSettings(value); setSaved(true);
      if (!launchShown.current) { launchShown.current = true; setIntention(value.launch); }
    }).catch(() => { if (alive) setError(true); });
    void load();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener(RHYTHM_CHANGED_EVENT, load);
    return () => { alive = false; clearInterval(clock); window.removeEventListener(RHYTHM_CHANGED_EVENT, load); };
  }, []);
  useEffect(() => {
    let alive = true;
    const shouldPause = paused || intention;
    const sync = async () => {
      try {
        await window.electronAPI?.studyInsights?.setPaused?.(shouldPause);
        if (!alive) return;
        document.documentElement.dataset.studyPaused = String(shouldPause);
        if (shouldPause) {
          window.dispatchEvent(new Event(STUDY_PAUSE_EVENT));
          document.querySelectorAll<HTMLMediaElement>('audio,video').forEach(media => media.pause());
          if (dialog.current && !dialog.current.open) dialog.current.showModal();
          resumeButton.current?.focus();
        } else dialog.current?.close();
      } catch { if (alive) setError(true); }
    };
    void sync();
    return () => { alive = false; };
  }, [paused, intention]);
  useEffect(() => () => {
    delete document.documentElement.dataset.studyPaused;
    void window.electronAPI?.studyInsights?.setPaused?.(false).catch(() => undefined);
  }, []);
  const resume = () => { setNotificationPauseUntil(0); setSkipped(activeKey); setIntention(false); };
  return <dialog ref={dialog} data-study-snooze dir={dir} className="m-auto rounded-2xl border border-subtle bg-surface text-main p-5 max-w-lg w-[calc(100%_-_2rem)] backdrop:bg-black/60" onCancel={event => { event.preventDefault(); resume(); }}>
    <h2 className="text-xl font-bold">{intention ? t('rhythmIntention') : t(active?.kind === 'zikr' ? 'rhythmZikr' : active?.kind === 'wird' ? 'rhythmWird' : 'rhythmPrayerPause')}</h2>
    {intention && <p dir="auto" className="whitespace-pre-wrap leading-loose py-4">{lang === 'ar' ? settings.intentionAr : settings.intentionEn}</p>}
    <p className="text-sm py-3">{t('rhythmProgressSafe')}</p>
    {error && <p role="alert">{t('plannerError')}</p>}
    <div className="flex flex-wrap gap-3"><button ref={resumeButton} className={field} onClick={resume}>{t('rhythmResume')}</button><button className={field} onClick={async () => {
      try {
        const value = { ...settings, enabled: false, launch: false };
        await window.electronAPI.settings.set(RHYTHM_SETTINGS_KEY, value);
        window.dispatchEvent(new Event(RHYTHM_CHANGED_EVENT));
        setSettings(value); resume();
      } catch { setError(true); }
    }}>{t('rhythmDisable')}</button></div>
  </dialog>;
}
