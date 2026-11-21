/**
 * Shared link-preview URL validation and HTML metadata parser (KEY-450).
 *
 * Used by the main-process link-preview handler for the research editor so link embeds
 * and bookmark cards can display title, description, favicon, and thumbnail image
 * without exposing unrestricted network fetches in the renderer.
 */

export interface ResearchLinkPreview {
  title: string | null;
  description: string | null;
  icon: string | null;
  image: string | null;
  creator?: string | null;
  creatorUrl?: string | null;
}

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/u;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

/** Returns true if a hostname is localhost, loopback, or a private/link-local IP literal. */
export function isPrivateOrLocalHostname(
  hostname: string,
  options?: { allowLoopbackForTest?: boolean }
): boolean {
  const lower = hostname.toLowerCase().replace(/\.$/u, '');
  if (!lower) return true;
  if (
    options?.allowLoopbackForTest &&
    (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1' || lower === '[::1]')
  ) {
    return false;
  }
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower === '0.0.0.0' ||
    lower === '::' ||
    lower === '::1' ||
    lower === '[::]' ||
    lower === '[::1]'
  ) {
    return true;
  }
  const bracketStripped = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
  if (bracketStripped === '::1' || bracketStripped === '::' || /^fe80:/iu.test(bracketStripped) || /^fc00:/iu.test(bracketStripped) || /^fd[0-9a-f]{2}:/iu.test(bracketStripped)) {
    return true;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(lower);
  if (ipv4) {
    const [a, b, c, d] = ipv4.slice(1).map(Number);
    if ([a, b, c, d].some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

/**
 * Validates that a URL is an external http: or https: URL suitable for main-process metadata fetching.
 * Rejects non-http(s) schemes, credentials, control characters, and private/loopback addresses.
 */
export function allowedLinkPreviewUrl(
  raw: unknown,
  options?: { allowLoopbackForTest?: boolean }
): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048 || /[\u0000-\u0020\u007f]/u.test(trimmed)) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password || !parsed.hostname) return null;
  if (isPrivateOrLocalHostname(parsed.hostname, options)) return null;
  return parsed.toString();
}

/** Extracts an 11-character YouTube video ID from a watch, short, or embed URL. */
export function extractYoutubeVideoId(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = parts[0] ?? null;
  } else if (parsed.pathname.replace(/\/+$/u, '') === '/watch') {
    candidate = parsed.searchParams.get('v') ?? parsed.searchParams.get('V');
  } else if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) {
    candidate = parts[1] ?? null;
  }
  return candidate && YOUTUBE_ID_RE.test(candidate) ? candidate : null;
}

/** Extracts a numeric Vimeo video ID from a Vimeo video or player URL. */
export function extractVimeoVideoId(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();
  if (!VIMEO_HOSTS.has(host)) return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  const id = parts.find(part => /^\d{1,12}$/u.test(part));
  return id ?? null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/gu, (_m, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : _m;
    })
    .replace(/&#x([0-9a-fA-F]+);/gu, (_m, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : _m;
    })
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&');
}

function cleanText(raw: string | null | undefined, maxLength = 400): string | null {
  if (!raw) return null;
  const collapsed = decodeHtmlEntities(raw).replace(/\s+/gu, ' ').trim();
  if (!collapsed) return null;
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1).trimEnd()}…` : collapsed;
}

function resolveHttpAssetUrl(raw: string | null | undefined, baseUrl: string): string | null {
  if (!raw) return null;
  const cleaned = decodeHtmlEntities(raw).trim();
  if (!cleaned) return null;
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);/iu.test(cleaned)) {
    return cleaned.length <= 64 * 1024 ? cleaned : null;
  }
  try {
    const resolved = new URL(cleaned, baseUrl);
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') return null;
    if (resolved.username || resolved.password) return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gu;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(tag)) !== null) {
    const name = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[name] = val;
  }
  return attrs;
}

/**
 * Extracts OpenGraph / Twitter / standard HTML metadata (`title`, `description`, `image`, `icon`)
 * from an HTML document string.
 */
export function parseHtmlLinkPreview(html: string, pageUrl: string): ResearchLinkPreview {
  const headMatch = /<head[\s>][\s\S]*?<\/head>/iu.exec(html);
  const head = headMatch ? headMatch[0] : html.slice(0, 64 * 1024);

  const metaByKey = new Map<string, string>();
  const metaTagRe = /<meta\b[^>]*>/giu;
  let match: RegExpExecArray | null;
  while ((match = metaTagRe.exec(head)) !== null) {
    const attrs = parseAttributes(match[0]);
    const key = (attrs.property || attrs.name || attrs.itemprop || '').trim().toLowerCase();
    const content = attrs.content;
    if (key && typeof content === 'string' && content.trim() && !metaByKey.has(key)) {
      metaByKey.set(key, content);
    }
  }

  let iconHref: string | null = null;
  const linkTagRe = /<link\b[^>]*>/giu;
  while ((match = linkTagRe.exec(head)) !== null) {
    const attrs = parseAttributes(match[0]);
    const rel = (attrs.rel || '').toLowerCase();
    const href = attrs.href;
    if (href && /\bicon\b/u.test(rel)) {
      iconHref = href;
      if (rel === 'icon' || rel === 'shortcut icon') break;
    }
  }

  const titleTagMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/iu.exec(head);
  const rawTitle =
    metaByKey.get('og:title') ??
    metaByKey.get('twitter:title') ??
    (titleTagMatch ? titleTagMatch[1] : null);

  const rawDescription =
    metaByKey.get('og:description') ??
    metaByKey.get('twitter:description') ??
    metaByKey.get('description') ??
    null;

  let rawImage =
    metaByKey.get('og:image') ??
    metaByKey.get('og:image:url') ??
    metaByKey.get('og:image:secure_url') ??
    metaByKey.get('twitter:image') ??
    metaByKey.get('twitter:image:src') ??
    metaByKey.get('image') ??
    null;

  if (!rawImage) {
    const imgTagMatch = /<img\b[^>]*>/iu.exec(html.slice(0, 128 * 1024));
    if (imgTagMatch) {
      const attrs = parseAttributes(imgTagMatch[0]);
      if (attrs.src && !attrs.src.includes('spacer.gif')) {
        rawImage = attrs.src;
      }
    }
  }

  const youtubeId = extractYoutubeVideoId(pageUrl);
  const fallbackImage = youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : null;

  return {
    title: cleanText(rawTitle, 240),
    description: cleanText(rawDescription, 400),
    image: resolveHttpAssetUrl(rawImage, pageUrl) ?? fallbackImage,
    icon: resolveHttpAssetUrl(iconHref, pageUrl),
  };
}
