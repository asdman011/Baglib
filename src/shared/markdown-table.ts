/**
 * KEY-243: pipe tables in study notes. Notes are Markdown edited in CodeMirror, so the editor needs a
 * small, dependency-free table model: parse the table under the cursor, format it back with aligned
 * columns, and insert or delete rows and columns. Everything here is pure and works on plain strings.
 *
 * A cell may contain `\|` for a literal pipe; that escape is kept in the cell text so it survives a
 * parse/format round trip. Widths are measured with `displayWidth`, which ignores Arabic tashkeel.
 */

export type TableAlign = 'none' | 'left' | 'center' | 'right';

export interface MarkdownTable {
  header: string[];
  align: TableAlign[];
  rows: string[][];
}

/** Arabic combining marks (harakat, superscript alef, Quranic marks) and generic Latin combining marks. */
const COMBINING = /[\u0300-\u036f\u064b-\u065f\u0670\u06d6-\u06ed]/u;
const DELIMITER = /^(:?)(-{3,})(:?)$/u;

/** Width of text in character cells; combining marks add nothing, so tashkeel never shifts a column. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) if (!COMBINING.test(char)) width++;
  return width;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(Math.trunc(value) || 0, min), max);

/** True when the pipe at `index` is escaped by an odd number of backslashes. */
function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor--) backslashes++;
  return backslashes % 2 === 1;
}

/** Split one row line into trimmed cell texts. Outer pipes are optional; `\|` stays part of the cell. */
function splitRow(line: string): string[] {
  const text = line.trim();
  const cells: string[] = [];
  let cell = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '\\' && text[index + 1] === '|') {
      cell += '\\|';
      index++;
      continue;
    }
    if (char === '|') {
      cells.push(cell);
      cell = '';
      continue;
    }
    cell += char;
  }
  cells.push(cell);
  if (text.startsWith('|')) cells.shift();
  if (text.endsWith('|') && !isEscaped(text, text.length - 1)) cells.pop();
  return cells.map(value => value.trim());
}

/** True when a row line has a cell separator, so a lone line above `---` is not mistaken for a table. */
function hasSeparator(line: string): boolean {
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '\\') {
      index++;
      continue;
    }
    if (line[index] === '|') return true;
  }
  return false;
}

function alignmentOf(cell: string): TableAlign | null {
  const match = DELIMITER.exec(cell.trim());
  if (!match) return null;
  if (match[1] && match[3]) return 'center';
  if (match[1]) return 'left';
  if (match[3]) return 'right';
  return 'none';
}

function delimiterAlignments(line: string): TableAlign[] | null {
  const align: TableAlign[] = [];
  for (const cell of splitRow(line)) {
    const value = alignmentOf(cell);
    if (!value) return null;
    align.push(value);
  }
  return align.length ? align : null;
}

/** Header row plus delimiter row, i.e. the two lines that begin a table. */
function startsTable(header: string, delimiter: string): boolean {
  return !!header.trim() && !!delimiter.trim() && hasSeparator(header) && delimiterAlignments(delimiter) !== null;
}

function padCells(values: readonly string[], count: number): string[] {
  return Array.from({ length: count }, (_, index) => values[index] ?? '');
}

function padAlign(values: readonly TableAlign[], count: number): TableAlign[] {
  return Array.from({ length: count }, (_, index) => values[index] ?? 'none');
}

function columnCount(table: MarkdownTable): number {
  return Math.max(1, table.header.length, table.align.length, ...table.rows.map(row => row.length));
}

/** Parse a table from its own lines (no surrounding note text). Returns null when it is not a table. */
export function parseMarkdownTable(text: string): MarkdownTable | null {
  const lines = text.split(/\r?\n/u);
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines.length < 2) return null;
  if (lines.some(line => !line.trim())) return null;
  if (!hasSeparator(lines[0])) return null;
  const align = delimiterAlignments(lines[1]);
  if (!align) return null;
  const header = splitRow(lines[0]);
  const rows = lines.slice(2).map(splitRow);
  const columns = Math.max(header.length, align.length, ...rows.map(row => row.length));
  return {
    header: padCells(header, columns),
    align: padAlign(align, columns),
    rows: rows.map(row => padCells(row, columns)),
  };
}

/** A raw pipe would end the cell early, so escape it; an existing `\|` is already safe. */
function escapeCell(text: string): string {
  let output = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '\\' && text[index + 1] === '|') {
      output += '\\|';
      index++;
      continue;
    }
    output += char === '|' ? '\\|' : char;
  }
  return output;
}

function padCell(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)));
}

function delimiterCell(align: TableAlign, width: number): string {
  const dashes = '-'.repeat(Math.max(3, width));
  if (align === 'left') return `:${dashes}`;
  if (align === 'center') return `:${dashes}:`;
  if (align === 'right') return `${dashes}:`;
  return dashes;
}

/** One `| a | b |` line with every cell padded to its column width. */
function renderRow(cells: readonly string[], widths: readonly number[]): string {
  return `| ${cells.map((cell, index) => padCell(escapeCell(cell), widths[index])).join(' | ')} |`;
}

/** Render a table as aligned Markdown lines joined with `\n`, without a trailing newline. */
export function formatMarkdownTable(table: MarkdownTable): string {
  const columns = columnCount(table);
  const header = padCells(table.header, columns);
  const align = padAlign(table.align, columns);
  const rows = table.rows.map(row => padCells(row, columns));
  const widths = header.map((cell, index) => {
    let width = displayWidth(escapeCell(cell));
    for (const row of rows) width = Math.max(width, displayWidth(escapeCell(row[index])));
    return width;
  });
  return [
    renderRow(header, widths),
    `| ${align.map((value, index) => delimiterCell(value, widths[index])).join(' | ')} |`,
    ...rows.map(row => renderRow(row, widths)),
  ].join('\n');
}

interface SourceLine {
  text: string;
  start: number;
  end: number;
  fenced: boolean;
}

/** Note lines with their offsets; `fenced` marks the ``` fences and everything between them. */
function sourceLines(content: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  let fenced = false;
  for (;;) {
    const newline = content.indexOf('\n', start);
    const end = newline === -1 ? content.length : newline;
    const text = content.slice(start, end);
    const isFence = text.trim().startsWith('```');
    if (isFence) fenced = !fenced;
    lines.push({ text, start, end, fenced: fenced || isFence });
    if (newline === -1) return lines;
    start = newline + 1;
  }
}

/** Last line of the table that starts at `index`; a blank line, a fence or another table ends it. */
function tableEnd(lines: readonly SourceLine[], index: number): number {
  let last = index + 1;
  while (last + 1 < lines.length) {
    const next = lines[last + 1];
    if (next.fenced || !next.text.trim()) break;
    const after = last + 2 < lines.length ? lines[last + 2] : undefined;
    if (after && !after.fenced && startsTable(next.text, after.text)) break;
    last++;
  }
  return last;
}

/** The table whose lines contain `offset`, with the offsets to replace; null outside tables and in code fences. */
export function tableAt(content: string, offset: number): { start: number; end: number; table: MarkdownTable } | null {
  if (offset < 0 || offset > content.length) return null;
  const lines = sourceLines(content);
  for (let index = 0; index + 1 < lines.length; index++) {
    const line = lines[index];
    if (line.fenced || lines[index + 1].fenced || !startsTable(line.text, lines[index + 1].text)) continue;
    const last = tableEnd(lines, index);
    const start = line.start;
    const end = lines[last].end;
    if (offset >= start && offset <= end) {
      const table = parseMarkdownTable(lines.slice(index, last + 1).map(item => item.text).join('\n'));
      if (table) return { start, end, table };
    }
    index = last;
  }
  return null;
}

/** Insert an empty body row at `index` (clamped; the end appends). */
export function insertTableRow(table: MarkdownTable, index: number): MarkdownTable {
  const columns = columnCount(table);
  const rows = table.rows.map(row => padCells(row, columns));
  rows.splice(clamp(index, 0, rows.length), 0, Array.from({ length: columns }, () => ''));
  return { header: padCells(table.header, columns), align: padAlign(table.align, columns), rows };
}

/** Insert an empty column at `index` (clamped); its header is empty and its alignment `none`. */
export function insertTableColumn(table: MarkdownTable, index: number): MarkdownTable {
  const columns = columnCount(table);
  const at = clamp(index, 0, columns);
  const header = padCells(table.header, columns);
  header.splice(at, 0, '');
  const align = padAlign(table.align, columns);
  align.splice(at, 0, 'none');
  const rows = table.rows.map(row => {
    const cells = padCells(row, columns);
    cells.splice(at, 0, '');
    return cells;
  });
  return { header, align, rows };
}

/** Delete a body row (clamped). A table may end up with no body rows. */
export function deleteTableRow(table: MarkdownTable, index: number): MarkdownTable {
  if (!table.rows.length) return table;
  const at = clamp(index, 0, table.rows.length - 1);
  const rows = table.rows.map(row => [...row]);
  rows.splice(at, 1);
  return { header: [...table.header], align: [...table.align], rows };
}

/** Delete a column (clamped); the last remaining column is kept, since a table needs one. */
export function deleteTableColumn(table: MarkdownTable, index: number): MarkdownTable {
  const columns = columnCount(table);
  if (columns <= 1) return table;
  const at = clamp(index, 0, columns - 1);
  const header = padCells(table.header, columns);
  header.splice(at, 1);
  const align = padAlign(table.align, columns);
  align.splice(at, 1);
  const rows = table.rows.map(row => {
    const cells = padCells(row, columns);
    cells.splice(at, 1);
    return cells;
  });
  return { header, align, rows };
}

/** A fresh table of empty cells: `columns` (at least 1) and `rows` body rows, all unaligned. */
export function emptyMarkdownTable(columns: number, rows: number): MarkdownTable {
  const width = Math.max(1, Math.trunc(columns) || 0);
  const height = Math.max(0, Math.trunc(rows) || 0);
  return {
    header: Array.from({ length: width }, () => ''),
    align: Array.from({ length: width }, () => 'none' as TableAlign),
    rows: Array.from({ length: height }, () => Array.from({ length: width }, () => '')),
  };
}
