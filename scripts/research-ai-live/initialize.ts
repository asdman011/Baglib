import { getDatabase } from '../../src/main/database/connection';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { ManuscriptRepository } from '../../src/main/database/repositories/manuscript.repository';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { StudyNotesService } from '../../src/main/services/study-notes';
import { initialManuscriptSnapshot, insertBlockIntoManuscriptSnapshot } from '../../src/shared/manuscript-snapshot';
import { emptySourceProps } from '../../src/shared/research-editor-sources';
import { noteEmbedProps } from '../../src/shared/manuscript-notes';

export { translations } from '../../src/renderer/translations';

const withParagraph = (id: string, title: string, text: string) => {
  const root = JSON.parse(initialManuscriptSnapshot(id, title));
  const note = root.blocks.children.find((block: { flavour: string }) => block.flavour === 'affine:note');
  note.children[0].props.text.delta = [{ insert: text }];
  return JSON.stringify(root);
};

/**
 * KEY-373 live run: a chapter with text, an ayah block and an embedded note, in a throwaway profile. AI settings
 * start as Gemini with no key, so the panel first shows "not set up"; the scenario then points it at a local mock.
 */
export function initializeProfile() {
  const db = getDatabase();
  runMigrations(db, migrations);
  const settings = new SqliteSettingsRepository(db);
  settings.set('ai_settings', { enabled: true, provider: 'gemini', geminiApiKey: '', translationProvider: 'llm', targetLanguage: 'ar', antiSpoilerCeiling: true });
  const note = new StudyNotesService(settings, db).save({ title: 'فوائد في البلاغة', content: 'التشبيه البليغ ما حذفت فيه الأداة ووجه الشبه، مثل: زيدٌ أسدٌ.', aliases: [], tags: [] });
  const repo = new ManuscriptRepository(db);
  const m = repo.create('KEY-373 مساعد البحث', 'research');
  const one = repo.createDocument(m.id, 'الفصل الأول: التوحيد');
  let snapshot = withParagraph(one.id, one.title, 'التوحيد أصل الدين وأساسه، وعليه تقوم سائر العبادات والأحكام.');
  snapshot = insertBlockIntoManuscriptSnapshot(snapshot, 'ayah', {
    ...emptySourceProps(), url: 'quran:hafs:2:255', label: 'البقرة ٢٥٥', text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ',
  }).snapshot;
  snapshot = insertBlockIntoManuscriptSnapshot(snapshot, 'note-embed', noteEmbedProps(note)).snapshot;
  repo.save({ id: one.id, snapshot });
  const two = repo.createDocument(m.id, 'Chapter 2: Method');
  repo.save({ id: two.id, snapshot: withParagraph(two.id, two.title, 'This chapter explains the method of the study.') });
}
