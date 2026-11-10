import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPoetryRows, poetryCopyText, poetryRhymeLetter, poetryRowLineClass, poetryRowText, poetryRowsText, POETRY_STACK_BREAKPOINT_PX } from '../../src/renderer/components/poetry/poetry-layout';
import { isPoetryLongPress, POETRY_LINE_ACTIONS, POETRY_LONG_PRESS_MS, poetryLineActionForKey, runPoetryLineAction, type PoetryLineActionHandlers, type PoetryLineActionId } from '../../src/renderer/components/poetry/poetry-line-actions';

const verses = ['أَلا هُبِّي بِصَحنِكِ فَاصبَحِينا', 'وَلا تُبقي خُمورَ الأَندَرينا', 'مُشَعشَعَةً كَأَنَّ الحُصَّ فيها', 'إِذا ما الماءُ خالَطَها سَخينا'];

test('classical poems pair lines into two-hemistich rows', () => {
  const rows = buildPoetryRows(verses, true);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.kind), ['hemistichs', 'hemistichs']);
  assert.equal(rows[0].sadr, verses[0]);
  assert.equal(rows[0].ajuz, verses[1]);
  assert.deepEqual([rows[1].sourceFrom, rows[1].sourceTo], [2, 3]);
});

test('an odd trailing line of a classical poem is a single centred row', () => {
  const rows = buildPoetryRows([...verses, 'بيت بلا عجز'], true);
  assert.equal(rows.length, 3);
  assert.equal(rows[2].kind, 'single');
  assert.equal(rows[2].ajuz, null);
  assert.deepEqual([rows[2].sourceFrom, rows[2].sourceTo], [4, 4]);
});

test('single-line forms keep one line per row', () => {
  const rows = buildPoetryRows(['سطر أول', 'سطر ثان', 'سطر ثالث'], false);
  assert.deepEqual(rows.map(row => [row.kind, row.sourceFrom, row.sourceTo]), [['single', 0, 0], ['single', 1, 1], ['single', 2, 2]]);
  assert.deepEqual(buildPoetryRows([], true), []);
});

test('row text keeps the traditional separator between hemistichs', () => {
  const [row] = buildPoetryRows(verses, true);
  assert.equal(poetryRowText(row), `${verses[0]} *** ${verses[1]}`);
  assert.equal(poetryRowText({ sadr: 'سطر', ajuz: null }), 'سطر');
  assert.equal(poetryRowsText(buildPoetryRows(verses, true)).split('\n').length, 2);
  const copied = poetryCopyText([row], { poet_name: 'عمرو', title: 'معلقة', meter: 'بحر الوافر' });
  assert.equal(copied, `${verses[0]} *** ${verses[1]}\nعمرو — معلقة — بحر الوافر`);
  assert.equal(poetryCopyText([row], { poet_name: 'عمرو', title: '', meter: null }).split('\n')[1], 'عمرو');
});

test('hemistich rows use two equal columns that stack below 640px, and single rows one column', () => {
  assert.equal(POETRY_STACK_BREAKPOINT_PX, 640);
  const two = poetryRowLineClass('hemistichs');
  assert.match(two, /grid-cols-2/);
  assert.match(two, /max-sm:grid-cols-1/);
  assert.match(two, /text-center/);
  assert.doesNotMatch(poetryRowLineClass('single'), /grid-cols-2/);
  assert.match(poetryRowLineClass('single'), /text-center/);
  assert.match(poetryRowLineClass('single', false), /text-start/);
});

test('the rhyme letter is the commonest last letter, ignoring tashkeel', () => {
  const rows = buildPoetryRows(verses, true);
  assert.equal(poetryRhymeLetter(rows), 'ا');
  assert.equal(poetryRhymeLetter(buildPoetryRows(['قفا نبكِ', 'من ذكرى حبيبٍ ومنزلِ', 'بسقط اللوى', 'بين الدخول فحومَلِ'], true)), 'ل');
  assert.equal(poetryRhymeLetter([]), null);
  assert.equal(poetryRhymeLetter(buildPoetryRows(['أ', 'ب', 'ت', 'ث', 'ج', 'ح'], false)), null);
});

test('the line actions list is one shared list with unique ids, keys and labels', () => {
  assert.deepEqual(POETRY_LINE_ACTIONS.map(action => action.id).sort(), ['copy', 'saveNote', 'select', 'share']);
  assert.equal(new Set(POETRY_LINE_ACTIONS.map(action => action.key)).size, POETRY_LINE_ACTIONS.length);
  assert.equal(new Set(POETRY_LINE_ACTIONS.map(action => action.labelKey)).size, POETRY_LINE_ACTIONS.length);
  assert.ok(POETRY_LINE_ACTIONS.every(action => action.labelKey.startsWith('bayan')));
});

test('keyboard keys map to line actions and ignore modified presses', () => {
  assert.equal(poetryLineActionForKey({ key: 'c' }), 'copy');
  assert.equal(poetryLineActionForKey({ key: 'C' }), 'copy');
  assert.equal(poetryLineActionForKey({ key: 's' }), 'share');
  assert.equal(poetryLineActionForKey({ key: 'n' }), 'saveNote');
  assert.equal(poetryLineActionForKey({ key: 'Enter' }), 'select');
  assert.equal(poetryLineActionForKey({ key: 'c', ctrlKey: true }), null);
  assert.equal(poetryLineActionForKey({ key: 'x' }), null);
});

test('running an action calls only its own handler with the row', () => {
  const called: string[] = [];
  const handlers = Object.fromEntries((['copy', 'share', 'saveNote', 'select'] as PoetryLineActionId[]).map(id => [id, (row: { index: number }) => called.push(`${id}:${row.index}`)])) as PoetryLineActionHandlers;
  runPoetryLineAction('copy', { index: 3, sadr: 'a', ajuz: 'b' }, handlers);
  runPoetryLineAction('saveNote', { index: 4, sadr: 'a', ajuz: null }, handlers);
  assert.deepEqual(called, ['copy:3', 'saveNote:4']);
});

test('a touch is a long-press only when held long enough without moving', () => {
  assert.equal(isPoetryLongPress({ heldMs: POETRY_LONG_PRESS_MS, movedPx: 0 }), true);
  assert.equal(isPoetryLongPress({ heldMs: POETRY_LONG_PRESS_MS - 1, movedPx: 0 }), false);
  assert.equal(isPoetryLongPress({ heldMs: 900, movedPx: 40 }), false);
});
