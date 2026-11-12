/**
 * KEY-50: registered RSS and Atom feeds. Parsing is deliberately small and dependency-free: it reads the
 * elements BagLib shows (feed title, item title, link, date, summary) and keeps the feed's text exact,
 * apart from decoding XML entities and stripping markup from summaries.
 */
export interface RssFeed { id: string; url: string; title: string; addedAt: string }
export interface RssItem { id: string; feedId: string; feedTitle: string; title: string; link: string; date: string | null; summary: string }
export interface ParsedFeed { title: string; items: Omit<RssItem, 'feedId' | 'feedTitle'>[] }

export const RSS_FEEDS_KEY = 'rss.feeds.v1';
export const RSS_MAX_FEEDS = 50;
export const RSS_MAX_ITEMS_PER_FEED = 30;
export const RSS_MAX_BYTES = 2 * 1024 * 1024;
const SUMMARY_LIMIT = 400;

export function validateFeedUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid-request');
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) throw new Error('invalid-request');
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error('invalid-request'); }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) throw new Error('invalid-request');
  return url.toString();
}

export function validateFeeds(value: unknown): RssFeed[] {
  if (!Array.isArray(value)) return [];
  return value.filter((feed): feed is RssFeed => !!feed && typeof feed === 'object'
    && typeof (feed as RssFeed).id === 'string' && typeof (feed as RssFeed).url === 'string'
    && typeof (feed as RssFeed).title === 'string' && typeof (feed as RssFeed).addedAt === 'string').slice(0, RSS_MAX_FEEDS);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/giu, (match, name: string) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

/** Text of an element: CDATA kept as written, otherwise entities decoded. */
function textOf(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/u.exec(raw);
  return (cdata ? cdata[1] : decodeEntities(raw)).trim();
}

function firstElement(xml: string, names: string[]): string | null {
  for (const name of names) {
    const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'iu').exec(xml);
    if (match) return textOf(match[1]);
  }
  return null;
}

function plainSummary(html: string): string {
  const text = decodeEntities(html.replace(/<(script|style)[\s\S]*?<\/\1>/giu, ' ').replace(/<[^>]+>/gu, ' ')).replace(/\s+/gu, ' ').trim();
  return text.length > SUMMARY_LIMIT ? text.slice(0, SUMMARY_LIMIT).trimEnd() + '…' : text;
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function atomLink(entry: string, base: string): string {
  const links = [...entry.matchAll(/<link\b([^>]*)\/?>/giu)].map(match => match[1]);
  const preferred = links.find(attrs => /rel=["']alternate["']/iu.test(attrs)) ?? links.find(attrs => !/rel=/iu.test(attrs)) ?? links[0];
  const href = preferred ? /href=["']([^"']+)["']/iu.exec(preferred)?.[1] : undefined;
  return href ? absolute(decodeEntities(href), base) : '';
}

function absolute(link: string, base: string): string {
  try {
    const url = new URL(link.trim(), base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch { return ''; }
}

export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  if (typeof xml !== 'string' || !/<(rss|feed|rdf:RDF)\b/iu.test(xml)) throw new Error('not-a-feed');
  const atom = /<feed\b/iu.test(xml) && !/<rss\b/iu.test(xml);
  const blocks = atom ? [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/giu)].map(match => match[1])
    : [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/giu)].map(match => match[1]);
  const head = xml.replace(/<(item|entry)\b[\s\S]*?<\/\1>/giu, '');
  const title = firstElement(head, ['title']) || new URL(feedUrl).hostname;
  const items = blocks.slice(0, RSS_MAX_ITEMS_PER_FEED).map((block, index) => {
    const link = atom ? atomLink(block, feedUrl) : absolute(firstElement(block, ['link']) ?? '', feedUrl);
    const guid = firstElement(block, atom ? ['id'] : ['guid']);
    const itemTitle = firstElement(block, ['title']) ?? '';
    const date = isoDate(firstElement(block, atom ? ['updated', 'published'] : ['pubDate', 'dc:date', 'published']));
    const summary = plainSummary(firstElement(block, atom ? ['summary', 'content'] : ['description', 'content:encoded', 'summary']) ?? '');
    return { id: guid || link || `${feedUrl}#${index}`, title: itemTitle || link, link, date, summary };
  }).filter(item => item.title);
  return { title, items };
}

/** Newest first; items without a date keep feed order after dated ones. */
export function mergeItems(feeds: { feed: RssFeed; parsed: ParsedFeed }[], limit = 60): RssItem[] {
  const all = feeds.flatMap(({ feed, parsed }) => parsed.items.map(item => ({ ...item, feedId: feed.id, feedTitle: feed.title || parsed.title })));
  const seen = new Set<string>();
  return all.filter(item => { const key = item.feedId + '\u0000' + item.id; if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => (b.date ? Date.parse(b.date) : -Infinity) - (a.date ? Date.parse(a.date) : -Infinity))
    .slice(0, limit);
}

/** KEY-50 follow-up: opt-in notifications for new feed items. */
export const RSS_NOTIFY_KEY = 'rss.notify.v1';
export const RSS_SEEN_KEY = 'rss.seen.v1';
const SEEN_LIMIT = 3000;
export const itemKey = (item: Pick<RssItem, 'feedId' | 'id'>) => item.feedId + '\u0000' + item.id;

/**
 * New items per feed. A feed seen for the first time only records its items, so adding a feed
 * or turning notifications on never floods the user with its whole history.
 */
export function unseenItems(items: RssItem[], seen: string[]): { fresh: Map<string, RssItem[]>; seen: string[] } {
  const known = new Set(seen);
  const knownFeeds = new Set(seen.map(key => key.split('\u0000')[0]));
  const fresh = new Map<string, RssItem[]>();
  for (const item of items) {
    if (known.has(itemKey(item)) || !knownFeeds.has(item.feedId)) continue;
    fresh.set(item.feedId, [...(fresh.get(item.feedId) ?? []), item]);
  }
  const next = [...new Set([...items.map(itemKey), ...seen])].slice(0, SEEN_LIMIT);
  return { fresh, seen: next };
}
