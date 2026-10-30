/**
 * Baglib — Auto-Hiding TTS & Audiobook Mini Player (KEY-145)
 */

'use client';

import React, { useState, useEffect, useRef, useId } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  Settings2,
  Clock,
  Sparkles,
  Headphones,
  FileText,
  X,
  Gauge,
  Loader2,
  Languages,
} from 'lucide-react';
import type { TTSVoice, TTSPlaybackState, AudiobookPairingData } from '../../../shared/types/audio';
import { useWorkspace } from '../../components/context/WorkspaceContext';

interface TTSMiniPlayerProps {
  aboveWorkstation?: boolean;
  bookTitle?: string;
  playbackState: TTSPlaybackState;
  playbackMode: 'tts' | 'audiobook' | 'smil';
  currentTime: number;
  duration: number;
  currentSentenceIndex: number;
  totalSentences: number;
  rate: number;
  sleepRemainingSeconds: number | null;
  voices: TTSVoice[];
  activeVoiceAr?: string;
  activeVoiceEn?: string;
  autoLanguageSwitch: boolean;
  audiobookPairing: AudiobookPairingData | null;
  isLyricsOpen: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onSkipForward: (seconds?: number) => void;
  onSkipBackward: (seconds?: number) => void;
  onNextSentence: () => void;
  onPrevSentence: () => void;
  onSeek: (seconds: number) => void;
  onRateChange: (rate: number) => void;
  onSleepTimerChange: (minutes: number | null) => void;
  onVoiceArChange: (voiceId: string) => void;
  onVoiceEnChange: (voiceId: string) => void;
  onToggleAutoSwitch: (enabled: boolean) => void;
  onToggleLyrics: () => void;
  onOpenPairingWizard: () => void;
}

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
const SLEEP_OPTIONS = [null, 5, 15, 30, 45, 60];

export const TTSMiniPlayer: React.FC<TTSMiniPlayerProps> = ({
  aboveWorkstation = false,
  bookTitle,
  playbackState,
  playbackMode,
  currentTime,
  duration,
  currentSentenceIndex,
  totalSentences,
  rate,
  sleepRemainingSeconds,
  voices,
  activeVoiceAr,
  activeVoiceEn,
  autoLanguageSwitch,
  audiobookPairing,
  isLyricsOpen,
  onTogglePlay,
  onStop,
  onSkipForward,
  onSkipBackward,
  onNextSentence,
  onPrevSentence,
  onSeek,
  onRateChange,
  onSleepTimerChange,
  onVoiceArChange,
  onVoiceEnChange,
  onToggleAutoSwitch,
  onToggleLyrics,
  onOpenPairingWizard,
}) => {
  const { t } = useWorkspace();
  const [isHovered, setIsHovered] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSpeedOpen, setIsSpeedOpen] = useState(false);
  const [isSleepOpen, setIsSleepOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const customTimerId = useId();
  const customDuration = Number(customMinutes);
  const isCustomDurationValid = customDuration > 0 && Number.isSafeInteger(customDuration) && Number.isSafeInteger(customDuration * 60);
  const [isVisible, setIsVisible] = useState(true);
  const lingerTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isPlaying = playbackState === 'playing' || playbackState === 'buffering';
  const isBuffering = playbackState === 'buffering';

  const [previousPlayerVisibility, setPreviousPlayerVisibility] = useState<readonly unknown[] | null>(null);
  const inputsPlayerVisibility = [isHovered, isSettingsOpen, isSpeedOpen, isSleepOpen, isPlaying];
  if (previousPlayerVisibility === null || inputsPlayerVisibility.some((value, index) => !Object.is(value, previousPlayerVisibility[index]))) {
    setPreviousPlayerVisibility(inputsPlayerVisibility);
    if (isHovered || isSettingsOpen || isSpeedOpen || isSleepOpen || !isPlaying) setIsVisible(true);
  }
  // Auto-hide linger logic: stay visible for 5s after activity, unless hovered, settings open, or paused
  useEffect(() => {
    if (isHovered || isSettingsOpen || isSpeedOpen || isSleepOpen || !isPlaying) {
      if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
      return;
    }

    lingerTimerRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 5000);

    return () => {
      if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
    };
  }, [isHovered, isSettingsOpen, isSpeedOpen, isSleepOpen, isPlaying]);

  const formatSeconds = (sec: number) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatSleepCountdown = (sec: number | null) => {
    if (!sec) return null;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent =
    playbackMode === 'audiobook' && duration > 0
      ? (currentTime / duration) * 100
      : totalSentences > 0
      ? ((currentSentenceIndex + 1) / totalSentences) * 100
      : 0;

  const arVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('ar'));
  const enVoices = voices.filter((v) => v.provider === 'pocket-tts' || v.lang.toLowerCase().startsWith('en'));

  return (
    <div
      onMouseEnter={() => {
        setIsHovered(true);
        }}
      onMouseLeave={() => setIsHovered(false)}
      className={`fixed bottom-6 start-1/2 -translate-x-1/2 ${aboveWorkstation ? 'z-[120]' : 'z-50'} transition-all duration-300 ease-out select-none ${
        isVisible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-40 hover:opacity-100 translate-y-4 hover:translate-y-0 scale-95'
      }`}
    >
      <div className="bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-subtle dark:border-zinc-700/60 rounded-3xl shadow-2xl p-3 sm:p-4 min-w-[340px] max-w-lg text-main">
        {/* Top Info Bar */}
        <div className="flex items-center justify-between text-xs pb-2 border-b border-subtle/50 mb-2.5">
          <div className="flex items-center gap-2 truncate max-w-[220px]">
            {playbackMode === 'audiobook' ? (
              <Headphones className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <Volume2 className="w-4 h-4 text-pale-sky-500 shrink-0" />
            )}
            <span className="font-semibold truncate">
              {audiobookPairing?.title || bookTitle || t('ttsPlayerTitle')}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 text-muted">
            {sleepRemainingSeconds && (
              <span className="flex items-center gap-1 text-[11px] font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full font-bold">
                <Clock className="w-3 h-3" />
                {formatSleepCountdown(sleepRemainingSeconds)}
              </span>
            )}
            {/* Speed Badge Button */}
            <div className="relative">
              <button
                onClick={() => setIsSpeedOpen(!isSpeedOpen)}
                title={t('ttsPlaybackSpeed')}
                className="px-2 py-0.5 rounded-lg hover:bg-canvas border border-subtle text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer"
              >
                <Gauge className="w-3 h-3 text-pale-sky-500" />
                <span>{rate}x</span>
              </button>

              {/* Speed Popover */}
              {isSpeedOpen && (
                <div className="absolute bottom-8 start-0 z-50 bg-surface dark:bg-zinc-800 border border-subtle rounded-2xl p-2 shadow-xl flex flex-col gap-1 min-w-[90px]">
                  {SPEED_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        onRateChange(s);
                        setIsSpeedOpen(false);
                      }}
                      className={`px-3 py-1 text-xs rounded-xl font-mono text-start transition-all cursor-pointer ${
                        rate === s
                          ? 'bg-pale-sky-500 text-white font-bold'
                          : 'hover:bg-canvas text-muted hover:text-main'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Close / Stop Button */}
            <button
              onClick={onStop}
              title={t('ttsStopBtn')}
              className="p-1 rounded-lg hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Progress Bar & Indicators */}
        <div className="space-y-1 mb-3">
          <div className="relative w-full h-1.5 bg-subtle/40 rounded-full overflow-hidden cursor-pointer">
            <div
              className="h-full bg-gradient-to-r from-pale-sky-500 to-indigo-500 rounded-full transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-muted font-mono">
            <span>
              {playbackMode === 'audiobook'
                ? formatSeconds(currentTime)
                : `${t('ttsSentence')} ${currentSentenceIndex + 1} / ${Math.max(1, totalSentences)}`}
            </span>
            <span>
              {playbackMode === 'audiobook'
                ? formatSeconds(duration)
                : `${Math.round(progressPercent)}%`}
            </span>
          </div>
        </div>

        {/* Core Controls */}
        <div className="flex items-center justify-between gap-2">
          {/* Left Actions: Sleep Timer & Lyrics */}
          <div className="flex items-center gap-1">
            {/* Sleep Timer */}
            <div className="relative">
              <button
                onClick={() => setIsSleepOpen(!isSleepOpen)}
                title={t('ttsSleepTimer')}
                className={`p-2 rounded-xl transition-all cursor-pointer ${
                  sleepRemainingSeconds
                    ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                    : 'hover:bg-canvas text-muted hover:text-main'
                }`}
              >
                <Clock className="w-4 h-4" />
              </button>

              {isSleepOpen && (
                <div className="absolute bottom-10 start-0 z-50 bg-surface dark:bg-zinc-800 border border-subtle rounded-2xl p-2 shadow-xl flex flex-col gap-1 min-w-[220px]">
                  {SLEEP_OPTIONS.map((minutes) => (
                    <button
                      key={minutes ?? 'off'}
                      onClick={() => {
                        onSleepTimerChange(minutes);
                        setIsSleepOpen(false);
                      }}
                      className="px-3 py-1 text-xs rounded-xl font-mono text-start hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
                    >
                      {minutes === null ? t('ttsTimerOff') : t('ttsTimerMinutes', { minutes })}
                    </button>
                  ))}
                  <form
                    className="border-t border-subtle mt-1 pt-2 space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!isCustomDurationValid) return;
                      onSleepTimerChange(customDuration);
                      setIsSleepOpen(false);
                    }}
                  >
                    <label htmlFor={customTimerId} className="block text-xs text-start leading-relaxed px-1">
                      {t('ttsTimerCustomMinutes')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={customTimerId}
                        type="number"
                        min={1}
                        step={1}
                        required
                        dir="ltr"
                        value={customMinutes}
                        onChange={(event) => setCustomMinutes(event.target.value)}
                        className="min-w-0 w-20 flex-1 rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-xs text-main focus-visible:outline-2 focus-visible:outline-pale-sky-500"
                      />
                      <button
                        type="submit"
                        disabled={!isCustomDurationValid}
                        className="rounded-lg bg-pale-sky-500 px-3 py-1.5 text-xs leading-relaxed text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('ttsTimerSet')}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* Read-Along / Lyrics Toggle */}
            <button
              onClick={onToggleLyrics}
              title={t('ttsKaraokeLyrics')}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                isLyricsOpen
                  ? 'bg-pale-sky-500 text-white shadow-xs'
                  : 'hover:bg-canvas text-muted hover:text-main'
              }`}
            >
              <FileText className="w-4 h-4" />
            </button>
          </div>

          {/* Transport Controls (Center) */}
          <div className="flex items-center gap-2">
            {/* Skip Back 15s or Prev Sentence */}
            <button
              onClick={() => (playbackMode === 'audiobook' ? onSkipBackward(15) : onPrevSentence())}
              title={playbackMode === 'audiobook' ? t('ttsSkipBackward15') : t('ttsPrevSentence')}
              className="p-2 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
            >
              {playbackMode === 'audiobook' ? (
                <RotateCcw className="w-4 h-4" />
              ) : (
                <SkipBack className="w-4 h-4" />
              )}
            </button>

            {/* Play / Pause Primary Button */}
            <button
              onClick={onTogglePlay}
              title={isPlaying ? t('ttsPauseBtn') : t('ttsPlayBtn')}
              className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-pale-sky-600 to-indigo-600 hover:from-pale-sky-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-lg hover:shadow-pale-sky-500/25 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              {isBuffering ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current translate-x-0.5 rtl:-translate-x-0.5" />
              )}
            </button>

            {/* Skip Forward 30s or Next Sentence */}
            <button
              onClick={() => (playbackMode === 'audiobook' ? onSkipForward(30) : onNextSentence())}
              title={playbackMode === 'audiobook' ? t('ttsSkipForward30') : t('ttsNextSentence')}
              className="p-2 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
            >
              {playbackMode === 'audiobook' ? (
                <RotateCw className="w-4 h-4" />
              ) : (
                <SkipForward className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Right Actions: Voices / Pairing Settings */}
          <div className="flex items-center gap-1">
            {/* Audiobook Pairing Wizard Launcher */}
            <button
              onClick={onOpenPairingWizard}
              title={t('audiobookPairingWizard')}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                audiobookPairing
                  ? 'text-emerald-500 hover:bg-emerald-500/10'
                  : 'text-muted hover:text-main hover:bg-canvas'
              }`}
            >
              <Headphones className="w-4 h-4" />
            </button>

            {/* Settings Dropdown */}
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              title={t('ttsVoiceSettings')}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                isSettingsOpen
                  ? 'bg-pale-sky-500 text-white'
                  : 'hover:bg-canvas text-muted hover:text-main'
              }`}
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Voice Selection Panel */}
        {isSettingsOpen && (
          <div className="mt-3 pt-3 border-t border-subtle/50 space-y-2.5 text-xs animate-in fade-in duration-150">
            {/* Multilingual Auto-Switching Toggle */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium">
                <Languages className="w-3.5 h-3.5 text-pale-sky-500" />
                {t('ttsAutoLanguageSwitch')}
              </span>
              <input
                type="checkbox"
                checked={autoLanguageSwitch}
                onChange={(e) => onToggleAutoSwitch(e.target.checked)}
                className="rounded accent-pale-sky-500 cursor-pointer"
              />
            </div>

            {/* Arabic Voice Selector */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted">{t('ttsVoiceAr')}</span>
              <select
                value={activeVoiceAr || ''}
                onChange={(e) => onVoiceArChange(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-subtle bg-canvas text-main text-xs outline-none focus:ring-1 focus:ring-pale-sky-500"
              >
                <option value="">{t('ttsDefaultVoice')}</option>
                {arVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>

            {/* English Voice Selector */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted">{t('ttsVoiceEn')}</span>
              <select
                value={activeVoiceEn || ''}
                onChange={(e) => onVoiceEnChange(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-subtle bg-canvas text-main text-xs outline-none focus:ring-1 focus:ring-pale-sky-500"
              >
                <option value="">{t('ttsDefaultVoice')}</option>
                {enVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
