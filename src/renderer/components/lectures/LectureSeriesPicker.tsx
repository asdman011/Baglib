'use client';
import { useEffect, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Modal } from '../ui/Modal';
import type { LectureSeries } from '../../../shared/lecture-series';
export function LectureSeriesPicker({ workId, onClose }: { workId: string | null; onClose: () => void }) {
  const { t } = useWorkspace();
  const [series, setSeries] = useState<LectureSeries[]>([]);
  const [selected, setSelected] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!workId) return;
    let alive = true;
    void window.electronAPI.lectures.series.list().then(rows => { if (alive) { setSeries(rows); setSelected(rows.find(row => row.items.some(item => item.workId === workId))?.id ?? ''); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [workId]);
  if (!workId) return null;
  return <Modal open onClose={onClose} title={t('lectureAddToSeries')}>
    <div className="space-y-3"><select data-library-series-picker aria-label={t('lectureAddToSeries')} className="w-full rounded border border-subtle bg-surface p-2 text-sm" value={selected} onChange={event => setSelected(event.target.value)}><option value="">{t('lectureNoSeries')}</option>{series.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
    {failed && <p role="alert">{t('lectureSeriesError')}</p>}
    <button data-library-series-save type="button" className="rounded border border-subtle px-3 py-2" onClick={() => void window.electronAPI.lectures.series.assign(workId, selected || null).then(onClose).catch(() => setFailed(true))}>{t('lectureSeriesApply')}</button></div>
  </Modal>;
}
