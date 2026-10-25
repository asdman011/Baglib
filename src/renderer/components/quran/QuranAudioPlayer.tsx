'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Clock,
  Volume2,
  VolumeX,
  Download,
  CheckCircle2,
  X,
  Gauge,
  HardDrive,
  Wifi,
} from 'lucide-react';
import type { QuranAyahAudio, QuranReaderSource } from '../../../shared/types/quran';
import type { TranslationKey } from '../../translations';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export interface QuranAudioState {
  surah: number;
  ayah: number;
  isPlaying: boolean;
  activeWordIndex: number | null;
  reciterId: string;
}

export interface QuranAudioPlayerProps {
  surah: number;
  ayah: number;
  surahCount: number;
  reciters: QuranReaderSource[];
  activeReciterId: string;
  onSelectReciter: (id: string) => void;
  t: Translate;
  lang: 'ar' | 'en';
  dir: 'rtl' | 'ltr';
  onAyahChange: (surah: number, ayah: number) => void;
  onAudioStateChange: (state: QuranAudioState | null) => void;
  onClose: () => void;
}

type RepeatMode = 'none' | 'ayah' | 'surah';

export function QuranAudioPlayer({
  surah,
  ayah,
  surahCount,
  reciters,
  activeReciterId,
  onSelectReciter,
  t,
  lang,
  dir,
  onAyahChange,
  onAudioStateChange,
  onClose,
}: QuranAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none');
  const [repeatCountRemaining, setRepeatCountRemaining] = useState<number>(0);
  const [repeatCountSetting, setRepeatCountSetting] = useState<number>(1);
  const [gapDuration, setGapDuration] = useState<number>(0);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerExpiresAt, setSleepTimerExpiresAt] = useState<number | null>(null);
  const [clockTime, setClockTime] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setClockTime(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<QuranAyahAudio | null>(null);
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [isDownloadingSurah, setIsDownloadingSurah] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadScope, setDownloadScope] = useState<'surah' | 'quran'>('surah');
  const [downloadJob, setDownloadJob] = useState('');
  const [downloadError, setDownloadError] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSegmentsRef = useRef<QuranAyahAudio['segments']>([]);

  const playbackSpeedRef = useRef(playbackSpeed);
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);

  const surahRef = useRef(surah);
  const ayahRef = useRef(ayah);
  const surahCountRef = useRef(surahCount);
  const repeatModeRef = useRef(repeatMode);
  const repeatCountSettingRef = useRef(repeatCountSetting);
  const repeatCountRemainingRef = useRef(repeatCountRemaining);
  const gapDurationRef = useRef(gapDuration);
  const activeReciterIdRef = useRef(activeReciterId);
  const onAyahChangeRef = useRef(onAyahChange);
  const onAudioStateChangeRef = useRef(onAudioStateChange);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
    volumeRef.current = volume;
    isMutedRef.current = isMuted;
    surahRef.current = surah;
    ayahRef.current = ayah;
    surahCountRef.current = surahCount;
    repeatModeRef.current = repeatMode;
    repeatCountSettingRef.current = repeatCountSetting;
    repeatCountRemainingRef.current = repeatCountRemaining;
    gapDurationRef.current = gapDuration;
    activeReciterIdRef.current = activeReciterId;
    onAyahChangeRef.current = onAyahChange;
    onAudioStateChangeRef.current = onAudioStateChange;
  }, [playbackSpeed, volume, isMuted, surah, ayah, surahCount, repeatMode, repeatCountSetting, repeatCountRemaining, gapDuration, activeReciterId, onAyahChange, onAudioStateChange]);

  const api = () => window.electronAPI?.quran;

  const safePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      const promise = audio.play();
      playPromiseRef.current = promise;
      await promise;
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        console.warn('Recitation playback error:', err);
      }
    } finally {
      playPromiseRef.current = null;
    }
  }, []);

  const safePause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playPromiseRef.current) {
      try {
        await playPromiseRef.current;
      } catch {}
    }
    try {
      audio.pause();
    } catch {}
  }, []);

  // Check offline status for current surah
  const checkSurahOfflineStatus = useCallback(async (packId: string, surahNum: number) => {
    if (!api()?.surahAudioStatus || !packId) return;
    try {
      const res = await api().surahAudioStatus({ pack: packId, surah: surahNum });
      if (res.ok) {
        setIsOfflineReady(res.data.isComplete);
      }
    } catch {}
  }, []);

  const handleDownloadSurah = async () => {
    if (!activeReciterId || isDownloadingSurah) return;
    setIsDownloadingSurah(true);
    setDownloadError(false);
    setDownloadProgress({ current: 0, total: downloadScope === 'surah' ? surahCount : 6236 });
    try {
      const res = await api().downloadRecitation({ pack: activeReciterId, surah: downloadScope === 'surah' ? surah : undefined });
      if (!res.ok) throw new Error();
      setDownloadJob(res.data);
    } catch {
      setIsDownloadingSurah(false);
      setDownloadError(true);
    }
  };
  useEffect(() => {
    if (!downloadJob) return;
    let alive = true;
    const load = async () => {
      const result = await window.electronAPI.quran.library({ view: 'downloads' });
      if (!alive || !result.ok) return;
      const job = result.data.jobs.find(value => value.id === downloadJob);
      if (!job) return;
      if (job.progressUnit === 'files') setDownloadProgress({ current: job.received, total: job.total });
      if (['complete', 'failed', 'cancelled'].includes(job.state)) {
        setIsDownloadingSurah(false);
        setDownloadError(job.state === 'failed');
        if (job.state === 'complete') void checkSurahOfflineStatus(activeReciterId, surah);
      }
    };
    void load().catch(() => {});
    const unsubscribe = window.electronAPI.quran.onChanged(() => { void load().catch(() => {}); });
    return () => { alive = false; unsubscribe(); };
  }, [downloadJob, activeReciterId, surah, checkSurahOfflineStatus]);

  // Load and play ayah audio
  const loadAyahAudio = useCallback(async (packId: string, s: number, a: number, autoPlay: boolean = true) => {
    if (!packId || !api()?.recitationAudio) return;
    try {
      // Prevent overlap with book TTS
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }

      if (gapTimerRef.current) {
        clearTimeout(gapTimerRef.current);
        gapTimerRef.current = null;
      }

      const res = await api().recitationAudio({ pack: packId, surah: s, ayah: a });
      if (!res.ok) throw new Error(res.error);

      const audioData = res.data;
      setCurrentAudio(audioData);
      currentSegmentsRef.current = audioData.segments || [];

      // Automatically cache for offline if online
      if (!audioData.cached && api()?.cacheAudio) {
        void api().cacheAudio({ pack: packId, surah: s, ayah: a, audioUrl: audioData.audioUrl });
      }

      const audio = audioRef.current;
      if (!audio) return;

      await safePause();

      const sourceUrl = audioData.localUrl || audioData.audioUrl;
      if (audio.src !== sourceUrl) {
        audio.src = sourceUrl;
      }
      audio.playbackRate = playbackSpeedRef.current;
      audio.volume = isMutedRef.current ? 0 : volumeRef.current;

      if (autoPlay) {
        await safePlay();
      }
    } catch {
      setIsPlaying(false);
    }
  }, [safePause, safePlay]);

  // Handle active reciter or ayah change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeReciterId && surah && ayah) {
        void loadAyahAudio(activeReciterId, surah, ayah, true);
        void checkSurahOfflineStatus(activeReciterId, surah);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [activeReciterId, surah, ayah, checkSurahOfflineStatus, loadAyahAudio]);

  // Audio lifecycle & listeners (attached ONCE on mount)
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      const ms = time * 1000;

      // Evidence-based segment synchronization:
      // Find matching segment: [fromWord, toWord, startMs, endMs]
      const segments = currentSegmentsRef.current;
      let matchedWord: number | null = null;
      if (segments && segments.length > 0) {
        const seg = segments.find(s => ms >= s[2] && ms < s[3]);
        if (seg) {
          matchedWord = seg[0] + 1;
        }
      }

      onAudioStateChangeRef.current({
        surah: surahRef.current,
        ayah: ayahRef.current,
        isPlaying: !audio.paused,
        activeWordIndex: matchedWord,
        reciterId: activeReciterIdRef.current,
      });
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const onPlay = () => {
      setIsPlaying(true);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    };

    const onPause = () => {
      setIsPlaying(false);
      onAudioStateChangeRef.current({
        surah: surahRef.current,
        ayah: ayahRef.current,
        isPlaying: false,
        activeWordIndex: null,
        reciterId: activeReciterIdRef.current,
      });
    };

    const onEnded = () => {
      setIsPlaying(false);
      onAudioStateChangeRef.current({
        surah: surahRef.current,
        ayah: ayahRef.current,
        isPlaying: false,
        activeWordIndex: null,
        reciterId: activeReciterIdRef.current,
      });

      // Handle Repeat Mode & Next Ayah
      const executeNext = () => {
        const mode = repeatModeRef.current;
        const currentAyah = ayahRef.current;
        const currentSurah = surahRef.current;
        const totalCount = surahCountRef.current;

        if (mode === 'ayah') {
          const setting = repeatCountSettingRef.current;
          if (setting > 1) {
            if (repeatCountRemainingRef.current > 1) {
              setRepeatCountRemaining(prev => prev - 1);
              audio.currentTime = 0;
              void safePlay();
              return;
            } else {
              setRepeatCountRemaining(setting);
            }
          } else {
            // Infinite ayah repeat
            audio.currentTime = 0;
            void safePlay();
            return;
          }
        }

        // Proceed to next ayah
        if (currentAyah < totalCount) {
          onAyahChangeRef.current(currentSurah, currentAyah + 1);
        } else if (mode === 'surah') {
          // Loop back to ayah 1
          onAyahChangeRef.current(currentSurah, 1);
        }
      };

      const gap = gapDurationRef.current;
      if (gap > 0) {
        gapTimerRef.current = setTimeout(executeNext, gap * 1000);
      } else {
        executeNext();
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
      if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
      onAudioStateChangeRef.current(null);
    };
  }, [safePlay]);

  // Sleep Timer handling
  useEffect(() => {
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    if (sleepTimerMinutes && sleepTimerMinutes > 0) {
      sleepTimerRef.current = setTimeout(() => {
        void safePause();
        setIsPlaying(false);
        setSleepTimerMinutes(null);
        setSleepTimerExpiresAt(null);
      }, sleepTimerMinutes * 60 * 1000);
    }
  }, [sleepTimerMinutes, safePause]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void safePlay();
    } else {
      void safePause();
    }
  };

  const handlePrevAyah = () => {
    if (ayah > 1) {
      onAyahChange(surah, ayah - 1);
    }
  };

  const handleNextAyah = () => {
    if (ayah < surahCount) {
      onAyahChange(surah, ayah + 1);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = parseFloat(e.target.value);
    setCurrentTime(nextTime);
    if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const toggleMute = () => {
    setIsMuted(prev => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.volume = next ? 0 : volume;
      }
      return next;
    });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    setIsMuted(v === 0);
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  };

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      dir={dir}
      className="fixed bottom-4 inset-x-4 max-w-4xl mx-auto z-40 rounded-2xl border border-subtle bg-surface/95 backdrop-blur-md shadow-2xl p-4 transition-all"
      role="region"
      aria-label={t('quranAudioPlay')}
    >
      <div className="flex flex-col gap-3">
        {/* Top Info Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-main">
              {t('quranAudioPlayingAyah', { ayah: new Intl.NumberFormat(lang).format(ayah) })}
            </span>
            <span className="text-muted">•</span>
            {/* Reciter selection dropdown */}
            {reciters.length > 0 ? (
              <select
                value={activeReciterId}
                onChange={e => onSelectReciter(e.target.value)}
                className="rounded-lg border border-subtle bg-surface px-2 py-1 text-xs text-main outline-none"
                aria-label={t('quranAudioReciter')}
              >
                {reciters.map(rec => (
                  <option key={rec.id} value={rec.id}>
                    {rec.title}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-amber-500 font-medium">
                {t('quranAudioRecitationRequired')}
              </span>
            )}
            {/* Offline vs Streaming Badge */}
            {currentAudio?.cached || isOfflineReady ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-md px-2 py-0.5" title={t('quranAudioOfflineReady')}>
                <HardDrive className="size-3" />
                {t('quranAudioOfflineReady')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted bg-surface rounded-md px-2 py-0.5" title={t('quranAudioOnlineStream')}>
                <Wifi className="size-3" />
                {t('quranAudioOnlineStream')}
              </span>
            )}
          </div>

          {/* Quick Actions & Close */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs flex flex-col gap-1"><span>{t('quranAudioDownloadScope')}</span><select aria-label={t('quranAudioDownloadScope')} value={downloadScope} disabled={isDownloadingSurah} onChange={event => setDownloadScope(event.target.value as 'surah' | 'quran')} className="bg-surface border border-subtle rounded-lg p-1 min-w-0"><option value="surah">{t('quranAudioThisSurah')}</option><option value="quran">{t('quranAudioWholeQuran')}</option></select></label>
            {isDownloadingSurah && <button type="button" aria-label={t('quranCancel')} onClick={() => { void api().cancel(downloadJob); }} className="p-2 border border-subtle rounded-lg"><X className="size-4" /></button>}
            {downloadError && <p role="alert" className="text-xs text-red-600">{t('quranAudioDownloadFailed')}</p>}
            <button
              type="button"
              disabled={isDownloadingSurah || (downloadScope === 'surah' && isOfflineReady)}
              onClick={handleDownloadSurah}
              title={t('quranDownload')}
              aria-label={t('quranDownload')}
              className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1 hover:bg-pale-sky-500/10 disabled:opacity-50 transition-colors"
            >
              {isOfflineReady && downloadScope === 'surah' ? (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                  <span className="text-[11px] text-muted">{t('quranAudioOfflineReady')}</span>
                </>
              ) : (
                <>
                  <Download className={`size-3.5 ${isDownloadingSurah ? 'animate-bounce text-pale-sky-600' : ''}`} />
                  <span className="text-[11px]">
                    {downloadProgress
                      ? `${downloadProgress.current}/${downloadProgress.total}`
                      : t(downloadScope === 'surah' ? 'quranAudioDownloadSurah' : 'quranAudioWholeQuran')}
                  </span>
                </>
              )}
            </button>

            {/* Toggle memorization & playback options */}
            <button
              type="button"
              onClick={() => setShowSettings(prev => !prev)}
              aria-expanded={showSettings}
              className={`rounded-lg border border-subtle p-1 hover:bg-pale-sky-500/10 transition-colors ${
                showSettings ? 'bg-pale-sky-500/20 text-pale-sky-600' : 'text-muted'
              }`}
              title={t('quranReadingOptions')}
              aria-label={t('quranReadingOptions')}
            >
              <Gauge className="size-4" />
            </button>

            {/* Close Audio Player */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-subtle p-1 text-muted hover:text-main hover:bg-pale-sky-500/10 transition-colors"
              title={t('quranClosePanel')}
              aria-label={t('quranClosePanel')}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Scrubber Progress Bar */}
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="w-10 text-end font-mono">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 accent-pale-sky-600 h-1.5 bg-subtle rounded-lg cursor-pointer"
            aria-label={t('quranAudioPlay')}
          />
          <span className="w-10 text-start font-mono">{formatTime(duration)}</span>
        </div>

        {/* Main Transport Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Play, Prev, Next */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={ayah <= 1}
              onClick={handlePrevAyah}
              title={t('quranAudioPrev')}
              aria-label={t('quranAudioPrev')}
              className="rounded-xl border border-subtle p-2 text-main hover:bg-pale-sky-500/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <SkipBack className="size-4 rtl:rotate-180" />
            </button>

            <button
              type="button"
              onClick={togglePlayPause}
              title={isPlaying ? t('quranAudioPause') : t('quranAudioPlay')}
              aria-label={isPlaying ? t('quranAudioPause') : t('quranAudioPlay')}
              className="rounded-xl bg-pale-sky-600 text-white p-3 hover:bg-pale-sky-700 shadow-md transition-colors"
            >
              {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 ms-0.5" />}
            </button>

            <button
              type="button"
              disabled={ayah >= surahCount}
              onClick={handleNextAyah}
              title={t('quranAudioNext')}
              aria-label={t('quranAudioNext')}
              className="rounded-xl border border-subtle p-2 text-main hover:bg-pale-sky-500/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <SkipForward className="size-4 rtl:rotate-180" />
            </button>
          </div>

          {/* Repeat Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (repeatMode === 'none') setRepeatMode('ayah');
                else if (repeatMode === 'ayah') setRepeatMode('surah');
                else setRepeatMode('none');
              }}
              title={
                repeatMode === 'ayah'
                  ? t('quranAudioRepeatAyah')
                  : repeatMode === 'surah'
                  ? t('quranAudioRepeatSurah')
                  : t('quranAudioRepeatNone')
              }
              aria-label={t('quranAudioRepeatMode')}
              className={`inline-flex items-center gap-1.5 rounded-xl border border-subtle px-3 py-1.5 text-xs font-medium transition-colors ${
                repeatMode !== 'none'
                  ? 'bg-pale-sky-500/20 text-pale-sky-600 dark:text-pale-sky-400 border-pale-sky-500/40'
                  : 'text-muted hover:text-main'
              }`}
            >
              {repeatMode === 'ayah' ? (
                <>
                  <Repeat1 className="size-4" />
                  <span>{t('quranAudioRepeatAyah')}</span>
                </>
              ) : repeatMode === 'surah' ? (
                <>
                  <Repeat className="size-4" />
                  <span>{t('quranAudioRepeatSurah')}</span>
                </>
              ) : (
                <>
                  <Repeat className="size-4 opacity-50" />
                  <span>{t('quranAudioRepeatNone')}</span>
                </>
              )}
            </button>

            {/* Speed Pills */}
            <div className="hidden sm:flex items-center rounded-xl border border-subtle bg-surface p-0.5 text-xs">
              {[0.75, 1.0, 1.25, 1.5].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSpeedChange(s)}
                  className={`px-2 py-1 rounded-lg transition-colors ${
                    playbackSpeed === s
                      ? 'bg-pale-sky-600 text-white font-semibold'
                      : 'text-muted hover:text-main'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Volume Control */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="text-muted hover:text-main"
              aria-label="Mute"
            >
              {isMuted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-16 sm:w-20 accent-pale-sky-600 h-1 bg-subtle rounded-lg cursor-pointer"
              aria-label="Volume"
            />
          </div>
        </div>

        {/* Expandable Memorization & Timing Options Drawer */}
        {showSettings && (
          <div className="mt-2 pt-3 border-t border-subtle grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-main">
            {/* Repeat count selection for memorization */}
            <div className="flex flex-col gap-1">
              <span className="text-muted font-medium">{t('quranAudioRepeatCount')}</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 5, 10].map(cnt => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => {
                      setRepeatCountSetting(cnt);
                      setRepeatCountRemaining(cnt);
                      if (repeatMode === 'none') setRepeatMode('ayah');
                    }}
                    className={`px-2.5 py-1 rounded-lg border border-subtle transition-colors ${
                      repeatCountSetting === cnt
                        ? 'bg-pale-sky-600 text-white font-bold'
                        : 'hover:bg-pale-sky-500/10 text-muted'
                    }`}
                  >
                    {cnt === 1 ? t('quranAudioRepeatInfinite') : `${cnt}x`}
                  </button>
                ))}
              </div>
            </div>

            {/* Gap between ayahs (allows listener to recite) */}
            <div className="flex flex-col gap-1">
              <span className="text-muted font-medium">{t('quranAudioGapDuration')}</span>
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3, 5].map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGapDuration(g)}
                    className={`px-2 py-1 rounded-lg border border-subtle transition-colors ${
                      gapDuration === g
                        ? 'bg-pale-sky-600 text-white font-bold'
                        : 'hover:bg-pale-sky-500/10 text-muted'
                    }`}
                  >
                    {g === 0 ? t('quranAudioGapNone') : `${g}s`}
                  </button>
                ))}
              </div>
            </div>

            {/* Sleep Timer */}
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1 text-muted font-medium">
                <Clock className="size-3" />
                {t('quranAudioSleepTimer')}
                {sleepTimerExpiresAt && (
                  <span className="text-pale-sky-600 font-bold">
                    ({Math.max(0, Math.ceil((sleepTimerExpiresAt - clockTime) / 60000))}m)
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1">
                {[null, 15, 30, 60].map(mins => (
                  <button
                    key={mins === null ? 'off' : mins}
                    type="button"
                    onClick={() => { setSleepTimerMinutes(mins); const now = Date.now(); setClockTime(now); setSleepTimerExpiresAt(mins ? now + mins * 60000 : null); }}
                    className={`px-2 py-1 rounded-lg border border-subtle transition-colors ${
                      sleepTimerMinutes === mins
                        ? 'bg-pale-sky-600 text-white font-bold'
                        : 'hover:bg-pale-sky-500/10 text-muted'
                    }`}
                  >
                    {mins === null ? t('quranAudioSleepTimerOff') : `${mins}m`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
