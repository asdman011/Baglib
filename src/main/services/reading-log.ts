import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { BookReadingLog, ReflectionInput } from '../../shared/knowledge-history';
import { SqliteKnowledgeRepository } from '../database/repositories/knowledge.repository';
import { headRevision } from './knowledge-history';
import { civilDate } from '../../shared/study-planner';

export class ReadingLogService {
  constructor(private db:Database) {}
  read(workId:string):BookReadingLog {
    const work = this.db.prepare('SELECT title,reading_progress,last_read_location FROM work WHERE id=?').get(workId) as {title:string;reading_progress:number|null;last_read_location:string|null}|undefined;
    const rows = this.db.prepare('SELECT id,started_at AS startedAt,ended_at AS endedAt,pages_read AS pages,former_work_title AS title FROM reading_session WHERE (work_id=? OR original_work_id=?) AND started_at IS NOT NULL AND ended_at IS NOT NULL AND julianday(ended_at)>julianday(started_at) ORDER BY started_at DESC LIMIT 10001').all(workId,workId) as {id:string;startedAt:string;endedAt:string;pages:number;title:string|null}[];
    const dwell = rows.length ? [] : this.db.prepare('SELECT id,start_time,duration,page FROM reading_page_stat WHERE id_book=? ORDER BY start_time DESC LIMIT 10001').all(workId) as {id:number;start_time:number;duration:number;page:number}[];
    const sessions = rows.length ? rows.slice(0,10000).map(row=>({id:row.id,startedAt:row.startedAt,endedAt:row.endedAt,pages:Math.max(0,row.pages||0),seconds:Math.max(0,Math.round((Date.parse(row.endedAt)-Date.parse(row.startedAt))/1000))})) : dwell.slice(0,10000).map(row=>({id:String(row.id),startedAt:new Date(row.start_time*1000).toISOString(),endedAt:new Date((row.start_time+row.duration)*1000).toISOString(),pages:0,seconds:row.duration}));
    const days = [...new Set(sessions.map(row=>civilDate(new Date(row.startedAt))))].sort();
    let streak=0,previous:number|null=null;
    for (const day of [...days].reverse()) { const time=Date.parse(day); if (previous!==null && previous-time!==86400000) break; streak++; previous=time; }
    const skippedDays=days.length ? Math.max(0,Math.round((Date.parse(days.at(-1)!)-Date.parse(days[0]))/86400000)+1-days.length) : 0;
    const reflections = this.db.prepare('SELECT k.id,r.entry_date AS entryDate,r.mood,r.difficulty,r.rating,r.review,r.recommendations,r.lessons FROM knowledge k JOIN reading_reflection_detail r ON r.knowledge_id=k.id WHERE k.deleted_at IS NULL AND (k.work_id=? OR (k.work_id IS NULL AND k.location=?)) ORDER BY r.entry_date DESC,k.id LIMIT 500').all(workId,`book:${workId}`) as BookReadingLog['reflections'];
    const completion=this.db.prepare('SELECT value FROM app_settings WHERE key=?').get(`reading.log.completed:${workId}`) as {value:string}|undefined;
    const seconds=sessions.reduce((sum,row)=>sum+row.seconds,0);
    const pages=rows.length?sessions.reduce((sum,row)=>sum+row.pages,0):new Set(dwell.map(row=>row.page)).size;
    const reflectionIds=this.db.prepare("SELECT 'note:'||id AS ref FROM knowledge WHERE knowledge_type='reading_reflection' AND deleted_at IS NULL AND (work_id=? OR location=?)").all(workId,`book:${workId}`) as {ref:string}[];
    const references=new Set(reflectionIds.map(row=>row.ref));
    const quotes=(this.db.prepare('SELECT k.id,k.location,q.quoted_text AS text FROM knowledge k JOIN quote_detail q ON q.knowledge_id=k.id WHERE k.deleted_at IS NULL AND (k.work_id=? OR k.work_id IS NULL) ORDER BY k.created_at DESC LIMIT 1000').all(workId) as {id:string;location:string;text:string}[]).filter(row=>references.has(row.location)).map(({id,text})=>({id,text}));
    const actions=(this.db.prepare('SELECT id,title,status,references_json FROM study_task ORDER BY created_at DESC LIMIT 5000').all() as {id:string;title:string;status:string;references_json:string}[]).filter(row=>{try{return (JSON.parse(row.references_json) as {target:string}[]).some(ref=>references.has(ref.target));}catch{return false;}}).map(({id,title,status})=>({id,title,status}));
    return {title:work?.title || rows[0]?.title || '',source:rows.length?'sessions':dwell.length?'dwell':'none',sessions,seconds,pages,secondsPerPage:pages?seconds/pages:null,firstRead:sessions.at(-1)?.startedAt||null,lastRead:sessions[0]?.endedAt||null,progress:work?.reading_progress??null,location:work?.last_read_location||null,completionDate:completion?.value||null,streak,skippedDays,partial:rows.length>10000||dwell.length>10000,reflections:reflections.map(row=>({...row,revision:headRevision(this.db,row.id)})),quotes,actions};
  }
  save(input:ReflectionInput):void {
    for (const value of [input.workId,input.entryDate,input.mood,input.review,input.recommendations,input.lessons]) if (typeof value!=='string' || value.length>100000) throw new Error('invalid-request');
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.entryDate) || Number.isNaN(Date.parse(input.entryDate)) || new Date(input.entryDate).toISOString().slice(0,10)!==input.entryDate) throw new Error('invalid-request');
    if (input.id!==undefined && (typeof input.id!=='string' || !/^[\w-]{1,180}$/u.test(input.id))) throw new Error('invalid-request');
    for (const value of [input.rating,input.difficulty]) if (value!==undefined && (!Number.isInteger(value)||value<1||value>5)) throw new Error('invalid-request');
    const existing = input.id ? this.db.prepare("SELECT work_id,location FROM knowledge WHERE id=? AND knowledge_type='reading_reflection'").get(input.id) as {work_id:string|null;location:string}|undefined : undefined;
    if (input.id && (!existing || existing.work_id!==input.workId && existing.location!==`book:${input.workId}`)) throw new Error('invalid-request');
    new SqliteKnowledgeRepository(this.db).saveKnowledge({id:input.id||randomUUID(),workId:existing?.work_id===null?null:input.workId,knowledgeType:'reading_reflection',location:`book:${input.workId}`,entryDate:input.entryDate,mood:input.mood,difficulty:input.difficulty,rating:input.rating,noteContent:input.review,recommendations:input.recommendations,lessons:input.lessons,expectedRevision:input.expectedRevision});
  }
}
