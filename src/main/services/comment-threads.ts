import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { withKnowledgeHistory } from './knowledge-history';
import { buildCommentThreads, MAX_COMMENT_LENGTH, validateCommentAnchor, type AddCommentInput, type CommentRow, type CommentThread } from '../../shared/comment-threads';

const validText = (text: unknown): string => {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_COMMENT_LENGTH) throw new Error('invalid-request');
  return text;
};

/** Comment threads on knowledge items (ADR-010). Every write is versioned with the item's history. */
export class CommentThreadService {
  constructor(private db: Database, private clock: () => Date = () => new Date()) {}

  list(knowledgeId: string): CommentThread[] {
    return buildCommentThreads(this.db.prepare('SELECT id,knowledge_id,parent_comment_id,content,created_at,updated_at,resolved_at,anchor_json FROM comment WHERE knowledge_id=?').all(knowledgeId) as CommentRow[]);
  }

  /** Open thread counts per item, for lists and badges. */
  openCounts(): Record<string, number> {
    const rows = this.db.prepare("SELECT c.knowledge_id AS id, COUNT(*) AS count FROM comment c JOIN knowledge k ON k.id=c.knowledge_id WHERE c.parent_comment_id IS NULL AND c.resolved_at IS NULL AND k.deleted_at IS NULL GROUP BY c.knowledge_id").all() as { id: string; count: number }[];
    return Object.fromEntries(rows.map(row => [row.id, row.count]));
  }

  /** Open and total threads per item, so a list can tell an empty item from a resolved one. */
  threadCounts(): Record<string, { open: number; total: number }> {
    const rows = this.db.prepare("SELECT c.knowledge_id AS id, SUM(CASE WHEN c.resolved_at IS NULL THEN 1 ELSE 0 END) AS open, COUNT(*) AS total FROM comment c JOIN knowledge k ON k.id=c.knowledge_id WHERE c.parent_comment_id IS NULL AND k.deleted_at IS NULL GROUP BY c.knowledge_id").all() as { id: string; open: number; total: number }[];
    return Object.fromEntries(rows.map(row => [row.id, { open: row.open, total: row.total }]));
  }

  add(input: AddCommentInput): string {
    const text = validText(input.text);
    if (!this.db.prepare('SELECT 1 FROM knowledge WHERE id=? AND deleted_at IS NULL').get(input.knowledgeId)) throw new Error('invalid-request');
    let parentId: string | null = null;
    if (input.parentId !== undefined) {
      const parent = this.db.prepare('SELECT id FROM comment WHERE id=? AND knowledge_id=?').get(input.parentId, input.knowledgeId) as { id: string } | undefined;
      if (!parent) throw new Error('invalid-request');
      parentId = parent.id;
    }
    // Anchors belong to the thread, so replies never carry one.
    const anchor = input.anchor === undefined ? null : parentId ? (() => { throw new Error('invalid-request'); })() : JSON.stringify(validateCommentAnchor(input.anchor));
    const id = randomUUID(), now = this.clock().toISOString();
    withKnowledgeHistory(this.db, [input.knowledgeId], parentId ? 'comment-reply' : 'comment', () => {
      this.db.prepare("INSERT INTO comment(id,knowledge_id,parent_comment_id,content,actor,created_at,updated_at,anchor_json) VALUES(?,?,?,?,'local',?,?,?)").run(id, input.knowledgeId, parentId, text, now, now, anchor);
      // A reply reopens a resolved thread, as in Figma and Acrobat.
      if (parentId) this.db.prepare('UPDATE comment SET resolved_at=NULL WHERE id=?').run(this.rootId(parentId));
    });
    return id;
  }

  edit(commentId: string, text: string): void {
    const value = validText(text);
    const row = this.row(commentId);
    withKnowledgeHistory(this.db, [row.knowledge_id], 'comment-edit', () => this.db.prepare('UPDATE comment SET content=?, updated_at=? WHERE id=?').run(value, this.clock().toISOString(), commentId));
  }

  setResolved(commentId: string, resolved: boolean): void {
    const root = this.rootId(commentId);
    const row = this.row(root);
    withKnowledgeHistory(this.db, [row.knowledge_id], resolved ? 'comment-resolve' : 'comment-reopen', () => this.db.prepare('UPDATE comment SET resolved_at=? WHERE id=?').run(resolved ? this.clock().toISOString() : null, root));
  }

  remove(commentId: string): void {
    const row = this.row(commentId);
    // parent_comment_id cascades, so removing a root removes its replies; history keeps the text until erased.
    withKnowledgeHistory(this.db, [row.knowledge_id], 'comment-remove', () => this.db.prepare('DELETE FROM comment WHERE id=?').run(commentId));
  }

  private row(commentId: string): CommentRow {
    const row = this.db.prepare('SELECT c.* FROM comment c JOIN knowledge k ON k.id=c.knowledge_id WHERE c.id=? AND k.deleted_at IS NULL').get(commentId) as CommentRow | undefined;
    if (!row) throw new Error('invalid-request');
    return row;
  }

  private rootId(commentId: string): string {
    let current = this.row(commentId);
    for (let depth = 0; current.parent_comment_id && depth < 1000; depth++) current = this.row(current.parent_comment_id);
    return current.id;
  }
}
