import type { PdfAnswer } from '../../../shared/types/pdf-collaboration';
import type { PdfInspection } from '../../../shared/types/pdf-editor';
export function validatePdfAnswer(value: string, inspection: PdfInspection): PdfAnswer {
  const raw = JSON.parse(value.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, ''));
  if (!raw || typeof raw.answer !== 'string' || raw.answer.length > 20000 || typeof raw.abstained !== 'boolean' || !Array.isArray(raw.citations) || raw.citations.length > 30) throw new Error('invalid-output');
  const citations = raw.citations.map((citation: { page: number; quote: string }) => {
    const page = inspection.pages.find(page => page.page === citation.page);
    if (!page || typeof citation.quote !== 'string' || citation.quote.length < 3 || citation.quote.length > 2000 || !page.text.includes(citation.quote)) throw new Error('invalid-output');
    return { page: citation.page, quote: citation.quote };
  });
  if (!raw.abstained && (!raw.answer.trim() || !citations.length)) throw new Error('invalid-output');
  return { answer: raw.answer, citations, abstained: raw.abstained, limited: inspection.extraction === 'limited' };
}
