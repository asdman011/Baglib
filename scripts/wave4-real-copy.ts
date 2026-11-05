import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { backupBeforeMigrations } from '../src/main/database/migration-backup';
import { runMigrations } from '../src/main/database/migrator';
import { migrations } from '../src/main/database/migrations';
import { StudyNotesService } from '../src/main/services/study-notes';
import { SqliteSettingsRepository } from '../src/main/database/repositories/settings.repository';

const file=process.env.BAGLIB_WAVE4_COPY;
if(!file || !path.resolve(file).includes(`${path.sep}.baglib-data${path.sep}wave4-real-copy-`)) throw new Error('Copy path required');
const db=new Database(file);
db.pragma('foreign_keys=ON');
db.pragma('journal_mode=WAL');
const names=['work','knowledge','annotations','reading_session','srs_state','srs_review_log'];
const counts=()=>Object.fromEntries(names.map(table=>[table,db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(table)?(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {count:number}).count:0]));
try {
  const before=counts(), prior=db.prepare('SELECT * FROM _migrations ORDER BY id').all();
  const beforeIntegrity=db.pragma('integrity_check',{simple:true});
  assert.equal(beforeIntegrity,'ok');
  const beforeForeignKeys=db.pragma('foreign_key_check');
  const backup=backupBeforeMigrations(db,migrations);
  runMigrations(db,migrations);
  const conversion=new StudyNotesService(new SqliteSettingsRepository(db),db).convertLegacy();
  const after=counts();
  for(const table of names) assert.ok(after[table]>=before[table]);
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  const afterForeignKeys=db.pragma('foreign_key_check');
  assert.equal(afterForeignKeys.length,beforeForeignKeys.length);
  fs.writeFileSync(path.join(path.dirname(file),'verification.json'),JSON.stringify({before,after,prior,backup,conversion,foreignKeyViolations:afterForeignKeys.length,integrity:'ok'},null,2));
} finally {db.close();}
