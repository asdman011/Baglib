import type { TranslationKey } from '../../translations';
import type { TranslationErrorCode } from '../../../shared/translation-privacy';
const keys: Record<TranslationErrorCode, TranslationKey> = {
 'ai-disabled': 'assistantErrorDisabled', 'permission-denied': 'aiPrivacyConsentRequired', 'invalid-request': 'aiPrivacyInvalidRequest', 'not-configured': 'researchAiNotConfigured',
 'provider-quota': 'aiErrorQuota', 'provider-busy': 'aiErrorBusy', 'provider-auth': 'aiErrorAuth', 'provider-too-large': 'aiErrorTooLarge', 'provider-model': 'aiErrorModel', 'provider-terms': 'aiErrorTerms', 'provider-error': 'assistantErrorEngine',
};
export function aiErrorText(code: TranslationErrorCode, t: (key: TranslationKey) => string): string { return t(keys[code] ?? 'assistantErrorEngine'); }
