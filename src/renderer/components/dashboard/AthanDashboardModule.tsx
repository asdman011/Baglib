'use client';
import { FeedbackSkeleton } from '../ui/FeedbackSkeleton';

import React, { useState } from 'react';
import {
  Bell,
  Calendar,
  Clock,
  Compass,
  Landmark,
  MapPin,
  Moon,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { translations } from '../../translations';
import { CALCULATION_METHOD_PRESETS, PRAYER_LABELS } from '../../../shared/athan-calculator';
import type {
  AthanAlertPayload,
  AsrJuristicMethod,
  AthanSettings,
  CalculationMethodId,
  HighLatitudeRule,
  LocationSourceMode,
  MandatoryPrayerName,
  PrayerName,
  PrayerStatusSnapshot,
} from '../../../shared/types/athan';

interface AthanDashboardModuleProps {
  snapshot: PrayerStatusSnapshot;
  activeAlert: AthanAlertPayload | null;
  syncing: boolean;
  statusMessage: string | null;
  onUpdateSettings: (partial: Partial<AthanSettings>) => Promise<PrayerStatusSnapshot>;
  onDetectLocation: () => Promise<unknown>;
  onSyncMawaqit: (slug?: string) => Promise<unknown>;
  onTriggerTestAlert: (prayer?: PrayerName) => Promise<unknown>;
  onDismissAlert: () => void;
  onOpenSnooze?: () => void;
}

const PRAYER_ICONS: Record<PrayerName, React.ComponentType<{ className?: string }>> = {
  fajr: Sunrise,
  sunrise: Sun,
  dhuhr: Sun,
  asr: Sun,
  maghrib: Sunset,
  isha: Moon,
};

export const AthanDashboardModule: React.FC<AthanDashboardModuleProps> = ({
  snapshot,
  activeAlert,
  syncing,
  statusMessage,
  onUpdateSettings,
  onDetectLocation,
  onSyncMawaqit,
  onTriggerTestAlert,
  onDismissAlert,
  onOpenSnooze,
}) => {
  const { lang, dir } = useWorkspace();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recordingError, setRecordingError] = useState(false);

  const { settings, times, nextPrayer, activeWindow, hijriDate } = snapshot;

  // Enforce Force-Arabic & RTL option when enabled
  const forceAr = settings.localization.forceArabicWidgets;
  const effectiveLang = forceAr ? 'ar' : lang;
  const effectiveDir = forceAr ? 'rtl' : dir;
  const tr = translations[effectiveLang];
  let recordingName = settings.audio.customAudioPath?.split('/').at(-1) || '';
  try { recordingName = decodeURIComponent(recordingName); } catch {}
  const chooseRecording = async () => {
    setRecordingError(false);
    try {
      const api = window.electronAPI?.athan;
      if (!api?.chooseRecording) throw new Error('unavailable');
      await api.chooseRecording();
    } catch { setRecordingError(true); }
  };

  const [latInput, setLatInput] = useState(String(settings.manualLocation.latitude));
  const [lngInput, setLngInput] = useState(String(settings.manualLocation.longitude));
  const [elvInput, setElvInput] = useState(String(settings.manualLocation.elevation));
  const [tzInput, setTzInput] = useState(settings.manualLocation.timezone);
  const [cityInput, setCityInput] = useState(settings.manualLocation.cityName || '');
  const [mawaqitSlugInput, setMawaqitSlugInput] = useState(settings.mawaqit.mosqueIdOrSlug || '');
  const [jamaahJsonInput, setJamaahJsonInput] = useState(settings.jamaahPresetJson || '');

  const prayerOrder: PrayerName[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const nextLabel = PRAYER_LABELS[nextPrayer.name][effectiveLang];

  const activeSourceLabel =
    snapshot.activeSource === 'mawaqit' && snapshot.mawaqitConnected
      ? tr.athanSourceMawaqit
      : snapshot.activeSource === 'auto'
      ? tr.athanSourceAuto
      : tr.athanSourceManual;

  const handleSaveManualLocation = () => {
    const lat = parseFloat(latInput);
    const lng = parseFloat(lngInput);
    const elv = parseFloat(elvInput);
    void onUpdateSettings({
      locationMode: 'manual',
      manualLocation: {
        latitude: Number.isFinite(lat) ? lat : settings.manualLocation.latitude,
        longitude: Number.isFinite(lng) ? lng : settings.manualLocation.longitude,
        elevation: Number.isFinite(elv) ? elv : 0,
        timezone: tzInput.trim() || 'UTC',
        cityName: cityInput.trim() || undefined,
      },
    });
  };

  if (syncing) return <FeedbackSkeleton />;

  return (
    <section
      dir={effectiveDir}
      data-dashboard-module="athan-prayer-times"
      aria-label={tr.athanModuleTitle}
      className="rounded-2xl border border-emerald-600/30 bg-surface p-4 shadow-sm space-y-4 relative overflow-hidden"
    >
      {/* Top Header & Active Source Mosque / Location Indicator */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Landmark className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display font-bold text-base text-main truncate">
              {tr.athanModuleTitle}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span
                data-athan-source-indicator={snapshot.activeSource}
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300"
              >
                {snapshot.mawaqitConnected ? (
                  <Landmark
                    data-athan-mosque-icon
                    className="w-3.5 h-3.5 text-emerald-500 shrink-0"
                  />
                ) : (
                  <MapPin className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
                )}
                <span>{activeSourceLabel}</span>
                <span>· {snapshot.locationLabel}</span>
              </span>
              {snapshot.fallbackActive && (
                <span
                  data-athan-fallback-badge
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold"
                >
                  <WifiOff className="w-3 h-3" />
                  {tr.athanFallbackBadge}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Controls: Audio Mute Toggle, Test Alert, Settings */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-athan-mute-toggle
            onClick={() =>
              void onUpdateSettings({
                audio: { ...settings.audio, enabled: true, muted: settings.audio.enabled ? !settings.audio.muted : false },
              })
            }
            title={settings.audio.muted ? tr.athanUnmuteAudio : tr.athanMuteAudio}
            aria-label={settings.audio.muted ? tr.athanUnmuteAudio : tr.athanMuteAudio}
            className={`p-2 rounded-xl border border-subtle transition-colors cursor-pointer ${
              settings.audio.muted
                ? 'bg-red-500/10 text-red-500'
                : 'bg-canvas text-emerald-600 dark:text-emerald-400 hover:bg-surface'
            }`}
          >
            {settings.audio.muted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>

          {onOpenSnooze && (
            <button
              type="button"
              data-athan-snooze-btn
              onClick={onOpenSnooze}
              title={tr.dashPrayerSnoozeBtn}
              className="px-2.5 py-1.5 rounded-xl border border-subtle bg-canvas hover:bg-surface text-xs font-bold text-main inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Moon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">{tr.dashPrayerSnoozeBtn}</span>
            </button>
          )}

          <button
            type="button"
            data-athan-test-alert
            onClick={() => void onTriggerTestAlert(nextPrayer.name)}
            title={tr.athanTestAlertBtn}
            className="px-2.5 py-1.5 rounded-xl border border-subtle bg-canvas hover:bg-surface text-xs font-bold text-main inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Bell className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline">{tr.athanTestAlertBtn}</span>
          </button>

          <button
            type="button"
            data-athan-settings-toggle
            onClick={() => setSettingsOpen((prev) => !prev)}
            title={tr.athanSettingsBtn}
            aria-expanded={settingsOpen}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              settingsOpen
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'border-subtle bg-canvas hover:bg-surface text-main'
            }`}
           aria-label={tr.athanSettingsBtn}>
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Active Prayer Window Status Banner ("Time for [X] Prayer" / "حان الآن وقت صلاة [X]") */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {/* KEY-312: built-in chime, two licensed recorded adhans, or the user's own recording. */}
        <label className="flex flex-wrap items-center gap-2">
          <span>{tr.athanSoundLabel}</span>
          <select data-athan-sound value={settings.audio.soundPreset === 'madinah-recorded' || settings.audio.soundPreset === 'adhan-recorded' || settings.audio.soundPreset === 'custom' ? settings.audio.soundPreset : 'makkah-short'}
            onChange={event => { const preset = event.target.value as AthanSettings['audio']['soundPreset']; if (preset === 'custom' && !settings.audio.customAudioPath) { void chooseRecording(); return; } void onUpdateSettings({ audio: { ...settings.audio, soundPreset: preset } }); }}
            className="rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-main">
            <option value="makkah-short">{tr.athanSoundChime}</option>
            <option value="madinah-recorded">{tr.athanSoundMadinah}</option>
            <option value="adhan-recorded">{tr.athanSoundShort}</option>
            <option value="custom">{settings.audio.customAudioPath ? recordingName : tr.athanSoundCustom}</option>
          </select>
        </label>
        <button type="button" className="rounded-lg border border-subtle px-3 py-2 text-main" onClick={() => void chooseRecording()}>{tr.athanChooseRecording}</button>
        {settings.audio.soundPreset === 'madinah-recorded' && <span data-athan-sound-credit className="w-full">{tr.athanCreditMadinah}</span>}
        {settings.audio.soundPreset === 'adhan-recorded' && <span data-athan-sound-credit className="w-full">{tr.athanCreditShort}</span>}
        {settings.audio.soundPreset !== 'madinah-recorded' && settings.audio.soundPreset !== 'adhan-recorded' && settings.audio.soundPreset !== 'custom' && <span className="w-full">{tr.athanBuiltInChime}</span>}
        {recordingError && <p role="alert">{tr.athanPlaybackFailed}</p>}
      </div>
      {activeWindow && (
        <div
          role="status"
          data-athan-active-window={activeWindow.prayer}
          className="rounded-2xl bg-emerald-600 text-white px-4 py-3 flex items-center justify-between gap-3 shadow-md"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 shrink-0" />
            <span className="font-display font-bold text-sm sm:text-base">
              {tr.athanTimeForPrayerBanner.replace(
                '{prayer}',
                PRAYER_LABELS[activeWindow.prayer][effectiveLang]
              )}
            </span>
          </div>
          {activeWindow.iqamahTime && (
            <span className="text-xs font-mono font-bold bg-white/20 px-2.5 py-1 rounded-lg">
              {tr.athanIqamahLabel}: {activeWindow.iqamahTime}
            </span>
          )}
        </div>
      )}

      {/* Next Prayer Highlight Card + Live Countdown + Hijri Date Bar */}
      <div className="grid grid-cols-1 @min-[44rem]:grid-cols-2 gap-3">
        {/* Next Prayer & Live Countdown Timer */}
        <div
          data-athan-next-prayer-card
          className="rounded-2xl bg-gradient-to-br from-emerald-600/15 via-emerald-500/5 to-transparent border border-emerald-500/30 p-4 flex items-center justify-between gap-3"
        >
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 block">
              {tr.athanNextPrayerLabel}
            </span>
            <div className="text-xl font-display font-black text-main flex items-center gap-2">
              <span>{nextLabel}</span>
              <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {nextPrayer.time}
              </span>
            </div>
            {nextPrayer.iqamahTime && (
              <span className="text-xs text-muted block font-mono">
                {tr.athanIqamahLabel}: {nextPrayer.iqamahTime}
              </span>
            )}
          </div>

          <div className="text-end space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">
              {tr.athanCountdownLabel}
            </span>
            <div
              data-athan-countdown
              className="text-xl sm:text-2xl font-mono font-black text-emerald-600 dark:text-emerald-400 tracking-tight"
            >
              {nextPrayer.countdownFormatted}
            </div>
          </div>
        </div>

        {/* Hijri Date Card with +/- Day Adjustment */}
        <div
          data-athan-hijri-card
          className="rounded-2xl bg-canvas/70 border border-subtle p-4 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p
                data-athan-hijri-text
                className="font-display font-bold text-sm sm:text-base text-main truncate"
              >
                {effectiveLang === 'ar' ? hijriDate.formattedAr : hijriDate.formattedEn}
              </p>
              <p className="text-xs text-muted font-mono">{times.date}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              data-hijri-adjust-minus
              onClick={() =>
                void onUpdateSettings({
                  hijriAdjustmentDays: Math.max(-2, settings.hijriAdjustmentDays - 1),
                })
              }
              title={tr.athanHijriAdjustMinus}
              className="px-2 py-1 rounded-lg border border-subtle bg-surface hover:bg-canvas text-xs font-mono font-bold text-main cursor-pointer"
             aria-label={tr.athanHijriAdjustMinus}>
              -1
            </button>
            <span className="text-xs font-mono text-muted px-1">
              {settings.hijriAdjustmentDays > 0
                ? `+${settings.hijriAdjustmentDays}`
                : settings.hijriAdjustmentDays}
            </span>
            <button
              type="button"
              data-hijri-adjust-plus
              onClick={() =>
                void onUpdateSettings({
                  hijriAdjustmentDays: Math.min(2, settings.hijriAdjustmentDays + 1),
                })
              }
              title={tr.athanHijriAdjustPlus}
              className="px-2 py-1 rounded-lg border border-subtle bg-surface hover:bg-canvas text-xs font-mono font-bold text-main cursor-pointer"
             aria-label={tr.athanHijriAdjustPlus}>
              +1
            </button>
          </div>
        </div>
      </div>

      {/* 6 Daily Prayer Times Grid (with Athan & Iqamah Times) */}
      <div className="grid grid-cols-2 @min-[28rem]:grid-cols-3 @min-[52rem]:grid-cols-6 gap-2.5">
        {prayerOrder.map((p) => {
          const Icon = PRAYER_ICONS[p];
          const isNext = nextPrayer.name === p && !nextPrayer.isTomorrow;
          const isActive = activeWindow?.prayer === p;
          const iqamahTime = p !== 'sunrise' ? times.iqamah[p as MandatoryPrayerName] : undefined;

          return (
            <div
              key={p}
              data-prayer-tile={p}
              className={`rounded-2xl p-3 border transition-all flex flex-col justify-between gap-2 ${
                isActive
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                  : isNext
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-main'
                  : 'bg-canvas/60 border-subtle text-main'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold truncate">
                  {PRAYER_LABELS[p][effectiveLang]}
                </span>
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isActive ? 'text-white' : 'text-emerald-500'
                  }`}
                />
              </div>

              <div>
                <div
                  data-prayer-time={p}
                  className="text-base font-mono font-black tracking-tight"
                >
                  {times[p]}
                </div>
                {iqamahTime && (
                  <div
                    data-prayer-iqamah={p}
                    className={`text-[10px] font-mono ${
                      isActive ? 'text-white/90' : 'text-muted'
                    }`}
                  >
                    {tr.athanIqamahLabel}: {iqamahTime}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional Sunnah Prayers Row: Duha, Islamic Midnight, Tahajjud (Last Third) */}
      {(settings.sunnahPrayers.duha ||
        settings.sunnahPrayers.midnight ||
        settings.sunnahPrayers.tahajjud) && (
        <div
          data-athan-sunnah-row
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-canvas/50 border border-subtle px-4 py-2.5 text-xs"
        >
          {settings.sunnahPrayers.duha && times.duha && (
            <div className="flex items-center gap-2">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-muted">{tr.athanSunnahDuha}:</span>
              <span className="font-mono font-bold text-main">{times.duha}</span>
            </div>
          )}
          {settings.sunnahPrayers.midnight && times.midnight && (
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-pale-sky-500" />
              <span className="text-muted">{tr.athanSunnahMidnight}:</span>
              <span className="font-mono font-bold text-main">{times.midnight}</span>
            </div>
          )}
          {settings.sunnahPrayers.tahajjud && times.lastThird && (
            <div className="flex items-center gap-2">
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-muted">{tr.athanSunnahTahajjud}:</span>
              <span className="font-mono font-bold text-main">{times.lastThird}</span>
            </div>
          )}
        </div>
      )}

      {statusMessage && (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          {statusMessage}
        </p>
      )}

      {/* Comprehensive Settings Drawer */}
      {settingsOpen && (
        <div
          data-athan-settings-panel
          className="rounded-2xl border border-subtle bg-canvas p-4 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between border-b border-subtle pb-2">
            <h3 className="font-bold text-sm text-main flex items-center gap-2">
              <Compass className="w-4 h-4 text-emerald-500" />
              {tr.athanSettingsBtn}
            </h3>
            <label className="inline-flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300 cursor-pointer">
              <input
                type="checkbox"
                data-athan-force-arabic-checkbox
                checked={settings.localization.forceArabicWidgets}
                onChange={(e) =>
                  void onUpdateSettings({
                    localization: { forceArabicWidgets: e.target.checked },
                  })
                }
              />
              {tr.athanForceArabicLabel}
            </label>
          </div>

          {/* 1. Location Source Mode */}
          <div className="grid grid-cols-1 @min-[28rem]:grid-cols-3 gap-2">
            {(['manual', 'auto', 'mawaqit'] as LocationSourceMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                data-athan-mode-btn={mode}
                onClick={() => void onUpdateSettings({ locationMode: mode })}
                className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                  settings.locationMode === mode
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-surface border-subtle text-main'
                }`}
              >
                {mode === 'mawaqit' ? (
                  <Landmark className="w-3.5 h-3.5" />
                ) : (
                  <MapPin className="w-3.5 h-3.5" />
                )}
                {mode === 'manual'
                  ? tr.athanSourceManual
                  : mode === 'auto'
                  ? tr.athanSourceAuto
                  : tr.athanSourceMawaqit}
              </button>
            ))}
          </div>

          {/* Manual Location Coordinates */}
          {settings.locationMode === 'manual' && (
            <div className="grid grid-cols-2 @min-[34rem]:grid-cols-5 gap-2 items-end">
              <label className="space-y-1">
                <span className="text-muted block">{tr.athanLatitudeLabel}</span>
                <input
                  type="number"
                  step="any"
                  data-athan-lat-input
                  value={latInput}
                  onChange={(e) => setLatInput(e.target.value)}
                  onBlur={handleSaveManualLocation}
                  className="w-full rounded-xl border border-subtle bg-surface px-2.5 py-1.5 text-main font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted block">{tr.athanLongitudeLabel}</span>
                <input
                  type="number"
                  step="any"
                  data-athan-lng-input
                  value={lngInput}
                  onChange={(e) => setLngInput(e.target.value)}
                  onBlur={handleSaveManualLocation}
                  className="w-full rounded-xl border border-subtle bg-surface px-2.5 py-1.5 text-main font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted block">{tr.athanElevationLabel}</span>
                <input
                  type="number"
                  value={elvInput}
                  onChange={(e) => setElvInput(e.target.value)}
                  onBlur={handleSaveManualLocation}
                  className="w-full rounded-xl border border-subtle bg-surface px-2.5 py-1.5 text-main font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted block">{tr.athanTimezoneLabel}</span>
                <input
                  type="text"
                  value={tzInput}
                  onChange={(e) => setTzInput(e.target.value)}
                  onBlur={handleSaveManualLocation}
                  className="w-full rounded-xl border border-subtle bg-surface px-2.5 py-1.5 text-main font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted block">{tr.athanCityLabel}</span>
                <input
                  type="text"
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  onBlur={handleSaveManualLocation}
                  className="w-full rounded-xl border border-subtle bg-surface px-2.5 py-1.5 text-main"
                />
              </label>
            </div>
          )}

          {/* Automatic Geolocation */}
          {settings.locationMode === 'auto' && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">{snapshot.locationLabel}</span>
              <button
                type="button"
                disabled={syncing}
                onClick={() => void onDetectLocation()}
                className="px-3 py-1.5 rounded-xl bg-pale-sky-600 text-white font-bold cursor-pointer disabled:opacity-50"
              >
                {tr.athanDetectAutoLocationBtn}
              </button>
            </div>
          )}

          {/* Mawaqit Mosque Configuration */}
          {settings.locationMode === 'mawaqit' && (
            <div className="grid grid-cols-1 @min-[28rem]:grid-cols-3 gap-2 items-end">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-muted block">{tr.athanMawaqitSlugLabel}</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    data-athan-mawaqit-input
                    value={mawaqitSlugInput}
                    onChange={(e) => setMawaqitSlugInput(e.target.value)}
                    placeholder="e.g. mosquee-de-paris"
                    className="flex-1 rounded-xl border border-subtle bg-surface px-3 py-1.5 text-main"
                  />
                  <button
                    type="button"
                    data-athan-mawaqit-sync
                    disabled={syncing}
                    onClick={() => void onSyncMawaqit(mawaqitSlugInput)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold cursor-pointer disabled:opacity-50"
                  >
                    {tr.athanMawaqitSyncBtn}
                  </button>
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-muted block">{tr.athanMawaqitFallbackLabel}</span>
                <select
                  value={settings.mawaqit.fallbackMode}
                  onChange={(e) =>
                    void onUpdateSettings({
                      mawaqit: {
                        ...settings.mawaqit,
                        fallbackMode: e.target.value as 'auto' | 'manual',
                      },
                    })
                  }
                  className="w-full rounded-xl border border-subtle bg-surface px-2.5 py-1.5 text-main"
                >
                  <option value="manual">{tr.athanSourceManual}</option>
                  <option value="auto">{tr.athanSourceAuto}</option>
                </select>
              </label>
            </div>
          )}

          {/* 2. Astronomical Calculation Method, Asr Ratio, High-Latitude Rule */}
          <div className="grid grid-cols-1 @min-[28rem]:grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-muted block">{tr.athanCalcMethodLabel}</span>
              <select
                data-athan-calc-method
                value={settings.calculationMethod}
                onChange={(e) =>
                  void onUpdateSettings({
                    calculationMethod: e.target.value as CalculationMethodId,
                    methodConfiguredByUser: true,
                  })
                }
                className="w-full rounded-xl border border-subtle bg-surface px-2.5 py-1.5 text-main"
              >
                {Object.values(CALCULATION_METHOD_PRESETS).map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {effectiveLang === 'ar' ? preset.nameAr : preset.nameEn}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-muted block">{tr.athanAsrMethodLabel}</span>
              <select
                data-athan-asr-method
                value={settings.asrMethod}
                onChange={(e) =>
                  void onUpdateSettings({
                    asrMethod: e.target.value as AsrJuristicMethod,
                  })
                }
                className="w-full rounded-xl border border-subtle bg-surface px-2.5 py-1.5 text-main"
              >
                <option value="standard">{tr.athanAsrStandard}</option>
                <option value="hanafi">{tr.athanAsrHanafi}</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-muted block">{tr.athanHighLatLabel}</span>
              <select
                data-athan-high-lat
                value={settings.highLatitudeRule}
                onChange={(e) =>
                  void onUpdateSettings({
                    highLatitudeRule: e.target.value as HighLatitudeRule,
                  })
                }
                className="w-full rounded-xl border border-subtle bg-surface px-2.5 py-1.5 text-main"
              >
                <option value="angleBased">{tr.athanHighLatAngle}</option>
                <option value="middleOfTheNight">{tr.athanHighLatMiddle}</option>
                <option value="oneSeventh">{tr.athanHighLatSeventh}</option>
                <option value="none">{tr.athanHighLatNone}</option>
              </select>
            </label>
          </div>

          {/* Custom Fajr & Isha Depression Angles */}
          {settings.calculationMethod === 'Custom' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-muted block">{tr.athanFajrAngleLabel}</span>
                <input
                  type="number"
                  step="0.1"
                  min={10}
                  max={25}
                  data-athan-custom-fajr-angle
                  value={settings.customFajrAngle}
                  onChange={(e) =>
                    void onUpdateSettings({
                      customFajrAngle: parseFloat(e.target.value) || 18,
                    })
                  }
                  className="w-full rounded-xl border border-subtle bg-surface px-2.5 py-1.5 text-main font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted block">{tr.athanIshaAngleLabel}</span>
                <input
                  type="number"
                  step="0.1"
                  min={10}
                  max={25}
                  data-athan-custom-isha-angle
                  value={settings.customIshaAngle}
                  onChange={(e) =>
                    void onUpdateSettings({
                      customIshaAngle: parseFloat(e.target.value) || 17,
                    })
                  }
                  className="w-full rounded-xl border border-subtle bg-surface px-2.5 py-1.5 text-main font-mono"
                />
              </label>
            </div>
          )}

          {/* 3. Custom Jama'ah JSON Preset & Notification / Audio Settings */}
          <div className="grid grid-cols-1 @min-[28rem]:grid-cols-3 gap-3 items-end">
            <label className="space-y-1">
              <span className="text-muted block">{tr.athanJamaahPresetLabel}</span>
              <input
                type="text"
                data-athan-jamaah-json
                value={jamaahJsonInput}
                onChange={(e) => setJamaahJsonInput(e.target.value)}
                onBlur={() =>
                  void onUpdateSettings({ jamaahPresetJson: jamaahJsonInput.trim() })
                }
                placeholder='{"fajr":"05:30","dhuhr":"+15"}'
                className="w-full rounded-xl border border-subtle bg-surface px-2.5 py-1.5 text-main font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="text-muted block">{tr.athanPreReminderLabel}</span>
              <input
                type="number"
                min={1}
                max={60}
                value={settings.notifications.preReminderMinutes}
                onChange={(e) =>
                  void onUpdateSettings({
                    notifications: {
                      ...settings.notifications,
                      preReminderMinutes: Math.max(1, parseInt(e.target.value, 10) || 15),
                    },
                  })
                }
                className="w-full rounded-xl border border-subtle bg-surface px-2.5 py-1.5 text-main font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="text-muted block">{tr.athanVolumeLabel}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                data-athan-volume-slider
                value={settings.audio.volume}
                onChange={(e) =>
                  void onUpdateSettings({
                    audio: { ...settings.audio, volume: parseFloat(e.target.value) },
                  })
                }
                className="w-full accent-emerald-600"
              />
            </label>
          </div>

          {/* 4. Manual Minute Adjustments (± Minutes) */}
          <div className="space-y-2 pt-2 border-t border-subtle">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-sm font-semibold text-main">{tr.athanAdjustmentsTitle}</span>
              <span className="text-xs text-muted">{tr.athanAdjustmentsSubtitle}</span>
            </div>
            <div className="grid grid-cols-2 @min-[36rem]:grid-cols-6 gap-2">
              {(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).map((p) => {
                const curVal = settings.adjustments?.[p] || 0;
                return (
                  <label key={p} className="flex flex-col items-center gap-1 p-2 rounded-xl border border-subtle bg-surface">
                    <span className="text-xs font-medium text-muted">{PRAYER_LABELS[p][effectiveLang]}</span>
                    <div className="flex items-center gap-1 w-full justify-center">
                      <input
                        type="number"
                        min={-60}
                        max={60}
                        step={1}
                        data-athan-adjust={p}
                        value={curVal}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          void onUpdateSettings({
                            adjustments: {
                              ...settings.adjustments,
                              [p]: val,
                            },
                          });
                        }}
                        className="w-16 text-center rounded-lg border border-subtle bg-background px-1 py-1 text-xs text-main font-mono"
                      />
                      <span className="text-[10px] text-muted">{tr.athanAdjustmentsMinute}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Optional Non-Intrusive Modal Dialog Prompt on Prayer Entry */}
      {activeAlert && (
        <div
          role="dialog"
          aria-modal="false"
          data-athan-alert-modal
          className="rounded-2xl border-2 border-emerald-500 bg-surface/95 backdrop-blur-md p-4 shadow-2xl flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Bell className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <h4 className="font-display font-bold text-sm text-main">
                {tr.athanTimeForPrayerBanner.replace(
                  '{prayer}',
                  PRAYER_LABELS[activeAlert.prayer][effectiveLang]
                )}
              </h4>
              <p className="text-xs text-muted font-mono">
                {tr.athanAthanLabel}: {activeAlert.scheduledTime}
                {activeAlert.iqamahTime
                  ? ` · ${tr.athanIqamahLabel}: ${activeAlert.iqamahTime}`
                  : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-athan-dismiss-modal
            onClick={onDismissAlert}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            {tr.athanDismissModal}
          </button>
        </div>
      )}
    </section>
  );
};
