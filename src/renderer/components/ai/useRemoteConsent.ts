'use client';
/**
 * KEY-383: remote AI consent asked once per provider. Reads the AI settings, says whether the configured provider is
 * local or already allowed, and remembers or withdraws the user's yes in the settings.
 */
import { useCallback, useEffect, useState } from 'react';
import { hasRemoteConsent, remoteConsentKey, aiConsentEndpoint } from '../../../shared/ai-consent';
import { translationDestination, translationReady, hasTranslationConsent } from '../../../shared/translation-privacy';
import { providerReady } from '../../../shared/research-ai';
import { customProviderName } from '../../../shared/ai-providers';
import type { AISettings } from '../../../shared/types/ai';
import { translations, type TranslationKey } from '../../translations';

const providerKeys: Record<string, TranslationKey> = {
  ollama: 'aiProviderOllama', openai: 'aiProviderOpenAI', custom: 'aiProviderCustom', gemini: 'aiProviderGemini', claude: 'aiProviderClaude',
};

export function useRemoteConsent(mode: 'ai' | 'translation' = 'ai') {
  const [settings, setSettings] = useState<AISettings | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => void window.electronAPI.ai.getSettings().then(value => { if (live) setSettings(value as AISettings | null); }).catch(() => {});
    load();
    window.addEventListener('focus', load);
    window.addEventListener('baglib:ai-settings-changed', load);
    return () => { live = false; window.removeEventListener('focus', load); window.removeEventListener('baglib:ai-settings-changed', load); };
  }, []);
  const destination = settings && mode === 'translation' ? translationDestination(settings) : null;
  const key = settings ? destination?.key ?? remoteConsentKey(settings) : null;
  const local = settings !== null && key === null;
  const allowed = settings !== null && (mode === 'translation' ? hasTranslationConsent(settings) : hasRemoteConsent(settings));
  const save = useCallback(async (value: string | undefined) => {
    const saved = await window.electronAPI.ai.saveSettings(destination ? { translationConsent: value } : { remoteConsent: value }) as AISettings;
    setSettings(saved);
    window.dispatchEvent(new Event('baglib:ai-settings-changed'));
  }, [destination]);
  /** Re-reads the settings right before sending, so a provider changed meanwhile is never sent to unasked. */
  const check = useCallback(async () => {
    const fresh = await window.electronAPI.ai.getSettings() as AISettings | null;
    setSettings(fresh);
    const dedicated = fresh && mode === 'translation' ? translationDestination(fresh) : null;
    return { local: fresh !== null && !dedicated && remoteConsentKey(fresh) === null, allowed: fresh !== null && (mode === 'translation' ? hasTranslationConsent(fresh) : hasRemoteConsent(fresh)), ready: fresh !== null && fresh.enabled === true && (dedicated ? translationReady(fresh) : providerReady(fresh)) };
  }, [mode]);
  return {
    check,
    ready: settings !== null,
    local,
    allowed,
    providerLabel: (providerKeys[settings?.provider ?? 'ollama'] ?? 'aiProviderOpenAI') as TranslationKey,
    /** KEY-385: the service's own name (Groq, LM Studio…) for the custom provider. */
    customName: destination ? destination.provider + ' · ' + destination.endpoint : settings && !local ?
      (settings.provider === 'custom' ? customProviderName(settings) : translations[typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar' : 'en'][providerKeys[settings.provider] ?? 'aiProviderOpenAI']) + ' · ' + aiConsentEndpoint(settings) : undefined,
    allow: async () => {
      const fresh = await window.electronAPI.ai.getSettings() as AISettings | null;
      const currentKey = fresh ? (mode === 'translation' ? translationDestination(fresh)?.key : null) ?? remoteConsentKey(fresh) : undefined;
      if (currentKey !== key) { setSettings(fresh); return; }
      if (key) await save(key);
    },
    revoke: () => save(undefined),
  };
}
