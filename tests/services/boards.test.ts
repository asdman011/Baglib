import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { edgeEndpoints, freeSpot, presetBoard, removeBoardItems, validateBoardInput, type BoardItem } from '../../src/shared/boards';
import { BoardStore } from '../../src/main/services/boards';

const words = { centre: 'الفكرة', branch: 'فرع', claim: 'الدعوى', reason: 'دليل', objection: 'اعتراض', supports: 'يؤيد', opposes: 'يعترض' };
const ids = () => { let n = 0; return () => `id-${++n}`; };
const item = (id: string, x = 0, y = 0): BoardItem => ({ id, kind: 'card', x, y, w: 100, h: 50, text: '', color: 'amber' });

test('presets: a mind map is a centre with four branches; an argument map has labelled arrows', () => {
  const mind = presetBoard('mind', words, ids());
  assert.equal(mind.items.length, 5);
  assert.equal(mind.edges.length, 4);
  assert.ok(mind.edges.every(edge => edge.from === mind.items[0].id));
  assert.equal(mind.items[2].text, 'فرع 2');
  const argument = presetBoard('argument', words, ids());
  assert.deepEqual(argument.edges.map(edge => edge.label), ['يؤيد', 'يعترض']);
  assert.ok(argument.edges.every(edge => edge.to === argument.items[0].id));
  assert.deepEqual(presetBoard('blank', words, ids()), { items: [], edges: [] });
});

test('validation keeps good boards and refuses broken ones', () => {
  const good = { id: 'b1', title: ' لوح ', preset: 'mind', items: [item('a'), { ...item('b'), target: 'quran:hafs:2:153', extra: 1 }], edges: [{ id: 'e1', from: 'a', to: 'b', label: 'x' }], expectedRevision: 0 };
  const valid = validateBoardInput(good);
  assert.equal(valid.title, 'لوح');
  assert.equal('extra' in valid.items[1], false);
  for (const broken of [
    { ...good, id: '../x' },
    { ...good, items: [item('a'), item('a')] },
    { ...good, edges: [{ id: 'e1', from: 'a', to: 'missing', label: '' }] },
    { ...good, edges: [{ id: 'e1', from: 'a', to: 'a', label: '' }] },
    { ...good, items: [{ ...item('a'), target: 'javascript:alert(1)' }], edges: [] },
    { ...good, items: [{ ...item('a'), x: Number.NaN }], edges: [] },
    { ...good, preset: 'other' },
  ]) assert.throws(() => validateBoardInput(broken), /invalid-board/u);
});

test('removing an item removes its arrows; arrows stop at box edges', () => {
  const board = { items: [item('a'), item('b', 300)], edges: [{ id: 'e', from: 'a', to: 'b', label: '' }] };
  assert.deepEqual(removeBoardItems(board, new Set(['b'])), { items: [item('a')], edges: [] });
  assert.deepEqual(edgeEndpoints(item('a'), item('b', 300)), { x1: 100, y1: 25, x2: 300, y2: 25 });
});

test('the store saves with revisions, refuses stale saves and keeps deleted boards recoverable', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-boards-'));
  try {
    const store = new BoardStore(folder);
    const input = { id: 'b1', title: 'Board', preset: 'blank', items: [item('a')], edges: [], expectedRevision: 0 };
    const first = store.save(input, new Date('2026-11-05T10:00:00Z'));
    assert.equal(first.revision, 1);
    assert.throws(() => store.save(input), /board-conflict/u);
    const second = store.save({ ...input, title: 'Renamed', expectedRevision: 1 }, new Date('2026-11-05T11:00:00Z'));
    assert.equal(second.createdAt, '2026-11-05T10:00:00.000Z');
    assert.equal(store.get('b1')?.title, 'Renamed');
    fs.writeFileSync(path.join(folder, 'broken.json'), '{not json');
    assert.deepEqual(store.list().map(board => board.id), ['b1']);
    store.remove('b1');
    assert.equal(store.get('b1'), null);
    assert.equal(fs.readdirSync(path.join(folder, 'deleted')).length, 1);
    assert.throws(() => store.get('../../x'), /invalid-board/u);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('a new box goes to a free spot instead of covering one', () => {
  assert.deepEqual(freeSpot([], { x: 10, y: 10 }, { w: 100, h: 50 }), { x: 10, y: 10 });
  const spot = freeSpot([item('a', 0, 0)], { x: 0, y: 0 }, { w: 100, h: 50 });
  assert.ok(spot.y >= 66 || spot.x >= 116 || spot.x <= -116 || spot.y <= -66, JSON.stringify(spot));
});
