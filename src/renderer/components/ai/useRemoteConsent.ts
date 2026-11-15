'use client';
/**
 * KEY-383: remote AI consent asked once per provider. Reads the AI settings, says whether the configured provider is
 * local or already allowed, and remembers or withdraws the user's yes in the settings.
 */
import { useCallback, useEffect, useState } from 'react';
import { hasRemoteConsent, remoteConsentKey } from '../../../shared/ai-consent';
import { providerReady } from '../../../shared/research-ai';
import { customProviderName } from '../../../shared/ai-providers';
import type { AISettings } from '../../../shared/types/ai';
import type { TranslationKey } from '../../translations';

const providerKeys: Record<string, TranslationKey> = {
  ollama: 'aiProviderOllama', openai: 'aiProviderOpenAI', custom: 'aiProviderCustom', gemini: 'aiProviderGemini', claude: 'aiProviderClaude',
};

export function useRemoteConsent() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => void window.electronAPI.ai.getSettings().then(value => { if (live) setSettings(value as AISettings | null); }).catch(() => {});
    load();
    window.addEventListener('focus', load);
    return () => { live = false; window.removeEventListener('focus', load); };
  }, []);
  const key = settings ? remoteConsentKey(settings) : null;
  const local = settings !== null && key === null;
  const allowed = settings !== null && hasRemoteConsent(settings);
  const save = useCallback(async (value: string | undefined) => {
    const saved = await window.electronAPI.ai.saveSettings({ remoteConsent: value }) as AISettings;
    setSettings(saved);
  }, []);
  /** Re-reads the settings right before sending, so a provider changed meanwhile is never sent to unasked. */
  const check = useCallback(async () => {
    const fresh = await window.electronAPI.ai.getSettings() as AISettings | null;
    setSettings(fresh);
    return { local: fresh !== null && remoteConsentKey(fresh) === null, allowed: fresh !== null && hasRemoteConsent(fresh), ready: fresh !== null && fresh.enabled !== false && providerReady(fresh) };
  }, []);
  return {
    check,
    ready: settings !== null,
    local,
    allowed,
    providerLabel: (providerKeys[settings?.provider ?? 'ollama'] ?? 'aiProviderOpenAI') as TranslationKey,
    /** KEY-385: the service's own name (Groq, LM Studio…) for the custom provider. */
    customName: settings?.provider === 'custom' ? customProviderName(settings) : undefined,
    allow: () => (key ? save(key) : Promise.resolve()),
    revoke: () => save(undefined),
  };
}
