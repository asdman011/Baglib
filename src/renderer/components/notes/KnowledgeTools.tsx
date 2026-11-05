'use client';
import { useCallback,useEffect,useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { openStudyNote } from '../../utils/study-navigation';
import type { CapturedQuestion } from '../../../shared/knowledge-history';

export function KnowledgeTools() {
  const {t}=useWorkspace();
  const [questions,setQuestions]=useState<CapturedQuestion[]>([]);
  const [trash,setTrash]=useState<{id:string;title:string;revision:number}[]>([]);
  const [enabled,setEnabled]=useState(false);
  const [issues,setIssues]=useState<{key:string;reason:string}[]>([]);
  const [failed,setFailed]=useState(false);
  const [showDismissed,setShowDismissed]=useState(false);
  const [usage,setUsage]=useState({bytes:0,versions:0});
  const refresh=useCallback(async()=>{
    if(!window.electronAPI?.knowledgeHistory)return;
    try {
      const api=window.electronAPI.knowledgeHistory;
      const [items,deleted,preference,report]=await Promise.all([api.questions(),api.trash(),api.captureEnabled(),api.conversionReport()]);
      setQuestions(items);setTrash(deleted);setEnabled(preference);setIssues(report.issues);setUsage({bytes:report.historyBytes||0,versions:report.historyVersions||0});setFailed(false);
    }catch {setFailed(true);}
  },[]);
  useEffect(()=>{const timer=setTimeout(()=>void refresh(),0);const update=()=>void refresh();const unsubscribe=window.electronAPI?.studyNotes?.onChanged(update);window.addEventListener('baglib:knowledge-card-saved',update);window.addEventListener('baglib:notes-changed',update);return()=>{clearTimeout(timer);unsubscribe?.();window.removeEventListener('baglib:knowledge-card-saved',update);window.removeEventListener('baglib:notes-changed',update);};},[refresh]);
  const act=async(action:()=>Promise<unknown>)=>{try{await action();await refresh();window.dispatchEvent(new CustomEvent('baglib:notes-changed'));}catch{setFailed(true);}};
  return <section data-knowledge-tools className="space-y-3 border border-subtle rounded-xl p-3">
    <p className="text-xs text-muted">{t('waveHistoryUsage',{versions:usage.versions,bytes:usage.bytes})}</p>
    {failed&&<p role="alert">{t('waveFailed')}</p>}
    {issues.length>0&&<details><summary>{t('waveConversionIssues',{count:issues.length})}</summary><p>{t('waveLegacyKept')}</p><ul>{issues.map(issue=><li key={issue.key}><code>{issue.key}</code></li>)}</ul></details>}
    <h3 className="font-bold">{t('waveQuestions')}</h3>
    <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={enabled} onChange={event=>void act(()=>window.electronAPI.knowledgeHistory.setCapture(event.target.checked))}/>{t('waveCapture')}</label>
    <p className="text-xs text-muted">{t('waveCaptureHint')}</p>
    <label className="text-xs"><input type="checkbox" checked={showDismissed} onChange={event=>setShowDismissed(event.target.checked)}/>{t('waveShowDismissed')}</label>
    <ul className="space-y-2">{questions.filter(question=>showDismissed||question.status!=='dismissed').map(question=><li key={question.id} data-captured-question={question.id} className="border border-subtle rounded p-2 text-sm"><p dir="auto" className="leading-loose">{question.text}</p>{question.source&&<button className="underline text-xs" onClick={()=>openStudyNote({id:question.source!.slice(5)})}>{t('waveSource')}</button>}{question.source&&!question.sourcePresent&&<p className="text-xs text-muted">{t('waveSourceChanged')}</p>}<div className="flex gap-2 mt-2"><button onClick={()=>void act(()=>window.electronAPI.knowledgeHistory.setQuestion(question.id,question.status==='open'?'answered':'open'))}>{t(question.status==='open'?'waveAnswered':'waveReopen')}</button><button onClick={()=>void act(()=>window.electronAPI.knowledgeHistory.setQuestion(question.id,'dismissed'))}>{t('waveDismiss')}</button></div></li>)}</ul>
    <details><summary>{t('waveTrash')} ({trash.length})</summary><p className="text-xs leading-loose">{t('waveEraseHint')}</p><ul className="space-y-2">{trash.map(note=><li key={note.id} data-trash-note={note.id} className="border border-subtle p-2 rounded"><p dir="auto" className="line-clamp-2 leading-loose">{note.title}</p><div className="flex gap-3 text-sm"><button onClick={()=>void act(async()=>{const versions=await window.electronAPI.knowledgeHistory.versions(note.id);for(const version of versions){const snapshot=await window.electronAPI.knowledgeHistory.snapshot(note.id,version.revision);if(snapshot.knowledge&&!snapshot.knowledge.deleted_at){try{await window.electronAPI.knowledgeHistory.restore(note.id,version.revision,versions[0].revision,false);}catch(error){if(!String(error).includes('history-associations')||!window.confirm(t('waveAssociationConsent')))throw error;await window.electronAPI.knowledgeHistory.restore(note.id,version.revision,versions[0].revision,true);}return;}}throw new Error('invalid-history');})}>{t('waveRestore')}</button><button className="text-red-600" onClick={()=>{if(window.confirm(t('waveEraseConfirm')))void act(()=>window.electronAPI.knowledgeHistory.erase(note.id,true));}}>{t('waveErase')}</button></div></li>)}</ul></details>
  </section>;
}
