import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { KnowledgeHistoryService, headRevision } from '../../src/main/services/knowledge-history';
import { PersonalCommentaryService } from '../../src/main/services/personal-commentary';
import { validateCommentary } from '../../src/shared/personal-commentary';

function fixture() {
  const db = new Database(':memory:'); db.pragma('foreign_keys=ON'); runMigrations(db, migrations);
  return { db, service: new PersonalCommentaryService(db), history: new KnowledgeHistoryService(db) };
}

test('entries attach to one ayah or hadith and stay out of the reader', () => {
  const { db, service } = fixture();
  try {
    service.save({ reference: 'quran:2:255', kind: 'reflection', text: 'تأمل في آية الكرسي' });
    service.save({ reference: 'quran:2:25', kind: 'question', text: 'سؤال آخر' });
    service.save({ reference: 'hadith:1234', kind: 'academic', text: 'مرجع' });
    assert.deepEqual(service.list('quran:2:255').map(entry => [entry.reference, entry.kind, entry.text]), [['quran:2:255', 'reflection', 'تأمل في آية الكرسي']]);
    assert.equal(service.list('hadith:1234')[0].kind, 'academic');
    assert.equal(db.prepare('SELECT COUNT(*) FROM annotations').pluck().get(), 0);
  } finally { db.close(); }
});

test('search ignores diacritics and keeps the stored text exact', () => {
  const { db, service } = fixture();
  try {
    service.save({ reference: 'quran:1:1', kind: 'insight', text: 'الرَّحْمَٰن واسع' });
    const [entry] = service.search('الرحمن');
    assert.equal(entry.text, 'الرَّحْمَٰن واسع');
    assert.deepEqual(service.search('غير موجود'), []);
    assert.deepEqual(service.search('   '), []);
  } finally { db.close(); }
});

test('entries keep history and restore, and trash hides them', () => {
  const { db, service, history } = fixture();
  try {
    service.save({ reference: 'quran:1:1', kind: 'reflection', text: 'الأول' });
    const [entry] = service.list('quran:1:1');
    service.save({ id: entry.id, reference: 'quran:1:1', kind: 'research', text: 'الثاني', expectedRevision: entry.revision });
    assert.equal(headRevision(db, entry.id), 2);
    assert.throws(() => service.save({ id: entry.id, reference: 'quran:1:1', kind: 'research', text: 'قديم', expectedRevision: 1 }), /history-conflict/);
    assert.equal(service.list('quran:1:1')[0].kind, 'research');
    history.restore(entry.id, 1, 2);
    assert.deepEqual([service.list('quran:1:1')[0].kind, service.list('quran:1:1')[0].text], ['reflection', 'الأول']);
    assert.ok(service.remove(entry.id));
    assert.deepEqual(service.list('quran:1:1'), []);
    assert.deepEqual(service.search('الأول'), []);
  } finally { db.close(); }
});

test('only commentary on the same source can be changed', () => {
  const { db, service } = fixture();
  try {
    db.prepare("INSERT INTO knowledge(id,knowledge_type,location) VALUES('other','note','1')").run();
    db.prepare("INSERT INTO note_detail(knowledge_id,content) VALUES('other','نص')").run();
    assert.throws(() => service.save({ id: 'other', reference: 'quran:1:1', kind: 'insight', text: 'x' }), /invalid-request/);
    assert.equal(service.remove('other'), false);
    service.save({ reference: 'quran:1:1', kind: 'insight', text: 'x' });
    const [entry] = service.list('quran:1:1');
    assert.throws(() => service.save({ id: entry.id, reference: 'quran:1:2', kind: 'insight', text: 'y' }), /invalid-request/);
  } finally { db.close(); }
});

test('input is validated', () => {
  assert.throws(() => validateCommentary({ reference: 'poetry:1', kind: 'insight', text: 'x' }), /invalid-request/);
  assert.throws(() => validateCommentary({ reference: 'quran:1:1', kind: 'other', text: 'x' }), /invalid-request/);
  assert.throws(() => validateCommentary({ reference: 'quran:1:1', kind: 'insight', text: ' ' }), /invalid-request/);
  assert.equal(validateCommentary({ reference: 'hadith:9', kind: 'insight', text: 'x' }).reference, 'hadith:9');
});
