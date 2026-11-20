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
export interface MarkdownTableSpan {
  start: number;
  end: number;
  fromLine: number;
  toLine: number;
  table: MarkdownTable;
}

/** All pipe tables in `content` with their character offsets and 1-based line numbers; skips fenced code blocks. */
export function findMarkdownTables(content: string): MarkdownTableSpan[] {
  const lines = sourceLines(content);
  const tables: MarkdownTableSpan[] = [];
  for (let index = 0; index + 1 < lines.length; index++) {
    const line = lines[index];
    if (line.fenced || lines[index + 1].fenced || !startsTable(line.text, lines[index + 1].text)) continue;
    const last = tableEnd(lines, index);
    const start = line.start;
    const end = lines[last].end;
    const table = parseMarkdownTable(lines.slice(index, last + 1).map(item => item.text).join('\n'));
    if (table) {
      tables.push({ start, end, fromLine: index + 1, toLine: last + 1, table });
    }
    index = last;
  }
  return tables;
}

/** The table whose lines contain `offset`, with the offsets to replace; null outside tables and in code fences. */
export function tableAt(content: string, offset: number): { start: number; end: number; table: MarkdownTable } | null {
  if (offset < 0 || offset > content.length) return null;
  const hit = findMarkdownTables(content).find(item => offset >= item.start && offset <= item.end);
  return hit ? { start: hit.start, end: hit.end, table: hit.table } : null;
}

interface CellSpan {
  rawStart: number;
  rawEnd: number;
  start: number;
  end: number;
}

/** Character spans (relative to `line`) for each cell in a Markdown table row, respecting `\|` escapes and optional outer pipes. */
function splitRowSpans(line: string): CellSpan[] {
  const leadingSpaces = line.length - line.trimStart().length;
  const trimmed = line.trim();
  if (!trimmed) return [];
  const base = leadingSpaces;
  const rawSegments: { rawStart: number; rawEnd: number }[] = [];
  let segStart = 0;
  for (let index = 0; index < trimmed.length; index++) {
    const char = trimmed[index];
    if (char === '\\' && trimmed[index + 1] === '|') {
      index++;
      continue;
    }
    if (char === '|') {
      rawSegments.push({ rawStart: base + segStart, rawEnd: base + index });
      segStart = index + 1;
    }
  }
  rawSegments.push({ rawStart: base + segStart, rawEnd: base + trimmed.length });
  if (trimmed.startsWith('|')) rawSegments.shift();
  if (trimmed.endsWith('|') && !isEscaped(trimmed, trimmed.length - 1)) rawSegments.pop();

  return rawSegments.map(({ rawStart, rawEnd }) => {
    const raw = line.slice(rawStart, rawEnd);
    const leftTrim = raw.length - raw.trimStart().length;
    const rightTrim = raw.length - raw.trimEnd().length;
    if (leftTrim + rightTrim >= raw.length) {
      const caret = rawStart + (raw.startsWith(' ') ? 1 : 0);
      return { rawStart, rawEnd, start: caret, end: caret };
    }
    return {
      rawStart,
      rawEnd,
      start: rawStart + leftTrim,
      end: rawEnd - rightTrim,
    };
  });
}

function cellSpanAtLine(lineStart: number, lineText: string, col: number): { anchor: number; head: number } {
  const spans = splitRowSpans(lineText);
  if (!spans.length) return { anchor: lineStart, head: lineStart };
  const clampedCol = clamp(col, 0, spans.length - 1);
  const span = spans[clampedCol];
  return { anchor: lineStart + span.start, head: lineStart + span.end };
}

/** Returns the document selection range for cell `(row, col)` (`row = -1` for header, `0..rows.length-1` for body) in the table starting at `tableStart`. */
export function cellOffsetInTable(content: string, tableStart: number, row: number, col: number): { anchor: number; head: number } | null {
  const hit = findMarkdownTables(content).find(item => item.start === tableStart);
  if (!hit) return null;
  const lines = sourceLines(content);
  const targetLineIndex = (hit.fromLine - 1) + (row < 0 ? 0 : row + 2);
  const targetLine = lines[targetLineIndex];
  if (!targetLine) return null;
  return cellSpanAtLine(targetLine.start, targetLine.text, col);
}

/**
 * Moves the caret to the next (`direction = 1`) or previous (`direction = -1`) cell of the table at `offset`.
 * Pressing Tab on the last cell of the table appends a new empty row and places the caret in its first cell.
 * Returns `null` when `offset` is outside a table or when Shift+Tab is pressed on the very first header cell.
 */
export function moveTableCell(content: string, offset: number, direction: 1 | -1): { content: string; anchor: number; head: number } | null {
  if (offset < 0 || offset > content.length) return null;
  const hit = findMarkdownTables(content).find(item => offset >= item.start && offset <= item.end);
  if (!hit) return null;

  const lines = sourceLines(content);
  const firstLineIdx = hit.fromLine - 1;
  const lastLineIdx = hit.toLine - 1;
  let lineIdx = firstLineIdx;
  for (let i = firstLineIdx; i <= lastLineIdx; i++) {
    if (offset >= lines[i].start && offset <= lines[i].end) {
      lineIdx = i;
      break;
    }
  }

  const relLine = lineIdx - firstLineIdx;
  const cols = columnCount(hit.table);
  let row: number;
  let col: number;

  if (relLine === 0) {
    row = -1;
    const spans = splitRowSpans(lines[lineIdx].text);
    const localOffset = offset - lines[lineIdx].start;
    col = spans.findIndex(span => localOffset <= span.rawEnd);
    if (col < 0) col = Math.max(0, spans.length - 1);
  } else if (relLine === 1) {
    // Delimiter line: Tab goes to first body row (or appends one), Shift+Tab goes to last header cell.
    if (direction === 1) {
      row = -1;
      col = cols - 1;
    } else {
      const target = cellSpanAtLine(lines[firstLineIdx].start, lines[firstLineIdx].text, cols - 1);
      return { content, ...target };
    }
  } else {
    row = relLine - 2;
    const spans = splitRowSpans(lines[lineIdx].text);
    const localOffset = offset - lines[lineIdx].start;
    col = spans.findIndex(span => localOffset <= span.rawEnd);
    if (col < 0) col = Math.max(0, spans.length - 1);
  }

  if (direction === 1) {
    if (col + 1 < cols) {
      const target = cellOffsetInTable(content, hit.start, row, col + 1);
      return target ? { content, ...target } : null;
    }
    if (row + 1 < hit.table.rows.length) {
      const target = cellOffsetInTable(content, hit.start, row + 1, 0);
      return target ? { content, ...target } : null;
    }
    // Append a new empty row at the end of the table.
    const nextTable = insertTableRow(hit.table, hit.table.rows.length);
    const formatted = formatMarkdownTable(nextTable);
    const nextContent = content.slice(0, hit.start) + formatted + content.slice(hit.end);
    const target = cellOffsetInTable(nextContent, hit.start, nextTable.rows.length - 1, 0);
    return target ? { content: nextContent, ...target } : null;
  }

  // direction === -1
  if (col - 1 >= 0) {
    const target = cellOffsetInTable(content, hit.start, row, col - 1);
    return target ? { content, ...target } : null;
  }
  if (row > 0) {
    const target = cellOffsetInTable(content, hit.start, row - 1, cols - 1);
    return target ? { content, ...target } : null;
  }
  if (row === 0) {
    const target = cellOffsetInTable(content, hit.start, -1, cols - 1);
    return target ? { content, ...target } : null;
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
