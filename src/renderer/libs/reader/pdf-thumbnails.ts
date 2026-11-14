import type { PdfViewDocument } from './pdf-view-document';

const THUMBNAIL_SCALE = 0.3;
const caches = new WeakMap<PdfViewDocument, Map<number, Promise<string | null>>>();
const queues = new WeakMap<PdfViewDocument, Promise<unknown>>();

async function draw(document: PdfViewDocument, page: number): Promise<string | null> {
  if (document.signal.aborted) return null;
  const bitmap = await document.render(page, THUMBNAIL_SCALE, 1, document.signal);
  if (!bitmap) return null;
  if (document.signal.aborted) { bitmap.close(); return null; }
  const canvas = window.document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d', { alpha: false })?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.7);
}

/** Pages render one at a time on the open document, so a long grid never floods the raster host. */
export function pdfThumbnail(document: PdfViewDocument, page: number): Promise<string | null> {
  if (document.signal.aborted) return Promise.resolve(null);
  const cache = caches.get(document) ?? new Map<number, Promise<string | null>>();
  caches.set(document, cache);
  let thumbnail = cache.get(page);
  if (!thumbnail) {
    thumbnail = (queues.get(document) ?? Promise.resolve()).then(() => draw(document, page));
    queues.set(document, thumbnail.catch(() => null));
    thumbnail.catch(() => cache.delete(page));
    cache.set(page, thumbnail);
  }
  return thumbnail;
}
