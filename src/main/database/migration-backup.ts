import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Migration } from './migrator';

function checksum(file: string): string {
  const descriptor = fs.openSync(file,'r');
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(1024*1024);
  try {
    let bytes: number;
    while ((bytes=fs.readSync(descriptor,buffer,0,buffer.length,null))>0) hash.update(buffer.subarray(0,bytes));
    return hash.digest('hex');
  } finally { fs.closeSync(descriptor); }
}
export function backupBeforeMigrations(db: Database.Database,migrations: Migration[]): string | null {
  if (db.name === ':memory:') return null;
  const tracked=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE name='_migrations'").get());
  if(!tracked&&!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get())return null;
  const applied = new Set((tracked?db.prepare('SELECT id FROM _migrations').all() as {id:number}[]:[]).map(row=>row.id));
  if (!migrations.some(migration=>!applied.has(migration.id))) return null;
  const directory = path.join(path.dirname(db.name),'migration-backups');
  fs.mkdirSync(directory,{recursive:true});
  const destination = path.join(directory,`before-migration-${Date.now()}-${randomUUID()}.db`);
  const temporary = `${destination}.tmp`;
  try {
    db.pragma('locking_mode=EXCLUSIVE');
    db.exec('BEGIN EXCLUSIVE');
    db.prepare('SELECT COUNT(*) FROM sqlite_master').get();
    db.exec('COMMIT');
    const checkpoint = db.pragma('wal_checkpoint(TRUNCATE)') as {busy:number;log:number;checkpointed:number}[];
    if (checkpoint.some(row=>row.busy!==0 || row.log>row.checkpointed)) throw new Error('backup-busy');
    fs.copyFileSync(db.name,temporary,fs.constants.COPYFILE_EXCL);
    if (checksum(db.name)!==checksum(temporary)) throw new Error('backup-checksum');
    const copy = new Database(temporary,{readonly:true,fileMustExist:true});
    try { if (copy.pragma('integrity_check',{simple:true})!=='ok') throw new Error('backup-integrity'); } finally { copy.close(); }
    fs.renameSync(temporary,destination);
    return destination;
  } finally {
    if (db.inTransaction) db.exec('ROLLBACK');
    db.pragma('locking_mode=NORMAL');
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
