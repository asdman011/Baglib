/**
 * Baglib — Main Process Athan & Prayer Times Service
 *
 * Manages SQLite settings persistence, automatic geolocation, Mawaqit mosque
 * synchronization with offline fallback, system timers, native OS notifications
 * with prayer-specific icons, and IPC broadcasts.
 */

import { randomUUID } from 'node:crypto';
import type { ISettingsRepository } from '../../database/repositories/settings.repository';
import type {
  AthanAlertPayload,
  AthanSettings,
  CoordinatesConfig,
  MandatoryPrayerName,
  MawaqitMosqueData,
  PrayerName,
  PrayerStatusSnapshot,
} from '../../../shared/types/athan';
import {
  DEFAULT_ATHAN_SETTINGS,
  PRAYER_LABELS,
  buildPrayerStatusSnapshot,
  parseHHMMToMinutes,
} from './astronomical-calculator';
export { PRAYER_LABELS };
import {
  type FetchLike,
  detectAutomaticLocation,
  fetchMawaqitMosqueTimes,
} from './location-mawaqit.service';
import { getPrayerIconDataUrl } from './prayer-icons';
import { prayerClock } from '../../../shared/athan-calculator';

const SETTINGS_KEY = 'athan.settings.v1';
const MAWAQIT_CACHE_KEY = 'athan.mawaqit.cache.v1';



export interface NotificationDispatcher {
  showNotification: (options: {
    title: string;
    body: string;
    iconDataUrl: string;
    prayer: PrayerName;
    type: 'athan' | 'pre-reminder';
  }) => void;
  broadcastAlert: (alert: AthanAlertPayload) => void;
  broadcastState: (state: PrayerStatusSnapshot) => void;
}

export class AthanService {
  private mawaqitLive: MawaqitMosqueData | null = null;
  private notifiedKeys = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private settingsRepo: ISettingsRepository,
    private now: () => Date = () => new Date(),
    private fetchFn?: FetchLike,
    private dispatcher?: NotificationDispatcher
  ) {
    const cached = this.settingsRepo.get<MawaqitMosqueData>(MAWAQIT_CACHE_KEY);
    if (cached && cached.times) {
      this.mawaqitLive = cached;
    }
  }

  getSettings(): AthanSettings {
    const stored = this.settingsRepo.get<Partial<AthanSettings>>(SETTINGS_KEY);
    if (!stored || typeof stored !== 'object') {
      return structuredClone(DEFAULT_ATHAN_SETTINGS);
    }
    return {
      ...DEFAULT_ATHAN_SETTINGS,
      ...stored,
      manualLocation: {
        ...DEFAULT_ATHAN_SETTINGS.manualLocation,
        ...(stored.manualLocation || {}),
      },
      mawaqit: {
        ...DEFAULT_ATHAN_SETTINGS.mawaqit,
        ...(stored.mawaqit || {}),
      },
      sunnahPrayers: {
        ...DEFAULT_ATHAN_SETTINGS.sunnahPrayers,
        ...(stored.sunnahPrayers || {}),
      },
      adjustments: {
        ...DEFAULT_ATHAN_SETTINGS.adjustments,
        ...(stored.adjustments || {}),
      },
      iqamahOffsets: {
        ...DEFAULT_ATHAN_SETTINGS.iqamahOffsets,
        ...(stored.iqamahOffsets || {}),
      },
      notifications: {
        ...DEFAULT_ATHAN_SETTINGS.notifications,
        ...(stored.notifications || {}),
        enabledPrayers: {
          ...DEFAULT_ATHAN_SETTINGS.notifications.enabledPrayers,
          ...(stored.notifications?.enabledPrayers || {}),
        },
      },
      audio: {
        ...DEFAULT_ATHAN_SETTINGS.audio,
        ...(stored.audio || {}),
      },
      localization: {
        ...DEFAULT_ATHAN_SETTINGS.localization,
        ...(stored.localization || {}),
      },
    };
  }

  updateSettings(partial: Partial<AthanSettings>): PrayerStatusSnapshot {
    const current = this.getSettings();
    const merged: AthanSettings = {
      ...current,
      ...partial,
      manualLocation: {
        ...current.manualLocation,
        ...(partial.manualLocation || {}),
      },
      mawaqit: {
        ...current.mawaqit,
        ...(partial.mawaqit || {}),
      },
      sunnahPrayers: {
        ...current.sunnahPrayers,
        ...(partial.sunnahPrayers || {}),
      },
      adjustments: {
        ...current.adjustments,
        ...(partial.adjustments || {}),
      },
      iqamahOffsets: {
        ...current.iqamahOffsets,
        ...(partial.iqamahOffsets || {}),
      },
      notifications: {
        ...current.notifications,
        ...(partial.notifications || {}),
        enabledPrayers: {
          ...current.notifications.enabledPrayers,
          ...(partial.notifications?.enabledPrayers || {}),
        },
      },
      audio: {
        ...current.audio,
        ...(partial.audio || {}),
      },
      localization: {
        ...current.localization,
        ...(partial.localization || {}),
      },
    };

    this.settingsRepo.set(SETTINGS_KEY, merged);
    const snapshot = this.getState();
    this.dispatcher?.broadcastState(snapshot);
    return snapshot;
  }

  getState(): PrayerStatusSnapshot {
    const settings = this.getSettings();
    const activeMawaqit =
      settings.locationMode === 'mawaqit' && settings.mawaqit.enabled ? this.mawaqitLive : null;
    return buildPrayerStatusSnapshot(settings, this.now(), activeMawaqit);
  }

  async detectAutoLocation(): Promise<{
    ok: boolean;
    location?: CoordinatesConfig;
    error?: string;
    state: PrayerStatusSnapshot;
  }> {
    const result = await detectAutomaticLocation(this.fetchFn);
    if (result.ok && result.location) {
      const state = this.updateSettings({
        locationMode: 'auto',
        autoLocationCache: {
          ...result.location,
          fetchedAt: this.now().toISOString(),
        },
      });
      return { ok: true, location: result.location, state };
    }
    return {
      ok: false,
      error: result.error,
      state: this.getState(),
    };
  }

  async syncMawaqit(mosqueIdOrSlug?: string): Promise<{
    ok: boolean;
    mosque?: MawaqitMosqueData;
    error?: string;
    state: PrayerStatusSnapshot;
  }> {
    const current = this.getSettings();
    const target = (mosqueIdOrSlug ?? current.mawaqit.mosqueIdOrSlug).trim();
    const res = await fetchMawaqitMosqueTimes(target, this.fetchFn);

    if (res.ok && res.mosque) {
      this.mawaqitLive = res.mosque;
      this.settingsRepo.set(MAWAQIT_CACHE_KEY, res.mosque);
      const state = this.updateSettings({
        locationMode: 'mawaqit',
        mawaqit: {
          ...current.mawaqit,
          enabled: true,
          mosqueIdOrSlug: target,
          mosqueName: res.mosque.name,
        },
      });
      return { ok: true, mosque: res.mosque, state };
    }

    // Disconnect live Mawaqit state so fallback coordinates take effect cleanly
    this.mawaqitLive = null;
    const state = this.getState();
    this.dispatcher?.broadcastState(state);
    return {
      ok: false,
      error: res.error,
      state,
    };
  }

  /**
   * Evaluates current clock against today's prayer schedule and fires any due
   * pre-prayer reminders or Athan alerts (deduplicated per date + prayer + type).
   */
  checkReminders(): AthanAlertPayload[] {
    const snapshot = this.getState();
    const { settings, times } = snapshot;
    if (!settings.notifications.enabled && (!settings.audio.enabled || settings.audio.muted)) return [];

    const now = this.now();
    const clock = prayerClock(now, snapshot.coordinates.timezone);
    const currentMinutes = clock.hour * 60 + clock.minute;
    const triggered: AthanAlertPayload[] = [];
    const prayers: PrayerName[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const preMins = Math.max(1, Math.min(60, settings.notifications.preReminderMinutes || 15));

    for (const prayer of prayers) {
      if (!settings.notifications.enabledPrayers[prayer]) continue;
      const scheduledTime = times[prayer];
      const pMins = parseHHMMToMinutes(scheduledTime);
      const iqamahTime =
        prayer !== 'sunrise' ? times.iqamah[prayer as MandatoryPrayerName] : undefined;

      // 1. Pre-prayer reminder check
      if (
        settings.notifications.enabled && settings.notifications.preReminderEnabled &&
        prayer !== 'sunrise' &&
        currentMinutes === (pMins - preMins + 1440) % 1440
      ) {
        const key = `${times.date}:${prayer}:pre-reminder`;
        if (!this.notifiedKeys.has(key)) {
          this.notifiedKeys.add(key);
          const alert = this.dispatchAlert(prayer, 'pre-reminder', scheduledTime, iqamahTime, preMins);
          triggered.push(alert);
        }
      }

      // 2. Exact Athan time entry check
      if (currentMinutes === pMins) {
        const key = `${times.date}:${prayer}:athan`;
        if (!this.notifiedKeys.has(key)) {
          this.notifiedKeys.add(key);
          const alert = this.dispatchAlert(prayer, 'athan', scheduledTime, iqamahTime);
          triggered.push(alert);
        }
      }
    }

    return triggered;
  }

  triggerTestAlert(
    prayer: PrayerName = 'asr',
    type: 'athan' | 'pre-reminder' = 'athan'
  ): AthanAlertPayload {
    const snapshot = this.getState();
    const scheduledTime = snapshot.times[prayer];
    const iqamahTime =
      prayer !== 'sunrise' ? snapshot.times.iqamah[prayer as MandatoryPrayerName] : undefined;
    const preMins =
      type === 'pre-reminder' ? snapshot.settings.notifications.preReminderMinutes : undefined;
    return this.dispatchAlert(prayer, type, scheduledTime, iqamahTime, preMins);
  }

  private dispatchAlert(
    prayer: PrayerName,
    type: 'athan' | 'pre-reminder',
    scheduledTime: string,
    iqamahTime?: string,
    minutesRemaining?: number
  ): AthanAlertPayload {
    const settings = this.getSettings();
    const useAr = settings.localization.forceArabicWidgets;
    const label = PRAYER_LABELS[prayer];
    const iconDataUrl = getPrayerIconDataUrl(prayer);

    const title =
      type === 'athan'
        ? useAr
          ? `حان الآن وقت صلاة ${label.ar}`
          : `Time for ${label.en} Prayer`
        : useAr
        ? `اقترب وقت صلاة ${label.ar}`
        : `Upcoming: ${label.en} Prayer`;

    const body =
      type === 'athan'
        ? useAr
          ? `الأذان: ${scheduledTime}${iqamahTime ? ` · الإقامة: ${iqamahTime}` : ''}`
          : `Athan: ${scheduledTime}${iqamahTime ? ` · Iqamah: ${iqamahTime}` : ''}`
        : useAr
        ? `متبقي ${minutesRemaining} دقيقة على أذان ${label.ar} (${scheduledTime})`
        : `${minutesRemaining} minutes remaining until ${label.en} Athan (${scheduledTime})`;

    const payload: AthanAlertPayload = {
      id: randomUUID(),
      type,
      prayer,
      scheduledTime,
      iqamahTime,
      minutesRemaining,
      timestamp: this.now().toISOString(),
    };

    if (settings.notifications.enabled) this.dispatcher?.showNotification({
      title,
      body,
      iconDataUrl,
      prayer,
      type,
    });
    this.dispatcher?.broadcastAlert(payload);

    return payload;
  }

  startScheduler(intervalMs = 15_000): void {
    this.stopScheduler();
    this.timer = setInterval(() => {
      try {
        this.checkReminders();
      } catch (err) {
        console.error('[baglib:athan] Reminder check error:', err);
      }
    }, intervalMs);
    this.timer.unref?.();
  }

  stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
