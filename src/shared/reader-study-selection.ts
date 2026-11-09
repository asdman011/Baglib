import { parseBookTarget } from './study-notes';
import { validateCardInput, type SaveCardInput } from './types/knowledge-cards';

export interface ReaderStudySource {
  target: string;
  label: string;
  text: string;
}

export function readerSelectionCard(
  text: string,
  context: { target: string; label: string; workId: string; language: string },
): SaveCardInput {
  const target = parseBookTarget(context.target);
  if (target?.id !== context.workId || !target?.sourceId || (!target.page && !target.cfi)) {
    throw new Error('invalid-request');
  }
  // Bound by the card's UTF-16 limit without leaving a dangling surrogate pair.
  const front = text.trim().slice(0, 20_000).replace(/[\uD800-\uDBFF]$/u, '');
  return validateCardInput({
    front,
    back: '',
    sourceKind: 'book',
    sourceRef: context.target,
    sourceLabel: context.label.slice(0, 500),
    workId: context.workId,
    language: context.language,
    questionKind: 'recall',
  });
}
