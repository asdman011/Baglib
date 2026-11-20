import type { AIResearchQueryPayload } from './types/ai';
import { AiOperationError } from './ai-errors';
export function validateAiResearchInput(input: unknown): AIResearchQueryPayload {
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AiOperationError('invalid-request');
 const value=input as Record<string, unknown>;
 if (!['chat','contextual_dictionary','structured_summary','biographical_tarajim','inline_translation'].includes(value.tool as string) || !Number.isSafeInteger(value.currentPage) || Number(value.currentPage)<1) throw new AiOperationError('invalid-request');
 if (typeof value.bookTitle !== 'string' || value.bookTitle.length>1000) throw new AiOperationError('invalid-request');
 for (const key of ['bookId','authorName','selectedText','surroundingContext','userQuery','targetLang','attempt']) if(value[key]!==undefined && (typeof value[key]!=='string'||(value[key] as string).length>(['selectedText','surroundingContext'].includes(key)?60000:6000))) throw new AiOperationError('invalid-request');
 for (const key of ['inRevisionOrTest','revealFullAnswer','saveAsNote']) if(value[key]!==undefined && typeof value[key]!=='boolean') throw new AiOperationError('invalid-request');
 return { ...value } as unknown as AIResearchQueryPayload;
}
