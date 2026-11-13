'use client';
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { Lecture } from '../../../shared/lectures';
import type { LectureSeries } from '../../../shared/lecture-series';
const button = 'rounded-lg border border-subtle px-2 py-1 text-xs disabled:opacity-40';

function SeriesGroup({ series, onUpdate, children }: { series: LectureSeries; onUpdate: () => Promise<void>; children: ReactNode }) {
  const { t } = useWorkspace();
  const [name, setName] = useState(series.name);
  const [failed, setFailed] = useState(false);
  const apply = async (operation: Promise<unknown>) => { try { await operation; await onUpdate(); setFailed(false); } catch { setFailed(true); } };
  const finished = series.items.filter(item => item.completed).length;
  return <details open data-lecture-series={series.id} className="rounded-lg border border-subtle p-2">
    <summary className="cursor-pointer text-sm font-bold leading-relaxed"><bdi>{series.name}</bdi><span className="ms-2 text-xs font-normal">{t('lectureSeriesProgress', { finished, total: series.items.length })}</span></summary>
    <progress aria-label={t('lectureSeriesProgress', { finished, total: series.items.length })} max={series.items.length || 1} value={finished} className="my-1 h-1 w-full accent-sky-500" />
    <form className="flex gap-1" onSubmit={event => { event.preventDefault(); void apply(window.electronAPI.lectures.series.update(series.id, { name })); }}>
      <input data-series-name aria-label={t('lectureSeriesName')} dir="auto" maxLength={200} value={name} onChange={event => setName(event.target.value)} className="min-w-0 flex-1 rounded border border-subtle bg-surface px-2 py-1 text-xs leading-relaxed" />
      <button type="submit" className={button} disabled={!name.trim()}>{t('lectureSeriesRename')}</button>
      <button data-series-delete type="button" className={button} title={t('lectureSeriesDelete')} aria-label={t('lectureSeriesDelete')} onClick={() => { if (window.confirm(t('lectureSeriesDeleteConfirm'))) void apply(window.electronAPI.lectures.series.remove(series.id)); }}><Trash2 size={12} /></button>
    </form>
    <label className="my-2 flex items-center gap-2 text-xs leading-relaxed"><input data-series-autoplay type="checkbox" checked={series.autoplayNext} onChange={event => void apply(window.electronAPI.lectures.series.update(series.id, { autoplayNext: event.target.checked }))} />{t('lectureSeriesAutoplay')}</label>
    {failed && <p role="alert" className="text-xs">{t('lectureSeriesError')}</p>}
    {children}
  </details>;
}

export function LectureSeriesList({ lectures, series, selected, onSelect, onRemove, onChanged }: {
  lectures: Lecture[]; series: LectureSeries[]; selected?: string; onSelect: (id: string) => void; onRemove: (id: string) => void; onChanged: () => Promise<void>;
}) {
  const { t } = useWorkspace();
  const [name, setName] = useState('');
  const [failed, setFailed] = useState(false);
  const apply = async (operation: Promise<unknown>) => { try { await operation; await onChanged(); setFailed(false); } catch { setFailed(true); } };
  const reorder = (group: LectureSeries, workId: string, before: string) => {
    if (workId === before || !group.items.some(item => item.workId === workId)) return;
    const ids = group.items.map(item => item.workId).filter(id => id !== workId);
    ids.splice(ids.indexOf(before), 0, workId);
    void apply(window.electronAPI.lectures.series.reorder(group.id, ids));
  };
  const move = (group: LectureSeries, index: number, delta: number) => {
    const ids = group.items.map(item => item.workId);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void apply(window.electronAPI.lectures.series.reorder(group.id, ids));
  };
  const row = (lecture: Lecture, group?: LectureSeries, index = 0) => <li key={lecture.id} data-lecture-row={lecture.id} draggable={!!group}
    onDragStart={event => { event.stopPropagation(); event.dataTransfer.setData('application/x-baglib-lecture', lecture.id); event.dataTransfer.effectAllowed = 'move'; }}
    onDragOver={event => { if (group && event.dataTransfer.types.includes('application/x-baglib-lecture')) { event.preventDefault(); event.stopPropagation(); } }}
    onDrop={event => { if (!group || !event.dataTransfer.types.includes('application/x-baglib-lecture')) return; event.preventDefault(); event.stopPropagation(); reorder(group, event.dataTransfer.getData('application/x-baglib-lecture'), lecture.id); }}
    className="space-y-1 rounded-lg border border-subtle p-1">
    <div className="flex items-center gap-1"><button data-lecture-select type="button" aria-current={selected === lecture.id} onClick={() => onSelect(lecture.id)} className="min-w-0 flex-1 rounded px-2 py-2 text-start aria-current:bg-sky-500/10"><span dir="auto" className="block break-words text-sm font-bold leading-relaxed">{lecture.title}</span><span className="text-xs text-muted">{t(lecture.kind === 'audio' ? 'lectureAudio' : 'lectureVideo')} · <bdi>{lecture.path.split('.').pop()?.toUpperCase()}</bdi>{lecture.sections.length > 0 && ` · ${t('lectureSectionCount', { count: lecture.sections.length })}`}</span></button>
      <button type="button" className={button} aria-label={t('lectureRemove')} title={t('lectureRemove')} onClick={() => onRemove(lecture.id)}><Trash2 size={12} /></button></div>
    <div className="flex gap-1"><select data-series-assign className="min-w-0 flex-1 rounded border border-subtle bg-surface p-1 text-xs leading-relaxed" aria-label={t('lectureAddToSeries') + ' · ' + lecture.title} value={group?.id ?? ''} onChange={event => void apply(window.electronAPI.lectures.series.assign(lecture.id, event.target.value || null))}>
      <option value="">{t('lectureNoSeries')}</option>{series.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>{group && <><button data-series-up type="button" className={button} disabled={index === 0} aria-label={t('lectureSeriesUp')} title={t('lectureSeriesUp')} onClick={() => move(group, index, -1)}><ArrowUp size={12} /></button><button data-series-down type="button" className={button} disabled={index === group.items.length - 1} aria-label={t('lectureSeriesDown')} title={t('lectureSeriesDown')} onClick={() => move(group, index, 1)}><ArrowDown size={12} /></button></>}</div>
  </li>;
  const grouped = new Set(series.flatMap(item => item.items.map(lecture => lecture.workId)));
  return <div className="min-w-0 space-y-2 max-h-[65vh] overflow-auto rounded-xl border border-subtle p-2" data-lecture-series-list>
    <form className="flex gap-1" onSubmit={event => { event.preventDefault(); void apply(window.electronAPI.lectures.series.create(name).then(() => setName(''))); }}>
      <input data-series-create-name dir="auto" aria-label={t('lectureSeriesName')} placeholder={t('lectureSeriesName')} maxLength={200} value={name} onChange={event => setName(event.target.value)} className="min-w-0 flex-1 rounded border border-subtle bg-surface px-2 py-1 text-xs leading-relaxed" />
      <button data-series-create type="submit" className={button} disabled={!name.trim()}>{t('lectureSeriesCreate')}</button>
    </form>
    {failed && <p role="alert" className="text-xs">{t('lectureSeriesError')}</p>}
    {series.map(group => <SeriesGroup key={group.id + group.name} series={group} onUpdate={onChanged}><ul className="space-y-1">{group.items.map((item, index) => { const lecture = lectures.find(lecture => lecture.id === item.workId); return lecture ? row(lecture, group, index) : null; })}</ul></SeriesGroup>)}
    <h2 className="text-sm font-bold leading-relaxed">{t('lectureOther')}</h2>
    <ul className="space-y-1">{lectures.filter(item => !grouped.has(item.id)).map(item => row(item))}</ul>
    {lectures.length === 0 && <p className="text-sm text-muted leading-relaxed">{t('lecturesEmpty')}</p>}
  </div>;
}
