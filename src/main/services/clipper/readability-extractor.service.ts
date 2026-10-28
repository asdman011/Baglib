import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import type { ClippedArticle } from '../../../shared/types/web-clipper';

export class ReadabilityExtractorService {
  private static instance: ReadabilityExtractorService;

  public static getInstance(): ReadabilityExtractorService {
    if (!this.instance) {
      this.instance = new ReadabilityExtractorService();
    }
    return this.instance;
  }

  /**
   * Fetch HTML from URL and extract readable article
   */
  public async extractFromUrl(url: string): Promise<ClippedArticle> {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Baglib/0.1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en-US,en;q=0.9',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch page: ${res.status} ${res.statusText}`);
    }

    const html = await res.text();
    return this.extractFromHtml(html, url);
  }

  /**
   * Extract clean article from raw HTML string
   */
  public extractFromHtml(rawHtml: string, pageUrl: string): ClippedArticle {
    const { document } = parseHTML(rawHtml);

    // Extract meta tags before Readability modifies DOM
    const metaTitle =
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      document.querySelector('meta[name="twitter:title"]')?.getAttribute('content');

    const metaAuthor =
      document.querySelector('meta[name="author"]')?.getAttribute('content') ||
      document.querySelector('meta[property="article:author"]')?.getAttribute('content') ||
      document.querySelector('meta[name="twitter:creator"]')?.getAttribute('content');

    const metaExcerpt =
      document.querySelector('meta[name="description"]')?.getAttribute('content') ||
      document.querySelector('meta[property="og:description"]')?.getAttribute('content');

    const siteName =
      document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
      this.extractDomain(pageUrl);

    const publishedTime =
      document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
      document.querySelector('time')?.getAttribute('datetime');

    const coverImage =
      document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      document.querySelector('meta[name="twitter:image"]')?.getAttribute('content');

    const docLang =
      document.documentElement?.getAttribute('lang') ||
      document.querySelector('meta[property="og:locale"]')?.getAttribute('content') ||
      undefined;

    // Run Mozilla Readability
    let parsed: ReturnType<Readability['parse']> = null;
    try {
      const reader = new Readability(document);
      parsed = reader.parse();
    } catch {
      parsed = null;
    }

    let title = metaTitle || parsed?.title || document.querySelector('title')?.textContent || 'Untitled Article';
    title = title.replace(/\s+/g, ' ').trim();

    let byline = metaAuthor || parsed?.byline || '';
    byline = byline.replace(/\s+/g, ' ').trim();

    const excerpt = metaExcerpt || parsed?.excerpt || '';

    // If Readability succeeds, use its clean HTML; otherwise fall back to <article> or <body>
    let cleanContent = parsed?.content || '';
    let textContent = parsed?.textContent || '';

    if (!cleanContent) {
      const articleEl = document.querySelector('article') || document.querySelector('main') || document.body;
      cleanContent = articleEl ? articleEl.innerHTML : rawHtml;
      textContent = articleEl ? articleEl.textContent || '' : '';
    }

    // Parse cleanContent again to extract and rewrite image URLs
    const { document: contentDoc } = parseHTML(`<div>${cleanContent}</div>`);
    const imgEls = Array.from(contentDoc.querySelectorAll('img'));
    const images: string[] = [];

    for (const img of imgEls) {
      const bestUrl = this.resolveBestImageUrl(img, pageUrl);
      if (bestUrl) {
        images.push(bestUrl);
        img.setAttribute('src', bestUrl);
        // Strip non-standard lazy loading attributes
        img.removeAttribute('srcset');
        img.removeAttribute('data-src');
        img.removeAttribute('data-original');
        img.removeAttribute('data-lazy');
        img.removeAttribute('data-srcset');
      }
    }

    cleanContent = contentDoc.querySelector('div')?.innerHTML || cleanContent;

    // Detect language if not in meta
    const finalLang = docLang || (/[\u0600-\u06FF]/.test(textContent) ? 'ar' : 'en');

    return {
      title,
      byline: byline || undefined,
      excerpt: excerpt || undefined,
      siteName: siteName || undefined,
      url: pageUrl,
      content: cleanContent,
      textContent: textContent.trim(),
      length: parsed?.length || textContent.length,
      language: finalLang,
      publishedTime: publishedTime || undefined,
      coverImage: coverImage ? this.resolveUrl(coverImage, pageUrl) : undefined,
      images: Array.from(new Set(images)),
    };
  }

  /**
   * Resolves the highest quality image URL from an <img> element, checking srcset, data-*, and src.
   */
  public resolveBestImageUrl(img: Element, baseUrl: string): string | null {
    // 1. Check srcset for largest candidate
    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
    if (srcset) {
      const largest = this.pickLargestFromSrcset(srcset);
      if (largest) return this.resolveUrl(largest, baseUrl);
    }

    // 2. Check lazy load attributes
    const lazySrc =
      img.getAttribute('data-src') ||
      img.getAttribute('data-original') ||
      img.getAttribute('data-lazy-src') ||
      img.getAttribute('data-actualsrc');
    if (lazySrc) return this.resolveUrl(lazySrc, baseUrl);

    // 3. Check regular src
    const src = img.getAttribute('src');
    if (src && !src.startsWith('data:image/svg') && !src.includes('spacer.gif')) {
      return this.resolveUrl(src, baseUrl);
    }

    return null;
  }

  private pickLargestFromSrcset(srcset: string): string | null {
    let bestUrl: string | null = null;
    let bestScore = -1;

    for (const entry of srcset.split(',')) {
      const parts = entry.trim().split(/\s+/);
      const url = parts[0];
      if (!url) continue;

      let score = 1;
      const desc = parts[1];
      if (desc) {
        const match = desc.match(/^(\d+(?:\.\d+)?)([wx])$/i);
        if (match && match[1]) {
          score = parseFloat(match[1]);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestUrl = url;
      }
    }

    return bestUrl;
  }

  private resolveUrl(href: string, base: string): string {
    try {
      return new URL(href, base).toString();
    } catch {
      return href;
    }
  }

  private extractDomain(urlStr: string): string {
    try {
      const u = new URL(urlStr);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }
}
