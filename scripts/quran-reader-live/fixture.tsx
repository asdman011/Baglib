import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { NavigationRail } from '../../src/renderer/components/layout/NavigationRail';
import { QuranView } from '../../src/renderer/components/quran/QuranView';
import { Titlebar } from '../../src/renderer/components/layout/Titlebar';

function Fixture() {
  const workspace = useWorkspace();
  const { setViewMode } = workspace;
  useEffect(() => { setViewMode('quran'); }, [setViewMode]);
  Object.assign(window, { quranWorkspace: workspace });
  return <div className="h-screen flex flex-col bg-canvas" dir={workspace.dir}><Titlebar /><div className="flex flex-1 min-h-0"><NavigationRail />{workspace.viewMode === 'quran' && <QuranView />}</div></div>;
}
createRoot(document.getElementById('root')!).render(<WorkspaceProvider><Fixture /></WorkspaceProvider>);
