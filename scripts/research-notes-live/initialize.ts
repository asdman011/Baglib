import { getDatabase } from '../../src/main/database/connection';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { ManuscriptRepository } from '../../src/main/database/repositories/manuscript.repository';
import { initialManuscriptSnapshot } from '../../src/shared/manuscript-snapshot';

export { translations } from '../../src/renderer/translations';

/** KEY-372 live run: one manuscript with an Arabic and an English chapter, in a throwaway profile. */
export function initializeProfile() {
  const db = getDatabase();
  runMigrations(db, migrations);
  const repo = new ManuscriptRepository(db);
  const m = repo.create('KEY-372 الملاحظات والمخطوطات', 'research');
  const one = repo.createDocument(m.id, 'الفصل الأول: الشواهد البلاغية');
  repo.save({ id: one.id, snapshot: initialManuscriptSnapshot(one.id, one.title) });
  const two = repo.createDocument(m.id, 'Chapter 2: Sources');
  repo.save({ id: two.id, snapshot: initialManuscriptSnapshot(two.id, two.title) });
}
