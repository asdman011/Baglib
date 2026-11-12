import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities, mergeItems, parseFeed, validateFeedUrl, validateFeeds } from '../../src/shared/rss';

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
  <title>مكتبة المصطفى — الإصدارات الجديدة</title>
  <item><title><![CDATA[صَحِيحُ البُخَارِيِّ — طبعة جديدة]]></title><link>/books/1</link><guid>b1</guid>
    <pubDate>Tue, 10 Nov 2026 08:00:00 GMT</pubDate><description>&lt;p&gt;تحقيق &amp; تعليق: &lt;b&gt;مصطفى&lt;/b&gt;&lt;/p&gt;</description></item>
  <item><title>Library news &amp; events</title><link>https://example.org/news?id=2&amp;x=1</link>
    <pubDate>Wed, 11 Nov 2026 09:30:00 GMT</pubDate><description>Plain text</description></item>
  <item><title>Unsafe link</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

const atom = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Open Library — New arrivals</title>
  <entry><title>The Muqaddimah</title><id>urn:uuid:1</id><updated>2026-11-12T10:00:00Z</updated>
    <link rel="self" href="https://example.org/self"/><link rel="alternate" href="https://example.org/muqaddimah"/>
    <summary type="html">&lt;i&gt;Ibn Khaldun&lt;/i&gt; &#8212; history</summary></entry>
</feed>`;

test('RSS 2.0: feed title, CDATA kept exact, entities decoded, relative links resolved, unsafe links dropped', () => {
  const feed = parseFeed(rss, 'https://library.example/feed.xml');
  assert.equal(feed.title, 'مكتبة المصطفى — الإصدارات الجديدة');
  assert.equal(feed.items[0].title, 'صَحِيحُ البُخَارِيِّ — طبعة جديدة', 'Arabic with diacritics unchanged');
  assert.equal(feed.items[0].link, 'https://library.example/books/1');
  assert.equal(feed.items[0].summary, 'تحقيق & تعليق: مصطفى');
  assert.equal(feed.items[0].date, '2026-11-10T08:00:00.000Z');
  assert.equal(feed.items[1].title, 'Library news & events');
  assert.equal(feed.items[1].link, 'https://example.org/news?id=2&x=1');
  assert.equal(feed.items[2].link, '', 'javascript: links are never kept');
});

test('Atom: alternate link, updated date, HTML summary flattened', () => {
  const feed = parseFeed(atom, 'https://example.org/atom');
  assert.equal(feed.title, 'Open Library — New arrivals');
  assert.deepEqual(feed.items.map(item => [item.title, item.link, item.date, item.summary]), [['The Muqaddimah', 'https://example.org/muqaddimah', '2026-11-12T10:00:00.000Z', 'Ibn Khaldun — history']]);
});

test('non-feeds are refused and URLs are validated', () => {
  assert.throws(() => parseFeed('<html><body>hi</body></html>', 'https://x.example/'), /not-a-feed/);
  assert.equal(validateFeedUrl(' https://library.example/feed.xml '), 'https://library.example/feed.xml');
  for (const bad of ['', 'ftp://x/feed', 'file:///c:/feed.xml', 'javascript:alert(1)', 'https://user:pass@x.example/', 42, 'x'.repeat(2001)]) assert.throws(() => validateFeedUrl(bad), /invalid-request/, String(bad));
  assert.deepEqual(validateFeeds([{ id: 'a', url: 'https://a/', title: 'A', addedAt: '2026' }, { id: 1 }, null]), [{ id: 'a', url: 'https://a/', title: 'A', addedAt: '2026' }]);
  assert.equal(decodeEntities('&#x627;&#1576;&unknown;'), 'اب&unknown;');
});

test('items merge newest first and keep their feed as the source', () => {
  const a = { feed: { id: 'a', url: 'https://a/', title: 'Feed A', addedAt: '' }, parsed: parseFeed(rss, 'https://a/') };
  const b = { feed: { id: 'b', url: 'https://b/', title: '', addedAt: '' }, parsed: parseFeed(atom, 'https://b/') };
  const merged = mergeItems([a, b]);
  assert.deepEqual(merged.slice(0, 3).map(item => [item.title, item.feedTitle]), [
    ['The Muqaddimah', 'Open Library — New arrivals'],
    ['Library news & events', 'Feed A'],
    ['صَحِيحُ البُخَارِيِّ — طبعة جديدة', 'Feed A'],
  ]);
  assert.equal(merged.at(-1)?.date, null, 'undated items come last');
});

import { unseenItems } from '../../src/shared/rss';
import { translations } from '../../src/renderer/translations';

// KEY-50 follow-up: notify only about items that arrived since the last check.
test('a feed seen for the first time is only remembered; later items are reported once', () => {
  const item = (feedId: string, id: string) => ({ id, feedId, feedTitle: feedId, title: id, link: '', date: null, summary: '' });
  const first = unseenItems([item('a', '1'), item('a', '2')], []);
  assert.equal(first.fresh.size, 0, 'no flood when a feed is first seen');
  const second = unseenItems([item('a', '3'), item('a', '1'), item('a', '2'), item('b', 'x')], first.seen);
  assert.deepEqual([...second.fresh.entries()].map(([feed, items]) => [feed, items.map(entry => entry.id)]), [['a', ['3']]]);
  const third = unseenItems([item('a', '3'), item('b', 'x'), item('b', 'y')], second.seen);
  assert.deepEqual([...third.fresh.entries()].map(([feed, items]) => [feed, items.map(entry => entry.id)]), [['b', ['y']]]);
});

test('the notification body has every Arabic plural form', () => {
  for (const key of ['rssNotifyMany_two', 'rssNotifyMany_few', 'rssNotifyMany_many', 'rssNotifyMany_other', 'rssNotifyOne', 'rssNotifyTitle', 'settingRss', 'settingRssDescription'] as const) {
    assert.ok(translations.ar[key] && translations.en[key], key);
  }
  assert.equal(translations.ar.rssNotifyMany_two.includes('عنصران'), true);
  assert.equal(translations.ar.rssNotifyMany_many.includes('عنصرًا'), true);
});
