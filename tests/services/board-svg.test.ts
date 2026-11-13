import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_COLORS, type BoardEdge, type BoardItem } from '../../src/shared/boards';
import { BOARD_SVG_LIGHT, boardToSvg } from '../../src/shared/board-svg';

const item = (id: string, x = 0, y = 0, text = id, extra: Partial<BoardItem> = {}): BoardItem =>
  ({ id, kind: 'card', x, y, w: 100, h: 50, text, color: 'amber', ...extra });

const edge = (id: string, from: string, to: string, label = ''): BoardEdge => ({ id, from, to, label });

const count = (svg: string, pattern: RegExp): number => (svg.match(pattern) ?? []).length;

test('the canvas is the bounding box of the items plus padding on every side', () => {
  const board = { items: [item('a'), item('b', 200, 100)], edges: [] };
  const drawn = boardToSvg(board);
  assert.equal(drawn.width, 364);
  assert.equal(drawn.height, 214);
  assert.ok(drawn.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="364" height="214" viewBox="0 0 364 214">'));
  assert.ok(drawn.svg.includes('<rect x="32" y="32" width="100" height="50"'));
  assert.ok(drawn.svg.includes('<rect x="232" y="132" width="100" height="50"'));
  const tight = boardToSvg(board, BOARD_SVG_LIGHT, { padding: 10 });
  assert.equal(tight.width, 320);
  assert.equal(tight.height, 170);
  assert.ok(tight.svg.includes('<rect x="10" y="10" width="100" height="50"'));
});

test('an empty board is a single background pixel', () => {
  const drawn = boardToSvg({ items: [], edges: [] });
  assert.equal(drawn.width, 1);
  assert.equal(drawn.height, 1);
  assert.ok(drawn.svg.includes('width="1" height="1" viewBox="0 0 1 1"'));
  assert.equal(count(drawn.svg, /<rect/gu), 1);
  assert.equal(count(drawn.svg, /<line/gu), 0);
  assert.ok(!drawn.svg.includes('<defs'));
  assert.ok(drawn.svg.includes(`fill="${BOARD_SVG_LIGHT.background}"`));
});

test('a selection keeps only its items and the arrows between them', () => {
  const board = { items: [item('a'), item('b', 150), item('c', 300)], edges: [edge('e1', 'a', 'b', 'one'), edge('e2', 'b', 'c', 'two')] };
  const one = boardToSvg(board, BOARD_SVG_LIGHT, { selection: ['a', 'b'] });
  assert.ok(one.svg.includes('>a</tspan>'));
  assert.ok(one.svg.includes('>b</tspan>'));
  assert.ok(!one.svg.includes('>c</tspan>'));
  assert.equal(count(one.svg, /<line /gu), 1);
  assert.ok(one.svg.includes('>one</text>'));
  assert.ok(!one.svg.includes('>two</text>'));

  const onlyB = boardToSvg(board, BOARD_SVG_LIGHT, { selection: new Set(['b']) });
  assert.equal(count(onlyB.svg, /<line /gu), 0);
  assert.equal(count(onlyB.svg, /marker-end/gu), 0);
  assert.ok(!onlyB.svg.includes('>a</tspan>'));

  const asArray = boardToSvg(board, BOARD_SVG_LIGHT, { selection: ['b', 'a'] });
  assert.equal(asArray.svg, one.svg);
});

test('arrows carry an arrowhead marker and their label at the midpoint', () => {
  const board = { items: [item('a'), item('b', 300)], edges: [edge('e', 'a', 'b', 'supports')] };
  const { svg } = boardToSvg(board);
  assert.ok(svg.includes('<marker id="board-arrow"'));
  assert.ok(svg.includes('marker-end="url(#board-arrow)"'));
  assert.ok(svg.includes('<line x1="132" y1="57" x2="332" y2="57"'));
  assert.ok(svg.includes('<text x="232" y="57"'));
  assert.ok(svg.includes('>supports</text>'));
  const unlabelled = boardToSvg({ items: [item('a'), item('b', 300)], edges: [edge('e', 'a', 'b')] });
  assert.ok(!unlabelled.svg.includes('>supports</text>'));
});

test('text and attributes are escaped, with no raw markup left', () => {
  const board = { items: [item('a', 0, 0, `<b>&"'`)], edges: [] };
  const { svg } = boardToSvg(board);
  assert.ok(svg.includes('&lt;b&gt;&amp;&quot;&apos;'));
  assert.ok(!svg.includes('<b>'));
  assert.equal(count(svg, /<b>/gu), 0);
  const labelled = boardToSvg({ items: [item('a'), item('b', 300)], edges: [edge('e', 'a', 'b', '<x>&"')] });
  assert.ok(labelled.svg.includes('&lt;x&gt;&amp;&quot;'));
});

test('Arabic text is right-aligned and marked RTL; Latin text is not', () => {
  const arabic = boardToSvg({ items: [item('a', 0, 0, 'الفكرة الأولى', { w: 200 })], edges: [] });
  assert.ok(arabic.svg.includes('direction="rtl"'));
  assert.ok(arabic.svg.includes('text-anchor="end"'));
  assert.ok(arabic.svg.includes('<text x="224"'));
  assert.ok(arabic.svg.includes('>الفكرة الأولى</tspan>'));
  const latin = boardToSvg({ items: [item('a', 0, 0, 'Idea')], edges: [] });
  assert.ok(latin.svg.includes('text-anchor="start"'));
  assert.ok(!latin.svg.includes('direction='));
  assert.ok(latin.svg.includes('<text x="40"'));
});

test('long text wraps into several tspans and is cut with an ellipsis', () => {
  const text = 'word '.repeat(40).trim();
  const { svg } = boardToSvg({ items: [item('a', 0, 0, text, { w: 200, h: 80 })], edges: [] });
  const spans = svg.match(/<tspan[^>]*>[^<]*<\/tspan>/gu) ?? [];
  assert.equal(spans.length, 2); // 80px tall: baselines at 30 and 53.4; a third (76.8) would spill past the bottom
  assert.ok(spans.every(span => span.includes('dy="1.3em"')));
  assert.ok(spans[1].includes('…'));
  assert.ok(!svg.includes(text));
  const short = boardToSvg({ items: [item('a', 0, 0, 'Two\nlines', { h: 80 })], edges: [] });
  assert.equal(count(short.svg, /<tspan/gu), 2);
  assert.ok(short.svg.includes('>Two</tspan>'));
  assert.ok(short.svg.includes('>lines</tspan>'));
});

test('the output never contains a script or an external object', () => {
  const board = { items: [item('a', 0, 0, '<script>alert(1)</script>'), item('b', 300, 0, 'safe')], edges: [edge('e', 'a', 'b', '<script>')] };
  const { svg } = boardToSvg(board);
  assert.ok(!svg.includes('<script'));
  assert.ok(!svg.toLowerCase().includes('foreignobject'));
  assert.ok(!svg.includes('href'));
  assert.ok(!svg.includes('@import'));
});

test('the light theme covers every board colour with a darker stroke', () => {
  for (const colour of BOARD_COLORS) {
    assert.match(BOARD_SVG_LIGHT.fill[colour], /^#[0-9a-f]{6}$/iu);
    assert.match(BOARD_SVG_LIGHT.stroke[colour], /^#[0-9a-f]{6}$/iu);
    assert.notEqual(BOARD_SVG_LIGHT.fill[colour], BOARD_SVG_LIGHT.stroke[colour]);
  }
  assert.equal(Object.keys(BOARD_SVG_LIGHT.fill).length, BOARD_COLORS.length);
  assert.equal(Object.keys(BOARD_SVG_LIGHT.stroke).length, BOARD_COLORS.length);
  assert.ok(BOARD_SVG_LIGHT.fontFamily.includes('Noto Naskh Arabic'));
  const { svg } = boardToSvg({ items: [item('a')], edges: [] });
  assert.ok(svg.includes(`fill="${BOARD_SVG_LIGHT.fill.amber}"`));
  assert.ok(svg.includes('font-family="&quot;Noto Naskh Arabic&quot;, &quot;Segoe UI&quot;, sans-serif"'));
});

test('the same board always gives the same string and is never mutated', () => {
  const board = { items: [item('a', 0, 0, 'mix العربية and Latin'), item('b', 260, 40, 'b'), item('c', -120, 200, 'c')], edges: [edge('e1', 'a', 'b', 'x'), edge('e2', 'c', 'a', 'y')] };
  const before = JSON.stringify(board);
  const first = boardToSvg(board);
  const second = boardToSvg(board);
  assert.equal(first.svg, second.svg);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(board), before);
  const selected = boardToSvg(board, BOARD_SVG_LIGHT, { selection: new Set(['a', 'c']) });
  assert.equal(selected.svg, boardToSvg(board, BOARD_SVG_LIGHT, { selection: ['a', 'c'] }).svg);
});

test('every text line stays inside its box: first baseline below the top inset, last one above the bottom', () => {
  for (const h of [40, 60, 80, 100, 200]) {
    const { svg } = boardToSvg({ items: [item('a', 0, 0, 'x\n'.repeat(20).trim(), { h })], edges: [] }, undefined, { padding: 0 });
    const y = Number(/<text x="[^"]+" y="([^"]+)"/u.exec(svg)?.[1]);
    const lines = (svg.match(/<tspan/gu) ?? []).length;
    const first = y + 18 * 1.3, last = y + 18 * 1.3 * lines;
    assert.ok(first >= 18, `h=${h}: first baseline ${first} leaves room for the glyphs`);
    assert.ok(last <= h - 8 + 1e-9, `h=${h}: last baseline ${last} inside the box`);
  }
});

test('an Arabic edge label is drawn right-to-left', () => {
  const { svg } = boardToSvg({ items: [item('a', 0, 0, 'A'), item('b', 300, 0, 'B')], edges: [{ id: 'e', from: 'a', to: 'b', label: 'يؤيد' }] });
  assert.match(svg, /direction="rtl">يؤيد<\/text>/u);
});
