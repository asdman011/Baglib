'use client';

import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { TranslationKey } from '../../translations';
import {
  DEFAULT_DASHBOARD_MODULES,
  moveDashboardModule,
  toggleDashboardModuleVisibility,
  type DashboardModuleId,
  type DashboardModuleItem,
} from './dashboard-layout-config';

interface DashboardCustomizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  modules: DashboardModuleItem[];
  onChange: (next: DashboardModuleItem[]) => void;
}

const MODULE_TRANSLATION_KEYS: Record<DashboardModuleId, TranslationKey> = {
  today: 'dashModuleToday',
  calendar: 'dashModuleCalendar',
  readingGoals: 'dashModuleReadingGoals',
  activeReads: 'dashModuleActiveReads',
  studyProgress: 'dashModuleStudyProgress',
  studyInsights: 'dashModuleStudyInsights',
  scratchpad: 'dashModuleScratchpad',
  athan: 'dashModuleAthan',
  khatmah: 'dashModuleKhatmah',
  studyRhythm: 'dashModuleStudyRhythm',
};

export const DashboardCustomizeModal: React.FC<DashboardCustomizeModalProps> = ({
  isOpen,
  onClose,
  modules,
  onChange,
}) => {
  const { t, dir } = useWorkspace();

  const handleMove = (id: DashboardModuleId, direction: 'up' | 'down') => {
    const next = moveDashboardModule(modules, id, direction);
    onChange(next);
  };

  const handleToggle = (id: DashboardModuleId) => {
    const next = toggleDashboardModuleVisibility(modules, id);
    onChange(next);
  };

  const handleReset = () => {
    onChange([...DEFAULT_DASHBOARD_MODULES]);
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={t('dashCustomizeTitle')}
      description={t('dashCustomizeDesc')}
      size="xl"
    >
      <div dir={dir} className="space-y-4" data-dashboard-customize-content>
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <span className="text-xs text-text-muted">
            {t('dashCustomizeDesc')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('dashResetLayout')}</span>
          </Button>
        </div>

        <ul className="space-y-2 max-h-[60vh] overflow-y-auto p-1" role="list">
          {modules.map((item, index) => {
            const labelKey = MODULE_TRANSLATION_KEYS[item.id];
            const label = labelKey ? t(labelKey) : item.id;
            const isFirst = index === 0;
            const isLast = index === modules.length - 1;

            return (
              <li
                key={item.id}
                data-customize-module-row={item.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                  item.visible
                    ? 'bg-surface border-border text-text shadow-xs'
                    : 'bg-canvas/50 border-border/50 text-text-muted opacity-70'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-canvas border border-border flex items-center justify-center text-xs font-mono font-bold text-text-muted shrink-0">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium truncate leading-relaxed">
                    {label}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Move Up */}
                  <button
                    type="button"
                    aria-label={`${t('dashModuleMoveUp')}: ${label}`}
                    title={t('dashModuleMoveUp')}
                    disabled={isFirst}
                    onClick={() => handleMove(item.id, 'up')}
                    className="p-1.5 rounded-lg border border-border bg-canvas hover:bg-surface text-text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>

                  {/* Move Down */}
                  <button
                    type="button"
                    aria-label={`${t('dashModuleMoveDown')}: ${label}`}
                    title={t('dashModuleMoveDown')}
                    disabled={isLast}
                    onClick={() => handleMove(item.id, 'down')}
                    className="p-1.5 rounded-lg border border-border bg-canvas hover:bg-surface text-text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>

                  {/* Visibility Toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.visible}
                    aria-label={item.visible ? t('dashModuleHidden') : t('dashModuleVisible')}
                    title={item.visible ? t('dashModuleHidden') : t('dashModuleVisible')}
                    onClick={() => handleToggle(item.id)}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      item.visible
                        ? 'border-primary/40 bg-primary/10 text-primary-text'
                        : 'border-border bg-canvas text-text-muted hover:text-text'
                    }`}
                  >
                    {item.visible ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="pt-3 border-t border-border flex justify-end">
          <Button type="button" variant="primary" onClick={onClose}>
            {t('ocrSuspectSaveEdit')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
