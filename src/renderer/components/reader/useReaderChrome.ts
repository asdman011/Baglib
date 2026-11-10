'use client';
import { useEffect, useRef, useState } from 'react';
import { isReaderChromeTab, parseReaderChrome, readerChromeKey, type ReaderChromeState, type ReaderChromeTab } from './reader-chrome-state';
import type { ReaderPanel } from './useReaderPanels';

export function useReaderChrome(bookId: string | undefined, activePanel: ReaderPanel | null, setters: Record<ReaderPanel, (open: boolean) => void>) {
  const [saved, setSaved] = useState<ReaderChromeState>(() => parseReaderChrome(null));
  const [ready, setReady] = useState(false);
  const interacted = useRef(false);
  const tab = isReaderChromeTab(activePanel) ? activePanel : saved.tab;
  const open = isReaderChromeTab(activePanel);
  useEffect(() => {
    if (!bookId) return;
    let alive = true;
    void window.electronAPI?.settings.get(readerChromeKey(bookId)).then(value => {
      if (!alive) return;
      const restored = parseReaderChrome(value);
      if (!interacted.current) {
        setSaved(restored);
        // A remembered desktop pane never covers a newly opened narrow reader.
        if (restored.open && window.matchMedia('(min-width: 768px)').matches) setters[restored.tab](true);
      }
      setReady(true);
    }, () => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [bookId, setters]);
  useEffect(() => {
    if (!bookId || !ready) return;
    const next = { tab, open, width: saved.width };
    void window.electronAPI?.settings.set(readerChromeKey(bookId), next).catch(() => {});
  }, [bookId, ready, tab, open, saved.width]);
  const select = (next: ReaderChromeTab) => {
    interacted.current = true;
    setSaved(previous => ({ ...previous, tab: next }));
    setters[next](true);
  };
  return { tab, open, select, width: saved.width, resize: (width: number) => setSaved(previous => ({ ...previous, tab, width })) };
}
