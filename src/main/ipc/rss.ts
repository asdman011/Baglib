import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { SqliteSettingsRepository } from '../database/repositories/settings.repository';
import { itemKey, mergeItems, parseFeed, unseenItems, validateFeedUrl, validateFeeds, RSS_FEEDS_KEY, RSS_MAX_BYTES, RSS_MAX_FEEDS, RSS_NOTIFY_KEY, RSS_SEEN_KEY, type ParsedFeed, type RssFeed, type RssItem } from '../../shared/rss';
import { notificationLanguage, notificationService } from './notifications';
import { translations } from '../../renderer/translations';

/** KEY-50: feeds the user registers. Only the app's own main frame may manage them. */
function authorize(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new Error('invalid-request');
  const url = new URL(frame.url);
  if (url.username || url.password || !(url.protocol === 'app:' && url.hostname === '-' || url.protocol === 'file:' && !url.hostname || url.origin === 'http://localhost:3000')) throw new Error('invalid-request');
}

const settings = () => new SqliteSettingsRepository();
const feeds = (): RssFeed[] => validateFeeds(settings().get(RSS_FEEDS_KEY, []));

/** Fetch one feed with a time limit and a size cap; nothing is stored but the feed's address and title. */
export async function fetchFeed(url: string, fetcher: typeof fetch = fetch): Promise<ParsedFeed> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetcher(url, { signal: controller.signal, redirect: 'follow', headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' } });
    if (!response.ok) throw new Error('feed-unavailable');
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > RSS_MAX_BYTES) throw new Error('feed-too-large');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > RSS_MAX_BYTES) throw new Error('feed-too-large');
    return parseFeed(new TextDecoder('utf-8').decode(bytes), url);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    throw new Error(['not-a-feed', 'feed-too-large', 'feed-unavailable'].includes(message) ? message : 'feed-unavailable');
  } finally { clearTimeout(timer); }
}

/** The notification text, with Arabic plural forms. */
export function rssNotifyBody(language: 'ar' | 'en', count: number, title: string): string {
  const words = translations[language];
  if (count === 1) return words.rssNotifyOne.replace('{title}', title);
  const form = new Intl.PluralRules(language).select(count);
  const key = (form === 'two' || form === 'few' || form === 'many' ? `rssNotifyMany_${form}` : 'rssNotifyMany_other') as 'rssNotifyMany_other';
  return words[key].replace('{count}', new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-US').format(count)).replace('{title}', title);
}

function rememberSeen(items: RssItem[]): void {
  const seen = settings().get<string[]>(RSS_SEEN_KEY, []) ?? [];
  settings().set(RSS_SEEN_KEY, [...new Set([...items.map(itemKey), ...seen])].slice(0, 3000));
}

/** One background pass: fetch every feed, notify per feed about items not seen before. */
export async function checkFeedsForNews(fetcher: typeof fetch = fetch): Promise<number> {
  if (settings().get<boolean>(RSS_NOTIFY_KEY, false) !== true) return 0;
  const list = feeds();
  const results = await Promise.all(list.map(async feed => { try { return { feed, parsed: await fetchFeed(feed.url, fetcher) }; } catch { return null; } }));
  const fetched = results.filter((result): result is { feed: RssFeed; parsed: ParsedFeed } => !!result);
  const { fresh, seen } = unseenItems(mergeItems(fetched, 1000), settings().get<string[]>(RSS_SEEN_KEY, []) ?? []);
  settings().set(RSS_SEEN_KEY, seen);
  const words = translations[notificationLanguage()];
  for (const [feedId, items] of fresh) {
    const feed = list.find(entry => entry.id === feedId);
    if (!feed) continue;
    notificationService.publish({
      key: 'rss:' + itemKey(items[0]), kind: 'rss', target: 'library',
      title: words.rssNotifyTitle.replace('{feed}', feed.title),
      body: rssNotifyBody(notificationLanguage(), items.length, items[0].title),
    });
  }
  return [...fresh.values()].reduce((sum, items) => sum + items.length, 0);
}

let watcher: ReturnType<typeof setInterval> | null = null;
/** Checks two minutes after start, then every two hours, while the app runs. */
export function startRssWatcher(intervalMs = 2 * 60 * 60 * 1000): void {
  if (watcher) return;
  const run = () => { void checkFeedsForNews().catch(error => console.warn('[baglib:rss] background check failed', error)); };
  setTimeout(run, 2 * 60 * 1000).unref?.();
  watcher = setInterval(run, intervalMs);
  watcher.unref?.();
}

export function setupRssIpc(): void {
  startRssWatcher();
  ipcMain.handle('rss:check-now', async event => { authorize(event); return checkFeedsForNews(); });
  ipcMain.handle('rss:list', event => { authorize(event); return feeds(); });
  ipcMain.handle('rss:add', async (event, value: unknown) => {
    authorize(event);
    const url = validateFeedUrl(value);
    const current = feeds();
    if (current.some(feed => feed.url === url)) throw new Error('feed-exists');
    if (current.length >= RSS_MAX_FEEDS) throw new Error('invalid-request');
    const parsed = await fetchFeed(url);
    const feed: RssFeed = { id: randomUUID(), url, title: parsed.title.slice(0, 300), addedAt: new Date().toISOString() };
    settings().set(RSS_FEEDS_KEY, [...current, feed]);
    // What the feed already holds is not news: remember it so a later check only reports newer items.
    rememberSeen(mergeItems([{ feed, parsed }], 1000));
    return feed;
  });
  ipcMain.handle('rss:remove', (event, id: unknown) => {
    authorize(event);
    if (typeof id !== 'string') throw new Error('invalid-request');
    settings().set(RSS_FEEDS_KEY, feeds().filter(feed => feed.id !== id));
    return true;
  });
  ipcMain.handle('rss:items', async event => {
    authorize(event);
    const results = await Promise.all(feeds().map(async feed => {
      try { return { feed, parsed: await fetchFeed(feed.url) }; } catch (error) { return { feed, error: error instanceof Error ? error.message : 'feed-unavailable' }; }
    }));
    return {
      items: mergeItems(results.filter((result): result is { feed: RssFeed; parsed: ParsedFeed } => 'parsed' in result)),
      failed: results.filter((result): result is { feed: RssFeed; error: string } => 'error' in result).map(result => ({ feedId: result.feed.id, error: result.error })),
    };
  });
}
