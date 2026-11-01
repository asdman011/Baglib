import type { TranslationKey } from '../../translations';
import { DEFAULT_OCR_ENGINE } from '../../../shared/types/ocr';
import type { OcrEngineId, OcrEngineInfo, OcrFallbackReason, OcrPageResult } from '../../../shared/types/ocr';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const FALLBACK_MESSAGES: Record<OcrFallbackReason, TranslationKey> = {
  'runtime-missing': 'ocrRuntimeMissing',
  'model-missing': 'ocrModelMissing',
  'engine-failed': 'ocrEngineFailed',
  'empty-result': 'ocrEmptyResult',
};

const ENGINE_NAMES: Record<OcrEngineId, string> = {
  ocrmypdf: 'OCRmyPDF',
  paddleocr_vl: 'PaddleOCR-VL',
};

export const OCR_ENGINE_ORDER: OcrEngineId[] = ['ocrmypdf', 'paddleocr_vl'];

/** Why an engine cannot run yet, or null once it can. */
export function ocrEngineBlocker(info: OcrEngineInfo | null | undefined): OcrFallbackReason | null {
  if (!info) return null;
  if (!info.runtimeReady) return 'runtime-missing';
  return info.isDownloaded ? null : 'model-missing';
}

/** Finds an engine's details, which are absent until the first query returns. */
export function ocrEngineInfo(engines: OcrEngineInfo[], engine: OcrEngineId): OcrEngineInfo | null {
  return engines.find(info => info.id === engine) ?? null;
}

/** The name to show for whichever engine produced a result. */
export function ocrEngineName(t: Translate, engine: OcrPageResult['engine']): string {
  if (engine === 'ocrmypdf' || engine === 'paddleocr_vl') return ENGINE_NAMES[engine];
  return engine === 'windows_media_ocr' ? t('ocrEngineWindowsBadge') : t('ocrFailedText');
}

export function ocrFallbackMessage(
  t: Translate,
  reason: OcrFallbackReason,
  missingPackages: string[] = [],
  engine: OcrEngineId = DEFAULT_OCR_ENGINE
): string {
  const key = reason === 'model-missing' && engine === 'ocrmypdf' ? 'ocrLanguageDataMissing' : FALLBACK_MESSAGES[reason];
  return t(key, { engine: ENGINE_NAMES[engine], packages: missingPackages.join(', ') });
}
