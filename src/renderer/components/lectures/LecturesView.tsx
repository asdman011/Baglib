'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Clapperboard, NotebookPen, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { openStudyNote } from '../../utils/study-navigation';
import { consumeLecture, LECTURE_OPEN_EVENT, lectureTarget } from '../../utils/lecture-navigation';
import { studyLinkText, studyLinks } from '../../../shared/study-notes';
import { clockTime, PLAYBACK_RATES, type Lecture } from '../../../shared/lectures';
import { localAssetUrl } from '../../utils/file-path-helper';

const button = 'inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-2 text-sm disabled:opacity-50';
const control = 'rounded-lg border border-subtle bg-surface p-2 text-sm text-main min-w-0';
const SAVE_EVERY_MS = 5000;

function Player({ lecture, seek, onChanged }: { lecture: Lecture; seek: number | null; onChanged: (lecture: Lecture) => void }) {
  const { t, dir } = useWorkspace();
  const { notes } = useStudyNotes();
  const media = useRef<HTMLVideoElement>(null);
  const [rate, setRate] = useState(1);
  const [now, setNow] = useState(0);
  const [failed, setFailed] = useState(false);
  const [section, setSection] = useState('');
  const api = window.electronAPI.lectures;
  const linked = useMemo(() => notes.flatMap(note => studyLinks(note.content).filter(link => link.target.startsWith(`media:${lecture.id}:`)).map(link => ({ note, link, seconds: Number(link.target.split(':')[2]) }))).sort((first, second) => first.seconds - second.seconds), [notes, lecture.id]);

  const save = useCallback(() => {
    const element = media.current;
    if (!element || !Number.isFinite(element.duration)) return;
    void api.saveProgress(lecture.id, { position: element.currentTime, rate: element.playbackRate, completed: element.duration - element.currentTime < 5 });
  }, [api, lecture.id]);

  useEffect(() => {
    let alive = true;
    void api.progress(lecture.id).then(saved => {
      const element = media.current;
      if (!alive || !element) return;
      const start = seek ?? saved?.position ?? 0;
      const apply = () => { element.currentTime = start; element.playbackRate = saved?.rate ?? 1; setRate(saved?.rate ?? 1); };
      if (element.readyState >= 1) apply(); else element.addEventListener('loadedmetadata', apply, { once: true });
    });
    const timer = setInterval(() => { if (media.current && !media.current.paused) save(); }, SAVE_EVERY_MS);
    return () => { alive = false; clearInterval(timer); save(); };
  }, [api, lecture.id, seek, save]);

  const go = (seconds: number) => { if (media.current) { media.current.currentTime = seconds; void media.current.play().catch(() => {}); } };
  const label = (seconds: number) => `${lecture.title} · ${clockTime(seconds)}`;
  const note = () => { const at = media.current?.currentTime ?? 0; openStudyNote({ content: `${studyLinkText(lectureTarget(lecture.id, at), label(at))}\n\n` }); };
  const shot = async () => {
    const element = media.current;
    if (!element || !element.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = element.videoWidth; canvas.height = element.videoHeight;
    canvas.getContext('2d')!.drawImage(element, 0, 0);
    const at = element.currentTime;
    const id = await api.saveShot(lecture.id, canvas.toDataURL('image/png'));
    openStudyNote({ content: `${studyLinkText(lectureTarget(lecture.id, at, id), label(at), true)}\n\n` });
  };
  const addSection = () => {
    const sections = [...lecture.sections, { title: section.trim(), start: Math.floor(media.current?.currentTime ?? 0) }];
    void api.update(lecture.id, { sections }).then(updated => { setSection(''); onChanged(updated); });
  };
  const removeSection = (index: number) => { void api.update(lecture.id, { sections: lecture.sections.filter((_, position) => position !== index) }).then(onChanged); };
  const current = [...lecture.sections].reverse().find(item => item.start <= now);

  return <div className="space-y-4">
    <h2 dir="auto" className="font-display text-lg font-bold break-words">{lecture.title}</h2>
    {/* The player stays left-to-right so its timeline runs the way time is shown. */}
    <video key={lecture.id} ref={media} src={localAssetUrl(lecture.path)} controls preload="metadata" dir="ltr" data-lecture-player
      className={lecture.kind === 'audio' ? 'w-full h-14' : 'w-full max-h-[60vh] rounded-xl bg-black'}
      onTimeUpdate={event => setNow(event.currentTarget.currentTime)} onPause={save} onRateChange={event => setRate(event.currentTarget.playbackRate)}
      onError={() => setFailed(true)} onLoadedMetadata={() => setFailed(false)} />
    {failed && <p role="alert" className="text-sm leading-relaxed">{t('lectureUnplayable')}</p>}
    <div className="flex flex-wrap items-center gap-2" dir={dir}>
      <label className="flex items-center gap-2 text-sm"><span>{t('lectureSpeed')}</span><select className={control} aria-label={t('lectureSpeed')} value={rate} onChange={event => { const value = Number(event.target.value); if (media.current) media.current.playbackRate = value; setRate(value); save(); }}>{PLAYBACK_RATES.map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
      <button type="button" className={button} onClick={note}><NotebookPen className="size-4" />{t('lectureNoteHere')}</button>
      <button type="button" className={button} disabled={lecture.kind === 'audio'} onClick={() => void shot()}><Camera className="size-4" />{t('lectureShot')}</button>
      <bdi className="text-xs text-muted">{clockTime(now)}{current && <> · <span dir="auto">{current.title}</span></>}</bdi>
    </div>
    <section className="space-y-2">
      <h3 className="text-sm font-bold">{t('lectureSections')}</h3>
      <p className="text-xs text-muted">{t(lecture.sectionSource === 'file' ? 'lectureSectionsFromFile' : lecture.sectionSource === 'user' ? 'lectureSectionsFromUser' : 'lectureSectionsNone')}</p>
      <ol className="space-y-1">{lecture.sections.map((item, index) => <li key={`${item.start}-${index}`} className="flex items-center gap-2">
        <button type="button" aria-current={current === item} className={`flex-1 min-w-0 rounded-lg border px-3 py-1.5 text-start text-sm ${current === item ? 'border-pale-sky-500' : 'border-subtle'}`} onClick={() => go(item.start)}><bdi className="text-xs text-muted">{clockTime(item.start)}</bdi> <span dir="auto">{item.title}</span></button>
        <button type="button" className="p-1.5 rounded-lg border border-subtle" aria-label={t('pathwayRemoveItem')} title={t('pathwayRemoveItem')} onClick={() => removeSection(index)}><Trash2 className="size-3" /></button>
      </li>)}</ol>
      <div className="flex gap-2"><input className={`${control} flex-1`} value={section} onChange={event => setSection(event.target.value)} maxLength={300} placeholder={t('lectureSectionTitle')} aria-label={t('lectureSectionTitle')} dir="auto" /><button type="button" className={button} disabled={!section.trim()} onClick={addSection}><Plus className="size-4" />{t('lectureAddSection')}</button></div>
    </section>
    <section className="space-y-2">
      <h3 className="text-sm font-bold">{t('lectureNotes')}</h3>
      {linked.length === 0 && <p className="text-xs text-muted">{t('lectureNoNotes')}</p>}
      <ul className="space-y-1">{linked.map(({ note: item, link, seconds }) => <li key={`${item.id}-${link.start}`} className="flex items-center gap-2 text-sm">
        <button type="button" className="underline" onClick={() => go(seconds)}><bdi>{clockTime(seconds)}</bdi></button>
        <button type="button" dir="auto" className="min-w-0 truncate text-start" onClick={() => openStudyNote({ id: item.id })}>{item.title || item.content.replace(/\[\[[^\]]+\]\]/gu, '').trim().slice(0, 80)}</button>
      </li>)}</ul>
    </section>
  </div>;
}

/** Local lectures and talks. Audiobooks stay in the reader, paired with their text. */
export function LecturesView() {
  const { t, dir } = useWorkspace();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [selected, setSelected] = useState<{ id: string; seek: number | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const api = window.electronAPI.lectures;
  useEffect(() => {
    const open = () => { const target = consumeLecture(); if (target) setSelected({ id: target.id, seek: target.seconds }); };
    void api.list().then(rows => { setLectures(rows); open(); }).catch(() => setFailed(true));
    window.addEventListener(LECTURE_OPEN_EVENT, open);
    return () => window.removeEventListener(LECTURE_OPEN_EVENT, open);
  }, [api]);
  const lecture = lectures.find(item => item.id === selected?.id);
  const add = () => { void api.add().then(added => { setLectures(current => [...current, ...added]); if (added[0]) setSelected({ id: added[0].id, seek: null }); }).catch(() => setFailed(true)); };
  const remove = (id: string) => { if (window.confirm(t('lectureRemoveConfirm'))) void api.remove(id).then(() => { setLectures(current => current.filter(item => item.id !== id)); setSelected(null); }).catch(() => setFailed(true)); };

  return <div dir={dir} className="flex-1 min-h-0 overflow-auto bg-canvas p-4 sm:p-6">
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3"><Clapperboard className="size-6 text-pale-sky-600 shrink-0 mt-1" /><div><h1 className="font-display text-xl font-bold leading-relaxed">{t('lecturesTitle')}</h1><p className="text-xs text-muted leading-relaxed">{t('lecturesIntro')}</p></div></div>
        <button type="button" className={button} onClick={add}><Plus className="size-4" />{t('lectureAdd')}</button>
      </header>
      {failed && <p role="alert" className="text-sm">{t('pathwayError')}</p>}
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <ul className="space-y-1 min-w-0">{lectures.length === 0 && <li className="text-sm text-muted">{t('lecturesEmpty')}</li>}{lectures.map(item => <li key={item.id} className="flex items-center gap-1">
          <button type="button" aria-current={item.id === selected?.id} onClick={() => setSelected({ id: item.id, seek: null })} className={`flex-1 min-w-0 rounded-lg border px-3 py-2 text-start ${item.id === selected?.id ? 'border-pale-sky-500 bg-surface' : 'border-subtle'}`}><span dir="auto" className="block truncate text-sm font-bold">{item.title}</span><span className="block text-xs text-muted">{t(item.kind === 'audio' ? 'lectureAudio' : 'lectureVideo')} · <bdi>{item.path.split('.').pop()?.toUpperCase()}</bdi>{item.sections.length > 0 && ` · ${t('lectureSectionCount', { count: item.sections.length })}`}</span></button>
          <button type="button" className="p-1.5 rounded-lg border border-subtle" aria-label={t('lectureRemove')} title={t('lectureRemove')} onClick={() => remove(item.id)}><Trash2 className="size-3" /></button>
        </li>)}</ul>
        <main className="min-w-0 rounded-xl border border-subtle bg-surface p-4">
          {lecture ? <Player key={`${lecture.id}:${selected?.seek}`} lecture={lecture} seek={selected?.seek ?? null} onChanged={updated => setLectures(current => current.map(item => item.id === updated.id ? updated : item))} /> : <p className="text-sm text-muted">{t('lecturePick')}</p>}
        </main>
      </div>
    </div>
  </div>;
}
