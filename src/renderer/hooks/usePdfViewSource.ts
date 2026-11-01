import { useCallback, useEffect, useRef, useState } from 'react';
import type { PdfViewPreview } from '../../shared/types/pdf-editor';

export interface PdfViewSourceState {
  url: string | null;
  preview: PdfViewPreview | null;
  rejectCachedSource: () => boolean;
  savePreview: (page: number, preview: PdfViewPreview) => void;
}

export function usePdfViewSource(original: string, diskPath: string | null, enabled = true, previewPage?: number): PdfViewSourceState {
  const [resolved, setResolved] = useState<{ original: string; url: string; cached: boolean; preview: PdfViewPreview | null } | null>(null);
  const selection = useRef<{ id?: string; key?: string; cached: boolean }>({ cached: false });
  const firstPage = useRef(previewPage);
  const rejectCachedSource = useCallback(() => {
    if (!enabled || !selection.current.cached) return false;
    selection.current.cached = false;
    // The derivative is bad, so reading continues from the canonical file and later opens must not reuse it.
    if (selection.current.id) void window.electronAPI?.pdfEditor?.evictViewSource?.(selection.current.id).catch(() => undefined);
    setResolved({ original, url: original, cached: false, preview: null });
    return true;
  }, [enabled, original]);
  const savePreview = useCallback((page: number, preview: PdfViewPreview) => {
    if (selection.current.id) void window.electronAPI?.pdfEditor?.saveViewPreview?.(selection.current.id, page, preview).catch(() => undefined);
  }, []);
  const supported = enabled && Boolean(diskPath) && !/^(https?|blob|data):/iu.test(original);
  useEffect(() => {
    const api = window.electronAPI?.pdfEditor;
    if (!supported || !diskPath || !api?.viewSource) return;
    let disposed = false, busy = false, first = true;
    const current = { id: undefined as string | undefined, key: undefined as string | undefined, cached: false };
    selection.current = current;
    const refresh = async () => {
      if (busy || disposed) return;
      busy = true;
      try {
        const result = await api.viewSource({ path: diskPath, id: current.id, ...(first ? { page: firstPage.current } : {}) });
        first = false;
        if (result.ok) {
          if (disposed) { void api.releaseViewSource(result.data.id).catch(() => undefined); return; }
          current.id = result.data.id;
          if (current.key !== result.data.key || current.cached && !result.data.cached) {
            current.key = result.data.key;
            current.cached = result.data.cached;
            setResolved({ original, url: result.data.url, cached: result.data.cached, preview: result.data.preview ?? null });
          }
        } else if (!disposed) setResolved(previous => previous?.original === original ? previous : { original, url: original, cached: false, preview: null });
      } catch {
        if (!disposed) setResolved(previous => previous?.original === original ? previous : { original, url: original, cached: false, preview: null });
      } finally { busy = false; }
    };
    const unsubscribe = api.onViewSourceChanged?.(changed => { if (changed === current.id) void refresh(); });
    const timer = setInterval(() => { void refresh(); }, 5000);
    void refresh();
    return () => {
      disposed = true;
      clearInterval(timer);
      unsubscribe?.();
      if (current.id) void api.releaseViewSource(current.id).catch(() => undefined);
    };
  }, [original, diskPath, supported]);
  if (!supported || typeof window !== 'undefined' && !window.electronAPI?.pdfEditor?.viewSource) return { url: original, preview: null, rejectCachedSource, savePreview };
  const active = resolved?.original === original ? resolved : null;
  return { url: active?.url ?? null, preview: active?.preview ?? null, rejectCachedSource, savePreview };
}
