'use client';
import { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { KnowledgeVersion,VersionSnapshot } from '../../../shared/knowledge-history';
function text(snapshot:VersionSnapshot):string {
  const details=snapshot.details;
  return String(details.study_note_detail?.content ?? details.note_detail?.content ?? details.reading_reflection_detail?.review ?? details.question_detail?.question_text ?? details.card_detail?.front ?? snapshot.annotation?.note_content ?? '');
}
export function NoteHistory({id,onChanged}:{id:string;onChanged:()=>void}) {
  const {t,lang}=useWorkspace();
  const [versions,setVersions]=useState<KnowledgeVersion[]>([]);
  const [selected,setSelected]=useState<number|null>(null);
  const [comparison,setComparison]=useState<{old:VersionSnapshot;current:VersionSnapshot}|null>(null);
  const [failed,setFailed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [keep,setKeep]=useState(false);
  const [comment,setComment]=useState('');
  const [more,setMore]=useState(false);
  const [comments,setComments]=useState<Record<string,unknown>[]>([]);
  const logicalRevision=versions[0]?.restoredFrom ?? versions[0]?.revision ?? 0;
  const undoTarget=versions.find(version=>version.revision<logicalRevision&&version.action!=='restore');
  const redoTarget=[...versions].reverse().find(version=>version.revision>logicalRevision&&version.action!=='restore');
  const load=async()=>{
    try {const page=await window.electronAPI.knowledgeHistory.versions(id);setVersions(page);setMore(page.length===200);if(page[0]){const latest=await window.electronAPI.knowledgeHistory.snapshot(id,page[0].revision);setComments(latest.comments);}setFailed(false);} catch {setFailed(true);}
  };
  const choose=async(revision:number)=>{
    try {
      const all=await window.electronAPI.knowledgeHistory.versions(id);
      const [old,current]=await Promise.all([window.electronAPI.knowledgeHistory.snapshot(id,revision),window.electronAPI.knowledgeHistory.snapshot(id,all[0].revision)]);
      setVersions(previous=>[...all,...previous.filter(version=>version.revision<all[all.length-1].revision)]);setComparison({old,current});setSelected(revision);setFailed(false);
    } catch {setFailed(true);}
  };
  const restore=async(revision:number)=>{
    setBusy(true);
    try {await window.electronAPI.knowledgeHistory.restore(id,revision,versions[0].revision,keep);await load();setComparison(null);setSelected(null);onChanged();setFailed(false);} catch {setFailed(true);} finally {setBusy(false);}
  };
  return <details className="border-t border-subtle pt-2 text-xs" onToggle={event=>{if(event.currentTarget.open)void load();}} data-note-history={id}>
    <summary>{t('waveHistory')}</summary>
    {failed && <p role="alert" className="leading-loose">{t('waveConflict')}</p>}
    <p className="leading-loose text-muted">{t('waveRestoreHint')}</p>
    <ul className="space-y-2 max-h-48 overflow-auto">{comments.map(row=><li key={String(row.id)} dir="auto" className="whitespace-pre-wrap leading-loose border border-subtle rounded p-2">{String(row.content||'')}</li>)}</ul>
    <label className="block">{t('waveComment')}<textarea rows={2} dir="auto" value={comment} onChange={event=>setComment(event.target.value)} className="w-full bg-canvas border border-subtle p-2 rounded leading-loose"/></label><button disabled={!comment.trim()} onClick={()=>void window.electronAPI.knowledgeHistory.addComment(id,comment).then(()=>{setComment('');void load();onChanged();}).catch(()=>setFailed(true))}>{t('waveSaveComment')}</button>
    <label className="flex gap-2 items-start leading-loose"><input type="checkbox" checked={keep} onChange={event=>setKeep(event.target.checked)}/>{t('waveAssociationConsent')}</label>
    <div className="flex flex-wrap gap-2 my-2">
      <button disabled={busy||!undoTarget} onClick={()=>undoTarget&&void restore(undoTarget.revision)}>{t('waveUndo')}</button>
      <button disabled={busy||!versions[0]?.restoredFrom||!redoTarget} onClick={()=>redoTarget&&void restore(redoTarget.revision)}>{t('waveRedo')}</button>
    </div>
    <select aria-label={t('waveVersion')} value={selected??''} onChange={event=>void choose(Number(event.target.value))} className="w-full bg-canvas border border-subtle rounded p-2"><option value="" disabled>{t('waveVersion')}</option>{versions.map(version=><option key={version.revision} value={version.revision}>{version.revision} · {new Date(version.createdAt).toLocaleString(lang==='ar'?'ar-EG':'en-GB')}</option>)}</select>
    {more&&<button onClick={()=>void window.electronAPI.knowledgeHistory.versions(id,versions.at(-1)?.revision).then(page=>{setVersions(previous=>[...previous,...page]);setMore(page.length===200);}).catch(()=>setFailed(true))}>{t('waveOlder')}</button>}
    {comparison && <div className="space-y-2 mt-2"><div className="grid grid-cols-1 xl:grid-cols-2 gap-2"><section><h4>{t('wavePrevious')}</h4><p dir="auto" className="whitespace-pre-wrap break-words leading-loose max-h-64 overflow-auto">{text(comparison.old)}</p></section><section><h4>{t('waveCurrent')}</h4><p dir="auto" className="whitespace-pre-wrap break-words leading-loose max-h-64 overflow-auto">{text(comparison.current)}</p></section></div><details><summary>{t('waveMetadata')}</summary><pre dir="ltr" className="overflow-auto max-h-64 whitespace-pre-wrap break-all">{JSON.stringify({previous:comparison.old,current:comparison.current},null,2)}</pre></details><button disabled={busy||selected===null} onClick={()=>selected!==null&&void restore(selected)} className="rounded border border-subtle p-2">{t('waveRestore')}</button></div>}
  </details>;
}
