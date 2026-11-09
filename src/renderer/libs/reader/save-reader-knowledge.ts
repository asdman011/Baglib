import type { KnowledgeItemDTO, SaveKnowledgePayload } from '../../../shared/types/knowledge';
import type { AnnotationDTO } from '../../../shared/types/annotation';

export async function saveReaderKnowledge(
  api: { save: (payload: SaveKnowledgePayload) => Promise<KnowledgeItemDTO> } | undefined,
  payload: SaveKnowledgePayload,
): Promise<{ item: KnowledgeItemDTO; annotation: AnnotationDTO | null }> {
  if (!api) throw new Error('Knowledge API unavailable');
  const item = await api.save({ ...payload, actor: 'reader' });
  if (!item?.id) throw new Error('Knowledge save did not return an item');
  const annotation: AnnotationDTO | null = item.workId ? {
    id: item.id,
    bookId: item.workId,
    type: item.knowledgeType === 'highlight' ? 'highlight' : item.knowledgeType === 'bookmark' ? 'bookmark' : 'note',
    locationCfiOrPage: item.location,
    selectedText: item.quotedText ?? null,
    noteContent: item.noteContent || item.contextNote || item.questionText || item.label || null,
    color: item.color ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  } : null;
  return { item, annotation };
}
