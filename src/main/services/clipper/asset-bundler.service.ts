import path from 'path';
import { parseHTML } from 'linkedom';
import type { ClippedImage } from '../../../shared/types/web-clipper';

export const MAX_ASSET_BYTES = 5 * 1024 * 1024; // 5 MB per asset
export const MAX_TOTAL_ASSET_BYTES = 30 * 1024 * 1024; // 30 MB total
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONCURRENCY = 4;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};

export class AssetBundlerService {
  private static instance: AssetBundlerService;

  public static getInstance(): AssetBundlerService {
    if (!this.instance) {
      this.instance = new AssetBundlerService();
    }
    return this.instance;
  }

  /**
   * Bundles images found in an HTML string:
   * 1. Downloads referenced images up to size ceilings.
   * 2. Rewrites <img> src attributes to relative EPUB paths (e.g. `images/img_1.jpg`).
   * 3. Returns the rewritten HTML and array of ClippedImage assets.
   */
  public async bundleAssets(
    htmlContent: string,
    refererUrl: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<{ rewrittenHtml: string; images: ClippedImage[] }> {
    const { document } = parseHTML(`<div>${htmlContent}</div>`);
    const imgEls = Array.from(document.querySelectorAll('img'));

    if (imgEls.length === 0) {
      return { rewrittenHtml: htmlContent, images: [] };
    }

    const uniqueUrls = new Set<string>();
    for (const img of imgEls) {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('data:')) {
        uniqueUrls.add(src);
      }
    }

    const urlList = Array.from(uniqueUrls);
    const downloadedMap = new Map<string, ClippedImage>();
    let totalBytes = 0;
    let completed = 0;

    // Concurrently download images in batches
    for (let i = 0; i < urlList.length; i += MAX_CONCURRENCY) {
      const batch = urlList.slice(i, i + MAX_CONCURRENCY);
      await Promise.all(
        batch.map(async (imgUrl, batchIdx) => {
          if (totalBytes >= MAX_TOTAL_ASSET_BYTES) return;

          const imageIndex = i + batchIdx + 1;
          const asset = await this.fetchImage(imgUrl, refererUrl, imageIndex);
          if (asset && asset.data.byteLength <= MAX_ASSET_BYTES) {
            if (totalBytes + asset.data.byteLength <= MAX_TOTAL_ASSET_BYTES) {
              totalBytes += asset.data.byteLength;
              downloadedMap.set(imgUrl, asset);
            }
          }

          completed++;
          onProgress?.(completed, urlList.length);
        })
      );
    }

    // Rewrite image sources in HTML
    for (const img of imgEls) {
      const src = img.getAttribute('src');
      if (src && downloadedMap.has(src)) {
        const asset = downloadedMap.get(src)!;
        img.setAttribute('src', asset.localPath);
      }
    }

    const container = document.querySelector('div');
    const rewrittenHtml = container ? container.innerHTML : htmlContent;

    return {
      rewrittenHtml,
      images: Array.from(downloadedMap.values()),
    };
  }

  /**
   * Fetches an individual image asset with timeout and header forwarding
   */
  public async fetchImage(
    url: string,
    referer: string,
    index: number
  ): Promise<ClippedImage | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: referer,
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });

      clearTimeout(timer);

      if (!res.ok) return null;

      const contentType = res.headers.get('content-type') || 'image/jpeg';
      const cleanMime = contentType.split(';')[0].trim().toLowerCase();
      const ext = MIME_TO_EXT[cleanMime] || 'jpg';

      const arrayBuffer = await res.arrayBuffer();
      const data = Buffer.from(arrayBuffer);

      const localPath = `images/img_${index}.${ext}`;

      return {
        src: url,
        localPath,
        mimeType: cleanMime,
        data,
      };
    } catch {
      return null;
    }
  }
}
