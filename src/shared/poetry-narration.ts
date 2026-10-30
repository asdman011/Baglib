/**
 * Al-Bayan human narration helpers shared by the main process and renderer.
 *
 * Narrations are human recordings only (microphone, local audio files or online
 * providers). Computer-generated speech is never stored or played as a poem narration.
 */
import type { PoetryNarrationProvider } from './types/poetry';

export const POETRY_NARRATION_AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.flac', '.webm'] as const;
export const POETRY_NARRATION_MAX_BYTES = 200 * 1024 * 1024;
export const POETRY_NARRATION_MAX_LABEL = 200;
export const POETRY_NARRATION_MAX_RECORDING_SECONDS = 60 * 60;

export interface ParsedNarrationLink { provider: Exclude<PoetryNarrationProvider, 'local'>; url: string }

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/u;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const SOUNDCLOUD_HOSTS = new Set(['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

function startSeconds(value: string | null): number | null {
  if (!value) return null;
  const lower = value.toLowerCase().trim();
  if (/^\d+s?$/u.test(lower)) return Number.parseInt(lower, 10);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/u.exec(lower);
  if (!match || !match[0]) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function youtube(id: string | null | undefined, start: number | null): ParsedNarrationLink | null {
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return { provider: 'youtube', url: `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}` : ''}` };
}

/** Validates and canonicalizes an online narration link. Returns null for unsupported or unsafe URLs. */
export function parseNarrationLink(raw: string): ParsedNarrationLink | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  const start = startSeconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
  if (host === 'youtu.be') return youtube(parts[0], start);
  if (YOUTUBE_HOSTS.has(host)) {
    const normalizedPath = url.pathname.replace(/\/+$/u, '');
    if (normalizedPath === '/watch') return youtube(url.searchParams.get('v') ?? url.searchParams.get('V'), start);
    if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) return youtube(parts[1], start);
    return null;
  }
  if (SOUNDCLOUD_HOSTS.has(host)) {
    if (parts.length < 2 || parts.some(part => !/^[A-Za-z0-9_.~%-]+$/u.test(part))) return null;
    const isSet = parts[1] === 'sets' && parts.length >= 3;
    const isSecret = parts[2] && /^s-[A-Za-z0-9]+$/u.test(parts[2]);
    const validParts = isSet || isSecret ? parts.slice(0, 3) : parts.slice(0, 2);
    return { provider: 'soundcloud', url: `https://soundcloud.com/${validParts.join('/')}` };
  }
  if (VIMEO_HOSTS.has(host)) {
    const id = parts.find(part => /^\d{1,12}$/u.test(part));
    return id ? { provider: 'vimeo', url: `https://vimeo.com/${id}` } : null;
  }
  const extension = /\.[A-Za-z0-9]+$/u.exec(url.pathname)?.[0].toLowerCase();
  if (url.protocol === 'https:' && extension && (POETRY_NARRATION_AUDIO_EXTENSIONS as readonly string[]).includes(extension)) {
    url.hash = '';
    return { provider: 'url', url: url.toString() };
  }
  return null;
}

/** Builds the provider player URL for an already canonicalized online narration. */
export function narrationEmbedUrl(provider: PoetryNarrationProvider, canonical: string): string | null {
  const parsed = provider === 'local' ? null : parseNarrationLink(canonical);
  if (!parsed || parsed.provider !== provider) return null;
  const url = new URL(parsed.url);
  if (provider === 'youtube') {
    const start = url.searchParams.get('t');
    return `https://www.youtube-nocookie.com/embed/${url.searchParams.get('v')}?rel=0${start ? `&start=${start}` : ''}`;
  }
  if (provider === 'soundcloud') return `https://w.soundcloud.com/player/?url=${encodeURIComponent(parsed.url)}&visual=false&show_comments=false`;
  if (provider === 'vimeo') return `https://player.vimeo.com/video/${url.pathname.split('/').filter(Boolean)[0]}`;
  return null;
}

export function narrationExtensionAllowed(fileName: string): boolean {
  const extension = /\.[A-Za-z0-9]+$/u.exec(fileName)?.[0].toLowerCase();
  return !!extension && (POETRY_NARRATION_AUDIO_EXTENSIONS as readonly string[]).includes(extension);
}

export function narrationLabelValid(label: unknown): label is string | undefined {
  return label === undefined || (typeof label === 'string' && label.length <= POETRY_NARRATION_MAX_LABEL);
}
