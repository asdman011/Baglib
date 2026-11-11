'use client';

import { useEffect, useState } from 'react';

export interface Readiness { database: boolean | null; index: boolean | null; pdf: boolean | null }
const pending: Readiness = { database: null, index: null, pdf: null };

type ReadinessApi = Partial<Pick<Window['electronAPI'], 'getFtsStats'>> & { pdfEditor?: Partial<Pick<Window['electronAPI']['pdfEditor'], 'engineStatus'>> };

/** Read the existing DB/FTS probes and the PDF engine configuration, without starting the sidecar. */
export async function readReadiness(api: ReadinessApi | undefined = typeof window === 'undefined' ? undefined : window.electronAPI): Promise<Readiness> {
  const [storage, engine] = await Promise.allSettled([api?.getFtsStats?.(), api?.pdfEditor?.engineStatus?.()]);
  const stats = storage.status === 'fulfilled' ? storage.value : undefined;
  const pdf = engine.status === 'fulfilled' ? engine.value : undefined;
  return {
    database: stats?.databaseReady === true,
    index: stats?.indexReady === true,
    pdf: pdf?.ok === true && pdf.data.configured === true && pdf.data.status !== 'error',
  };
}

export function useReadiness() {
  const [readiness, setReadiness] = useState<Readiness>(pending);
  useEffect(() => {
    let alive = true;
    let sequence = 0;
    const refresh = async () => {
      const request = ++sequence;
      const next = await readReadiness();
      if (alive && request === sequence) setReadiness(next);
    };
    void refresh();
    const unsubscribe = window.electronAPI?.pdfEditor?.onEngineStatusChanged?.(() => { void refresh(); });
    const timer = setInterval(() => { void refresh(); }, 30000);
    window.addEventListener('focus', refresh);
    return () => { alive = false; sequence++; clearInterval(timer); unsubscribe?.(); window.removeEventListener('focus', refresh); };
  }, []);
  return readiness;
}
