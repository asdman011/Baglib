/**
 * Why a provider call failed, in words the user can act on (KEY-373 follow-up): out of quota, overloaded or too
 * slow, a bad key, or anything else. The raw provider message is kept short as a detail.
 */
export type ProviderErrorCode = 'provider-quota' | 'provider-busy' | 'provider-auth' | 'provider-too-large' | 'provider-model' | 'provider-terms' | 'provider-error';
export const PROVIDER_ERROR_CODES: readonly ProviderErrorCode[] = ['provider-quota', 'provider-busy', 'provider-auth', 'provider-too-large', 'provider-model', 'provider-terms', 'provider-error'];

export function providerErrorCode(message: string): ProviderErrorCode {
  // KEY-385: a model that cannot chat (classifier, speech, transcription) or that the service does not offer.
  if (/text classification|does not support chat|not a chat model|model_not_found|model .{0,80} does not exist|unknown model|invalid model/i.test(message)) return 'provider-model';
  if (/terms acceptance|model_terms_required|accept the terms/i.test(message)) return 'provider-terms';
  // OpenAI-compatible services report "(429)"; Gemini "HTTP 429". 413 = more tokens than the model's per-minute limit.
  if (/HTTP 413|\(413\)|request too large|request entity too large/i.test(message)) return 'provider-too-large';
  if (/HTTP 429|\(429\)|quota|RESOURCE_EXHAUSTED|rate limit/i.test(message)) return 'provider-quota';
  if (/HTTP 40[13]|\(40[13]\)|API key|unauthori[sz]ed|permission denied|key is missing/i.test(message)) return 'provider-auth';
  if (/HTTP 5\d\d|\(5\d\d\)|high demand|overloaded|no answer within|aborted|timed? ?out|ECONNRESET|ECONNREFUSED|fetch failed|empty answer/i.test(message)) return 'provider-busy';
  return 'provider-error';
}

/** A short provider message for display, with anything that looks like a key removed. */
export function providerErrorDetail(message: string): string {
  return message.replace(/(key=|api[-_ ]?key[:= ]+)[^\s&|]+/gi, '$1…').replace(/\bAQ\.[\w-]{10,}|\bAIza[\w-]{20,}|\bsk-[\w-]{10,}|\bgsk_\w{10,}/g, '…').slice(0, 300);
}
