import { randomUUID } from 'node:crypto';
import type { ISettingsRepository } from '../database/repositories/settings.repository';
import type { StudyNote, StudyNoteInput } from '../../shared/study-notes';
import type { Database } from 'better-sqlite3';
import { SqliteKnowledgeRepository } from '../database/repositories/knowledge.repository';
import { headRevision, withKnowledgeHistory, trashKnowledge } from './knowledge-history';
import { importNotesFromMarkdown } from '../../shared/note-open-formats';
import { exportableStudyNotes } from '../../shared/study-note-export';
import type { ExportFile } from '../../shared/markdown-export';

const prefix = 'study.note.v1:';
export class StudyNotesService {
  constructor(private settings: ISettingsRepository,private db?: Database) {}
  list(id?:string): StudyNote[] {
    if (this.db) {
      const rows = this.db.prepare(`SELECT k.id,k.work_id AS workId,k.created_at AS createdAt,k.updated_at AS updatedAt,s.title,s.content,s.aliases_json AS aliases FROM knowledge k JOIN study_note_detail s ON s.knowledge_id=k.id WHERE k.deleted_at IS NULL ${id?'AND k.id=?':''} ORDER BY k.updated_at DESC`).all(...(id?[id]:[])) as (StudyNote & {aliases:string})[];
      return rows.map(row=>({...row,knowledgeId:row.id,aliases:JSON.parse(row.aliases),tags:(this.db!.prepare('SELECT t.name FROM tag t JOIN knowledge_tag j ON j.tag_id=t.id WHERE j.knowledge_id=? ORDER BY t.name').all(row.id) as {name:string}[]).map(tag=>tag.name),revision:headRevision(this.db!,row.id)}));
    }
    return Object.entries(this.settings.getAll()).filter(([key]) => key.startsWith(prefix))
      .map(([, note]) => note as StudyNote).filter(note => note && typeof note.id === 'string' && typeof note.content === 'string')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  save(input: StudyNoteInput): StudyNote {
    if (!input || typeof input.content !== 'string' || !input.content.trim() || input.content.length > 100_000 || typeof input.title !== 'string' || input.title.length > 300) throw new Error('invalid-note');
    if (input.id !== undefined && (typeof input.id !== 'string' || !/^[\w-]{1,180}$/u.test(input.id))) throw new Error('invalid-note');
    const strings = (values: string[]) => {
      if (!Array.isArray(values) || values.length > 50 || values.some(value => typeof value !== 'string' || value.length > 200)) throw new Error('invalid-note');
      return [...new Set(values.map(value => value.trim()).filter(Boolean))];
    };
    const id = input.id || randomUUID();
    if (this.db) {
      const db = this.db;
      const parent = db.prepare('SELECT edition_id,source_id,location FROM knowledge WHERE id=?').get(id) as {edition_id:string|null;source_id:string|null;location:string|null}|undefined;
      const aliases = strings(input.aliases), tags = strings(input.tags);
      withKnowledgeHistory(db,[id],'save',() => {
        const tagIds = tags.map(name=>{
          const tag = db.prepare('SELECT id FROM tag WHERE name=?').get(name) as {id:string}|undefined;
          if (tag) return tag.id;
          const tagId = randomUUID(); db.prepare("INSERT INTO tag(id,name,origin) VALUES(?,?,'manual')").run(tagId,name); return tagId;
        });
        const workId = input.workId && db.prepare('SELECT 1 FROM work WHERE id=?').get(input.workId) ? input.workId : null;
        new SqliteKnowledgeRepository(db).saveKnowledge({id,workId,editionId:parent?.edition_id,sourceId:parent?.source_id,knowledgeType:'study_note',location:parent?.location || '1',noteContent:input.content,title:input.title.trim(),aliases,tagIds,projectToReader:Boolean(workId),expectedRevision:input.expectedRevision});
        db.prepare('DELETE FROM note_detail WHERE knowledge_id=?').run(id);
      },input.expectedRevision===undefined?undefined:{id,revision:input.expectedRevision});
      return this.list(id)[0];
    }
    const previous = this.settings.get<StudyNote>(prefix + id);
    const now = new Date().toISOString();
    const note: StudyNote = { id, title: input.title.trim(), content: input.content, aliases: strings(input.aliases), tags: strings(input.tags), createdAt: previous?.createdAt || now, updatedAt: now };
    if (input.workId) {
      if (typeof input.workId !== 'string' || !/^[\w-]{1,180}$/u.test(input.workId)) throw new Error('invalid-note');
      note.workId = input.workId;
    }
    this.settings.set(prefix + id, note);
    return note;
  }
  remove(id: string): void {
    if (typeof id !== 'string' || !/^[\w-]{1,180}$/u.test(id)) throw new Error('invalid-note');
    if (this.db) { trashKnowledge(this.db,id); return; }
    this.settings.delete(prefix + id);
  }
  importMarkdown(files: ExportFile[]): { count: number } {
    const notes = importNotesFromMarkdown(files);
    const apply = () => {
      const repository = this.db ? new SqliteKnowledgeRepository(this.db) : undefined;
      const knowledge = repository?.getAllKnowledge() ?? [];
      const existing = new Map(exportableStudyNotes(this.list(), knowledge).map(note => [note.id, note]));
      for (const note of notes) {
        const previous = existing.get(note.id);
        if (previous && note.title === previous.title && note.content === previous.content &&
          JSON.stringify(note.aliases) === JSON.stringify(previous.aliases) &&
          JSON.stringify([...note.tags].sort()) === JSON.stringify([...previous.tags].sort()) &&
          (!note.workId || note.workId === previous.workId)) continue;
        if (this.db && repository) {
          const collision = this.db.prepare('SELECT knowledge_type,deleted_at FROM knowledge WHERE id=?').get(note.id) as { knowledge_type: string; deleted_at: string | null } | undefined;
          if (collision && (collision.deleted_at || !['study_note', 'note', 'reading_reflection'].includes(collision.knowledge_type))) throw new Error('import-id-conflict');
          const item = knowledge.find(item => item.id === note.id);
          withKnowledgeHistory(this.db, [note.id], 'save', () => {
            if (item && item.knowledgeType !== 'study_note') {
              const tagIds = note.tags.map(name => {
                const tag = this.db!.prepare('SELECT id FROM tag WHERE name=?').get(name) as { id: string } | undefined;
                if (tag) return tag.id;
                const id = randomUUID();
                this.db!.prepare("INSERT INTO tag(id,name,origin) VALUES(?,?,'manual')").run(id, name);
                return id;
              });
              const reflection = item.knowledgeType === 'reading_reflection'
                ? this.db!.prepare('SELECT entry_date AS entryDate,mood,difficulty,rating,recommendations,lessons FROM reading_reflection_detail WHERE knowledge_id=?').get(note.id) as Record<string, string | number | null>
                : {};
              repository.saveKnowledge({ ...item, ...reflection, noteContent: note.content, tagIds });
            } else {
              this.save({ ...note, workId: note.workId ?? previous?.workId });
            }
            this.db!.prepare('UPDATE knowledge SET created_at=?,updated_at=? WHERE id=?').run(previous?.createdAt ?? note.createdAt, note.updatedAt, note.id);
          });
        } else {
          const saved = this.save({ ...note, workId: note.workId ?? previous?.workId });
          this.settings.set(prefix + note.id, { ...saved, createdAt: previous?.createdAt ?? note.createdAt, updatedAt: note.updatedAt });
        }
      }
      return { count: notes.length };
    };
    return this.db ? this.db.transaction(apply)() : apply();
  }
  convertLegacy(): {converted:number;issues:{key:string;reason:string}[]} {
    const report = {converted:0,issues:[] as {key:string;reason:string}[]};
    if (!this.db) return report;
    const db = this.db;
    const annotations=db.prepare("SELECT a.* FROM annotations a WHERE a.type='note' AND NOT EXISTS(SELECT 1 FROM knowledge k WHERE k.id=a.id)").all() as {id:string;book_id:string|null;location_cfi_or_page:string;note_content:string|null;created_at:string;updated_at:string;former_work_title:string|null}[];
    for(const note of annotations) {
      try {
        withKnowledgeHistory(db,[note.id],'conversion',()=>{
          const workId=note.book_id&&db.prepare('SELECT 1 FROM work WHERE id=?').get(note.book_id)?note.book_id:null;
          db.prepare("INSERT INTO knowledge(id,work_id,knowledge_type,location,created_at,updated_at,former_work_title) VALUES(?,?,'note',?,?,?,?)").run(note.id,workId,note.location_cfi_or_page,note.created_at,note.updated_at,note.former_work_title);
          db.prepare('INSERT INTO note_detail(knowledge_id,content) VALUES(?,?)').run(note.id,note.note_content || '');
        });report.converted++;
      }catch{report.issues.push({key:`annotations:${note.id}`,reason:'conversion-conflict'});}
    }
    const rows = db.prepare("SELECT key,value FROM app_settings WHERE key LIKE 'study.note.v1:%' ORDER BY key").all() as {key:string;value:string}[];
    for (const row of rows) {
      try {
        const id = row.key.slice(prefix.length);
        if (this.settings.get(`study.note.converted:${id}`)) continue;
        const note = JSON.parse(row.value) as StudyNote;
        if (note.id!==id || typeof note.createdAt!=='string' || typeof note.updatedAt!=='string') throw new Error('invalid-note');
        const existing = db.prepare('SELECT k.knowledge_type,n.content FROM knowledge k LEFT JOIN note_detail n ON n.knowledge_id=k.id WHERE k.id=?').get(id) as {knowledge_type:string;content:string}|undefined;
        if (existing && (existing.knowledge_type!=='note' || existing.content!==note.content)) throw new Error('conversion-conflict');
        withKnowledgeHistory(db,[id],'conversion',()=>{
          this.save(note);
          db.prepare('UPDATE knowledge SET created_at=?,updated_at=? WHERE id=?').run(note.createdAt,note.updatedAt,id);
          this.settings.set(`study.note.converted:${id}`,true);
        });
        report.converted++;
      } catch (error) { report.issues.push({key:row.key,reason:error instanceof Error ? error.message : 'invalid-note'}); }
    }
    this.settings.set('study.note.conversion-report',report);
    return report;
  }
}
