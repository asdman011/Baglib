import type { Database } from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { authoredQuestions } from '../../shared/question-capture';

type Row = Record<string, unknown>;
const detailTables = ['note_detail','highlight_detail','quote_detail','bookmark_detail','question_detail','card_detail','study_note_detail','reading_reflection_detail'];
interface Snapshot { knowledge: Row | null; details: Record<string, Row | null>; annotation: Row | null; tags: Row[]; collections: Row[]; comments: Row[]; workTitle: string | null; legacy:string|null }
export const NON_USER_HISTORY_ACTIONS = ['undo', 'redo', 'baseline', 'capture', 'conversion', 'book-detached'];
export interface MaterialHistoryState { redo: string[]; discarded: string[] }
export function parseMaterialHistory(raw: string | null | undefined): MaterialHistoryState {
  try {
    const value = raw ? JSON.parse(raw) : [];
    const strings = (input: unknown): string[] => Array.isArray(input) ? [...new Set(input.filter((id): id is string => typeof id === 'string'))] : [];
    return Array.isArray(value) ? { redo: strings(value), discarded: [] } : { redo: strings(value?.redo), discarded: strings(value?.discarded) };
  } catch { return { redo: [], discarded: [] }; }
}

/** Invalidating redo and recording a user batch share the same SQLite transaction. */
function invalidateRedo(db: Database, workIds: Set<string>) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='material_save_state'").get()) return;
  for (const workId of workIds) {
    const rows = db.prepare('SELECT m.source_id, m.redo_json FROM material_save_state m JOIN source s ON s.id=m.source_id JOIN edition e ON e.id=s.edition_id WHERE e.work_id=?').all(workId) as { source_id: string; redo_json: string | null }[];
    for (const row of rows) {
      const state = parseMaterialHistory(row.redo_json);
      if (!state.redo.length) continue;
      state.discarded = [...new Set([...state.discarded, ...state.redo])];
      state.redo = [];
      db.prepare('UPDATE material_save_state SET redo_json=?, updated_at=? WHERE source_id=?').run(JSON.stringify(state), new Date().toISOString(), row.source_id);
    }
  }
}

interface Context { before: Map<string, Snapshot>; action: string; batch: string }
const contexts = new WeakMap<Database, Context>();
export const historyAvailable = (db: Database) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='entity_version'").get());
export const headRevision = (db: Database, id: string): number => historyAvailable(db) ? (db.prepare("SELECT COALESCE(MAX(revision),0) AS revision FROM entity_version WHERE entity_type='knowledge' AND entity_id=?").get(id) as { revision: number }).revision : 0;

function snapshot(db: Database, id: string): Snapshot {
  const knowledge = db.prepare('SELECT * FROM knowledge WHERE id=?').get(id) as Row | undefined;
  const annotation=db.prepare('SELECT * FROM annotations WHERE id=?').get(id) as Row|undefined;
  const workId=knowledge?.work_id || annotation?.book_id;
  const details: Record<string, Row | null> = {};
  for (const table of detailTables) details[table] = db.prepare(`SELECT * FROM ${table} WHERE knowledge_id=?`).get(id) as Row || null;
  return {
    legacy:(db.prepare('SELECT value FROM app_settings WHERE key=?').get(`study.note.v1:${id}`) as {value:string}|undefined)?.value || null,
    knowledge: knowledge || null, details,
    annotation: annotation || null,
    tags: db.prepare('SELECT t.* FROM tag t JOIN knowledge_tag j ON j.tag_id=t.id WHERE j.knowledge_id=? ORDER BY t.id').all(id) as Row[],
    collections: db.prepare('SELECT c.* FROM collection c JOIN knowledge_collection j ON j.collection_id=c.id WHERE j.knowledge_id=? ORDER BY c.id').all(id) as Row[],
    comments: db.prepare('SELECT * FROM comment WHERE knowledge_id=? ORDER BY id').all(id) as Row[],
    workTitle: workId ? (db.prepare('SELECT title FROM work WHERE id=?').get(workId) as { title: string } | undefined)?.title || null : (knowledge?.former_work_title || annotation?.former_work_title) as string || null,
  };
}
function equivalent(value: Snapshot): string {
  return JSON.stringify(value, (key, field) => key === 'updated_at' ? undefined : field);
}
function append(db: Database, id: string, value: Snapshot, action: string, batch: string, restored?: number, actor?: string) {
  const content = JSON.stringify(value);
  const hash = createHash('sha256').update(content).digest('hex');
  const now = new Date().toISOString();
  db.prepare('INSERT OR IGNORE INTO history_blob(hash,content,byte_length,created_at) VALUES(?,?,?,?)').run(hash, content, Buffer.byteLength(content), now);
  db.prepare("INSERT INTO entity_version(id,entity_type,entity_id,revision,snapshot_hash,action,batch_id,restored_from_revision,actor,schema_version,created_at) VALUES(?,'knowledge',?,?,?,?,?,?,?,1,?)").run(randomUUID(), id, headRevision(db,id)+1, hash, action, batch, restored ?? null, actor ?? null, now);
}
function capture(db: Database,id: string) {
  const preference = db.prepare("SELECT value FROM app_settings WHERE key='knowledge.questions.enabled'").get() as {value:string}|undefined;
  if (preference?.value !== 'true') return;
  const parent = db.prepare('SELECT * FROM knowledge WHERE id=? AND deleted_at IS NULL').get(id) as Row|undefined;
  if (!parent || String(parent.location).startsWith('poetry:') || !['note','study_note','reading_reflection'].includes(String(parent.knowledge_type))) return;
  const row = db.prepare('SELECT COALESCE(s.content,n.content,r.review,\'\') AS content FROM knowledge k LEFT JOIN study_note_detail s ON s.knowledge_id=k.id LEFT JOIN note_detail n ON n.knowledge_id=k.id LEFT JOIN reading_reflection_detail r ON r.knowledge_id=k.id WHERE k.id=?').get(id) as {content:string};
  const comments = db.prepare('SELECT content FROM comment WHERE knowledge_id=? ORDER BY id').all(id) as {content:string}[];
  for (const question of authoredQuestions([row.content,...comments.map(comment=>comment.content)].join('\n'))) {
    const hash = createHash('sha256').update(question).digest('hex');
    if (db.prepare('SELECT 1 FROM question_detail WHERE source_ref=? AND capture_hash=?').get(`note:${id}`,hash)) continue;
    const questionId = randomUUID(), now=new Date().toISOString();
    withKnowledgeHistory(db,[questionId],'capture',()=>{
      db.prepare("INSERT INTO knowledge(id,work_id,former_work_title,knowledge_type,location,created_at,updated_at) VALUES(?,?,?,'question',?,?,?)").run(questionId,parent.work_id,parent.former_work_title,`note:${id}`,now,now);
      db.prepare('INSERT INTO question_detail(knowledge_id,question_text,source_ref,capture_hash) VALUES(?,?,?,?)').run(questionId,question,`note:${id}`,hash);
    });
  }
}
export function withKnowledgeHistory<T>(db: Database, ids: string[], action: string, operation: () => T, expected?: { id: string; revision: number; restored?:number }, actor?: 'reader'): T {
  if (actor !== undefined && actor !== 'reader') throw new Error('invalid-request');
  if (!historyAvailable(db)) return operation();
  const active = contexts.get(db);
  if (active) {
    for (const id of ids) if (!active.before.has(id)) active.before.set(id,snapshot(db,id));
    return operation();
  }
  return db.transaction(() => {
    if (expected && headRevision(db,expected.id) !== expected.revision) throw new Error('history-conflict');
    const context: Context = { before: new Map(ids.map(id => [id,snapshot(db,id)])), action, batch: randomUUID() };
    contexts.set(db,context);
    try {
      const result = operation();
      for (const id of [...context.before.keys()]) capture(db,id);
      const changedWorks = new Set<string>();
      for (const [id,before] of context.before) {
        const after = snapshot(db,id);
        if (equivalent(before) === equivalent(after)) continue;
        if (!headRevision(db,id) && (before.knowledge || before.annotation)) append(db,id,before,'baseline',context.batch);
        append(db,id,after,action,context.batch,expected?.restored,actor);
        for (const workId of [before.knowledge?.work_id, after.knowledge?.work_id]) if (typeof workId === 'string') changedWorks.add(workId);
      }
      if (!NON_USER_HISTORY_ACTIONS.includes(action)) invalidateRedo(db, changedWorks);
      return result;
    } finally { contexts.delete(db); }
  })();
}
export function withWorkPreservation<T>(db:Database,workIds:string[],operation:()=>T):T {
  if (!historyAvailable(db) || !workIds.length) return operation();
  const ids=workIds.flatMap(workId=>(db.prepare('SELECT id FROM knowledge WHERE work_id=?').all(workId) as {id:string}[]).map(row=>row.id));
  return withKnowledgeHistory(db,ids,'book-detached',operation);
}
export function trashKnowledge(db: Database,id: string, actor?: 'reader'): boolean {
  return withKnowledgeHistory(db,[id],'trash',() => {
    const row = db.prepare('SELECT id FROM knowledge WHERE id=? AND deleted_at IS NULL').get(id);
    if (!row) return false;
    db.prepare('UPDATE knowledge SET deleted_at=?,updated_at=? WHERE id=?').run(new Date().toISOString(),new Date().toISOString(),id);
    db.prepare('DELETE FROM annotations WHERE id=?').run(id);
    return true;
  }, undefined, actor);
}
export class KnowledgeHistoryService {
  constructor(private db: Database) {}
  list(id: string,before=Number.MAX_SAFE_INTEGER) {
    return this.db.prepare("SELECT revision,action,created_at AS createdAt,restored_from_revision AS restoredFrom FROM entity_version WHERE entity_type='knowledge' AND entity_id=? AND revision<? ORDER BY revision DESC LIMIT 200").all(id,before);
  }
  read(id: string,revision: number): Snapshot {
    const row = this.db.prepare("SELECT b.content,b.hash FROM entity_version v JOIN history_blob b ON b.hash=v.snapshot_hash WHERE v.entity_type='knowledge' AND v.entity_id=? AND v.revision=?").get(id,revision) as {content:string;hash:string} | undefined;
    if (!row || createHash('sha256').update(row.content).digest('hex') !== row.hash) throw new Error('invalid-history');
    return JSON.parse(row.content) as Snapshot;
  }
  restore(id: string, revision: number, expected: number, keepExistingAssociations = false, action = 'restore'): void {
    const value = this.read(id,revision);
    // A trash version has no reader projection, so it comes from the last version before the trash.
    if (value.knowledge?.deleted_at && !value.annotation) {
      const earlier = this.db.prepare("SELECT revision FROM entity_version WHERE entity_type='knowledge' AND entity_id=? AND revision<? ORDER BY revision DESC").all(id,revision) as {revision:number}[];
      for (const row of earlier) {
        const prior = this.read(id,row.revision);
        if (!prior.knowledge?.deleted_at) { value.annotation = prior.annotation; break; }
      }
    }
    if(!value.knowledge&&value.annotation?.type==='note') {
      const annotation=value.annotation;
      value.knowledge={id,work_id:annotation.book_id,edition_id:null,source_id:null,knowledge_type:'note',location:annotation.location_cfi_or_page,created_at:annotation.created_at,updated_at:annotation.updated_at,deleted_at:null,former_work_title:annotation.former_work_title};
      value.details.note_detail={knowledge_id:id,content:annotation.note_content || ''};
    }
    if (!value.knowledge) throw new Error('invalid-history');
    withKnowledgeHistory(this.db,[id],action,() => {
      for (const [table,items] of [['tag',value.tags],['collection',value.collections]] as const) {
        for (const item of items) {
          const current = this.db.prepare(`SELECT name FROM ${table} WHERE id=?`).get(item.id) as {name:string} | undefined;
          if ((!current || current.name !== item.name) && !keepExistingAssociations) throw new Error('history-associations');
        }
      }
      const parent: Row = {...value.knowledge,deleted_at:null,updated_at:new Date().toISOString()};
      const details={...value.details};
      if(value.legacy&&parent.knowledge_type==='note') {
        try {
          const legacy=JSON.parse(value.legacy) as {title?:unknown;aliases?:unknown};
          if(typeof legacy.title==='string'&&Array.isArray(legacy.aliases)&&legacy.aliases.every(alias=>typeof alias==='string')) {
            parent.knowledge_type='study_note';
            details.study_note_detail={knowledge_id:id,title:legacy.title,content:details.note_detail?.content||'',aliases_json:JSON.stringify(legacy.aliases)};
            details.note_detail=null;
          }
        }catch{}
      }
      if (parent.work_id && !this.db.prepare('SELECT 1 FROM work WHERE id=?').get(parent.work_id)) { parent.work_id = null; parent.former_work_title = value.workTitle; }
      for (const [field,table] of [['edition_id','edition'],['source_id','source']] as const) if (parent[field] && !this.db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(parent[field])) parent[field]=null;
      this.upsert('knowledge',parent,'id');
      for (const table of detailTables) {
        if (table === 'card_detail') {
          // Restore question content in place; SRS remains independent.
          if (details.card_detail) {
            const hasKinds=(this.db.prepare('PRAGMA table_info(card_detail)').all() as {name:string}[]).some(c=>c.name==='question_kind');
            this.upsert(table,hasKinds?{question_kind:'recall',payload_json:null,...details.card_detail}:details.card_detail,'knowledge_id');
          }
          continue;
        }
        this.db.prepare(`DELETE FROM ${table} WHERE knowledge_id=?`).run(id);
        if (details[table]) this.upsert(table,details[table]!,'knowledge_id');
      }
      this.db.prepare('DELETE FROM annotations WHERE id=?').run(id);
      if (value.annotation) this.upsert('annotations',{...value.annotation,book_id:parent.work_id,former_work_title:parent.former_work_title,updated_at:parent.updated_at},'id');
      for (const [table,join,column,items] of [['tag','knowledge_tag','tag_id',value.tags],['collection','knowledge_collection','collection_id',value.collections]] as const) {
        this.db.prepare(`DELETE FROM ${join} WHERE knowledge_id=?`).run(id);
        for (const item of items) if (this.db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(item.id)) this.db.prepare(`INSERT INTO ${join}(knowledge_id,${column}) VALUES(?,?)`).run(id,item.id);
      }
      this.db.prepare('DELETE FROM comment WHERE knowledge_id=?').run(id);
      const comments = [...value.comments];
      while (comments.length) {
        const index = comments.findIndex(row => !row.parent_comment_id || this.db.prepare('SELECT 1 FROM comment WHERE id=?').get(row.parent_comment_id));
        if (index<0) throw new Error('invalid-history');
        this.upsert('comment',comments.splice(index,1)[0],'id');
      }
    },{id,revision:expected,restored:revision});
  }
  erase(id: string): void {
    this.db.transaction(() => {
      const text = (this.db.prepare('SELECT COALESCE(s.content,n.content,r.review) AS content FROM knowledge k LEFT JOIN study_note_detail s ON s.knowledge_id=k.id LEFT JOIN note_detail n ON n.knowledge_id=k.id LEFT JOIN reading_reflection_detail r ON r.knowledge_id=k.id WHERE k.id=?').get(id) as {content:string|null}|undefined)?.content;
      const captures = this.db.prepare('SELECT knowledge_id FROM question_detail WHERE source_ref=? AND capture_hash IS NOT NULL').all(`note:${id}`) as {knowledge_id:string}[];
      for (const capture of captures) if (capture.knowledge_id!==id) this.erase(capture.knowledge_id);
      this.db.prepare('DELETE FROM annotations WHERE id=?').run(id);
      this.db.prepare('DELETE FROM knowledge WHERE id=?').run(id);
      this.db.prepare("DELETE FROM entity_version WHERE entity_type='knowledge' AND entity_id=?").run(id);
      this.db.prepare('DELETE FROM history_blob WHERE hash NOT IN(SELECT snapshot_hash FROM entity_version)').run();
      this.db.prepare('DELETE FROM app_settings WHERE key=?').run(`study.note.v1:${id}`);
      this.db.prepare('DELETE FROM app_settings WHERE key=?').run(`study.note.converted:${id}`);
      // Drafts are shared scratch space, so only one holding this note's text goes with it.
      for (const key of ['dashboard.scratchpad.draft.v1','study.capture.draft.v1']) {
        const row = this.db.prepare('SELECT value FROM app_settings WHERE key=?').get(key) as {value:string}|undefined;
        if (!row || !text) continue;
        try {
          const draft = (JSON.parse(row.value) as {content?:unknown}).content;
          if (typeof draft==='string' && draft.trim() && text.includes(draft.trim())) this.db.prepare('DELETE FROM app_settings WHERE key=?').run(key);
        } catch {}
      }
    })();
  }
  private upsert(table: string,row: Row,key: string) {
    const allowed = (this.db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[]).map(column=>column.name);
    const columns = Object.keys(row).filter(column=>allowed.includes(column));
    this.db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')}) ON CONFLICT(${key}) DO UPDATE SET ${columns.filter(column=>column!==key).map(column=>`${column}=excluded.${column}`).join(',')}`).run(...columns.map(column=>row[column] as never));
  }
}
