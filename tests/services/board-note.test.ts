import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetBoard, type BoardEdge, type BoardItem } from '../../src/shared/boards';
import { boardToNoteMarkdown } from '../../src/shared/board-note';
import { studyLinkText } from '../../src/shared/study-notes';

const words = { untitled: 'Untitled', connections: 'Connections' };
const ids = () => { let n = 0; return () => `id-${++n}`; };
const item = (id: string, x = 0, y = 0, text = '', extra: Partial<BoardItem> = {}): BoardItem => ({ id, kind: 'card', x, y, w: 100, h: 50, text, color: 'amber', ...extra });
const edge = (id: string, from: string, to: string, label = ''): BoardEdge => ({ id, from, to, label });
const board = (title: string, items: BoardItem[], edges: BoardEdge[]) => ({ title, items, edges });

test('the note starts with the trimmed title, or the untitled word when there is none', () => {
  assert.equal(boardToNoteMarkdown(board('  Fasting  ', [], []), words), '# Fasting\n');
  assert.equal(boardToNoteMarkdown(board('   ', [], []), words), '# Untitled\n');
});

test('a mind map becomes a centre with its four branches nested under it', () => {
  const preset = presetBoard('mind', { centre: 'Centre', branch: 'Branch', claim: 'Claim', reason: 'Reason', objection: 'Objection', supports: 'supports', opposes: 'opposes' }, ids());
  const out = boardToNoteMarkdown({ title: 'Map', ...preset }, words);
  assert.equal(out, ['# Map', '', '- Centre', '  - Branch 1', '  - Branch 2', '  - Branch 3', '  - Branch 4'].join('\n') + '\n');
  assert.equal(out.includes(words.connections), false);
});

test('branches follow board reading order: y first, then x', () => {
  const items = [
    item('root', 0, 0, 'Root'),
    item('low', 0, 200, 'Low'),
    item('high', 0, -200, 'High'),
    item('right', 300, 400, 'Right'),
    item('left', -300, 400, 'Left'),
  ];
  const edges = ['high', 'low', 'left', 'right'].map((id, index) => edge(`e${index}`, 'root', id));
  assert.equal(boardToNoteMarkdown(board('Order', items, edges), words), '# Order\n\n- Root\n  - High\n  - Low\n  - Left\n  - Right\n');
});

test('a cycle is safe and lists every box once', () => {
  const items = [item('a', 0, 0, 'A'), item('b', 0, 100, 'B'), item('c', 0, 200, 'C'), item('d', 0, 300, 'D')];
  const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'd'), edge('e4', 'd', 'a')];
  const out = boardToNoteMarkdown(board('Cycle', items, edges), words);
  assert.equal(out, '# Cycle\n\n- A\n  - B\n    - C\n  - D\n');
  for (const name of ['A', 'B', 'C', 'D']) assert.equal(out.split('\n').filter(line => line.trim() === `- ${name}`).length, 1, name);
});

test('boxes the first outline cannot reach start their own outlines', () => {
  const items = [
    item('p1', 0, 0, 'P1'), item('p2', 100, 0, 'P2'),
    item('solo', 200, 300, 'Solo'),
    item('q1', 0, 500, 'Q1'), item('q2', 100, 500, 'Q2'), item('q3', 200, 500, 'Q3'),
  ];
  const edges = [edge('e1', 'p1', 'p2'), edge('e2', 'q2', 'q1'), edge('e3', 'q2', 'q3')];
  assert.equal(boardToNoteMarkdown(board('Split', items, edges), words), ['# Split', '', '- Q2', '  - Q1', '  - Q3', '- P1', '  - P2', '- Solo'].join('\n') + '\n');
});

test('a box that points at a study target carries its note link', () => {
  const target = 'quran:hafs:2:153';
  const items = [
    item('a', 0, 0, 'Ayat', { target }),
    item('b', 0, 100, '', { target, label: 'Patience' }),
    item('c', 0, 200, ''),
    item('d', 0, 300, 'Name', { target: 'note:fasting' }),
  ];
  const out = boardToNoteMarkdown(board('Links', items, []), words);
  assert.equal(out, [
    '# Links', '',
    `- Ayat ${studyLinkText(target, 'Ayat')}`,
    `- ${studyLinkText(target, 'Patience')}`,
    '- —',
    `- Name ${studyLinkText('note:fasting', 'Name')}`,
  ].join('\n') + '\n');
});

test('labelled arrows are listed after the outline, in input order', () => {
  const items = [item('a', 0, 0, 'A claim'), item('b', 0, 100, 'A reason', { target: 'note:reason' }), item('c', 0, 200, 'An objection')];
  const edges = [edge('e1', 'c', 'a'), edge('e2', 'b', 'a', 'supports'), edge('e3', 'a', 'c', 'opposes')];
  const out = boardToNoteMarkdown(board('Argument', items, edges), words);
  assert.equal(out, [
    '# Argument', '',
    '- A claim',
    `  - A reason ${studyLinkText('note:reason', 'A reason')}`,
    '  - An objection', '',
    `## ${words.connections}`, '',
    '- A reason → supports → A claim',
    '- A claim → opposes → An objection',
  ].join('\n') + '\n');
});

test('a selection limits the outline and the arrows to the chosen boxes', () => {
  const items = [item('a', 0, 0, 'A'), item('b', 100, 0, 'B'), item('c', 200, 0, 'C')];
  const edges = [edge('e1', 'a', 'b', 'near'), edge('e2', 'b', 'c', 'far')];
  assert.equal(boardToNoteMarkdown(board('Part', items, edges), words, new Set(['a', 'b'])), [
    '# Part', '', '- A', '  - B', '', `## ${words.connections}`, '', '- A → near → B',
  ].join('\n') + '\n');
  assert.equal(boardToNoteMarkdown(board('Part', items, edges), words, ['c']), '# Part\n\n- C\n');
  assert.equal(boardToNoteMarkdown(board('Part', items, edges), words, new Set()), '# Part\n');
});

test('Arabic text keeps its letters and marks exactly', () => {
  const card = 'الصَّبْرُ ضِياءٌ';
  const second = 'الكتابُ المُقدَّس';
  const out = boardToNoteMarkdown(board('لوح الصبر', [item('a', 0, 0, card), item('b', 0, 100, second)], []), words);
  assert.equal(out, `# لوح الصبر\n\n- ${card}\n- ${second}\n`);
});

test('the note ends with exactly one newline and each box stays on one line', () => {
  const out = boardToNoteMarkdown(board('Two', [item('a', 0, 0, 'First\nsecond\n\nthird  ')], []), words);
  assert.equal(out, '# Two\n\n- First second third\n');
  for (const text of [out, boardToNoteMarkdown(board('Empty', [], []), words)]) {
    assert.ok(text.endsWith('\n'));
    assert.equal(text.endsWith('\n\n'), false);
    assert.equal(text.startsWith('\n'), false);
  }
});
