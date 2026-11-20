/**
 * Remote AI consent, asked once per provider (KEY-383). A local Ollama on this computer needs none. For any other
 * provider the user's yes is remembered in the AI settings under a key naming the provider (and its address for
 * OpenAI-compatible services), so switching provider or address asks again. The main process still refuses a
 * remote call unless the request carries `allowRemote`.
 */
import { isLocalAddress, normaliseBaseUrl } from './ai-providers';

export interface ConsentSettings { provider?: string; ollamaEndpoint?: string; baseUrl?: string; customBaseUrl?: string; remoteConsent?: string }

/** A local Ollama, or (KEY-385) an OpenAI-compatible server on this computer such as LM Studio. */
export function isLocalAi(settings: ConsentSettings): boolean {
  const provider = settings.provider || 'ollama';
  return provider === 'custom' ? isLocalAddress(settings.customBaseUrl)
    : provider === 'ollama' && isLocalAddress(settings.ollamaEndpoint || 'http://127.0.0.1:11434');
}

/** The consent key for the configured provider, or null when it runs on this computer. */
export function remoteConsentKey(settings: ConsentSettings): string | null {
  if (isLocalAi(settings)) return null;
  const provider = settings.provider || 'ollama';
  const address = provider === 'custom' ? normaliseBaseUrl(settings.customBaseUrl)
    : provider === 'openai' ? (settings.baseUrl || '').trim().replace(/\/+$/, '')
    : provider === 'ollama' ? (settings.ollamaEndpoint || '').trim() : '';
  return address ? `${provider}|${address}` : provider;
}

/** Whether the user already allowed sending to the configured provider. */
export function hasRemoteConsent(settings: ConsentSettings): boolean {
  const key = remoteConsentKey(settings);
  return key === null || settings.remoteConsent === key;
}

/** Stored consent is authoritative; an old renderer checkbox cannot restore revoked consent. */
export function aiPrivacyError(settings: ConsentSettings & { enabled?: boolean }, allowRemote = true): 'ai-disabled' | 'permission-denied' | null {
  if (settings.enabled !== true) return 'ai-disabled';
  return isLocalAi(settings) || allowRemote === true && hasRemoteConsent(settings) ? null : 'permission-denied';
}
/** Safe destination display: no URL credentials, query values, fragments or API keys. */
export function aiConsentEndpoint(settings: ConsentSettings): string {
  const raw = settings.provider === 'custom' ? settings.customBaseUrl : settings.provider === 'openai' ? settings.baseUrl || 'https://api.openai.com/v1'
    : settings.provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : settings.provider === 'claude' ? 'https://api.anthropic.com/v1'
    : settings.ollamaEndpoint || 'http://127.0.0.1:11434';
  try { const url = new URL(raw || ''); return ['http:', 'https:'].includes(url.protocol) ? url.origin + url.pathname.replace(/\/+$/, '') : ''; } catch { return ''; }
}
