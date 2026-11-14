import type { TranslationKey } from '../translations';
import type { DuplicateDetectionResult } from '../../shared/types/digital-file';

const errorKeys: Record<string, TranslationKey> = {
  FILE_NOT_FOUND: 'importErrorFileMissing', EMPTY_FILE: 'importErrorEmpty',
  UNSUPPORTED_FORMAT: 'importErrorUnsupported', CORRUPTED_FILE: 'importErrorCorrupt',
  SIGNATURE_MISMATCH: 'importErrorMismatch', READ_ERROR: 'importErrorRead',
  METADATA_ERROR: 'importMetadataFailed', DB_ERROR: 'importErrorDatabase', IMPORT_ERROR: 'importErrorGeneric',
};

export function importErrorKey(code?: string): TranslationKey {
  return code && Object.hasOwn(errorKeys, code) ? errorKeys[code] : 'importErrorGeneric';
}

export function importDuplicateReasonKey(result: Pick<DuplicateDetectionResult, 'matchType' | 'batchDuplicateOf'>): TranslationKey {
  if (result.batchDuplicateOf) return 'importBatchDuplicate';
  switch (result.matchType) {
    case 'exact_file': return 'importReasonExact';
    case 'same_edition': return 'importReasonEdition';
    case 'potential_duplicate': return 'importReasonMetadata';
    default: return 'noDuplicatesHeading';
  }
}
