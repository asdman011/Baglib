import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '../database/connection';
import { KnowledgeHistoryService, withKnowledgeHistory, headRevision } from '../services/knowledge-history';
import { ReadingLogService } from '../services/reading-log';
import { PersonalCommentaryService } from '../services/personal-commentary';
import { validCommentaryReference, validateCommentary } from '../../shared/personal-commentary';
import { SqliteKnowledgeRepository } from '../database/repositories/knowledge.repository';
import { StudyPlannerRepository } from '../database/repositories/study-planner.repository';
import { settingsRepository } from '../database/repositories/settings.repository';
import { librarySnapshotService } from '../services/sync/library-snapshot.service';
import type { ReflectionInput } from '../../shared/knowledge-history';

function authorize(event:IpcMainInvokeEvent) {
  const frame=event.senderFrame;
  if (!frame || frame!==event.sender.mainFrame) throw new Error('invalid-request');
  const url=new URL(frame.url);
  if (url.username || url.password || !(url.protocol==='app:' && url.hostname==='-' || url.protocol==='file:' && !url.hostname || url.origin==='http://localhost:3000')) throw new Error('invalid-request');
}
const identifier=(value:unknown):string=>{ if (typeof value!=='string' || !/^[\w-]{1,180}$/u.test(value)) throw new Error('invalid-request'); return value; };
export function registerKnowledgeHistoryIpc():void {
  ipcMain.handle('knowledge-history:request',(event,action:unknown,raw:unknown)=>{
    authorize(event);
    const input=(raw || {}) as Record<string,unknown>;
    const db=getDatabase(), history=new KnowledgeHistoryService(db);
    const changed=()=>{for (const window of BrowserWindow.getAllWindows()) if(!window.isDestroyed()) window.webContents.send('study-notes:changed');};
    const id=()=>identifier(input.id);
    const revision=(value:unknown)=>{if(!Number.isSafeInteger(value)||Number(value)<0) throw new Error('invalid-request');return Number(value);};
    switch(action) {
      case 'versions': return history.list(id(),input.before===undefined?undefined:revision(input.before));
      case 'snapshot': return history.read(id(),revision(input.revision));
      case 'restore': history.restore(id(),revision(input.revision),revision(input.expected),input.keepExistingAssociations===true);changed();return;
      case 'trash': return db.prepare("SELECT k.id,COALESCE(s.title,n.content,r.review,c.front,'') AS title FROM knowledge k LEFT JOIN study_note_detail s ON s.knowledge_id=k.id LEFT JOIN note_detail n ON n.knowledge_id=k.id LEFT JOIN reading_reflection_detail r ON r.knowledge_id=k.id LEFT JOIN card_detail c ON c.knowledge_id=k.id WHERE k.deleted_at IS NOT NULL ORDER BY k.deleted_at DESC LIMIT 500").all().map(row=>({...row as object,revision:headRevision(db,(row as {id:string}).id)}));
      case 'erase': {
        const target=id();
        if (input.removeManagedBackups!==true) throw new Error('backup-consent-required');
        if (!db.prepare('SELECT 1 FROM knowledge WHERE id=? AND deleted_at IS NOT NULL').get(target)) throw new Error('invalid-request');
        for (const [directory,pattern] of [[path.join(path.dirname(db.name),'migration-backups'),/^before-migration-.*\.db$/u],[librarySnapshotService.getSnapshotsDirectory(),/^Baglib-Backup-.*\.zip$/u]] as const) {
          if (!fs.existsSync(directory)) continue;
          for (const file of fs.readdirSync(directory)) if (pattern.test(file) && fs.lstatSync(path.join(directory,file)).isFile()) fs.unlinkSync(path.join(directory,file));
        }
        history.erase(target);changed();return;
      }
      case 'capture-enabled': return settingsRepository.get<boolean>('knowledge.questions.enabled',false)===true;
      case 'capture-set': if(typeof input.enabled!=='boolean') throw new Error('invalid-request');settingsRepository.set('knowledge.questions.enabled',input.enabled);return;
      case 'conversion-report': return {...settingsRepository.get('study.note.conversion-report',{converted:0,issues:[]}),historyBytes:(db.prepare('SELECT COALESCE(SUM(byte_length),0) AS bytes FROM history_blob').get() as {bytes:number}).bytes,historyVersions:(db.prepare('SELECT COUNT(*) AS count FROM entity_version').get() as {count:number}).count};
      case 'questions': return db.prepare("SELECT k.id,q.question_text AS text,q.status,q.source_ref AS source FROM question_detail q JOIN knowledge k ON k.id=q.knowledge_id WHERE k.deleted_at IS NULL ORDER BY k.updated_at DESC LIMIT 500").all().map(rawRow=>{
        const row=rawRow as {id:string;text:string;status:string;source:string|null};
        const sourceId=row.source?.startsWith('note:')?row.source.slice(5):null;
        const source=sourceId ? db.prepare('SELECT COALESCE(s.content,n.content,r.review) AS content FROM knowledge k LEFT JOIN study_note_detail s ON s.knowledge_id=k.id LEFT JOIN note_detail n ON n.knowledge_id=k.id LEFT JOIN reading_reflection_detail r ON r.knowledge_id=k.id WHERE k.id=? AND k.deleted_at IS NULL').get(sourceId) as {content:string}|undefined : undefined;
        const commentPresent=sourceId?Boolean(db.prepare('SELECT 1 FROM comment WHERE knowledge_id=? AND instr(content,?)>0 LIMIT 1').get(sourceId,row.text)):false;
        return {...row,sourcePresent:Boolean(source?.content?.includes(row.text)||commentPresent)};
      });
      case 'question-set': {
        const target=id(),status=input.status;
        if(!['open','answered','dismissed'].includes(String(status))) throw new Error('invalid-request');
        withKnowledgeHistory(db,[target],'question-status',()=>db.prepare('UPDATE question_detail SET status=?,answered_at=? WHERE knowledge_id=?').run(status,status==='answered'?new Date().toISOString():null,target));changed();return;
      }
      case 'commentary-list': if(!validCommentaryReference(input.reference)) throw new Error('invalid-request');return new PersonalCommentaryService(db).list(input.reference);
      case 'commentary-search': if(typeof input.query!=='string'||input.query.length>200) throw new Error('invalid-request');return new PersonalCommentaryService(db).search(input.query);
      case 'commentary-save': new PersonalCommentaryService(db).save(validateCommentary(raw));changed();return;
      case 'commentary-remove': {const removed=new PersonalCommentaryService(db).remove(id());changed();return removed;}
      case 'reading': return new ReadingLogService(db).read(identifier(input.workId));
      case 'reflection-save': new ReadingLogService(db).save(raw as ReflectionInput);changed();return;
      case 'action': {
        const target=id(), title=input.title;
        if(typeof title!=='string'||!title.trim()||title.length>300) throw new Error('invalid-request');
        if(!db.prepare('SELECT 1 FROM knowledge WHERE id=? AND deleted_at IS NULL').get(target)) throw new Error('invalid-request');
        new StudyPlannerRepository(db).save({title,description:'',status:'open',startDate:null,dueDate:null,priority:0,sortOrder:0,references:[{target:`note:${target}`,label:title}]});changed();return;
      }
      case 'quote': {
        const target=id(),text=input.text;
        if(typeof text!=='string'||!text.trim()||text.length>100000) throw new Error('invalid-request');
        const source=db.prepare('SELECT work_id FROM knowledge WHERE id=? AND deleted_at IS NULL').get(target) as {work_id:string}|undefined;
        if(!source) throw new Error('invalid-request');
        new SqliteKnowledgeRepository(db).saveKnowledge({workId:source.work_id,knowledgeType:'quote',location:`note:${target}`,quotedText:text,contextNote:`[[note:${target}]]`,projectToReader:false});changed();return;
      }
      case 'comment': {
        const target=id(),text=input.text;
        if(typeof text!=='string'||!text.trim()||text.length>100000) throw new Error('invalid-request');
        if(!db.prepare('SELECT 1 FROM knowledge WHERE id=? AND deleted_at IS NULL').get(target)) throw new Error('invalid-request');
        withKnowledgeHistory(db,[target],'comment',()=>db.prepare("INSERT INTO comment(id,knowledge_id,content,actor,created_at,updated_at) VALUES(?,?,?,'local',?,?)").run(randomUUID(),target,text,new Date().toISOString(),new Date().toISOString()));changed();return;
      }
      default: throw new Error('invalid-request');
    }
  });
}
