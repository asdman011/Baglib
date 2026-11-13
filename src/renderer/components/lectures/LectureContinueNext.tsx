'use client';
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
export function LectureContinueNext({ title, autoplay, onNext }: { title: string; autoplay: boolean; onNext: () => void }) {
  const { t } = useWorkspace();
  const nextCallback = useRef(onNext);
  useEffect(() => { nextCallback.current = onNext; }, [onNext]);
  const [remaining, setRemaining] = useState(5);
  const [cancelled, setCancelled] = useState(false);
  useEffect(() => {
    if (!autoplay || cancelled) return;
    if (remaining === 0) { nextCallback.current(); return; }
    const timer = setTimeout(() => setRemaining(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [autoplay, cancelled, remaining]);
  return <section data-lecture-next className="rounded-lg border border-subtle p-3 space-y-2" aria-live="polite">
    <button data-lecture-next-play type="button" className="text-sm font-bold leading-relaxed text-start underline" onClick={onNext}>{t('lectureSeriesNext', { title })}</button>
    {autoplay && !cancelled && <p className="text-xs">{t('lectureSeriesCountdown', { seconds: remaining })}</p>}
    {autoplay && !cancelled && <button data-lecture-next-cancel type="button" className="block text-xs underline" onClick={() => setCancelled(true)}>{t('lectureSeriesCancelNext')}</button>}
  </section>;
}
