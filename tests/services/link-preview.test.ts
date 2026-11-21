import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedLinkPreviewUrl,
  extractVimeoVideoId,
  extractYoutubeVideoId,
  isPrivateOrLocalHostname,
  parseHtmlLinkPreview,
} from '../../src/shared/link-preview';
import { fetchResearchLinkPreview } from '../../src/main/services/link-preview.service';

describe('KEY-450 link preview allow-list & parser', () => {
  it('allows public http and https URLs and rejects unsafe schemes, credentials, and private/local hosts', () => {
    assert.equal(
      allowedLinkPreviewUrl('https://example.com/path?q=1#frag'),
      'https://example.com/path?q=1#frag'
    );
    assert.equal(
      allowedLinkPreviewUrl('  http://scholarly.example.org/book  '),
      'http://scholarly.example.org/book'
    );

    // Unsafe schemes
    assert.equal(allowedLinkPreviewUrl('file:///C:/Windows/win.ini'), null);
    assert.equal(allowedLinkPreviewUrl('javascript:alert(1)'), null);
    assert.equal(allowedLinkPreviewUrl('data:text/html,<h1>hi</h1>'), null);
    assert.equal(allowedLinkPreviewUrl('baglib://work/123'), null);
    assert.equal(allowedLinkPreviewUrl('note:abc'), null);

    // Credentials and control characters
    assert.equal(allowedLinkPreviewUrl('https://user:pass@example.com/'), null);
    assert.equal(allowedLinkPreviewUrl('https://example.com/\u0000bad'), null);

    // Loopback, RFC1918, link-local, and local domains
    for (const blocked of [
      'http://localhost:3000/test',
      'http://127.0.0.1:8080/api',
      'http://10.0.0.5/internal',
      'http://192.168.1.10/admin',
      'http://172.16.0.1/secret',
      'http://172.31.255.255/secret',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]:8000/',
      'https://printer.local/status',
      'https://db.internal/query',
    ]) {
      assert.equal(allowedLinkPreviewUrl(blocked), null, `expected ${blocked} to be rejected`);
    }

    // 172.32.x.x is public
    assert.equal(
      allowedLinkPreviewUrl('https://172.32.0.1/public'),
      'https://172.32.0.1/public'
    );

    // Loopback allowed only when allowLoopbackForTest is enabled
    assert.equal(
      allowedLinkPreviewUrl('http://127.0.0.1:19876/page', { allowLoopbackForTest: true }),
      'http://127.0.0.1:19876/page'
    );
    assert.equal(isPrivateOrLocalHostname('127.0.0.1'), true);
    assert.equal(isPrivateOrLocalHostname('127.0.0.1', { allowLoopbackForTest: true }), false);
  });

  it('extracts YouTube and Vimeo video IDs from watch, short, embed, and channel URLs', () => {
    assert.equal(
      extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      'dQw4w9WgXcQ'
    );
    assert.equal(
      extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=42'),
      'dQw4w9WgXcQ'
    );
    assert.equal(
      extractYoutubeVideoId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'),
      'dQw4w9WgXcQ'
    );
    assert.equal(
      extractYoutubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
      'dQw4w9WgXcQ'
    );
    assert.equal(extractYoutubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), null);

    assert.equal(extractVimeoVideoId('https://vimeo.com/76979871'), '76979871');
    assert.equal(extractVimeoVideoId('https://player.vimeo.com/video/76979871'), '76979871');
    assert.equal(
      extractVimeoVideoId('https://vimeo.com/channels/staffpicks/76979871'),
      '76979871'
    );
    assert.equal(extractVimeoVideoId('https://example.com/76979871'), null);
  });

  it('parses OpenGraph, Twitter, and fallback HTML metadata in Arabic and English', () => {
    const html = `
      <!doctype html>
      <html lang="ar" dir="rtl">
        <head>
          <meta property="og:title" content="مخطوطات المكتبة &amp; تحقيق النصوص" />
          <meta name="twitter:description" content="دراسة تحليلية في فهرسة المخطوطات العربية" />
          <meta content="/assets/cover-thumb.png" property="og:image" />
          <link rel="shortcut icon" href="/static/favicon.png" />
        </head>
        <body><h1>مخطوطات</h1></body>
      </html>
    `;
    const parsed = parseHtmlLinkPreview(html, 'https://manuscripts.example.org/articles/42');
    assert.equal(parsed.title, 'مخطوطات المكتبة & تحقيق النصوص');
    assert.equal(parsed.description, 'دراسة تحليلية في فهرسة المخطوطات العربية');
    assert.equal(parsed.image, 'https://manuscripts.example.org/assets/cover-thumb.png');
    assert.equal(parsed.icon, 'https://manuscripts.example.org/static/favicon.png');

    // Fallback to <title>, <meta name="description">, first <img>, and default /favicon.ico
    const fallbackHtml = `
      <html>
        <head>
          <title>   BagLib Research Notes &#39;2026&#39; </title>
          <meta name="description" content="Critical apparatus &amp; source comparison." />
        </head>
        <body>
          <img src="images/hero.jpg" alt="Hero" />
        </body>
      </html>
    `;
    const fallback = parseHtmlLinkPreview(
      fallbackHtml,
      'https://notes.example.com/docs/intro.html'
    );
    assert.equal(fallback.title, "BagLib Research Notes '2026'");
    assert.equal(fallback.description, 'Critical apparatus & source comparison.');
    assert.equal(fallback.image, 'https://notes.example.com/docs/images/hero.jpg');
    assert.equal(fallback.icon, null);

    // YouTube fallback thumbnail when og:image is absent
    const ytFallback = parseHtmlLinkPreview(
      '<html><head><title>Lecture</title></head></html>',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
    assert.equal(ytFallback.image, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });

  it('fetches metadata in main with size cap, redirect allow-list validation, and graceful offline fallback', async () => {
    // 1. Disallowed URL returns null fields without throwing
    const blocked = await fetchResearchLinkPreview('http://127.0.0.1:9999/secret');
    assert.deepEqual(blocked, {
      title: null,
      description: null,
      icon: null,
      image: null,
    });

    // 2. Redirect to private/loopback IP is blocked
    const redirectBlocked = await fetchResearchLinkPreview('https://public.example.com/start', {
      fetchImpl: (async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1:8080/internal' },
        })) as typeof fetch,
    });
    assert.equal(redirectBlocked.title, null);
    assert.equal(redirectBlocked.image, null);

    // 3. Oversized HTML response is truncated at maxBytes and still parses head metadata
    const bigTail = 'x'.repeat(64 * 1024);
    const htmlWithBigTail =
      '<html><head><meta property="og:title" content="Bounded Title"/><meta property="og:image" content="https://public.example.com/thumb.png"/></head><body>' +
      bigTail +
      '</body></html>';
    const bounded = await fetchResearchLinkPreview('https://public.example.com/post', {
      maxBytes: 4096,
      fetchImpl: (async () =>
        new Response(htmlWithBigTail, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })) as typeof fetch,
    });
    assert.equal(bounded.title, 'Bounded Title');
    assert.equal(bounded.image, 'https://public.example.com/thumb.png');

    // 4. YouTube oEmbed populates title, creator, and thumbnail image
    const yt = await fetchResearchLinkPreview(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      {
        fetchImpl: (async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('youtube.com/oembed')) {
            return new Response(
              JSON.stringify({
                title: 'Arabic Manuscript Paleography Lecture',
                author_name: 'BagLib Academy',
                author_url: 'https://www.youtube.com/@baglib',
                thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            );
          }
          return new Response('', { status: 404 });
        }) as typeof fetch,
      }
    );
    assert.equal(yt.title, 'Arabic Manuscript Paleography Lecture');
    assert.equal(yt.creator, 'BagLib Academy');
    assert.equal(yt.image, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');

    // 5. Offline failure falls back gracefully without throwing
    const offline = await fetchResearchLinkPreview('https://public.example.com/offline', {
      fetchImpl: (async () => {
        throw new Error('getaddrinfo ENOTFOUND public.example.com');
      }) as typeof fetch,
    });
    assert.equal(offline.title, null);
    assert.equal(offline.image, null);
  });
});
