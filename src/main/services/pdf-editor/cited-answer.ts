import type { PdfAnswer } from '../../../shared/types/pdf-collaboration';
import type { PdfInspection } from '../../../shared/types/pdf-editor';
import { validateCitedJsonAnswer } from '../../../shared/cited-answer';

export function validatePdfAnswer(value: string, inspection: PdfInspection): PdfAnswer {
  const validated = validateCitedJsonAnswer(
    value,
    inspection.pages.map(p => ({ page: p.page, text: p.text })),
    { requirePage: true, maxCitations: 30 },
  );
  return {
    answer: validated.answer,
    citations: validated.citations.map(c => ({ page: c.page!, quote: c.quote })),
    abstained: validated.abstained,
    limited: inspection.extraction === 'limited',
  };
}
