'use client';

import React from 'react';
import { Moon, Settings2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface DashboardSnoozeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export const DashboardSnoozeModal: React.FC<DashboardSnoozeModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
}) => {
  const { t, dir } = useWorkspace();

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={t('dashPrayerSnoozeTitle')}
      description={t('dashPrayerSnoozeDesc')}
      size="lg"
    >
      <div dir={dir} className="space-y-4" data-dashboard-snooze-modal>
        <div className="p-4 rounded-xl bg-canvas border border-border space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary-text border border-primary/20 flex items-center justify-center shrink-0">
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-text leading-snug">
                  {t('dashPrayerSnoozeTitle')}
                </h4>
                <span className="text-[10px] font-semibold text-primary-text bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                  {t('dashPrayerSnoozeActive')}
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                {t('dashPrayerSnoozeDesc')}
              </p>
            </div>
          </div>

          <p className="text-xs text-text-muted leading-relaxed">
            {t('rhythmProgressSafe')}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {onOpenSettings && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>{t('dashPrayerSnoozeConfigure')}</span>
            </Button>
          )}
          <Button type="button" variant="primary" size="sm" onClick={onClose}>
            {t('dashPrayerSnoozeClose')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
