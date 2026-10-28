import type { PdfResult } from './pdf-editor';
export interface PdfReviewReply { id: string; author: string; text: string; createdAt: string }
export interface PdfReview { id: string; sourceId: string; sourceHash: string; page: number; rect: number[]; kind: 'sticky' | 'callout' | 'ink'; author: string; text: string; status: 'open' | 'resolved' | 'accepted' | 'rejected'; replies: PdfReviewReply[]; strokes?: number[][][]; updatedAt: string }
export interface PdfAnswerOptions { mode: 'summary' | 'chapters' | 'takeaways' | 'arguments' | 'actions' | 'qa'; fromPage?: number; toPage?: number }
export function validatePdfAnswerOptions(input: unknown): PdfAnswerOptions {
  if (input === undefined) return { mode: 'summary' };
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid-request');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['mode', 'fromPage', 'toPage'].includes(key)) || !['summary', 'chapters', 'takeaways', 'arguments', 'actions', 'qa'].includes(String(value.mode))) throw new Error('invalid-request');
  for (const key of ['fromPage', 'toPage']) if (value[key] !== undefined && (typeof value[key] !== 'number' || !Number.isInteger(value[key]) || (value[key] as number) < 1 || (value[key] as number) > 10000)) throw new Error('invalid-request');
  if (value.fromPage !== undefined && value.toPage !== undefined && Number(value.toPage) < Number(value.fromPage)) throw new Error('invalid-request');
  return value as unknown as PdfAnswerOptions;
}
export interface PdfCitation { page: number; quote: string }
export interface PdfAnswer { answer: string; citations: PdfCitation[]; abstained: boolean; limited: boolean }
export interface PdfCollaborationAPI {
  reviews(sessionId: string): Promise<PdfResult<PdfReview[]>>;
  saveReview(sessionId: string, input: Omit<PdfReview, 'id' | 'sourceId' | 'sourceHash' | 'updatedAt' | 'replies'>): Promise<PdfResult<PdfReview>>;
  reply(sessionId: string, id: string, author: string, text: string, expectedUpdatedAt: string): Promise<PdfResult<PdfReview>>;
  reviewStatus(sessionId: string, id: string, status: PdfReview['status'], expectedUpdatedAt: string): Promise<PdfResult<PdfReview>>;
  exportReviews(sessionId: string, language: 'ar' | 'en'): Promise<PdfResult<{ saved: boolean }>>;
  ask(sessionId: string, question: string, language: 'ar' | 'en', allowRemote: boolean, password?: string, options?: PdfAnswerOptions): Promise<PdfResult<PdfAnswer>>;
}
