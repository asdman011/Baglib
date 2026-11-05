import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { backupBeforeMigrations } from '../../src/main/database/migration-backup';
import { KnowledgeHistoryService,headRevision } from '../../src/main/services/knowledge-history';
import { SqliteKnowledgeRepository } from '../../src/main/database/repositories/knowledge.repository';
import { SqliteAnnotationRepository } from '../../src/main/database/repositories/annotation.repository';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { SqliteTagRepository } from '../../src/main/database/repositories/tag.repository';
import { StudyNotesService } from '../../src/main/services/study-notes';
import { ReadingLogService } from '../../src/main/services/reading-log';
import { SrsService } from '../../src/main/services/srs';
import { PdfReviews } from '../../src/main/services/pdf-editor/reviews';
import type { PdfSource } from '../../src/main/services/pdf-editor/source';
import { authoredQuestions } from '../../src/shared/question-capture';
import { StudyInsightsService } from '../../src/main/services/statistics/study-insights.service';

function fixture() {
  const db=new Database(':memory:');db.pragma('foreign_keys=ON');runMigrations(db,migrations);
  db.prepare("INSERT INTO work(id,title) VALUES('book','كتاب — Book')").run();
  return {db,repo:new SqliteKnowledgeRepository(db),annotations:new SqliteAnnotationRepository(db),settings:new SqliteSettingsRepository(db),history:new KnowledgeHistoryService(db)};
}

test('all saved book-note and annotation changes have exactly one authoritative version',()=>{
  const {db,repo,annotations,history}=fixture();
  try {
    repo.addNote({id:'note',bookId:'book',pageNumber:2,content:'الأصل',createdAt:'2026-01-01'});
    assert.equal(history.list('note').length,1);
    annotations.save({id:'note',bookId:'book',type:'note',locationCfiOrPage:'2',noteContent:'التعديل — Edit'});
    assert.equal(headRevision(db,'note'),2);
    assert.equal(repo.getAllNotes()[0].content,'التعديل — Edit');
    history.restore('note',1,2);
    assert.equal(headRevision(db,'note'),3);
    assert.equal(repo.getAllNotes()[0].content,'الأصل');
    assert.equal(history.read('note',2).details.note_detail?.content,'التعديل — Edit');
    assert.throws(()=>history.restore('note',2,2),/history-conflict/);
  } finally {db.close();}
});

test('restoring a trash version brings the note back to the reader',()=>{
  const {db,repo,annotations,history}=fixture();
  try {
    repo.addNote({id:'note',bookId:'book',pageNumber:2,content:'kept'});
    repo.deleteNote('note');
    history.restore('note',headRevision(db,'note'),headRevision(db,'note'));
    assert.equal(repo.getAllNotes()[0].content,'kept');
    assert.equal(annotations.getAll()[0].noteContent,'kept');
  } finally {db.close();}
});

test('erase removes only the draft holding that note',()=>{
  const {db,repo,settings,history}=fixture();
  try {
    repo.addNote({id:'note',bookId:'book',pageNumber:2,content:'private text here'});
    settings.set('dashboard.scratchpad.draft.v1',{content:'unrelated draft'});
    settings.set('study.capture.draft.v1',{content:'private text'});
    repo.deleteNote('note');
    history.erase('note');
    assert.deepEqual(settings.get('dashboard.scratchpad.draft.v1'),{content:'unrelated draft'});
    assert.equal(settings.get('study.capture.draft.v1'),undefined);
  } finally {db.close();}
});

test('unlinking a study note from its book removes its reader row',()=>{
  const {db,annotations,settings}=fixture();
  try {
    const service=new StudyNotesService(settings,db);
    const note=service.save({title:'عنوان',content:'نص',aliases:[],tags:[],workId:'book'});
    assert.equal(annotations.getAll().length,1);
    service.save({title:'عنوان',content:'نص',aliases:[],tags:[],id:note.id});
    assert.equal(annotations.getAll().length,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM annotations').pluck().get(),0);
    assert.equal(service.list()[0].workId,null);
  } finally {db.close();}
});

test('a quote taken from a note stays out of the book reader',()=>{
  const {repo,annotations}=fixture();
  repo.saveKnowledge({id:'quote',workId:'book',knowledgeType:'quote',location:'note:source',quotedText:'نص',projectToReader:false});
  assert.equal(annotations.getAll().length,0);
  assert.equal(repo.getKnowledgeByWork('book')[0].quotedText,'نص');
});

test('projection failure rolls back note and history together',()=>{
  const {db,repo}=fixture();
  try {
    db.exec("CREATE TRIGGER reject_projection BEFORE INSERT ON annotations BEGIN SELECT RAISE(ABORT,'projection-failed'); END");
    assert.throws(()=>repo.addNote({id:'bad',bookId:'book',pageNumber:1,content:'not saved'}),/projection-failed/);
    assert.equal(db.prepare('SELECT 1 FROM knowledge WHERE id=?').get('bad'),undefined);
    assert.equal(headRevision(db,'bad'),0);
  } finally {db.close();}
});

test('trash removes projections, restore retains newer versions and erase clears owned history',()=>{
  const {db,repo,annotations,history}=fixture();
  try {
    repo.addNote({id:'note',bookId:'book',pageNumber:2,content:'kept'});
    repo.deleteNote('note');
    assert.equal(repo.getAllNotes().length,0);assert.equal(annotations.getAll().length,0);
    history.restore('note',1,headRevision(db,'note'));
    assert.equal(repo.getAllNotes()[0].content,'kept');
    assert.equal(annotations.getAll().length,1);
    history.erase('note');
    assert.equal(history.list('note').length,0);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM history_blob').get() as {count:number}).count,0);
  } finally {db.close();}
});

test('new knowledge subtypes map to meaningful content without accidental projections',()=>{
  const {db,repo,settings}=fixture();
  try {
    const notes=new StudyNotesService(settings,db);
    const saved=notes.save({title:'عنوان',content:'عِلْم — Text',tags:['بحث'],aliases:['Alias']});
    new ReadingLogService(db).save({workId:'book',entryDate:'2026-11-02',mood:'calm',review:'reflection',recommendations:'read',lessons:'learn'});
    const all=repo.getAllKnowledge();
    assert.equal(all.find(row=>row.id===saved.id)?.noteContent,saved.content);
    assert.equal(all.find(row=>row.knowledgeType==='reading_reflection')?.noteContent,'reflection');
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM annotations').get() as {count:number}).count,0);
    assert.equal(saved.tags[0],'بحث');
    assert.throws(()=>notes.save({...saved,content:'stale',expectedRevision:0}),/history-conflict/);
  } finally {db.close();}
});

test('bad legacy records are isolated and valid orphan notes convert with original metadata retained',()=>{
  const {db,settings,history}=fixture();
  try {
    const note={id:'legacy',title:'عنوان',content:'  نص أصلي  ',tags:['عِلْم','علم'],aliases:['A'],workId:'missing-book',createdAt:'2025-01-01T00:00:00Z',updatedAt:'2025-01-02T00:00:00Z'};
    settings.set('study.note.v1:legacy',note);settings.set('study.note.v1:broken','{');
    const service=new StudyNotesService(settings,db), report=service.convertLegacy();
    assert.equal(report.converted,1);assert.equal(report.issues.length,1);
    const converted=service.list()[0];assert.equal(converted.workId,null);assert.equal(converted.content,note.content);assert.equal(converted.createdAt,note.createdAt);
    assert.deepEqual(converted.tags.sort(),note.tags.sort());
    assert.equal(JSON.parse(history.read('legacy',1).legacy!).content,note.content);
    assert.ok(settings.get('study.note.v1:legacy'));assert.equal(service.convertLegacy().converted,0);
  } finally {db.close();}
});

test('Work deletion preserves every new subtype and reading sessions, and preserved lists show content',()=>{
  const {db,repo,settings}=fixture();
  try {
    const note=new StudyNotesService(settings,db).save({title:'Note',content:'study body',tags:[],aliases:[],workId:'book'});
    new ReadingLogService(db).save({workId:'book',entryDate:'2026-11-02',mood:'',review:'reflection body',recommendations:'',lessons:''});
    repo.recordReadingSession({id:'session',workId:'book',startedAt:'2026-11-02T10:00:00Z',endedAt:'2026-11-02T11:00:00Z',pagesRead:12});
    db.prepare("DELETE FROM work WHERE id='book'").run();
    assert.equal((db.prepare('SELECT work_id FROM knowledge WHERE id=?').get(note.id) as {work_id:null}).work_id,null);
    const preserved=new KnowledgeCardRepository(db).listPreserved();
    assert.ok(preserved.some(row=>row.text==='study body'));assert.ok(preserved.some(row=>row.text==='reflection body'));
    assert.ok(preserved.every(row=>row.bookTitle==='كتاب — Book'));
    assert.equal(new ReadingLogService(db).read('book').seconds,3600);
    assert.equal(new StudyInsightsService(db).summary(new Date('2026-11-02T12:00:00Z')).seconds,3600);
  } finally {db.close();}
});

test('tag rename, merge and delete record affected notes and restore requires explicit missing-association consent',()=>{
  const {db,settings,history}=fixture();
  try {
    const service=new StudyNotesService(settings,db),note=service.save({title:'a',content:'text',tags:['first','second'],aliases:[]});
    const tags=new SqliteTagRepository(db);
    const first=db.prepare("SELECT id FROM tag WHERE name='first'").get() as {id:string};
    const second=db.prepare("SELECT id FROM tag WHERE name='second'").get() as {id:string};
    tags.updateTag(first.id,'renamed');assert.equal(headRevision(db,note.id),2);
    tags.mergeTags(first.id,second.id);assert.equal(headRevision(db,note.id),3);assert.deepEqual(service.list()[0].tags,['second']);
    tags.deleteTag(second.id);assert.equal(headRevision(db,note.id),4);
    assert.throws(()=>history.restore(note.id,1,4),/history-associations/);
    history.restore(note.id,1,4,true);assert.deepEqual(service.list()[0].tags,[]);
  } finally {db.close();}
});

test('question capture is opt-in, deduplicated and excludes canonical poetry/code/quotes/URLs',()=>{
  assert.deepEqual(authoredQuestions('كيف نفهم؟\nWhat next?\n`skip?`\n> quote?\n«اقتباس؟»\nhttps://a.test/?x=1'),['كيف نفهم؟','What next?']);
  const {db,settings}=fixture();
  try {
    const service=new StudyNotesService(settings,db), first=service.save({title:'Questions',content:'كيف نفهم؟ What next?',tags:[],aliases:[]});
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM question_detail').get() as {count:number}).count,0);
    settings.set('knowledge.questions.enabled',true);
    service.save({...first,content:'كيف نفهم؟\nWhat next?',expectedRevision:first.revision});
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM question_detail').get() as {count:number}).count,2);
    service.save({...service.list()[0],content:'كيف نفهم؟\nWhat next?',expectedRevision:headRevision(db,first.id)});
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM question_detail').get() as {count:number}).count,2);
  } finally {db.close();}
});

test('PDF review text, replies and status each produce one version with the full anchor',()=>{
  const {db}=fixture();
  try {
    const reviews=new PdfReviews(db),source={workId:'book',sourceId:'pdf',sha256:'a'.repeat(64)} as PdfSource;
    const review=reviews.add(source,{page:1,rect:[0,0,10,10],kind:'sticky',author:'A',text:'review',status:'open'});
    assert.equal(headRevision(db,review.id),1);
    const reply=reviews.change(source,review.id,review.updatedAt,{author:'B',text:'reply'});
    assert.equal(headRevision(db,review.id),2);
    reviews.change(source,review.id,reply.updatedAt,{status:'resolved'});
    assert.equal(headRevision(db,review.id),3);
    const snapshot=new KnowledgeHistoryService(db).read(review.id,2);
    assert.equal(JSON.parse(String(snapshot.annotation!.location_cfi_or_page)).replies[0].text,'reply');
  } finally {db.close();}
});

test('reading measurements never add dwell to sessions and observed completion is not invented retrospectively',()=>{
  const {db,repo}=fixture();
  try {
    db.prepare("INSERT INTO reading_book_stat(id,title) VALUES('book','book')").run();
    db.prepare("INSERT INTO reading_page_stat(id_book,page,start_time,duration) VALUES('book',1,100,50)").run();
    const log=new ReadingLogService(db);assert.equal(log.read('book').seconds,50);
    repo.recordReadingSession({workId:'book',startedAt:'2026-11-02T10:00:00Z',endedAt:'2026-11-02T11:00:00Z',pagesRead:12});
    assert.equal(log.read('book').seconds,3600);assert.equal(log.read('book').completionDate,null);
    db.prepare("UPDATE work SET reading_status='completed' WHERE id='book'").run();
    assert.ok(log.read('book').completionDate);
  } finally {db.close();}
});

test('trash excludes cards from SRS without losing review state',()=>{
  const {db,history}=fixture();
  try {
    const cards=new KnowledgeCardRepository(db),card=cards.save({front:'card',back:'answer',sourceKind:'note'});
    cards.setMemorizing(card.id,true);assert.equal(new SrsService(db).queue().due,1);
    cards.remove(card.id);assert.equal(new SrsService(db).queue().due,0);
    history.restore(card.id,1,headRevision(db,card.id));assert.equal(new SrsService(db).queue().due,1);
  } finally {db.close();}
});

test('plain migration backup verifies a WAL database and leaves the source unchanged',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'baglib-backup-'));
  const db=new Database(path.join(directory,'baglib.db'));
  try {
    db.pragma('journal_mode=WAL');runMigrations(db,migrations.filter(migration=>migration.id<=18));
    db.prepare("INSERT INTO work(id,title) VALUES('before','exact — نص')").run();
    const backup=backupBeforeMigrations(db,migrations);assert.ok(backup);
    const copy=new Database(backup!,{readonly:true});
    try{assert.equal((copy.prepare('SELECT title FROM work').get() as {title:string}).title,'exact — نص');assert.equal(copy.pragma('integrity_check',{simple:true}),'ok');}finally{copy.close();}
    runMigrations(db,migrations);assert.equal(db.pragma('foreign_key_check').length,0);
    assert.equal(backupBeforeMigrations(db,migrations),null);
  } finally {db.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('a competing writer prevents backup and leaves migration bookkeeping unchanged',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'baglib-backup-busy-'));
  const file=path.join(directory,'baglib.db');
  const db=new Database(file),other=new Database(file);
  try{
    db.pragma('journal_mode=WAL');runMigrations(db,migrations.filter(migration=>migration.id<=18));
    db.pragma('busy_timeout=50');other.exec('BEGIN IMMEDIATE');
    assert.throws(()=>backupBeforeMigrations(db,migrations),/locked|busy/);
    assert.equal((db.prepare('SELECT MAX(id) AS id FROM _migrations').get() as {id:number}).id,18);
  }finally{if(other.inTransaction)other.exec('ROLLBACK');other.close();db.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('all versions remain accessible through bounded history pages',()=>{
  const {db,settings,history}=fixture();
  try{
    const notes=new StudyNotesService(settings,db),note=notes.save({title:'history',content:'version 0',aliases:[],tags:[]});
    for(let index=1;index<=205;index++)notes.save({...note,content:`version ${index}`});
    const first=history.list(note.id) as {revision:number}[];
    assert.equal(first.length,200);
    const second=history.list(note.id,first.at(-1)!.revision) as {revision:number}[];
    assert.equal(second.length,6);assert.equal(second.at(-1)!.revision,1);
    assert.equal(history.read(note.id,1).details.study_note_detail?.content,'version 0');
  }finally{db.close();}
});

test('erasure retains blobs still referenced by another entity and removes owned captures',()=>{
  const {db,settings,history}=fixture();
  try{
    settings.set('knowledge.questions.enabled',true);
    const note=new StudyNotesService(settings,db).save({title:'private',content:'سؤال خاص؟',tags:[],aliases:[]});
    db.prepare("INSERT INTO entity_version(id,entity_type,entity_id,revision,snapshot_hash,action,schema_version,created_at) SELECT 'shared','knowledge','independent',1,snapshot_hash,'baseline',1,created_at FROM entity_version WHERE entity_id=? LIMIT 1").run(note.id);
    history.erase(note.id);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM question_detail').get() as {count:number}).count,0);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM history_blob').get() as {count:number}).count,1);
    history.erase('independent');assert.equal((db.prepare('SELECT COUNT(*) AS count FROM history_blob').get() as {count:number}).count,0);
  }finally{db.close();}
});

test('annotation-only legacy notes are promoted and their pre-promotion baseline remains restorable',()=>{
  const {db,settings,history,repo,annotations}=fixture();
  try{
    db.prepare("INSERT INTO annotations(id,book_id,type,location_cfi_or_page,note_content,created_at,updated_at) VALUES('old','book','note','3','original','2025-01-01','2025-01-02')").run();
    assert.equal(new StudyNotesService(settings,db).convertLegacy().converted,1);
    assert.equal(repo.getAllNotes()[0].content,'original');
    annotations.save({id:'old',bookId:'book',type:'note',locationCfiOrPage:'3',noteContent:'changed'});
    history.restore('old',1,headRevision(db,'old'));
    assert.equal(repo.getAllNotes()[0].content,'original');
    assert.equal(annotations.getAll()[0].noteContent,'original');
  }finally{db.close();}
});
