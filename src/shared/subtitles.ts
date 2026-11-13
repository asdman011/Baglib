/**
 * KEY-343: lecture subtitles and transcript. SRT and WebVTT parsed without a dependency; Arabic cues read RTL.
 */
export interface SubtitleCue { start: number; end: number; text: string }

export const MAX_SUBTITLE_BYTES = 5_000_000;
const MAX_CUES = 20_000;

/** "01:02:03,456", "02:03.456" or "02:03" → seconds; NaN when it is not a time. */
export function parseCueTime(value: string): number {
  const match = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/u.exec(value.trim());
  if (!match || Number(match[3]) >= 60 || (match[1] !== undefined && Number(match[2]) >= 60)) return Number.NaN;
  const [, hours = '0', minutes, seconds, fraction = '0'] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(fraction.padEnd(3, '0')) / 1000;
}

const clean = (text: string) => text.replace(/<\/?(?:[bius]|c(?:\.[\w.-]+)?|v(?:\s[^>]*)?|lang(?:\s[^>]*)?|ruby|rt)>/giu, '').replace(/<\d{1,2}:\d{2}[:.\d]*>/gu, '')
  .replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&nbsp;/gu, ' ').replace(/&amp;/gu, '&').trim();

/** Parse an .srt or .vtt file's text (format detected from its content). Malformed cues are skipped, not fatal. */
export function parseSubtitles(source: string): SubtitleCue[] {
  if (new TextEncoder().encode(source).length > MAX_SUBTITLE_BYTES) throw new Error('subtitles-too-large');
  const text = source.replace(/^﻿/u, '').replace(/\r\n?/gu, '\n');
  const blocks = text.split(/\n{2,}/u);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((line, index) => index > 0 || line.trim());
    if (/^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/u.test(lines[0] ?? '')) continue;
    const timing = lines.findIndex(line => line.includes('-->'));
    if (timing < 0) continue; // WEBVTT header, NOTE, STYLE, REGION or a stray number
    const [from, rest = ''] = lines[timing].split('-->');
    const start = parseCueTime(from), end = parseCueTime(rest.trim().split(/\s+/u)[0] ?? '');
    const body = clean(lines.slice(timing + 1).join('\n'));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !body) continue;
    cues.push({ start, end, text: body });
    if (cues.length >= MAX_CUES) break;
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** The cue showing at a moment (the latest one that started), for the overlay and the transcript highlight. */
export function activeCueIndex(cues: SubtitleCue[], time: number): number {
  let low = 0, high = cues.length - 1, found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (cues[middle].start <= time) { found = middle; low = middle + 1; } else high = middle - 1;
  }
  return found >= 0 && time < cues[found].end ? found : -1;
}

/** True when a cue is mostly Arabic script, so it is shown right-to-left. */
export function isRtlCue(text: string): boolean {
  const arabic = (text.match(/\p{Script=Arabic}/gu) ?? []).length;
  const latin = (text.match(/\p{Script=Latin}/gu) ?? []).length;
  return arabic > latin;
}

/** The subtitle files that sit next to a media file and share its name (lecture.mp4 → lecture.srt, lecture.ar.vtt…). */
export function companionSubtitleNames(mediaFile: string, siblings: string[]): string[] {
  const stem = mediaFile.replace(/\.[^.\\/]+$/u, '').toLocaleLowerCase();
  return siblings.filter(name => {
    const lower = name.toLocaleLowerCase();
    return /\.(srt|vtt)$/u.test(lower) && (lower.startsWith(stem + '.')) ;
  }).sort();
}
