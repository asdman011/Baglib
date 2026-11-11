'use client';
import { errorMessage } from '../../../shared/errors';
import { Modal } from '../ui/Modal';


import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldCheck,
  Server,
  Key,
  Globe,
  Check,
  AlertCircle,
  Loader2,
  X,
  Cpu,
  Save,
  CheckCircle2,
} from 'lucide-react';
import type { AISettings, AIProviderId, TranslationProviderId } from '../../../shared/types/ai';
import { TranslationKey } from '../../translations';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  t,
}) => {
  const [settings, setSettings] = useState<AISettings>({
    enabled: true,
    provider: 'ollama',
    model: 'llama3.2',
    temperature: 0.7,
    antiSpoilerCeiling: true,
    ollamaEndpoint: 'http://127.0.0.1:11434',
    ollamaModel: 'llama3.2',
    geminiModel: 'gemini-1.5-flash',
    claudeModel: 'claude-3-5-sonnet-20241022',
    translationProvider: 'llm',
    targetLanguage: 'ar',
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const [previousAISettingsVisibility, setPreviousAISettingsVisibility] = useState<readonly unknown[] | null>(null);
  const inputsAISettingsVisibility = [isOpen];
  if (previousAISettingsVisibility === null || inputsAISettingsVisibility.some((value, index) => !Object.is(value, previousAISettingsVisibility[index]))) {
    setPreviousAISettingsVisibility(inputsAISettingsVisibility);
    if (isOpen) { setIsLoading(true); setTestResult(null); setSaveSuccess(false); }
  }
  useEffect(() => {
    if (isOpen) {
      let alive = true;
      void window.electronAPI.ai.getSettings().then(loaded => { if (alive && loaded) setSettings(loaded); }).catch(console.warn).finally(() => { if (alive) setIsLoading(false); });
      return () => { alive = false; };
    }
  }, [isOpen]);



  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const windowAPI = (window).electronAPI;
      if (windowAPI?.ai?.testConnection) {
        const res = await windowAPI.ai.testConnection(settings);
        setTestResult(res);
      } else {
        setTestResult({
          success: true,
          message: 'Mock Connection OK (Browser preview mode)',
        });
      }
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: errorMessage(err) || 'Connection test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const windowAPI = (window).electronAPI;
      if (windowAPI?.ai?.saveSettings) {
        await windowAPI.ai.saveSettings(settings);
      }
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 900);
    } catch (err) {
      console.warn('[AISettingsModal] Failed to save AI settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const dialogRef = React.useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={() => { if (!isLoading && !isTesting) onClose(); }} asChild focusRef={dialogRef} label={t('aiSettingsModalTitle')}><div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('aiSettingsModalTitle')} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden text-start"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 p-3 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {t('aiSettingsModalTitle')}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {t('aiSettingsModalSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-3 sm:p-6 min-h-0 overflow-y-auto overscroll-contain space-y-6 flex-1 text-sm text-zinc-800 dark:text-zinc-200">
          {/* Provider Selection */}
          <div>
            <label className="block font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              {t('aiProviderLabel')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: 'ollama', label: t('aiProviderOllama'), icon: Server },
                { id: 'openai', label: t('aiProviderOpenAI'), icon: Cpu },
                { id: 'gemini', label: t('aiProviderGemini'), icon: Sparkles },
                { id: 'claude', label: t('aiProviderClaude'), icon: Key },
              ].map((p) => {
                const Icon = p.icon;
                const isSelected = settings.provider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSettings({ ...settings, provider: p.id as AIProviderId })}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold shadow-sm ring-1 ring-indigo-500/30'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <Icon className="w-5 h-5 mb-1.5 opacity-90" />
                    <span className="text-xs leading-tight">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Provider Fields */}
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20 space-y-4">
            {settings.provider === 'ollama' && (
              <>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-zinc-700 dark:text-zinc-300">
                    {t('aiEndpointLabel')}
                  </label>
                  <input
                    type="text"
                    value={settings.ollamaEndpoint || 'http://127.0.0.1:11434'}
                    onChange={(e) => setSettings({ ...settings, ollamaEndpoint: e.target.value })}
                    placeholder="http://127.0.0.1:11434"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-zinc-700 dark:text-zinc-300">
                    {t('aiModelLabel')}
                  </label>
                  <input
                    type="text"
                    value={settings.ollamaModel || 'llama3.2'}
                    onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value })}
                    placeholder="llama3.2, mistral, qwen2.5, etc."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </>
            )}

            {settings.provider === 'openai' && (
              <>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-zinc-700 dark:text-zinc-300">
                    {t('aiEndpointLabel')}
                  </label>
                  <input
                    type="text"
                    value={settings.baseUrl || 'https://api.openai.com/v1'}
                    onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
                    placeholder={t('aiEndpointPlaceholder')}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-zinc-700 dark:text-zinc-300">
                    {t('aiApiKeyLabel')}
                  </label>
                  <input
                    type="password"
                    value={settings.apiKey || ''}
                    onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-zinc-700 dark:text-zinc-300">
                    {t('aiModelLabel')}
                  </label>
                  <input
                    type="text"
                    value={settings.model || 'gpt-4o-mini'}
                    onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                    placeholder="gpt-4o-mini, gpt-4o, etc."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </>
            )}

            {settings.provider === 'gemini' && (
              <>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-zinc-700 dark:text-zinc-300">
                    {t('aiApiKeyLabel')}
                  </label>
                  <input
                    type="password"
                    value={settings.geminiApiKey || ''}
                    onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                    placeholder="AIzaSy..."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-zinc-700 dark:text-zinc-300">
                    {t('aiModelLabel')}
                  </label>
                  <input
                    type="text"
                    value={settings.geminiModel || 'gemini-1.5-flash'}
                    onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}
                    placeholder="gemini-1.5-flash, gemini-1.5-pro, etc."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </>
            )}

            {settings.provider === 'claude' && (
              <>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-zinc-700 dark:text-zinc-300">
                    {t('aiApiKeyLabel')}
                  </label>
                  <input
                    type="password"
                    value={settings.claudeApiKey || ''}
                    onChange={(e) => setSettings({ ...settings, claudeApiKey: e.target.value })}
                    placeholder="sk-ant-..."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-zinc-700 dark:text-zinc-300">
                    {t('aiModelLabel')}
                  </label>
                  <input
                    type="text"
                    value={settings.claudeModel || 'claude-3-5-sonnet-20241022'}
                    onChange={(e) => setSettings({ ...settings, claudeModel: e.target.value })}
                    placeholder="claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </>
            )}
          </div>

          {/* Anti-Spoiler RAG Ceiling Toggle (Readest Architecture) */}
          <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                  {t('aiAntiSpoilerToggle')}
                </span>
                <input
                  type="checkbox"
                  checked={settings.antiSpoilerCeiling !== false}
                  onChange={(e) =>
                    setSettings({ ...settings, antiSpoilerCeiling: e.target.checked })
                  }
                  className="w-4 h-4 text-indigo-600 rounded border-zinc-300 focus:ring-indigo-500 cursor-pointer"
                />
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                {t('aiAntiSpoilerDesc')}
              </p>
            </div>
          </div>

          {/* Translation Engine Configuration */}
          <div>
            <label className="block font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              {t('aiTranslationProviderLabel')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <select
                  value={settings.translationProvider || 'llm'}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      translationProvider: e.target.value as TranslationProviderId,
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="llm">{t('aiTranslationProviderLLM')}</option>
                  <option value="deepl">{t('aiTranslationProviderDeepL')}</option>
                  <option value="google">{t('aiTranslationProviderGoogle')}</option>
                  <option value="yandex">{t('aiTranslationProviderYandex')}</option>
                </select>
              </div>

              <div>
                <select
                  value={settings.targetLanguage || 'ar'}
                  onChange={(e) => setSettings({ ...settings, targetLanguage: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ar">{t('aiTargetLangAr')}</option>
                  <option value="en">{t('aiTargetLangEn')}</option>
                  <option value="fr">{t('aiTargetLangFr')}</option>
                  <option value="de">{t('aiTargetLangDe')}</option>
                  <option value="tr">{t('aiTargetLangTr')}</option>
                </select>
              </div>
            </div>

            {settings.translationProvider !== 'llm' && (
              <div className="mt-3">
                <label className="block text-xs font-semibold mb-1 text-zinc-700 dark:text-zinc-300">
                  {t('aiApiKeyLabel')} ({settings.translationProvider})
                </label>
                <input
                  type="password"
                  value={settings.translationApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, translationApiKey: e.target.value })}
                  placeholder={t('aiTranslationKeyPlaceholder')}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
            )}
          </div>

          {/* Test Connection Banner */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <div className="flex-1">
                <span className="font-semibold">{testResult.success ? 'Success: ' : 'Failed: '}</span>
                <span>{testResult.message}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition disabled:opacity-50"
          >
            {isTesting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Server className="w-3.5 h-3.5" />
            )}
            <span>{isTesting ? t('aiTestingConnection') : t('aiTestConnectionBtn')}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition"
            >
              {t('bulkCancelBtn')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isLoading || saveSuccess}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
            >
              {saveSuccess ? (
                <Check className="w-3.5 h-3.5" />
              ) : isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{saveSuccess ? t('aiSettingsSaved') : t('aiSaveSettingsBtn')}</span>
            </button>
          </div>
        </div>
      </div>
    </div></Modal>
  );
};
