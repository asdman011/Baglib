'use client';

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  PanelTop,
  ExternalLink,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAthan } from '../../hooks/useAthan';
import { ActiveReadsModule } from './ActiveReadsModule';
import { KhatmahDashboardModule, CompanionMiniWidget } from './KhatmahDashboardModule';
import { ReadingAnalyticsModule } from './ReadingAnalyticsModule';
import { QuickNoteScratchpad } from './QuickNoteScratchpad';
import { AthanDashboardModule } from './AthanDashboardModule';
import { ReadingStatisticsModal } from '../statistics/ReadingStatisticsModal';
import { ImportWizardModal } from '../library/ImportWizardModal';

type AthanState = ReturnType<typeof useAthan>;
export const HomeDashboardView: React.FC<{ athanState?: AthanState }> = ({ athanState }) => athanState ? <DashboardContent athanState={athanState} /> : <StandaloneDashboard />;
function StandaloneDashboard() { const athanState = useAthan(); return <DashboardContent athanState={athanState} />; }
const DashboardContent: React.FC<{ athanState: AthanState }> = ({ athanState }) => {
  const { lang, dir, t, refreshBooks, setViewMode } = useWorkspace();

  const [showCompanionTile, setShowCompanionTile] = useState<boolean>(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [currentStreak, setCurrentStreak] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (api?.statistics?.getStreakStats) {
      api.statistics
        .getStreakStats()
        .then((stats) => {
          if (alive && stats) {
            setCurrentStreak(stats.currentStreakDays || 0);
          }
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, []);

  if (!athanState.ready) return <div className="flex-1 bg-canvas p-4" role="status">{t('quranLoading')}</div>;
  return (
    <div
      data-dashboard-view
      className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-canvas/40 p-3 sm:p-5 space-y-4"
      dir={dir}
    >
      {/* Top Welcome & Companion Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-3">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pale-sky-500/20 to-emerald-500/20 border border-pale-sky-500/30 flex items-center justify-center text-pale-sky-600 dark:text-pale-sky-400 shrink-0">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-main font-display">
                {t('dashboardTitle')}
              </h1>

            </div>
            <p className="text-xs text-muted mt-0.5">
              {t('dashboardSubtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowCompanionTile((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              showCompanionTile
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                : 'bg-canvas border-subtle text-muted hover:text-main'
            }`}
          >
            <PanelTop className="w-3.5 h-3.5" />
            <span>
              {showCompanionTile ? t('dashboardCompanionWidgetActive') : t('dashboardCompanionWidgetBtn')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              void athanState.toggleMiniWidget();
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-canvas hover:bg-surface border border-subtle text-muted hover:text-main transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{t('dashboardPopoutMiniWindow')}</span>
          </button>
        </div>
      </div>

      {/* Optional Lightweight Companion Summary Tile */}
      {showCompanionTile && (
        <CompanionMiniWidget
          prayerSnapshot={athanState.snapshot}
          readingStreakDays={currentStreak}
          onClose={() => setShowCompanionTile(false)}
          onPopoutDesktop={() => {
            void athanState.toggleMiniWidget();
          }}
        />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start" data-dashboard-study-grid>
        <div className="space-y-4 min-w-0">
          <ActiveReadsModule onOpenImportWizard={() => setIsImportModalOpen(true)} />
          <KhatmahDashboardModule onOpenQuranKhatmah={() => setViewMode('quran')} />
        </div>
        <div className="space-y-4 min-w-0">
          <QuickNoteScratchpad />
          <AthanDashboardModule
          snapshot={athanState.snapshot} activeAlert={athanState.activeAlert}
          syncing={athanState.syncing} statusMessage={athanState.statusMessage}
          onUpdateSettings={athanState.updateSettings} onDetectLocation={athanState.detectLocation}
          onSyncMawaqit={athanState.syncMawaqit} onTriggerTestAlert={athanState.triggerTestAlert}
          onDismissAlert={athanState.dismissAlert}
          />
        </div>
      </div>
      <ReadingAnalyticsModule onStreakLoaded={setCurrentStreak} onOpenFullStatsModal={() => setIsStatsModalOpen(true)} />

      {/* Full Reading Statistics Modal */}
      {isStatsModalOpen && (
        <ReadingStatisticsModal
          isOpen={isStatsModalOpen}
          onClose={() => setIsStatsModalOpen(false)}
          lang={lang}
        />
      )}

      {/* Import Wizard Modal from Empty State */}
      {isImportModalOpen && (
        <ImportWizardModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportComplete={() => {
            refreshBooks();
            setIsImportModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
