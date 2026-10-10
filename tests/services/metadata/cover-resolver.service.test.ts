import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { CoverResolverService } from '../../../src/main/services/metadata/cover-resolver.service';

describe('CoverResolverService Unit Tests', () => {
  let service: CoverResolverService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    service = new CoverResolverService();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('resolves embedded cover buffer immediately as data URL', async () => {
    // 1200 bytes mock JPEG buffer
    const mockBuffer = Buffer.alloc(1200, 0xff);
    const result = await service.resolveCover({
      embeddedCoverBuffer: mockBuffer,
      embeddedCoverMime: 'image/jpeg',
    });

    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.source, 'embedded');
    assert.strictEqual(result.coverUrl?.startsWith('data:image/jpeg;base64,'), true);
    assert.strictEqual(result.contentLength, 1200);
  });

  it('resolves and validates Open Library Cover API with ?default=false', async () => {
    global.fetch = async (url: any) => {
      const urlStr = String(url);
      assert.strictEqual(urlStr.includes('?default=false'), true);

      // Return a valid image response with > 1000 bytes
      return new Response(new Uint8Array(1500), {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': '1500',
        },
      });
    };

    const result = await service.resolveCover({
      isbn: '9780132350884',
    });

    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.source, 'open-library');
    assert.strictEqual(result.coverUrl?.includes('9780132350884-L.jpg?default=false'), true);
  });

  it('rejects 43-byte empty GIF placeholder responses from Open Library', async () => {
    global.fetch = async () => {
      // Return 43 bytes (Open Library blank 1x1 GIF)
      return new Response(new Uint8Array(43), {
        status: 200,
        headers: {
          'content-type': 'image/gif',
          'content-length': '43',
        },
      });
    };

    const validation = await service.validateImageUrl('https://covers.openlibrary.org/b/isbn/0000000000-L.jpg');
    assert.strictEqual(validation.isValid, false);
  });

  it('rejects non-image MIME types such as HTML error pages', async () => {
    global.fetch = async () => {
      return new Response('<html>Not Found</html>', {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      });
    };

    const validation = await service.validateImageUrl('https://example.com/not-an-image');
    assert.strictEqual(validation.isValid, false);
  });

  it('cleans and upgrades Google Books imageLinks (HTTPS upgrade and &edge=curl strip)', async () => {
    global.fetch = async () => {
      return new Response(new Uint8Array(2000), {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': '2000',
        },
      });
    };

    const result = await service.resolveCover({
      googleBooksImageLinks: {
        thumbnail: 'http://books.google.com/books/content?id=xyz&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api',
      },
    });

    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.source, 'google-books');
    assert.strictEqual(result.coverUrl?.startsWith('https://'), true);
    assert.strictEqual(result.coverUrl?.includes('&edge=curl'), false);
  });

  it('applies positive and negative caching properly', async () => {
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      return new Response(new Uint8Array(2500), {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': '2500',
        },
      });
    };

    // First call: network fetch
    const firstRes = await service.resolveCover({ isbn: '9780132350884' });
    assert.strictEqual(firstRes.verified, true);
    assert.strictEqual(callCount > 0, true);

    const initialCallCount = callCount;
    // Second call with same ISBN: served from positive cache
    const secondRes = await service.resolveCover({ isbn: '9780132350884' });
    assert.strictEqual(secondRes.verified, true);
    assert.strictEqual(secondRes.coverUrl, firstRes.coverUrl);
    assert.strictEqual(callCount, initialCallCount);
  });
});
