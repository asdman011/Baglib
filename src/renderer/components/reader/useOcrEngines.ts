import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_OCR_ENGINE } from '../../../shared/types/ocr';
import type { OcrEngineId, OcrEngineInfo } from '../../../shared/types/ocr';

/** Loads the selectable engines and the reader's saved choice, which lives in the app settings. */
export function useOcrEngines() {
  const [engines, setEngines] = useState<OcrEngineInfo[]>([]);
  const [selectedEngine, setSelectedEngine] = useState<OcrEngineId>(DEFAULT_OCR_ENGINE);

  const refreshEngines = useCallback(() => {
    window.electronAPI?.ocrGetEngines?.().then(setEngines).catch(console.warn);
  }, []);

  useEffect(() => {
    refreshEngines();
    window.electronAPI?.ocrGetPreferredEngine?.().then(setSelectedEngine).catch(console.warn);
  }, [refreshEngines]);

  const selectEngine = useCallback((engine: OcrEngineId) => {
    setSelectedEngine(engine);
    window.electronAPI?.ocrSetPreferredEngine?.(engine).catch(console.warn);
  }, []);

  return { engines, selectedEngine, selectEngine, refreshEngines };
}
