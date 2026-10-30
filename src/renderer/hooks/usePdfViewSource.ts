import { useCallback, useEffect, useState } from 'react';

export function usePdfViewSource(original: string, diskPath: string | null, enabled = true): { url: string | null; rejectCachedSource: () => boolean } {
  const [resolved, setResolved] = useState<{ original: string; url: string; cached: boolean } | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const rejectCachedSource = useCallback(() => {
    if (!enabled || resolved?.original !== original || !resolved.cached || resolved.url === rejected) return false;
    setRejected(resolved.url);
    return true;
  }, [enabled, original, resolved, rejected]);
  const supported = enabled && Boolean(diskPath) && !/^(https?|blob|data):/iu.test(original);
  useEffect(() => {
    const api = window.electronAPI?.pdfEditor;
    if (!supported || !diskPath || !api?.viewSource) return;
    let disposed = false, busy = false;
    let id: string | undefined, key: string | undefined;
    let selectedCached = false;
    const refresh = async () => {
      if (busy || disposed) return;
      busy = true;
      try {
        const result = await api.viewSource({ path: diskPath, id });
        if (result.ok) {
          if (disposed) { void api.releaseViewSource(result.data.id).catch(() => undefined); return; }
          id = result.data.id;
          if (key !== result.data.key || selectedCached && !result.data.cached) {
            key = result.data.key;
            selectedCached = result.data.cached;
            setResolved({ original, url: result.data.url, cached: result.data.cached });
          }
        } else if (!disposed) setResolved(previous => previous?.original === original ? previous : { original, url: original, cached: false });
      } catch {
        if (!disposed) setResolved(previous => previous?.original === original ? previous : { original, url: original, cached: false });
      } finally { busy = false; }
    };
    const unsubscribe = api.onViewSourceChanged?.(changed => { if (changed === id) void refresh(); });
    const timer = setInterval(() => { void refresh(); }, 1000);
    void refresh();
    return () => {
      disposed = true;
      clearInterval(timer);
      unsubscribe?.();
      if (id) void api.releaseViewSource(id).catch(() => undefined);
    };
  }, [original, diskPath, supported]);
  if (!supported || typeof window !== 'undefined' && !window.electronAPI?.pdfEditor?.viewSource) return { url: original, rejectCachedSource };
  return { url: resolved?.original === original ? resolved.url === rejected ? original : resolved.url : null, rejectCachedSource };
}
