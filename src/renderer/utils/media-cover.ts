import type { BookItem } from '../../shared/types/work';
import type { LecturesAPI } from '../../shared/lectures';
import { localAssetUrl } from './file-path-helper';

/** Release the decoder on success, failure and timeout. A detached muted video never starts playback. */
export function captureMiddleFrame(filePath: string): Promise<string | null> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    let finished = false;
    const finish = (png: string | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
      resolve(png);
    };
    const timer = setTimeout(() => finish(null), 15000);
    video.onerror = () => finish(null);
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) return finish(null);
      video.currentTime = video.duration / 2;
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(640, video.videoWidth);
        canvas.height = Math.max(1, Math.round(video.videoHeight * canvas.width / video.videoWidth));
        const context = canvas.getContext('2d');
        if (!context) return finish(null);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/png'));
      } catch { finish(null); }
    };
    video.src = localAssetUrl(filePath);
    video.load();
  });
}

export async function resolveMediaCover(book: BookItem, api: Pick<LecturesAPI, 'embeddedCover' | 'saveCoverFrame'>, capture = captureMiddleFrame): Promise<string | null> {
  if (book.coverImage) return book.coverImage;
  try {
    const embedded = await api.embeddedCover(book.id);
    if (embedded) return embedded;
    if (!book.filePath || !/\.(mp4|m4v|mov|mkv|webm)$/iu.test(book.filePath)) return null;
    const frame = await capture(book.filePath);
    return frame ? await api.saveCoverFrame(book.id, frame) : null;
  } catch { return null; }
}
