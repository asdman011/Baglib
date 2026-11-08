import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createTestDatabase } from '../helpers/test-db';
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
