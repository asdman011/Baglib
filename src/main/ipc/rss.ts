import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { SqliteSettingsRepository } from '../database/repositories/settings.repository';
import { mergeItems, parseFeed, validateFeedUrl, validateFeeds, RSS_FEEDS_KEY, RSS_MAX_BYTES, RSS_MAX_FEEDS, type ParsedFeed, type RssFeed } from '../../shared/rss';

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

export function setupRssIpc(): void {
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
