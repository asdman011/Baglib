'use client';
import { FeedbackSkeleton } from '../ui/FeedbackSkeleton';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LayoutDashboard,
  PanelTop,
  ExternalLink,
  SlidersHorizontal,
  Moon,
  CalendarDays,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAthan } from '../../hooks/useAthan';
import { ActiveReadsModule } from './ActiveReadsModule';
import { KhatmahDashboardModule, CompanionMiniWidget } from './KhatmahDashboardModule';
import { ReadingAnalyticsModule } from './ReadingAnalyticsModule';
import { StudyInsightsModule } from './StudyInsightsModule';
import { DashboardEssentialStats } from './DashboardEssentialStats';
import { TodayStudyPanel } from './TodayStudyPanel';
import { StudyProgressPanel } from './StudyProgressPanel';
import { StudyRhythmSettings } from './StudyRhythm';
import { QuickNoteScratchpad } from './QuickNoteScratchpad';
import { AthanDashboardModule } from './AthanDashboardModule';
import { DashboardCalendarModule } from './DashboardCalendarModule';
import { DashboardCustomizeModal } from './DashboardCustomizeModal';
import { DashboardSnoozeModal } from './DashboardSnoozeModal';
import { ReadingStatisticsModal } from '../statistics/ReadingStatisticsModal';
import { ImportWizardModal } from '../library/ImportWizardModal';
import { calculateHijriDate } from '../../../shared/athan-calculator';
import {
  DEFAULT_DASHBOARD_MODULES,
  loadDashboardLayout,
  saveDashboardLayout,
  type DashboardModuleId,
  type DashboardModuleItem,
} from './dashboard-layout-config';

type AthanState = ReturnType<typeof useAthan>;

export const HomeDashboardView: React.FC<{ athanState?: AthanState }> = ({ athanState }) =>
  athanState ? <DashboardContent athanState={athanState} /> : <StandaloneDashboard />;

function StandaloneDashboard() {
  const athanState = useAthan();
  return <DashboardContent athanState={athanState} />;
}

const DashboardContent: React.FC<{ athanState: AthanState }> = ({ athanState }) => {
  const { lang, dir, t, refreshBooks, setViewMode } = useWorkspace();

  const [showCompanionTile, setShowCompanionTile] = useState<boolean>(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState<boolean>(false);
  const [isSnoozeModalOpen, setIsSnoozeModalOpen] = useState<boolean>(false);
  const [currentStreak, setCurrentStreak] = useState<number>(0);
  const [modules, setModules] = useState<DashboardModuleItem[]>(DEFAULT_DASHBOARD_MODULES);

  // Load layout preferences from settings store under 'dashboard.layout.v1'
  useEffect(() => {
    let alive = true;
    void loadDashboardLayout().then((state) => {
      if (alive && state?.modules) {
        setModules(state.modules);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleUpdateLayout = useCallback(
    (nextModules: DashboardModuleItem[]) => {
      setModules(nextModules);
      void saveDashboardLayout({ version: 1, modules: nextModules });
    },
    []
  );

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

  // Today dual date: Gregorian & Hijri
  const today = useMemo(() => new Date(), []);

  const gregorianDateStr = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(today);
    } catch {
      return today.toLocaleDateString();
    }
  }, [today, lang]);

  const hijriDateStr = useMemo(() => {
    try {
      // Primary: Intl islamic-umalqura
      const locale = lang === 'ar' ? 'ar-SA-u-ca-islamic-umalqura' : 'en-US-u-ca-islamic-umalqura';
      return new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(today);
    } catch {
      const info = calculateHijriDate(today);
      return lang === 'ar' ? info.formattedAr : info.formattedEn;
    }
  }, [today, lang]);

  // Greeting based on time of day
  const greetingText = useMemo(() => {
    const hour = today.getHours();
    if (hour >= 4 && hour < 12) return t('dashGreetingMorning');
    if (hour >= 12 && hour < 17) return t('dashGreetingAfternoon');
    return t('dashGreetingEvening');
  }, [today, t]);

  const scrollToStudyRhythm = () => {
    const el = document.getElementById('dashboard-study-rhythm-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (!athanState.ready) {
    return (
      <div className="flex-1 bg-canvas p-4" role="status">
        <FeedbackSkeleton />
      </div>
    );
  }

  // Render individual module component by id
  const renderModule = (id: DashboardModuleId) => {
    switch (id) {
      case 'today':
        return (
          <div key="today" data-dashboard-item="today" className="col-span-full">
            <TodayStudyPanel />
          </div>
        );
      case 'calendar':
        return (
          <div key="calendar" data-dashboard-item="calendar" className="col-span-full xl:col-span-1">
            <DashboardCalendarModule />
          </div>
        );
      case 'readingGoals':
        return (
          <div key="readingGoals" data-dashboard-item="readingGoals" className="col-span-full xl:col-span-1">
            <ReadingAnalyticsModule
              onStreakLoaded={setCurrentStreak}
              onOpenFullStatsModal={() => setIsStatsModalOpen(true)}
            />
          </div>
        );
      case 'activeReads':
        return (
          <div key="activeReads" data-dashboard-item="activeReads" className="col-span-full xl:col-span-1">
            <ActiveReadsModule onOpenImportWizard={() => setIsImportModalOpen(true)} />
          </div>
        );
      case 'studyProgress':
        return (
          <div key="studyProgress" data-dashboard-item="studyProgress" className="col-span-full xl:col-span-1">
            <StudyProgressPanel />
          </div>
        );
      case 'studyInsights':
        return (
          <div key="studyInsights" data-dashboard-item="studyInsights" className="col-span-full xl:col-span-1">
            <StudyInsightsModule />
          </div>
        );
      case 'scratchpad':
        return (
          <div key="scratchpad" data-dashboard-item="scratchpad" className="col-span-full xl:col-span-1">
            <QuickNoteScratchpad />
          </div>
        );
      case 'athan':
        return (
          <div key="athan" data-dashboard-item="athan" className="col-span-full xl:col-span-1">
            <AthanDashboardModule
              snapshot={athanState.snapshot}
              activeAlert={athanState.activeAlert}
              syncing={athanState.syncing}
              statusMessage={athanState.statusMessage}
              onUpdateSettings={athanState.updateSettings}
              onDetectLocation={athanState.detectLocation}
              onSyncMawaqit={athanState.syncMawaqit}
              onTriggerTestAlert={athanState.triggerTestAlert}
              onDismissAlert={athanState.dismissAlert}
              onOpenSnooze={() => setIsSnoozeModalOpen(true)}
            />
          </div>
        );
      case 'khatmah':
        return (
          <div key="khatmah" data-dashboard-item="khatmah" className="col-span-full xl:col-span-1">
            <KhatmahDashboardModule onOpenQuranKhatmah={() => setViewMode('quran')} />
          </div>
        );
      case 'studyRhythm':
        return (
          <div
            key="studyRhythm"
            id="dashboard-study-rhythm-section"
            data-dashboard-item="studyRhythm"
            className="col-span-full"
          >
            <StudyRhythmSettings />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      data-dashboard-view
      aria-label={t('dashboardTitle')}
      className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-canvas/40 p-3 sm:p-5 space-y-4"
      dir={dir}
    >
      <span className="sr-only">{t('dashboardSubtitle')}</span>
      {/* Calm Home Header: Greeting, Dual Gregorian & Hijri Date, Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary-text shrink-0 shadow-xs">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1
                className={`text-base sm:text-lg font-bold text-text leading-snug ${
                  lang === 'ar' ? 'font-sans' : 'font-display'
                }`}
              >
                {greetingText}
              </h1>
              <span className="text-xs text-text-muted hidden sm:inline">
                {t('dashGreetingGeneral')}
              </span>
            </div>

            {/* Dual Dates: Gregorian and Hijri */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted mt-0.5">
              <CalendarDays className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <span className="font-medium text-text">{gregorianDateStr}</span>
              <span className="text-text-muted/60">{t('dashDualDateSeparator')}</span>
              <span
                data-header-hijri-date
                className="font-medium text-primary-text bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20"
              >
                {hijriDateStr}
              </span>
            </div>
          </div>
        </div>

        {/* Dashboard Actions: Customize, Snooze, Companion, Popout */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Customize Layout Button */}
          <button
            type="button"
            data-dashboard-customize-btn
            onClick={() => setIsCustomizeModalOpen(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-surface hover:bg-surface-raised border border-border text-text transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-text-muted" />
            <span>{t('dashCustomizeLayout')}</span>
          </button>

          {/* Prayer Snooze Button (Links to KEY-239 Snooze) */}
          <button
            type="button"
            data-dashboard-snooze-btn
            onClick={() => setIsSnoozeModalOpen(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-surface hover:bg-surface-raised border border-border text-text transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Moon className="w-3.5 h-3.5 text-primary-text" />
            <span>{t('dashPrayerSnoozeBtn')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCompanionTile((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              showCompanionTile
                ? 'bg-primary/15 border-primary/40 text-primary-text'
                : 'bg-surface border-border text-text-muted hover:text-text'
            }`}
          >
            <PanelTop className="w-3.5 h-3.5" />
            <span>
              {showCompanionTile
                ? t('dashboardCompanionWidgetActive')
                : t('dashboardCompanionWidgetBtn')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              void athanState.toggleMiniWidget();
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-surface hover:bg-surface-raised border border-border text-text-muted hover:text-text transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{t('dashboardPopoutMiniWindow')}</span>
          </button>
        </div>
      </div>

      {/* Optional Companion Summary Tile */}
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

      <DashboardEssentialStats />

      {/* Reorderable & Customizable Module Grid (Stacks in 1 column at 480px) */}
      <div
        data-dashboard-modules-grid
        className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start"
      >
        {modules
          .filter((m) => m.visible)
          .map((m) => renderModule(m.id))}
      </div>

      {/* Customize Modules Modal */}
      {isCustomizeModalOpen && (
        <DashboardCustomizeModal
          isOpen={isCustomizeModalOpen}
          onClose={() => setIsCustomizeModalOpen(false)}
          modules={modules}
          onChange={handleUpdateLayout}
        />
      )}

      {/* Prayer & Wird Snooze Modal (KEY-239 link) */}
      {isSnoozeModalOpen && (
        <DashboardSnoozeModal
          isOpen={isSnoozeModalOpen}
          onClose={() => setIsSnoozeModalOpen(false)}
          onOpenSettings={scrollToStudyRhythm}
        />
      )}

      {/* Full Reading Statistics Modal */}
      {isStatsModalOpen && (
        <ReadingStatisticsModal
          isOpen={isStatsModalOpen}
          onClose={() => setIsStatsModalOpen(false)}
          lang={lang}
        />
      )}

      {/* Import Wizard Modal */}
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
