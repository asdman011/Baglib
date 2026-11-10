import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { PersonalCommentaryService } from '../../src/main/services/personal-commentary';
import { validateCommentary } from '../../src/shared/personal-commentary';

test('Quran notes isolate equal ayah numbers in Hafs and Warsh, retaining legacy Hafs notes', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  runMigrations(db,migrations);
  try {
    const service = new PersonalCommentaryService(db);
    service.save({reference:'quran:1:3',kind:'reflection',text:'Legacy Hafs'});
    service.save(validateCommentary({reference:'quran:warsh:1:3',kind:'reflection',text:'Warsh'}));
    const hafs = service.list('quran:hafs:1:3');
    const warsh = service.list('quran:warsh:1:3');
    assert.deepEqual(hafs.map(entry => entry.text),['Legacy Hafs']);
    assert.deepEqual(warsh.map(entry => entry.text),['Warsh']);
    assert.throws(() => service.save({...hafs[0],reference:'quran:warsh:1:3',text:'Cross-profile'}),/invalid-request/);
    service.save({...hafs[0],text:'Edited legacy',expectedRevision:hafs[0].revision});
    assert.deepEqual(service.list('quran:1:3').map(entry => entry.text),['Edited legacy']);
    assert.deepEqual(service.list('quran:warsh:1:3').map(entry => entry.text),['Warsh']);
    assert.equal(db.prepare('SELECT COUNT(*) FROM annotations').pluck().get(),0);
  } finally { db.close(); }
});
