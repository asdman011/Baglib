/**
 * Baglib — revision questions from a book's highlights and comments (KEY-398).
 *
 * The AI only writes questions and answers. Each question must point at one of the annotations it
 * was given (A1, A2…); the quote and its location shown on the card always come from the database,
 * never from the AI. Suggestions are not saved anywhere until the user accepts them (ADR-013).
 */

export type BookQuestionKind = 'qa' | 'choice';
export const BOOK_QUESTION_KINDS: readonly BookQuestionKind[] = ['qa', 'choice'];

/** One highlight or comment offered to the AI, labelled A1, A2… */
export interface BookQuestionSource {
  label: string;
  annotationId: string;
  quote: string;
  note: string;
  /** A page number, when the annotation is in a paged book (EPUB locations are not shown). */
  page: number | null;
}

export interface BookQuestionSuggestion {
  annotationId: string;
  kind: BookQuestionKind;
  question: string;
  answer: string;
  /** Multiple choice only. */
  options?: string[];
  correctIndex?: number;
  /** From the database (the annotation), shown verbatim with its location. */
  quote: string;
  page: number | null;
}

/** The most annotations sent in one request, and the most questions kept from one answer. */
export const MAX_QUESTION_SOURCES = 20;
export const MAX_QUESTIONS = 30;
const MAX_TEXT = 1200;

const invalid = (): never => {
  throw new Error('invalid-request');
};

export function bookQuestionsPrompt(language: 'ar' | 'en', kinds: readonly BookQuestionKind[]): string {
  const lang = language === 'ar' ? 'Arabic' : 'English';
  const choice = kinds.includes('choice')
    ? ' For "choice" questions give 3 to 5 short options with exactly one correct, and its zero-based index in "correct".'
    : '';
  return [
    `You write revision questions for a reader, in ${lang}, from the passages they highlighted and the comments they wrote in a book.`,
    'Each question must be answerable from one annotation alone, and its answer must be supported by that annotation. Do not add outside facts.',
    `Allowed kinds: ${kinds.map(k => `"${k}"`).join(', ')}. "qa" is a question with a short answer.${choice}`,
    'Write at most two questions per annotation and skip annotations too short to ask about.',
    'Reply with JSON only: {"questions":[{"source":"A1","kind":"qa","question":"…","answer":"…"},{"source":"A2","kind":"choice","question":"…","answer":"…","options":["…","…","…"],"correct":1}]}',
  ].join('\n');
}

export function bookQuestionsUserPrompt(title: string, sources: readonly BookQuestionSource[]): string {
  return JSON.stringify({ book: title, annotations: sources.map(s => ({ id: s.label, passage: s.quote, comment: s.note || undefined })) });
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() && value.length <= MAX_TEXT ? value.trim() : null);

/** Checks the AI's answer. Questions that are malformed or point at no given annotation are dropped. */
export function parseBookQuestions(raw: string, sources: readonly BookQuestionSource[], kinds: readonly BookQuestionKind[]): BookQuestionSuggestion[] {
  let parsed: unknown;
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/u, '').replace(/```$/u, '');
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('invalid-output');
  }
  const list = (parsed as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) throw new Error('invalid-output');
  const byLabel = new Map(sources.map(s => [s.label, s]));
  const out: BookQuestionSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (out.length >= MAX_QUESTIONS) break;
    const q = (item ?? {}) as Record<string, unknown>;
    const source = typeof q.source === 'string' ? byLabel.get(q.source.trim()) : undefined;
    const kind = q.kind === 'choice' ? 'choice' : q.kind === 'qa' ? 'qa' : null;
    const question = text(q.question);
    const answer = text(q.answer);
    if (!source || !kind || !kinds.includes(kind) || !question || !answer) continue;
    const key = `${source.annotationId}|${question}`;
    if (seen.has(key)) continue;
    if (kind === 'choice') {
      const options = Array.isArray(q.options) ? q.options.map(text) : [];
      const correct = q.correct;
      if (options.length < 3 || options.length > 5 || options.some(o => !o) || new Set(options).size !== options.length) continue;
      if (!Number.isSafeInteger(correct) || (correct as number) < 0 || (correct as number) >= options.length) continue;
      seen.add(key);
      out.push({ annotationId: source.annotationId, kind, question, answer, options: options as string[], correctIndex: correct as number, quote: source.quote, page: source.page });
      continue;
    }
    seen.add(key);
    out.push({ annotationId: source.annotationId, kind, question, answer, quote: source.quote, page: source.page });
  }
  return out;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export function validateGenerateQuestions(input: unknown): { workId: string; language: 'ar' | 'en'; allowRemote: boolean; kinds: BookQuestionKind[] } {
  const v = (input ?? {}) as Record<string, unknown>;
  if (Object.keys(v).some(k => !['workId', 'language', 'allowRemote', 'kinds'].includes(k))) invalid();
  if (typeof v.workId !== 'string' || !SAFE_ID.test(v.workId)) invalid();
  const kinds = Array.isArray(v.kinds) ? [...new Set(v.kinds)] : ['qa'];
  if (!kinds.length || !kinds.every(k => (BOOK_QUESTION_KINDS as readonly unknown[]).includes(k))) invalid();
  return { workId: v.workId as string, language: v.language === 'ar' ? 'ar' : 'en', allowRemote: v.allowRemote === true, kinds: kinds as BookQuestionKind[] };
}

export interface AcceptedQuestion {
  annotationId: string;
  kind: BookQuestionKind;
  question: string;
  answer: string;
  options?: string[];
  correctIndex?: number;
}

/** The accepted questions as sent by the renderer; the quote is re-read from the database. */
export function validateAcceptQuestions(input: unknown): { workId: string; deckId: string | null; language: 'ar' | 'en'; questions: AcceptedQuestion[] } {
  const v = (input ?? {}) as Record<string, unknown>;
  if (Object.keys(v).some(k => !['workId', 'deckId', 'language', 'questions'].includes(k))) invalid();
  if (typeof v.workId !== 'string' || !SAFE_ID.test(v.workId)) invalid();
  if (v.deckId !== undefined && v.deckId !== null && (typeof v.deckId !== 'string' || !SAFE_ID.test(v.deckId))) invalid();
  if (!Array.isArray(v.questions) || !v.questions.length || v.questions.length > MAX_QUESTIONS) invalid();
  const questions = (v.questions as unknown[]).map(item => {
    const q = (item ?? {}) as Record<string, unknown>;
    if (Object.keys(q).some(k => !['annotationId', 'kind', 'question', 'answer', 'options', 'correctIndex', 'quote', 'page'].includes(k))) invalid();
    if (typeof q.annotationId !== 'string' || !SAFE_ID.test(q.annotationId)) invalid();
    const kind = q.kind === 'choice' ? 'choice' : q.kind === 'qa' ? 'qa' : invalid();
    const question = text(q.question) ?? invalid();
    const answer = text(q.answer) ?? invalid();
    if (kind === 'qa') return { annotationId: q.annotationId as string, kind, question, answer } as AcceptedQuestion;
    const options = Array.isArray(q.options) ? q.options.map(text) : [];
    if (options.length < 2 || options.length > 12 || options.some(o => !o)) invalid();
    if (!Number.isSafeInteger(q.correctIndex) || (q.correctIndex as number) < 0 || (q.correctIndex as number) >= options.length) invalid();
    return { annotationId: q.annotationId as string, kind, question, answer, options: options as string[], correctIndex: q.correctIndex as number } as AcceptedQuestion;
  });
  return { workId: v.workId as string, deckId: (v.deckId as string | null | undefined) ?? null, language: v.language === 'ar' ? 'ar' : 'en', questions };
}
