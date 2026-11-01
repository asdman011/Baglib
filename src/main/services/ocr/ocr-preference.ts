import { DEFAULT_OCR_ENGINE } from '../../../shared/types/ocr';
import type { OcrEngineId } from '../../../shared/types/ocr';
import type { ISettingsRepository } from '../../database/repositories/settings.repository';

const OCR_ENGINE_SETTING = 'ocr.engine.v1';

export function isOcrEngine(value: unknown): value is OcrEngineId {
  return value === 'ocrmypdf' || value === 'paddleocr_vl';
}

/** The reader's saved engine, or the default when nothing valid is stored. */
export function readPreferredEngine(settings: Pick<ISettingsRepository, 'get'>): OcrEngineId {
  try {
    const saved = settings.get<string>(OCR_ENGINE_SETTING);
    return isOcrEngine(saved) ? saved : DEFAULT_OCR_ENGINE;
  } catch {
    return DEFAULT_OCR_ENGINE;
  }
}

export function savePreferredEngine(settings: Pick<ISettingsRepository, 'set'>, engine: unknown): OcrEngineId {
  if (!isOcrEngine(engine)) throw new Error('Unknown OCR engine');
  settings.set(OCR_ENGINE_SETTING, engine);
  return engine;
}
