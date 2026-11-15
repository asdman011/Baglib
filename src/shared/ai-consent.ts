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
  if (settings.provider === 'custom') return isLocalAddress(settings.customBaseUrl);
  try {
    const url = new URL(settings.ollamaEndpoint || 'http://127.0.0.1:11434');
    return settings.provider === 'ollama' && ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', '[::1]'].includes(url.hostname) && !url.username && !url.password;
  } catch { return false; }
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
