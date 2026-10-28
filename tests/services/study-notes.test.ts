import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { StudyNotesService } from '../../src/main/services/study-notes';
import { matchesStudyQuery, studyBacklinks, studyLinks, studyLinkText, studyNoteHeading } from '../../src/shared/study-notes';

test('personal study notes persist without library works; edits preserve references and creation date', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)');
  const settings = new SqliteSettingsRepository(db);
  const service = new StudyNotesService(settings);
  const content = 'تأمل — reflection\n[[quran:warsh:2:255|البقرة]]\n[[sunnah:Bukhari:1:Bukhari:1:1|حديث]]';
  const first = service.save({ title: 'الهداية', content, aliases: ['Guidance', 'Guidance'], tags: ['قرآن'] });
  assert.equal(first.workId, undefined);
  assert.deepEqual(first.aliases, ['Guidance']);
  const restored = new StudyNotesService(new SqliteSettingsRepository(db));
  assert.equal(restored.list()[0].content, content);
  const next = restored.save({ ...first, title: 'فائدة' });
  assert.equal(next.createdAt, first.createdAt);
  assert.equal(studyLinks(next.content)[0].target, 'quran:warsh:2:255');
  assert.equal(studyLinks(next.content)[1].target, 'sunnah:Bukhari:1:Bukhari:1:1');
  assert.throws(() => service.save({ ...first, id: '../bad' }));
  assert.throws(() => service.save({ ...first, content: ' ' }));
  restored.remove(first.id); assert.deepEqual(service.list(), []);
  db.close();
});

test('links derive unique backlinks, ignore code examples and reject invalid/unsafe references', () => {
  const service = new StudyNotesService({ get: () => undefined, set: () => {}, getAll: () => ({}), delete: () => true });
  const first = service.save({ title: 'First', content: 'text', aliases: [], tags: [] });
  const second = service.save({ title: 'Second', content: `${studyLinkText(`note:${first.id}`, 'Alias', true)}\n${studyLinkText(`note:${first.id}`, 'First')}\n[[quran:hafs:2:255|Verse]]`, aliases: [], tags: [] });
  assert.deepEqual(studyBacklinks([first, second], `note:${first.id}`).map(note => note.id), [second.id]);
  assert.equal(studyLinks(second.content)[0].embed, true);
  assert.deepEqual(studyLinks('`[[note:test]]`\n```\n[[note:test]]\n```\n[[javascript:alert(1)]]\n[[quran:hafs:115:1]]'), []);
  assert.equal(studyLinkText('quran:hafs:2:255', 'آية | Test'), '[[quran:hafs:2:255|آية   Test]]');
});

test('note search handles Arabic tashkeel, alef variants and mixed scripts without merging ة/ه', () => {
  assert.equal(matchesStudyQuery('إِيمَان — Faith', 'ايمان faith'), true);
  assert.equal(matchesStudyQuery('الهداية', 'الهدايه'), false);
});

test('automatic headings show the thought or reference label rather than raw link IDs', () => {
  assert.equal(studyNoteHeading('![[note:some-long-id|Guidance]]\n[[quran:hafs:2:255|البقرة]]\n\n## تأمل — Reflection'), 'تأمل — Reflection');
  assert.equal(studyNoteHeading('[[sunnah:Bukhari:1:Bukhari:1:1|حديث النيات]]'), 'حديث النيات');
});
