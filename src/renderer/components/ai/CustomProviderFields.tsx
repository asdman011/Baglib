'use client';
/**
 * KEY-385: settings for any OpenAI-compatible AI service. Pick a preset (Groq, OpenRouter, Mistral, a local LM Studio…)
 * or type any address; the key and model are kept apart from the OpenAI ones. "Load models" lists the service's chat
 * models so the model does not have to be typed from memory.
 */
import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PROVIDER_PRESETS, chatModelIds, isLocalAddress } from '../../../shared/ai-providers';
import type { AISettings } from '../../../shared/types/ai';
import type { TranslationKey } from '../../translations';

const field = 'w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono';
const label = 'block text-xs font-semibold mb-1 text-zinc-700 dark:text-zinc-300';

export function CustomProviderFields({ settings, setSettings, t }: {
  settings: AISettings;
  setSettings: (next: AISettings) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ kind: 'idle' | 'loading' | 'ok' | 'error'; text?: string }>({ kind: 'idle' });
  const preset = settings.customPreset ?? '';
  const local = isLocalAddress(settings.customBaseUrl);
  const model = (settings.customModel || '').trim();
  const notChat = Boolean(model) && chatModelIds([model]).length === 0;

  const choosePreset = (id: string) => {
    const found = PROVIDER_PRESETS.find(item => item.id === id);
    setModels([]);
    setStatus({ kind: 'idle' });
    setSettings({ ...settings, customPreset: id || undefined, customBaseUrl: found ? found.baseUrl : settings.customBaseUrl, customModel: found?.model ?? (found ? '' : settings.customModel) });
  };
  const loadModels = async () => {
    setStatus({ kind: 'loading' });
    try {
      const result = await window.electronAPI.ai.listModels({ ...settings, provider: 'custom' });
      if (result.ok) { setModels(result.models); setStatus({ kind: 'ok', text: t('aiModelsLoaded', { count: result.models.length }) }); }
      else setStatus({ kind: 'error', text: t('aiModelsFailed', { message: result.message }) });
    } catch (error) {
      setStatus({ kind: 'error', text: t('aiModelsFailed', { message: error instanceof Error ? error.message : String(error) }) });
    }
  };

  return <div className="space-y-4" data-ai-custom-provider>
    <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{t('aiCustomHint')}</p>
    <div>
      <label className={label} htmlFor="ai-custom-preset">{t('aiPresetLabel')}</label>
      <select id="ai-custom-preset" data-ai-custom-preset value={preset} onChange={event => choosePreset(event.target.value)} className={field}>
        <option value="">{t('aiPresetCustom')}</option>
        {PROVIDER_PRESETS.map(item => <option key={item.id} value={item.id}>{item.name}{item.local ? ` (${t('assistantRunsLocally')})` : ''}</option>)}
      </select>
    </div>
    <div>
      <label className={label} htmlFor="ai-custom-url">{t('aiEndpointLabel')}</label>
      <input id="ai-custom-url" data-ai-custom-url type="url" dir="ltr" value={settings.customBaseUrl || ''} placeholder="https://api.example.com/v1"
        onChange={event => setSettings({ ...settings, customBaseUrl: event.target.value, customPreset: PROVIDER_PRESETS.some(item => item.baseUrl === event.target.value.trim().replace(/\/+$/, '')) ? settings.customPreset : undefined })} className={field} />
    </div>
    <div>
      <label className={label} htmlFor="ai-custom-key">{t('aiApiKeyLabel')}{local ? ` (${t('aiKeyOptionalLocal')})` : ''}</label>
      <input id="ai-custom-key" data-ai-custom-key type="password" dir="ltr" autoComplete="off" value={settings.customApiKey || ''} onChange={event => setSettings({ ...settings, customApiKey: event.target.value })} className={field} />
    </div>
    <div>
      <label className={label} htmlFor="ai-custom-model">{t('aiModelLabel')}</label>
      <div className="flex gap-2">
        <input id="ai-custom-model" data-ai-custom-model dir="ltr" list="baglib-custom-models" value={settings.customModel || ''} onChange={event => setSettings({ ...settings, customModel: event.target.value })} className={field} />
        <button type="button" data-ai-load-models onClick={() => void loadModels()} disabled={status.kind === 'loading' || !settings.customBaseUrl}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
          <RefreshCw className={`size-3.5 ${status.kind === 'loading' ? 'animate-spin' : ''}`} />{t('aiLoadModels')}
        </button>
      </div>
      <datalist id="baglib-custom-models">{models.map(model => <option key={model} value={model} />)}</datalist>
      {notChat && <p data-ai-model-not-chat role="alert" className="mt-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">{t('aiModelNotChat')}</p>}
      {status.text && <p data-ai-models-status={status.kind} className={`mt-1 text-[11px] ${status.kind === 'error' ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'}`}>{status.text}</p>}
      {models.length > 0 && <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {models.map(model => <button key={model} type="button" data-ai-model-option={model} onClick={() => setSettings({ ...settings, customModel: model })}
          className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${settings.customModel === model ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'border-zinc-300 dark:border-zinc-700'}`}>{model}</button>)}
      </div>}
    </div>
  </div>;
}
