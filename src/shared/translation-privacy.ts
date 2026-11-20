import type { AISettings } from './types/ai';
import { hasRemoteConsent } from './ai-consent';
import { aiOperationErrorCode, type AiOperationErrorCode } from './ai-errors';

export type TranslationErrorCode = AiOperationErrorCode;
export class TranslationError extends Error {
  constructor(public readonly code: TranslationErrorCode) { super(code); }
}
/** Canonical destinations contain no credentials or selected text. Public Google is a distinct identity. */
export function translationDestination(settings: AISettings): { provider: string; endpoint: string; key: string } | null {
  const provider = settings.translationProvider || 'llm';
  if (provider === 'llm') return null;
  let endpoint: string;
  let identity: string = provider;
  if (provider === 'deepl') endpoint = settings.translationApiKey?.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
  else if (provider === 'google') {
    identity = settings.translationApiKey ? 'google' : 'google-public';
    endpoint = settings.translationApiKey ? 'https://translation.googleapis.com/language/translate/v2' : 'https://translate.googleapis.com/translate_a/single';
  } else if (provider === 'yandex') endpoint = 'https://translate.api.cloud.yandex.net/translate/v2/translate';
  else throw new TranslationError('invalid-request');
  return { provider: identity, endpoint, key: identity + '|' + endpoint };
}
export function translationReady(settings: AISettings): boolean {
  const dest = translationDestination(settings);
  return settings.enabled === true && (!dest || Boolean(settings.translationApiKey) || dest.provider === 'google-public' && settings.googlePublicTranslation === true);
}
export function hasTranslationConsent(settings: AISettings): boolean {
  const dest = translationDestination(settings);
  return dest ? settings.translationConsent === dest.key : hasRemoteConsent(settings);
}
export function assertTranslationAllowed(settings: AISettings): void {
  if (settings.enabled !== true) throw new TranslationError('ai-disabled');
  if (!translationReady(settings)) throw new TranslationError('not-configured');
  if (!hasTranslationConsent(settings)) throw new TranslationError('permission-denied');
}
export interface TranslationInput { text: string; targetLang?: string; sourceLang?: string; bookTitle?: string }
export function validateTranslationInput(value: unknown): TranslationInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TranslationError('invalid-request');
  const input = value as Record<string, unknown>;
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 60000) throw new TranslationError('invalid-request');
  for (const key of ['targetLang', 'sourceLang']) if (input[key] !== undefined && (typeof input[key] !== 'string' || !/^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(input[key] as string))) throw new TranslationError('invalid-request');
  if (input.bookTitle !== undefined && (typeof input.bookTitle !== 'string' || input.bookTitle.length > 1000)) throw new TranslationError('invalid-request');
  return { text: input.text, targetLang: input.targetLang as string | undefined, sourceLang: input.sourceLang as string | undefined, bookTitle: input.bookTitle as string | undefined };
}
/** Never expose provider bodies, URLs with query text, keys, or arbitrary exception text. */
export function translationErrorCode(error: unknown): TranslationErrorCode {
  return error instanceof TranslationError ? error.code : aiOperationErrorCode(error);
}
