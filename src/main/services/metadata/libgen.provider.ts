/**
 * Baglib — Library Genesis (LibGen) Metadata Provider
 *
 * Implements search and metadata extraction from LibGen mirrors,
 * adapting findings from reverse-engineering the Calibre store plugin:
 * - Dynamic table column index discovery
 * - Direct download URL transformation (/ads.php?md5= -> /get.php?md5=)
 * - Multi-mirror fallback with live health checking
 */

export interface LibgenSearchResult {
  id: string;
  title: string;
  author: string;
  publisher?: string;
  year?: number;
  language?: string;
  pages?: string;
  fileSize?: string;
  format: string; // 'PDF' | 'EPUB' | 'MOBI' | etc.
  coverUrl?: string;
  detailUrl: string;
  downloadUrl?: string;
  isbn?: string;
  md5?: string;
}

export const LIBGEN_MIRRORS = [
  'https://libgen.li',
  'https://libgen.bz',
  'https://libgen.is',
  'https://libgen.rs',
  'https://libgen.vg',
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class LibgenProvider {
  private activeMirror: string | null = null;
  private lastMirrorCheck = 0;
  private readonly checkCacheMs = 10 * 60 * 1000; // 10 minutes cache

  /**
   * Ping mirrors in priority order and select the first responding one.
   */
  async getActiveMirror(): Promise<string> {
    const now = Date.now();
    if (this.activeMirror && now - this.lastMirrorCheck < this.checkCacheMs) {
      return this.activeMirror;
    }

    for (const mirror of LIBGEN_MIRRORS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const response = await fetch(mirror, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT },
        });
        clearTimeout(timeout);

        if (response.ok || response.status === 200) {
          this.activeMirror = mirror;
          this.lastMirrorCheck = now;
          return mirror;
        }
      } catch {
        // Continue to next mirror fallback
      }
    }

    // Default fallback
    this.activeMirror = LIBGEN_MIRRORS[0];
    return this.activeMirror;
  }

  /**
   * Transforms an ad/gateway link into a direct download URL.
   * Matches Calibre plugin transform_download_url behavior.
   */
  transformDownloadUrl(url: string, baseUrl: string): string {
    const md5Match = url.match(/md5=([a-fA-F0-9]{32})/i) || url.match(/\/ads([a-fA-F0-9]{32})/i);
    if (md5Match) {
      return `${baseUrl}/get.php?md5=${md5Match[1]}`;
    }
    return url.startsWith('http') ? url : `${baseUrl}${url}`;
  }

  /**
   * Search Library Genesis for books by keyword, title, author, or ISBN.
   */
  async search(query: string, maxResults = 25): Promise<LibgenSearchResult[]> {
    if (!query || !query.trim()) return [];

    const mirror = await this.getActiveMirror();
    const encodedQuery = encodeURIComponent(query.trim());
    const resCount = maxResults <= 25 ? '25' : maxResults <= 50 ? '50' : '100';

    // Constructed query replicating the Calibre plugin search URL
    const searchUrl = `${mirror}/index.php?req=${encodedQuery}&columns[]=t&columns[]=a&columns[]=s&columns[]=y&columns[]=p&columns[]=i&objects[]=f&objects[]=e&objects[]=s&objects[]=a&objects[]=p&objects[]=w&topics[]=l&topics[]=c&topics[]=f&topics[]=a&topics[]=m&topics[]=r&topics[]=s&res=${resCount}&covers=on&gmode=on&filesuns=all`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(searchUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn(`[LibgenProvider] HTTP error ${res.status} from ${mirror}`);
        return [];
      }

      const html = await res.text();
      return this.parseHtml(html, mirror, maxResults);
    } catch (err: any) {
      console.error(`[LibgenProvider] Search failed on ${mirror}:`, err?.message || err);
      return [];
    }
  }

  /**
   * Parse HTML table returned by LibGen search.
   */
  parseHtml(html: string, baseUrl: string, maxResults = 25): LibgenSearchResult[] {
    const results: LibgenSearchResult[] = [];

    // Find table with table-striped class
    const tableMatch = html.match(/<table[^>]*class="[^"]*table-striped[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) return results;

    const tableHtml = tableMatch[1];
    if (!tableHtml) return results;
    const trMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    if (trMatches.length < 2) return results;

    // Discover column indices dynamically
    const headerTr = trMatches[0];
    if (!headerTr) return results;
    const thMatches = headerTr.match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
    const thTexts = thMatches.map((th) =>
      th.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    );

    const imageCol = 0;
    const titleCol = 1;
    let authorCol = thTexts.findIndex((t) => t.includes('author'));
    let publisherCol = thTexts.findIndex((t) => t.includes('publisher'));
    let yearCol = thTexts.findIndex((t) => t.includes('year'));
    let langCol = thTexts.findIndex((t) => t.includes('language'));
    let pagesCol = thTexts.findIndex((t) => t.includes('pages'));
    let sizeCol = thTexts.findIndex((t) => t.includes('size'));
    let extCol = thTexts.findIndex((t) => t.includes('ext'));
    let mirrorsCol = thTexts.findIndex((t) => t.includes('mirror'));

    // Safe fallbacks if headers cannot be found
    if (authorCol === -1) authorCol = 2;
    if (publisherCol === -1) publisherCol = 3;
    if (yearCol === -1) yearCol = 4;
    if (langCol === -1) langCol = 5;
    if (pagesCol === -1) pagesCol = 6;
    if (sizeCol === -1) sizeCol = 7;
    if (extCol === -1) extCol = 8;
    if (mirrorsCol === -1) mirrorsCol = 9;

    const cleanText = (tdHtml: string): string => {
      // Neutralize quoted attribute text to prevent bracket bleed
      const neutralized = tdHtml.replace(/="[^"]*"/g, '=""').replace(/='[^']*'/g, "=''");
      return neutralized.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    };

    for (let i = 1; i < trMatches.length; i++) {
      const tr = trMatches[i];
      const tdMatches = tr.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
      if (tdMatches.length <= Math.max(authorCol, extCol, mirrorsCol)) continue;

      // 1. Cover Image
      let coverUrl: string | undefined = undefined;
      const coverMatch = tdMatches[imageCol]?.match(/<img[^>]*src="([^"]+)"/i);
      if (coverMatch && coverMatch[1]) {
        coverUrl = coverMatch[1].startsWith('http') ? coverMatch[1] : `${baseUrl}${coverMatch[1]}`;
      }

      // 2. Title & ISBN
      const rawTitleTd = tdMatches[titleCol] || '';
      let isbn: string | undefined = undefined;
      const isbnMatch =
        rawTitleTd.match(/<font[^>]*color="green"[^>]*>([\s\S]*?)<\/font>/i) ||
        rawTitleTd.match(/\b(97[89][-\d\s]{10,17}|\b\d{9}[\dX]\b)/);
      if (isbnMatch && isbnMatch[1]) {
        const candidate = isbnMatch[1].replace(/<[^>]+>/g, '').trim().split(';')[0]?.trim();
        if (candidate) isbn = candidate;
      }

      // Title extraction with attribute sanitization
      const neutralizedTitle = rawTitleTd.replace(/="[^"]*"/g, '=""').replace(/='[^']*'/g, "=''");
      let title = '';

      // Check for clean link text
      const linkMatches = neutralizedTitle.match(/<a[^>]*>([\s\S]*?)<\/a>/gi) || [];
      for (const lm of linkMatches) {
        const text = lm.replace(/<[^>]+>/g, '').trim();
        if (text && !/^\d+/.test(text) && text.length > 3 && !text.includes('edition.php')) {
          title = text;
          break;
        }
      }

      if (!title) {
        const boldMatch = neutralizedTitle.match(/<b[^>]*>([\s\S]*?)<\/b>/i);
        if (boldMatch && boldMatch[1]) {
          title = boldMatch[1].replace(/<[^>]+>/g, '').trim();
        }
      }

      if (!title) {
        title = cleanText(neutralizedTitle).replace(/97[89][-\d\s]{10,17}.*$/g, '').trim();
      }

      // 3. Author & Publisher
      const author = cleanText(tdMatches[authorCol] || '') || 'Unknown Author';
      const publisher = cleanText(tdMatches[publisherCol] || '') || undefined;

      // 4. Year, Language, Pages, Size, Format
      const rawYear = cleanText(tdMatches[yearCol] || '');
      const year = parseInt(rawYear, 10) || undefined;
      const language = cleanText(tdMatches[langCol] || '') || 'English';
      const pages = cleanText(tdMatches[pagesCol] || '') || undefined;
      const fileSize = cleanText(tdMatches[sizeCol] || '') || undefined;
      const format = (cleanText(tdMatches[extCol] || '') || 'PDF').toUpperCase();

      // 5. Mirror / Download URL
      const rawMirrorTd = tdMatches[mirrorsCol] || '';
      const mirrorLinkMatch = rawMirrorTd.match(/href="([^"]+)"/i);
      let detailUrl = baseUrl;
      let downloadUrl: string | undefined = undefined;
      let md5: string | undefined = undefined;

      if (mirrorLinkMatch && mirrorLinkMatch[1]) {
        const href = mirrorLinkMatch[1];
        detailUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;

        const md5Match = href.match(/md5=([a-fA-F0-9]{32})/i) || href.match(/\/ads([a-fA-F0-9]{32})/i);
        if (md5Match && md5Match[1]) {
          md5 = md5Match[1];
          downloadUrl = this.transformDownloadUrl(href, baseUrl);
        }
      }

      if (title && title.length > 1) {
        results.push({
          id: md5 ? `libgen-${md5}` : `libgen-${i}-${Date.now()}`,
          title,
          author,
          publisher,
          year,
          language,
          pages,
          fileSize,
          format,
          coverUrl,
          detailUrl,
          downloadUrl,
          isbn,
          md5,
        });
      }

      if (results.length >= maxResults) break;
    }

    return results;
  }
}

export const libgenProvider = new LibgenProvider();
