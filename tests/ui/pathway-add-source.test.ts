import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { translations } from '../../src/renderer/translations';
import { pathwayProgress } from '../../src/shared/pathway-model';

// KEY-327: a next step without a source offers to attach one, so "Continue" can follow.
test('the next-step card offers to attach a source when the step has none', () => {
  const source = fs.readFileSync(path.resolve('src/renderer/components/dashboard/PathwaysView.tsx'), 'utf8');
  assert.match(source, /!progress\.target && <Button[^>]*data-pathway-add-source/u);
  assert.match(source, /<details ref=\{resourcePicker\} data-pathway-resource-picker>/u);
  assert.ok(translations.ar.pathwayAddSourceForStep && translations.en.pathwayAddSourceForStep);
});

test('a resource added to the step section becomes the Continue target', () => {
  const base = { pathwayId: 'p', done: false, pinned: false, createdAt: '', updatedAt: '' };
  const step = { ...base, id: 's1', kind: 'step', section: 'Define', title: 'Write the question', sortOrder: 1 };
  assert.equal(pathwayProgress([step] as never).target, null);
  const book = { ...base, id: 'r1', kind: 'resource', section: 'Define', title: 'Book', reference: 'book:w1', sortOrder: 2 };
  assert.equal(pathwayProgress([step, book] as never).target?.id, 'r1');
});
