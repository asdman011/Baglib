'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Captions, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { clockTime, PLAYBACK_RATES, type LectureSection } from '../../../shared/lectures';

const iconButton = 'inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40';
const initialState = { playing: false, now: 0, duration: 0, volume: 1, muted: false, rate: 1, buffered: [] as { start: number; end: number }[], fullscreen: false, captions: false, hasCaptions: false };

export function LectureMediaControls({ audio, study, sections, onSave, subtitleControls, children }: {
  audio: boolean;
  study: boolean;
  sections: LectureSection[];
  onSave: () => void;
  subtitleControls?: { available: boolean; enabled: boolean; toggle: () => void };
  children: ReactNode;
}) {
  const { t, dir } = useWorkspace();
  const container = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLVideoElement | null>(null);
  const speedMenu = useRef<HTMLDetailsElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState(initialState);
  const [visible, setVisible] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);

  const wake = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!audio && !study && media.current && !media.current.paused) {
      hideTimer.current = setTimeout(() => {
        if (!speedMenu.current?.open) setVisible(false);
      }, 2500);
    }
  }, [audio, study]);

  useEffect(() => {
    const element = container.current?.querySelector('video');
    media.current = element ?? null;
    if (!element) return;
    let alive = true;
    const sync = () => {
      const duration = Number.isFinite(element.duration) ? element.duration : 0;
      const buffered = Array.from({ length: element.buffered.length }, (_, index) => ({ start: element.buffered.start(index), end: element.buffered.end(index) }));
      const tracks = Array.from(element.textTracks);
      setState({
        playing: !element.paused && !element.ended, now: element.currentTime, duration,
        volume: element.volume, muted: element.muted, rate: element.playbackRate, buffered,
        fullscreen: document.fullscreenElement === container.current,
        captions: tracks.some(track => track.mode === 'showing'), hasCaptions: tracks.length > 0,
      });
    };
    const events = ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'durationchange', 'volumechange', 'ratechange', 'progress'] as const;
    for (const name of events) element.addEventListener(name, sync);
    element.addEventListener('play', wake);
    element.addEventListener('pause', wake);
    document.addEventListener('fullscreenchange', sync);
    element.textTracks.addEventListener('change', sync);
    element.textTracks.addEventListener('addtrack', sync);
    const outside = (event: PointerEvent) => {
      if (!speedMenu.current?.contains(event.target as Node) && speedMenu.current) speedMenu.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    void Promise.resolve().then(() => {
      if (!alive) return;
      sync(); wake();
      setPipSupported(!!document.pictureInPictureEnabled && typeof element.requestPictureInPicture === 'function');
    });
    return () => {
      alive = false;
      for (const name of events) element.removeEventListener(name, sync);
      element.removeEventListener('play', wake);
      element.removeEventListener('pause', wake);
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('pointerdown', outside);
      element.textTracks.removeEventListener('change', sync);
      element.textTracks.removeEventListener('addtrack', sync);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [wake]);

  const play = () => {
    const element = media.current;
    if (!element) return;
    setFailed(false);
    if (element.paused) void element.play().catch(() => setFailed(true));
    else element.pause();
    wake();
  };
  const seek = (seconds: number) => {
    const element = media.current;
    if (!element || !Number.isFinite(element.duration)) return;
    element.currentTime = Math.max(0, Math.min(element.duration, seconds));
    onSave(); wake();
  };
  const speed = (rate: number) => {
    if (media.current) media.current.playbackRate = rate;
    onSave(); wake();
  };
  const mute = () => { if (media.current) media.current.muted = !media.current.muted; wake(); };
  const volume = (value: number) => {
    if (media.current) { media.current.volume = Math.max(0, Math.min(1, value)); media.current.muted = false; }
    wake();
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement === container.current) await document.exitFullscreen();
      else await container.current?.requestFullscreen();
    } catch { setFailed(true); }
    wake();
  };
  const pip = async () => {
    try {
      if (document.pictureInPictureElement === media.current) await document.exitPictureInPicture();
      else await media.current?.requestPictureInPicture();
    } catch { setFailed(true); }
  };
  const captions = () => {
    if (subtitleControls?.available) { subtitleControls.toggle(); wake(); return; }
    const tracks = Array.from(media.current?.textTracks || []);
    const show = !tracks.some(track => track.mode === 'showing');
    tracks.forEach((track, index) => { track.mode = show && index === 0 ? 'showing' : 'hidden'; });
    wake();
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && (event.target.matches('input,textarea,select') || event.target.isContentEditable)) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === ' ' && event.target instanceof HTMLElement && event.target.closest('button,summary')) return;
    const element = media.current;
    if (!element) return;
    switch (event.key.toLowerCase()) {
      case ' ': case 'k': event.preventDefault(); play(); break;
      case 'j': event.preventDefault(); seek(element.currentTime - 10); break;
      case 'l': event.preventDefault(); seek(element.currentTime + 10); break;
      case 'arrowleft': event.preventDefault(); seek(element.currentTime - 5); break;
      case 'arrowright': event.preventDefault(); seek(element.currentTime + 5); break;
      case 'arrowup': event.preventDefault(); volume(element.volume + 0.05); break;
      case 'arrowdown': event.preventDefault(); volume(element.volume - 0.05); break;
      case 'f': event.preventDefault(); void fullscreen(); break;
      case 'm': event.preventDefault(); mute(); break;
      case 'c': event.preventDefault(); captions(); break;
      case '<': case '>': {
        event.preventDefault();
        const index = PLAYBACK_RATES.indexOf(element.playbackRate as typeof PLAYBACK_RATES[number]);
        const next = Math.max(0, Math.min(PLAYBACK_RATES.length - 1, index + (event.key === '>' ? 1 : -1)));
        speed(PLAYBACK_RATES[next]);
        break;
      }
      case 'escape':
        if (speedMenu.current?.open) { speedMenu.current.open = false; speedMenu.current.querySelector('summary')?.focus(); event.stopPropagation(); }
        break;
    }
  };
  const showControls = audio || study || !state.playing || visible;
  const timePercent = state.duration ? state.now / state.duration * 100 : 0;

  return <div ref={container} data-lecture-controls data-controls-visible={showControls} data-lecture-layout={study ? 'study' : 'overlay'} tabIndex={0} role="group" aria-label={t('lecturePlayerControls')}
    className={'relative min-w-0 rounded-xl bg-black text-white [&:fullscreen_video]:max-h-[calc(100vh-6rem)] focus-visible:outline-2 focus-visible:outline-pale-sky-500 ' + (state.fullscreen ? 'flex h-full flex-col justify-center' : '')}
    onKeyDown={keyboard} onPointerMove={wake} onFocus={wake} onClick={event => { if (event.target === media.current) play(); }}>
    <div className="relative min-w-0">{children}
    {!audio && <div className={'pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity ' + (showControls ? 'opacity-100' : 'opacity-0')}>
      <button data-lecture-center-play type="button" className="pointer-events-auto flex size-14 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80" aria-label={t(state.playing ? 'lecturePause' : 'lecturePlay')} title={t(state.playing ? 'lecturePause' : 'lecturePlay')} onClick={play}>{state.playing ? <Pause size={28} /> : <Play size={28} />}</button>
    </div>}</div>
    <div data-lecture-control-bar dir={dir} className={'z-10 space-y-1 px-2 py-2 transition-opacity ' + (audio || study ? 'relative bg-neutral-950' : 'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent pt-8') + (showControls ? ' opacity-100' : ' pointer-events-none opacity-0')} inert={!showControls}>
      <div dir="ltr" className="relative h-5" data-lecture-timeline-wrapper onPointerLeave={() => setHover(null)}>
        <div className="pointer-events-none absolute inset-x-0 top-2 h-1 rounded-full bg-white/25">
          {state.buffered.map((range, index) => <span key={index} className="absolute top-0 h-full bg-white/35" style={{ insetInlineStart: (state.duration ? range.start / state.duration * 100 : 0) + '%', width: (state.duration ? (range.end - range.start) / state.duration * 100 : 0) + '%' }} />)}
          <span className="absolute start-0 top-0 h-full bg-pale-sky-400" style={{ width: timePercent + '%' }} />
          {sections.filter(section => state.duration && section.start <= state.duration).map((section, index) => <span key={index} data-lecture-chapter-tick className="absolute top-[-3px] h-2.5 w-0.5 bg-white" style={{ insetInlineStart: Math.min(99.5, section.start / state.duration * 100) + '%' }} />)}
        </div>
        <input data-lecture-timeline type="range" min={0} max={state.duration || 0} step={0.1} value={state.now} disabled={!state.duration} aria-label={t('lectureSeek')} aria-valuetext={clockTime(state.now) + ' / ' + clockTime(state.duration)}
          className="absolute inset-0 m-0 h-5 w-full cursor-pointer opacity-0 focus-visible:opacity-100"
          onChange={event => seek(Number(event.target.value))} onPointerMove={event => { const bounds = event.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(1, (event.clientX - bounds.x) / bounds.width)) * state.duration); }} />
        {hover !== null && <output data-lecture-hover-time className="pointer-events-none absolute bottom-full rounded bg-black/90 px-2 py-1 text-xs" style={{ insetInlineStart: Math.max(0, Math.min(85, state.duration ? hover / state.duration * 100 : 0)) + '%' }}>{clockTime(hover)}</output>}
      </div>
      <div className="flex flex-wrap items-center gap-0.5">
        <button data-lecture-play type="button" className={iconButton} aria-label={t(state.playing ? 'lecturePause' : 'lecturePlay')} title={t(state.playing ? 'lecturePause' : 'lecturePlay')} onClick={play}>{state.playing ? <Pause size={18} /> : <Play size={18} />}</button>
        <button data-lecture-back type="button" className={iconButton} aria-label={t('lectureBackTen')} title={t('lectureBackTen')} onClick={() => seek(state.now - 10)}><RotateCcw size={18} /></button>
        <button data-lecture-forward type="button" className={iconButton} aria-label={t('lectureForwardTen')} title={t('lectureForwardTen')} onClick={() => seek(state.now + 10)}><RotateCw size={18} /></button>
        <bdi dir="ltr" className="px-1 text-xs tabular-nums">{clockTime(state.now)} / {clockTime(state.duration)}</bdi>
        <span className="flex-1" />
        <button data-lecture-mute type="button" className={iconButton} aria-label={t(state.muted ? 'lectureUnmute' : 'lectureMute')} title={t(state.muted ? 'lectureUnmute' : 'lectureMute')} onClick={mute}>{state.muted || state.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <input data-lecture-volume type="range" min={0} max={1} step={0.05} value={state.muted ? 0 : state.volume} aria-label={t('lectureVolume')} dir="ltr" className="w-12 accent-white" onChange={event => volume(Number(event.target.value))} />
        <details ref={speedMenu} className="relative" onToggle={wake} data-lecture-speed-menu>
          <summary className="flex h-8 cursor-pointer list-none items-center rounded-md px-2 text-xs hover:bg-white/15 [&::-webkit-details-marker]:hidden" aria-label={t('lectureSpeed')} title={t('lectureSpeed')}><bdi>{state.rate}×</bdi></summary>
          <div role="group" aria-label={t('lectureSpeed')} className="absolute bottom-full end-0 z-20 mb-1 grid max-h-48 w-24 grid-cols-2 overflow-auto rounded-lg bg-neutral-900 p-1 shadow-lg">{PLAYBACK_RATES.map(rate => <button data-lecture-speed={rate} type="button" key={rate} aria-pressed={state.rate === rate} className="rounded p-2 text-xs hover:bg-white/15 aria-pressed:bg-white/20" onClick={() => { speed(rate); if (speedMenu.current) speedMenu.current.open = false; }}><bdi>{rate}×</bdi></button>)}</div>
        </details>
        <button data-lecture-captions type="button" className={iconButton} aria-label={t('lectureCaptions')} title={t(subtitleControls?.available || state.hasCaptions ? 'lectureCaptions' : subtitleControls ? 'lectureSubtitleEmpty' : 'lectureCaptionsPending')} aria-pressed={subtitleControls?.available ? subtitleControls.enabled : state.captions} disabled={!subtitleControls?.available && !state.hasCaptions} onClick={captions}><Captions size={18} /></button>
        {!audio && pipSupported && <button data-lecture-pip type="button" className={iconButton} aria-label={t('lecturePictureInPicture')} title={t('lecturePictureInPicture')} disabled={!state.duration} onClick={() => void pip()}><PictureInPicture2 size={18} /></button>}
        <button data-lecture-fullscreen type="button" className={iconButton} aria-label={t(state.fullscreen ? 'lectureExitFullscreen' : 'lectureFullscreen')} title={t(state.fullscreen ? 'lectureExitFullscreen' : 'lectureFullscreen')} onClick={() => void fullscreen()}>{state.fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
      </div>
      {failed && <p role="alert" className="px-1 text-xs leading-relaxed">{t('lectureControlError')}</p>}
    </div>
  </div>;
}
