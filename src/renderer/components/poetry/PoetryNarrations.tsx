'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PoetryDetail, PoetryNarration } from '../../../shared/types/poetry';
import { narrationEmbedUrl, POETRY_NARRATION_MAX_LABEL, POETRY_NARRATION_MAX_RECORDING_SECONDS } from '../../../shared/poetry-narration';
import { useWorkspace } from '../context/WorkspaceContext';

type NarrationError = 'failed' | 'unsupported' | 'mic' | null;
type Recorder = { recorder: MediaRecorder; stream: MediaStream; startedAt: number; timer: number };
const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
const PROVIDER_KEYS = { youtube: 'bayanNarrationProviderYoutube', soundcloud: 'bayanNarrationProviderSoundcloud', vimeo: 'bayanNarrationProviderVimeo', url: 'bayanNarrationProviderUrl' } as const;

function clock(seconds: number, lang: string): string {
  const whole = Math.max(0, Math.floor(seconds));
  const format = (value: number) => value.toLocaleString(lang, { minimumIntegerDigits: 2, useGrouping: false });
  return `${format(Math.floor(whole / 60))}:${format(whole % 60)}`;
}

/** Browser MediaRecorder WebM files have no duration header; seek once so the native control shows length and can scrub. */
function repairDuration(event: React.SyntheticEvent<HTMLAudioElement>) {
  const audio = event.currentTarget;
  if (audio.duration !== Infinity) return;
  const reset = () => { audio.removeEventListener('timeupdate', reset); audio.currentTime = 0; };
  audio.addEventListener('timeupdate', reset);
  audio.currentTime = 1e101;
}

/** Human-voice narrations for an Al-Bayan poem. Computer-generated speech is never offered here. */
export function PoetryNarrations({ poem, hidden }: { poem: PoetryDetail; hidden: boolean }) {
  const { t, lang } = useWorkspace();
  const [items, setItems] = useState<PoetryNarration[]>([]);
  const [error, setError] = useState<NarrationError>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [link, setLink] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const [loadedPlayers, setLoadedPlayers] = useState<Set<string>>(() => new Set());
  const recorder = useRef<Recorder | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const previewUrl = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const result = await window.electronAPI.poetry.narrations(poem.id);
    if (result.ok) setItems(result.data); else setError('failed');
  }, [poem.id]);
  useEffect(() => {
    let alive = true;
    void window.electronAPI.poetry.narrations(poem.id).then(result => {
      if (!alive) return;
      if (result.ok) setItems(result.data); else setError('failed');
    }).catch(() => { if (alive) setError('failed'); });
    return () => { alive = false; };
  }, [poem.id]);

  const report = (result: { ok: boolean; error?: string }) => {
    if (result.ok) { setError(null); setSaved(true); return true; }
    setSaved(false);
    setError(result.error === 'unsupported-poetry-narration' ? 'unsupported' : 'failed');
    return false;
  };
  const run = async (action: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, after?: () => void) => {
    setBusy(true); setSaved(false);
    try {
      const result = await action();
      if (result.ok && result.data === null) return;
      if (report(result)) { after?.(); await reload(); }
    } catch { setError('failed'); } finally { setBusy(false); }
  };

  const clearPreview = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
  };
  const stopRecording = useCallback(() => {
    const active = recorder.current;
    if (!active) return;
    window.clearInterval(active.timer);
    if (active.recorder.state !== 'inactive') active.recorder.stop();
  }, []);
  useEffect(() => () => {
    const active = recorder.current;
    if (active) { window.clearInterval(active.timer); active.recorder.ondataavailable = null; active.recorder.onstop = null; if (active.recorder.state !== 'inactive') active.recorder.stop(); active.stream.getTracks().forEach(track => track.stop()); }
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  const startRecording = async () => {
    clearPreview(); setSaved(false);
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { setError('mic'); return; }
    const mimeType = RECORDING_TYPES.find(type => MediaRecorder.isTypeSupported(type));
    const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    media.onstop = () => {
      const active = recorder.current;
      const seconds = active ? (performance.now() - active.startedAt) / 1000 : 0;
      stream.getTracks().forEach(track => track.stop());
      recorder.current = null;
      setRecording(false);
      const blob = new Blob(chunks, { type: media.mimeType || mimeType || 'audio/webm' });
      if (!blob.size || seconds <= 0) return;
      const url = URL.createObjectURL(blob);
      previewUrl.current = url;
      setPreview({ blob, url, seconds });
    };
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const seconds = (performance.now() - startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= POETRY_NARRATION_MAX_RECORDING_SECONDS) stopRecording();
    }, 250);
    recorder.current = { recorder: media, stream, startedAt, timer };
    setElapsed(0); setError(null); setRecording(true);
    media.start(1000);
  };

  const saveRecording = async () => {
    if (!preview) return;
    const data = await preview.blob.arrayBuffer();
    await run(() => window.electronAPI.poetry.saveNarrationRecording({ poemId: poem.id, label: label.trim() || undefined, mimeType: preview.blob.type, durationSeconds: preview.seconds, data }), () => { clearPreview(); setLabel(''); });
  };
  const remove = async (item: PoetryNarration) => {
    if (!window.confirm(t('bayanNarrationConfirmDelete'))) return;
    await run(() => window.electronAPI.poetry.deleteNarration(item.id));
    setSaved(false);
  };
  const pauseOthers = (event: React.SyntheticEvent<HTMLAudioElement>) => {
    list.current?.querySelectorAll('audio').forEach(audio => { if (audio !== event.currentTarget) audio.pause(); });
  };

  return <aside hidden={hidden} aria-label={t('bayanNarrations')} data-poetry-narrations className="max-h-[45vh] space-y-4 overflow-y-auto rounded-xl border border-subtle bg-surface p-4">
    <p className="text-sm text-muted">{t('bayanNarrationHumanOnly')}</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-[14rem] flex-1 text-sm">{t('bayanNarrationLabel')}
        <input dir="auto" value={label} maxLength={POETRY_NARRATION_MAX_LABEL} onChange={event => setLabel(event.target.value)} className="block w-full rounded border border-subtle bg-canvas p-2 text-start" />
      </label>
      {recording
        ? <button type="button" data-narration-stop onClick={stopRecording}>{t('bayanNarrationStopRecording')}</button>
        : <button type="button" data-narration-record disabled={busy} onClick={() => void startRecording()}>{t('bayanNarrationRecord')}</button>}
      <button type="button" disabled={busy || recording} onClick={() => void run(() => window.electronAPI.poetry.importNarrationFile({ poemId: poem.id, label: label.trim() || undefined }), () => setLabel(''))}>{t('bayanNarrationUpload')}</button>
    </div>
    {recording && <p role="status" className="text-sm"><span aria-hidden="true" className="me-2 inline-block h-2 w-2 rounded-full bg-red-500" />{t('bayanNarrationRecording', { time: clock(elapsed, lang) })}</p>}
    {preview && <div className="space-y-2 rounded-lg border border-subtle p-3">
      <p className="text-sm text-muted">{t('bayanNarrationPreview')}</p>
      <audio controls src={preview.url} onLoadedMetadata={repairDuration} className="w-full" />
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={() => void saveRecording()}>{t('bayanNarrationSaveRecording')}</button>
        <button type="button" disabled={busy} onClick={clearPreview}>{t('bayanNarrationDiscard')}</button>
      </div>
    </div>}
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); if (link.trim()) void run(() => window.electronAPI.poetry.addNarrationLink({ poemId: poem.id, label: label.trim() || undefined, url: link.trim() }), () => { setLink(''); setLabel(''); }); }}>
      <label className="min-w-[14rem] flex-1 text-sm">{t('bayanNarrationLink')}
        <input dir="ltr" type="url" inputMode="url" value={link} maxLength={2048} onChange={event => setLink(event.target.value)} className="block w-full rounded border border-subtle bg-canvas p-2 text-start" />
      </label>
      <button type="submit" disabled={busy || !link.trim()}>{t('bayanNarrationAddLink')}</button>
    </form>
    {error && <p role="alert" className="text-sm">{t(error === 'mic' ? 'bayanNarrationMicDenied' : error === 'unsupported' ? 'bayanNarrationUnsupported' : 'bayanNarrationFailed')}</p>}
    {saved && <p role="status" className="text-sm">{t('bayanNarrationSaved')}</p>}
    <div ref={list} className="space-y-3">
      {!items.length && <p className="text-sm text-muted">{t('bayanNarrationEmpty')}</p>}
      {items.map(item => {
        const kindLabel = item.kind === 'recording' ? t('bayanNarrationKindRecording') : item.kind === 'file' ? t('bayanNarrationKindFile') : t(PROVIDER_KEYS[item.provider as keyof typeof PROVIDER_KEYS]);
        const embed = item.kind === 'online' ? narrationEmbedUrl(item.provider, item.url ?? '') : null;
        return <article key={item.id} data-narration-id={item.id} data-narration-provider={item.provider} className="space-y-2 rounded-lg border border-subtle p-3">
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 dir="auto" className="font-semibold leading-loose">{item.label || t('bayanNarrationUntitled')}</h3>
            <span className="text-xs text-muted">{kindLabel}</span>
            {item.durationSeconds !== null && <span className="text-xs text-muted"><bdi dir="ltr">{clock(item.durationSeconds, lang)}</bdi></span>}
            <span className="text-xs text-muted">{new Date(item.createdAt).toLocaleDateString(lang)}</span>
            <button type="button" className="ms-auto text-sm text-muted" disabled={busy} onClick={() => void remove(item)}>{t('bayanNarrationDelete')}</button>
          </header>
          {item.mediaUrl && <audio controls preload={item.provider === 'url' ? 'none' : 'metadata'} src={item.mediaUrl} onPlay={pauseOthers} onLoadedMetadata={repairDuration} className="w-full" />}
          {embed && (loadedPlayers.has(item.id)
            ? <iframe src={embed} title={item.label || t('bayanNarrationUntitled')} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms" className={`w-full rounded ${item.provider === 'soundcloud' ? 'h-[166px]' : 'aspect-video'}`} />
            : <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => setLoadedPlayers(current => new Set(current).add(item.id))}>{t('bayanNarrationLoadPlayer')}</button><span className="text-xs text-muted">{t('bayanNarrationOnlineNotice', { provider: kindLabel })}</span></div>)}
          {item.kind === 'online' && item.url && <button type="button" className="block max-w-full break-all text-start text-xs underline" onClick={() => { void window.electronAPI.openExternal(item.url!).catch(() => setError('failed')); }}>{t('bayanNarrationOpenExternal')}: <bdi dir="ltr">{item.url}</bdi></button>}
        </article>;
      })}
    </div>
  </aside>;
}
