'use client';
/**
 * KEY-436: Renderer hook that reads AI settings (and listens for focus / `baglib:ai-settings-changed`)
 * to resolve the active Learning mode ('off' | 'hints' | 'full') for any module.
 */
import { useCallback, useEffect, useState } from 'react';
import { resolveLearningMode, type AiLearningMode, type AiLearningModule } from '../../../shared/ai-learning-mode';
import type { AISettings } from '../../../shared/types/ai';

export function useLearningMode() {
  const [settings, setSettings] = useState<AISettings | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => {
      void window.electronAPI?.ai?.getSettings?.()
        .then(value => { if (live) setSettings((value as AISettings | null) ?? null); })
        .catch(() => {});
    };
    load();
    window.addEventListener('focus', load);
    window.addEventListener('baglib:ai-settings-changed', load);
    return () => {
      live = false;
      window.removeEventListener('focus', load);
      window.removeEventListener('baglib:ai-settings-changed', load);
    };
  }, []);

  const modeFor = useCallback(
    (module?: AiLearningModule | null, inRevisionOrTest?: boolean): AiLearningMode =>
      resolveLearningMode(settings, module, { inRevisionOrTest }),
    [settings]
  );

  return { settings, modeFor };
}
