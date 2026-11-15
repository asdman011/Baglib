import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_PRESETS, chatModelIds, customProviderName, customProviderSettings, isLocalAddress, normaliseBaseUrl } from '../../src/shared/ai-providers';
import { hasRemoteConsent, isLocalAi, remoteConsentKey } from '../../src/shared/ai-consent';
import { providerReady } from '../../src/shared/research-ai';
import { providerErrorCode, providerErrorDetail } from '../../src/shared/ai-errors';
import type { AISettings } from '../../src/shared/types/ai';

test('presets and addresses: http(s) only, no credentials, local servers recognised', () => {
  assert.ok(PROVIDER_PRESETS.some(preset => preset.id === 'groq' && preset.baseUrl === 'https://api.groq.com/openai/v1'));
  assert.equal(normaliseBaseUrl(' https://api.groq.com/openai/v1/ '), 'https://api.groq.com/openai/v1');
  assert.equal(normaliseBaseUrl('ftp://x'), '');
  assert.equal(normaliseBaseUrl('https://user:pass@x.example'), '');
  assert.equal(isLocalAddress('http://127.0.0.1:1234/v1'), true);
  assert.equal(isLocalAddress('http://localhost:1234/v1'), true);
  assert.equal(isLocalAddress('https://api.groq.com/openai/v1'), false);
  assert.equal(customProviderName({ customPreset: 'groq' }), 'Groq');
  assert.equal(customProviderName({ customBaseUrl: 'https://llm.example.org/v1' }), 'llm.example.org');
  assert.deepEqual(chatModelIds(['whisper-large-v3', 'qwen/qwen3.8-27b', 'meta-llama/llama-prompt-guard-2-22m', 'openai/gpt-oss-120b', 'canopylabs/orpheus-arabic-saudi', 'openai/gpt-oss-safeguard-20b']), ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b']);
});

test('the custom provider keeps its own address, key and model, apart from OpenAI', () => {
  const settings = { provider: 'custom', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-openai', model: 'gpt-4o-mini', customBaseUrl: 'https://api.groq.com/openai/v1/', customApiKey: 'gsk_test', customModel: 'qwen/qwen3.8-27b' } as AISettings;
  const effective = customProviderSettings(settings);
  assert.equal(effective.baseUrl, 'https://api.groq.com/openai/v1');
  assert.equal(effective.apiKey, 'gsk_test');
  assert.equal(effective.model, 'qwen/qwen3.8-27b');
  assert.equal(settings.apiKey, 'sk-openai', 'the OpenAI key is untouched');
});

test('readiness and consent for the custom provider: a key is needed unless the server is local', () => {
  assert.equal(providerReady({ provider: 'custom', customBaseUrl: 'https://api.groq.com/openai/v1' }), false);
  assert.equal(providerReady({ provider: 'custom', customBaseUrl: 'https://api.groq.com/openai/v1', customApiKey: 'gsk_x' }), true);
  assert.equal(providerReady({ provider: 'custom', customBaseUrl: 'http://127.0.0.1:1234/v1' }), true, 'LM Studio needs no key');
  assert.equal(providerReady({ provider: 'custom', customApiKey: 'gsk_x' }), false, 'an address is required');
  assert.equal(isLocalAi({ provider: 'custom', customBaseUrl: 'http://127.0.0.1:1234/v1' }), true);
  assert.equal(remoteConsentKey({ provider: 'custom', customBaseUrl: 'http://127.0.0.1:1234/v1' }), null);
  assert.equal(remoteConsentKey({ provider: 'custom', customBaseUrl: 'https://api.groq.com/openai/v1' }), 'custom|https://api.groq.com/openai/v1');
  assert.equal(hasRemoteConsent({ provider: 'custom', customBaseUrl: 'https://openrouter.ai/api/v1', remoteConsent: 'custom|https://api.groq.com/openai/v1' }), false, 'another service asks again');
});

test('OpenAI-style errors map to actionable codes, including a request over the per-minute token limit', () => {
  assert.equal(providerErrorCode('OpenAI API error (413): {"error":{"message":"Request too large for model qwen/qwen3.8-27b ... tokens per minute (TPM): Limit 8000"}}'), 'provider-too-large');
  assert.equal(providerErrorCode('OpenAI API error (429): {"error":{"message":"Rate limit reached"}}'), 'provider-quota');
  assert.equal(providerErrorCode('OpenAI API error (401): {"error":{"message":"Invalid API Key"}}'), 'provider-auth');
  assert.equal(providerErrorCode('OpenAI API error (503): Service Unavailable'), 'provider-busy');
  assert.equal(providerErrorDetail('Invalid key gsk_QkzewR9PNXK1OcsrqllqW provided'), 'Invalid key … provided');
});
