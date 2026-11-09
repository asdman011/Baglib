import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteKnowledgeRepository } from '../../src/main/database/repositories/knowledge.repository';
import { saveReaderKnowledge } from '../../src/renderer/libs/reader/save-reader-knowledge';
import { CommentThreadService } from '../../src/main/services/comment-threads';
import { MarkHistoryService } from '../../src/main/services/mark-history';
import { withKnowledgeHistory } from '../../src/main/services/knowledge-history';
import { MaterialSaveService } from '../../src/main/services/material-save';
import { collectAdditions, filterForExport, validateExportOptions, validateSavePolicy, type MarkRow } from '../../src/shared/material-save';

const python = path.resolve('.baglib-data/pdf-engine/venv/Scripts/python.exe');
const helper = path.resolve('assets/pdf-editor/baglib_marks.py');
const engine = existsSync(python);
const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const inspect = (file: string) => JSON.parse(execFileSync(python, ['-I', helper, 'inspect', file], { encoding: 'utf8' })) as { owned: number; outside: number; names: string[]; ownedOutline: number };
/** Whether any string in any object of the file (unreferenced leftovers included) holds the text, visible or not. */
const SEARCH = `import pikepdf,sys
needle=sys.argv[2]
def walk(o):
    if isinstance(o,pikepdf.String): return needle in str(o)
    if isinstance(o,(pikepdf.Dictionary,pikepdf.Stream)): return any(walk(v) for k,v in o.items() if k not in ('/P','/Parent','/IRT','/Popup'))
    if isinstance(o,pikepdf.Array): return any(walk(v) for v in o)
    return False
with pikepdf.open(sys.argv[1]) as d:
    print(any(walk(o) for o in d.objects))`;
const contains = (file: string, text: string) => execFileSync(python, ['-I', '-c', SEARCH, file, text], { encoding: 'utf8' }).trim() === 'True';

function setup() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'baglib-save-'));
  const file = path.join(dir, 'book.pdf');
  // Two pages and one annotation made outside BagLib.
  execFileSync(python, ['-I', '-c', `import pikepdf,sys
d=pikepdf.new(); d.add_blank_page(page_size=(420,595)); d.add_blank_page(page_size=(420,595))
d.pages[0].obj.Annots=pikepdf.Array([d.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Annot,Subtype=pikepdf.Name.Text,Rect=[10,10,30,30],Contents=pikepdf.String('from Acrobat'),T=pikepdf.String('someone')))])
d.save(sys.argv[1])`, file]);
  const db = createTestDatabase();
  db.exec(`INSERT INTO work(id,title) VALUES('w1','كتاب'); INSERT INTO edition(id,work_id) VALUES('e1','w1'); INSERT INTO source(id,edition_id,source_type) VALUES('s1','e1','file');`);
  db.prepare('INSERT INTO file_source_detail(source_id,file_path) VALUES(?,?)').run('s1', file);
  const backups = path.join(dir, 'emergency');
  let now = new Date('2026-11-05T10:00:00Z');
  const service = new MaterialSaveService({ db, python: () => python, helper, staging: path.join(dir, 'staging'), backupFolder: () => backups, now: () => now });
  const mark = (id: string, location: string, color = 'amber', at = '2026-11-05T09:00:00Z') => {
    db.prepare("INSERT INTO knowledge(id,work_id,knowledge_type,location,created_at,updated_at) VALUES(?,?,'highlight',?,?,?)").run(id, 'w1', location, at, at);
    db.prepare('INSERT INTO highlight_detail(knowledge_id,quoted_text,color) VALUES(?,?,?)').run(id, 'العلم', color);
  };
  return { dir, file, db, service, backups, mark, setNow: (value: string) => { now = new Date(value); } };
}
const highlight = (page: number) => JSON.stringify({ page, rects: [{ x: 10, y: 10, width: 40, height: 3 }] });

test('policy and export options are validated', () => {
  assert.deepEqual(validateSavePolicy({ mode: 'interval', intervalMinutes: 1 }), { mode: 'interval', intervalMinutes: 1 });
  assert.deepEqual(validateSavePolicy({ mode: 'hourly', intervalMinutes: 0 }), { mode: 'after-change', intervalMinutes: 2 });
  assert.deepEqual(validateExportOptions({ categories: ['textMarks', 'nope'], pages: { from: 2, to: 1 }, colors: ['rose', '#fff'] }), { categories: ['textMarks'], pages: null, colors: ['rose'], kinds: null });
});

test('additions come from BagLib records; export keeps only what is chosen, replies only when asked', () => {
  const rows: MarkRow[] = [
    { id: 'h', type: 'highlight', location: highlight(1), createdAt: '1', updatedAt: null, color: 'rose', quote: 'q', note: null, question: null, label: null },
    { id: 'p', type: 'note', location: JSON.stringify({ page: 2, shape: 'pin', box: { x: 5, y: 5, width: 0, height: 0 }, color: 'amber' }), createdAt: '2', updatedAt: null, color: null, quote: null, note: '', question: null, label: null },
    { id: 'b', type: 'bookmark', location: '2', createdAt: '3', updatedAt: null, color: null, quote: null, note: null, question: null, label: 'باب' },
    { id: 'n', type: 'note', location: '', createdAt: '4', updatedAt: null, color: null, quote: null, note: 'study note without a page', question: null, label: null },
  ];
  const payload = collectAdditions(rows, [{ knowledgeId: 'p', parentId: null, content: 'سرّ', createdAt: '5', updatedAt: null, resolvedAt: '6' }]);
  assert.deepEqual(payload.items.map(item => item.kind), ['highlight', 'pin']);
  assert.equal(payload.items[1].resolved, '6');
  assert.deepEqual(payload.bookmarks, [{ id: 'b', page: 2, title: 'باب' }]);
  const comments = filterForExport(payload, { categories: ['comments'] });
  assert.deepEqual(comments.items.map(item => [item.kind, item.replies.length, item.resolved]), [['pin', 0, null]]);
  assert.equal(filterForExport(payload, { categories: ['comments', 'replies'] }).items[0].replies.length, 1);
  assert.deepEqual(filterForExport(payload, { categories: ['textMarks'], colors: ['amber'] }).items, []);
  assert.deepEqual(filterForExport(payload, { categories: ['textMarks', 'bookmarks'], pages: { from: 2, to: 2 } }), { items: [], bookmarks: payload.bookmarks });
});

test('one emergency copy holding the file before the latest save (A → B → C), no duplicates, outside annotations kept', { skip: !engine && 'PDF engine not installed' }, async () => {
  const { dir, file, service, backups, mark } = setup();
  try {
    const status0 = await service.status('w1');
    assert.equal(status0.pending, false, 'nothing to write yet');
    assert.equal(existsSync(backups), false, 'opening or reading status creates no backup');
    const A = sha(file);
    mark('m1', highlight(1));
    assert.equal((await service.status('w1')).pending, true);
    const first = await service.save('w1');
    assert.equal(first.written, true);
    const B = sha(file);
    const copy = path.join(backups, 's1.emergency.pdf');
    assert.equal(sha(copy), A, 'after saving B the copy holds A');
    assert.equal((await service.status('w1')).pending, false);
    assert.deepEqual(await service.save('w1'), { written: false, reason: 'nothing-pending' });
    mark('m2', highlight(2), 'sky', '2026-11-05T09:30:00Z');
    await service.save('w1');
    assert.equal(sha(copy), B, 'after saving C the same copy holds B');
    assert.deepEqual(readdirSync(backups), ['s1.emergency.pdf'], 'exactly one copy, no staging leftovers');
    assert.deepEqual(readdirSync(path.join(dir, 'staging')), []);
    const written = inspect(file);
    assert.deepEqual([written.owned, written.outside], [2, 1], 'two BagLib marks once each, the outside note kept');
    await service.save('w1', { force: true });
    assert.equal(inspect(file).owned, 2, 'a repeated save does not duplicate');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('pending changes never touch the recovery copy; deleting a mark removes it from the file', { skip: !engine && 'PDF engine not installed' }, async () => {
  const { dir, file, db, service, backups, mark } = setup();
  try {
    mark('m1', highlight(1));
    await service.save('w1');
    const copy = path.join(backups, 's1.emergency.pdf');
    const before = sha(copy);
    mark('m2', highlight(2));
    assert.equal((await service.status('w1')).pending, true);
    assert.equal(sha(copy), before, 'recording a mark in BagLib does not change the copy');
    db.prepare("UPDATE knowledge SET deleted_at = '2026-11-05T11:00:00Z' WHERE id IN ('m1','m2')").run();
    await service.save('w1');
    assert.equal(inspect(file).owned, 0);
    assert.equal(inspect(file).outside, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('export: chosen additions only, excluded text absent from the bytes, working file unchanged', { skip: !engine && 'PDF engine not installed' }, async () => {
  const { dir, file, db, service, mark } = setup();
  try {
    mark('m1', highlight(1));
    db.prepare("INSERT INTO knowledge(id,work_id,knowledge_type,location,created_at) VALUES('q1','w1','question','1','2026-11-05T09:10:00Z')").run();
    db.prepare("INSERT INTO question_detail(knowledge_id,question_text) VALUES('q1','سؤال خاص جدا')").run();
    await service.save('w1');
    const working = sha(file);
    assert.ok(contains(file, 'سؤال خاص جدا'), 'the question is in the working file');
    const out = path.join(dir, 'export.pdf');
    assert.deepEqual(await service.exportCopy('w1', { categories: ['textMarks'] }, out), { items: 1, bookmarks: 0 });
    assert.equal(inspect(out).owned, 1);
    assert.equal(inspect(out).outside, 1, 'outside annotation preserved');
    assert.equal(contains(out, 'سؤال خاص جدا'), false, 'excluded question removed, not hidden');
    const clean = path.join(dir, 'clean.pdf');
    await service.exportCopy('w1', { categories: [] }, clean);
    assert.deepEqual([inspect(clean).owned, inspect(clean).outside], [0, 1]);
    assert.equal(sha(file), working, 'exporting does not change the working file');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('expiry after 24 hours, kept while an incident is unresolved; an interrupted save is detected', { skip: !engine && 'PDF engine not installed' }, async () => {
  const { dir, file, db, service, backups, mark, setNow } = setup();
  try {
    mark('m1', highlight(1));
    await service.save('w1');
    const copy = path.join(backups, 's1.emergency.pdf');
    setNow('2026-11-06T09:59:00Z');
    assert.equal(await service.cleanupExpired(), 0);
    // A save that stopped between publishing and rotating leaves `.next`; the next launch records an incident.
    writeFileSync(path.join(backups, 's1.emergency.next.pdf'), readFileSync(copy));
    assert.equal(await service.recoverInterrupted(), 1);
    assert.equal((await service.status('w1')).incident, 'interrupted');
    await assert.rejects(service.save('w1', { force: true }), /incident/u);
    setNow('2026-11-08T10:00:00Z');
    assert.equal(await service.cleanupExpired(), 0, 'kept beyond 24 hours while the incident is open');
    assert.ok(existsSync(copy));
    // Restoring the emergency copy is a recovery action: the replaced file becomes the copy.
    const current = sha(file);
    await service.restoreEmergency('w1');
    assert.equal(sha(copy), current);
    assert.equal((await service.status('w1')).incident, null);
    setNow('2026-11-09T10:01:00Z');
    assert.equal(await service.cleanupExpired(), 1);
    assert.equal(existsSync(copy), false);
    assert.equal((db.prepare('SELECT backup_path FROM material_save_state').get() as { backup_path: string | null }).backup_path, null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a file changed outside BagLib keeps its changes; BagLib writes its additions onto it', { skip: !engine && 'PDF engine not installed' }, async () => {
  const { dir, file, service, backups, mark } = setup();
  try {
    mark('m1', highlight(1));
    await service.save('w1');
    // Another program adds a second outside note.
    execFileSync(python, ['-I', '-c', `import pikepdf,sys
with pikepdf.open(sys.argv[1], allow_overwriting_input=True) as d:
    d.pages[1].obj.Annots=pikepdf.Array([d.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Annot,Subtype=pikepdf.Name.Text,Rect=[5,5,20,20],Contents=pikepdf.String('elsewhere')))])
    d.save(sys.argv[1])`, file]);
    const outside = sha(file);
    mark('m2', highlight(2));
    const result = await service.save('w1');
    assert.equal(result.externalChange, true);
    assert.deepEqual([inspect(file).owned, inspect(file).outside], [2, 2]);
    assert.equal(sha(path.join(backups, 's1.emergency.pdf')), outside, 'the copy holds the outside version');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('undo and redo of marks work across a restart, from database history (no PDF copies)', async () => {
  const { withKnowledgeHistory } = await import('../../src/main/services/knowledge-history');
  const { MarkHistoryService } = await import('../../src/main/services/mark-history');
  const db = createTestDatabase();
  db.exec(`INSERT INTO work(id,title) VALUES('w1','كتاب'); INSERT INTO edition(id,work_id) VALUES('e1','w1'); INSERT INTO source(id,edition_id,source_type) VALUES('s1','e1','file');`);
  db.prepare('INSERT INTO file_source_detail(source_id,file_path) VALUES(?,?)').run('s1', __filename);
  let redo: string[] = [];
  // A fresh service each step, as after a restart: the redo list comes only from the store.
  const service = () => new MarkHistoryService(db, { redoStack: () => [...redo], setRedoStack: (_work, stack) => { redo = stack; } });
  const add = (id: string) => withKnowledgeHistory(db, [id], 'save', () => {
    db.prepare("INSERT INTO knowledge(id,work_id,knowledge_type,location,created_at,updated_at) VALUES(?,?,'highlight',?,?,?)").run(id, 'w1', highlight(1), new Date().toISOString(), new Date().toISOString());
    db.prepare("INSERT INTO highlight_detail(knowledge_id,quoted_text,color) VALUES(?,'x','amber')").run(id);
  });
  const color = (id: string, value: string) => withKnowledgeHistory(db, [id], 'save', () => db.prepare('UPDATE highlight_detail SET color=? WHERE knowledge_id=?').run(value, id));
  const live = () => (db.prepare("SELECT k.id, h.color FROM knowledge k JOIN highlight_detail h ON h.knowledge_id=k.id WHERE deleted_at IS NULL ORDER BY k.id").all() as { id: string; color: string }[]).map(row => `${row.id}:${row.color}`);
  add('a'); await new Promise(resolve => setTimeout(resolve, 5));
  add('b'); await new Promise(resolve => setTimeout(resolve, 5));
  color('a', 'rose');
  assert.deepEqual(live(), ['a:rose', 'b:amber']);
  service().undo('w1');
  assert.deepEqual(live(), ['a:amber', 'b:amber'], 'the colour change is undone');
  service().undo('w1');
  assert.deepEqual(live(), ['a:amber'], 'the accidental mark goes to the trash');
  service().redo('w1');
  assert.deepEqual(live(), ['a:amber', 'b:amber']);
  service().redo('w1');
  assert.deepEqual(live(), ['a:rose', 'b:amber']);
  assert.throws(() => service().redo('w1'), /nothing-to-redo/u);
  service().undo('w1');
  await new Promise(resolve => setTimeout(resolve, 5));
  add('c');
  assert.throws(() => service().redo('w1'), /nothing-to-redo/u, 'a new action clears redo');
  // Deleting (trash) is undone by restoring; redoing the deletion trashes again.
  const { trashKnowledge } = await import('../../src/main/services/knowledge-history');
  await new Promise(resolve => setTimeout(resolve, 5));
  trashKnowledge(db, 'c');
  service().undo('w1');
  assert.ok(live().includes('c:amber'));
  service().redo('w1');
  assert.equal(live().includes('c:amber'), false);
});


test('discarded redo branch stays discarded after new action, undo, redo and restart', () => {
  const db = createTestDatabase();
  const directory = mkdtempSync(path.join(os.tmpdir(), 'baglib-history-'));
  const file = path.join(directory, 'book.pdf');
  writeFileSync(file, 'fixture');
  db.exec("INSERT INTO work(id,title) VALUES('w1','Book'); INSERT INTO edition(id,work_id) VALUES('e1','w1'); INSERT INTO source(id,edition_id,source_type) VALUES('s1','e1','file')");
  db.prepare('INSERT INTO file_source_detail(source_id,file_path) VALUES(?,?)').run('s1', file);
  const store = () => new MaterialSaveService({ db, python: () => null, helper, staging: directory, backupFolder: () => directory });
  const history = () => new MarkHistoryService(db, store());
  const add = (id: string) => withKnowledgeHistory(db, [id], 'save', () => {
    db.prepare("INSERT INTO knowledge(id,work_id,knowledge_type,location) VALUES(?,'w1','highlight','1')").run(id);
    db.prepare("INSERT INTO highlight_detail(knowledge_id,quoted_text,color) VALUES(?,'mixed — text','amber')").run(id);
  });
  const live = () => db.prepare('SELECT id FROM knowledge WHERE deleted_at IS NULL ORDER BY id').pluck().all();
  try {
    add('a');
    history().undo('w1');
    add('c');
    history().undo('w1');
    history().redo('w1');
    assert.deepEqual(live(), ['c']);
    assert.throws(() => history().redo('w1'), /nothing-to-redo/u);
    history().undo('w1');
    assert.deepEqual(live(), []);
    assert.throws(() => history().undo('w1'), /nothing-to-undo/u, 'abandoned A never re-enters undo either');
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});


function historyFixture() {
  const db = createTestDatabase();
  const directory = mkdtempSync(path.join(os.tmpdir(), 'baglib-history-'));
  const file = path.join(directory, 'book.pdf');
  writeFileSync(file, 'fixture');
  for (const id of ['one', 'two']) {
    db.prepare('INSERT INTO work(id,title) VALUES(?,?)').run(id, 'كتاب — Book');
    db.prepare('INSERT INTO edition(id,work_id) VALUES(?,?)').run('edition-' + id, id);
    db.prepare("INSERT INTO source(id,edition_id,source_type) VALUES(?,?,'file')").run('source-' + id, 'edition-' + id);
    db.prepare('INSERT INTO file_source_detail(source_id,file_path) VALUES(?,?)').run('source-' + id, file);
  }
  const store = () => new MaterialSaveService({ db, python: () => null, helper, staging: directory, backupFolder: () => directory });
  const history = () => new MarkHistoryService(db, store());
  const add = (id: string, actor?: 'reader', work = 'one') => withKnowledgeHistory(db, [id], 'save', () => {
    db.prepare("INSERT INTO knowledge(id,work_id,knowledge_type,location) VALUES(?,?,'highlight','1')").run(id, work);
    db.prepare("INSERT INTO highlight_detail(knowledge_id,quoted_text,color) VALUES(?,'عِلْمٌ — English','amber')").run(id);
  }, undefined, actor);
  const color = (id: string, value: string, actor?: 'reader') => withKnowledgeHistory(db, [id], 'save', () => db.prepare('UPDATE highlight_detail SET color=? WHERE knowledge_id=?').run(value, id), undefined, actor);
  const scope = (value: string) => db.prepare("INSERT INTO app_settings(key,value) VALUES('undo.scope.v1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(value);
  const live = (work = 'one') => db.prepare('SELECT id FROM knowledge WHERE work_id=? AND deleted_at IS NULL ORDER BY id').pluck().all(work);
  const count = () => Number(db.prepare('SELECT COUNT(*) FROM entity_version').pluck().get());
  const cleanup = () => { db.close(); rmSync(directory, { recursive: true, force: true }); };
  return { db, store, history, add, color, scope, live, count, cleanup };
}

test('book scope includes cross-view edits; reader scope skips other views and legacy actors', () => {
  const f = historyFixture();
  try {
    f.add('reader', 'reader'); f.add('notes');
    assert.match(f.history().undo('one').action, /highlight\|save\|notes/u);
    assert.deepEqual(f.live(), ['reader']);
    f.history().redo('one');
    f.scope('reader');
    assert.match(f.history().undo('one').action, /highlight\|save\|reader/u);
    assert.deepEqual(f.live(), ['notes']);
    assert.throws(() => f.history().undo('one'), /nothing-to-undo/u);
    f.history().redo('one');
    assert.deepEqual(f.live(), ['notes', 'reader']);
    assert.equal(f.db.prepare("SELECT value FROM app_settings WHERE key='undo.scope.v1'").pluck().get(), 'reader');
  } finally { f.cleanup(); }
});

test('reader-only undo refuses to overwrite a newer Notes edit on the same item', () => {
  const f = historyFixture();
  try {
    f.add('mark', 'reader'); f.color('mark', 'rose'); f.scope('reader');
    const before = f.count();
    assert.throws(() => f.history().undo('one'), /history-unappliable/u);
    assert.deepEqual(f.live(), ['mark']);
    assert.equal(f.db.prepare('SELECT color FROM highlight_detail').pluck().get(), 'rose');
    assert.equal(f.count(), before);
    assert.deepEqual(f.store().redoStack('one'), []);
  } finally { f.cleanup(); }
});

test('comments, replies, resolve, edit and remove undo as full item snapshots', () => {
  const f = historyFixture();
  try {
    f.add('mark');
    const comments = new CommentThreadService(f.db);
    const root = comments.add({ knowledgeId: 'mark', text: 'هل يصح؟ — Is it correct?' });
    const reply = comments.add({ knowledgeId: 'mark', parentId: root, text: 'Yes' });
    comments.setResolved(root, true);
    comments.edit(reply, 'نعم — yes');
    comments.remove(root);
    const before = f.count();
    for (let i = 0; i < 5; i++) f.history().undo('one');
    assert.deepEqual(comments.list('mark'), []);
    for (let i = 0; i < 5; i++) f.history().redo('one');
    assert.deepEqual(comments.list('mark'), []);
    assert.ok(f.count() > before, 'undo/redo only append');
    f.history().undo('one');
    assert.equal(comments.list('mark')[0].replies[0].content, 'نعم — yes');
    assert.ok(comments.list('mark')[0].resolvedAt);
  } finally { f.cleanup(); }
});

test('a same-moment batch restores every item, excludes its baseline, and isolates books', () => {
  const f = historyFixture();
  try {
    f.add('old');
    withKnowledgeHistory(f.db, ['old', 'new', 'other'], 'save', () => {
      f.color('old', 'rose'); f.add('new'); f.add('other', undefined, 'two');
    });
    const count = f.count();
    assert.equal(f.history().undo('one').items, 2);
    assert.deepEqual(f.live(), ['old']);
    assert.deepEqual(f.live('two'), ['other']);
    assert.equal(f.db.prepare("SELECT color FROM highlight_detail WHERE knowledge_id='old'").pluck().get(), 'amber');
    f.history().redo('one');
    assert.deepEqual(f.live(), ['new', 'old']);
    f.history().undo('two');
    f.add('fork');
    assert.deepEqual(f.store().redoStack('one'), []);
    assert.equal(f.store().redoStack('two').length, 1, 'another book does not invalidate redo');
    f.history().redo('two');
    assert.deepEqual(f.live('two'), ['other']);
    assert.ok(f.count() >= count);
  } finally { f.cleanup(); }
});

test('new edits invalidate redo immediately, no-op and failed edits retain redo', () => {
  const f = historyFixture();
  try {
    assert.throws(() => f.history().undo('one'), /nothing-to-undo/u);
    assert.throws(() => f.history().redo('one'), /nothing-to-redo/u);
    f.add('a'); f.add('b'); f.history().undo('one');
    const stack = f.store().redoStack('one');
    f.color('a', 'amber');
    assert.deepEqual(f.store().redoStack('one'), stack);
    assert.throws(() => withKnowledgeHistory(f.db, ['a'], 'save', () => { f.color('a', 'rose'); throw new Error('failed'); }), /failed/u);
    assert.deepEqual(f.store().redoStack('one'), stack);
    f.color('a', 'rose');
    assert.deepEqual(f.store().redoStack('one'), []);
    assert.deepEqual(f.store().discardedBatches('one'), stack);
    f.history().undo('one');
    assert.equal(f.db.prepare("SELECT color FROM highlight_detail WHERE knowledge_id='a'").pluck().get(), 'amber');
  } finally { f.cleanup(); }
});

test('legacy redo arrays remain readable and more than 500 batches and 200 redo entries are reachable', () => {
  const f = historyFixture();
  try {
    f.add('mark');
    for (let index = 0; index < 501; index++) f.color('mark', index % 2 ? 'amber' : 'rose');
    const count = f.count();
    for (let index = 0; index < 502; index++) f.history().undo('one');
    assert.deepEqual(f.live(), []);
    assert.equal(f.store().redoStack('one').length, 502);
    assert.throws(() => f.history().undo('one'), /nothing-to-undo/u);
    const stack = f.store().redoStack('one');
    f.db.prepare('UPDATE material_save_state SET redo_json=?').run(JSON.stringify(stack));
    for (let index = 0; index < 502; index++) f.history().redo('one');
    assert.deepEqual(f.live(), ['mark']);
    assert.throws(() => f.history().redo('one'), /nothing-to-redo/u);
    assert.ok(f.count() > count);
  } finally { f.cleanup(); }
});

test('undo/redo plus Save writes each owned annotation once and preserves foreign annotations', { skip: !engine && 'PDF engine not installed' }, async () => {
  const f = setup();
  try {
    withKnowledgeHistory(f.db, ['mark'], 'save', () => f.mark('mark', highlight(1)));
    const history = () => new MarkHistoryService(f.db, f.service);
    await f.service.save('w1');
    history().undo('w1'); await f.service.save('w1');
    assert.deepEqual([inspect(f.file).owned, inspect(f.file).outside], [0, 1]);
    history().redo('w1'); await f.service.save('w1');
    const result = inspect(f.file);
    assert.deepEqual([result.owned, result.outside], [1, 1]);
    assert.equal(new Set(result.names).size, result.names.length);
  } finally { f.db.close(); rmSync(f.dir, { recursive: true, force: true }); }
});


test('canonical reader save records reader actor while Notes saves retain their own origin', async () => {
  const f = historyFixture();
  try {
    const repository = new SqliteKnowledgeRepository(f.db);
    const api = { save: async (payload: Parameters<typeof repository.saveKnowledge>[0]) => repository.saveKnowledge(payload) };
    const saved = await saveReaderKnowledge(api, { id: 'reader-mark', workId: 'one', type: 'note', location: '1', noteContent: 'عِلْمٌ — original' });
    const actor = () => f.db.prepare("SELECT actor FROM entity_version WHERE entity_id=? ORDER BY revision DESC LIMIT 1").pluck().get(saved.item.id);
    assert.equal(actor(), 'reader');
    repository.saveKnowledge({ id: saved.item.id, workId: 'one', type: 'note', location: '1', noteContent: 'Notes edit' });
    assert.equal(actor(), null);
    f.history().undo('one');
    assert.equal(repository.getKnowledgeByWork('one')[0].noteContent, 'عِلْمٌ — original');
    f.scope('reader');
    f.history().undo('one');
    assert.deepEqual(f.live(), []);
    f.history().redo('one');
    assert.deepEqual(f.live(), ['reader-mark']);
  } finally { f.cleanup(); }
});

test('reader repository updates and trash carry actor; other views do not inherit it', () => {
  const f = historyFixture();
  try {
    const repository = new SqliteKnowledgeRepository(f.db);
    const payload = { id: 'reader-mark', workId: 'one', type: 'note' as const, location: '1', noteContent: 'original', actor: 'reader' as const };
    repository.saveKnowledge(payload);
    repository.saveKnowledge({ ...payload, noteContent: 'edited' });
    repository.deleteKnowledge(payload.id, 'reader');
    const rows = f.db.prepare("SELECT action,actor FROM entity_version WHERE entity_id=? ORDER BY revision").all(payload.id);
    assert.deepEqual(rows, [{action:'save',actor:'reader'},{action:'save',actor:'reader'},{action:'trash',actor:'reader'}]);
    f.scope('reader');
    f.history().undo('one');
    assert.equal(repository.getKnowledgeByWork('one')[0].noteContent, 'edited');
    repository.saveKnowledge({ id: 'notes-mark', workId: 'one', type: 'note', location: '1', noteContent: 'Notes' });
    assert.equal(f.db.prepare("SELECT actor FROM entity_version WHERE entity_id='notes-mark'").pluck().get(), null);
  } finally { f.cleanup(); }
});

test('reader comment actions record reader actor through the service boundary', () => {
  const f = historyFixture();
  try {
    f.add('mark');
    const comments = new CommentThreadService(f.db, undefined, 'reader');
    const root = comments.add({ knowledgeId:'mark', text:'هل يصح؟ — Reader' });
    const reply = comments.add({ knowledgeId:'mark', parentId:root, text:'Reply' });
    comments.edit(reply, 'Edited reply');
    comments.setResolved(root, true);
    comments.setResolved(root, false);
    comments.remove(reply);
    const rows = f.db.prepare("SELECT action,actor FROM entity_version WHERE entity_id='mark' AND action LIKE 'comment%' ORDER BY revision").all() as {action:string;actor:string|null}[];
    assert.equal(rows.length,6);
    assert.ok(rows.every(row=>row.actor==='reader'));
    f.scope('reader');
    for(let index=0;index<6;index++) f.history().undo('one');
    assert.deepEqual(comments.list('mark'),[]);
    new CommentThreadService(f.db).add({knowledgeId:'mark',text:'Notes comment'});
    assert.equal(f.db.prepare("SELECT actor FROM entity_version WHERE entity_id='mark' ORDER BY revision DESC LIMIT 1").pluck().get(), null);
    assert.throws(()=>f.history().undo('one'),/nothing-to-undo/u);
  } finally { f.cleanup(); }
});


test('invalid actor metadata is rejected before save, trash or comment mutation', () => {
  const f = historyFixture();
  try {
    const repository = new SqliteKnowledgeRepository(f.db);
    const invalid = 'other' as 'reader';
    assert.throws(()=>repository.saveKnowledge({id:'bad',workId:'one',type:'note',location:'1',noteContent:'rejected',actor:invalid}),/invalid-request/u);
    assert.deepEqual(f.live(),[]);
    f.add('mark'); const count=f.count();
    assert.throws(()=>repository.deleteKnowledge('mark',invalid),/invalid-request/u);
    assert.throws(()=>new CommentThreadService(f.db,undefined,invalid).add({knowledgeId:'mark',text:'rejected'}),/invalid-request/u);
    assert.equal(f.count(),count);
    assert.deepEqual(f.live(),['mark']);
    assert.equal(f.db.prepare('SELECT COUNT(*) FROM comment').pluck().get(),0);
  } finally { f.cleanup(); }
});
