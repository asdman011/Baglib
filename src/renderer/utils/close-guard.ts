'use client';
import { useEffect } from 'react';

/**
 * Guards asked before the app window closes (ADR-012). A guard resolves true when closing may go ahead — after
 * saving, or after the user chose to close without writing — and false when the user cancelled.
 */
type Guard = () => Promise<boolean>;
const guards = new Set<Guard>();

export function registerCloseGuard(guard: Guard): () => void {
  guards.add(guard);
  return () => { guards.delete(guard); };
}

/** Mounted once in the app layout: answers the window's close request after every guard agreed. */
export function useAppCloseBridge() {
  useEffect(() => {
    const api = window.electronAPI?.appClose;
    if (!api) return;
    let asking = false;
    return api.onRequested(() => {
      if (asking) return;
      asking = true;
      void (async () => {
        try {
          for (const guard of [...guards]) if (!await guard()) { api.answer(false); return; }
          api.answer(true);
        } catch { api.answer(true); } finally { asking = false; }
      })();
    });
  }, []);
}
