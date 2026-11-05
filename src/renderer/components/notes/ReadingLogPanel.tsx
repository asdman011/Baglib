'use client';
import { useCallback,useEffect,useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { BookReadingLog,ReflectionInput } from '../../../shared/knowledge-history';
import { NoteHistory } from './NoteHistory';

const empty={entryDate:'',mood:'',review:'',recommendations:'',lessons:''};
export function ReadingLogPanel({workId}:{workId:string}) {
  const {t,lang,setViewMode}=useWorkspace();
  const locale=lang==='ar'?'ar-EG':'en-GB';
  const [log,setLog]=useState<BookReadingLog|null>(null);
  const [form,setForm]=useState<Omit<ReflectionInput,'workId'>>(empty);
  const [failed,setFailed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [action,setAction]=useState('');
  const [quote,setQuote]=useState('');
  const [target,setTarget]=useState('');
  const refresh=useCallback(async()=>{
    if(!window.electronAPI?.knowledgeHistory)return;
    try{setLog(await window.electronAPI.knowledgeHistory.reading(workId));setFailed(false);}catch{setFailed(true);}
  },[workId]);
  useEffect(()=>{const timer=setTimeout(()=>{void refresh();setForm({...empty,entryDate:new Date().toLocaleDateString('en-CA')});},0);return()=>clearTimeout(timer);},[refresh]);
  const days=(count:number)=>{
    const form=new Intl.PluralRules(lang).select(count);
    return t(form==='one'?'waveDayOne':form==='two'?'waveDayTwo':form==='few'?'waveDayFew':'waveDayOther',{count});
  };
  const details=(reflection:BookReadingLog['reflections'][number])=>[reflection.mood,reflection.difficulty&&`${t('waveDifficulty')}: ${reflection.difficulty}`,reflection.rating&&`${t('waveRating')}: ${reflection.rating}`].filter(Boolean).join(' · ');
  const save=async()=>{
    setBusy(true);
    try{await window.electronAPI.knowledgeHistory.saveReflection({...form,workId});setForm({...empty,entryDate:form.entryDate});await refresh();window.dispatchEvent(new CustomEvent('baglib:notes-changed'));}catch{setFailed(true);}finally{setBusy(false);}
  };
  return <details data-reading-log className="border border-subtle rounded-xl p-3 space-y-3" onToggle={event=>{if(event.currentTarget.open)void refresh();}}>
    <summary className="font-bold">{t('waveReadingLog')}</summary>
    {failed&&<p role="alert">{t('waveFailed')}</p>}
    {log&&<div className="space-y-2 text-sm">
      <p>{t('waveMeasured',{seconds:log.seconds,pages:log.pages,sessions:log.sessions.length})}</p>
      <p>{t('waveSpeed')}: {log.secondsPerPage===null?t('waveUnknown'):new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(log.secondsPerPage)}</p>
      <p>{t(log.source==='sessions'?'waveSessionSource':log.source==='dwell'?'waveDwellSource':'waveNoMeasurements')}</p>
      <p>{t('waveFirstRead')}: <bdi>{log.firstRead?new Date(log.firstRead).toLocaleString(locale):t('waveUnknown')}</bdi></p>
      <p>{t('waveLastRead')}: <bdi>{log.lastRead?new Date(log.lastRead).toLocaleString(locale):t('waveUnknown')}</bdi></p>
      <p>{t('waveCompletion')}: <bdi>{log.completionDate?new Date(log.completionDate).toLocaleString(locale):t('waveUnknown')}</bdi></p>
      <p>{t('waveProgress')}: <bdi>{log.progress??t('waveUnknown')}</bdi> · <bdi>{log.location||t('waveUnknown')}</bdi></p>
      <p>{t('waveRhythm',{streak:days(log.streak),skipped:log.skippedDays})}</p>
      {log.partial&&<p>{t('wavePartial')}</p>}
      {!!log.quotes.length&&<details><summary>{t('waveQuote')}</summary><ul>{log.quotes.map(quote=><li key={quote.id} dir="auto" className="leading-loose whitespace-pre-wrap">{quote.text}</li>)}</ul></details>}
      {!!log.actions.length&&<details><summary>{t('waveAction')}</summary><ul>{log.actions.map(action=><li key={action.id}><button onClick={()=>setViewMode('planner')} dir="auto" className="underline leading-loose">{action.title}</button></li>)}</ul></details>}
      <details><summary>{t('waveSessions')}</summary><ol className="max-h-48 overflow-auto">{log.sessions.map(session=><li key={session.id}><bdi>{new Date(session.startedAt).toLocaleString()}</bdi> · {session.seconds} · {session.pages}</li>)}</ol></details>
      <ul className="space-y-2">{log.reflections.map(reflection=><li key={reflection.id} className="border border-subtle rounded p-2"><p dir="auto" className="whitespace-pre-wrap leading-loose">{reflection.review}</p>{details(reflection)&&<p dir="auto">{details(reflection)}</p>}<p dir="auto" className="leading-loose">{reflection.lessons}</p><p dir="auto" className="leading-loose">{reflection.recommendations}</p><button onClick={()=>{setForm({...reflection,mood:reflection.mood||'',rating:reflection.rating??undefined,difficulty:reflection.difficulty??undefined,expectedRevision:reflection.revision});setTarget(reflection.id);}}>{t('studyEdit')}</button><NoteHistory id={reflection.id} onChanged={()=>void refresh()}/></li>)}</ul>
    </div>}
    <div className="grid sm:grid-cols-2 gap-2 text-sm">
      <label>{t('waveDate')}<input type="date" value={form.entryDate} onChange={event=>setForm({...form,entryDate:event.target.value})} className="w-full bg-canvas border border-subtle rounded p-2"/></label>
      <label>{t('waveMood')}<input dir="auto" value={form.mood} onChange={event=>setForm({...form,mood:event.target.value})} className="w-full bg-canvas border border-subtle rounded p-2"/></label>
      <label>{t('waveDifficulty')}<input type="number" min={1} max={5} value={form.difficulty??''} onChange={event=>setForm({...form,difficulty:event.target.value?Number(event.target.value):undefined})} className="w-full bg-canvas border border-subtle rounded p-2"/></label>
      <label>{t('waveRating')}<input type="number" min={1} max={5} value={form.rating??''} onChange={event=>setForm({...form,rating:event.target.value?Number(event.target.value):undefined})} className="w-full bg-canvas border border-subtle rounded p-2"/></label>
      {(['review','recommendations','lessons'] as const).map(field=><label key={field} className="sm:col-span-2">{t(field==='review'?'waveReflection':field==='recommendations'?'waveRecommendations':'waveLessons')}<textarea data-reflection-field={field} dir="auto" rows={2} value={form[field]} onChange={event=>setForm({...form,[field]:event.target.value})} className="w-full bg-canvas border border-subtle rounded p-2 leading-loose"/></label>)}
    </div>
    <button type="button" disabled={busy||!form.entryDate||!form.review.trim()} onClick={()=>void save()} className="border border-subtle rounded p-2">{t('waveSaveReflection')}</button>
    {!!log?.reflections.length&&<div className="space-y-2 border-t border-subtle pt-2 text-sm"><select aria-label={t('waveReflection')} value={target} onChange={event=>setTarget(event.target.value)} className="w-full bg-canvas p-2"><option value="">{t('waveChooseReflection')}</option>{log.reflections.map(reflection=><option key={reflection.id} value={reflection.id}>{reflection.entryDate} · {reflection.review.slice(0,80)}</option>)}</select><label>{t('waveAction')}<input value={action} onChange={event=>setAction(event.target.value)} className="w-full bg-canvas border border-subtle rounded p-2"/></label><button disabled={!target||!action.trim()} onClick={()=>void window.electronAPI.knowledgeHistory.addAction(target,action).then(()=>setAction('')).catch(()=>setFailed(true))}>{t('waveAddAction')}</button><label>{t('waveQuote')}<textarea dir="auto" rows={2} value={quote} onChange={event=>setQuote(event.target.value)} className="w-full bg-canvas border border-subtle rounded p-2 leading-loose"/></label><button disabled={!target||!quote.trim()} onClick={()=>void window.electronAPI.knowledgeHistory.addQuote(target,quote).then(()=>setQuote('')).catch(()=>setFailed(true))}>{t('waveSaveQuote')}</button></div>}
  </details>;
}
