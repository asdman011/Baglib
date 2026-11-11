'use client';

import { useEffect, useState } from 'react';

export interface Readiness { database: boolean | null; index: boolean | null; pdf: boolean | null }
const pending: Readiness = { database: null, index: null, pdf: null };

/** Read existing DB/FTS probes and PDF configuration, without starting the sidecar. */
export function useReadiness() {
  const [readiness, setReadiness] = useState<Readiness>(pending);
  useEffect(() => {
    let alive = true;
    let sequence = 0;
    const refresh = async () => {
      const request = ++sequence;
      const api = window.electronAPI;
      const [storage, engine] = await Promise.allSettled([
        api?.getFtsStats?.(), api?.pdfEditor?.engineStatus?.(),
      ]);
      if (!alive || request !== sequence) return;
      const stats = storage.status === 'fulfilled' ? storage.value : undefined;
      const pdf = engine.status === 'fulfilled' ? engine.value : undefined;
      setReadiness({ database: stats?.databaseReady === true, index: stats?.indexReady === true,
        pdf: pdf?.ok === true && pdf.data.configured === true && pdf.data.status !== 'error' });
    };
    void refresh();
    const unsubscribe = window.electronAPI?.pdfEditor?.onEngineStatusChanged?.(() => { void refresh(); });
    const timer = setInterval(() => { void refresh(); }, 30000);
    window.addEventListener('focus', refresh);
    return () => { alive = false; sequence++; clearInterval(timer); unsubscribe?.(); window.removeEventListener('focus', refresh); };
  }, []);
  return readiness;
}
