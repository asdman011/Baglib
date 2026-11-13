'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { clockTime } from '../../../shared/lectures';
import { isRtlCue, type SubtitleCue } from '../../../shared/subtitles';
import { normalizeArabicText } from '../../../shared/utils/text-normalizer';

export function LectureTranscript({ cues, active, onSeek, onNote }: {
  cues: SubtitleCue[]; active: number; onSeek: (time: number) => void; onNote: (time: number) => void;
}) {
  const { t } = useWorkspace();
  const [query, setQuery] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const filtered = useMemo(() => {
    const normalize = (value: string) => normalizeArabicText(value, { normalizeTaaMarbuta: false });
    const search = normalize(query).trim();
    return cues.map((cue, index) => ({ cue, index })).filter(({ cue }) => normalize(cue.text).includes(search));
  }, [cues, query]);
  useEffect(() => {
    const container = list.current;
    const current = container?.querySelector('[aria-current="true"]');
    if (!container || !current) return;
    const bounds = container.getBoundingClientRect();
    const row = current.getBoundingClientRect();
    if (row.top < bounds.top) container.scrollBy({ top: row.top - bounds.top, behavior: 'smooth' });
    else if (row.bottom > bounds.bottom) container.scrollBy({ top: row.bottom - bounds.bottom, behavior: 'smooth' });
  }, [active]);
  return <section data-lecture-transcript-slot className="space-y-2 min-w-0">
    <h3 className="text-sm font-bold">{t('lectureTranscript')}</h3>
    <input data-transcript-search aria-label={t('lectureTranscriptSearch')} placeholder={t('lectureTranscriptSearch')} dir="auto" className="w-full rounded-lg border border-subtle bg-surface p-2 text-sm" value={query} onChange={event => setQuery(event.target.value)} />
    {filtered.length === 0 && <p className="text-xs leading-relaxed text-muted">{t(cues.length ? 'lectureTranscriptNoMatches' : 'lectureSubtitleEmpty')}</p>}
    <ol ref={list} className="max-h-80 overflow-auto space-y-1 overscroll-contain">{filtered.map(({ cue, index }) => <li key={index} data-transcript-cue={index} aria-current={active === index} className={'rounded-lg border p-2 ' + (active === index ? 'border-pale-sky-500 bg-pale-sky-500/10' : 'border-subtle')}>
      <button type="button" data-transcript-seek className="block w-full text-start text-sm leading-relaxed whitespace-pre-wrap" onClick={() => onSeek(cue.start)}><bdi className="block text-xs text-muted">{clockTime(cue.start)}</bdi><span dir={isRtlCue(cue.text) ? 'rtl' : 'ltr'} className="block">{cue.text}</span></button>
      <button type="button" data-transcript-note className="mt-1 text-xs underline" onClick={() => onNote(cue.start)}>{t('lectureNoteHere')}</button>
    </li>)}</ol>
  </section>;
}
