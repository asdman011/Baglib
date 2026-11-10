import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { PathwayService } from '../../src/main/services/pathways';
import { parseOutline, validatePathway, validateTemplate, type PathwayItem } from '../../src/shared/pathways';
import { copyTemplate, nextTarget, outlineFromItems, pathwayProgress, percentOf, placeItem, summarizeOutline, tabMatches, templateFromPathway } from '../../src/shared/pathway-model';

const item = (over: Partial<PathwayItem> & Pick<PathwayItem, 'id' | 'kind'>): PathwayItem => ({
  pathwayId: 'p', section: '', reference: null, title: over.id, url: null, pinned: false, sortOrder: 0, createdAt: '2026-11-10T00:00:00.000Z', done: false, ...over,
});

const OUTLINE = '# المرحلة الأولى\nأساسيات العلم\nمراجعة الأساسيات\n# المرحلة الثانية\nتوسيع المسائل';

test('copying a template keeps its structure, takes a trimmed name and validates like a normal pathway', () => {
  const template = { name: 'منهج متدرج', kind: 'curriculum' as const, outline: OUTLINE };
  const copy = copyTemplate(template, '  فقه العبادات  ');
  assert.deepEqual(copy, { name: 'فقه العبادات', description: '', kind: 'curriculum', outline: OUTLINE });
  assert.deepEqual(validatePathway(copy).name, 'فقه العبادات');
  assert.equal(copyTemplate(template).name, 'منهج متدرج');
  assert.equal(copyTemplate(template, '   ').name, 'منهج متدرج');
  assert.deepEqual(template, { name: 'منهج متدرج', kind: 'curriculum', outline: OUTLINE });
  assert.throws(() => copyTemplate({ ...template, outline: '# only a heading' }), /invalid-request/);
  assert.throws(() => copyTemplate({ ...template, name: ' ' }), /invalid-request/);
});

test('a template summary counts steps and lists each heading once', () => {
  assert.deepEqual(summarizeOutline(OUTLINE), { steps: 3, sections: ['المرحلة الأولى', 'المرحلة الثانية'] });
  assert.deepEqual(summarizeOutline('Read\nWrite'), { steps: 2, sections: [] });
});

test('a pathway saves as a personal template made of its steps only, and the outline round-trips', () => {
  const items = [
    item({ id: 'a', kind: 'step', section: 'Plan', title: 'Question' }),
    item({ id: 'r', kind: 'resource', section: 'Plan', reference: 'book:1', title: 'A book' }),
    item({ id: 'l', kind: 'link', section: 'Plan', url: 'https://example.org', title: 'Site' }),
    item({ id: 'b', kind: 'step', section: 'Write', title: '# Draft' }),
    item({ id: 'c', kind: 'step', section: 'Plan', title: '- Scope\nnotes' }),
  ];
  assert.equal(outlineFromItems(items), '# Plan\nQuestion\nScope notes\n# Write\nDraft');
  const template = templateFromPathway({ name: ' My plan ', kind: 'research', items });
  assert.deepEqual(template, { name: 'My plan', kind: 'research', outline: '# Plan\nQuestion\nScope notes\n# Write\nDraft' });
  assert.deepEqual(validateTemplate(template), template);
  assert.deepEqual(parseOutline(template.outline).map(step => step.title), ['Question', 'Scope notes', 'Draft']);
  assert.throws(() => templateFromPathway({ name: 'Links only', kind: 'research', items: items.slice(1, 3) }), /invalid-request/);
});

test('progress counts finished steps in order and names the next step', () => {
  const items = [
    item({ id: 's1', kind: 'step', section: 'A', title: 'one', sortOrder: 0, done: true }),
    item({ id: 'bk', kind: 'resource', section: 'A', reference: 'book:7', title: 'Book', sortOrder: 1 }),
    item({ id: 's2', kind: 'step', section: 'B', title: 'two', sortOrder: 2 }),
    item({ id: 's3', kind: 'step', section: 'B', title: 'three', sortOrder: 3 }),
  ];
  const progress = pathwayProgress(items);
  assert.deepEqual([progress.done, progress.total, progress.percent, progress.complete], [1, 3, 33, false]);
  assert.equal(progress.next?.id, 's2');
  assert.deepEqual(progress.sections, [{ section: 'A', done: 1, total: 1 }, { section: 'B', done: 0, total: 2 }]);
  const finished = pathwayProgress(items.map(row => ({ ...row, done: row.kind === 'step' })));
  assert.deepEqual([finished.percent, finished.complete, finished.next, finished.target], [100, true, null, null]);
});

test('an empty pathway has zero progress and nothing to open', () => {
  assert.deepEqual(pathwayProgress([]), { done: 0, total: 0, percent: 0, complete: false, sections: [], next: null, target: null });
  assert.equal(percentOf(0, 0), 0);
  assert.equal(percentOf(5, 3), 100);
});

test('the next step opens a source from its own section first, then any source, then a link', () => {
  const step = item({ id: 's', kind: 'step', section: 'Read', sortOrder: 0 });
  const here = item({ id: 'here', kind: 'resource', section: 'Read', reference: 'book:1', sortOrder: 2 });
  const elsewhere = item({ id: 'there', kind: 'resource', section: 'Other', reference: 'note:9', sortOrder: 1 });
  const link = item({ id: 'link', kind: 'link', section: 'Read', url: 'https://example.org', sortOrder: 3 });
  assert.equal(nextTarget([step, elsewhere, here, link], step)?.id, 'here');
  assert.equal(nextTarget([step, elsewhere, link], step)?.id, 'there');
  assert.equal(nextTarget([step, link], step)?.id, 'link');
  assert.equal(nextTarget([step], step), null);
  assert.equal(nextTarget([step, here], null), null);
});

test('notes and links go to the end column and tabs filter by kind', () => {
  assert.equal(placeItem({ kind: 'link', reference: null }), 'end');
  assert.equal(placeItem({ kind: 'resource', reference: 'note:3' }), 'end');
  assert.equal(placeItem({ kind: 'resource', reference: 'book:3' }), 'middle');
  assert.equal(placeItem({ kind: 'step', reference: 'task:1' }), 'middle');
  assert.deepEqual((['all', 'research', 'curriculum', 'templates'] as const).map(tab => tabMatches(tab, 'research')), [true, true, false, true]);
});

test('a template copy through the real service starts with no progress and leaves the stored template alone', () => {
  const db = new Database(':memory:'); db.pragma('foreign_keys=ON'); runMigrations(db, migrations);
  try {
    const service = new PathwayService(db);
    const saved = service.saveTemplate({ name: 'Staged', kind: 'curriculum', outline: OUTLINE });
    const created = service.save(copyTemplate(saved, 'Fiqh'));
    assert.deepEqual([created.name, created.kind, created.steps, created.done], ['Fiqh', 'curriculum', 3, 0]);
    const detail = service.get(created.id);
    const progress = pathwayProgress(detail.items);
    assert.deepEqual([progress.total, progress.next?.title], [3, 'أساسيات العلم']);
    service.setDone(detail.items[0].id, true);
    assert.equal(pathwayProgress(service.get(created.id).items).percent, 33);
    const mine = service.saveTemplate(templateFromPathway(service.get(created.id)));
    assert.equal(mine.outline, OUTLINE);
    assert.deepEqual(service.templates().map(template => template.name), ['Staged', 'Fiqh']);
    assert.equal(service.templates()[0].outline, OUTLINE);
  } finally { db.close(); }
});
