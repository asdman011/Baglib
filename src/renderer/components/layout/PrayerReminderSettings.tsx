'use client';
import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui';
import { useToast } from '../ui/Toast';
import { CALCULATION_METHOD_PRESETS, PRAYER_LABELS } from '../../../shared/athan-calculator';
import { DEFAULT_DHIKR_REMINDERS, DEFAULT_QUIET_WINDOW, PRAYERS, validateReminderSettings, type DhikrReminder } from '../../../shared/notifications';
import { dhikrTitle } from '../../../shared/notification-text';
import type { AthanSettings, CalculationMethodId, PrayerName } from '../../../shared/types/athan';
import type { useAthan } from '../../hooks/useAthan';

const field = 'w-full min-w-0 rounded-lg border border-subtle bg-surface p-2 text-main leading-loose';
export function PrayerReminderSettings({ athan }: { athan: ReturnType<typeof useAthan> }) {
  const { t, lang } = useWorkspace();
  const { showToast } = useToast();
  const [draft, setDraft] = useState<AthanSettings>(() => structuredClone(athan.snapshot.settings));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const reminders = draft.dhikrReminders ?? DEFAULT_DHIKR_REMINDERS;
  const quiet = draft.notifications.quietWindow ?? DEFAULT_QUIET_WINDOW;
  const changeReminder = (id: string, partial: Partial<DhikrReminder>) => setDraft({ ...draft, dhikrReminders: reminders.map(item => item.id === id ? { ...item, ...partial } : item) });
  const soundOptions = <><option value="">{t('notificationInherit')}</option><option value="makkah-short">{t('athanBuiltInChime')}</option><option value="madinah-recorded">{t('athanSoundMadinah')}</option><option value="adhan-recorded">{t('athanSoundShort')}</option></>;
  return <form data-prayer-reminder-settings className="space-y-5 text-start leading-loose" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setFailed(false);
    try { validateReminderSettings(draft); await athan.updateSettings(draft); showToast({ message: t('notificationSaved'), type: 'success' }); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>{t('athanCityLabel')}<input data-prayer-city dir="auto" className={field} value={draft.manualLocation.cityName ?? ''} onChange={event => setDraft({ ...draft, locationMode: 'manual', manualLocation: { ...draft.manualLocation, cityName: event.target.value } })} /></label>
        <label>{t('athanTimezoneLabel')}<input required className={field} value={draft.manualLocation.timezone} onChange={event => setDraft({ ...draft, locationMode: 'manual', manualLocation: { ...draft.manualLocation, timezone: event.target.value } })} /></label>
        <label>{t('athanLatitudeLabel')}<input required type="number" step="any" min={-90} max={90} className={field} value={draft.manualLocation.latitude} onChange={event => setDraft({ ...draft, locationMode: 'manual', manualLocation: { ...draft.manualLocation, latitude: Number(event.target.value) } })} /></label>
        <label>{t('athanLongitudeLabel')}<input required type="number" step="any" min={-180} max={180} className={field} value={draft.manualLocation.longitude} onChange={event => setDraft({ ...draft, locationMode: 'manual', manualLocation: { ...draft.manualLocation, longitude: Number(event.target.value) } })} /></label>
        <label>{t('athanCalcMethodLabel')}<select data-prayer-method className={field} value={draft.calculationMethod} onChange={event => setDraft({ ...draft, calculationMethod: event.target.value as CalculationMethodId, methodConfiguredByUser: true })}>{Object.values(CALCULATION_METHOD_PRESETS).map(method => <option key={method.id} value={method.id}>{lang === 'ar' ? method.nameAr : method.nameEn}</option>)}</select></label>
        <label>{t('athanAsrMethodLabel')}<select data-prayer-madhab className={field} value={draft.asrMethod} onChange={event => setDraft({ ...draft, asrMethod: event.target.value as AthanSettings['asrMethod'] })}><option value="standard">{t('athanAsrStandard')}</option><option value="hanafi">{t('athanAsrHanafi')}</option></select></label>
      </div>
      <label className="block"><input type="checkbox" checked={draft.notifications.enabled} onChange={event => setDraft({ ...draft, notifications: { ...draft.notifications, enabled: event.target.checked } })} /> {t('notificationEnable')}</label>
      <label className="block"><input type="checkbox" checked={draft.notifications.preReminderEnabled} onChange={event => setDraft({ ...draft, notifications: { ...draft.notifications, preReminderEnabled: event.target.checked } })} /> {t('athanPreReminderLabel')}</label>
      <h3 className="font-semibold">{t('notificationPerPrayer')}</h3>
      {PRAYERS.filter(prayer => prayer !== 'sunrise').map(prayer => <fieldset key={prayer} data-prayer-row={prayer} className="min-w-0 rounded-xl border border-subtle p-3">
        <legend className="px-2 font-semibold">{PRAYER_LABELS[prayer][lang]}</legend>
        <label><input type="checkbox" checked={draft.notifications.enabledPrayers[prayer]} onChange={event => setDraft({ ...draft, notifications: { ...draft.notifications, enabledPrayers: { ...draft.notifications.enabledPrayers, [prayer]: event.target.checked } } })} /> {t('settingsEnabled')}</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>{t('athanPreReminderLabel')}<input type="number" min={0} max={180} className={field} value={draft.notifications.preReminderByPrayer?.[prayer] ?? draft.notifications.preReminderMinutes} onChange={event => setDraft({ ...draft, notifications: { ...draft.notifications, preReminderByPrayer: { ...draft.notifications.preReminderByPrayer, [prayer]: Number(event.target.value) } } })} /></label>
          <label>{t('notificationSound')}<select data-prayer-sound={prayer} className={field} value={draft.audio.prayerSounds?.[prayer] ?? ''} onChange={event => setDraft({ ...draft, audio: { ...draft.audio, prayerSounds: { ...draft.audio.prayerSounds, [prayer]: (event.target.value || undefined) as AthanSettings['audio']['soundPreset'] | undefined } } })}>{soundOptions}</select></label>
        </div>
      </fieldset>)}
      <label className="block"><input type="checkbox" checked={draft.audio.enabled && !draft.audio.muted} onChange={event => setDraft({ ...draft, audio: { ...draft.audio, enabled: event.target.checked, muted: !event.target.checked } })} /> {t('athanUnmuteAudio')}</label>
      <label className="block">{t('athanVolumeLabel')}<input className="block w-full" type="range" min={0} max={1} step={0.05} value={draft.audio.volume} onChange={event => setDraft({ ...draft, audio: { ...draft.audio, volume: Number(event.target.value) } })} /></label>
      <fieldset className="min-w-0 space-y-2 rounded-xl border border-subtle p-3"><legend>{t('notificationQuiet')}</legend>
        <label><input data-notification-quiet type="checkbox" checked={quiet.enabled} onChange={event => setDraft({ ...draft, notifications: { ...draft.notifications, quietWindow: { ...quiet, enabled: event.target.checked } } })} /> {t('settingsEnabled')}</label>
        <div className="grid grid-cols-2 gap-3">{(['start', 'end'] as const).map(edge => <label key={edge}>{t(edge === 'start' ? 'notificationStart' : 'notificationEnd')}<input type="time" required className={field} value={quiet[edge]} onChange={event => setDraft({ ...draft, notifications: { ...draft.notifications, quietWindow: { ...quiet, [edge]: event.target.value } } })} /></label>)}</div>
      </fieldset>
      <h3 className="font-semibold">{t('notificationDhikr')}</h3>
      {reminders.map(reminder => <fieldset key={reminder.id} data-dhikr-row={reminder.id} className="min-w-0 space-y-2 rounded-xl border border-subtle p-3">
        <legend className="px-2">{dhikrTitle(reminder, lang)}{reminder.kind === 'afterPrayer' && reminder.prayer ? ` ? ${PRAYER_LABELS[reminder.prayer][lang]}` : ''}</legend>
        <label><input type="checkbox" checked={reminder.enabled} onChange={event => changeReminder(reminder.id, { enabled: event.target.checked })} /> {t('settingsEnabled')}</label>
        {reminder.kind === 'custom' && <label className="block">{t('notificationTitle')}<input maxLength={200} dir="auto" className={field} value={reminder.title} onChange={event => changeReminder(reminder.id, { title: event.target.value })} /></label>}
        <label className="block">{t('notificationTime')}<select className={field} value={reminder.prayer ?? ''} onChange={event => changeReminder(reminder.id, { prayer: (event.target.value || null) as PrayerName | null })}><option value="">{t('notificationFixed')}</option>{PRAYERS.filter(prayer => prayer !== 'sunrise').map(prayer => <option key={prayer} value={prayer}>{PRAYER_LABELS[prayer][lang]}</option>)}</select></label>
        {reminder.prayer ? <label className="block">{t('notificationOffset')}<input required type="number" min={-720} max={720} className={field} value={reminder.offsetMinutes} onChange={event => changeReminder(reminder.id, { offsetMinutes: Number(event.target.value) })} /></label> : <label className="block">{t('notificationFixed')}<input required type="time" className={field} value={reminder.time} onChange={event => changeReminder(reminder.id, { time: event.target.value })} /></label>}
        {reminder.kind === 'custom' && <Button type="button" variant="ghost" onClick={() => setDraft({ ...draft, dhikrReminders: reminders.filter(item => item.id !== reminder.id) })}>{t('notificationRemove')}</Button>}
      </fieldset>)}
      <Button type="button" data-notification-add-custom variant="secondary" disabled={reminders.length >= 60} onClick={() => setDraft({ ...draft, dhikrReminders: [...reminders, { id: crypto.randomUUID(), kind: 'custom', title: '', enabled: false, time: '12:00', prayer: null, offsetMinutes: 0 }] })}>{t('notificationAddCustom')}</Button>
    </fieldset>
    {failed && <p role="alert">{t('studyActionFailed')}</p>}
    <Button type="submit" data-notification-save disabled={busy}>{t('save')}</Button>
  </form>;
}
