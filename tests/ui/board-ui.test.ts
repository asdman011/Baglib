import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardViewBends, alignmentForDirection, boardLayoutRoot, boardImageSvg, readBoardPreference, writeBoardPreference } from '../../src/renderer/components/notes/board-ui';
import type { Board, BoardItem } from '../../src/shared/boards';
import { translations } from '../../src/renderer/translations';

const item = (id: string, x = 0): BoardItem => ({ id, x, y: 0, w: 160, h: 100, text: id, color: 'sky', kind: 'card' });
const board: Board = { id: 'test', title: 'الصَّبر — Patience', preset: 'mind', revision: 1, createdAt: '', updatedAt: '', items: [item('a'), item('b', 320), item('c', 640)], edges: [{ id: 'ab', from: 'a', to: 'b', label: 'يؤيد & supports' }, { id: 'ab2', from: 'a', to: 'b', label: '' }, { id: 'bc', from: 'b', to: 'c', label: '' }] };

test('logical alignment maps start/end to physical edges in Arabic and English', () => {
  for (const mode of ['start', 'centre', 'end', 'top', 'middle', 'bottom'] as const) {
    assert.equal(alignmentForDirection(mode, 'ltr'), mode);
    assert.equal(alignmentForDirection(mode, 'rtl'), mode === 'start' ? 'end' : mode === 'end' ? 'start' : mode);
  }
});

test('tree root uses a valid selection then stable maximum degree', () => {
  assert.equal(boardLayoutRoot(board, ['missing', 'c']), 'c');
  assert.equal(boardLayoutRoot(board, []), 'b');
  assert.equal(boardLayoutRoot({ items: [], edges: [] }, []), '');
});

test('SVG image preserves escaped Arabic and Latin labels and selection scope', () => {
  const full = boardImageSvg(board);
  assert.ok(full.width > 640);
  assert.match(full.svg, /يؤيد &amp; supports/u);
  const selected = boardImageSvg(board, ['c']);
  assert.equal(selected.width, 224);
  assert.ok(!selected.svg.includes('<line'));
  assert.ok(!selected.svg.includes('supports'));
  assert.equal(boardImageSvg(board, []).width, 1);
});

test('curved image uses shared geometry and distinct parallel paths with repositioned labels', () => {
  const image = boardImageSvg(board, undefined, 'curved');
  const paths = [...image.svg.matchAll(/<path d="(M [^"]+)"/gu)].map(match => match[1]);
  assert.equal(paths.length, 3);
  assert.equal(new Set(paths).size, 3);
  assert.ok(paths.every(path => path.includes(' Q ')));
  assert.ok(!image.svg.includes('<line'));
  assert.match(image.svg, /يؤيد &amp; supports/u);
});

test('viewer preferences tolerate denied or corrupt storage and reject unsupported shapes', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let value = 'broken';
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } } });
    assert.equal(readBoardPreference('snap', true), true);
    writeBoardPreference('snap', false);
    assert.equal(readBoardPreference('snap', true), false);
    value = '"curved"';
    assert.equal(readBoardPreference('shape.test', 'straight'), 'curved');
    value = '"invalid"';
    assert.equal(readBoardPreference('shape.test', 'straight'), 'straight');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
    assert.doesNotThrow(() => writeBoardPreference('snap', false));
    assert.equal(readBoardPreference('snap', true), true);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('every board interaction string is available in Arabic and English without replacement characters', () => {
  for (const key of Object.keys(translations.en).filter(key => key.startsWith('boards'))) {
    const en = translations.en[key as keyof typeof translations.en];
    const ar = translations.ar[key as keyof typeof translations.ar];
    assert.ok(en && ar, key);
    assert.ok(!ar.includes('???'), key);
  }
});

test('odd parallel groups keep a zero-centred bend and a single arrow curves visibly', () => {
  const edges = [...board.edges, { id: 'ab3', from: 'a', to: 'b', label: '' }];
  const bends = boardViewBends(edges);
  assert.deepEqual([bends.get('ab'), bends.get('ab2'), bends.get('ab3')], [-36, 0, 36]);
  assert.equal(bends.get('bc'), 40);
});
