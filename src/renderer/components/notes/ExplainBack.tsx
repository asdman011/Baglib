'use client';
import React, {useRef, useState} from 'react';
import {useWorkspace} from '../context/WorkspaceContext';
import {VERDICTS, verdictKey, type ExplainCheck, type VerdictStatus} from '../../../shared/explain-back';
import type {TranslationKey} from '../../translations';
import { Modal } from '../ui/Modal';
const errors:Record<string,TranslationKey>={
 'no-text-layer':'assistantNoTextLayer','passage-too-short':'explainBackShort','passage-too-long':'explainBackLong',
 'missing-source':'assistantMissingBookSource','missing-page':'assistantMissingBookPage','permission-denied':'assistantErrorRemote',
 'ai-disabled':'assistantErrorDisabled','invalid-output':'assistantErrorUnchecked','invalid-request':'assistantErrorRequest','busy':'assistantErrorBusy',
 'warsh-not-installed':'assistantWarshMissing','attempt-changed':'assistantErrorRequest',
};
export function ExplainBack({target,label,initialCheck,onClose,onOpen}:{target:string;label:string;initialCheck?:ExplainCheck;onClose:()=>void;onOpen:(target:string)=>void}){
 const {t,lang,dir}=useWorkspace();
 const [summary,setSummary]=useState(initialCheck?.summary??''),[allowRemote,setAllowRemote]=useState(false),[busy,setBusy]=useState(false);
 const [check,setCheck]=useState<ExplainCheck|null>(initialCheck??null),[error,setError]=useState<string|null>(null),[saved,setSaved]=useState(false);
 const [decisions,setDecisions]=useState<(VerdictStatus|null)[]>(initialCheck?.verdicts.map(()=>null)??[]);
 const locked=useRef(false);
 async function run(){if(locked.current)return;locked.current=true;setBusy(true);setError(null);
  try{const r=await window.electronAPI.studyAssistant.explainBack({target,summary,allowRemote,language:lang==='ar'?'ar':'en'});
   if(r.ok){setCheck(r.data);setDecisions(r.data.verdicts.map(()=>null));window.dispatchEvent(new CustomEvent('baglib:practice-recorded'));}else setError(r.error);
  }catch{setError('engine-failed');}finally{locked.current=false;setBusy(false);}
 }
 async function save(){if(!check||locked.current)return;locked.current=true;setBusy(true);setError(null);
  try{const r=await window.electronAPI.studyAssistant.acceptExplainBack({id:check.id,decisions:decisions as VerdictStatus[]});
   if(r.ok){setSaved(true);window.dispatchEvent(new CustomEvent('baglib:practice-recorded'));}else setError(r.error);
  }catch{setError('engine-failed');}finally{locked.current=false;setBusy(false);}
 }
 const field='w-full rounded-lg border border-subtle bg-canvas p-2 text-start leading-loose';
 return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-2 sm:p-4" dir={dir}>
  <Modal asChild open={true} onClose={() => { if (!busy) onClose(); }} label={t('explainBackTitle')}><div role="dialog" aria-modal="true" aria-labelledby="explain-back-title" data-explain-back className="flex max-h-full w-full max-w-3xl flex-col rounded-2xl border border-subtle bg-surface text-main shadow-2xl" >
   <header className="flex items-center gap-3 border-b border-subtle p-3"><h2 id="explain-back-title" className="font-bold">{t('explainBackTitle')}</h2><button type="button" disabled={busy} onClick={onClose} className="ms-auto rounded-lg border border-subtle px-3 py-1.5">{t('close')}</button></header>
   <div className="min-h-0 space-y-4 overflow-y-auto p-4 text-sm leading-loose">
    <p>{t('explainBackIntro')}</p><button type="button" data-explain-source={target} onClick={()=>onOpen(target)} className="max-w-full break-all text-start underline" dir="auto">{label}</button>
    <label className="block">{t('explainBackSummary')}<textarea data-explain-summary dir="auto" value={summary} disabled={busy||Boolean(check)} maxLength={6000} rows={4} onChange={e=>setSummary(e.target.value)} className={field}/></label>
    {!check&&<><label className="flex items-start gap-2"><input type="checkbox" checked={allowRemote} onChange={e=>setAllowRemote(e.target.checked)} disabled={busy} className="mt-2"/>{t('assistantAllowRemote')}</label>
    <button type="button" data-explain-check disabled={busy||!summary.trim()} onClick={()=>void run()} className="rounded-lg bg-amber-600 px-4 py-2 text-white disabled:opacity-40">{t(busy?'assistantWorking':'explainBackCheck')}</button></>}
    {error&&<p role="alert" data-explain-error={error} className="rounded-lg bg-red-500/10 p-2">{t(errors[error]??'assistantErrorEngine')}</p>}
    {check&&<section className="space-y-3" aria-live="polite"><p className="rounded-lg bg-amber-500/10 p-2 font-semibold">{t('explainBackJudgment')}</p>
     {check.verdicts.map((v,i)=><article key={i} data-explain-claim={i} className="min-w-0 space-y-2 rounded-xl border border-subtle p-3 break-words">
      <p dir="auto" className="whitespace-pre-wrap leading-loose">{v.claim}</p><p>{t(verdictKey(v.status))}</p>
      <blockquote dir="auto" className="border-s-2 border-amber-500 ps-3 leading-loose">«{v.citation.quote}»</blockquote>
      <label className="block">{t('explainBackCorrection')}<select aria-label={t('explainBackCorrection')} data-explain-decision={i} value={decisions[i]??''} disabled={busy||saved} onChange={e=>setDecisions(current=>current.map((value,index)=>index===i?e.target.value as VerdictStatus:value))} className={field}>
       <option value="" disabled>{t('explainBackJudgment')}</option>{VERDICTS.map(status=><option key={status} value={status}>{t(verdictKey(status))}</option>)}
      </select></label>
      <button type="button" data-explain-accept={i} disabled={busy||saved||decisions[i]!==null} onClick={()=>setDecisions(current=>current.map((value,index)=>index===i?v.status:value))} className="rounded-lg border border-subtle px-3 py-1.5 disabled:opacity-50">{t(decisions[i]===null?'explainBackAccept':'explainBackConfirmed')}</button>
     </article>)}
     <button type="button" data-explain-save disabled={busy||saved||decisions.some(v=>v===null)} onClick={()=>void save()} className="rounded-lg bg-amber-600 px-4 py-2 text-white disabled:opacity-40">{t('explainBackSave')}</button>
     {saved&&<p role="status" data-explain-saved>{t('explainBackSaved')}</p>}
    </section>}
   </div>
  </div></Modal>
 </div>;
}
