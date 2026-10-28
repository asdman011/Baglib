'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AthanAlertPayload,
  AthanSettings,
  MawaqitMosqueData,
  PrayerName,
  PrayerStatusSnapshot,
} from '../../shared/types/athan';
import {
  DEFAULT_ATHAN_SETTINGS,
  buildPrayerStatusSnapshot,
} from '../../shared/athan-calculator';

export function playLocalAthanSound(volume = 0.8, customPath?: string, onEnd = () => {}, onError = () => {}): { stop: () => void } {
  let stopped = false;
  const audio = new Audio(customPath || '/assets/audio/athan-short.wav');
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.onended = () => { if (!stopped) onEnd(); };
  audio.onerror = () => { if (!stopped) { stopped = true; onError(); } };
  try { void audio.play().catch(() => { if (!stopped) { stopped = true; onError(); } }); }
  catch { if (!stopped) { stopped = true; onError(); } }
  return { stop: () => { stopped = true; audio.onended = null; audio.onerror = null; audio.pause(); audio.currentTime = 0; } };
}

export function useAthan(audioOwner = false) {
  const [snapshot, setSnapshot] = useState<PrayerStatusSnapshot>(() =>
    buildPrayerStatusSnapshot(DEFAULT_ATHAN_SETTINGS, new Date(2000, 0, 1, 12))
  );
  const [activeAlert, setActiveAlert] = useState<AthanAlertPayload | null>(null);
  const [ready, setReady] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const snapshotRef = useRef(snapshot);
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);
  const lastAlert = useRef<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const audioControllerRef = useRef<{ stop: () => void } | null>(null);
  const mawaqitCacheRef = useRef<MawaqitMosqueData | null>(null);

  const stopAudio = useCallback(() => {
    audioControllerRef.current?.stop();
    audioControllerRef.current = null;
    setIsPlayingAudio(false);
    setAudioFailed(false);
  }, []);

  const triggerAudioPlayback = useCallback(
    (settings: AthanSettings) => {
      if (!settings.audio.enabled || settings.audio.muted) return;
      stopAudio();
      setIsPlayingAudio(true);
      try {
        audioControllerRef.current = playLocalAthanSound(settings.audio.volume, settings.audio.customAudioPath,
          () => setIsPlayingAudio(false), () => { setIsPlayingAudio(false); setAudioFailed(true); });
      } catch { setIsPlayingAudio(false); setAudioFailed(true); }
    },
    [stopAudio]
  );

  // Load initial state from Electron main process
  useEffect(() => {
    let alive = true;
    const api = typeof window !== 'undefined' ? window.electronAPI?.athan : undefined;
    if (api?.getState) {
      api
        .getState()
        .then((initial) => {
          if (alive && initial) {
            snapshotRef.current = initial;
            setSnapshot(initial);
            setReady(true);
          }
        })
        .catch(() => {});
    }

    const unsubState = api?.onStateChanged?.((nextState) => {
      if (alive && nextState) {
        snapshotRef.current = nextState;
        if (nextState.settings.audio.muted || !nextState.settings.audio.enabled) stopAudio();
        setSnapshot(nextState);
      }
    });

    const unsubAlert = api?.onAlert?.((alert) => {
      if (!alive || !alert) return;
      const current = snapshotRef.current;
      if (current.settings.notifications.modalDialogEnabled && alert.type === 'athan') setActiveAlert(alert);
      if (audioOwner && alert.type === 'athan' && lastAlert.current !== alert.id) {
        lastAlert.current = alert.id;
        triggerAudioPlayback(current.settings);
      }
    });

    return () => {
      alive = false;
      unsubState?.();
      unsubAlert?.();
      stopAudio();
    };
  }, [audioOwner, stopAudio, triggerAudioPlayback]);

  // 1-second live countdown ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setReady(true);
      setSnapshot((prev) => {
        const next = buildPrayerStatusSnapshot(
          prev.settings,
          new Date(),
          prev.mawaqitConnected
            ? mawaqitCacheRef.current || {
                uuid: prev.settings.mawaqit.mosqueIdOrSlug || 'mawaqit',
                name: prev.mosqueName || prev.locationLabel,
                times: {
                  fajr: prev.times.fajr,
                  sunrise: prev.times.sunrise,
                  dhuhr: prev.times.dhuhr,
                  asr: prev.times.asr,
                  maghrib: prev.times.maghrib,
                  isha: prev.times.isha,
                },
                iqamah: prev.times.iqamah,
                fetchedAt: prev.times.date,
              }
            : null
        );
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const updateSettings = useCallback(async (partial: Partial<AthanSettings>) => {
    const api = typeof window !== 'undefined' ? window.electronAPI?.athan : undefined;
    if (api?.updateSettings) {
      const updated = await api.updateSettings(partial);
      if (updated) {
        setSnapshot(updated);
        return updated;
      }
    }
    // Local fallback when running in isolated component tests
    let computed!: PrayerStatusSnapshot;
    setSnapshot((prev) => {
      const merged: AthanSettings = {
        ...prev.settings,
        ...partial,
        manualLocation: { ...prev.settings.manualLocation, ...(partial.manualLocation || {}) },
        mawaqit: { ...prev.settings.mawaqit, ...(partial.mawaqit || {}) },
        sunnahPrayers: { ...prev.settings.sunnahPrayers, ...(partial.sunnahPrayers || {}) },
        adjustments: { ...prev.settings.adjustments, ...(partial.adjustments || {}) },
        iqamahOffsets: { ...prev.settings.iqamahOffsets, ...(partial.iqamahOffsets || {}) },
        notifications: {
          ...prev.settings.notifications,
          ...(partial.notifications || {}),
          enabledPrayers: {
            ...prev.settings.notifications.enabledPrayers,
            ...(partial.notifications?.enabledPrayers || {}),
          },
        },
        audio: { ...prev.settings.audio, ...(partial.audio || {}) },
        localization: { ...prev.settings.localization, ...(partial.localization || {}) },
      };
      computed = buildPrayerStatusSnapshot(merged, new Date(), mawaqitCacheRef.current);
      return computed;
    });
    return computed;
  }, []);

  const detectLocation = useCallback(async () => {
    setSyncing(true);
    setStatusMessage(null);
    try {
      const api = typeof window !== 'undefined' ? window.electronAPI?.athan : undefined;
      if (api?.detectAutoLocation) {
        const res = await api.detectAutoLocation();
        if (res.state) setSnapshot(res.state);
        if (!res.ok && res.error) setStatusMessage(res.error);
        return res;
      }
      return { ok: false, error: 'Desktop API unavailable', state: snapshot };
    } finally {
      setSyncing(false);
    }
  }, [snapshot]);

  const syncMawaqit = useCallback(
    async (mosqueIdOrSlug?: string) => {
      setSyncing(true);
      setStatusMessage(null);
      try {
        const api = typeof window !== 'undefined' ? window.electronAPI?.athan : undefined;
        if (api?.syncMawaqit) {
          const res = await api.syncMawaqit(mosqueIdOrSlug);
          if (res.mosque) mawaqitCacheRef.current = res.mosque;
          else mawaqitCacheRef.current = null;
          if (res.state) setSnapshot(res.state);
          if (!res.ok && res.error) setStatusMessage(res.error);
          return res;
        }
        return { ok: false, error: 'Mawaqit offline', state: snapshot };
      } finally {
        setSyncing(false);
      }
    },
    [snapshot]
  );

  const triggerTestAlert = useCallback(
    async (prayer: PrayerName = 'asr') => {
      const api = typeof window !== 'undefined' ? window.electronAPI?.athan : undefined;
      if (api?.triggerTestAlert) {
        const alert = await api.triggerTestAlert(prayer, 'athan');
        if (snapshot.settings.notifications.modalDialogEnabled) {
          setActiveAlert(alert);
        }
        // Main-window audio owner handles the broadcast exactly once.
        return alert;
      }
      const fallbackAlert: AthanAlertPayload = {
        id: `test-${Date.now()}`,
        type: 'athan',
        prayer,
        scheduledTime: snapshot.times[prayer],
        iqamahTime: prayer !== 'sunrise' ? snapshot.times.iqamah[prayer] : undefined,
        timestamp: new Date().toISOString(),
      };
      if (snapshot.settings.notifications.modalDialogEnabled) {
        setActiveAlert(fallbackAlert);
      }
      triggerAudioPlayback(snapshot.settings);
      return fallbackAlert;
    },
    [snapshot, triggerAudioPlayback]
  );

  const toggleMiniWidget = useCallback(async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI?.athan : undefined;
    if (api?.toggleMiniWidget) {
      return api.toggleMiniWidget();
    }
    return { open: false };
  }, []);

  const dismissAlert = useCallback(() => {
    setActiveAlert(null);
    stopAudio();
  }, [stopAudio]);

  return {
    ready,
    snapshot,
    activeAlert,
    isPlayingAudio,
    audioFailed,
    retryAudio: () => triggerAudioPlayback(snapshot.settings),
    syncing,
    statusMessage,
    updateSettings,
    detectLocation,
    syncMawaqit,
    triggerTestAlert,
    toggleMiniWidget,
    dismissAlert,
    stopAudio,
  };
}
