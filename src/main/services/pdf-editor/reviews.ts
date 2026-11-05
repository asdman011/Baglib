import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { withKnowledgeHistory } from '../knowledge-history';
import { SqliteAnnotationRepository } from '../../database/repositories/annotation.repository';
import type { PdfReview } from '../../../shared/types/pdf-collaboration';
import type { PdfSource } from './source';
const marker = 'baglib-pdf-review-v1';
const text = (value: unknown, limit: number) => { if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error('invalid-request'); return value; };
export class PdfReviews {
  private repository: SqliteAnnotationRepository;
  constructor(private db: Database) { this.repository = new SqliteAnnotationRepository(db); }
  list(source: PdfSource): PdfReview[] {
    if (!source.workId || !source.sourceId) throw new Error('invalid-source');
    return this.repository.getByBookId(source.workId).flatMap(row => {
      try {
        const anchor = JSON.parse(row.locationCfiOrPage);
        if (anchor.marker !== marker || anchor.sourceId !== source.sourceId) return [];
        return [{ ...anchor, id: row.id, text: row.noteContent || '', updatedAt: row.updatedAt } as PdfReview];
      } catch { return []; }
    });
  }
  private persist(source: PdfSource, review: PdfReview): PdfReview {
    return withKnowledgeHistory(this.db,[review.id],'review',()=>this.persistRaw(source,review));
  }
  private persistRaw(source: PdfSource, review: PdfReview): PdfReview {
    const { id, text: body, updatedAt: _updated, ...anchor } = review;
    const now = new Date(Math.max(Date.now(), Date.parse(_updated || '') + 1 || 0)).toISOString();
    this.repository.save({ id, bookId: source.workId!, type: review.kind === 'ink' ? 'ink' : 'note', locationCfiOrPage: JSON.stringify({ marker, ...anchor }), noteContent: body });
    this.db.prepare('UPDATE annotations SET updated_at=? WHERE id=?').run(now, id);
    return { ...review, updatedAt: now };
  }
  add(source: PdfSource, input: Omit<PdfReview, 'id' | 'sourceId' | 'sourceHash' | 'updatedAt' | 'replies'>): PdfReview {
    this.list(source);
    if (!input || !Number.isInteger(input.page) || input.page < 1 || input.page > 10000 || !['sticky', 'callout', 'ink'].includes(input.kind) || !['open', 'resolved', 'accepted', 'rejected'].includes(input.status) || !Array.isArray(input.rect) || input.rect.length !== 4 || input.rect.some(value => !Number.isFinite(value) || value < 0 || value > 10000) || input.rect[2] <= input.rect[0] || input.rect[3] <= input.rect[1]) throw new Error('invalid-request');
    const author = text(input.author, 200), body = text(input.text, 10000);
    const strokes = input.kind === 'ink' ? input.strokes : undefined;
    if (strokes && (strokes.length > 100 || strokes.some(stroke => !Array.isArray(stroke) || stroke.length > 2000 || stroke.some(point => !Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isFinite(value) || value < 0 || value > 1))))) throw new Error('invalid-request');
    return this.persist(source, { id: randomUUID(), sourceId: source.sourceId!, sourceHash: source.sha256, page: input.page, rect: input.rect, kind: input.kind, author, text: body, status: input.status, replies: [], strokes, updatedAt: '' });
  }
  change(source: PdfSource, id: string, expectedUpdatedAt: string, change: { status?: PdfReview['status']; author?: string; text?: string }): PdfReview {
    const review = this.list(source).find(item => item.id === id);
    if (!review || review.updatedAt !== expectedUpdatedAt || review.sourceHash !== source.sha256) throw new Error('source-changed');
    if (change.status) { if (!['open', 'resolved', 'accepted', 'rejected'].includes(change.status)) throw new Error('invalid-request'); review.status = change.status; }
    else {
      if (review.replies.length >= 200) throw new Error('invalid-request');
      review.replies.push({ id: randomUUID(), author: text(change.author, 200), text: text(change.text, 10000), createdAt: new Date().toISOString() });
    }
    return this.persist(source, review);
  }
}
