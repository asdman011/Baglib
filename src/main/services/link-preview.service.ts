import {
  allowedLinkPreviewUrl,
  extractVimeoVideoId,
  extractYoutubeVideoId,
  parseHtmlLinkPreview,
  type ResearchLinkPreview,
} from '../../shared/link-preview';
import { BAGLIB_USER_AGENT } from './metadata/http-client';

const LINK_PREVIEW_TIMEOUT_MS = 5000;
const LINK_PREVIEW_MAX_BYTES = 256 * 1024;
const LINK_PREVIEW_MAX_REDIRECTS = 3;

export interface FetchLinkPreviewOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  allowLoopbackForTest?: boolean;
}

const EMPTY_PREVIEW: ResearchLinkPreview = {
  title: null,
  description: null,
  icon: null,
  image: null,
};

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return text.slice(0, maxBytes);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {}
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

async function fetchWithSafeRedirects(
  initialUrl: string,
  headers: Record<string, string>,
  options: Required<Pick<FetchLinkPreviewOptions, 'fetchImpl' | 'timeoutMs' | 'allowLoopbackForTest'>>
): Promise<{ response: Response; finalUrl: string } | null> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= LINK_PREVIEW_MAX_REDIRECTS; hop++) {
    const validated = allowedLinkPreviewUrl(currentUrl, {
      allowLoopbackForTest: options.allowLoopbackForTest,
    });
    if (!validated) return null;
    const response = await options.fetchImpl(validated, {
      method: 'GET',
      redirect: 'manual',
      headers,
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) return null;
      try {
        currentUrl = new URL(location, validated).toString();
      } catch {
        return null;
      }
      continue;
    }
    return { response, finalUrl: validated };
  }
  return null;
}

async function fetchYoutubeOEmbed(
  videoUrl: string,
  videoId: string,
  options: Required<Pick<FetchLinkPreviewOptions, 'fetchImpl' | 'timeoutMs' | 'maxBytes' | 'allowLoopbackForTest'>>
): Promise<Partial<ResearchLinkPreview>> {
  const fallbackThumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  try {
    const res = await fetchWithSafeRedirects(
      oembedUrl,
      { 'User-Agent': BAGLIB_USER_AGENT, Accept: 'application/json' },
      options
    );
    if (!res || !res.response.ok) {
      return { image: fallbackThumb };
    }
    const text = await readBoundedText(res.response, options.maxBytes);
    const json = JSON.parse(text) as {
      title?: unknown;
      author_name?: unknown;
      author_url?: unknown;
      thumbnail_url?: unknown;
    };
    const title = typeof json.title === 'string' && json.title.trim() ? json.title.trim() : null;
    const creator = typeof json.author_name === 'string' && json.author_name.trim() ? json.author_name.trim() : null;
    const creatorUrl =
      typeof json.author_url === 'string' && allowedLinkPreviewUrl(json.author_url, options)
        ? json.author_url.trim()
        : null;
    const thumb =
      typeof json.thumbnail_url === 'string' && allowedLinkPreviewUrl(json.thumbnail_url, options)
        ? json.thumbnail_url.trim()
        : fallbackThumb;
    return {
      title,
      description: creator,
      image: thumb,
      creator,
      creatorUrl,
    };
  } catch {
    return { image: fallbackThumb, title: null, description: null, icon: null, creator: null };
  }
}

async function fetchVimeoOEmbed(
  videoUrl: string,
  options: Required<Pick<FetchLinkPreviewOptions, 'fetchImpl' | 'timeoutMs' | 'maxBytes' | 'allowLoopbackForTest'>>
): Promise<Partial<ResearchLinkPreview>> {
  const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`;
  try {
    const res = await fetchWithSafeRedirects(
      oembedUrl,
      { 'User-Agent': BAGLIB_USER_AGENT, Accept: 'application/json' },
      options
    );
    if (!res || !res.response.ok) return {};
    const text = await readBoundedText(res.response, options.maxBytes);
    const json = JSON.parse(text) as {
      title?: unknown;
      description?: unknown;
      author_name?: unknown;
      thumbnail_url?: unknown;
    };
    const title = typeof json.title === 'string' && json.title.trim() ? json.title.trim() : null;
    const desc =
      typeof json.description === 'string' && json.description.trim()
        ? json.description.replace(/\s+/gu, ' ').trim().slice(0, 400)
        : typeof json.author_name === 'string' && json.author_name.trim()
          ? json.author_name.trim()
          : null;
    const image =
      typeof json.thumbnail_url === 'string' && allowedLinkPreviewUrl(json.thumbnail_url, options)
        ? json.thumbnail_url.trim()
        : null;
    return { title, description: desc, image };
  } catch {
    return {};
  }
}

/**
 * Safely fetches link preview metadata (`title`, `description`, `icon`, `image`) in the main process
 * behind an http/https allow-list, timeout, and size cap. Never throws when offline or unreachable.
 */
export async function fetchResearchLinkPreview(
  rawUrl: unknown,
  opts: FetchLinkPreviewOptions = {}
): Promise<ResearchLinkPreview> {
  const allowLoopbackForTest =
    opts.allowLoopbackForTest ?? process.env.BAGLIB_ALLOW_LOOPBACK_LINK_PREVIEW === '1';
  const validated = allowedLinkPreviewUrl(rawUrl, { allowLoopbackForTest });
  if (!validated) return { ...EMPTY_PREVIEW };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? LINK_PREVIEW_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? LINK_PREVIEW_MAX_BYTES;
  const internalOpts = { fetchImpl, timeoutMs, maxBytes, allowLoopbackForTest };

  const youtubeId = extractYoutubeVideoId(validated);
  if (youtubeId) {
    const ytData = await fetchYoutubeOEmbed(validated, youtubeId, internalOpts);
    return {
      title: ytData.title ?? null,
      description: ytData.description ?? null,
      icon: 'https://www.youtube.com/favicon.ico',
      image: ytData.image ?? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      creator: ytData.creator ?? null,
      creatorUrl: ytData.creatorUrl ?? null,
    };
  }

  const vimeoId = extractVimeoVideoId(validated);
  if (vimeoId) {
    const vimeoData = await fetchVimeoOEmbed(validated, internalOpts);
    if (vimeoData.title || vimeoData.image) {
      return {
        title: vimeoData.title ?? null,
        description: vimeoData.description ?? null,
        icon: 'https://vimeo.com/favicon.ico',
        image: vimeoData.image ?? null,
      };
    }
  }

  try {
    const result = await fetchWithSafeRedirects(
      validated,
      {
        'User-Agent': BAGLIB_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en-US,en;q=0.9',
      },
      internalOpts
    );
    if (!result || !result.response.ok) return { ...EMPTY_PREVIEW };
    const contentType = (result.response.headers.get('content-type') || '').toLowerCase();
    if (
      contentType &&
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml+xml')
    ) {
      return { ...EMPTY_PREVIEW };
    }
    const html = await readBoundedText(result.response, maxBytes);
    return parseHtmlLinkPreview(html, result.finalUrl);
  } catch {
    return { ...EMPTY_PREVIEW };
  }
}
