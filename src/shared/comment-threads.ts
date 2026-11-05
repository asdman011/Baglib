import { validStudyTarget } from './study-notes';

/** Where a root comment sits inside its knowledge item (ADR-010). NULL anchor means the whole item. */
export type CommentAnchor =
  | { kind: 'page'; page: number; rect?: [number, number, number, number] }
  | { kind: 'paragraph'; anchor: string }
  | { kind: 'ref'; target: string };

export interface CommentEntry { id: string; parentId: string | null; content: string; createdAt: string; updatedAt: string; edited: boolean }
export interface CommentThread extends CommentEntry { knowledgeId: string; resolvedAt: string | null; anchor: CommentAnchor | null; replies: CommentEntry[] }
export interface AddCommentInput { knowledgeId: string; text: string; parentId?: string; anchor?: CommentAnchor }

export const MAX_COMMENT_LENGTH = 100000;

export function validateCommentAnchor(value: unknown): CommentAnchor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-request');
  const anchor = value as Record<string, unknown>;
  if (anchor.kind === 'page') {
    if (Object.keys(anchor).some(key => !['kind', 'page', 'rect'].includes(key))) throw new Error('invalid-request');
    if (!Number.isSafeInteger(anchor.page) || Number(anchor.page) < 1 || Number(anchor.page) > 100000) throw new Error('invalid-request');
    if (anchor.rect !== undefined) {
      const rect = anchor.rect;
      // Page-relative rectangle: x, y, width, height between 0 and 1.
      if (!Array.isArray(rect) || rect.length !== 4 || rect.some(part => typeof part !== 'number' || !Number.isFinite(part) || part < 0 || part > 1)) throw new Error('invalid-request');
      return { kind: 'page', page: Number(anchor.page), rect: rect as [number, number, number, number] };
    }
    return { kind: 'page', page: Number(anchor.page) };
  }
  if (anchor.kind === 'paragraph') {
    if (Object.keys(anchor).length !== 2 || typeof anchor.anchor !== 'string' || !/^\^[A-Za-z0-9-]{1,64}$/u.test(anchor.anchor)) throw new Error('invalid-request');
    return { kind: 'paragraph', anchor: anchor.anchor };
  }
  if (anchor.kind === 'ref') {
    if (Object.keys(anchor).length !== 2 || typeof anchor.target !== 'string' || !validStudyTarget(anchor.target)) throw new Error('invalid-request');
    return { kind: 'ref', target: anchor.target };
  }
  throw new Error('invalid-request');
}

export function parseCommentAnchor(json: unknown): CommentAnchor | null {
  if (typeof json !== 'string' || !json) return null;
  try { return validateCommentAnchor(JSON.parse(json)); } catch { return null; }
}

export interface CommentRow { id: string; knowledge_id: string; parent_comment_id: string | null; content: string; created_at: string | null; updated_at: string | null; resolved_at?: string | null; anchor_json?: string | null }

/**
 * Groups flat rows into threads. Replies hang under their root even when nested deeper;
 * a reply whose root is gone becomes its own thread so nothing is hidden.
 */
export function buildCommentThreads(rows: CommentRow[]): CommentThread[] {
  const byId = new Map(rows.map(row => [row.id, row]));
  const rootOf = (row: CommentRow): CommentRow => {
    let current = row;
    const seen = new Set<string>();
    while (current.parent_comment_id && byId.has(current.parent_comment_id) && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.parent_comment_id)!;
    }
    return current;
  };
  const entry = (row: CommentRow): CommentEntry => ({ id: row.id, parentId: row.parent_comment_id, content: row.content, createdAt: row.created_at || '', updatedAt: row.updated_at || row.created_at || '', edited: !!row.updated_at && !!row.created_at && row.updated_at !== row.created_at });
  const threads = new Map<string, CommentThread>();
  const ordered = [...rows].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id));
  for (const row of ordered) {
    const root = rootOf(row);
    if (root.id === row.id) threads.set(row.id, { ...entry(row), knowledgeId: row.knowledge_id, resolvedAt: row.resolved_at ?? null, anchor: parseCommentAnchor(row.anchor_json), replies: threads.get(row.id)?.replies ?? [] });
  }
  for (const row of ordered) {
    const root = rootOf(row);
    if (root.id !== row.id) threads.get(root.id)?.replies.push(entry(row));
  }
  return [...threads.values()];
}

export type CommentFilter = 'open' | 'resolved' | 'all';
export function filterCommentThreads(threads: CommentThread[], filter: CommentFilter): CommentThread[] {
  return filter === 'all' ? threads : threads.filter(thread => (filter === 'open') === !thread.resolvedAt);
}
