'use client';

import React from 'react';
import { Titlebar } from './Titlebar';
import { CommandPalette } from './CommandPalette';
import { KnowledgeCardLayer } from '../knowledge/KnowledgeCardLayer';
import { StudyRhythmLayer } from '../dashboard/StudyRhythm';
import { StatusBar } from './StatusBar';
import { NavigationRail } from './NavigationRail';
import { HomeDashboardView, CompanionMiniWidget } from '../dashboard';
import { QuotaWarningBanner } from './QuotaWarningBanner';
import { SearchHubModal } from '../search/SearchHubModal';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAthan } from '../../hooks/useAthan';
import { QURAN_OPEN_EVENT } from '../../utils/quran-navigation';
import { LECTURE_OPEN_EVENT } from '../../utils/lecture-navigation';
import { STUDY_NOTE_OPEN } from '../../utils/study-navigation';
import { Settings } from 'lucide-react';
import { StartupSplash } from '../StartupSplash';

// Lazy-loaded secondary views to dramatically accelerate initial application boot time (<1.5s cold compilation)
const LibraryGridView = React.lazy(() =>
  import('../library/LibraryGridView').then((m) => ({ default: m.LibraryGridView }))
);
const FullPageBookReader = React.lazy(() =>
  import('../reader/FullPageBookReader').then((m) => ({ default: m.FullPageBookReader }))
);
const SunnahView = React.lazy(() =>
  import('../sunnah/SunnahView').then((m) => ({ default: m.SunnahView }))
);
const BayanView = React.lazy(() => import('../poetry/BayanView').then(module => ({ default: module.BayanView })));
const LecturesView = React.lazy(() => import('../lectures/LecturesView').then(module => ({ default: module.LecturesView })));
const PathwaysView = React.lazy(() => import('../dashboard/PathwaysView').then(module => ({ default: module.PathwaysView })));
const StudyPlannerView = React.lazy(() => import('../dashboard/StudyPlannerView').then(module => ({ default: module.StudyPlannerView })));
const QuranView = React.lazy(() =>
  import('../quran/QuranView').then((m) => ({ default: m.QuranView }))
);
const NotesOverviewView = React.lazy(() =>
  import('../notes/NotesOverviewView').then((m) => ({ default: m.NotesOverviewView }))
);
const CategoriesOverviewView = React.lazy(() =>
  import('../categories/CategoriesOverviewView').then((m) => ({ default: m.CategoriesOverviewView }))
);

const subscribeWindowMode = () => () => {};
const readWindowMode = () => new URLSearchParams(window.location.search).get('widget') === 'companion';
const serverWindowMode = () => null;

export const AppLayout: React.FC = () => {
  const { dir, viewMode, setViewMode, t, theme, lang } = useWorkspace();
  const [showSplash, setShowSplash] = React.useState<boolean>(true);
  const handleSplashComplete = React.useCallback(() => setShowSplash(false), []);
  const isCompanionWindow = React.useSyncExternalStore(subscribeWindowMode, readWindowMode, serverWindowMode);
  const athanState = useAthan(isCompanionWindow === false);
  React.useEffect(() => {
    if (isCompanionWindow !== false || showSplash) return;
    let cancelled = false;
    const warm = () => {
      if (cancelled) return;
      void import('../../libs/reader/pdf-view-document').then(module => {
        if (!cancelled) module.warmPdfRasterHost();
      }).catch(() => undefined);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const idle = window.requestIdleCallback(warm, { timeout: 3000 });
      return () => { cancelled = true; window.cancelIdleCallback(idle); };
    }
    const timer = setTimeout(warm, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isCompanionWindow, showSplash]);
  const [widgetStreak, setWidgetStreak] = React.useState(0);
  React.useEffect(() => {
    if (!isCompanionWindow) return;
    let alive = true;
    void window.electronAPI?.statistics?.getStreakStats().then(stats => { if (alive) setWidgetStreak(stats.currentStreakDays || 0); }).catch(() => {});
    return () => { alive = false; };
  }, [isCompanionWindow]);

  React.useEffect(() => {
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleQuranOpen = () => {
      setViewMode('quran');
    };
    const handleNoteOpen = () => setViewMode('notes');
    const handleSunnahOpen = () => setViewMode('sunnah');
    const handlePoetryOpen = () => setViewMode('bayan');

    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    window.addEventListener(QURAN_OPEN_EVENT, handleQuranOpen as EventListener);
    window.addEventListener(STUDY_NOTE_OPEN, handleNoteOpen);
    window.addEventListener('baglib:sunnah-open', handleSunnahOpen);
    const handleLectureOpen = () => setViewMode('lectures');
    window.addEventListener(LECTURE_OPEN_EVENT, handleLectureOpen);
    window.addEventListener('baglib:poetry-open', handlePoetryOpen);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
      window.removeEventListener(QURAN_OPEN_EVENT, handleQuranOpen as EventListener);
      window.removeEventListener(STUDY_NOTE_OPEN, handleNoteOpen);
      window.removeEventListener('baglib:sunnah-open', handleSunnahOpen);
      window.removeEventListener(LECTURE_OPEN_EVENT, handleLectureOpen);
      window.removeEventListener('baglib:poetry-open', handlePoetryOpen);
    };
  }, [setViewMode]);

  if (isCompanionWindow === null) return <div className="h-screen w-screen bg-canvas" suppressHydrationWarning />;
  if (isCompanionWindow) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-canvas text-main p-2 flex flex-col justify-center select-none font-sans" dir={dir} suppressHydrationWarning>
        <CompanionMiniWidget
          prayerSnapshot={athanState.snapshot}
          readingStreakDays={widgetStreak}
          isFramelessWindow
          onClose={() => {
            void athanState.toggleMiniWidget();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas text-main select-none font-sans relative" dir={dir} suppressHydrationWarning>
      {/* Scholar-Grade Startup Splash Orchestrator */}
      {showSplash && (
        <StartupSplash
          onComplete={handleSplashComplete}
          initialTheme={theme}
          initialLang={lang}
        />
      )}

      {/* Subtle Arabesque Pattern Texture Overlay */}
      <div className="absolute inset-0 bg-arabesque-pattern pointer-events-none z-0" />

      {/* Zone 1: Titlebar */}
      <Titlebar />

      {/* Main Body Layout with Collapsible Navigation Sidebar */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Collapsible Navigation Rail */}
        <NavigationRail />

        {/* Dynamic App Views */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {/* Quota-Saver & Search Limit Banner */}
          <QuotaWarningBanner />

          <React.Suspense fallback={<div className="flex-1 bg-canvas" />}>
            {viewMode === 'dashboard' && <HomeDashboardView athanState={athanState} />}
            {viewMode === 'planner' && <StudyPlannerView adjustment={athanState.snapshot?.settings.hijriAdjustmentDays || 0} />}
            {viewMode === 'pathways' && <PathwaysView />}
            {viewMode === 'lectures' && <LecturesView />}
            {viewMode === 'quran' && <QuranView />}
            {viewMode === 'sunnah' && <SunnahView />}
            {viewMode === 'bayan' && <BayanView />}
            {viewMode === 'library' && <LibraryGridView />}
            {viewMode === 'categories' && <CategoriesOverviewView />}
            {viewMode === 'reader' && <FullPageBookReader />}
            {viewMode === 'notes' && <NotesOverviewView />}
            {viewMode === 'settings' && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted font-sans space-y-3">
                <Settings className="w-10 h-10 text-pale-sky-500" />
                <h2 className="font-bold text-lg text-main font-display">{t('settingsTitle')}</h2>
                <p className="text-xs text-muted max-w-sm">{t('settingsDesc')}</p>
              </div>
            )}
          </React.Suspense>
        </main>
      </div>

      {/* Bottom Status Bar */}
      {(athanState.isPlayingAudio || athanState.audioFailed) && <div role="status" className="absolute bottom-10 end-4 z-[90] rounded-xl border border-subtle bg-surface p-3 text-sm shadow-lg max-w-sm">
        {athanState.audioFailed && <p>{t('athanPlaybackFailed')}</p>}
        <button type="button" className="underline p-2" onClick={athanState.stopAudio}>{t('athanStopAudio')}</button>
        {athanState.audioFailed && <button type="button" className="underline p-2" onClick={athanState.retryAudio}>{t('athanRetryAudio')}</button>}
      </div>}
      <StatusBar />
      <StudyRhythmLayer snapshot={athanState.snapshot} />

      {/* Global Search Command Palette (Cmd + K) */}
      <CommandPalette />
      <KnowledgeCardLayer />

      {/* Global Book Discovery & Search Hub (Story 11) */}
      <SearchHubModal />
    </div>
  );
};
