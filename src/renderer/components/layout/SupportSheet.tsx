'use client';

import React from 'react';
import { BookOpen, Database, ShieldCheck, Cpu } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';

export const SupportSheet: React.FC = () => {
  const { isSupportSheetOpen, setIsSupportSheetOpen, t, lang } = useWorkspace();

  if (!isSupportSheetOpen) return null;

  return (
    <Sheet
      open={Boolean(isSupportSheetOpen)}
      onClose={() => setIsSupportSheetOpen(false)}
      side="end"
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary-text/30 flex items-center justify-center text-primary-text font-bold">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-main font-display leading-tight">{t('supportSheetTitle')}</h2>
            <p className="text-[11px] text-muted font-sans leading-tight">{t('supportSheetDesc')}</p>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs font-sans text-main">
        {/* Scholar Grade Brand Card */}
        <div className="p-3.5 rounded-xl bg-canvas border border-subtle space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-main font-display">{t('brand')}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary-text border border-primary-text/20">
              v0.1.0-alpha
            </span>
          </div>
          <p className="text-muted text-[11px] leading-relaxed">
            {t('brandSubtitle')} — {lang === 'ar' ? 'بيئة مكتبية ودراسية متكاملة للباحث وطالب العلم.' : 'Integrated scholarly library and study workspace.'}
          </p>
        </div>

        {/* Local-First Storage Guarantee */}
        <div className="p-3.5 rounded-xl bg-surface border border-subtle space-y-2">
          <div className="flex items-center gap-2 text-primary-text font-bold">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{t('supportDataLocation')}</span>
          </div>
          <div className="flex items-start gap-2 text-muted text-[11px] leading-relaxed">
            <Database className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{t('localLibraryStorage')}</span>
          </div>
          <p className="text-[11px] text-muted leading-relaxed pt-1 border-t border-subtle/50">
            {t('supportLocalFirstPromise')}
          </p>
        </div>

        {/* Runtime Environment Info */}
        <div className="p-3 rounded-xl bg-canvas border border-subtle space-y-1.5">
          <div className="flex items-center gap-2 text-muted font-semibold text-[11px]">
            <Cpu className="w-3.5 h-3.5" />
            <span>{t('supportEnvironment')}</span>
          </div>
          <div className="font-mono text-[10px] text-muted space-y-0.5">
            <div>Platform: Electron / Chromium Desktop</div>
            <div>Database: SQLite3 + FTS5 Full-Text Search</div>
            <div>Storage Engine: Local Filesystem (.baglib-data)</div>
          </div>
        </div>

        {/* Dismiss Button */}
        <div className="pt-2">
          <Button
            variant="secondary"
            className="w-full justify-center"
            onClick={() => setIsSupportSheetOpen(false)}
          >
            {t('close')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
};
