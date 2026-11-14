import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteTableColumn,
  deleteTableRow,
  displayWidth,
  emptyMarkdownTable,
  formatMarkdownTable,
  insertTableColumn,
  insertTableRow,
  parseMarkdownTable,
  tableAt,
} from '../../src/shared/markdown-table';

const sample = '| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |';

test('parses a table with and without the outer pipes', () => {
  const expected = {
    header: ['name', 'age'],
    align: ['none', 'none'],
    rows: [['Ahmad', '30']],
  };
  assert.deepEqual(parseMarkdownTable('name | age\n--- | ---\nAhmad | 30'), expected);
  assert.deepEqual(parseMarkdownTable('| name | age |\n| --- | --- |\n| Ahmad | 30 |'), expected);
  assert.equal(parseMarkdownTable('| name | age |'), null, 'a header alone is not a table');
  assert.equal(parseMarkdownTable('just a thought\nover two lines'), null);
});

test('reads every alignment from the delimiter row', () => {
  const table = parseMarkdownTable('| a | b | c | d |\n| :--- | :---: | ---: | --- |\n| 1 | 2 | 3 | 4 |');
  assert.deepEqual(table?.align, ['left', 'center', 'right', 'none']);
  assert.deepEqual(parseMarkdownTable('| a |\n| ----- |\n| 1 |')?.align, ['none']);
  assert.equal(parseMarkdownTable('| a | b |\n| -- | --- |'), null, 'a delimiter needs three dashes');
});

test('keeps an escaped pipe as cell text through parse and format', () => {
  const table = parseMarkdownTable('| expr | meaning |\n| --- | --- |\n| a \\| b | either |');
  assert.ok(table);
  assert.equal(table.rows[0][0], 'a \\| b');
  assert.equal(table.rows[0][1], 'either');
  const formatted = formatMarkdownTable(table);
  assert.ok(formatted.includes('a \\| b'));
  assert.deepEqual(parseMarkdownTable(formatted), table);
});

test('pads ragged rows and the delimiter to the widest row', () => {
  const table = parseMarkdownTable('| a | b | c |\n| --- | --- |\n| 1 |\n| 1 | 2 | 3 | 4 |');
  assert.deepEqual(table, {
    header: ['a', 'b', 'c', ''],
    align: ['none', 'none', 'none', 'none'],
    rows: [['1', '', '', ''], ['1', '2', '3', '4']],
  });
});

test('formats with the alignment row and padded cells', () => {
  const table = parseMarkdownTable('| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |')!;
  assert.equal(formatMarkdownTable(table), '| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |');
});

test('measures display width without counting Arabic tashkeel', () => {
  assert.equal(displayWidth('بِسْمِ'), 3);
  assert.equal(displayWidth('e\u0301'), 1);
  assert.equal(displayWidth('abc'), 3);
  const formatted = formatMarkdownTable({ header: ['بِسْمِ', 'x'], align: ['none', 'none'], rows: [['name', 'y']] });
  assert.equal(formatted, '| بِسْمِ  | x |\n| ---- | --- |\n| name | y |', 'the Arabic cell pads to the 4-wide column');
});

test('finds the table under the cursor with exact offsets', () => {
  const note = 'Thoughts\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nMore';
  const start = note.indexOf('| a');
  const end = note.indexOf('| 1 | 2 |') + '| 1 | 2 |'.length;
  const found = tableAt(note, note.indexOf('1 | 2') + 2);
  assert.ok(found);
  assert.equal(found.start, start);
  assert.equal(found.end, end);
  assert.deepEqual(found.table, { header: ['a', 'b'], align: ['none', 'none'], rows: [['1', '2']] });
  assert.equal(tableAt(note, end)?.start, start, 'the end of the last line still counts');
  assert.equal(tableAt(note, note.indexOf('Thoughts')), null);
  assert.equal(tableAt(note, note.indexOf('More')), null);
  assert.equal(tableAt(note, note.length), null);
});

test('a table inside a fenced code block is not editable', () => {
  const fenced = '```\n| a | b |\n| --- | --- |\n| 1 | 2 |\n```';
  assert.equal(tableAt(fenced, fenced.indexOf('1 | 2')), null);
  assert.equal(tableAt(fenced, fenced.indexOf('| a')), null);
});

test('inserts and deletes rows without mutating the table', () => {
  const table = parseMarkdownTable(sample)!;
  const middle = insertTableRow(table, 1);
  assert.deepEqual(middle.rows, [['1', '2'], ['', ''], ['3', '4']]);
  assert.deepEqual(table.rows, [['1', '2'], ['3', '4']], 'the original table is untouched');
  assert.deepEqual(insertTableRow(table, 99).rows, [['1', '2'], ['3', '4'], ['', '']], 'the index clamps to the end');
  assert.deepEqual(insertTableRow(table, -4).rows, [['', ''], ['1', '2'], ['3', '4']], 'the index clamps to the start');
  assert.deepEqual(deleteTableRow(middle, 1), table);
  assert.deepEqual(deleteTableRow(table, 99).rows, [['1', '2']], 'the index clamps to the last row');
  assert.deepEqual(deleteTableRow(parseMarkdownTable('| a |\n| --- |\n| 1 |')!, 0).rows, []);
});

test('inserts and deletes columns, keeping at least one', () => {
  const table = parseMarkdownTable(sample)!;
  const wide = insertTableColumn(table, 1);
  assert.deepEqual(wide.header, ['a', '', 'b']);
  assert.deepEqual(wide.align, ['none', 'none', 'none']);
  assert.deepEqual(wide.rows, [['1', '', '2'], ['3', '', '4']]);
  assert.deepEqual(deleteTableColumn(wide, 1), table);
  assert.deepEqual(insertTableColumn(table, 99).header, ['a', 'b', ''], 'the index clamps to the end');
  assert.deepEqual(deleteTableColumn(table, 99).header, ['a'], 'the index clamps to the last column');
  const single = emptyMarkdownTable(1, 1);
  assert.equal(deleteTableColumn(single, 0), single, 'the last column is kept');
});

test('an empty table formats to a table that parses back', () => {
  const table = emptyMarkdownTable(3, 2);
  const text = formatMarkdownTable(table);
  assert.equal(text.split('\n').length, 4);
  assert.deepEqual(parseMarkdownTable(text), table);
  assert.equal(emptyMarkdownTable(0, -1).header.length, 1, 'at least one column');
});

test('formatting a parsed table and parsing it again is stable', () => {
  const source = '| Name | Notes |\n| :--- | ---: |\n| بِسْمِ | a \\| b |\n| long text | |';
  const table = parseMarkdownTable(source);
  assert.ok(table);
  const again = parseMarkdownTable(formatMarkdownTable(table));
  assert.deepEqual(again, table);
  assert.deepEqual(parseMarkdownTable(formatMarkdownTable(again!)), table);
});
