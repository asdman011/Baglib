/**
 * ADR-012: unified saving of BagLib additions into library files. Pure logic shared by the main process (saving,
 * export) and the renderer (settings, export dialog); the PDF writing itself is `assets/pdf-editor/baglib_marks.py`.
 */
import { parseShapeMark, textStyleOf } from './pdf-markup';

export const SAVE_MODES = ['after-change', 'interval', 'manual'] as const;
export type SaveMode = typeof SAVE_MODES[number];
export interface SavePolicy { mode: SaveMode; intervalMinutes: number }
export const DEFAULT_SAVE_POLICY: SavePolicy = { mode: 'after-change', intervalMinutes: 2 };
/** After-change mode waits this long after the last completed action, so a burst of actions is one write. */
export const AFTER_CHANGE_QUIET_MS = 1500;
export const BACKUP_RETENTION_MS = 24 * 60 * 60 * 1000;

export function validateSavePolicy(input: unknown): SavePolicy {
  const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const mode = SAVE_MODES.find(entry => entry === value.mode) ?? DEFAULT_SAVE_POLICY.mode;
  const minutes = Number(value.intervalMinutes);
  return { mode, intervalMinutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= 120 ? minutes : DEFAULT_SAVE_POLICY.intervalMinutes };
}

/** What a material's file state is, as the reader shows it. */
export interface MaterialSaveStatus {
  supported: boolean;            // a PDF file of a library book
  writable: boolean;             // the PDF engine (pikepdf) is available
  pending: boolean;              // BagLib additions differ from what was last written into the file
  lastSavedAt: string | null;
  incident: 'interrupted' | 'corrupt' | 'external-change' | null;
  backup: { path: string; expiresAt: string | null } | null;
}

export const ADDITION_KINDS = ['highlight', 'underline', 'strike', 'rect', 'oval', 'arrow', 'text', 'area', 'pin', 'note', 'question', 'stamp', 'measure'] as const;
export type AdditionKind = typeof ADDITION_KINDS[number];
interface Box { x: number; y: number; width: number; height: number }
export interface Reply { text: string; created: string | null; modified: string | null }
export interface Addition {
  id: string; kind: AdditionKind; page: number; color?: string; colorId?: string;
  rects?: Box[]; box?: Box; from?: { x: number; y: number }; to?: { x: number; y: number };
  text?: string; quote?: string; rtl?: boolean; created: string | null; modified: string | null;
  stampId?: string; language?: 'ar' | 'en'; measurement?: import('./pdf-study-tools').Measurement;
  replies: Reply[]; resolved: string | null;
}
export interface BookmarkAddition { id: string; page: number; title: string }
export interface AdditionsPayload { items: Addition[]; bookmarks: BookmarkAddition[] }

export const COLOR_HEX: Record<string, string> = { amber: '#f59e0b', emerald: '#10b981', rose: '#f43f5e', sky: '#0ea5e9', violet: '#8b5cf6' };

/** A knowledge row of the material, as read from the database (trashed rows are never passed). */
export interface MarkRow {
  id: string; type: string; location: string; createdAt: string | null; updatedAt: string | null;
  color: string | null; quote: string | null; note: string | null; question: string | null; label: string | null;
}
export interface CommentRow { knowledgeId: string; parentId: string | null; content: string; createdAt: string | null; updatedAt: string | null; resolvedAt: string | null }

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/u;
const pageOf = (location: string): number | null => {
  if (/^\d+$/u.test(location)) return Number(location);
  try { const page = Number((JSON.parse(location) as { page?: unknown }).page); return Number.isInteger(page) && page > 0 ? page : null; } catch { return null; }
};
const rectsOf = (location: string): Box[] => {
  try {
    const rects = (JSON.parse(location) as { rects?: unknown }).rects;
    return Array.isArray(rects) ? rects.filter((rect): rect is Box => !!rect && typeof rect === 'object' && ['x', 'y', 'width', 'height'].every(key => Number.isFinite((rect as Record<string, unknown>)[key]))) : [];
  } catch { return []; }
};

/**
 * The additions BagLib writes into the PDF, from its own records: marks with a page, their comment threads as replies,
 * questions and page notes, and bookmarks. Notes without a page (study notes about the book) are not page additions.
 */
export function collectAdditions(rows: MarkRow[], comments: CommentRow[]): AdditionsPayload {
  const threads = new Map<string, CommentRow[]>();
  for (const comment of comments) threads.set(comment.knowledgeId, [...(threads.get(comment.knowledgeId) ?? []), comment]);
  const items: Addition[] = [], bookmarks: BookmarkAddition[] = [];
  for (const row of [...rows].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id))) {
    const page = pageOf(row.location);
    if (!page) continue;
    if (row.type === 'bookmark') { bookmarks.push({ id: row.id, page, title: row.label?.trim() || String(page) }); continue; }
    const thread = (threads.get(row.id) ?? []).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
    const tops = thread.filter(comment => !comment.parentId);
    const resolved = tops.length && tops.every(comment => comment.resolvedAt) ? tops.map(comment => comment.resolvedAt!).sort().at(-1)! : null;
    const common = { id: row.id, page, created: row.createdAt, modified: row.updatedAt ?? row.createdAt, replies: thread.map(comment => ({ text: comment.content, created: comment.createdAt, modified: comment.updatedAt ?? comment.createdAt })), resolved };
    if (row.type === 'highlight') {
      const rects = rectsOf(row.location);
      if (!rects.length) continue;
      const colorId = row.color && COLOR_HEX[row.color] ? row.color : 'amber';
      items.push({ ...common, kind: textStyleOf(row.location), rects, colorId, color: COLOR_HEX[colorId], ...(row.quote ? { quote: row.quote } : {}), ...(row.note ? { text: row.note } : {}) });
      continue;
    }
    const shape = parseShapeMark(row.location);
    if (shape) {
      const text = row.note ?? '';
      items.push({ ...common, kind: shape.shape, ...(shape.shape === 'stamp' ? { stampId: shape.stampId, language: shape.language } : {}), ...(shape.measurement ? { measurement: shape.measurement } : {}), box: shape.box, colorId: shape.color, color: COLOR_HEX[shape.color] ?? COLOR_HEX.amber, ...(shape.from && shape.to ? { from: shape.from, to: shape.to } : {}), ...(text ? { text, rtl: RTL.test(text) } : {}) });
      continue;
    }
    if (row.type === 'question') { items.push({ ...common, kind: 'question', text: row.question ?? row.note ?? '' }); continue; }
    if (row.type === 'note' || row.type === 'quote') items.push({ ...common, kind: 'note', text: row.note ?? row.quote ?? '' });
  }
  return { items, bookmarks };
}

/** Stable text of a payload: its digest tells whether the file already holds exactly these additions. */
export const additionsKey = (payload: AdditionsPayload) => JSON.stringify(payload);

export const EXPORT_CATEGORIES = ['textMarks', 'shapes', 'textBoxes', 'comments', 'replies', 'questions', 'bookmarks', 'pageNotes', 'stamps'] as const;
export type ExportCategory = typeof EXPORT_CATEGORIES[number];
const CATEGORY_OF: Record<AdditionKind, ExportCategory> = {
  highlight: 'textMarks', underline: 'textMarks', strike: 'textMarks', rect: 'shapes', oval: 'shapes', arrow: 'shapes', area: 'shapes',
  stamp: 'stamps', measure: 'shapes', text: 'textBoxes', pin: 'comments', note: 'pageNotes', question: 'questions',
};
export const categoryOf = (kind: AdditionKind) => CATEGORY_OF[kind];
export interface ExportOptions { categories: ExportCategory[]; pages?: { from: number; to: number } | null; colors?: string[] | null; kinds?: AdditionKind[] | null }

export function validateExportOptions(input: unknown): ExportOptions {
  const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const categories = Array.isArray(value.categories) ? EXPORT_CATEGORIES.filter(category => (value.categories as unknown[]).includes(category)) : [];
  const raw = value.pages as { from?: unknown; to?: unknown } | null | undefined;
  const from = Number(raw?.from), to = Number(raw?.to);
  const pages = raw && Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from ? { from, to } : null;
  const colors = Array.isArray(value.colors) ? value.colors.filter((color): color is string => typeof color === 'string' && color in COLOR_HEX) : null;
  const kinds = Array.isArray(value.kinds) ? ADDITION_KINDS.filter(kind => (value.kinds as unknown[]).includes(kind)) : null;
  return { categories, pages, colors: colors?.length ? colors : null, kinds: kinds?.length ? kinds : null };
}

/**
 * Only what the user chose. Everything else is left out of the payload, so the writer — which first removes all
 * BagLib-owned annotations — never puts it in the exported file. Replies are dropped (with their resolved state)
 * unless "replies" is chosen.
 */
export function filterForExport(payload: AdditionsPayload, options: ExportOptions): AdditionsPayload {
  const chosen = new Set(options.categories);
  const inPages = (page: number) => !options.pages || (page >= options.pages.from && page <= options.pages.to);
  const items = payload.items.filter(item => chosen.has(categoryOf(item.kind)) && inPages(item.page)
    && (!options.colors || !item.colorId || options.colors.includes(item.colorId))
    && (!options.kinds || options.kinds.includes(item.kind)))
    .map(item => chosen.has('replies') ? item : { ...item, replies: [], resolved: null });
  return { items, bookmarks: chosen.has('bookmarks') ? payload.bookmarks.filter(bookmark => inPages(bookmark.page)) : [] };
}
