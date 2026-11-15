/**
 * KEY-385: any OpenAI-compatible AI service, not only the four built-in providers. A preset fills the address (and
 * a tested default model where one is known); the user can also type any address. The custom provider keeps its
 * own address, key and model, so switching never overwrites the OpenAI key.
 */
import type { AISettings } from './types/ai';

export interface ProviderPreset { id: string; name: string; baseUrl: string; model?: string; local?: boolean }

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  // Tested 2026-11-15 with a free key: qwen3.8-27b answered Arabic well, cited exactly and kept the hadith rule.
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'qwen/qwen3.8-27b' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1' },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1' },
  { id: 'huggingface', name: 'Hugging Face', baseUrl: 'https://router.huggingface.co/v1' },
  { id: 'lmstudio', name: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', local: true },
];

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
/** The address with no trailing slash, or '' when it is not an http(s) URL without credentials. */
export function normaliseBaseUrl(value: string | undefined): string {
  const text = (value || '').trim().replace(/\/+$/, '');
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return text;
  } catch { return ''; }
}
export function isLocalAddress(value: string | undefined): boolean {
  const text = normaliseBaseUrl(value);
  if (!text) return false;
  return LOCAL_HOSTS.includes(new URL(text).hostname);
}

/** The settings the OpenAI-compatible client should use for the custom provider. */
export function customProviderSettings(settings: AISettings): AISettings {
  return { ...settings, baseUrl: normaliseBaseUrl(settings.customBaseUrl), apiKey: settings.customApiKey || '', model: settings.customModel || '' };
}

/** A readable name for the custom provider: its preset, else its host. */
export function customProviderName(settings: Pick<AISettings, 'customPreset' | 'customBaseUrl'>): string {
  const preset = PROVIDER_PRESETS.find(item => item.id === settings.customPreset);
  if (preset) return preset.name;
  const base = normaliseBaseUrl(settings.customBaseUrl);
  return base ? new URL(base).host : 'OpenAI-compatible';
}

/** Chat models only: drops speech, transcription, embedding and safety-filter models from a /models list. */
export function chatModelIds(ids: string[]): string[] {
  return ids.filter(id => !/whisper|tts|orpheus|transcrib|embed|guard|safeguard|moderation|rerank|image|audio|vision-only/i.test(id)).sort();
}
