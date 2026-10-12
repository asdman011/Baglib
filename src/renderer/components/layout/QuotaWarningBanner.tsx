'use client';

import React, { useState, useEffect } from 'react';
import { Hourglass, AlertCircle, X, ShieldAlert, Sparkles } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export interface QuotaWarningPayload {
  level: 'warning' | 'depleted';
  remainingPercentage: number;
  resetsAt: string;
  messageEn: string;
  messageAr: string;
}

export const QuotaWarningBanner: React.FC = () => {
  const { lang, dir, t } = useWorkspace();
  const [warning, setWarning] = useState<QuotaWarningPayload | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 1. Initial check on mount
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getQuotaStatus) {
      (window as any).electronAPI.getQuotaStatus().then((status: any) => {
        if (!status) return;
        if (status.mode === 'depleted') {
          setWarning({
            level: 'depleted',
            remainingPercentage: 0,
            resetsAt: status.resetsAt,
            messageEn: "Daily search limit reached. We'll use alternative book sources until tomorrow.",
            messageAr: 'اكتمل الحد اليومي للبحث لهذا اليوم. سنعتمد على مصادر الكتب البديلة حتى يوم غد.',
          });
        } else if (status.mode === 'conservation') {
          setWarning({
            level: 'warning',
            remainingPercentage: status.remainingPercentage || 25,
            resetsAt: status.resetsAt,
            messageEn:
              'Daily search limit is running low. Lookups may take a brief moment longer as Baglib spaces out requests and checks secondary catalogs. Full speed will refresh tomorrow.',
            messageAr:
              'قارب الحد اليومي للبحث السريع عن الكتب على الانتهاء. قد يستغرق البحث لحظات إضافية لتنظيم الاستخدام والاعتماد على فهارس بديلة، وسيتجدد الحد بالكامل غدًا.',
          });
        }
      }).catch((err: any) => {
        console.warn('[QuotaWarningBanner] Error fetching quota status:', err);
      });
    }

    // 2. Listen for runtime IPC quota warning events
    if (typeof window !== 'undefined' && (window as any).electronAPI?.onQuotaWarning) {
      const unsubscribe = (window as any).electronAPI.onQuotaWarning((payload: QuotaWarningPayload) => {
        if (payload) {
          setWarning(payload);
          setDismissed(false); // Un-dismiss when a new event fires
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, []);

  if (!warning || dismissed) {
    return null;
  }

  const isDepleted = warning.level === 'depleted';
  const displayMessage = lang === 'ar' ? warning.messageAr : warning.messageEn;
  const title = isDepleted ? t('quotaDepletedTitle') : t('quotaSaverTitle');

  return (
    <aside
      role="status"
      aria-live="polite"
      dir={dir}
      className={`relative z-20 shrink-0 border-b px-4 py-3 transition-all duration-300 shadow-sm ${
        isDepleted
          ? 'bg-rose-500/10 dark:bg-rose-950/40 border-rose-500/30 text-rose-900 dark:text-rose-100'
          : 'bg-amber-500/10 dark:bg-amber-950/40 border-amber-500/30 text-amber-900 dark:text-amber-100'
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start sm:items-center gap-3 flex-1 min-w-[240px]">
          {/* Status Icon */}
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 sm:mt-0 ${
              isDepleted
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-600 dark:text-rose-400'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-600 dark:text-amber-400'
            }`}
          >
            {isDepleted ? (
              <AlertCircle className="w-4 h-4" />
            ) : (
              <Hourglass className="w-4 h-4 animate-pulse" />
            )}
          </div>

          {/* Text Content */}
          <div className="space-y-0.5 flex-1 min-w-0" style={{ textAlign: 'start' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs sm:text-sm font-display tracking-tight">
                {title}
              </span>
              <span
                className={`text-[10px] font-semibold font-mono px-2 py-0.5 rounded-full border ${
                  isDepleted
                    ? 'bg-rose-500/20 border-rose-500/30 text-rose-700 dark:text-rose-300'
                    : 'bg-amber-500/20 border-amber-500/30 text-amber-700 dark:text-amber-300'
                }`}
              >
                {isDepleted
                  ? (lang === 'ar' ? 'فهارس بديلة نشطة' : 'Alternative sources active')
                  : t('quotaRemainingBadge').replace('{percent}', String(warning.remainingPercentage))}
              </span>
              <span className="text-[10px] text-muted hidden md:inline">
                • {t('quotaResetsTomorrow')}
              </span>
            </div>
            <p className="text-xs leading-relaxed opacity-90 max-w-4xl">
              {displayMessage}
            </p>
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          title={t('quotaDismiss')}
          aria-label={t('quotaDismiss')}
          className="p-1.5 rounded-lg opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          style={{ marginInlineStart: 'auto' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
