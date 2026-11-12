import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { StudyPlannerRepository } from '../../src/main/database/repositories/study-planner.repository';
import { PathwayService, referenceText } from '../../src/main/services/pathways';
import { parseOutline, validateItem, validatePathway, validateTemplate } from '../../src/shared/pathways';
import { buildCurriculumDraftPrompt } from '../../src/shared/utils/ai-prompts';

function fixture() {
  const db = new Database(':memory:'); db.pragma('foreign_keys=ON'); runMigrations(db, migrations);
  return { db, service: new PathwayService(db), planner: new StudyPlannerRepository(db) };
}

test('an outline keeps sections, drops list marks and ignores blank lines', () => {
  assert.deepEqual(parseOutline('# الأولى\n- قراءة\n\n1. تلخيص\n## الثانية\nمراجعة'), [
    { section: 'الأولى', title: 'قراءة' }, { section: 'الأولى', title: 'تلخيص' }, { section: 'الثانية', title: 'مراجعة' },
  ]);
});

test('a curriculum from an outline makes planner tasks, and progress follows the planner', () => {
  const { db, service, planner } = fixture();
  try {
    const created = service.save({ name: 'الفقه', description: '', kind: 'curriculum', outline: '# أولى\nقراءة\nتلخيص' });
    assert.deepEqual([created.steps, created.done], [2, 0]);
    assert.equal(planner.list().length, 2);
    const [first, second] = service.get(created.id).items;
    service.setDone(first.id, true);
    assert.equal(service.get(created.id).done, 1);
    assert.equal(planner.list().find(task => task.title === 'قراءة')!.status, 'completed');
    const other = planner.list().find(task => task.title === 'تلخيص')!;
    planner.save({ ...other, expectedUpdatedAt: other.updatedAt, status: 'completed' });
    assert.equal(service.get(created.id).done, 2);
    assert.equal(service.get(created.id).items.find(item => item.id === second.id)!.done, true);
    const reopened = planner.list().find(task => task.title === 'تلخيص')!;
    planner.save({ ...reopened, expectedUpdatedAt: reopened.updatedAt, status: 'cancelled' });
    assert.deepEqual([service.get(created.id).steps, service.get(created.id).done], [1, 1]);
  } finally { db.close(); }
});

test('a step whose planner task was deleted gets a new task instead of failing', () => {
  const { db, service, planner } = fixture();
  try {
    const { id } = service.save({ name: 'x', description: '', kind: 'curriculum', outline: 'قراءة' });
    const [step] = service.get(id).items;
    const task = planner.list()[0];
    planner.remove(task.id, task.updatedAt);
    service.setDone(step.id, true);
    assert.equal(service.get(id).done, 1);
    assert.equal(planner.list().length, 1);
  } finally { db.close(); }
});

test('items keep their order, pins and saved titles, and deleting a book keeps the item', () => {
  const { db, service } = fixture();
  try {
    db.prepare("INSERT INTO work(id,title) VALUES('b1','صحيح البخاري')").run();
    const { id } = service.save({ name: 'بحث', description: '', kind: 'research' });
    const book = service.addItem({ pathwayId: id, section: '', kind: 'resource', reference: 'book:b1', title: 'صحيح البخاري' });
    const link = service.addItem({ pathwayId: id, section: '', kind: 'link', title: 'رابط', url: 'https://example.com/a' });
    service.reorder(id, [link.id, book.id]);
    service.setPinned(link.id, true);
    assert.deepEqual(service.get(id).items.map(item => [item.id, item.pinned]), [[link.id, true], [book.id, false]]);
    assert.throws(() => service.reorder(id, [link.id]), /invalid-request/);
    db.prepare("DELETE FROM work WHERE id='b1'").run();
    assert.equal(service.get(id).items[1].title, 'صحيح البخاري');
    assert.match(service.exportText(id, 'markdown').text, /صحيح البخاري/);
  } finally { db.close(); }
});

test('removing a pathway removes its items and keeps its planner tasks', () => {
  const { db, service, planner } = fixture();
  try {
    const { id } = service.save({ name: 'x', description: '', kind: 'curriculum', outline: 'قراءة' });
    service.remove(id);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM pathway_item').get() as { n: number }).n, 0);
    assert.equal(planner.list().length, 1);
    assert.throws(() => service.get(id), /invalid-request/);
  } finally { db.close(); }
});

test('a pathway never reaches other collection types', () => {
  const { db, service } = fixture();
  try {
    db.prepare("INSERT INTO collection(id,name,collection_type) VALUES('deck','حفظ','deck')").run();
    assert.deepEqual(service.list(), []);
    assert.throws(() => service.remove('deck'), /invalid-request/);
    assert.throws(() => service.save({ id: 'deck', name: 'y', description: '', kind: 'research' }), /invalid-request/);
    assert.throws(() => service.addStep('deck', '', 'x'), /invalid-request/);
    assert.equal((db.prepare("SELECT name FROM collection WHERE id='deck'").get() as { name: string }).name, 'حفظ');
  } finally { db.close(); }
});

test('references export authors, publishers and links, and leave notes and steps out', () => {
  const { db, service } = fixture();
  try {
    db.exec(`INSERT INTO work(id,title) VALUES('b1','فتح الباري');
      INSERT INTO author(id,name) VALUES('a1','ابن حجر');
      INSERT INTO work_author(work_id,author_id,role) VALUES('b1','a1','author');
      INSERT INTO edition(id,work_id,publisher,publication_year) VALUES('e1','b1','دار المعرفة',1959);`);
    const { id } = service.save({ name: 'بحث', description: '', kind: 'research', outline: 'خطوة' });
    service.addItem({ pathwayId: id, section: '', kind: 'resource', reference: 'book:b1', title: 'x' });
    service.addItem({ pathwayId: id, section: '', kind: 'resource', reference: 'note:n1', title: 'ملاحظة' });
    service.addItem({ pathwayId: id, section: '', kind: 'resource', reference: 'quran:hafs:2:255', title: 'آية الكرسي' });
    service.addItem({ pathwayId: id, section: '', kind: 'link', title: 'مقال {1}', url: 'https://example.com/' });
    const { text } = service.exportText(id, 'bibtex');
    assert.match(text, /@book\{baglib1,\n  title = \{فتح الباري\},\n  author = \{ابن حجر\},\n  publisher = \{دار المعرفة\},\n  year = \{1959\}\n\}/u);
    assert.match(text, /@misc\{baglib2,\n  title = \{آية الكرسي\},\n  note = \{quran:hafs:2:255\}/u);
    assert.match(text, /@online\{baglib3,\n  title = \{مقال 1\},\n  url = \{https:\/\/example.com\/\}/u);
    assert.doesNotMatch(text, /ملاحظة|خطوة/u);
  } finally { db.close(); }
});

test('reference text keeps Arabic spelling and diacritics exactly', () => {
  assert.match(referenceText('قائمة', [{ key: 'a', title: 'صَحِيحُ الْبُخَارِيِّ' }], 'markdown'), /صَحِيحُ الْبُخَارِيِّ/u);
});

test('personal templates persist in settings and stay removable', () => {
  const { db, service } = fixture();
  try {
    const saved = service.saveTemplate({ name: 'قالبي', kind: 'curriculum', outline: '# أ\nب' });
    assert.deepEqual(new PathwayService(db).templates(), [saved]);
    service.removeTemplate(saved.id);
    assert.deepEqual(service.templates(), []);
  } finally { db.close(); }
});

test('validators refuse unsafe links, unknown targets and empty templates', () => {
  const base = { pathwayId: 'p', section: '', title: 't' };
  assert.throws(() => validateItem({ ...base, kind: 'link', url: 'javascript:alert(1)' }), /invalid-request/);
  assert.throws(() => validateItem({ ...base, kind: 'link', url: 'file:///c:/x' }), /invalid-request/);
  assert.throws(() => validateItem({ ...base, kind: 'resource', reference: 'evil:1' }), /invalid-request/);
  assert.equal(validateItem({ ...base, kind: 'link', url: 'https://example.com' }).url, 'https://example.com/');
  assert.throws(() => validatePathway({ name: ' ', kind: 'research' }), /invalid-request/);
  assert.throws(() => validatePathway({ name: 'x', kind: 'deck' }), /invalid-request/);
  assert.throws(() => validateTemplate({ name: 'x', kind: 'research', outline: '# only a heading' }), /invalid-request/);
});

test('the AI draft prompt forbids naming books, scholars or quotations', () => {
  const { systemPrompt, userPrompt } = buildCurriculumDraftPrompt('أصول الفقه', 'ar');
  assert.equal(userPrompt, 'أصول الفقه');
  assert.match(systemPrompt, /Do not name books, authors or scholars, and do not quote or cite/u);
  assert.match(systemPrompt, /in Arabic/u);
});

// The resource picker writes book:<work>@<source> (and may add a page); the citation still finds the work's details.
test('book references with a source or page still export author, publisher and year', () => {
  const { db, service } = fixture();
  try {
    db.exec(`INSERT INTO work(id,title) VALUES('b2','Why Would Feminists Trust the Police?');
      INSERT INTO author(id,name) VALUES('a2','Leah Cowan');
      INSERT INTO work_author(work_id,author_id,role) VALUES('b2','a2','author');
      INSERT INTO edition(id,work_id,publisher,publication_year) VALUES('e2','b2','Verso',2024);`);
    const { id } = service.save({ name: 'Research', description: '', kind: 'research', outline: 'Step' });
    service.addItem({ pathwayId: id, section: '', kind: 'resource', reference: 'book:b2@src-1', title: 'Why Would Feminists Trust the Police?' });
    service.addItem({ pathwayId: id, section: '', kind: 'resource', reference: 'book:b2@src-1#p=12', title: 'page twelve' });
    const { text } = service.exportText(id, 'bibtex');
    assert.match(text, /@book\{baglib1,\n  title = \{Why Would Feminists Trust the Police\?\},\n  author = \{Leah Cowan\},\n  publisher = \{Verso\},\n  year = \{2024\}\n\}/u);
    assert.match(text.split('@book{baglib2,')[1] ?? '', /author = \{Leah Cowan\}/u);
  } finally { db.close(); }
});
