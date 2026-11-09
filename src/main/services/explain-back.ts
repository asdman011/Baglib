import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ISettingsRepository } from '../database/repositories/settings.repository';
import type { AssistantSource } from '../../shared/study-assistant';
import { ExplainCheck, ExplainAcceptance, ExplainRequest, VERDICTS, segmentClaims, validateExplainRequest, validateExplainVerdicts, verdictKey } from '../../shared/explain-back';
import { StudyNotesService } from './study-notes';
import { PracticeService } from './practice';
import { translations } from '../../renderer/translations';
const PREFIX='study.explain-back.v1:';
type Draft=ExplainCheck&{language:'ar'|'en'};
export class ExplainBackService {
 constructor(private db:Database,private settings:ISettingsRepository,private read:(target:string)=>Promise<AssistantSource[]>,private generate:(request:ExplainRequest,claims:string[],source:AssistantSource)=>Promise<string>){}
 async check(input:unknown):Promise<ExplainCheck>{
  const request=validateExplainRequest(input),sources=await this.read(request.target);
  if(sources.length!==1||sources[0].target!==request.target)throw new Error('missing-source');
  const source=sources[0];
  if(source.text.trim().length<30)throw new Error('passage-too-short');
  // Refuse oversized context rather than silently comparing against a truncated passage.
  if(source.text.length>60000)throw new Error('passage-too-long');
  const claims=segmentClaims(request.summary);
  const verdicts=validateExplainVerdicts(await this.generate(request,claims,source),claims,sources);
  return this.db.transaction(()=>{
   const id=randomUUID(),check={id,target:request.target,summary:request.summary,verdicts};
   this.db.prepare("INSERT INTO practice_attempt(id,question_kind,answer_text,result,check_method,source_ref,context,created_at) VALUES(?,'explain_back',?,'pending','judgment',?,'practice',?)").run(id,request.summary,request.target,new Date().toISOString());
   this.settings.set(PREFIX+id,{...check,language:request.language});
   // Keep only 20 resumable comparison drafts. Attempts themselves are retained by ADR-013.
   const stale=this.db.prepare("SELECT key FROM app_settings WHERE key LIKE 'study.explain-back.v1:%' ORDER BY updated_at DESC,rowid DESC LIMIT -1 OFFSET 20").all() as {key:string}[];
   for(const row of stale)this.settings.delete(row.key);
   return check;
  })();
 }
 resume(id:unknown):ExplainCheck {
  if(typeof id!=='string'||id.length>180)throw new Error('invalid-request');
  const draft=this.settings.get<Draft>(PREFIX+id);
  const pending=this.db.prepare("SELECT 1 FROM practice_attempt WHERE id=? AND result='pending' AND check_method='judgment'").get(id);
  if(!draft||!pending)throw new Error('attempt-changed');
  return {id:draft.id,target:draft.target,summary:draft.summary,verdicts:draft.verdicts};
 }
 accept(input:ExplainAcceptance){
  if(!input||typeof input.id!=='string'||input.id.length>180)throw new Error('invalid-request');
  return this.db.transaction(()=>{
   const draft=this.settings.get<Draft>(PREFIX+input.id);
   if(!draft)throw new Error('attempt-changed');
   if(!Array.isArray(input.decisions)||input.decisions.length!==draft.verdicts.length||input.decisions.some(v=>!VERDICTS.includes(v)))throw new Error('invalid-request');
   const accepted=draft.verdicts.map((v,i)=>({...v,status:input.decisions[i]}));
   const count=accepted.filter(v=>v.status==='supported').length;
   const result=count===accepted.length?'correct':count===0?'incorrect':'partial';
   const attempt=new PracticeService(this.db).judge({id:input.id,result});
   const t=translations[draft.language];
   const clean=(s:string)=>s.replace(/[\r\n[\]|]/gu,' ');
   const content=[t.explainBackTitle,'',draft.summary,'',t.explainBackJudgment,'',...accepted.flatMap(v=>[
    '- '+t[verdictKey(v.status)]+': '+v.claim,
    '  [['+draft.target+'|'+clean(v.citation.label)+']]: «'+v.citation.quote+'»'
   ])].join('\n');
   const note=new StudyNotesService(this.settings,this.db).save({title:t.explainBackTitle,content,aliases:[],tags:[]});
   this.settings.delete(PREFIX+input.id);
   return {attempt,note};
  })();
 }
}
