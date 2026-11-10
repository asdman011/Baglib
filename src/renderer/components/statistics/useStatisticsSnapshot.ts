import { useCallback, useEffect, useState } from 'react';
import type { StatisticsSnapshot } from '../../../shared/statistics-workspace';
import type { ReadingStreakStats } from '../../../shared/types/reading-statistics';

export function useStatisticsSnapshot() {
  const [snapshot, setSnapshot] = useState<StatisticsSnapshot | null>(null);
  const [streak, setStreak] = useState<ReadingStreakStats | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let alive = true;
    const update = () => {
      void Promise.resolve().then(() => Promise.all([window.electronAPI.statistics.workspace(), window.electronAPI.statistics.getStreakStats()]))
        .then(([data, stats]) => { if (alive) { setSnapshot(data); setStreak(stats); setError(false); } })
        .catch(() => { if (alive) setError(true); });
    };
    update();
    window.addEventListener('baglib:srs-reviewed', update);
    return () => { alive = false; window.removeEventListener('baglib:srs-reviewed', update); };
  }, [revision]);
  return { snapshot, streak, error, retry };
}
