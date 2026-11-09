/**
 * PDF study markup (Waves 8.3, 9.1 and 9.4). Every mark is a knowledge item of the book, so it lives in BagLib's
 * database and the PDF file is never touched; the page position goes in the item's `location` JSON, which already
 * held `{ page, rects, text, color }` for highlights. No schema change:
 * - text marks (`highlight` items): `style` is `highlight` (default), `underline` or `strike`;
 * - shapes and pins (`note` items): `shape` is `rect`, `oval`, `arrow`, `text`, `area` or `pin`, with a box or two
 *   points in page percentages (0–100, from the top-left corner of the page), and the note text as their content.
 */
export type MarkupTool = 'select' | 'highlight' | 'underline' | 'strike' | 'rect' | 'oval' | 'arrow' | 'text' | 'area' | 'comment';
export type TextStyle = 'highlight' | 'underline' | 'strike';
export type ShapeKind = 'rect' | 'oval' | 'arrow' | 'text' | 'area' | 'pin';
export const TEXT_TOOLS: readonly MarkupTool[] = ['highlight', 'underline', 'strike'];
export const SHAPE_TOOLS: readonly MarkupTool[] = ['rect', 'oval', 'arrow', 'text', 'area', 'comment'];
export const MARKUP_TOOLS: readonly MarkupTool[] = ['select', ...TEXT_TOOLS, ...SHAPE_TOOLS];

export interface Box { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }
export interface ShapeMark { page: number; shape: ShapeKind; color: string; box: Box; from?: Point; to?: Point }

export const isTextTool = (tool: MarkupTool): tool is TextStyle => (TEXT_TOOLS as readonly string[]).includes(tool);
export const isShapeTool = (tool: MarkupTool) => (SHAPE_TOOLS as readonly string[]).includes(tool);
export const shapeForTool = (tool: MarkupTool): ShapeKind | null => (tool === 'comment' ? 'pin' : (['rect', 'oval', 'arrow', 'text', 'area'] as const).find(kind => kind === tool) ?? null);

const COLORS = new Set(['amber', 'emerald', 'rose', 'sky', 'violet']);
const percent = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value * 100) / 100)) : null;

function readPoint(value: unknown): Point | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y } = value as Record<string, unknown>;
  const px = percent(x), py = percent(y);
  return px === null || py === null ? null : { x: px, y: py };
}

/** A shape or pin from an item's location, or null for any other location (a page number, text rects …). */
export function parseShapeMark(location: string): ShapeMark | null {
  if (!location.startsWith('{')) return null;
  try {
    const value = JSON.parse(location) as Record<string, unknown>;
    const shape = (['rect', 'oval', 'arrow', 'text', 'area', 'pin'] as const).find(kind => kind === value.shape);
    const page = Number(value.page);
    if (!shape || !Number.isInteger(page) || page < 1) return null;
    const raw = (value.box ?? {}) as Record<string, unknown>;
    const x = percent(raw.x), y = percent(raw.y), width = percent(raw.width), height = percent(raw.height);
    if (x === null || y === null || width === null || height === null) return null;
    const color = typeof value.color === 'string' && COLORS.has(value.color) ? value.color : 'amber';
    const mark: ShapeMark = { page, shape, color, box: { x, y, width, height } };
    if (shape === 'arrow') {
      const from = readPoint(value.from), to = readPoint(value.to);
      if (!from || !to) return null;
      mark.from = from; mark.to = to;
    }
    return mark;
  } catch { return null; }
}

/** The text style of a highlight item (`highlight` when none is stored). */
export function textStyleOf(location: string): TextStyle {
  if (!location.startsWith('{')) return 'highlight';
  try {
    const style = (JSON.parse(location) as { style?: unknown }).style;
    return style === 'underline' || style === 'strike' ? style : 'highlight';
  } catch { return 'highlight'; }
}

/** Smallest box a drag must make, in page percent, so a click is not saved as an empty rectangle. */
export const MIN_SHAPE = 1.5;

/**
 * The mark a drag (or click, for a pin or text box) makes on a page. Points are page percentages. Returns null
 * when the drag is too small for a box-shaped mark.
 */
export function shapeFromDrag(tool: MarkupTool, page: number, start: Point, end: Point, color: string): ShapeMark | null {
  const shape = shapeForTool(tool);
  if (!shape) return null;
  const clamp = (point: Point): Point => ({ x: percent(point.x)!, y: percent(point.y)! });
  const a = clamp(start), b = clamp(end);
  const tint = COLORS.has(color) ? color : 'amber';
  if (shape === 'pin') return { page, shape, color: tint, box: { x: a.x, y: a.y, width: 0, height: 0 } };
  if (shape === 'arrow') {
    if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_SHAPE) return null;
    return { page, shape, color: tint, from: a, to: b, box: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) } };
  }
  let box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  // A click with the text tool makes a box of a usable size at that point.
  if (shape === 'text' && (box.width < MIN_SHAPE || box.height < MIN_SHAPE)) box = { x: a.x, y: a.y, width: Math.min(30, 100 - a.x), height: Math.min(6, 100 - a.y) };
  if (box.width < MIN_SHAPE || box.height < MIN_SHAPE) return null;
  return { page, shape, color: tint, box };
}

export const shapeLocation = (mark: ShapeMark) => JSON.stringify(mark);

/** Kinds shown in the annotations list, for filtering. */
export type MarkKind = TextStyle | ShapeKind | 'note' | 'question' | 'quote' | 'bookmark' | 'review';
export function markKind(item: { knowledgeType?: string; type?: string; location: string }): MarkKind {
  const type = item.knowledgeType ?? item.type ?? 'note';
  if (type === 'highlight') return textStyleOf(item.location);
  const shape = parseShapeMark(item.location);
  if (shape) return shape.shape;
  if (type === 'question' || type === 'quote' || type === 'bookmark') return type;
  return 'note';
}

/** The page an item belongs to, from a page number or any location JSON with `page`. */
export function markPage(location: string): number | null {
  if (/^\d+$/u.test(location)) return Number(location);
  if (!location.startsWith('{')) return null;
  try { const page = Number((JSON.parse(location) as { page?: unknown }).page); return Number.isInteger(page) && page > 0 ? page : null; } catch { return null; }
}

/**
 * One row of the annotations list (Wave 9.2): study marks from BagLib's database and review comments bound to the
 * PDF file, side by side and labelled by layer.
 */
export interface ListedMark {
  id: string;
  layer: 'study' | 'review';
  kind: MarkKind;
  page: number | null;
  chapter?: string | null;
  cfi?: string | null;
  color?: string;
  text: string;
  createdAt: string;
  /** Open or resolved, for comment pins (from their threads) and review comments. */
  status?: 'open' | 'resolved';
}
export interface MarkFilter {
  layer?: 'all' | 'study' | 'review';
  kind?: MarkKind | 'all';
  color?: string;
  since?: 'all' | 'today' | 'week';
  status?: 'all' | 'open' | 'resolved';
  query?: string;
  sort?: 'page' | 'chapter' | 'newest';
}

/** Filters and sorts the list (Wave 9.3). `normalize` is the app's Arabic search normalisation. */
export function filterMarks(marks: ListedMark[], filter: MarkFilter, normalize: (text: string) => string, now = new Date()): ListedMark[] {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const since = filter.since === 'today' ? day : filter.since === 'week' ? day - 6 * 86_400_000 : 0;
  const query = normalize(filter.query ?? '').trim();
  const kept = marks.filter(mark => (!filter.layer || filter.layer === 'all' || mark.layer === filter.layer)
    && (!filter.kind || filter.kind === 'all' || mark.kind === filter.kind)
    && (!filter.color || mark.color === filter.color)
    && (!since || Date.parse(mark.createdAt) >= since)
    && (!filter.status || filter.status === 'all' || mark.status === filter.status)
    && (!query || query.split(/\s+/u).every(term => normalize(mark.text).includes(term) || (mark.chapter && normalize(mark.chapter).includes(term)))));
  return kept.sort(filter.sort === 'newest'
    ? (a, b) => b.createdAt.localeCompare(a.createdAt)
    : (a, b) => {
        if (filter.sort === 'chapter' && a.chapter && b.chapter && a.chapter !== b.chapter) {
          return a.chapter.localeCompare(b.chapter, undefined, { numeric: true });
        }
        return (a.page ?? Infinity) - (b.page ?? Infinity) || a.createdAt.localeCompare(b.createdAt);
      });
}
