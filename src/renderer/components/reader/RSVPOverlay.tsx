import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  X,
  Gauge,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { RSVPController } from '../../libs/reader/rsvp-controller';
import { RSVPState, RSVPWordToken, ReaderTheme } from '../../libs/reader/types';

interface RSVPOverlayProps {
  text: string;
  initialWpm?: number;
  onClose: () => void;
  direction?: 'rtl' | 'ltr';
  theme?: ReaderTheme;
}

export const RSVPOverlay: React.FC<RSVPOverlayProps> = ({
  text,
  initialWpm = 320,
  onClose,
  direction = 'ltr',
  theme = 'light',
}) => {
  const { t } = useWorkspace();
  const [state, setState] = useState<RSVPState>({
    words: [],
    currentIndex: 0,
    wpm: initialWpm,
    isPlaying: false,
  });
  const [fontSize, setFontSize] = useState<number>(44);

  const controller = useMemo(() => new RSVPController(initialWpm, setState), [initialWpm]);
  useEffect(() => {
    controller.loadText(text);
    return () => controller.destroy();
  }, [controller, text]);

  // Keyboard shortcuts: Space for Play/Pause, ArrowLeft/Right for steps, Escape for close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        controller?.togglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        controller?.nextWord();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        controller?.prevWord();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        controller?.setWpm((controller.getState().wpm || 300) + 25);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        controller?.setWpm(Math.max(100, (controller.getState().wpm || 300) - 25));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [controller, onClose]);

  const currentWord: RSVPWordToken | null = state.words[state.currentIndex] || null;

  // Calculate estimated remaining reading time
  const timeRemaining = useMemo(() => {
    if (state.words.length === 0 || state.wpm <= 0) return null;
    const remainingWords = state.words.length - state.currentIndex;
    const totalMinutes = remainingWords / state.wpm;

    if (totalMinutes < 1) {
      const seconds = Math.ceil(totalMinutes * 60);
      return `${seconds}s`;
    }
    const mins = Math.floor(totalMinutes);
    const secs = Math.round((totalMinutes - mins) * 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }, [state.words.length, state.currentIndex, state.wpm]);

  // Render centered ORP word display
  const renderWord = () => {
    if (!currentWord) {
      return <span className="opacity-40 italic">Ready to start</span>;
    }

    const { text: wordText, orpIndex, isRTL } = currentWord;

    // For Arabic/RTL text: DO NOT slice by character index to protect cursive shaping!
    // Render the entire connected word, with a subtle focus indicator dot or center styling
    if (isRTL) {
      return (
        <span
          className="font-serif tracking-normal text-main select-none transition-all"
          style={{
            fontFamily: "'Scheherazade New', 'Amiri', 'Traditional Arabic', serif",
            direction: 'rtl',
            lineHeight: 1.8,
          }}
        >
          {wordText}
        </span>
      );
    }

    // For Latin text: split into [before, orp, after] with ORP colored in red
    const before = wordText.slice(0, orpIndex);
    const orpChar = wordText.slice(orpIndex, orpIndex + 1);
    const after = wordText.slice(orpIndex + 1);

    return (
      <div className="flex items-baseline font-mono select-none">
        <span className="text-end flex-1 text-main opacity-80">{before}</span>
        <span className="text-rose-500 font-bold px-0.5">{orpChar}</span>
        <span className="text-start flex-1 text-main opacity-80">{after}</span>
      </div>
    );
  };

  const themeCardClasses: Record<ReaderTheme, string> = {
    paper: 'bg-[#fcfaf2] text-[#2b2b2b] border border-[#e8e4d9] shadow-2xl',
    sepia: 'bg-[#fbf0d9] text-[#5f4b32] border border-[#e6d5b8] shadow-2xl',
    dusk: 'bg-[#2d2a32] text-[#e0dede] border border-[#3f3b47] shadow-2xl',
    midnight: 'bg-[#0f172a] text-[#e2e8f0] border border-[#1e293b] shadow-2xl',
    light: 'bg-white text-slate-800 border border-slate-200 shadow-2xl',
    dark: 'bg-slate-900 text-slate-100 border border-slate-700 shadow-2xl',
    night: 'bg-black text-neutral-200 border border-neutral-800 shadow-2xl',
    'e-ink': 'bg-white text-black border-2 border-black shadow-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-2xl rounded-3xl overflow-hidden flex flex-col p-6 space-y-6 ${
          themeCardClasses[theme] || themeCardClasses.light
        }`}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between text-xs font-bold text-muted border-b border-subtle/30 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-pale-sky-500" />
            <span>{t('speedReaderBtn')}</span>
          </div>

          <div className="flex items-center gap-4">
            {timeRemaining && (
              <span className="flex items-center gap-1 font-mono text-[11px] text-muted">
                <Clock className="w-3.5 h-3.5 text-pale-sky-500" />
                {timeRemaining}
              </span>
            )}
            <button
              onClick={onClose}
              title={t('rsvpClose')}
              className="p-1 rounded-full hover:bg-rose-500/10 text-muted hover:text-rose-500 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ORP Fixed Crosshair Display Stage */}
        <div className="relative py-12 flex flex-col items-center justify-center min-h-[180px] bg-canvas/30 rounded-2xl border border-subtle/30">
          {/* Subtle Top & Bottom Crosshair Notches for Eye Focus */}
          <div className="absolute top-2 w-2 h-2 border-b-2 border-rose-500/50" />
          <div className="absolute bottom-2 w-2 h-2 border-t-2 border-rose-500/50" />

          {/* Centered Flash Word */}
          <div
            className="w-full max-w-lg text-center transition-all duration-75"
            style={{ fontSize: `${fontSize}px` }}
          >
            {renderWord()}
          </div>
        </div>

        {/* Progress Bar & Word Counter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted font-mono">
            <span>
              {state.currentIndex + 1} / {state.words.length} words
            </span>
            <span>
              {state.words.length > 0
                ? Math.round(((state.currentIndex + 1) / state.words.length) * 100)
                : 0}
              %
            </span>
          </div>
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              controller?.jumpToIndex(Math.floor(ratio * state.words.length));
            }}
            className="w-full h-2 rounded-full bg-surface border border-subtle/40 overflow-hidden cursor-pointer"
          >
            <div
              className="h-full bg-pale-sky-500 transition-all duration-100"
              style={{
                width: `${
                  state.words.length > 0
                    ? ((state.currentIndex + 1) / state.words.length) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        {/* Speed (WPM) Controls & Playback */}
        <div className="flex items-center justify-between pt-2">
          {/* Reset / Step Back */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => controller?.jumpToIndex(0)}
              title={t('rsvpRestart')}
              className="p-2 rounded-xl hover:bg-surface text-muted hover:text-main transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => controller?.prevWord()}
              title={t('rsvpPreviousWord')}
              className="p-2 rounded-xl hover:bg-surface text-muted hover:text-main transition-colors cursor-pointer"
            >
              <SkipBack className="w-4 h-4" />
            </button>
          </div>

          {/* Main Play / Pause Button */}
          <button
            onClick={() => controller?.togglePlay()}
            className="px-6 py-2.5 rounded-2xl bg-pale-sky-500 hover:bg-pale-sky-600 text-white font-bold text-xs flex items-center gap-2 shadow-lg hover:shadow-pale-sky-500/25 transition-all cursor-pointer"
          >
            {state.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{state.isPlaying ? 'Pause (Space)' : 'Start Reading'}</span>
          </button>

          {/* Step Forward */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => controller?.nextWord()}
              title={t('rsvpNextWord')}
              className="p-2 rounded-xl hover:bg-surface text-muted hover:text-main transition-colors cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* WPM Pacing Slider & Font Size Controls */}
        <div className="flex items-center justify-between text-xs pt-2 border-t border-subtle/30">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-pale-sky-500" />
            <span className="font-bold font-mono">{state.wpm} WPM</span>
            <input
              type="range"
              min={100}
              max={1000}
              step={25}
              value={state.wpm}
              onChange={(e) => controller?.setWpm(Number(e.target.value))}
              className="w-32 accent-pale-sky-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1 text-[11px] text-muted">
            <span className="font-bold">Text:</span>
            <button
              onClick={() => setFontSize((s) => Math.max(28, s - 4))}
              className="px-2 py-0.5 rounded bg-surface border border-subtle hover:text-main cursor-pointer"
            >
              A-
            </button>
            <span className="font-mono text-[10px]">{fontSize}px</span>
            <button
              onClick={() => setFontSize((s) => Math.min(64, s + 4))}
              className="px-2 py-0.5 rounded bg-surface border border-subtle hover:text-main cursor-pointer"
            >
              A+
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
