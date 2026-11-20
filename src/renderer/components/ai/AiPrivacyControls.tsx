'use client';
import React from 'react';
import type { TranslationKey } from '../../translations';
import type { useRemoteConsent } from './useRemoteConsent';
export function AiPrivacyControls({ consent, t, pending = false, onAllow, onCancel }: {
 consent: ReturnType<typeof useRemoteConsent>; t: (key: TranslationKey, params?: Record<string,string|number>) => string;
 pending?: boolean; onAllow?: () => void; onCancel?: () => void;
}) {
 const provider=consent.customName ?? t(consent.providerLabel);
 return <div data-ai-privacy-controls className="space-y-2 text-xs leading-loose text-start">
  {pending ? <div data-reader-ai-consent role="alertdialog" className="space-y-2 rounded-lg border border-amber-500/50 p-3">
   <p dir="auto">{t('assistantConsentAsk',{provider})}</p><div className="flex gap-2">
    <button data-ai-privacy-allow type="button" onClick={onAllow} className="rounded border border-current px-3 py-1">{t('assistantConsentAllow')}</button>
    <button data-ai-privacy-cancel type="button" onClick={onCancel} className="rounded border border-current px-3 py-1">{t('assistantConsentCancel')}</button>
   </div>
  </div> : consent.ready && <p dir="auto">{consent.local ? t('assistantRunsLocally') : t(consent.allowed ? 'assistantSendingTo':'assistantAsksFirst',{provider})}</p>}
  {!consent.local && consent.allowed && <button data-ai-privacy-revoke type="button" onClick={() => void consent.revoke()} className="underline">{t('assistantConsentRevoke')}</button>}
 </div>;
}
