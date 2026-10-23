import { createElement, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useTTSAudio } from '../../src/renderer/hooks/useTTSAudio';

const report = (result: unknown) => (window as unknown as { liveReport: (value: unknown) => void }).liveReport(result);
const scheduled: { start: number; end: number }[] = [];
const settings = new URLSearchParams(location.search);
const rate = Number(settings.get('rate') || '1');
const voiceEn = settings.get('voice') || 'pocket:alba';
const repetitions = Math.max(1, Math.min(10, Number(settings.get('repeat') || '1')));
const passage = 'The library preserves knowledge for future generations. A reader should hear the next sentence without waiting for the entire chapter to be generated. This final sentence checks that repeated requests keep the model ready in memory.';
const narration = Array.from({ length: repetitions }, () => passage).join(' ');
const originalCreateSource = AudioContext.prototype.createBufferSource;
AudioContext.prototype.createBufferSource = function () {
  const source = originalCreateSource.call(this);
  const originalStart = source.start.bind(source);
  source.start = (when = 0, offset = 0, duration?: number) => {
    scheduled.push({ start: when, end: when + (source.buffer?.duration || 0) / source.playbackRate.value });
    if (duration === undefined) originalStart(when, offset);
    else originalStart(when, offset, duration);
  };
  return source;
};

function Harness() {
  const visited = useRef(new Set<number>());
  const started = useRef(false);
  const played = useRef(false);
  const notice = useCallback((message: string) => { report({ ok: false, message }); }, []);
  const sentence = useCallback((index: number) => { visited.current.add(index); }, []);
  const audio = useTTSAudio({
    initialText: narration,
    onSentenceChange: sentence,
    onProviderNotice: notice,
  });
  const setConfig = audio.setConfig;
  useEffect(() => { setConfig((previous) => ({ ...previous, rate, voiceEn })); }, [setConfig]);
  useEffect(() => {
    if (started.current || !audio.sentences.length || audio.config.voiceEn !== voiceEn || audio.config.rate !== rate) return;
    started.current = true;
    audio.playSentence(0);
  }, [audio]);
  useEffect(() => {
    if (audio.playbackState === 'playing') played.current = true;
    if (!played.current || audio.playbackState !== 'idle') return;
    const gaps = scheduled.slice(1).map((item, index) => item.start - scheduled[index].end);
    const maxGapMs = Math.max(0, ...gaps) * 1000;
    report({ ok: visited.current.size === repetitions * 3 && scheduled.length > 3 && maxGapMs < 500, rate, voiceEn, sentences: [...visited.current], pcmBuffers: scheduled.length, maxGapMs, audioSeconds: scheduled.reduce((total, item) => total + item.end - item.start, 0) });
  }, [audio.playbackState]);
  return createElement('div', null, audio.playbackState);
}

window.addEventListener('error', (event) => report({ ok: false, message: event.message }));
window.addEventListener('unhandledrejection', (event) => report({ ok: false, message: String(event.reason) }));
createRoot(document.getElementById('root')!).render(createElement(Harness));
