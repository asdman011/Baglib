import { parseBookTarget, validStudyTarget } from './study-notes';
export const QUESTION_KINDS = ['recall', 'choice', 'numeric', 'short', 'application', 'explain_back'] as const;
export type QuestionKind = typeof QUESTION_KINDS[number];
export const PRACTICE_RESULTS = ['correct', 'partial', 'incorrect', 'pending'] as const;
export type PracticeResult = typeof PRACTICE_RESULTS[number];
export const MISTAKE_CATEGORIES = ['definition', 'assumption', 'calculation', 'recall', 'reading', 'method', 'other'] as const;
export type MistakeCategory = typeof MISTAKE_CATEGORIES[number];
export type CheckMethod = 'auto' | 'self' | 'judgment';
export type QuestionPayload = {
    options: string[];
    correctIndex: number;
} | {
    answer: number;
    tolerance: number;
    unit: string;
} | {
    modelAnswer: string;
} | null;
export interface PracticeInput {
    knowledgeId: string;
    cardRevision: number | undefined;
    answerText: string;
    confidence: number;
    durationMs?: number;
    checkMethod?: CheckMethod;
    result?: PracticeResult;
    mistakeCategory?: MistakeCategory;
    context?: 'practice' | 'section_check' | 'challenge';
}
export interface JudgeAttemptInput {
    id: string;
    result: Exclude<PracticeResult, 'pending'>;
    mistakeCategory?: MistakeCategory;
}
export interface AttemptQuery {
    knowledgeId?: string;
    sourceRef?: string;
    offset?: number;
}
export interface PracticeAttempt {
    id: string;
    knowledgeId: string | null;
    cardRevision: number | null;
    questionKind: QuestionKind;
    answerText: string;
    result: PracticeResult;
    checkMethod: CheckMethod;
    mistakeCategory: MistakeCategory | null;
    confidence: number | null;
    durationMs: number | null;
    sourceRef: string | null;
    context: 'practice' | 'section_check' | 'challenge';
    createdAt: string;
    deleted: boolean;
    question: string | null;
}
export const invalid = (): never => { throw new Error('invalid-request'); };
export const boundedText = (v: unknown, max = 20000): v is string => typeof v === 'string' && v.length <= max;
export function validateSourceRef(v: unknown): string | null {
    if (v === undefined || v === null)
        return null;
    if (!boundedText(v, 4096) || !validStudyTarget(v))
        return invalid();
    if (v.startsWith('book:')) {
        const book = parseBookTarget(v);
        if (!book?.sourceId || (!book.page && !book.cfi))
            return invalid();
    }
    return v;
}
export function validateQuestion(kind: unknown = 'recall', payload: unknown = null): {
    questionKind: QuestionKind;
    payload: QuestionPayload;
} {
    if (!QUESTION_KINDS.includes(kind as QuestionKind))
        return invalid();
    const questionKind = kind as QuestionKind;
    if (questionKind === 'recall') {
        if (payload !== null && payload !== undefined)
            return invalid();
        return { questionKind, payload: null };
    }
    const p = payload as Record<string, unknown> | null;
    if (!p || typeof p !== 'object' || Array.isArray(p))
        return invalid();
    if (questionKind === 'choice') {
        if (!Array.isArray(p.options) || p.options.length < 2 || p.options.length > 12 || p.options.some(o => !boundedText(o, 2000) || !o.trim()) || !Number.isSafeInteger(p.correctIndex) || (p.correctIndex as number) < 0 || (p.correctIndex as number) >= p.options.length)
            return invalid();
        return { questionKind, payload: { options: p.options as string[], correctIndex: p.correctIndex as number } };
    }
    if (questionKind === 'numeric') {
        if (typeof p.answer !== 'number' || !Number.isFinite(p.answer) || Math.abs(p.answer) > 1e15 || typeof p.tolerance !== 'number' || !Number.isFinite(p.tolerance) || p.tolerance < 0 || p.tolerance > 1e15 || !boundedText(p.unit, 100))
            return invalid();
        return { questionKind, payload: { answer: p.answer, tolerance: p.tolerance, unit: p.unit } };
    }
    if (!boundedText(p.modelAnswer))
        return invalid();
    return { questionKind, payload: { modelAnswer: p.modelAnswer } };
}
export function numericAnswer(text: string): number | null {
    const value = text.trim().replace(/[٠-٩]/gu, c => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/gu, c => String(c.charCodeAt(0) - 0x6f0)).replace(/٫/gu, '.').replace(/−/gu, '-');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value))
        return null;
    const n = Number(value);
    return Number.isFinite(n) && Math.abs(n) <= 1e15 ? n : null;
}
export function checkAnswer(kind: QuestionKind, payload: QuestionPayload, answer: string): PracticeResult {
    if (kind === 'choice' && payload && 'options' in payload) {
        if (!/^\d{1,2}$/u.test(answer) || +answer >= payload.options.length)
            return invalid();
        return +answer === payload.correctIndex ? 'correct' : 'incorrect';
    }
    if (kind === 'numeric' && payload && 'answer' in payload) {
        const n = numericAnswer(answer);
        if (n === null)
            return invalid();
        const delta = Math.abs(n - payload.answer);
        return delta <= payload.tolerance || (payload.tolerance > 0 && delta - payload.tolerance <= Number.EPSILON * Math.max(delta, payload.tolerance) * 4) ? 'correct' : 'incorrect';
    }
    return 'pending';
}
export const checkMethodKey = (method: CheckMethod) => ({ auto: 'practiceCheckedAuto', self: 'practiceCheckedSelf', judgment: 'practiceCheckedJudgment' } as const)[method];
export const kindKey = (kind: QuestionKind) => ({ recall: 'practiceKindRecall', choice: 'practiceKindChoice', numeric: 'practiceKindNumeric', short: 'practiceKindShort', application: 'practiceKindApplication', explain_back: 'practiceKindExplainBack' } as const)[kind];
export const resultKey = (result: PracticeResult) => ({ correct: 'practiceCorrect', partial: 'practicePartial', incorrect: 'practiceIncorrect', pending: 'practicePending' } as const)[result];
export const mistakeKey = (category: MistakeCategory) => ({ definition: 'practiceMistakeDefinition', assumption: 'practiceMistakeAssumption', calculation: 'practiceMistakeCalculation', recall: 'practiceMistakeRecall', reading: 'practiceMistakeReading', method: 'practiceMistakeMethod', other: 'practiceMistakeOther' } as const)[category];
