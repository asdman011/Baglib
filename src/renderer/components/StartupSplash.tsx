'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { translations, TranslationKey } from '../translations';
import { readReadiness, type Readiness } from '../hooks/useReadiness';

export interface StartupSplashProps {
  onComplete: () => void;
  minDurationMs?: number;
  initialTheme?: 'dark' | 'light';
  initialLang?: 'ar' | 'en';
}

interface ScholarlyEpigraph {
  textKey: TranslationKey;
  authorKey: TranslationKey;
}

const EPIGRAPHS: ScholarlyEpigraph[] = [
  { textKey: 'splashEpigraph1Text', authorKey: 'splashEpigraph1Author' },
  { textKey: 'splashEpigraph2Text', authorKey: 'splashEpigraph2Author' },
  { textKey: 'splashEpigraph3Text', authorKey: 'splashEpigraph3Author' },
  { textKey: 'splashEpigraph4Text', authorKey: 'splashEpigraph4Author' },
];

export const StartupSplash: React.FC<StartupSplashProps> = ({
  onComplete,
  minDurationMs = 900,
  initialTheme,
  initialLang,
}) => {
  // Synchronous initial state resolution from localStorage on frame 0
  const theme = useMemo(() => {
    if (initialTheme) return initialTheme;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('baglib-theme');
        if (saved === 'light' || saved === 'dark') return saved;
      } catch {}
    }
    return 'dark';
  }, [initialTheme]);

  const lang = useMemo(() => {
    if (initialLang) return initialLang;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('baglib-lang');
        if (saved === 'en' || saved === 'ar') return saved;
      } catch {}
    }
    return 'ar';
  }, [initialLang]);

  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  const t = useCallback(
    (key: TranslationKey): string => translations[lang]?.[key] || key,
    [lang]
  );

  // Random initial quote selection
  const [epigraphIndex] = useState<number>(() => Math.floor(Math.random() * EPIGRAPHS.length));

  const epigraph = EPIGRAPHS[epigraphIndex] || EPIGRAPHS[0];

  const [step, setStep] = useState<number>(0);
  const [progress, setProgress] = useState<number>(10);
  const [isExiting, setIsExiting] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(true);
  // KEY-150: real startup checks; a failure is shown here instead of being hidden behind "Ready".
  const [issues, setIssues] = useState<TranslationKey[]>([]);

  const stepKeys: TranslationKey[] = useMemo(
    () => [
      'splashStepDb',
      'splashStepTaxonomy',
      'splashStepReader',
      'splashStepReady',
    ],
    []
  );

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Fast skip handler (Escape or double-click)
  const handleSkip = useCallback(() => {
    if (isExiting) return;
    setProgress(100);
    setStep(3);
    setIsExiting(true);
    setTimeout(() => {
      setIsMounted(false);
      onCompleteRef.current();
    }, 300);
  }, [isExiting]);

  // Keyboard shortcut listener (Escape to skip)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSkip]);

  // Orchestrated startup sequence combining real checks + aesthetic minimum hold
  useEffect(() => {
    let cancelled = false;

    const runOrchestrator = async () => {
      const startTime = Date.now();
      // Run the app's real readiness probes once, bounded so the splash can never hang. Only the
      // database and search index count as startup failures; the optional PDF engine is reported by
      // the status bar instead, so its absence does not slow every launch.
      const checks: Promise<Readiness | null> = Promise.race([
        readReadiness().catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), 2500)),
      ]);

      // Milestone 1: Local database & IPC initialization
      setStep(0);
      setProgress(25);
      if (typeof window !== 'undefined' && window.electronAPI) {
        try {
          await Promise.race([
            window.electronAPI.getSystemInfo?.(),
            new Promise((r) => setTimeout(r, 250)),
          ]);
        } catch {
          // graceful fallback
        }
      }
      const readiness = await checks;
      if (cancelled) return;
      const found: TranslationKey[] = readiness ? [
        ...(readiness.database === false ? ['feedbackDatabaseUnavailable' as const] : []),
        ...(readiness.index === false ? ['feedbackIndexUnavailable' as const] : []),
      ] : [];
      setIssues(found);

      // Milestone 2: Taxonomy & catalog loading
      setStep(1);
      setProgress(62);
      await new Promise((r) => setTimeout(r, 220));
      if (cancelled) return;

      // Milestone 3: Native reader & study engines
      setStep(2);
      setProgress(88);
      await new Promise((r) => setTimeout(r, 220));
      if (cancelled) return;

      // Ensure minimum hold duration has elapsed
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minDurationMs - elapsed);
      if (remaining > 0) {
        await new Promise((r) => setTimeout(r, remaining));
      }
      if (cancelled) return;

      // Milestone 4: Ready, or ready with limits. Hold a little longer so a problem can be read.
      setStep(3);
      setProgress(100);
      await new Promise((r) => setTimeout(r, found.length ? 1600 : 120));
      if (cancelled) return;

      // Trigger smooth choreographed exit
      setIsExiting(true);
      setTimeout(() => {
        if (!cancelled) {
          setIsMounted(false);
          onCompleteRef.current();
        }
      }, 350);
    };

    void runOrchestrator();

    return () => {
      cancelled = true;
    };
  }, [minDurationMs]);

  if (!isMounted) return null;

  const isDark = theme === 'dark';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('startupSplashLabel')}
      onDoubleClick={handleSkip}
      dir={dir}
      suppressHydrationWarning
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-between select-none overflow-hidden transition-all duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isExiting
          ? 'opacity-0 scale-[1.03] blur-[4px] pointer-events-none'
          : 'opacity-100 scale-100 blur-0 pointer-events-auto'
      } ${
        isDark
          ? 'bg-[#0e161b] text-[#efece4]'
          : 'bg-[#efece4] text-[#2c221a]'
      }`}
    >
      {/* Subtle Arabesque Pattern Background Texture */}
      <div
        className="absolute inset-0 bg-arabesque-pattern opacity-[0.04] pointer-events-none"
        aria-hidden="true"
      />

      {/* Ambient Top Glow */}
      <div
        className={`absolute top-0 inset-x-0 h-64 pointer-events-none ${
          isDark
            ? 'bg-gradient-to-b from-amber-500/10 via-amber-600/5 to-transparent'
            : 'bg-gradient-to-b from-amber-600/10 via-amber-700/5 to-transparent'
        }`}
        aria-hidden="true"
      />

      {/* Top Spacer / Minimal Title Header */}
      <div className="w-full pt-10 px-8 flex justify-between items-center z-10 opacity-70">
        <span className="text-[11px] tracking-widest uppercase font-mono text-amber-500/80 font-medium">
          {lang === 'ar' ? 'بغلب ٠٫١٫٠' : 'BAGLIB v0.1.0'}
        </span>
        <span className="text-[11px] font-sans text-muted">
          {t('splashSkipHint')}
        </span>
      </div>

      {/* Centerpiece Zone: 8-Pointed Star Rosette Interlaced with Open Manuscript Book */}
      <div className="flex flex-col items-center justify-center my-auto z-10 px-6 max-w-xl text-center">
        {/* Animated Emblem Container */}
        <div className="relative w-44 h-44 mb-8 flex items-center justify-center">
          {/* Soft Radial Ambient Aura */}
          <div
            className={`absolute inset-0 rounded-full blur-3xl animate-splash-glow pointer-events-none ${
              isDark ? 'bg-amber-500/25' : 'bg-amber-600/20'
            }`}
            aria-hidden="true"
          />

          {/* Master Inline Islamic Rosette & Open Book SVG */}
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full relative z-10 drop-shadow-[0_8px_24px_rgba(245,158,11,0.22)] animate-splash-pulse"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fef3c7" />
                <stop offset="40%" stopColor="#f59e0b" />
                <stop offset="70%" stopColor="#d97706" />
                <stop offset="100%" stopColor="#b45309" />
              </linearGradient>

              <linearGradient id="pageGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={isDark ? '#1e293b' : '#fefcf8'} />
                <stop offset="100%" stopColor={isDark ? '#0f172a' : '#ece4d4'} />
              </linearGradient>

              <radialGradient id="centerAura" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity={isDark ? "0.3" : "0.2"} />
                <stop offset="65%" stopColor="#d97706" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#d97706" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Central Glow Disc */}
            <circle cx="100" cy="100" r="76" fill="url(#centerAura)" />

            {/* Outer Concentric Guiding Ring */}
            <circle
              cx="100"
              cy="100"
              r="84"
              stroke="url(#goldGradient)"
              strokeWidth="0.85"
              strokeDasharray="3 3"
              opacity="0.45"
            />

            {/* 8-Pointed Star (Rub el Hizb) - Square 1 (Diamond rotated 45°) */}
            <polygon
              points="100,26 174,100 100,174 26,100"
              stroke="url(#goldGradient)"
              strokeWidth="1.8"
              strokeLinejoin="round"
              className="animate-splash-draw"
              fill={isDark ? '#141f26' : '#f8f6f0'}
              fillOpacity={isDark ? '0.6' : '0.75'}
            />

            {/* 8-Pointed Star (Rub el Hizb) - Square 2 (Orthogonal) */}
            <polygon
              points="48,48 152,48 152,152 48,152"
              stroke="url(#goldGradient)"
              strokeWidth="1.8"
              strokeLinejoin="round"
              className="animate-splash-draw"
              fill={isDark ? '#141f26' : '#f8f6f0'}
              fillOpacity={isDark ? '0.6' : '0.75'}
            />

            {/* Geometric Interlaced Rosette Facets & Inner Medallion */}
            <circle
              cx="100"
              cy="100"
              r="48"
              stroke="url(#goldGradient)"
              strokeWidth="1.2"
              strokeDasharray="6 3"
              opacity="0.8"
            />
            <circle
              cx="100"
              cy="100"
              r="42"
              stroke="url(#goldGradient)"
              strokeWidth="0.75"
              opacity="0.5"
            />

            {/* 8 Radiating Finials at the Outer Points */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
              const rad = (angle * Math.PI) / 180;
              const cx = 100 + 72 * Math.cos(rad);
              const cy = 100 + 72 * Math.sin(rad);
              return (
                <circle
                  key={angle}
                  cx={cx}
                  cy={cy}
                  r="2.2"
                  fill="#fbbf24"
                  opacity="0.9"
                />
              );
            })}

            {/* Centerpiece Motif: Open Manuscript Book */}
            {/* Left Page Folio */}
            <path
              d="M 100,116 C 88,110 74,108 58,111 L 58,82 C 74,79 88,81 100,87 Z"
              fill="url(#pageGradient)"
              stroke="url(#goldGradient)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />

            {/* Right Page Folio */}
            <path
              d="M 100,116 C 112,110 126,108 142,111 L 142,82 C 126,79 112,81 100,87 Z"
              fill="url(#pageGradient)"
              stroke="url(#goldGradient)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />

            {/* Manuscript Spine & Central Stitch Binding */}
            <line
              x1="100"
              y1="87"
              x2="100"
              y2="116"
              stroke="url(#goldGradient)"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Classical Bookmark Ribbon (Fasilah) Hanging from Spine */}
            <path
              d="M 100,115 Q 100,126 103,132 L 99,130 L 97,132 Q 99,126 100,115 Z"
              fill="#fbbf24"
              stroke="#d97706"
              strokeWidth="0.75"
            />

            {/* Calligraphic Folio Ruling Lines on Pages */}
            {/* Left Page Text Lines */}
            <line x1="68" y1="89" x2="90" y2="92" stroke="#d97706" strokeWidth="0.9" opacity="0.6" strokeLinecap="round" />
            <line x1="66" y1="96" x2="92" y2="99" stroke="#d97706" strokeWidth="0.9" opacity="0.6" strokeLinecap="round" />
            <line x1="68" y1="103" x2="88" y2="106" stroke="#d97706" strokeWidth="0.9" opacity="0.6" strokeLinecap="round" />

            {/* Right Page Text Lines */}
            <line x1="110" y1="92" x2="132" y2="89" stroke="#d97706" strokeWidth="0.9" opacity="0.6" strokeLinecap="round" />
            <line x1="108" y1="99" x2="134" y2="96" stroke="#d97706" strokeWidth="0.9" opacity="0.6" strokeLinecap="round" />
            <line x1="112" y1="106" x2="132" y2="103" stroke="#d97706" strokeWidth="0.9" opacity="0.6" strokeLinecap="round" />
          </svg>
        </div>

        {/* Brand Display Title */}
        <h1
          data-splash-brand
          style={{ paddingBlock: '0.1em' }}
          className={`text-4xl md:text-5xl leading-[1.7] font-bold tracking-tight font-display mb-2 drop-shadow-sm ${
            isDark
              ? 'bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-amber-300 to-amber-100'
              : 'bg-clip-text text-transparent bg-gradient-to-r from-amber-900 via-amber-700 to-amber-900'
          }`}
        >
          {t('splashTitle')}
        </h1>

        {/* Subtitle / Platform Mission */}
        <p
          className={`text-sm md:text-base font-serif font-medium tracking-wide max-w-md mx-auto mb-8 leading-relaxed ${
            isDark ? 'text-amber-200/80' : 'text-amber-900/85'
          }`}
        >
          {t('splashSubtitle')}
        </p>

        {/* Boot Progress Bar & Dynamic Status Indicator */}
        <div className="w-72 sm:w-80 flex flex-col items-center">
          {/* Ultra-Thin Glowing Progress Bar */}
          <div
            role="progressbar"
            aria-label={t('loading')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.max(0, progress))}
            className={`w-full h-[3px] rounded-full overflow-hidden relative mb-3 ${
              isDark ? 'bg-amber-950/40' : 'bg-amber-200/60'
            }`}
          >
            <div
              className="h-full rounded-full transition-all duration-300 ease-out relative bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300"
              style={{
                width: `${progress}%`,
                marginInlineStart: 0,
              }}
            >
              {/* Glowing Leading Edge */}
              <div
                className="absolute top-0 bottom-0 end-0 w-3 rounded-full bg-amber-200 shadow-[0_0_10px_2px_rgba(251,191,36,0.9)]"
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Dynamic Milestones Status Text */}
          <div className="h-6 flex items-center justify-center">
            <span
              key={step}
              role="status"
              aria-live="polite"
              className={`text-xs font-sans transition-all duration-200 animate-fadeIn ${
                isDark ? 'text-pale-sky-300/90' : 'text-pale-sky-700'
              }`}
            >
              {step === 3 && issues.length ? t('feedbackLimited') : t(stepKeys[step] || 'splashStepDb')}
            </span>
          </div>
          {issues.length > 0 && (
            <ul data-splash-issues role="alert" className={`mt-2 max-w-sm space-y-1 text-center text-xs leading-relaxed ${isDark ? 'text-amber-200' : 'text-amber-900'}`}>
              {issues.map((key) => <li key={key}>{t(key)}</li>)}
            </ul>
          )}

          {/* 4-Step Subtle Progress Dots */}
          <div className="flex items-center gap-1.5 mt-2" aria-hidden="true">
            {[0, 1, 2, 3].map((dotIdx) => (
              <div
                key={dotIdx}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  dotIdx < step
                    ? 'bg-amber-400 scale-100'
                    : dotIdx === step
                    ? 'bg-amber-300 scale-125 shadow-[0_0_6px_rgba(251,191,36,0.8)]'
                    : isDark
                    ? 'bg-slate-700/60 scale-90'
                    : 'bg-amber-200/60 scale-90'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Scholarly Epigraph / Inspiration Quote */}
      <div className="w-full pb-8 px-6 flex flex-col items-center justify-center z-10 text-center max-w-lg mx-auto">
        <div
          className={`relative p-3.5 rounded-xl border backdrop-blur-sm transition-opacity duration-300 ${
            isDark
              ? 'bg-[#141f26]/60 border-amber-900/30 text-amber-100/90'
              : 'bg-[#f8f6f0]/75 border-amber-300/40 text-amber-950/90'
          }`}
        >
          <p className="text-xs md:text-sm font-reading italic leading-relaxed mb-1.5 font-normal">
            «{t(epigraph.textKey)}»
          </p>
          <p className="text-[11px] font-sans text-amber-500/80 font-medium">
            — {t(epigraph.authorKey)}
          </p>
        </div>
      </div>
    </div>
  );
};
