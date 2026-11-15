import { getDatabase } from '../../src/main/database/connection';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { ManuscriptRepository } from '../../src/main/database/repositories/manuscript.repository';
import { initialManuscriptSnapshot } from '../../src/shared/manuscript-snapshot';

export { translations } from '../../src/renderer/translations';

/** KEY-370 live run: one manuscript with an Arabic and an English chapter, in a throwaway profile. */
export function initializeProfile() {
  const db = getDatabase();
  runMigrations(db, migrations);
  const repo = new ManuscriptRepository(db);
  const m = repo.create('KEY-370 الإرسال إلى المخطوطة', 'research');
  const one = repo.createDocument(m.id, 'الفصل الأول: الشواهد');
  repo.save({ id: one.id, snapshot: initialManuscriptSnapshot(one.id, one.title) });
  const two = repo.createDocument(m.id, 'Chapter 2: Sources');
  repo.save({ id: two.id, snapshot: initialManuscriptSnapshot(two.id, two.title) });
}
