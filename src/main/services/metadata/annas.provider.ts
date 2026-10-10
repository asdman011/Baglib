/**
 * Anna's Archive Provider for Baglib
 *
 * Reverse-engineered & ported from annas-mcp-main (internal/anna/anna.go, internal/mirror/resolver.go):
 * - Multi-mirror support with health fallbacks (annas-archive.gl, annas-archive.pk, annas-archive.gd)
 * - HTML card extraction: covers, formats (PDF, EPUB, MOBI), sizes, publisher, authors, year
 * - Uses Electron net.fetch / standard fetch for resilient network requests
 */

// Safe fetch resolver that uses Electron net.fetch in Electron and global fetch in Node
const getFetch = () => {
  try {
    if (typeof process !== 'undefined' && (process.versions as any)?.electron) {
      const electron = require('electron');
      if (electron?.net?.fetch) return electron.net.fetch;
    }
  } catch {
    // Fallback to standard fetch
  }
  return fetch;
};

export interface AnnasSearchResult {
  id: string;
  title: string;
  author: string;
  publisher?: string;
  year?: number;
  language?: string;
  fileSize?: string;
  format: string;
  coverUrl?: string;
  detailUrl: string;
  downloadUrl?: string;
  md5?: string;
}

const ANNAS_MIRRORS = [
  'https://annas-archive.gl',
  'https://annas-archive.pk',
  'https://annas-archive.gd',
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export class AnnasProvider {
  private activeMirror: string = ANNAS_MIRRORS[0]!;
  private lastMirrorCheck: number = 0;
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  private cookiesInitialized: boolean = false;
  private cookieString: string = '';

  /**
   * Automatically resolves DDoS-Guard challenge using a hidden BrowserWindow,
   * extracting the rendered HTML directly from the DOM and capturing validated session cookies.
   */
  async solveChallengeWithWindow(targetUrl: string, mirror: string): Promise<string> {
    try {
      if (typeof process !== 'undefined' && (process.versions as any)?.electron) {
        const electron = require('electron');
        if (electron.BrowserWindow && electron.session) {
          return await new Promise<string>((resolve) => {
            const win = new electron.BrowserWindow({
              show: false,
              webPreferences: { offscreen: true },
            });

            let resolved = false;
            const domain = new URL(mirror).hostname;

            const cleanup = async (html = '') => {
              if (resolved) return;
              resolved = true;
              try {
                const cookies = await electron.session.defaultSession.cookies.get({ domain });
                if (cookies && cookies.length > 0) {
                  this.cookieString = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
                  if (cookies.some((c: any) => c.name === 'aa_ddg_check')) {
                    this.cookiesInitialized = true;
                  }
                }
              } catch (e) {
                console.warn('[AnnasProvider] Cookie save error:', e);
              } finally {
                try { win.destroy(); } catch {}
                resolve(html);
              }
            };

            win.webContents.on('did-finish-load', async () => {
              const title = win.getTitle();
              const currentUrl = win.webContents.getURL();
              if (
                !title.includes('DDoS-Guard') &&
                (title.includes('Search') ||
                 title.includes('Anna') ||
                 title.includes('Archive') ||
                 currentUrl.includes('/search'))
              ) {
                try {
                  const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML');
                  await cleanup(html);
                } catch {
                  await cleanup();
                }
              }
            });

            win.loadURL(targetUrl).catch(() => {});

            // Timeout in case challenge completes or takes longer
            setTimeout(async () => {
              try {
                const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML');
                await cleanup(html);
              } catch {
                await cleanup();
              }
            }, 14000);
          });
        }
      }
    } catch (err) {
      console.warn('[AnnasProvider] Error solving challenge with window:', err);
    }
    return '';
  }

  /**
   * Resolves the fastest reachable Anna's Archive mirror.
   */
  async getActiveMirror(): Promise<string> {
    const now = Date.now();
    if (this.activeMirror && now - this.lastMirrorCheck < this.CACHE_TTL_MS) {
      return this.activeMirror;
    }

    for (const mirror of ANNAS_MIRRORS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const fetchFn = getFetch();
        const res = await fetchFn(mirror, {
          method: 'HEAD',
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT },
        });
        clearTimeout(timeout);

        if (res.ok || res.status < 400 || res.status === 403) {
          this.activeMirror = mirror;
          this.lastMirrorCheck = now;
          return mirror;
        }
      } catch {
        // Fallback to next mirror
      }
    }

    this.activeMirror = ANNAS_MIRRORS[0]!;
    return this.activeMirror;
  }

  /**
   * Searches Anna's Archive for books and papers.
   */
  async search(query: string, maxResults = 25): Promise<AnnasSearchResult[]> {
    if (!query || !query.trim()) return [];

    const mirror = await this.getActiveMirror();
    const encodedQuery = encodeURIComponent(query.trim());
    const searchUrl = `${mirror}/search?q=${encodedQuery}&content=book_any`;

    // 1. If session is ready and verified, attempt fast net.fetch first
    if (this.cookiesInitialized && this.cookieString) {
      try {
        const fetchFn = getFetch();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await fetchFn(searchUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            Cookie: this.cookieString,
          },
        });
        clearTimeout(timeout);

        if (res.ok) {
          const html = await res.text();
          const items = this.parseHtml(html, mirror, maxResults);
          if (items.length > 0) return items;
        } else {
          console.warn(`[AnnasProvider] Fast fetch returned ${res.status}, falling back to background window`);
        }
      } catch (err: any) {
        console.warn('[AnnasProvider] Fast fetch error, falling back to window:', err?.message || err);
      }
    }

    // 2. Solve challenge and extract search page directly via background BrowserWindow
    this.cookiesInitialized = false;
    const windowHtml = await this.solveChallengeWithWindow(searchUrl, mirror);
    if (windowHtml && windowHtml.includes('/md5/')) {
      return this.parseHtml(windowHtml, mirror, maxResults);
    }

    // 3. Fallback net.fetch if cookies were captured
    if (this.cookieString) {
      try {
        const fetchFn = getFetch();
        const res = await fetchFn(searchUrl, {
          method: 'GET',
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            Cookie: this.cookieString,
          },
        });
        if (res.ok) {
          const html = await res.text();
          return this.parseHtml(html, mirror, maxResults);
        }
      } catch {}
    }

    return [];
  }

  /**
   * Parses Anna's Archive HTML result items into structured results.
   */
  parseHtml(html: string, baseUrl: string, maxResults = 25): AnnasSearchResult[] {
    const results: AnnasSearchResult[] = [];

    // Find links matching /md5/
    const md5Regex = /href="\/md5\/([a-fA-F0-9]{32})"/gi;
    const seenMd5s = new Set<string>();

    // Pattern to extract card blocks containing /md5/
    const cardBlocks = html.split(/<a[^>]+href="\/md5\/([a-fA-F0-9]{32})"/i);

    // Each odd index in cardBlocks is an md5, and each even index (starting from 2) is the content following it
    for (let i = 1; i < cardBlocks.length; i += 2) {
      const md5 = cardBlocks[i];
      const block = cardBlocks[i + 1] || '';
      if (!md5 || seenMd5s.has(md5)) continue;
      seenMd5s.add(md5);

      // 1. Cover URL
      let coverUrl: string | undefined = undefined;
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"/i);
      if (imgMatch && imgMatch[1]) {
        coverUrl = imgMatch[1].startsWith('http') ? imgMatch[1] : `${baseUrl}${imgMatch[1]}`;
      }

      // 2. Title
      let title = '';
      const titleMatch =
        block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) ||
        block.match(/class="[^"]*font-bold[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/<a[^>]+href="\/md5\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i);

      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      }

      // Fallback title from text if h3 not found
      if (!title) {
        const textSnippet = block.slice(0, 300).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        title = textSnippet.slice(0, 60);
      }

      // 3. Authors
      let author = 'Unknown Author';
      const authorMatch =
        block.match(/<span[^>]*class="[^"]*italic[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
        block.match(/href="\/search\?q=[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      if (authorMatch && authorMatch[1]) {
        const cleanAuth = authorMatch[1].replace(/<[^>]+>/g, '').trim();
        if (cleanAuth.length > 1 && !cleanAuth.toLowerCase().includes('download')) {
          author = cleanAuth;
        }
      }

      // 4. Metadata: Format, Size, Language, Year
      // Anna's Archive format: "English [en] · EPUB · 0.7MB · 2015"
      let format = 'PDF';
      let fileSize: string | undefined = undefined;
      let language = 'English';
      let year: number | undefined = undefined;

      const formatMatch = block.match(/\b(PDF|EPUB|MOBI|AZW3|DJVU|CBR|CBZ|TXT)\b/i);
      if (formatMatch && formatMatch[1]) {
        format = formatMatch[1].toUpperCase();
      }

      const sizeMatch = block.match(/\b(\d+(?:\.\d+)?\s*(?:MB|KB|GB))\b/i);
      if (sizeMatch && sizeMatch[1]) {
        fileSize = sizeMatch[1].toUpperCase();
      }

      const yearMatch = block.match(/\b(19\d\d|20\d\d)\b/);
      if (yearMatch && yearMatch[1]) {
        year = parseInt(yearMatch[1], 10);
      }

      if (block.includes('[ar]') || block.includes('Arabic')) {
        language = 'Arabic';
      }

      const detailUrl = `${baseUrl}/md5/${md5}`;
      const downloadUrl = detailUrl;

      if (title && title.length > 1) {
        results.push({
          id: `annas-${md5}`,
          title,
          author,
          year,
          language,
          fileSize,
          format,
          coverUrl,
          detailUrl,
          downloadUrl,
          md5,
        });
      }

      if (results.length >= maxResults) break;
    }

    return results;
  }
}

export const annasProvider = new AnnasProvider();
