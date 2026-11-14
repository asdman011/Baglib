import { edgeEndpoints, type Board, type BoardColor, type BoardItem } from './boards';

/**
 * Colours used when a board is drawn as an image. The main process rasterises the SVG this module builds,
 * so everything here is a pure string: no DOM, no files and no font loading at runtime.
 */
export interface BoardSvgTheme {
  background: string;
  text: string;
  edge: string;
  fill: Record<BoardColor, string>;
  stroke: Record<BoardColor, string>;
  fontFamily: string;
}

/** Light theme: pale fills with a darker outline, dark text, and a font stack that also covers Arabic. */
export const BOARD_SVG_LIGHT: BoardSvgTheme = {
  background: '#ffffff',
  text: '#1f2937',
  edge: '#475569',
  fill: { amber: '#fef3c7', sky: '#e0f2fe', emerald: '#d1fae5', rose: '#ffe4e6', violet: '#ede9fe', slate: '#f1f5f9' },
  stroke: { amber: '#b45309', sky: '#0369a1', emerald: '#047857', rose: '#be123c', violet: '#6d28d9', slate: '#475569' },
  fontFamily: '"Noto Naskh Arabic", "Segoe UI", sans-serif',
};

const PADDING = 32;
const INNER = 8;
const TOP = 12;
const FONT_SIZE = 18;
const LINE_EM = 1.3;
const CHAR_WIDTH = 8;

const escapeXml = (value: string): string => value
  .replace(/&/gu, '&amp;')
  .replace(/</gu, '&lt;')
  .replace(/>/gu, '&gt;')
  .replace(/"/gu, '&quot;')
  .replace(/'/gu, '&apos;');

/** A coordinate as a short, stable string, so the same board always gives byte-identical output. */
const num = (value: number): string => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/** The empty board: a single background pixel, which every image format can still encode. */
const emptySvg = (theme: BoardSvgTheme): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><rect x="0" y="0" width="1" height="1" fill="${escapeXml(theme.background)}"/></svg>`;

/**
 * Breaks one logical line into pieces of at most `max` characters, preferring the last space in reach so
 * words stay whole. Arabic and emoji survive because the line is handled as code points, not UTF-16 units.
 */
function wrapLine(line: string, max: number): string[] {
  let rest = Array.from(line);
  if (rest.length <= max) return [line];
  const lines: string[] = [];
  while (rest.length > max) {
    let cut = max;
    for (let index = max; index > 0; index--) {
      if (rest[index] === ' ') { cut = index; break; }
    }
    lines.push(rest.slice(0, cut).join(''));
    rest = rest.slice(cut);
    while (rest[0] === ' ') rest = rest.slice(1);
  }
  lines.push(rest.join(''));
  return lines;
}

/** The text inside one box: wrapped, clipped to the box height and right-aligned when it contains Arabic. */
function itemText(item: BoardItem, x: number, y: number, theme: BoardSvgTheme): string {
  // First baseline one font-size below the 12px top inset; each further line steps 1.3em; the last baseline stays
  // INNER above the bottom edge. (The first draft put the baseline at y + 12, so glyphs stuck out of the box.)
  const lineHeight = FONT_SIZE * LINE_EM;
  const room = item.h - TOP - FONT_SIZE - INNER;
  const maxLines = room < 0 ? 0 : Math.floor(room / lineHeight) + 1;
  if (maxLines < 1) return '';
  const maxChars = Math.max(1, Math.floor((item.w - 16) / CHAR_WIDTH));
  const lines = item.text.split(/\r\n|\r|\n/u).flatMap(line => wrapLine(line, maxChars));
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines && visible.length) visible[visible.length - 1] += '…';
  const rtl = visible.some(line => /[\u0600-\u06FF]/u.test(line));
  const anchorX = rtl ? x + item.w - INNER : x + INNER;
  // Every tspan steps down 1.3em, so the element starts one line above the first baseline at y + 12 + font size.
  const top = y + TOP + FONT_SIZE - lineHeight;
  const spans = visible.map(line => `<tspan x="${num(anchorX)}" dy="1.3em">${escapeXml(line)}</tspan>`).join('');
  return `<text x="${num(anchorX)}" y="${num(top)}" fill="${escapeXml(theme.text)}" font-family="${escapeXml(theme.fontFamily)}" font-size="${FONT_SIZE}"${rtl ? ' direction="rtl" text-anchor="end"' : ' text-anchor="start"'}>${spans}</text>`;
}

/**
 * Draws a board as a standalone SVG string plus its integer pixel size. Only the items in `selection` are
 * drawn, when a selection is given, together with the arrows that join two drawn items; an empty result is
 * one background pixel.
 */
export function boardToSvg(
  board: Pick<Board, 'items' | 'edges'>,
  theme: BoardSvgTheme = BOARD_SVG_LIGHT,
  options: { padding?: number; selection?: Iterable<string>; edgePath?: (edge: Board['edges'][number], from: BoardItem, to: BoardItem) => { d: string; labelAt: { x: number; y: number } } } = {},
): { svg: string; width: number; height: number } {
  const padding = Math.max(0, Math.round(options.padding ?? PADDING));
  const selection = options.selection ? new Set(options.selection) : null;
  const items = board.items.filter(item => !selection || selection.has(item.id));
  if (!items.length) return { svg: emptySvg(theme), width: 1, height: 1 };

  const byId = new Map(items.map(item => [item.id, item]));
  const edges = board.edges.flatMap(edge => {
    const from = byId.get(edge.from), to = byId.get(edge.to);
    return from && to ? [{ edge, from, to }] : [];
  });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of items) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.w);
    maxY = Math.max(maxY, item.y + item.h);
  }
  const width = Math.max(1, Math.ceil(maxX - minX + padding * 2));
  const height = Math.max(1, Math.ceil(maxY - minY + padding * 2));
  const shiftX = padding - minX, shiftY = padding - minY;

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><marker id="board-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="${escapeXml(theme.edge)}"/></marker></defs>`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(theme.background)}"/>`,
  ];

  for (const { edge, from, to } of edges) {
    const ends = edgeEndpoints(from, to);
    const x1 = ends.x1 + shiftX, y1 = ends.y1 + shiftY, x2 = ends.x2 + shiftX, y2 = ends.y2 + shiftY;
    // Callback coordinates are already in export space, just like the default endpoints.
    const path = options.edgePath?.(edge, { ...from, x: from.x + shiftX, y: from.y + shiftY }, { ...to, x: to.x + shiftX, y: to.y + shiftY });
    if (path) parts.push(`<path d="${escapeXml(path.d)}" fill="none" stroke="${escapeXml(theme.edge)}" stroke-width="2" marker-end="url(#board-arrow)"/>`);
    else parts.push(`<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${escapeXml(theme.edge)}" stroke-width="2" marker-end="url(#board-arrow)"/>`);
    if (edge.label) {
      parts.push(`<text x="${num(path?.labelAt.x ?? (x1 + x2) / 2)}" y="${num(path?.labelAt.y ?? (y1 + y2) / 2)}" fill="${escapeXml(theme.text)}" font-family="${escapeXml(theme.fontFamily)}" font-size="12" text-anchor="middle"${path ? ' dominant-baseline="middle"' : ''}${/[؀-ۿ]/u.test(edge.label) ? ' direction="rtl"' : ''}>${escapeXml(edge.label)}</text>`);
    }
  }

  for (const item of items) {
    const x = item.x + shiftX, y = item.y + shiftY;
    const fill = theme.fill[item.color] ?? theme.fill.slate;
    const stroke = theme.stroke[item.color] ?? theme.stroke.slate;
    parts.push(`<rect x="${num(x)}" y="${num(y)}" width="${num(item.w)}" height="${num(item.h)}" rx="8" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="1.5"/>`);
    const text = itemText(item, x, y, theme);
    if (text) parts.push(text);
  }

  parts.push('</svg>');
  return { svg: parts.join(''), width, height };
}
