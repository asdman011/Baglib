'use client';

import React from 'react';
import { Titlebar } from './Titlebar';
import { CommandPalette } from './CommandPalette';
import { StatusBar } from './StatusBar';
import { NavigationRail } from './NavigationRail';
import { HomeDashboardView, CompanionMiniWidget } from '../dashboard';
import { LibraryGridView } from '../library/LibraryGridView';
import { FullPageBookReader } from '../reader/FullPageBookReader';
import { SunnahView } from '../sunnah/SunnahView';
import { QuranView } from '../quran/QuranView';
import { NotesOverviewView } from '../notes/NotesOverviewView';
import { CategoriesOverviewView } from '../categories/CategoriesOverviewView';
import { QuotaWarningBanner } from './QuotaWarningBanner';
import { SearchHubModal } from '../search/SearchHubModal';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAthan } from '../../hooks/useAthan';
import { QURAN_OPEN_EVENT } from '../../utils/quran-navigation';
import { STUDY_NOTE_OPEN } from '../../utils/study-navigation';
import { Settings } from 'lucide-react';

const subscribeWindowMode = () => () => {};
const readWindowMode = () => new URLSearchParams(window.location.search).get('widget') === 'companion';
const serverWindowMode = () => null;

export const AppLayout: React.FC = () => {
  const { dir, viewMode, setViewMode, t } = useWorkspace();
  const isCompanionWindow = React.useSyncExternalStore(subscribeWindowMode, readWindowMode, serverWindowMode);
  const athanState = useAthan(isCompanionWindow === false);
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

    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    window.addEventListener(QURAN_OPEN_EVENT, handleQuranOpen as EventListener);
    window.addEventListener(STUDY_NOTE_OPEN, handleNoteOpen);
    window.addEventListener('baglib:sunnah-open', handleSunnahOpen);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
      window.removeEventListener(QURAN_OPEN_EVENT, handleQuranOpen as EventListener);
      window.removeEventListener(STUDY_NOTE_OPEN, handleNoteOpen);
      window.removeEventListener('baglib:sunnah-open', handleSunnahOpen);
    };
  }, [setViewMode]);

  if (isCompanionWindow === null || !athanState.ready) return <div className="h-screen w-screen bg-canvas" dir={dir} />;
  if (isCompanionWindow) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-canvas text-main p-2 flex flex-col justify-center select-none font-sans" dir={dir}>
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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas text-main select-none font-sans relative" dir={dir}>
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

          {viewMode === 'dashboard' && <HomeDashboardView athanState={athanState} />}
          {viewMode === 'quran' && <QuranView />}
          {viewMode === 'sunnah' && <SunnahView />}
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
        </main>
      </div>

      {/* Bottom Status Bar */}
      {(athanState.isPlayingAudio || athanState.audioFailed) && <div role="status" className="absolute bottom-10 end-4 z-[90] rounded-xl border border-subtle bg-surface p-3 text-sm shadow-lg max-w-sm">
        {athanState.audioFailed && <p>{t('athanPlaybackFailed')}</p>}
        <button type="button" className="underline p-2" onClick={athanState.stopAudio}>{t('athanStopAudio')}</button>
        {athanState.audioFailed && <button type="button" className="underline p-2" onClick={athanState.retryAudio}>{t('athanRetryAudio')}</button>}
      </div>}
      <StatusBar />

      {/* Global Search Command Palette (Cmd + K) */}
      <CommandPalette />

      {/* Global Book Discovery & Search Hub (Story 11) */}
      <SearchHubModal />
    </div>
  );
};
