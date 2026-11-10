/**
 * Baglib — Reader Plugins & Extensibility Modal (KEY-149)
 *
 * Implements BaglibReaderPlugin management:
 * - Custom dictionaries & morphology hooks
 * - Classical typography & themes
 * - TTS voice providers
 */

import { useDialogFocus } from '../../hooks/useDialogFocus';
import React, { useState, useEffect } from 'react';
import {
  Puzzle,
  X,
  Check,
  Palette,
  Book,
  Volume2,
  Sparkles,
  Code2,
} from 'lucide-react';
import { translations } from '../../translations';
import type { BaglibReaderPlugin, ReaderPluginType } from '../../../shared/types/reader-plugin';

interface ReaderPluginsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ar' | 'en';
}

export const ReaderPluginsModal: React.FC<ReaderPluginsModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const t = translations[lang];
  const isRtl = lang === 'ar';

  const [plugins, setPlugins] = useState<BaglibReaderPlugin[]>([]);
  const [loading, setLoading] = useState(true);



  const [previousPluginVisibility, setPreviousPluginVisibility] = useState<readonly unknown[] | null>(null);
  const inputsPluginVisibility = [isOpen];
  if (previousPluginVisibility === null || inputsPluginVisibility.some((value, index) => !Object.is(value, previousPluginVisibility[index]))) {
    setPreviousPluginVisibility(inputsPluginVisibility);
    if (isOpen) setLoading(true);
  }
  useEffect(() => {
    if (isOpen) {
      let alive = true;
      void window.electronAPI.plugins.list().then(list => { if (alive) setPlugins(list || []); }).catch(console.warn).finally(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
    }
  }, [isOpen]);

  const dialogRef = useDialogFocus(isOpen, onClose);

  if (!isOpen) return null;

  const handleToggle = async (id: string, currentState: boolean) => {
    try {
      await (window).electronAPI.plugins.enable(id, !currentState);
      setPlugins((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled: !currentState } : p))
      );
    } catch (err) {
      console.error('Failed to toggle plugin:', err);
    }
  };

  const getPluginIcon = (type: ReaderPluginType) => {
    switch (type) {
      case 'theme':
        return <Palette className="w-4 h-4 text-pink-500" />;
      case 'dictionary':
        return <Book className="w-4 h-4 text-blue-500" />;
      case 'tts_voice':
        return <Volume2 className="w-4 h-4 text-purple-500" />;
      default:
        return <Sparkles className="w-4 h-4 text-amber-500" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t.pluginsModalTitle}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 sm:px-6 py-4 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border border-purple-200/50 dark:border-purple-800/30">
              <Puzzle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                {t.pluginsModalTitle}
              </h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                {t.pluginsModalDesc}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            aria-label={t.close}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6 space-y-4">
          {loading ? (
            <div className="text-center py-12 text-sm text-gray-400">
              {t.clipProgressMessage || 'Loading plugins...'}
            </div>
          ) : plugins.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              No plugins installed.
            </div>
          ) : (
            plugins.map((plugin) => (
              <div
                key={plugin.id}
                className="p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/40 dark:bg-zinc-800/30 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 mt-0.5">
                      {getPluginIcon(plugin.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-zinc-100">
                          {plugin.name}
                        </h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-zinc-300 uppercase font-mono font-medium">
                          v{plugin.version}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-medium">
                          {plugin.type}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                        {plugin.description}
                      </p>
                      {plugin.author && (
                        <div className="text-[11px] text-gray-400 mt-1">
                          Author: {plugin.author}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={plugin.enabled}
                      onChange={() => handleToggle(plugin.id, plugin.enabled)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600" />
                  </label>
                </div>

                {plugin.customCss && (
                  <div className="text-[11px] font-mono p-2 bg-gray-100 dark:bg-zinc-900 rounded-lg text-gray-600 dark:text-zinc-400 overflow-x-auto max-h-24">
                    <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-1 font-sans">
                      <Code2 className="w-3 h-3" />
                      <span>{t.pluginsCustomCss}</span>
                    </div>
                    <pre>{plugin.customCss.trim()}</pre>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
