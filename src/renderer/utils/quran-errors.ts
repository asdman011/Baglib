import type { QuranError } from '../../shared/types/quran';
import type { TranslationKey } from '../translations';

export const quranErrorKeys: Record<QuranError, TranslationKey> = {
  unavailable: 'quranDesktopRequired', network: 'quranNetworkError', 'invalid-resource': 'quranInvalidResource', restricted: 'quranRestricted', 'invalid-package': 'quranInvalidPackage', 'unsupported-format': 'quranUnsupportedFormat', storage: 'quranStorageError', cancelled: 'quranCancelled', interrupted: 'quranInterrupted', busy: 'quranBusy',
};

export function quranActionError(cause: unknown): TranslationKey {
  return cause instanceof Error && Object.hasOwn(quranErrorKeys, cause.message) ? quranErrorKeys[cause.message as QuranError] : 'quranStorageError';
}
