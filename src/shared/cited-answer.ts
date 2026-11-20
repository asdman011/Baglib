/**
 * Shared cited-answer pipeline (KEY-438, reusing KEY-434 / pdf-editor/cited-answer.ts).
 *
 * Provides:
 * - JSON cited-answer validation with exact quote verification (`validateCitedJsonAnswer`)
 * - Statement-level unsourced marking (`markUnsourcedStatements`)
 * - Ruling/fatwa policy guidance (`CITED_ANSWER_RULING_POLICY`)
 * - UI token splitting (`splitCitedTextParts`) for BagLib links & unsourced badges
 */
import { KNOWN_PUA_CHAR_MAP } from './pdf-accessibility-utils';

export const UNSOURCED_LABEL: Record<'ar' | 'en', string> = {
  ar: 'غير موثق بمصدر',
  en: 'unsourced',
};

export const CITED_ANSWER_RULING_POLICY =
  'For religious-ruling (fiqh/fatwa) questions, NEVER issue a ruling or fatwa; point to the relevant supplied sources and qualified scholars instead, and state uncertainty.';

const squash = (text: string): string => text.replace(/\s+/gu, ' ').trim();
const normalizeForBookQuote = (text: string): string =>
  squash(Array.from(text, ch => KNOWN_PUA_CHAR_MAP[ch.codePointAt(0)!] ?? ch).join('').normalize('NFC'));

export function quoteMatchesSource(quote: string, sourceText: string): boolean {
  if (typeof quote !== 'string' || quote.length < 3 || quote.length > 2000) return false;
  if (sourceText.includes(quote)) return true;
  const sq = squash(quote);
  if (sq.length >= 3 && squash(sourceText).includes(sq)) return true;
  const nb = normalizeForBookQuote(quote);
  return nb.length >= 3 && normalizeForBookQuote(sourceText).includes(nb);
}

export interface CitedJsonSource {
  page?: number;
  id?: string;
  text: string;
}

export interface ValidatedCitedJson {
  answer: string;
  abstained: boolean;
  citations: Array<{ page?: number; source?: string; quote: string }>;
}

/**
 * Shared JSON cited-answer validator used by PDF Q&A (`pdf-editor/cited-answer.ts`)
 * and other structured cited-answer paths.
 */
export function validateCitedJsonAnswer(
  value: string,
  sources: CitedJsonSource[],
  options?: { requirePage?: boolean; maxCitations?: number },
): ValidatedCitedJson {
  const raw = JSON.parse(value.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')) as Record<string, unknown>;
  const maxCitations = options?.maxCitations ?? 30;
  if (
    !raw ||
    typeof raw.answer !== 'string' ||
    raw.answer.length > 20_000 ||
    typeof raw.abstained !== 'boolean' ||
    !Array.isArray(raw.citations) ||
    raw.citations.length > maxCitations
  ) {
    throw new Error('invalid-output');
  }

  const citations = raw.citations.map((entry: unknown) => {
    const citation = (entry ?? {}) as { page?: unknown; source?: unknown; quote?: unknown };
    if (typeof citation.quote !== 'string' || citation.quote.length < 3 || citation.quote.length > 2000) {
      throw new Error('invalid-output');
    }
    const matched = options?.requirePage
      ? sources.find(s => s.page === citation.page)
      : sources.find(s => (citation.source !== undefined && s.id === citation.source) || (citation.page !== undefined && s.page === citation.page));
    if (!matched || !quoteMatchesSource(citation.quote, matched.text)) {
      throw new Error('invalid-output');
    }
    return {
      ...(matched.page !== undefined ? { page: matched.page } : {}),
      ...(matched.id !== undefined ? { source: matched.id } : {}),
      quote: citation.quote,
    };
  });

  if (!raw.abstained && (!raw.answer.trim() || !citations.length)) {
    throw new Error('invalid-output');
  }
  return { answer: raw.answer, abstained: raw.abstained, citations };
}

const CITATION_NUM_RE = /\[(\d{1,3})\]/gu;
const CITATION_SID_RE = /\[(S\d{1,3})\]/gu;
const ALREADY_UNSOURCED_RE = /\[(?:unsourced|غير موثق بمصدر)\]\s*$/u;

function hasValidCitationMarker(
  segment: string,
  validNs: Set<number>,
  validSourceIds?: Set<string>,
): boolean {
  for (const match of segment.matchAll(CITATION_NUM_RE)) {
    if (validNs.has(Number(match[1]))) return true;
  }
  if (validSourceIds) {
    for (const match of segment.matchAll(CITATION_SID_RE)) {
      if (validSourceIds.has(match[1])) return true;
    }
  }
  return false;
}

/**
 * Marks any statement in `text` that lacks a valid citation marker with `[unsourced]` / `[غير موثق بمصدر]`.
 * Preserves existing cited statements, headings, and already-marked lines.
 */
export function markUnsourcedStatements(
  text: string,
  validNs: Set<number>,
  language: 'ar' | 'en',
  options?: { wholeAnswerCited?: boolean; validSourceIds?: Set<string> },
): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (options?.wholeAnswerCited) return trimmed;

  const label = UNSOURCED_LABEL[language];
  const lines = trimmed.split('\n');
  const out = lines.map(line => {
    const lineTrimmed = line.trim();
    if (!lineTrimmed) return line;
    if (/^#{1,6}\s/u.test(lineTrimmed)) return line;
    if (ALREADY_UNSOURCED_RE.test(lineTrimmed)) return line;

    // If the line contains at least one valid citation, check if it has multiple sentences where some lack citations.
    if (hasValidCitationMarker(lineTrimmed, validNs, options?.validSourceIds)) {
      const sentences = lineTrimmed.split(/(?<=[.!؟])\s+/u);
      if (sentences.length <= 1) return line;
      const markedSentences = sentences.map(sentence => {
        const sTrim = sentence.trim();
        if (!sTrim || ALREADY_UNSOURCED_RE.test(sTrim)) return sentence;
        return hasValidCitationMarker(sTrim, validNs, options?.validSourceIds)
          ? sentence
          : `${sTrim} [${label}]`;
      });
      const leading = line.slice(0, line.indexOf(lineTrimmed));
      return `${leading}${markedSentences.join(' ')}`;
    }

    return `${line.replace(/\s+$/u, '')} [${label}]`;
  });

  return out.join('\n');
}

export type CitedTextPart =
  | { type: 'text'; value: string }
  | { type: 'citation'; value: string; n: number }
  | { type: 'unsourced'; value: string };

/** Splits answer text into plain text, `[n]` / `[Sn]` citation tokens, and `[unsourced]` / `[غير موثق بمصدر]` tokens. */
export function splitCitedTextParts(text: string): CitedTextPart[] {
  const parts: CitedTextPart[] = [];
  const tokenRe = /\[S?(\d{1,3})\]|\[(unsourced|غير موثق بمصدر)\]/gu;
  let lastIndex = 0;
  for (const match of text.matchAll(tokenRe)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, idx) });
    }
    if (match[1] !== undefined) {
      parts.push({ type: 'citation', value: match[0], n: Number(match[1]) });
    } else if (match[2] !== undefined) {
      parts.push({ type: 'unsourced', value: match[2] });
    }
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return parts;
}
