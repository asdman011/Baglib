'use client';

import { useCallback, useEffect, useState } from 'react';
import type { KhatmahMutation, KhatmahState } from '../../../shared/types/khatmah';
import { localDate } from '../../../shared/khatmah';
import type { TranslationKey } from '../../translations';
import { quranErrorKeys } from '../../utils/quran-errors';

export function useKhatmah() {
  const [state, setState] = useState<KhatmahState>({ plans: [], notificationsSupported: false });
  const [today, setToday] = useState(() => localDate());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const result = await window.electronAPI?.quran?.khatmahList();
        if (!alive) return;
        if (!result) { setError('quranDesktopRequired'); return; }
        if (result.ok) { setState(result.data); setError(null); } else setError(quranErrorKeys[result.error]);
      } catch { if (alive) setError('quranStorageError'); }
      finally { if (alive) setLoading(false); }
    };
    void load();
    const unsubscribe = window.electronAPI?.quran?.onChanged(() => { void load(); });
    const timer = setInterval(() => setToday(localDate()), 30_000);
    return () => { alive = false; clearInterval(timer); unsubscribe?.(); };
  }, []);
  const mutate = useCallback(async (query: KhatmahMutation) => {
    setBusy(true); setError(null);
    try {
      const result = await window.electronAPI.quran.khatmahMutate(query);
      if (result.ok) { setState(result.data); return true; }
      setError(quranErrorKeys[result.error]);
    } catch { setError('quranStorageError'); }
    finally { setBusy(false); }
    return false;
  }, []);
  return { ...state, today, busy, error, loading, mutate };
}
