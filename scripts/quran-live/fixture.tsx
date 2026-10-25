import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { NavigationRail } from '../../src/renderer/components/layout/NavigationRail';
import { QuranResourceView } from '../../src/renderer/components/quran/QuranView';

function Fixture() {
  const workspace = useWorkspace();
  const { setViewMode } = workspace;
  useEffect(() => { setViewMode('quran'); }, [setViewMode]);
  Object.assign(window, { quranWorkspace: workspace });
  return <div className="h-screen flex bg-canvas" dir={workspace.dir}><NavigationRail /><QuranResourceView /></div>;
}
createRoot(document.getElementById('root')!).render(<WorkspaceProvider><Fixture /></WorkspaceProvider>);
